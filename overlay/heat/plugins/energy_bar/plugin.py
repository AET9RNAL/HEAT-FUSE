"""Energy-bar plugin — OCR-driven energy / progress overlay.

A vehicle-agnostic re-implementation of the legacy XM1-90 energy HUD as a
HEAT plugin. Composites ``bg_progress.png`` with a vertically-clipped
``progress.png`` foreground driven by pixel-scanning an in-game energy bar
region.

Hotkeys (registered against the host):
    T          toggle bar-scan region setup window (calibrate only)
Global (handled by the host):
    Ctrl+L     lock / unlock
    Ctrl+P     quit
"""
from __future__ import annotations

import threading
import tkinter as tk
from pathlib import Path
from typing import Optional

import numpy as np
from loguru import logger
from PIL import Image, ImageDraw

from fuse.api import FuseContext, FusePlugin
from fuse.utils.layered_window import LayeredWindow
from fuse.utils.panel import FusePanel
from fuse.utils.game_memory import GameMemory
from fuse.ui.config_schema import ConfigCategory, ConfigEntry
from overlay.heat.plugins.energy_bar.ocr_bar import scan_bar_fill_pct, reset_bar_filter

# Flip to False to revert to OCR-based energy reading.
USE_MEMORY_API: bool = True

try:
    from pynput import mouse as pynmouse
    PYNPUT_OK = True
except ImportError:  # pragma: no cover
    PYNPUT_OK = False


class EnergyBarPlugin(FusePlugin):
    """Composited energy-scale HUD with OCR-driven fill percentage."""

    requires_calibration = True

    BG_IMAGE_DEFAULT = "bg_progress.png"
    FG_IMAGE_DEFAULT = "progress.png"
    OCR_SETUP_W = 120
    OCR_SETUP_H = 40

    def __init__(self) -> None:
        self.ctx: Optional[FuseContext] = None
        self._mem: Optional[GameMemory] = None  # set in setup() when USE_MEMORY_API

        # Images
        self.bg_img_pil: Optional[Image.Image] = None
        self.fg_img_pil: Optional[Image.Image] = None
        self.fg_content_top = 0
        self.fg_content_bottom = 0

        # Overlay panel (wraps LayeredWindow; bar_win is the raw window for compat)
        self._bar_panel: Optional[FusePanel] = None
        self.bar_win: Optional[LayeredWindow] = None
        self._last_drawn_pct = -1

        # Position state
        self.bar_pos_mode = "custom"
        self.bar_custom_pos: Optional[list[int]] = None

        # OCR
        self.ocr_region: Optional[list[int]] = None
        self.ocr_poll_interval_ms = 100
        self.ocr_thread: Optional[threading.Thread] = None
        self.ocr_stop_event = threading.Event()
        self.energy_pct = 0
        self._ocr_lock = threading.Lock()

        # OCR setup window (calibrate-only Tk Toplevel)
        self.ocr_setup_win: Optional[tk.Toplevel] = None
        self.ocr_setup_canvas: Optional[tk.Canvas] = None
        self.ocr_setup_visible = False

        # Calibrate-mode status dialog
        self.setup_dialog: Optional[tk.Toplevel] = None
        self.setup_state_lbl: Optional[tk.Label] = None

    # ------------------------------------------------------------------
    # HeatPlugin lifecycle
    # ------------------------------------------------------------------

    def setup(self, ctx: FuseContext) -> None:
        self.ctx = ctx

        if USE_MEMORY_API:
            self._mem = ctx.services.get("game_memory")  # type: ignore[assignment]
            if self._mem is None:
                logger.warning("energy_bar: USE_MEMORY_API=True but 'game_memory' service "
                               "not available — falling back to OCR")

        ctx.config.defaults(
            ocr_region=None,
            ocr_poll_interval_ms=100,
            bar_pos_mode="custom",
            bar_custom_pos=None,
            bg_image=self.BG_IMAGE_DEFAULT,
            fg_image=self.FG_IMAGE_DEFAULT,
            memory_chain="energy_multiplayer",
        ).load()

        ctx.config.schema([
            ConfigCategory("Display", [
                ConfigEntry("bar_pos_mode", "Position Mode", type="choice",
                            choices=["custom", "center"],
                            description="custom = draggable, center = screen center"),
            ]),
            ConfigCategory("Memory Source", [
                ConfigEntry("memory_chain", "Pointer Chain", type="choice",
                            choices=["energy_multiplayer", "energy_training_range"],
                            description="Which pointer chain to read energy from"),
            ]),
            ConfigCategory("OCR Source", [
                ConfigEntry("ocr_poll_interval_ms", "Poll Interval (ms)", type="int",
                            min=50, max=2000),
            ]),
            ConfigCategory("Assets", [
                ConfigEntry("bg_image", "Background Image", type="str"),
                ConfigEntry("fg_image", "Foreground Image", type="str"),
            ]),
            ConfigCategory("Position", [
                ConfigEntry("bar_custom_pos", "Bar Position", type="position"),
            ]),
        ])
        self.ocr_region = ctx.config.get("ocr_region")
        self.ocr_poll_interval_ms = ctx.config.get("ocr_poll_interval_ms")
        self.bar_pos_mode = ctx.config.get("bar_pos_mode")
        self.bar_custom_pos = ctx.config.get("bar_custom_pos")

        self._load_assets(ctx.assets_dir,
                          ctx.config.get("bg_image"),
                          ctx.config.get("fg_image"))
        self._create_ocr_setup_window()
        self._create_setup_dialog()

        if self.bar_custom_pos is None and self.bg_img_pil is not None:
            sw = ctx.tk_root.winfo_screenwidth()
            sh = ctx.tk_root.winfo_screenheight()
            bw, bh = self.bg_img_pil.size
            self.bar_custom_pos = [(sw - bw) // 2, int(sh * 0.7) - bh // 2]

        self._create_bar_window()

        ctx.hotkeys.register("t", self._toggle_ocr_setup, label="energy_bar: Toggle OCR Region")
        ctx.host.subscribe_mouse(self._on_global_click)

        ctx.config.watch("ocr_poll_interval_ms",
                         lambda v: setattr(self, "ocr_poll_interval_ms", int(v)))

    def enter_calibrate(self) -> None:
        if self._bar_panel:
            self._bar_panel.enter_calibrate()
        with self._ocr_lock:
            self.energy_pct = 50
        self._last_drawn_pct = -1
        self._refresh_bar_if_changed()
        self._apply_bar_position()
        if self.ocr_region:
            self._show_ocr_setup()
        if self.setup_state_lbl is not None:
            self.setup_state_lbl.config(text="CALIBRATE", fg="#ffaa00")
        self._show_setup_dialog()
        logger.info("energy_bar: CALIBRATE — drag bar, T=OCR region, Ctrl+L=lock")

    def enter_locked(self) -> None:
        if self._bar_panel:
            if self.bar_pos_mode == "custom":
                self.bar_custom_pos = list(self._bar_panel.get_position())
                self._save_config()
            self._bar_panel.enter_locked()
        if self.ocr_setup_visible:
            self._hide_ocr_setup()
        self._apply_bar_position()
        self._last_drawn_pct = -1
        self._refresh_bar_if_changed()
        if not (USE_MEMORY_API and self._mem is not None) and self.ocr_region:
            self._start_ocr_thread()
        if self.setup_state_lbl is not None:
            self.setup_state_lbl.config(text="LOCKED", fg="#77ffaa")
        self._hide_setup_dialog()
        src = "game_memory" if (USE_MEMORY_API and self._mem is not None) else "OCR"
        logger.info(f"energy_bar: LOCKED — reading from {src}, click-through")

    def tick(self, dt: float) -> None:  # noqa: D401 — short verb
        if self.ctx and self.ctx.state == "locked":
            if USE_MEMORY_API and self._mem is not None:
                val = self._mem.read(self.ctx.config.get("memory_chain", "energy_multiplayer"))
                if val is not None:
                    with self._ocr_lock:
                        self.energy_pct = max(0, min(100, int(val)))
            self._refresh_bar_if_changed()

    def teardown(self) -> None:
        try:
            self._stop_ocr_thread()
            if self.bar_pos_mode == "custom" and self._bar_panel and self._bar_panel.is_created:
                self.bar_custom_pos = list(self._bar_panel.get_position())
            self._save_config()
        except Exception:
            pass
        try:
            if self._bar_panel:
                self._bar_panel.destroy()
        except Exception:
            pass

    # ------------------------------------------------------------------
    # Assets + rendering
    # ------------------------------------------------------------------

    def _load_assets(self, assets_dir: Path, bg_name: str, fg_name: str) -> None:
        bg_path = assets_dir / bg_name
        fg_path = assets_dir / fg_name
        if not bg_path.exists() or not fg_path.exists():
            logger.error(f"energy_bar: missing assets {bg_path} / {fg_path}")
            return
        bg = Image.open(bg_path).convert("RGBA")
        fg = Image.open(fg_path).convert("RGBA")

        sw = self.ctx.tk_root.winfo_screenwidth()
        scale = (int(sw * 0.4)) / bg.width
        new_size = (int(bg.width * scale), int(bg.height * scale))
        self.bg_img_pil = bg.resize(new_size, Image.Resampling.LANCZOS)
        self.fg_img_pil = fg.resize(new_size, Image.Resampling.LANCZOS)

        alpha = np.array(self.fg_img_pil)[:, :, 3]
        rows = np.where(alpha.max(axis=1) > 10)[0]
        if len(rows) >= 2:
            self.fg_content_top = int(rows[0])
            self.fg_content_bottom = int(rows[-1]) + 1
        else:
            self.fg_content_top = 0
            self.fg_content_bottom = self.fg_img_pil.height

    def _compose_bar_image(self, pct: int) -> Optional[Image.Image]:
        if self.bg_img_pil is None or self.fg_img_pil is None:
            return None
        pct = max(0, min(100, int(pct)))
        canvas = self.bg_img_pil.copy()
        if pct > 0:
            w, _ = self.fg_img_pil.size
            ct, cb = self.fg_content_top, self.fg_content_bottom
            h_content = cb - ct
            cut = int(h_content * pct / 100)
            if cut > 0:
                y_start = cb - cut
                fg_clip = self.fg_img_pil.crop((0, y_start, w, cb))
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
        if self.ctx and self.ctx.state == "calibrate":
            cw, ch = canvas.size
            cx, cy = cw // 2, ch // 2
            size = 8
            overlay = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
            d = ImageDraw.Draw(overlay)
            color = (255, 255, 255, 230)
            d.line((cx - size, cy - size, cx + size, cy + size), fill=color, width=2)
            d.line((cx - size, cy + size, cx + size, cy - size), fill=color, width=2)
            canvas = Image.alpha_composite(canvas, overlay)
        return canvas

    def _create_bar_window(self) -> None:
        if self._bar_panel is not None or self.bg_img_pil is None:
            return
        x, y = self._current_pos()
        self._bar_panel = FusePanel("HEAT Energy Bar", "bar_custom_pos", self.ctx.config,
                                    default_x=x, default_y=y)
        img = self._compose_bar_image(self.energy_pct)
        self._bar_panel.create(img, global_alpha=255)
        self._bar_panel.show()
        self.bar_win = self._bar_panel.win  # raw LayeredWindow for direct use
        self._last_drawn_pct = self.energy_pct

    def _refresh_bar_if_changed(self) -> None:
        if not self.bar_win or not self.bar_win.is_created:
            return
        with self._ocr_lock:
            pct = self.energy_pct
        if pct != self._last_drawn_pct:
            img = self._compose_bar_image(pct)
            if img:
                self.bar_win.update_image(img)
                self._last_drawn_pct = pct

    # ------------------------------------------------------------------
    # Position
    # ------------------------------------------------------------------

    def _center_pos(self) -> list[int]:
        sw = self.ctx.tk_root.winfo_screenwidth()
        sh = self.ctx.tk_root.winfo_screenheight()
        bw, bh = self.bg_img_pil.size
        return [(sw - bw) // 2, (sh - bh) // 2]

    def _current_pos(self) -> list[int]:
        if self.bar_pos_mode == "center":
            return self._center_pos()
        return list(self.bar_custom_pos) if self.bar_custom_pos else self._center_pos()

    def _apply_bar_position(self) -> None:
        if self.bar_win and self.bar_win.is_created:
            x, y = self._current_pos()
            self.bar_win.move(x, y)

    def _toggle_position(self) -> None:
        if self.ctx.state != "calibrate":
            return
        if self.bar_pos_mode == "custom" and self.bar_win and self.bar_win.is_created:
            self.bar_custom_pos = list(self.bar_win.get_position())
        self.bar_pos_mode = "center" if self.bar_pos_mode == "custom" else "custom"
        self._apply_bar_position()
        logger.info(f"energy_bar position -> {self.bar_pos_mode}")
        self._save_config()

    def _within_bar(self, x: int, y: int) -> bool:
        if not self.bar_win or not self.bar_win.is_created:
            return False
        bx, by = self.bar_win.get_position()
        bw, bh = self.bar_win.get_size()
        return bx <= x < bx + bw and by <= y < by + bh

    # ------------------------------------------------------------------
    # OCR setup window + setup dialog (calibrate-only, Tk)
    # ------------------------------------------------------------------

    def _create_setup_dialog(self) -> None:
        root = self.ctx.tk_root
        self.setup_dialog = tk.Toplevel(root)
        self.setup_dialog.title("HEAT energy_bar")
        self.setup_dialog.attributes("-topmost", True)
        self.setup_dialog.configure(bg="#0a0a0a")
        self.setup_dialog.resizable(False, False)
        self.setup_dialog.geometry("+20+20")

        self.setup_state_lbl = tk.Label(
            self.setup_dialog, text="CALIBRATE",
            bg="#0a0a0a", fg="#ffaa00",
            font=("Noto Sans", 11, "bold"),
            padx=12, pady=6,
        )
        self.setup_state_lbl.pack()
        hint = tk.Label(
            self.setup_dialog,
            text=("T = bar-scan region\n"
                  "LMB-drag bar to move   RMB on bar = toggle center\n"
                  "Ctrl+L = lock   Ctrl+P = quit"),
            bg="#0a0a0a", fg="#888",
            font=("Noto Sans", 9), justify=tk.LEFT, padx=12, pady=6,
        )
        hint.pack()
        self.setup_dialog.protocol("WM_DELETE_WINDOW", self.ctx.host.quit)
        self.setup_dialog.withdraw()

    def _show_setup_dialog(self) -> None:
        if self.setup_dialog is None:
            return
        self.setup_dialog.deiconify()
        self.setup_dialog.attributes("-topmost", True)
        self.setup_dialog.lift()

    def _hide_setup_dialog(self) -> None:
        if self.setup_dialog is not None:
            self.setup_dialog.withdraw()

    def _create_ocr_setup_window(self) -> None:
        root = self.ctx.tk_root
        self.ocr_setup_win = tk.Toplevel(root)
        self.ocr_setup_win.title("HEAT OCR Region")
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

    def _draw_ocr_setup_border(self) -> None:
        c = self.ocr_setup_canvas
        c.delete("all")
        w, h = self.OCR_SETUP_W, self.OCR_SETUP_H
        c.create_rectangle(2, 2, w - 2, h - 2, outline="#00ffff", width=2, dash=(4, 3))
        c.create_text(w // 2, h // 2, text="BAR SCAN", fill="#00ffff",
                      font=("Courier", 9), anchor=tk.CENTER)

    def _show_ocr_setup(self) -> None:
        if self.ocr_setup_visible:
            return
        self.ocr_setup_visible = True

        if self.ocr_region:
            x, y = self.ocr_region[0], self.ocr_region[1]
            self.OCR_SETUP_W = self.ocr_region[2] - self.ocr_region[0]
            self.OCR_SETUP_H = self.ocr_region[3] - self.ocr_region[1]
        else:
            sw = self.ctx.tk_root.winfo_screenwidth()
            sh = self.ctx.tk_root.winfo_screenheight()
            x = sw // 2 - self.OCR_SETUP_W // 2
            y = sh // 2 + 100

        self.ocr_setup_win.geometry(
            f"{self.OCR_SETUP_W}x{self.OCR_SETUP_H}+{int(x)}+{int(y)}")
        self.ocr_setup_canvas.config(width=self.OCR_SETUP_W, height=self.OCR_SETUP_H)
        self._draw_ocr_setup_border()
        self.ocr_setup_win.deiconify()
        self.ocr_setup_win.attributes("-topmost", True)

    def _hide_ocr_setup(self) -> None:
        if not self.ocr_setup_visible:
            return
        self.ocr_setup_visible = False
        x = self.ocr_setup_win.winfo_x()
        y = self.ocr_setup_win.winfo_y()
        self.ocr_region = [x, y, x + self.OCR_SETUP_W, y + self.OCR_SETUP_H]
        self.ocr_setup_win.withdraw()
        reset_bar_filter()
        logger.info(f"energy_bar OCR region: {self.ocr_region}")
        self._save_config()

    def _toggle_ocr_setup(self) -> None:
        if self.ctx.state != "calibrate":
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
        self.ocr_setup_win.geometry(
            f"{self.OCR_SETUP_W}x{self.OCR_SETUP_H}+{nx}+{ny}")

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
        self.ocr_setup_win.geometry(
            f"{self.OCR_SETUP_W}x{self.OCR_SETUP_H}+{x}+{y}")
        self.ocr_setup_canvas.config(width=self.OCR_SETUP_W, height=self.OCR_SETUP_H)
        self._draw_ocr_setup_border()

    # ------------------------------------------------------------------
    # OCR thread
    # ------------------------------------------------------------------

    def _start_ocr_thread(self) -> None:
        if self.ocr_thread and self.ocr_thread.is_alive():
            return
        if not self.ocr_region:
            return
        self.ocr_stop_event.clear()
        self.ocr_thread = threading.Thread(target=self._ocr_loop, daemon=True)
        self.ocr_thread.start()
        logger.info(f"energy_bar OCR started (region={self.ocr_region})")

    def _stop_ocr_thread(self) -> None:
        if self.ocr_thread:
            self.ocr_stop_event.set()
            try:
                self.ocr_thread.join(timeout=1.0)
            except Exception:
                pass
            self.ocr_thread = None

    def _ocr_loop(self) -> None:
        interval_s = self.ocr_poll_interval_ms / 1000.0
        while not self.ocr_stop_event.is_set():
            val = scan_bar_fill_pct(self.ocr_region)
            with self._ocr_lock:
                if val is not None:
                    self.energy_pct = val
            self.ocr_stop_event.wait(interval_s)

    # ------------------------------------------------------------------
    # Mouse subscriber (RMB-on-bar toggles position in calibrate)
    # ------------------------------------------------------------------

    def _on_global_click(self, x, y, button, pressed) -> None:
        if not pressed or not PYNPUT_OK:
            return
        if button != pynmouse.Button.right:
            return
        if self.ctx.state != "calibrate":
            return
        if not self._within_bar(x, y):
            return
        self.ctx.tk_root.after(0, self._toggle_position)

    # ------------------------------------------------------------------
    # Config
    # ------------------------------------------------------------------

    def _save_config(self) -> None:
        if self.ctx is None:
            return
        self.ctx.config.update({
            "ocr_region": self.ocr_region,
            "ocr_poll_interval_ms": self.ocr_poll_interval_ms,
            "bar_pos_mode": self.bar_pos_mode,
            "bar_custom_pos": self.bar_custom_pos,
        })


__all__ = ["EnergyBarPlugin"]
