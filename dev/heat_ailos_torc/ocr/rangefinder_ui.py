try:
    from pynput import mouse as pynmouse
    PYNPUT_OK = True
except ImportError:
    PYNPUT_OK = False

try:
    from PIL import Image, ImageDraw, ImageFont
    PIL_OK = True
except ImportError:
    PIL_OK = False

try:
    from fuse.utils.layered_window import LayeredWindow
    LAYERED_OK = True
except ImportError:
    LAYERED_OK = False

from heat_ailos_torc.ocr.range_ocr import reset_ocr_filter


def _rf_font(size=14):
    """Get rangefinder font from the bundled plugin assets."""
    import io
    from heat_ailos_torc import ASSETS_DIR as _AILOS_ASSETS_DIR
    try:
        font = ImageFont.truetype(
            io.BytesIO((_AILOS_ASSETS_DIR / "Montserrat-VariableFont_wght.ttf").read_bytes()),
            size,
        )
        try:
            font.set_variation_by_axes([600])  # Semi Bold
        except Exception:
            pass
        return font
    except Exception:
        return ImageFont.load_default()


class RangefinderUiMixin:
    """Mixin for the SACLOS Rangefinder UI component (Win32 LayeredWindow)."""

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

        # Constants
        self.RF_WIDTH = 80
        self.RF_HEIGHT = 300
        self.RF_SCALE_TOP = 30      # 600m
        self.RF_SCALE_BOTTOM = 280  # 70m
        self.RF_RANGE_MIN = 20.0
        self.RF_RANGE_MAX = 900.0
        self.RF_COLOR = (132, 255, 177, 255)  # #84FFB1 as RGBA
        self.RF_COLOR_HEX = "#84FFB1"

        self._create_rangefinder_window()

    def _create_rangefinder_window(self):
        if not (PIL_OK and LAYERED_OK):
            self.rf_win = None
            return
        self.rf_win = LayeredWindow("SACLOS RangeFinder", draggable=False)
        img = self._render_rangefinder()
        self.rf_win.create(img)

    def _range_to_canvas_y(self, range_m):
        range_m = max(self.RF_RANGE_MIN, min(range_m, self.RF_RANGE_MAX))
        fraction = (self.RF_RANGE_MAX - range_m) / (self.RF_RANGE_MAX - self.RF_RANGE_MIN)
        return self.RF_SCALE_TOP + fraction * (self.RF_SCALE_BOTTOM - self.RF_SCALE_TOP)

    def _render_rangefinder(self):
        """Render rangefinder to PIL RGBA image."""
        w = self.RF_WIDTH
        h = self.RF_HEIGHT
        img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        draw = ImageDraw.Draw(img)
        color = self.RF_COLOR

        # Beveled bracket geometry (matches rangeFinder.svg)
        gap_l, gap_r = 30, 50
        arm_l, arm_r = 18, 62
        edge_l, edge_r = 4, 76
        bv = 7
        y_top, y_bot = 2, h - 2
        bv_top = y_top + 2 * bv
        bv_bot = y_bot - 2 * bv

        # Right bracket ]
        right_pts = [
            (gap_r, y_top), (arm_r, y_top),
            (arm_r + bv, y_top + bv), (edge_r, bv_top),
            (edge_r, bv_bot),
            (edge_r - bv, y_bot - bv), (arm_r, y_bot),
            (gap_r, y_bot),
        ]
        draw.line(right_pts, fill=color, width=3, joint="curve")

        # Left bracket [
        left_pts = [
            (gap_l, y_top), (arm_l, y_top),
            (arm_l - bv, y_top + bv), (edge_l, bv_top),
            (edge_l, bv_bot),
            (edge_l + bv, y_bot - bv), (arm_l, y_bot),
            (gap_l, y_bot),
        ]
        draw.line(left_pts, fill=color, width=3, joint="curve")

        # Range text
        font = _rf_font(14)
        text = f"{int(self.target_range_m)}m"
        bbox = draw.textbbox((0, 0), text, font=font)
        tw = bbox[2] - bbox[0]
        tx = (w - tw) // 2
        draw.text((tx, 5), text, fill=(255, 255, 255, 255), font=font)

        # Scale ticks
        notch_step = 55
        notch_count = round((self.RF_RANGE_MAX - self.RF_RANGE_MIN) / notch_step)
        for i in range(notch_count + 1):
            range_val = self.RF_RANGE_MIN + i * notch_step
            y = int(self._range_to_canvas_y(range_val))
            if i % 4 == 0:
                draw.line([(edge_l, y), (edge_l + 10, y)], fill=color, width=2)
                draw.line([(edge_r - 10, y), (edge_r, y)], fill=color, width=2)
            else:
                draw.line([(edge_l, y), (edge_l + 5, y)], fill=color, width=1)
                draw.line([(edge_r - 5, y), (edge_r, y)], fill=color, width=1)

        # Range notch indicator
        notch_y = int(self._range_to_canvas_y(self.target_range_m))
        draw.line([(15, notch_y), (28, notch_y)], fill=color, width=3)
        draw.line([(52, notch_y), (65, notch_y)], fill=color, width=3)

        return img

    def _draw_rangefinder(self):
        """Re-render and push rangefinder image."""
        if not self.rf_win or not self.rf_win.is_created:
            return
        img = self._render_rangefinder()
        self.rf_win.update_image(img)

    def _update_rangefinder_notch(self):
        """Re-render rangefinder with updated range."""
        self._draw_rangefinder()

    def _show_rangefinder(self):
        if not self.rf_win or self.rf_visible or self.tracking_active:
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

        self._draw_rangefinder()
        self.rf_win.move(rf_x, rf_y)
        self.rf_win.show()
        self.rf_win.set_click_through(True)

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

        if self.rf_win:
            self.rf_win.hide()
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
        """Set click-through on rangefinder window."""
        if self.rf_win:
            self.rf_win.set_click_through(enable)
