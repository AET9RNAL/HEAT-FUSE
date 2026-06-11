"""XM1 90 overlay.

Custom energy-scale HUD composed of `bg_progress.png` + horizontally-clipped
`progress.png` driven by pixel-scanning the in-game energy bar fill.

Hotkeys (global, via pynput):
    T               toggle bar-scan region setup window
    Ctrl+L          lock / unlock (lock starts scanning + click-through)
    Ctrl+P          quit
    RMB on bar      (calibrate only) cycle position: custom -> center -> custom

LMB-drag on bar (calibrate only) moves it; the position is saved as "custom".
"""
import os
import threading
import time
import tkinter as tk

from loguru import logger
import numpy as np
from PIL import Image, ImageDraw

from utils.config import ConfigManager
from utils.layered_window import LayeredWindow
from utils.ocr_reader import scan_bar_fill_pct, reset_bar_filter

try:
    from pynput import mouse as pynmouse, keyboard as pynkeyboard
    PYNPUT_OK = True
except ImportError:
    PYNPUT_OK = False


ASSETS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets")
BG_IMAGE = "bg_progress.png"
FG_IMAGE = "progress.png"


class XM1Overlay:
    def __init__(self, root, config_filename="saclos_config_xm1_90.json"):
        self.root = root
        self.root.title("XM1 90 Overlay")
        self.root.withdraw()  # no visible tk window — only LayeredWindow + transient OCR setup

        self.config_mgr = ConfigManager(filename=config_filename)
        self.state = "calibrate"  # calibrate | locked

        # OCR
        self.ocr_region = None
        self.ocr_poll_interval_ms = 100
        self.ocr_thread = None
        self.ocr_stop_event = threading.Event()
        self.energy_pct = 0
        self._ocr_lock = threading.Lock()
        self._last_drawn_pct = -1

        # OCR setup window
        self.OCR_SETUP_W = 120
        self.OCR_SETUP_H = 40
        self.ocr_setup_win = None
        self.ocr_setup_visible = False

        # Energy bar position
        self.bar_pos_mode = "custom"      # "custom" | "center"
        self.bar_custom_pos = None         # [x, y]

        # LayeredWindow + assets
        self.bar_win = None
        self.bg_img_pil = None
        self.fg_img_pil = None
        self.fg_content_top = 0
        self.fg_content_bottom = 0

        # Debounce for hotkeys
        self._last_toggle_lock_t = 0.0

        self._load_assets()
        self._create_ocr_setup_window()
        self._create_setup_dialog()
        self._load_config()

        # Default custom position if never saved
        if self.bar_custom_pos is None and self.bg_img_pil is not None:
            sw = self.root.winfo_screenwidth()
            sh = self.root.winfo_screenheight()
            bw, bh = self.bg_img_pil.size
            # Default custom = lower-third of screen, centered horizontally
            self.bar_custom_pos = [(sw - bw) // 2, int(sh * 0.7) - bh // 2]

        # Always show the bar
        self._create_bar_window()
        self._enter_calibrate()

        # Global input listeners (pynput) — keyboard + mouse
        self._start_listeners()

        # Tk idle pump so root.after timers run
        self.root.after(50, self._tick)

    # ── Asset loading ─────────────────────────────────────────────

    def _load_assets(self):
        bg_path = os.path.join(ASSETS_DIR, BG_IMAGE)
        fg_path = os.path.join(ASSETS_DIR, FG_IMAGE)
        if not os.path.exists(bg_path) or not os.path.exists(fg_path):
            logger.error(f"Missing energy assets: {bg_path} / {fg_path}")
            return
        bg = Image.open(bg_path).convert("RGBA")
        fg = Image.open(fg_path).convert("RGBA")

        sw = self.root.winfo_screenwidth()
        target_w = int(sw * 0.4)
        scale = target_w / bg.width
        new_size = (int(bg.width * scale), int(bg.height * scale))
        bg = bg.resize(new_size, Image.Resampling.LANCZOS)
        fg = fg.resize(new_size, Image.Resampling.LANCZOS)

        self.bg_img_pil = bg
        self.fg_img_pil = fg

        # Find vertical content bounds in progress.png (rows with any non-transparent pixel).
        alpha = np.array(fg)[:, :, 3]
        row_has_content = alpha.max(axis=1) > 10
        content_rows = np.where(row_has_content)[0]
        if len(content_rows) >= 2:
            self.fg_content_top = int(content_rows[0])
            self.fg_content_bottom = int(content_rows[-1]) + 1
        else:
            self.fg_content_top = 0
            self.fg_content_bottom = fg.height
        logger.debug(f"XM1 fg content rows: {self.fg_content_top}..{self.fg_content_bottom} / {fg.height}")

    # ── Position helpers ─────────────────────────────────────────

    def _center_pos(self):
        sw = self.root.winfo_screenwidth()
        sh = self.root.winfo_screenheight()
        bw, bh = self.bg_img_pil.size
        return [(sw - bw) // 2, (sh - bh) // 2]

    def _current_pos(self):
        if self.bar_pos_mode == "center":
            return self._center_pos()
        return list(self.bar_custom_pos) if self.bar_custom_pos else self._center_pos()

    def _apply_bar_position(self):
        if self.bar_win and self.bar_win.is_created:
            x, y = self._current_pos()
            self.bar_win.move(x, y)

    def _toggle_position(self):
        if self.state != "calibrate":
            return
        # In calibrate, sync any drag into custom before switching away from custom
        if self.bar_pos_mode == "custom" and self.bar_win and self.bar_win.is_created:
            self.bar_custom_pos = list(self.bar_win.get_position())
        self.bar_pos_mode = "center" if self.bar_pos_mode == "custom" else "custom"
        self._apply_bar_position()
        logger.info(f"XM1 bar position mode -> {self.bar_pos_mode}")
        self._save_config()

    def _within_bar(self, x, y):
        """True if screen-space (x, y) is inside the bar window rect."""
        if not self.bar_win or not self.bar_win.is_created:
            return False
        bx, by = self.bar_win.get_position()
        bw, bh = self.bar_win.get_size()
        return bx <= x < bx + bw and by <= y < by + bh

    # ── Bar rendering ─────────────────────────────────────────────

    def _compose_bar_image(self, pct):
        if self.bg_img_pil is None or self.fg_img_pil is None:
            return None
        pct = max(0, min(100, int(pct)))
        canvas = self.bg_img_pil.copy()
        if pct > 0:
            w, _ = self.fg_img_pil.size
            ct = self.fg_content_top
            cb = self.fg_content_bottom
            h_content = cb - ct
            cut = int(h_content * pct / 100)
            if cut > 0:
                # Reveal bottom-up within content bounds only.
                y_start = cb - cut
                fg_clip = self.fg_img_pil.crop((0, y_start, w, cb))

                # Feather the top edge of the revealed slice.
                feather_h = min(max(int(h_content * 0.04), 4), cut, 24)
                if feather_h > 0:
                    arr = np.array(fg_clip)
                    ramp = np.linspace(0.0, 1.0, feather_h, dtype=np.float32)
                    alpha = arr[:feather_h, :, 3].astype(np.float32)
                    arr[:feather_h, :, 3] = (alpha * ramp[:, None]).astype(np.uint8)
                    fg_clip = Image.fromarray(arr, mode="RGBA")

                tmp = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
                tmp.paste(fg_clip, (0, y_start))
                canvas = Image.alpha_composite(canvas, tmp)

        # Draw a small center X during calibration as a visual anchor.
        if self.state == "calibrate":
            cw, ch = canvas.size
            cx, cy = cw // 2, ch // 2
            size = 8
            overlay = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
            draw = ImageDraw.Draw(overlay)
            color = (255, 255, 255, 230)
            draw.line((cx - size, cy - size, cx + size, cy + size), fill=color, width=2)
            draw.line((cx - size, cy + size, cx + size, cy - size), fill=color, width=2)
            canvas = Image.alpha_composite(canvas, overlay)
        return canvas

    def _create_bar_window(self):
        if self.bar_win is not None or self.bg_img_pil is None:
            return
        x, y = self._current_pos()
        self.bar_win = LayeredWindow("XM1 Energy Bar", x=x, y=y, draggable=True)
        img = self._compose_bar_image(self.energy_pct)
        self.bar_win.create(img, global_alpha=255)
        self.bar_win.show()
        self._last_drawn_pct = self.energy_pct

    def _refresh_bar_if_changed(self):
        if not self.bar_win or not self.bar_win.is_created:
            return
        with self._ocr_lock:
            pct = self.energy_pct
        if pct != self._last_drawn_pct:
            img = self._compose_bar_image(pct)
            if img:
                self.bar_win.update_image(img)
                self._last_drawn_pct = pct

    def _tick(self):
        """Main idle pump: refresh OCR-driven bar, check stop."""
        try:
            if self.state == "locked":
                self._refresh_bar_if_changed()
        except Exception as e:
            logger.error(f"XM1 tick error: {e}")
        self.root.after(50, self._tick)

    # ── Setup dialog (calibrate-only, holds tk key bindings) ─────

    def _create_setup_dialog(self):
        self.setup_dialog = tk.Toplevel(self.root)
        self.setup_dialog.title("XM1 SACLOS")
        self.setup_dialog.attributes("-topmost", True)
        self.setup_dialog.configure(bg="#0a0a0a")
        self.setup_dialog.resizable(False, False)
        self.setup_dialog.geometry("+20+20")

        self.setup_state_lbl = tk.Label(
            self.setup_dialog,
            text="CALIBRATE",
            bg="#0a0a0a", fg="#77ffaa",
            font=("Montserrat", 11, "bold"),
            padx=12, pady=6,
        )
        self.setup_state_lbl.pack()

        hint = tk.Label(
            self.setup_dialog,
            text="T = bar-scan region\nLMB-drag bar to move   RMB on bar = toggle center\nCtrl+L = lock   Ctrl+P = quit",
            bg="#0a0a0a", fg="#888",
            font=("Montserrat", 9),
            justify=tk.LEFT,
            padx=12, pady=6,
        )
        hint.pack()

        for w in (self.setup_dialog, self.setup_state_lbl, hint):
            w.bind("<Control-l>", lambda e: self._toggle_lock())
            w.bind("<Control-L>", lambda e: self._toggle_lock())
            w.bind("<Control-p>", lambda e: self._quit())
            w.bind("<Control-P>", lambda e: self._quit())
            w.bind("<t>", lambda e: self._toggle_ocr_setup())
            w.bind("<T>", lambda e: self._toggle_ocr_setup())

        self.setup_dialog.protocol("WM_DELETE_WINDOW", self._quit)
        self.setup_dialog.withdraw()

    def _show_setup_dialog(self):
        self.setup_dialog.deiconify()
        self.setup_dialog.attributes("-topmost", True)
        self.setup_dialog.lift()
        try:
            self.setup_dialog.focus_force()
        except Exception:
            pass

    def _hide_setup_dialog(self):
        self.setup_dialog.withdraw()

    # ── OCR setup window (transient) ─────────────────────────────

    def _create_ocr_setup_window(self):
        self.ocr_setup_win = tk.Toplevel(self.root)
        self.ocr_setup_win.title("XM1 OCR Region")
        self.ocr_setup_win.overrideredirect(True)
        self.ocr_setup_win.attributes("-topmost", True)
        self.ocr_setup_win.configure(bg="#002255")
        self.ocr_setup_win.attributes("-alpha", 0.6)

        self.ocr_setup_canvas = tk.Canvas(
            self.ocr_setup_win,
            width=self.OCR_SETUP_W, height=self.OCR_SETUP_H,
            bg="#002255", highlightthickness=0,
        )
        self.ocr_setup_canvas.pack(fill=tk.BOTH, expand=True)
        self._draw_ocr_setup_border()

        self.ocr_setup_canvas.bind("<ButtonPress-1>", self._ocr_drag_start)
        self.ocr_setup_canvas.bind("<B1-Motion>", self._ocr_drag_move)
        self.ocr_setup_canvas.bind("<ButtonPress-3>", self._ocr_resize_start)
        self.ocr_setup_canvas.bind("<B3-Motion>", self._ocr_resize_move)

        self.ocr_setup_win.withdraw()

    def _draw_ocr_setup_border(self):
        c = self.ocr_setup_canvas
        c.delete("all")
        w, h = self.OCR_SETUP_W, self.OCR_SETUP_H
        c.create_rectangle(2, 2, w - 2, h - 2, outline="#00ffff", width=2, dash=(4, 3))
        c.create_text(w // 2, h // 2, text="BAR SCAN", fill="#00ffff",
                      font=("Courier", 9), anchor=tk.CENTER)

    def _show_ocr_setup(self):
        if self.ocr_setup_visible:
            return
        self.ocr_setup_visible = True

        if self.ocr_region:
            x, y = self.ocr_region[0], self.ocr_region[1]
            self.OCR_SETUP_W = self.ocr_region[2] - self.ocr_region[0]
            self.OCR_SETUP_H = self.ocr_region[3] - self.ocr_region[1]
        else:
            sw = self.root.winfo_screenwidth()
            sh = self.root.winfo_screenheight()
            x = sw // 2 - self.OCR_SETUP_W // 2
            y = sh // 2 + 100

        self.ocr_setup_win.geometry(f"{self.OCR_SETUP_W}x{self.OCR_SETUP_H}+{int(x)}+{int(y)}")
        self.ocr_setup_canvas.config(width=self.OCR_SETUP_W, height=self.OCR_SETUP_H)
        self._draw_ocr_setup_border()
        self.ocr_setup_win.deiconify()
        self.ocr_setup_win.attributes("-topmost", True)

    def _hide_ocr_setup(self):
        if not self.ocr_setup_visible:
            return
        self.ocr_setup_visible = False
        x = self.ocr_setup_win.winfo_x()
        y = self.ocr_setup_win.winfo_y()
        self.ocr_region = [x, y, x + self.OCR_SETUP_W, y + self.OCR_SETUP_H]
        self.ocr_setup_win.withdraw()
        reset_bar_filter()
        logger.info(f"XM1 bar-scan region: {self.ocr_region}")
        self._save_config()

    def _toggle_ocr_setup(self):
        if self.state != "calibrate":
            return
        if self.ocr_setup_visible:
            self._hide_ocr_setup()
        else:
            self._show_ocr_setup()

    def _ocr_drag_start(self, event):
        self._ocr_drag_ox = event.x_root - self.ocr_setup_win.winfo_x()
        self._ocr_drag_oy = event.y_root - self.ocr_setup_win.winfo_y()

    def _ocr_drag_move(self, event):
        nx = event.x_root - self._ocr_drag_ox
        ny = event.y_root - self._ocr_drag_oy
        self.ocr_setup_win.geometry(f"{self.OCR_SETUP_W}x{self.OCR_SETUP_H}+{nx}+{ny}")

    def _ocr_resize_start(self, event):
        self._ocr_resize_ox = event.x_root
        self._ocr_resize_oy = event.y_root
        self._ocr_resize_w0 = self.OCR_SETUP_W
        self._ocr_resize_h0 = self.OCR_SETUP_H

    def _ocr_resize_move(self, event):
        dw = event.x_root - self._ocr_resize_ox
        dh = event.y_root - self._ocr_resize_oy
        self.OCR_SETUP_W = max(40, self._ocr_resize_w0 + dw)
        self.OCR_SETUP_H = max(20, self._ocr_resize_h0 + dh)
        x = self.ocr_setup_win.winfo_x()
        y = self.ocr_setup_win.winfo_y()
        self.ocr_setup_win.geometry(f"{self.OCR_SETUP_W}x{self.OCR_SETUP_H}+{x}+{y}")
        self.ocr_setup_canvas.config(width=self.OCR_SETUP_W, height=self.OCR_SETUP_H)
        self._draw_ocr_setup_border()

    # ── OCR thread ────────────────────────────────────────────────

    def _start_ocr_thread(self):
        if self.ocr_thread and self.ocr_thread.is_alive():
            return
        if not self.ocr_region:
            return
        self.ocr_stop_event.clear()
        self.ocr_thread = threading.Thread(target=self._ocr_loop, daemon=True)
        self.ocr_thread.start()
        logger.info(f"XM1 bar-scan started (region={self.ocr_region})")

    def _stop_ocr_thread(self):
        if self.ocr_thread:
            self.ocr_stop_event.set()
            try:
                self.ocr_thread.join(timeout=1.0)
            except Exception:
                pass
            self.ocr_thread = None

    def _ocr_loop(self):
        interval_s = self.ocr_poll_interval_ms / 1000.0
        while not self.ocr_stop_event.is_set():
            val = scan_bar_fill_pct(self.ocr_region)
            with self._ocr_lock:
                prev = self.energy_pct
                if val is not None:
                    self.energy_pct = val
            logger.info(f"[XM1 bar] poll -> {val} (energy_pct {prev} -> {self.energy_pct})")
            self.ocr_stop_event.wait(interval_s)

    # ── State transitions ────────────────────────────────────────

    def _enter_calibrate(self):
        self.state = "calibrate"
        # In calibrate, bar is draggable (LMB) and not click-through.
        if self.bar_win:
            self.bar_win.set_draggable(True)
            self.bar_win.set_click_through(False)
        # Preview energy at 50% so user can see the bar
        with self._ocr_lock:
            self.energy_pct = 50
        self._last_drawn_pct = -1  # force redraw to include the center X
        self._refresh_bar_if_changed()
        self._apply_bar_position()
        if self.ocr_region:
            self._show_ocr_setup()
        self.setup_state_lbl.config(text="CALIBRATE", fg="#ffaa00")
        self._show_setup_dialog()
        logger.info("XM1 CALIBRATE: drag with LMB, RMB cycles position, T=OCR region, Ctrl+L=lock")

    def _enter_locked(self):
        # On exit-from-calibrate, capture any LMB-drag into custom position.
        if self.bar_pos_mode == "custom" and self.bar_win:
            self.bar_custom_pos = list(self.bar_win.get_position())
            self._save_config()

        self.state = "locked"
        if self.bar_win:
            self.bar_win.set_draggable(False)
            self.bar_win.set_click_through(True)
        if self.ocr_setup_visible:
            self._hide_ocr_setup()
        self._apply_bar_position()
        self._last_drawn_pct = -1  # force redraw to drop the center X
        self._refresh_bar_if_changed()
        if self.ocr_region:
            self._start_ocr_thread()
        self.setup_state_lbl.config(text="LOCKED", fg="#77ffaa")
        self._hide_setup_dialog()
        logger.info("XM1 LOCKED: OCR polling, click-through")

    def _toggle_lock(self):
        now = time.perf_counter()
        if now - self._last_toggle_lock_t < 0.3:
            return  # debounce
        self._last_toggle_lock_t = now
        if self.state == "calibrate":
            self._enter_locked()
        else:
            self._stop_ocr_thread()
            self._enter_calibrate()

    def _quit(self):
        try:
            self._stop_ocr_thread()
            # capture latest custom pos
            if self.bar_pos_mode == "custom" and self.bar_win and self.bar_win.is_created:
                self.bar_custom_pos = list(self.bar_win.get_position())
            self._save_config()
        except Exception:
            pass
        try:
            if self.bar_win:
                self.bar_win.destroy()
        except Exception:
            pass
        try:
            if self.kbd_listener:
                self.kbd_listener.stop()
        except Exception:
            pass
        try:
            if self.mouse_listener:
                self.mouse_listener.stop()
        except Exception:
            pass
        try:
            self.root.destroy()
        except Exception:
            pass

    # ── Input listeners ──────────────────────────────────────────

    def _start_listeners(self):
        self.kbd_listener = None
        self.mouse_listener = None
        if not PYNPUT_OK:
            logger.warning("pynput unavailable — hotkeys disabled")
            return

        self._ctrl_pressed = False

        def on_press(key):
            try:
                char = getattr(key, 'char', None)
                if key in (pynkeyboard.Key.ctrl_l, pynkeyboard.Key.ctrl_r, pynkeyboard.Key.ctrl):
                    self._ctrl_pressed = True
                    return
                if char and char.lower() == 't' and not self._ctrl_pressed:
                    self.root.after(0, self._toggle_ocr_setup)
                if self._ctrl_pressed and char:
                    c = char.lower()
                    if c == 'l':
                        self.root.after(0, self._toggle_lock)
                    elif c == 'p':
                        self.root.after(0, self._quit)
            except Exception:
                pass

        def on_release(key):
            try:
                if key in (pynkeyboard.Key.ctrl_l, pynkeyboard.Key.ctrl_r, pynkeyboard.Key.ctrl):
                    self._ctrl_pressed = False
            except Exception:
                pass

        self.kbd_listener = pynkeyboard.Listener(on_press=on_press, on_release=on_release)
        self.kbd_listener.start()

        # Mouse listener — RMB toggles position when over bar in calibrate mode
        def on_click(x, y, button, pressed):
            if not pressed:
                return
            if button != pynmouse.Button.right:
                return
            if self.state != "calibrate":
                return
            if not self._within_bar(x, y):
                return
            self.root.after(0, self._toggle_position)

        self.mouse_listener = pynmouse.Listener(on_click=on_click)
        self.mouse_listener.start()

    # ── Config ────────────────────────────────────────────────────

    def _save_config(self):
        self.config_mgr.save({
            "ocr_region": self.ocr_region,
            "ocr_poll_interval_ms": self.ocr_poll_interval_ms,
            "bar_pos_mode": self.bar_pos_mode,
            "bar_custom_pos": self.bar_custom_pos,
        })

    def _load_config(self):
        config = self.config_mgr.load()
        if not config:
            return
        self.ocr_region = config.get("ocr_region", None)
        self.ocr_poll_interval_ms = config.get("ocr_poll_interval_ms", 200)
        self.bar_pos_mode = config.get("bar_pos_mode", "custom")
        bcp = config.get("bar_custom_pos", None)
        if bcp:
            self.bar_custom_pos = list(bcp)


def run(config_file="saclos_config_xm1_90.json", argv=None):
    root = tk.Tk()
    app = XM1Overlay(root, config_filename=config_file)
    root.mainloop()
