"""
HudUiMixin - HUD overlay system for SACLOS.

Uses Win32 LayeredWindow for true per-pixel alpha transparency.
No chroma-key, no grey borders, no drop shadows.

Provides configurable HUD elements:
  - Name overlay: Spinning logo + static image (predictor.png)
  - Descriptor overlay: Static image (interceptSystem.png)
  - Range overlay: Static image + dynamic text (PIL-rendered)
  - Status overlay: Static image + conditional status images
  - Designator overlay: Animated crosshair at target position
"""

import os
import math
import time
import tkinter as tk
from loguru import logger

try:
    from PIL import Image, ImageDraw, ImageFont
    PIL_OK = True
except ImportError:
    PIL_OK = False

try:
    from fuse.utils.layered_window import LayeredWindow
    from fuse.utils.panel import FusePanel, FusePanelGroup
    from fuse.utils.animation import AnimationLoop
    LAYERED_OK = True
except ImportError:
    LAYERED_OK = False

# Shared HUD font — loaded once
_HUD_FONT = None
_HUD_FONT_SMALL = None

def _get_hud_font(size=16):
    """Get a PIL TrueType font from the bundled plugin assets."""
    import io
    from heat_ailos_torc import ASSETS_DIR as _AILOS_ASSETS_DIR
    try:
        font = ImageFont.truetype(
            io.BytesIO((_AILOS_ASSETS_DIR / "Montserrat-VariableFont_wght.ttf").read_bytes()),
            size,
        )
        try:
            font.set_variation_by_axes([600])  # Semi Bold weight
        except Exception:
            pass
        return font
    except Exception:
        return ImageFont.load_default()


def _get_hud_fonts():
    """Initialize shared HUD fonts."""
    global _HUD_FONT, _HUD_FONT_SMALL
    if _HUD_FONT is None:
        _HUD_FONT = _get_hud_font(16)
        _HUD_FONT_SMALL = _get_hud_font(12)
    return _HUD_FONT, _HUD_FONT_SMALL


class HudUiMixin:
    """Mixin for HUD overlay windows (Win32 LayeredWindow)."""

    # HUD color matching game UI
    HUD_GREEN = "#77ffaa"
    HUD_BG = "#000001"  # Kept for QL HUD tkinter windows

    def _init_hud(self):
        """Initialize HUD state and windows."""
        # Asset paths (relative to assets directory)
        self.hud_assets_dir = "assets"
        self.hud_name_image = "predictor.png"
        self.hud_descriptor_image = "interceptSystem.png"
        self.hud_range_image = "range.png"
        self.hud_status_image = "status.png"
        self.hud_status_idle = "statusIdle.png"
        self.hud_status_predict = "statusPredict.png"
        self.hud_status_intercept = "statusIntercept.png"
        self.hud_designator_predict = "designatorPredict.png"
        self.hud_designator_intercept = "designatorIntercept.png"
        self.hud_logo_image = "logo.png"

        # Raw PIL RGBA images (no chroma-key needed)
        self.hud_img_name = None
        self.hud_img_descriptor = None
        self.hud_img_range = None
        self.hud_img_status = None
        self.hud_img_status_idle = None
        self.hud_img_status_predict = None
        self.hud_img_status_intercept = None
        self.hud_img_designator_predict = None
        self.hud_img_designator_intercept = None
        self.hud_img_logo_raw = None
        self.hud_logo_frames = []          # Pre-rendered RGBA rotation frames
        self.hud_logo_frame_index = 0
        self.hud_logo_anim_id = None

        # LayeredWindow handles (set by _create_hud_windows)
        self.hud_name_win = None
        self.hud_descriptor_win = None
        self.hud_range_win = None
        self.hud_status_win = None
        self.hud_designator_predict_win = None
        self.hud_designator_intercept_win = None

        # Panel group for the 4 draggable HUD windows
        self._hud_group: "FusePanelGroup | None" = None

        # State
        self.hud_status = "idle"  # idle, predict, intercept
        self.hud_visible = False
        self.hud_locked = False

        # Animation loops (created in _create_hud_windows)
        self._logo_anim: "AnimationLoop | None" = None
        self._designator_anim: "AnimationLoop | None" = None
        self._blink_anim: "AnimationLoop | None" = None

        self.hud_designator_anim_start = 0
        self.hud_predict_blink_visible = True

        # Default positions (screen coordinates)
        sw = self.root.winfo_screenwidth()
        sh = self.root.winfo_screenheight()
        self.hud_name_pos = [50, 50]
        self.hud_descriptor_pos = [sw - 250, 50]
        self.hud_range_pos = [sw - 250, sh // 2 - 50]
        self.hud_status_pos = [sw - 250, sh // 2 + 50]

        # Load images and create windows
        if PIL_OK and LAYERED_OK:
            _get_hud_fonts()
            self._load_hud_images()
            self._create_hud_windows()

    def _load_hud_images(self):
        """Load all HUD images as raw PIL RGBA — no chroma-key needed."""
        import io
        from heat_ailos_torc import ASSETS_DIR as _AILOS_ASSETS_DIR

        def load_png(name):
            asset = _AILOS_ASSETS_DIR / name
            if not asset.is_file():
                logger.warning(f"HUD image not found: {name}")
                return None
            try:
                return Image.open(io.BytesIO(asset.read_bytes())).convert("RGBA")
            except Exception as e:
                logger.warning(f"Could not load HUD image {name}: {e}")
                return None

        self.hud_img_name = load_png(self.hud_name_image)
        self.hud_img_descriptor = load_png(self.hud_descriptor_image)
        self.hud_img_range = load_png(self.hud_range_image)
        self.hud_img_status = load_png(self.hud_status_image)
        self.hud_img_status_idle = load_png(self.hud_status_idle)
        self.hud_img_status_predict = load_png(self.hud_status_predict)
        self.hud_img_status_intercept = load_png(self.hud_status_intercept)
        self.hud_img_designator_predict = load_png(self.hud_designator_predict)
        self.hud_img_designator_intercept = load_png(self.hud_designator_intercept)

        # Load logo raw RGBA for rotation animation
        logo_asset = _AILOS_ASSETS_DIR / self.hud_logo_image
        if logo_asset.is_file():
            try:
                self.hud_img_logo_raw = Image.open(io.BytesIO(logo_asset.read_bytes())).convert("RGBA")
                self._prerender_logo_frames()
            except Exception as e:
                logger.warning(f"Could not load logo: {e}")

    def _prerender_logo_frames(self):
        """Pre-render rotated logo frames as PIL RGBA for spin animation.
        Rotates around the center of mass of opaque pixels so the
        visual pivot matches the perceived center of the logo."""
        if not self.hud_img_logo_raw:
            return
        raw = self.hud_img_logo_raw

        # Calculate center of mass from alpha channel
        alpha = raw.split()[3]
        pixels = alpha.load()
        total_w = 0
        sum_x = 0.0
        sum_y = 0.0
        for y in range(raw.height):
            for x in range(raw.width):
                w = pixels[x, y]
                if w > 0:
                    total_w += w
                    sum_x += x * w
                    sum_y += y * w

        if total_w == 0:
            return

        com_x = sum_x / total_w
        com_y = sum_y / total_w

        # Canvas large enough so no corner clips after rotation
        corners = [(0, 0), (raw.width, 0), (0, raw.height), (raw.width, raw.height)]
        max_dist = max(math.sqrt((px - com_x) ** 2 + (py - com_y) ** 2) for px, py in corners)
        canvas_size = int(math.ceil(max_dist * 2)) + 2

        # Place image so center of mass sits at canvas center
        offset_x = int(canvas_size / 2 - com_x)
        offset_y = int(canvas_size / 2 - com_y)
        padded = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
        padded.paste(raw, (offset_x, offset_y))  # straight copy, no mask → preserves alpha

        self.hud_logo_frames = []
        for angle in range(0, 360, 10):
            rotated = padded.rotate(angle, resample=Image.Resampling.BICUBIC, expand=False)
            self.hud_logo_frames.append(rotated)

    # ── Compositing helpers ──────────────────────────────────────────

    @staticmethod
    def _paste_alpha(dst, src, xy):
        """Alpha-composite *src* onto *dst* at offset *xy*.
        Unlike Image.paste(src, xy, src), this does NOT square the alpha."""
        tmp = Image.new("RGBA", dst.size, (0, 0, 0, 0))
        tmp.paste(src, xy)                    # straight copy (no mask)
        return Image.alpha_composite(dst, tmp)

    def _compose_name_image(self, logo_frame_index=0):
        """Compose name window image: logo frame + spacer + name image."""
        parts = []
        if self.hud_logo_frames:
            parts.append(self.hud_logo_frames[logo_frame_index])
        if self.hud_img_name:
            parts.append(self.hud_img_name)
        if not parts:
            return self._make_text_image("H.E.A.T", (119, 255, 170, 255), 16)
        spacer_w = 4
        total_w = sum(p.width for p in parts) + spacer_w * (len(parts) - 1)
        max_h = max(p.height for p in parts)
        img = Image.new("RGBA", (total_w, max_h), (0, 0, 0, 0))
        x = 0
        for i, part in enumerate(parts):
            y_off = (max_h - part.height) // 2
            img = self._paste_alpha(img, part, (x, y_off))
            x += part.width + spacer_w
        return img

    def _compose_range_image(self, range_m=None):
        """Compose range window: range.png + text."""
        if range_m is None:
            range_m = getattr(self, 'target_range_m', 200.0)
        text = f"{int(range_m)} m"
        text_img = self._make_text_image(text, (119, 255, 170, 255), 16)
        if not self.hud_img_range:
            return text_img
        spacer_w = 8
        total_w = self.hud_img_range.width + spacer_w + text_img.width
        max_h = max(self.hud_img_range.height, text_img.height)
        img = Image.new("RGBA", (total_w, max_h), (0, 0, 0, 0))
        img = self._paste_alpha(img, self.hud_img_range, (0, (max_h - self.hud_img_range.height) // 2))
        img = self._paste_alpha(img, text_img, (self.hud_img_range.width + spacer_w, (max_h - text_img.height) // 2))
        return img

    def _compose_status_image(self, status=None):
        """Compose status window: status.png + statusXxx.png."""
        if status is None:
            status = self.hud_status
        status_map = {
            "idle": self.hud_img_status_idle,
            "predict": self.hud_img_status_predict,
            "intercept": self.hud_img_status_intercept,
        }
        status_img = status_map.get(status, self.hud_img_status_idle)
        if not self.hud_img_status and not status_img:
            text_map = {"idle": "IDLE", "predict": "PREDICT", "intercept": "INTERCEPT"}
            return self._make_text_image(f"STATUS: {text_map.get(status, 'IDLE')}", (119, 255, 170, 255), 14)
        parts = []
        if self.hud_img_status:
            parts.append(self.hud_img_status)
        if status_img:
            parts.append(status_img)
        if not parts:
            return self._make_text_image("STATUS", (119, 255, 170, 255), 14)
        spacer_w = 8
        total_w = sum(p.width for p in parts) + spacer_w * max(len(parts) - 1, 0)
        max_h = max(p.height for p in parts)
        img = Image.new("RGBA", (total_w, max_h), (0, 0, 0, 0))
        x = 0
        for i, part in enumerate(parts):
            y_off = (max_h - part.height) // 2
            img = self._paste_alpha(img, part, (x, y_off))
            x += part.width + spacer_w
        return img

    def _make_text_image(self, text, color_rgba, font_size=16):
        """Render text to a PIL RGBA image with transparent background."""
        font = _get_hud_font(font_size)
        # Measure text size
        dummy = Image.new("RGBA", (1, 1))
        draw = ImageDraw.Draw(dummy)
        bbox = draw.textbbox((0, 0), text, font=font)
        tw = bbox[2] - bbox[0] + 4
        th = bbox[3] - bbox[1] + 4
        img = Image.new("RGBA", (tw, th), (0, 0, 0, 0))
        draw = ImageDraw.Draw(img)
        draw.text((2, 2 - bbox[1]), text, fill=color_rgba, font=font)
        return img

    # ── Window creation ──────────────────────────────────────────────

    def _create_hud_windows(self):
        """Create all HUD window instances and wire up animation loops."""
        self._hud_group = FusePanelGroup()
        # Use fuse_config for position persistence when available (FUSE-mode).
        _cfg = getattr(self, "_fuse_config", None)

        # Name panel (logo + predictor.png)
        _name_p = FusePanel("SACLOS HUD Name", "hud_name_pos", _cfg,
                            default_x=self.hud_name_pos[0], default_y=self.hud_name_pos[1])
        _name_p.create(self._compose_name_image(0))
        self.hud_name_win = _name_p.win
        self._hud_group.add(_name_p)

        # Descriptor panel
        desc_img = self.hud_img_descriptor or self._make_text_image("INTERCEPT", (119, 255, 170, 255), 16)
        _desc_p = FusePanel("SACLOS HUD Descriptor", "hud_descriptor_pos", _cfg,
                            default_x=self.hud_descriptor_pos[0], default_y=self.hud_descriptor_pos[1])
        _desc_p.create(desc_img)
        self.hud_descriptor_win = _desc_p.win
        self._hud_group.add(_desc_p)

        # Range panel (image + text)
        _range_p = FusePanel("SACLOS HUD Range", "hud_range_pos", _cfg,
                             default_x=self.hud_range_pos[0], default_y=self.hud_range_pos[1])
        _range_p.create(self._compose_range_image())
        self.hud_range_win = _range_p.win
        self._hud_group.add(_range_p)

        # Status panel (image + status image)
        _status_p = FusePanel("SACLOS HUD Status", "hud_status_pos", _cfg,
                              default_x=self.hud_status_pos[0], default_y=self.hud_status_pos[1])
        _status_p.create(self._compose_status_image())
        self.hud_status_win = _status_p.win
        self._hud_group.add(_status_p)

        # Designator windows (not draggable — stay as raw LayeredWindow)
        pred_img = self.hud_img_designator_predict or self._make_text_image("+", (119, 255, 170, 255), 24)
        self.hud_designator_predict_win = LayeredWindow("SACLOS Designator Predict", draggable=False)
        self.hud_designator_predict_win.create(pred_img)

        int_img = self.hud_img_designator_intercept or self._make_text_image("▲", (0, 255, 0, 255), 24)
        self.hud_designator_intercept_win = LayeredWindow("SACLOS Designator Intercept", draggable=False)
        self.hud_designator_intercept_win.create(int_img)

        # Animation loops
        self._logo_anim = AnimationLoop(self.root, self._animate_logo, fps=30)
        self._designator_anim = AnimationLoop(self.root, self._animate_designator, fps=20)
        self._blink_anim = AnimationLoop(self.root, self._animate_predict_blink, fps=2)

    # ── _make_draggable kept for QL HUD tkinter windows ──────────────

    def _make_draggable(self, widget_or_window):
        """Make a tkinter widget or window draggable for HUD setup."""
        if isinstance(widget_or_window, tk.Toplevel):
            win = widget_or_window
            widget = widget_or_window

            def on_press(event):
                win._drag_ox = event.x_root - win.winfo_x()
                win._drag_oy = event.y_root - win.winfo_y()

            def on_drag(event):
                nx = event.x_root - win._drag_ox
                ny = event.y_root - win._drag_oy
                win.geometry(f"+{int(nx)}+{int(ny)}")

            widget.bind("<ButtonPress-1>", on_press)
            widget.bind("<B1-Motion>", on_drag)
        else:
            widget = widget_or_window
            win = widget.winfo_toplevel()

            def on_press(event):
                win._drag_ox = event.x_root - win.winfo_x()
                win._drag_oy = event.y_root - win.winfo_y()

            def on_drag(event):
                nx = event.x_root - win._drag_ox
                ny = event.y_root - win._drag_oy
                win.geometry(f"+{int(nx)}+{int(ny)}")

            widget.bind("<ButtonPress-1>", on_press)
            widget.bind("<B1-Motion>", on_drag)

    # ── Logo animation ───────────────────────────────────────────────

    def _start_logo_animation(self):
        if self.hud_logo_frames and self._logo_anim:
            self._logo_anim.start()

    def _stop_logo_animation(self):
        if self._logo_anim:
            self._logo_anim.stop()

    def _animate_logo(self):
        """Single logo frame — called by AnimationLoop at 30 fps."""
        if not self.hud_logo_frames or not self.hud_name_win:
            return
        self.hud_logo_frame_index = (self.hud_logo_frame_index + 1) % len(self.hud_logo_frames)
        name_img = self._compose_name_image(self.hud_logo_frame_index)
        self.hud_name_win.update_image(name_img)

    # ── Status image update ──────────────────────────────────────────

    def _update_status_image(self):
        """Recomposite and push the status window image."""
        if not self.hud_status_win or not self.hud_status_win.is_created:
            return
        status_img = self._compose_status_image()
        self.hud_status_win.update_image(status_img)

    # ── Show / hide ──────────────────────────────────────────────────

    def _show_hud_setup(self):
        """Show HUD windows in draggable setup mode."""
        self.hud_locked = False
        self._position_hud_windows()
        if self._hud_group:
            self._hud_group.enter_calibrate()
        self.hud_visible = True
        self._update_hud_range_text()
        self._update_status_image()
        self._start_logo_animation()

    def _show_hud_locked(self):
        """Show HUD windows in locked (click-through) mode."""
        self.hud_locked = True
        self._position_hud_windows()
        if self._hud_group:
            self._hud_group.enter_locked()
        self.hud_visible = True
        self._update_hud_range_text()
        self._update_status_image()
        self._start_logo_animation()

    def _hide_hud(self):
        """Hide all HUD windows and stop all animations."""
        self.hud_visible = False
        self.hud_locked = False
        self._stop_designator_animation()
        self._stop_predict_blink()
        self._stop_logo_animation()
        if self._hud_group:
            self._hud_group.hide_all()
        for win in [self.hud_designator_predict_win, self.hud_designator_intercept_win]:
            if win:
                win.hide()

    def _position_hud_windows(self):
        """Position HUD windows from saved config.
        Clamps positions to visible screen area."""
        sw = self.root.winfo_screenwidth()
        sh = self.root.winfo_screenheight()
        for win, pos in [(self.hud_name_win, self.hud_name_pos),
                         (self.hud_descriptor_win, self.hud_descriptor_pos),
                         (self.hud_range_win, self.hud_range_pos),
                         (self.hud_status_win, self.hud_status_pos)]:
            if win and pos and win.is_created:
                w, h = win.get_size()
                x = max(0, min(int(pos[0]), sw - w))
                y = max(0, min(int(pos[1]), sh - h))
                win.move(x, y)

    # ── Range text ───────────────────────────────────────────────────

    def _update_hud_range_text(self, range_m=None):
        """Recomposite and push the range window image with new text."""
        if not self.hud_range_win or not self.hud_range_win.is_created:
            return
        range_img = self._compose_range_image(range_m)
        self.hud_range_win.update_image(range_img)

    # ── Status updates ───────────────────────────────────────────────

    def _update_hud_status(self, status):
        """
        Update HUD status: idle, predict, intercept.

        - idle: No designator visible
        - predict: Show designatorPredict with fade animation
        - intercept: Show designatorIntercept (over predict)
        """
        if not self.hud_visible:
            return

        if status == self.hud_status:
            return

        prev_status = self.hud_status
        self.hud_status = status

        if prev_status == "predict":
            self._stop_predict_blink()

        self._update_status_image()

        # Handle designator visibility and animation
        if status == "idle":
            self._hide_designators()
        elif status == "predict":
            self._show_predict_designator()
            self._start_predict_blink()
        elif status == "intercept":
            self._show_intercept_designator()

    # ── Designators ──────────────────────────────────────────────────

    def _hide_designators(self):
        """Hide both designator windows."""
        self._stop_designator_animation()
        if self.hud_designator_predict_win:
            self.hud_designator_predict_win.hide()
        if self.hud_designator_intercept_win:
            self.hud_designator_intercept_win.hide()

    def _show_predict_designator(self):
        """Show predict designator with fade animation."""
        if not self.hud_designator_predict_win:
            return

        self._position_designators()

        if self.hud_designator_intercept_win:
            self.hud_designator_intercept_win.hide()

        self.hud_designator_predict_win.show()
        if self.hud_locked:
            self.hud_designator_predict_win.set_click_through(True)

        self._start_designator_animation()

    def _show_intercept_designator(self):
        """Show intercept designator (over predict)."""
        if not self.hud_designator_intercept_win:
            return

        self._position_designators()

        if self.hud_designator_predict_win:
            self.hud_designator_predict_win.show()
        if self.hud_designator_intercept_win:
            self.hud_designator_intercept_win.show()

        if self.hud_locked:
            if self.hud_designator_predict_win:
                self.hud_designator_predict_win.set_click_through(True)
            if self.hud_designator_intercept_win:
                self.hud_designator_intercept_win.set_click_through(True)

    def _position_designators(self):
        """Position designators at the current overlay center."""
        overlay_cx = self.win_x + self.img_w / 2
        overlay_cy = self.win_y + self.img_h / 2

        if self.hud_designator_predict_win and self.hud_designator_predict_win.is_created:
            pw, ph = self.hud_designator_predict_win.get_size()
            self.hud_designator_predict_win.move(int(overlay_cx - pw / 2), int(overlay_cy - ph / 2))

        if self.hud_designator_intercept_win and self.hud_designator_intercept_win.is_created:
            iw, ih = self.hud_designator_intercept_win.get_size()
            self.hud_designator_intercept_win.move(int(overlay_cx - iw / 2), int(overlay_cy - ih / 2))

    # ── Designator animation ─────────────────────────────────────────

    def _start_designator_animation(self):
        if self._designator_anim:
            self._designator_anim.stop()
        self.hud_designator_anim_start = 0
        if self._designator_anim:
            self._designator_anim.start()

    def _animate_designator(self):
        """Single designator fade frame — called by AnimationLoop at 20 fps."""
        if self.hud_designator_anim_start == 0:
            self.hud_designator_anim_start = time.perf_counter()
        elapsed = time.perf_counter() - self.hud_designator_anim_start
        alpha = 0.6 * (0.5 + 0.5 * math.sin(elapsed * 2.5)) + 0.2
        alpha = max(0.15, min(1.0, alpha))
        if self.hud_designator_predict_win:
            self.hud_designator_predict_win.set_alpha(int(alpha * 255))
        if self.hud_status != "predict" and self._designator_anim:
            self._designator_anim.stop()

    def _stop_designator_animation(self):
        if self._designator_anim:
            self._designator_anim.stop()
        if self.hud_designator_predict_win:
            self.hud_designator_predict_win.set_alpha(255)

    # ── Predict blink ────────────────────────────────────────────────

    def _start_predict_blink(self):
        if self._blink_anim:
            self._blink_anim.stop()
        self.hud_predict_blink_visible = True
        if self._blink_anim:
            self._blink_anim.start()

    def _stop_predict_blink(self):
        if self._blink_anim:
            self._blink_anim.stop()
        self._update_status_image()

    def _animate_predict_blink(self):
        """Single predict-blink frame — called by AnimationLoop at 2 fps."""
        if self.hud_status != "predict":
            if self._blink_anim:
                self._blink_anim.stop()
            self._update_status_image()
            return
        if not self.hud_status_win or not self.hud_status_win.is_created:
            return
        if self.hud_predict_blink_visible:
            self._update_status_image()
        else:
            if self.hud_img_status:
                blank_w = max(
                    (img.width for img in [self.hud_img_status_idle, self.hud_img_status_predict,
                                           self.hud_img_status_intercept] if img),
                    default=60)
                blank_h = max(
                    (img.height for img in [self.hud_img_status_idle, self.hud_img_status_predict,
                                            self.hud_img_status_intercept] if img),
                    default=20)
                spacer_w = 8
                total_w = self.hud_img_status.width + spacer_w + blank_w
                max_h = max(self.hud_img_status.height, blank_h)
                img = Image.new("RGBA", (total_w, max_h), (0, 0, 0, 0))
                img = self._paste_alpha(img, self.hud_img_status,
                          (0, (max_h - self.hud_img_status.height) // 2))
                self.hud_status_win.update_image(img)
            else:
                self.hud_status_win.set_alpha(30)
        self.hud_predict_blink_visible = not self.hud_predict_blink_visible

    # ── Click-through (kept for QL HUD tkinter windows) ──────────────

    def _set_hud_clickthrough(self, win, enable):
        """Set click-through for a HUD window (LayeredWindow or tkinter)."""
        if isinstance(win, LayeredWindow):
            win.set_click_through(enable)
        else:
            # Fallback for tkinter Toplevel (used by QL HUD)
            try:
                import ctypes
                from fuse.utils.window_utils import set_window_clickthrough
                hwnd = ctypes.windll.user32.FindWindowW(None, win.title())
                if hwnd:
                    set_window_clickthrough(hwnd, enable)
            except Exception:
                pass

    # ── Position capture / config ────────────────────────────────────

    def _capture_hud_positions(self):
        """Capture current HUD window positions from OS."""
        for win, attr in [(self.hud_name_win, 'hud_name_pos'),
                          (self.hud_descriptor_win, 'hud_descriptor_pos'),
                          (self.hud_range_win, 'hud_range_pos'),
                          (self.hud_status_win, 'hud_status_pos')]:
            if win and win.is_created and win.visible:
                setattr(self, attr, win.get_position())

    def _save_hud_config(self, config_dict):
        """Save HUD positions and asset paths to config."""
        config_dict.update({
            "hud_assets_dir": self.hud_assets_dir,
            "hud_name_image": self.hud_name_image,
            "hud_descriptor_image": self.hud_descriptor_image,
            "hud_range_image": self.hud_range_image,
            "hud_status_image": self.hud_status_image,
            "hud_status_idle": self.hud_status_idle,
            "hud_status_predict": self.hud_status_predict,
            "hud_status_intercept": self.hud_status_intercept,
            "hud_designator_predict": self.hud_designator_predict,
            "hud_designator_intercept": self.hud_designator_intercept,
            "hud_logo_image": self.hud_logo_image,
            "hud_name_pos": self.hud_name_pos,
            "hud_descriptor_pos": self.hud_descriptor_pos,
            "hud_range_pos": self.hud_range_pos,
            "hud_status_pos": self.hud_status_pos,
        })

    def _load_hud_config(self, config):
        """Load HUD positions and asset paths from config."""
        self.hud_assets_dir = config.get("hud_assets_dir", "assets")
        self.hud_name_image = config.get("hud_name_image", "predictor.png")
        self.hud_descriptor_image = config.get("hud_descriptor_image", "interceptSystem.png")
        self.hud_range_image = config.get("hud_range_image", "range.png")
        self.hud_status_image = config.get("hud_status_image", "status.png")
        self.hud_status_idle = config.get("hud_status_idle", "statusIdle.png")
        self.hud_status_predict = config.get("hud_status_predict", "statusPredict.png")
        self.hud_status_intercept = config.get("hud_status_intercept", "statusIntercept.png")
        self.hud_designator_predict = config.get("hud_designator_predict", "designatorPredict.png")
        self.hud_designator_intercept = config.get("hud_designator_intercept", "designatorIntercept.png")
        self.hud_logo_image = config.get("hud_logo_image", "logo.png")

        name_pos = config.get("hud_name_pos")
        descriptor_pos = config.get("hud_descriptor_pos")
        range_pos = config.get("hud_range_pos")
        status_pos = config.get("hud_status_pos")

        if name_pos:
            self.hud_name_pos = list(name_pos)
        if descriptor_pos:
            self.hud_descriptor_pos = list(descriptor_pos)
        if range_pos:
            self.hud_range_pos = list(range_pos)
        if status_pos:
            self.hud_status_pos = list(status_pos)

    def _cleanup_hud(self):
        """Stop animations and destroy all HUD windows."""
        self._stop_designator_animation()
        self._stop_predict_blink()
        self._stop_logo_animation()
        if self._hud_group:
            self._hud_group.destroy_all()
        for win in [self.hud_designator_predict_win, self.hud_designator_intercept_win]:
            if win:
                try:
                    win.destroy()
                except Exception:
                    pass
