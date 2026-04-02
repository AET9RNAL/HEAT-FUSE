import tkinter as tk
try:
    from pynput import mouse as pynmouse
    PYNPUT_OK = True
except ImportError:
    PYNPUT_OK = False

class RangefinderUiMixin:
    """Mixin for the SACLOS Rangefinder UI component."""

    def _init_rangefinder(self):
        # Range finder state
        self.rf_key = None          # pynput key object
        self.rf_key_name = "r"      # Default: R
        self.rf_visible = False
        self.rf_pending_range = None
        self.rf_mouse_listener = None
        self.rf_update_timer = None
        self.rf_mouse_y_anchor = None
        self.rf_range_anchor = None
        self.rf_hwnd = None

        # Constants
        self.RF_WIDTH = 80
        self.RF_HEIGHT = 300
        self.RF_SCALE_TOP = 30      # 600m
        self.RF_SCALE_BOTTOM = 280  # 70m
        self.RF_RANGE_MIN = 70.0
        self.RF_RANGE_MAX = 600.0
        self.RF_COLOR = "#77ffaa"

        self._create_rangefinder_window()

    def _create_rangefinder_window(self):
        self.rf_win = tk.Toplevel(self.root)
        self.rf_win.title("SACLOS RangeFinder")
        self.rf_win.overrideredirect(True)
        self.rf_win.attributes("-topmost", True)
        self.rf_win.attributes("-transparentcolor", "#000001")
        self.rf_win.configure(bg="#000001")
        self.rf_win.geometry(f"{self.RF_WIDTH}x{self.RF_HEIGHT}")
        self.rf_win.withdraw()

        self.rf_canvas = tk.Canvas(
            self.rf_win, width=self.RF_WIDTH, height=self.RF_HEIGHT,
            bg="#000001", highlightthickness=0
        )
        self.rf_canvas.pack()

    def _range_to_canvas_y(self, range_m):
        range_m = max(self.RF_RANGE_MIN, min(range_m, self.RF_RANGE_MAX))
        fraction = (self.RF_RANGE_MAX - range_m) / (self.RF_RANGE_MAX - self.RF_RANGE_MIN)
        return self.RF_SCALE_TOP + fraction * (self.RF_SCALE_BOTTOM - self.RF_SCALE_TOP)

    def _draw_rangefinder(self):
        c = self.rf_canvas
        c.delete("all")

        color = self.RF_COLOR
        w = self.RF_WIDTH
        top = self.RF_SCALE_TOP
        bot = self.RF_SCALE_BOTTOM

        c.create_text(w // 2, 15, text=f"{int(self.target_range_m)}m",
                      fill="#ffffff", font=("Courier", 11, "bold"), anchor=tk.CENTER,
                      tags="rf_text")

        arm = 20
        ox1, oy1, ox2, oy2 = 5, top, w - 5, bot
        for line in [
            (ox1, oy1, ox1 + arm, oy1), (ox1, oy1, ox1, oy1 + arm),
            (ox2 - arm, oy1, ox2, oy1), (ox2, oy1, ox2, oy1 + arm),
            (ox1, oy2 - arm, ox1, oy2), (ox1, oy2, ox1 + arm, oy2),
            (ox2, oy2 - arm, ox2, oy2), (ox2 - arm, oy2, ox2, oy2)
        ]:
            c.create_line(*line, fill=color, width=2)

        for range_val in range(int(self.RF_RANGE_MIN), int(self.RF_RANGE_MAX) + 1, 50):
            y = self._range_to_canvas_y(range_val)
            if range_val in (70, 300, 600):
                c.create_line(0, y, 12, y, fill=color, width=2)
            else:
                c.create_line(3, y, 8, y, fill=color, width=1)

        notch_y = self._range_to_canvas_y(self.target_range_m)
        c.create_line(22, notch_y, 33, notch_y, fill=color, width=3, tags="rf_notch")
        c.create_line(47, notch_y, 58, notch_y, fill=color, width=3, tags="rf_notch")

    def _update_rangefinder_notch(self):
        c = self.rf_canvas
        c.delete("rf_notch")
        c.delete("rf_text")

        c.create_text(self.RF_WIDTH // 2, 15,
                      text=f"{int(self.target_range_m)}m",
                      fill="#ffffff", font=("Courier", 11, "bold"),
                      anchor=tk.CENTER, tags="rf_text")

        notch_y = self._range_to_canvas_y(self.target_range_m)
        c.create_line(22, notch_y, 33, notch_y, fill=self.RF_COLOR, width=3, tags="rf_notch")
        c.create_line(47, notch_y, 58, notch_y, fill=self.RF_COLOR, width=3, tags="rf_notch")

    def _show_rangefinder(self):
        if self.rf_visible or self.tracking_active:
            return

        self.rf_visible = True
        self.ocr_paused = True  # Pause OCR while modifying

        if self.calibrated_x is not None:
            overlay_cx = self.calibrated_x + self.img_w / 2
            overlay_cy = self.calibrated_y + self.img_h / 2
        else:
            overlay_cx = self.win_x + self.img_w / 2
            overlay_cy = self.win_y + self.img_h / 2

        rf_x = int(overlay_cx - self.RF_WIDTH / 2)
        rf_y = int(overlay_cy - self.RF_HEIGHT / 2)

        self.rf_win.geometry(f"{self.RF_WIDTH}x{self.RF_HEIGHT}+{rf_x}+{rf_y}")
        self._draw_rangefinder()
        self.rf_win.deiconify()
        self.rf_win.attributes("-topmost", True)
        self.rf_win.after(50, lambda: self._set_rf_clickthrough(True))

        self.rf_mouse_y_anchor = None
        self.rf_range_anchor = self.target_range_m

        if PYNPUT_OK:
            self.rf_mouse_listener = pynmouse.Listener(on_move=self._on_rf_mouse_move)
            self.rf_mouse_listener.start()

        self.rf_update_timer = self.root.after(16, self._process_rf_updates)

    def _hide_rangefinder(self):
        if not self.rf_visible:
            return

        self.rf_visible = False
        self.ocr_paused = False

        if self.rf_mouse_listener:
            self.rf_mouse_listener.stop()
            try:
                self.rf_mouse_listener.join(timeout=0.5)
            except Exception:
                pass
            self.rf_mouse_listener = None

        if self.rf_update_timer:
            self.root.after_cancel(self.rf_update_timer)
            self.rf_update_timer = None

        self.rf_win.withdraw()
        self._save_config_partial()

    def _on_rf_mouse_move(self, x, y):
        if not self.rf_visible:
            return

        if self.rf_mouse_y_anchor is None:
            self.rf_mouse_y_anchor = y
            self.rf_range_anchor = self.target_range_m
            return

        dy = y - self.rf_mouse_y_anchor
        pixels_per_meter = (self.RF_SCALE_BOTTOM - self.RF_SCALE_TOP) / (self.RF_RANGE_MAX - self.RF_RANGE_MIN)
        range_delta = -dy / pixels_per_meter

        new_range = self.rf_range_anchor + range_delta
        new_range = max(self.RF_RANGE_MIN, min(new_range, self.RF_RANGE_MAX))

        with self.position_lock:
            self.rf_pending_range = new_range

    def _process_rf_updates(self):
        if not self.rf_visible:
            return

        new_range = None
        with self.position_lock:
            if self.rf_pending_range is not None:
                new_range = self.rf_pending_range
                self.rf_pending_range = None

        if new_range is not None and abs(new_range - self.target_range_m) > 0.5:
            self.target_range_m = new_range
            self._update_rangefinder_notch()

        self.rf_update_timer = self.root.after(16, self._process_rf_updates)

    def _set_rf_clickthrough(self, enable):
        try:
            from utils.window_utils import set_window_clickthrough
            import ctypes
            if self.rf_hwnd is None:
                self.rf_hwnd = ctypes.windll.user32.FindWindowW(None, "SACLOS RangeFinder")
            if self.rf_hwnd:
                set_window_clickthrough(self.rf_hwnd, enable)
        except Exception:
            pass
