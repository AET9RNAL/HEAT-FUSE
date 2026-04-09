import tkinter as tk
try:
    from pynput import mouse as pynmouse
    PYNPUT_OK = True
except ImportError:
    PYNPUT_OK = False
from utils.ocr_reader import reset_ocr_filter

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
        self.RF_RANGE_MIN = 20.0
        self.RF_RANGE_MAX = 900.0
        self.RF_COLOR = "#84FFB1"

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
        cx = w // 2

        # Beveled bracket geometry (matches rangeFinder.svg)
        gap_l, gap_r = 30, 50          # center gap
        arm_l, arm_r = 18, 62          # horizontal arm ends
        edge_l, edge_r = 4, 76         # outer vertical edges
        bv = 7                          # bevel segment size
        y_top, y_bot = 2, self.RF_HEIGHT - 2
        bv_top = y_top + 2 * bv         # 16
        bv_bot = y_bot - 2 * bv         # 284

        # Right bracket ]
        c.create_line(
            gap_r, y_top, arm_r, y_top,
            arm_r + bv, y_top + bv, edge_r, bv_top,
            edge_r, bv_bot,
            edge_r - bv, y_bot - bv, arm_r, y_bot,
            gap_r, y_bot,
            fill=color, width=3, joinstyle='bevel'
        )

        # Left bracket [
        c.create_line(
            gap_l, y_top, arm_l, y_top,
            arm_l - bv, y_top + bv, edge_l, bv_top,
            edge_l, bv_bot,
            edge_l + bv, y_bot - bv, arm_l, y_bot,
            gap_l, y_bot,
            fill=color, width=3, joinstyle='bevel'
        )

        # Range text
        c.create_text(cx, 15, text=f"{int(self.target_range_m)}m",
                      fill="#ffffff", font=("Courier", 11, "bold"), anchor=tk.CENTER,
                      tags="rf_text")

        # Scale ticks along bracket edges
        notch_step = 55  # 16 steps of 55m = 880m = RF_RANGE_MAX - RF_RANGE_MIN
        notch_count = round((self.RF_RANGE_MAX - self.RF_RANGE_MIN) / notch_step)
        for i in range(notch_count + 1):
            range_val = self.RF_RANGE_MIN + i * notch_step
            y = self._range_to_canvas_y(range_val)
            if i % 4 == 0:  # Long: 20, 240, 460, 680, 900m
                c.create_line(edge_l, y, edge_l + 10, y, fill=color, width=2)
                c.create_line(edge_r - 10, y, edge_r, y, fill=color, width=2)
            else:
                c.create_line(edge_l, y, edge_l + 5, y, fill=color, width=1)
                c.create_line(edge_r - 5, y, edge_r, y, fill=color, width=1)

        # Range notch indicator
        notch_y = self._range_to_canvas_y(self.target_range_m)
        c.create_line(15, notch_y, 28, notch_y, fill=color, width=3, tags="rf_notch")
        c.create_line(52, notch_y, 65, notch_y, fill=color, width=3, tags="rf_notch")

    def _update_rangefinder_notch(self):
        c = self.rf_canvas
        c.delete("rf_notch")
        c.delete("rf_text")

        c.create_text(self.RF_WIDTH // 2, 15,
                      text=f"{int(self.target_range_m)}m",
                      fill="#ffffff", font=("Courier", 11, "bold"),
                      anchor=tk.CENTER, tags="rf_text")

        notch_y = self._range_to_canvas_y(self.target_range_m)
        c.create_line(15, notch_y, 28, notch_y, fill=self.RF_COLOR, width=3, tags="rf_notch")
        c.create_line(52, notch_y, 65, notch_y, fill=self.RF_COLOR, width=3, tags="rf_notch")

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
        self.manual_range_override = True
        reset_ocr_filter()

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
            self._update_hud_range_text(new_range)

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
