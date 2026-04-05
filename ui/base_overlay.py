import os
import math
import tkinter as tk
from tkinter import filedialog, messagebox
from collections import deque
import threading
import time
import traceback

from utils.config import ConfigManager
from utils.window_utils import apply_geometry_fast, set_window_clickthrough, force_focus
from utils.ocr_reader import TESSERACT_OK, ocr_capture_range
from ui.ocr_ui import OCRUiMixin
from ui.rangefinder_ui import RangefinderUiMixin
from ui.hud_ui import HudUiMixin

try:
    from PIL import Image, ImageTk
    PIL_OK = True
except ImportError:
    PIL_OK = False

try:
    from pynput import mouse as pynmouse, keyboard as pynkeyboard
    PYNPUT_OK = True
except ImportError:
    PYNPUT_OK = False

class BaseSACLOSOverlay(OCRUiMixin, RangefinderUiMixin, HudUiMixin):
    def __init__(self, root, image_path=None, tracking_image_path=None, margin_x=200, margin_y=200):
        self.root = root
        self.root.title("SACLOS Overlay")
        self.config_mgr = ConfigManager()

        self.state = "calibrate"
        self.mouse_listener = None
        self.kbd_listener = None

        self.margin_x = margin_x
        self.margin_y = margin_y
        self.origin_x = None
        self.origin_y = None

        self.tracking_active = False
        self.calibrated_x = None
        self.calibrated_y = None
        self.tracking_win_x = None
        self.tracking_win_y = None
        self.last_update_time = 0
        self.mouse_start_x = None
        self.mouse_start_y = None
        self.win_start_x = None
        self.win_start_y = None

        self.image_path = None
        self.tracking_image_path = None
        self.tracking_key = None
        self.tracking_key_name = "Space"
        self.awaiting_tracking_key = False

        self.position_queue = deque(maxlen=1)
        self.position_lock = threading.Lock()
        self.update_timer_id = None
        self.hwnd = None

        self.target_range_m = 200.0

        # Run mixin initializations
        self._init_rangefinder()
        self._init_ocr_ui()
        self._init_hud()

        self.root.attributes("-topmost", True)
        self.root.attributes("-transparentcolor", "#000001")
        self.root.overrideredirect(True)
        self.root.configure(bg="#000001")

        sw = self.root.winfo_screenwidth()
        sh = self.root.winfo_screenheight()
        self.win_x = sw // 2 - 200
        self.win_y = sh // 2 - 200
        self._apply_geometry()

        self.canvas = tk.Canvas(self.root, bg="#000001", highlightthickness=0, cursor="crosshair")
        self.canvas.pack(fill=tk.BOTH, expand=True)
        force_focus(self.canvas)

        self.bar = tk.Frame(self.root, bg="#111111", pady=3)
        self.bar.pack(side=tk.BOTTOM, fill=tk.X)

        tk.Button(self.bar, text="Open image (Ctrl+O)", command=self._open_image,
                  bg="#222", fg="#aaa", relief=tk.FLAT,
                  padx=8, pady=2).pack(side=tk.LEFT, padx=4)

        self.status_lbl = tk.Label(
            self.bar,
            text="CALIBRATE  |  T=OCR region  |  Ctrl+L = lock    Ctrl+P = quit",
            bg="#111111", fg="#555", font=("Courier", 9)
        )
        self.status_lbl.pack(side=tk.LEFT, padx=10)

        self.img_normal = None
        self.img_tracking = None
        self.img_id = None
        self.boundary_box_id = None
        self.corner_handles = []
        self.dragging_corner = None
        self.dragging_center = False
        self.drag_start_x = None
        self.drag_start_y = None
        self.img_w = 400
        self.img_h = 400

        if image_path and os.path.exists(image_path):
            self._load_images(image_path, tracking_image_path)
        else:
            self._draw_placeholder()

        self._draw_boundary_box()

        self.canvas.bind("<ButtonPress-1>", self._drag_start)
        self.canvas.bind("<B1-Motion>", self._drag_move)
        self.canvas.bind("<ButtonRelease-1>", self._drag_end)
        self.canvas.bind("<Button-1>", lambda e: force_focus(self.canvas), add=True)

        for widget in [self.root, self.canvas]:
            widget.bind("<Control-o>", lambda e: self._open_image() if self.state != "locked" else None)
            widget.bind("<Control-O>", lambda e: self._open_image() if self.state != "locked" else None)
            widget.bind("<Control-l>", lambda e: self._toggle_lock())
            widget.bind("<Control-L>", lambda e: self._toggle_lock())
            widget.bind("<Control-p>", lambda e: self._quit())
            widget.bind("<Control-P>", lambda e: self._quit())
            widget.bind("<t>", lambda e: self._toggle_ocr_setup() if self.state in ("calibrate", "adjust_bounds") else None)
            widget.bind("<T>", lambda e: self._toggle_ocr_setup() if self.state in ("calibrate", "adjust_bounds") else None)

        self._start_kbd_listener()
        self._load_config()

        if self.tracking_key is None:
            self.root.after(500, self._prompt_for_tracking_key)

    def _save_config_partial(self):
        """Used by UI elements that just update part of config."""
        self._save_config()

    def _save_config(self):
        config_dict = {
            "calibrated_x": self.calibrated_x,
            "calibrated_y": self.calibrated_y,
            "origin_x": self.origin_x,
            "origin_y": self.origin_y,
            "margin_x": self.margin_x,
            "margin_y": self.margin_y,
            "image_path": self.image_path,
            "tracking_image_path": self.tracking_image_path,
            "tracking_key_name": self.tracking_key_name,
            "rf_key_name": self.rf_key_name,
            "ocr_region": self.ocr_region,
            "ocr_enabled": self.ocr_enabled,
            "ocr_poll_interval_ms": self.ocr_poll_interval_ms,
            "ocr_display_pos": self.ocr_display_pos,
            "target_range_m": self.target_range_m
        }

        # Merge with generic config manager rules
        # Subclasses can override this to inject mode-specific variables
        self._save_hud_config(config_dict)
        self._add_extra_config(config_dict)
        self.config_mgr.save(config_dict)

    def _add_extra_config(self, config_dict):
        """Override this in subclasses to append config properties."""
        pass

    def _load_config(self):
        config = self.config_mgr.load()
        if not config: return

        ip = config.get("image_path")
        tip = config.get("tracking_image_path")
        if ip and os.path.exists(ip):
            self._load_images(ip, tip)

        self.calibrated_x = config.get("calibrated_x")
        self.calibrated_y = config.get("calibrated_y")
        self.origin_x = config.get("origin_x")
        self.origin_y = config.get("origin_y")
        self.margin_x = config.get("margin_x", 200)
        self.margin_y = config.get("margin_y", 200)
        self.target_range_m = config.get("target_range_m", 200.0)

        self.tracking_key_name = config.get("tracking_key_name", "Space")
        self._update_tracking_key_from_name()

        self.rf_key_name = config.get("rf_key_name", "r")
        self._update_rf_key_from_name()

        self.ocr_region = config.get("ocr_region", None)
        self.ocr_enabled = config.get("ocr_enabled", False)
        self.ocr_poll_interval_ms = config.get("ocr_poll_interval_ms", 350)
        self.ocr_display_pos = config.get("ocr_display_pos", None)

        self._load_hud_config(config)

        self._load_extra_config(config)

        if self.calibrated_x is not None and self.calibrated_y is not None:
            self.win_x = self.calibrated_x
            self.win_y = self.calibrated_y
            self._apply_geometry()

        self._draw_boundary_box()

    def _load_extra_config(self, config):
        pass

    def _update_tracking_key_from_name(self):
        if not PYNPUT_OK: return
        key_map = {"Space": pynkeyboard.Key.space, "Shift": pynkeyboard.Key.shift, "Alt": pynkeyboard.Key.alt, "Tab": pynkeyboard.Key.tab, "CapsLock": pynkeyboard.Key.caps_lock}
        self.tracking_key = key_map.get(self.tracking_key_name, self.tracking_key_name.lower())

    def _update_rf_key_from_name(self):
        if not PYNPUT_OK: return
        key_map = {"Space": pynkeyboard.Key.space, "Shift": pynkeyboard.Key.shift, "Alt": pynkeyboard.Key.alt, "Tab": pynkeyboard.Key.tab, "CapsLock": pynkeyboard.Key.caps_lock}
        self.rf_key = key_map.get(self.rf_key_name, self.rf_key_name.lower())

    def _prompt_for_tracking_key(self):
        self.awaiting_tracking_key = True
        self.status_lbl.config(text="SETUP: Press any key to set as tracking key...", fg="#ffff00")

    def _set_tracking_key(self, key):
        if not self.awaiting_tracking_key: return
        self.awaiting_tracking_key = False
        self.tracking_key = key

        if hasattr(key, 'name'):
            self.tracking_key_name = key.name.capitalize()
        elif hasattr(key, 'char') and key.char:
            self.tracking_key_name = key.char.upper()
        else:
            self.tracking_key_name = str(key)

        self._save_config()
        self.status_lbl.config(text=f"CALIBRATE  |  Tracking key set to: {self.tracking_key_name}  |  Ctrl+L = lock", fg="#00ff00")
        self.root.after(2000, lambda: self.status_lbl.config(text="CALIBRATE  |  T=OCR region  |  Ctrl+L = lock    Ctrl+P = quit", fg="#555"))

    def _load_images(self, normal_path, tracking_path=None):
        if not PIL_OK: return
        self.image_path = normal_path
        self.tracking_image_path = tracking_path
        
        img = Image.open(normal_path).convert("RGBA")
        self.img_w, self.img_h = img.size
        bg = Image.new("RGBA", img.size, (0, 0, 1, 255))
        composed = Image.alpha_composite(bg, img).convert("RGB")
        self.img_normal = ImageTk.PhotoImage(composed)

        if tracking_path and os.path.exists(tracking_path):
            tracking_img = Image.open(tracking_path).convert("RGBA")
            if tracking_img.size != (self.img_w, self.img_h):
                tracking_img = tracking_img.resize((self.img_w, self.img_h), Image.Resampling.LANCZOS)
            bg_tracking = Image.new("RGBA", tracking_img.size, (0, 0, 1, 255))
            self.img_tracking = ImageTk.PhotoImage(Image.alpha_composite(bg_tracking, tracking_img).convert("RGB"))
        else:
            self.img_tracking = self.img_normal

        bar_h = 28
        self.root.geometry(f"{self.img_w}x{self.img_h + bar_h}")
        self.canvas.config(width=self.img_w, height=self.img_h)
        if self.img_id: self.canvas.delete(self.img_id)
        self.img_id = self.canvas.create_image(0, 0, anchor=tk.NW, image=self.img_normal)
        self._draw_boundary_box()

    def _draw_placeholder(self):
        self.img_w, self.img_h = 400, 400
        self.root.geometry("400x428")
        self.canvas.config(width=400, height=400)
        cx, cy = 200, 200
        r = 80
        self.canvas.create_oval(cx-r, cy-r, cx+r, cy+r, outline="#1d9e75", width=1)
        self.canvas.create_text(cx, cy + r + 24, text="No image — press O to open", fill="#444", font=("Courier", 10))

    def _open_image(self):
        self.root.overrideredirect(False)
        path = filedialog.askopenfilename(title="Open overlay image", filetypes=[("Images", "*.png *.bmp *.jpg *.tga"), ("All", "*.*")])
        self.root.overrideredirect(True)
        self.root.attributes("-topmost", True)
        if path:
            self.root.overrideredirect(False)
            tracking_path = filedialog.askopenfilename(title="Open tracking image (optional, cancel to use same)", filetypes=[("Images", "*.png *.bmp *.jpg *.tga"), ("All", "*.*")])
            self.root.overrideredirect(True)
            self.root.attributes("-topmost", True)
            self._load_images(path, tracking_path if tracking_path else None)

    def _apply_geometry(self):
        try:
            import ctypes
            if self.hwnd is None:
                self.hwnd = ctypes.windll.user32.FindWindowW(None, "SACLOS Overlay")
            
            if self.hwnd:
                flags = 0x4015
                res = ctypes.windll.user32.SetWindowPos(self.hwnd, 0, int(self.win_x), int(self.win_y), 0, 0, flags)
                if res == 0: self.hwnd = None
                return
        except Exception:
            self.hwnd = None
        self.root.geometry(f"+{int(self.win_x)}+{int(self.win_y)}")

    def _process_position_queue(self):
        if not self.tracking_active:
            self.update_timer_id = None
            return

        has_update = False
        with self.position_lock:
            if self.position_queue:
                self.win_x, self.win_y = self.position_queue.pop()
                has_update = True

        if has_update:
            self._apply_geometry()
            if self.hud_visible and self.hud_status in ("predict", "intercept"):
                self._position_designators()

        self.update_timer_id = self.root.after(1, self._process_position_queue)

    def _drag_start(self, event):
        if self.state == "calibrate":
            self._ox = event.x_root - self.win_x
            self._oy = event.y_root - self.win_y
        elif self.state == "adjust_bounds":
            self._check_corner_drag_start(event)

    def _drag_move(self, event):
        if self.state == "calibrate":
            self.win_x = event.x_root - self._ox
            self.win_y = event.y_root - self._oy
            self._apply_geometry()
            self._draw_boundary_box()
        elif self.state == "adjust_bounds":
            if self.dragging_corner is not None:
                self._resize_bounds(event)
            elif self.dragging_center:
                dx = event.x_root - self.drag_start_x
                dy = event.y_root - self.drag_start_y
                self.origin_x = self.drag_start_origin_x + dx
                self.origin_y = self.drag_start_origin_y + dy
                self._draw_boundary_box()

    def _drag_end(self, event):
        self.dragging_corner = None
        self.dragging_center = False

    def _check_corner_drag_start(self, event):
        if self.origin_x is not None:
            cx = self.origin_x - self.win_x
            cy = self.origin_y - self.win_y
        else:
            cx = self.img_w / 2
            cy = self.img_h / 2

        handle_size = 8
        corners = {"nw": (cx - self.margin_x, cy - self.margin_y), "ne": (cx + self.margin_x, cy - self.margin_y),
                   "sw": (cx - self.margin_x, cy + self.margin_y), "se": (cx + self.margin_x, cy + self.margin_y)}

        for corner_id, (cx_h, cy_h) in corners.items():
            if abs(event.x - cx_h) <= handle_size and abs(event.y - cy_h) <= handle_size:
                self.dragging_corner = corner_id
                self.drag_start_x = event.x
                self.drag_start_y = event.y
                return

        x1 = cx - self.margin_x
        y1 = cy - self.margin_y
        x2 = cx + self.margin_x
        y2 = cy + self.margin_y

        if x1 <= event.x <= x2 and y1 <= event.y <= y2:
            self.dragging_center = True
            self.drag_start_x = event.x_root
            self.drag_start_y = event.y_root
            self.drag_start_origin_x = self.origin_x
            self.drag_start_origin_y = self.origin_y

    def _resize_bounds(self, event):
        if not self.dragging_corner: return
        cx = self.origin_x - self.win_x if self.origin_x is not None else self.img_w / 2
        cy = self.origin_y - self.win_y if self.origin_y is not None else self.img_h / 2
        self.margin_x = max(50, abs(event.x - cx))
        self.margin_y = max(50, abs(event.y - cy))
        self._draw_boundary_box()

    def _draw_boundary_box(self):
        if self.state == "locked": return

        if self.boundary_box_id: self.canvas.delete(self.boundary_box_id)
        for handle in self.corner_handles: self.canvas.delete(handle)
        self.corner_handles.clear()

        if self.state == "adjust_bounds" and self.origin_x is not None:
            cx = self.origin_x - self.win_x
            cy = self.origin_y - self.win_y
        else:
            cx = self.img_w / 2
            cy = self.img_h / 2

        x1, y1 = cx - self.margin_x, cy - self.margin_y
        x2, y2 = cx + self.margin_x, cy + self.margin_y

        if self.state == "calibrate":
            self.boundary_box_id = self.canvas.create_rectangle(x1, y1, x2, y2, outline="#00ff00", width=2, dash=(5, 3))
        elif self.state == "adjust_bounds":
            self.boundary_box_id = self.canvas.create_rectangle(x1, y1, x2, y2, outline="#ff9900", width=2)
            crosshair_size = 10
            self.corner_handles.extend([
                self.canvas.create_line(cx - crosshair_size, cy, cx + crosshair_size, cy, fill="#ff9900", width=1),
                self.canvas.create_line(cx, cy - crosshair_size, cx, cy + crosshair_size, fill="#ff9900", width=1)
            ])
            handle_size = 8
            for cx_h, cy_h, corner_id in [(x1, y1, "nw"), (x2, y1, "ne"), (x1, y2, "sw"), (x2, y2, "se")]:
                self.corner_handles.append(self.canvas.create_rectangle(cx_h - handle_size, cy_h - handle_size, cx_h + handle_size, cy_h + handle_size, fill="#ff9900", outline="#ffffff", width=1, tags=corner_id))

    def _toggle_lock(self):
        # Debounce: both Tkinter binding and pynput listener fire on Ctrl+L,
        # causing a double state transition (calibrate→adjust→locked instantly).
        now = time.perf_counter()
        if now - getattr(self, '_last_toggle_time', 0) < 0.3:
            return
        self._last_toggle_time = now

        if self.state == "calibrate":
            self._enter_adjust_bounds()
        elif self.state == "adjust_bounds":
            self._enter_locked()
        else:
            self._exit_to_calibrate()

    def _enter_adjust_bounds(self):
        self.state = "adjust_bounds"
        self.origin_x = self.win_x + self.img_w / 2
        self.origin_y = self.win_y + self.img_h / 2
        self.root.geometry(f"{self.img_w}x{self.img_h + 28}")
        self.status_lbl.config(text="ADJUST BOUNDS  |  Drag corners=resize  |  T=OCR region  |  Ctrl+L=confirm", fg="#ff9900")
        if not self.bar.winfo_ismapped(): self.bar.pack(side=tk.BOTTOM, fill=tk.X)
        self._draw_boundary_box()
        if self.ocr_region and TESSERACT_OK:
            self._show_ocr_setup()
        self._show_hud_setup()

    def _enter_locked(self):
        if not PYNPUT_OK:
            messagebox.showerror("Missing dependency", "Install pynput:\n  pip install pynput")
            return
        self.state = "locked"
        self.calibrated_x = self.win_x
        self.calibrated_y = self.win_y
        self.tracking_active = False
        self._capture_hud_positions()
        self._save_config()

        if self.boundary_box_id: self.canvas.delete(self.boundary_box_id)
        for h in self.corner_handles: self.canvas.delete(h)
        self.corner_handles.clear()

        self.bar.pack_forget()
        self.root.geometry(f"{self.img_w}x{self.img_h}")
        self._set_clickthrough(True)

        if getattr(self, "ocr_setup_visible", False): self._hide_ocr_setup()
        if self.ocr_enabled and getattr(self, "ocr_region", None) and TESSERACT_OK:
            self._start_ocr_thread()
            self._start_ocr_update_timer()

        self._show_hud_locked()

    def _start_tracking(self):
        if self.state != "locked" or self.tracking_active: return
        if self.mouse_listener is not None: return

        self._reset_to_calibrated_position()
        self.tracking_active = True
        self.bar.pack_forget()

        if self.img_tracking and self.img_id:
            self.canvas.itemconfig(self.img_id, image=self.img_tracking)

        self.mouse_start_x, self.mouse_start_y = None, None
        self.win_start_x, self.win_start_y = None, None

        with self.position_lock: self.position_queue.clear()

        try:
            import ctypes
            if self.hwnd is None: self.hwnd = ctypes.windll.user32.FindWindowW(None, "SACLOS Overlay")
            if self.hwnd: ctypes.windll.user32.SetWindowPos(self.hwnd, 0, 0, 0, self.img_w, self.img_h, 0x0002 | 0x0004 | 0x0010)
        except Exception:
            self.root.geometry(f"{self.img_w}x{self.img_h}")

        self.mouse_listener = pynmouse.Listener(on_move=self._on_mouse_move)
        self.mouse_listener.start()

        if self.update_timer_id is None:
            self.update_timer_id = self.root.after(1, self._process_position_queue)

        self._update_hud_status("predict")

    def _stop_tracking(self):
        """Common tracking teardown. Subclasses override and call super()."""
        if self.state != "locked" or not self.tracking_active:
            return
        self.tracking_active = False

        # Stop update timer
        if self.update_timer_id is not None:
            self.root.after_cancel(self.update_timer_id)
            self.update_timer_id = None

        # Stop mouse listener
        if self.mouse_listener:
            self.mouse_listener.stop()
            try:
                self.mouse_listener.join(timeout=0.5)
            except Exception:
                pass
            self.mouse_listener = None

        # Clear position queue
        with self.position_lock:
            self.position_queue.clear()

        # Capture accurate final position from listener thread
        final_x = self.tracking_win_x if self.tracking_win_x is not None else self.win_x
        final_y = self.tracking_win_y if self.tracking_win_y is not None else self.win_y
        self.win_x = final_x
        self.win_y = final_y

        # Reset tracking state
        self.tracking_win_x = None
        self.tracking_win_y = None
        self.last_update_time = 0
        self.mouse_start_x = None
        self.mouse_start_y = None
        self.win_start_x = None
        self.win_start_y = None

        # Swap back to normal image
        if self.img_normal and self.img_id:
            self.canvas.itemconfig(self.img_id, image=self.img_normal)

        self._update_hud_status("idle")

    def _reset_to_calibrated_position(self):
        self.win_x = self.calibrated_x
        self.win_y = self.calibrated_y
        self._apply_geometry()

    def _exit_to_calibrate(self):
        if self.rf_visible: self._hide_rangefinder()
        self._stop_ocr_thread()
        if self.ocr_update_timer is not None:
            self.root.after_cancel(self.ocr_update_timer)
            self.ocr_update_timer = None
        self._hide_ocr_display()

        self._hide_hud()

        self.state = "calibrate"
        self.tracking_active = False

        if self.update_timer_id is not None:
            self.root.after_cancel(self.update_timer_id)
            self.update_timer_id = None

        if self.mouse_listener:
            self.mouse_listener.stop()
            self.mouse_listener = None

        with self.position_lock: self.position_queue.clear()
        self.tracking_win_x, self.tracking_win_y = None, None

        self._set_clickthrough(False)
        self.root.geometry(f"{self.img_w}x{self.img_h + 28}")
        self.bar.pack(side=tk.BOTTOM, fill=tk.X)
        self.status_lbl.config(text="CALIBRATE  |  T=OCR region  |  Ctrl+L = lock    Ctrl+P = quit", fg="#555")
        self._draw_boundary_box()

    def _on_mouse_move(self, x, y):
        if self.mouse_start_x is None:
            self.mouse_start_x, self.mouse_start_y = x, y
            self.win_start_x, self.win_start_y = self.win_x, self.win_y
            self.tracking_win_x, self.tracking_win_y = self.win_x, self.win_y
            return

        new_x = self.win_start_x - (x - self.mouse_start_x)
        new_y = self.win_start_y - (y - self.mouse_start_y)
        self.tracking_win_x, self.tracking_win_y = new_x, new_y

        t = time.perf_counter()
        if t - self.last_update_time < 0.001: return
        self.last_update_time = t

        with self.position_lock:
            self.position_queue.clear()
            self.position_queue.append((new_x, new_y))

    def _start_kbd_listener(self):
        if not PYNPUT_OK: return
        self.ctrl_pressed = False

        def on_press(key):
            try:
                if self._catch_kbd_press(key): return

                char = getattr(key, 'char', None) or getattr(key, 'name', None)

                is_rf_key = False
                if self.rf_key is not None:
                    is_rf_key = (str(char).lower() == str(self.rf_key).lower()) if isinstance(self.rf_key, str) else (key == self.rf_key)
                elif char and char.lower() == self.rf_key_name.lower():
                    is_rf_key = True

                if is_rf_key and self.state == "locked" and not self.tracking_active and not self.ctrl_pressed:
                    self.root.after(0, self._show_rangefinder)

                if char and char.lower() == 't' and not self.ctrl_pressed:
                    if self.state in ("calibrate", "adjust_bounds"):
                        self.root.after(0, self._toggle_ocr_setup)

                if key in (pynkeyboard.Key.ctrl_l, pynkeyboard.Key.ctrl_r, pynkeyboard.Key.ctrl):
                    self.ctrl_pressed = True
                
                if self.ctrl_pressed:
                    if char and char.lower() == 'l': self.root.after(0, self._toggle_lock)
                    elif char and char.lower() == 'o': self.root.after(0, self._open_image) if self.state != "locked" else None
                    elif char and char.lower() == 'p': self.root.after(0, self._quit)

            except Exception as e:
                pass

        def on_release(key):
            try:
                if key in (pynkeyboard.Key.ctrl_l, pynkeyboard.Key.ctrl_r, pynkeyboard.Key.ctrl):
                    self.ctrl_pressed = False

                if self._catch_kbd_release(key): return

                if self.rf_visible:
                    is_rf_release = False
                    if self.rf_key is not None:
                        is_rf_release = (str(getattr(key, 'char', None)).lower() == str(self.rf_key).lower()) if isinstance(self.rf_key, str) else (key == self.rf_key)
                    else:
                        is_rf_release = getattr(key, 'char', None) == self.rf_key_name.lower() or getattr(key, 'name', None) == self.rf_key_name.lower()
                    if is_rf_release: self.root.after(0, self._hide_rangefinder)

            except Exception as e:
                pass

        self.kbd_listener = pynkeyboard.Listener(on_press=on_press, on_release=on_release)
        self.kbd_listener.start()

    def _catch_kbd_press(self, key):
        """Override in subclasses to intercept keystrokes."""
        if self.awaiting_tracking_key:
            self.root.after(0, lambda k=key: self._set_tracking_key(k))
            return True

        if self.tracking_key is not None:
            char = getattr(key, 'char', None)
            is_tracking = (char and char.lower() == self.tracking_key.lower()) if isinstance(self.tracking_key, str) else (key == self.tracking_key)
            if is_tracking:
                if self.state == "locked" and not self.tracking_active:
                    self.root.after(0, self._start_tracking)
                return True

        return False

    def _catch_kbd_release(self, key):
        """Override in subclasses to intercept keystrokes."""
        if self.tracking_key is not None:
            char = getattr(key, 'char', None)
            is_tracking = (char and char.lower() == self.tracking_key.lower()) if isinstance(self.tracking_key, str) else (key == self.tracking_key)
            if is_tracking:
                if self.state == "locked" and self.tracking_active:
                    self.root.after(0, self._stop_tracking)
                return True
        return False

    def _set_clickthrough(self, enable):
        try:
            import ctypes
            hwnd = ctypes.windll.user32.FindWindowW(None, "SACLOS Overlay")
            if hwnd: set_window_clickthrough(hwnd, enable)
        except Exception:
            pass

    def _start_ocr_thread(self):
        if self.ocr_thread and self.ocr_thread.is_alive(): return
        self.ocr_stop_event = threading.Event()
        self.ocr_thread = threading.Thread(target=self._ocr_thread_func, daemon=True)
        self.ocr_thread.start()

    def _stop_ocr_thread(self):
        if self.ocr_thread:
            self.ocr_stop_event.set()
            self.ocr_thread.join(timeout=1.0)
            self.ocr_thread = None

    def _ocr_thread_func(self):
        interval_s = self.ocr_poll_interval_ms / 1000.0
        while not self.ocr_stop_event.is_set():
            if not self.ocr_paused:
                val = ocr_capture_range(self.ocr_region)
                if val is not None:
                    with self.position_lock:
                        self.ocr_pending_range = val
                        self.ocr_last_range = val
            self.ocr_stop_event.wait(timeout=interval_s)

    def _start_ocr_update_timer(self):
        self._process_ocr_updates()

    def _process_ocr_updates(self):
        if self.state != "locked":
            self.ocr_update_timer = None
            return

        new_range = None
        with self.position_lock:
            if self.ocr_pending_range is not None:
                new_range = self.ocr_pending_range
                self.ocr_pending_range = None

        if new_range is not None:
            if self.manual_range_override:
                self.manual_range_override = False
            if abs(new_range - self.target_range_m) > 0.5:
                self.target_range_m = new_range
                self._update_hud_range_text(new_range)

        self.ocr_update_timer = self.root.after(200, self._process_ocr_updates)

    def _quit(self):
        self._save_config()
        if self.update_timer_id is not None:
            self.root.after_cancel(self.update_timer_id)
        if self.mouse_listener:
            self.mouse_listener.stop()
        if self.kbd_listener:
            self.kbd_listener.stop()
        if getattr(self, "rf_mouse_listener", None):
            self.rf_mouse_listener.stop()
        if getattr(self, "rf_update_timer", None):
            self.root.after_cancel(self.rf_update_timer)
        if hasattr(self, 'rf_win'):
            self.rf_win.destroy()

        self._stop_ocr_thread()
        if getattr(self, "ocr_update_timer", None) is not None:
            self.root.after_cancel(self.ocr_update_timer)
        if hasattr(self, 'ocr_setup_win') and self.ocr_setup_win:
            self.ocr_setup_win.destroy()
        if hasattr(self, 'ocr_display_win') and self.ocr_display_win:
            self.ocr_display_win.destroy()

        self._cleanup_hud()

        try:
            from utils.hardware_inject import disable_hires_timer
            disable_hires_timer()
        except Exception:
            pass

        self.root.destroy()
