"""
HudUiMixin - HUD overlay system for SACLOS.

Provides configurable HUD elements:
  - Name overlay: Static image (predictor.png)
  - Descriptor overlay: Static image (interceptSystem.png)
  - Range overlay: Static image + dynamic text
  - Status overlay: Static image + conditional status images
  - Designator overlay: Animated crosshair at target position
"""

import os
import math
import tkinter as tk

try:
    from PIL import Image, ImageTk
    PIL_OK = True
except ImportError:
    PIL_OK = False

try:
    from utils.window_utils import set_window_clickthrough
    WINDOW_UTILS_OK = True
except ImportError:
    WINDOW_UTILS_OK = False


class HudUiMixin:
    """Mixin for HUD overlay windows."""

    # HUD color matching game UI
    HUD_GREEN = "#77ffaa"
    HUD_BG = "#000001"  # Transparent color

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

        # Loaded images
        self.hud_img_name = None
        self.hud_img_descriptor = None
        self.hud_img_range = None
        self.hud_img_status = None
        self.hud_img_status_idle = None
        self.hud_img_status_predict = None
        self.hud_img_status_intercept = None
        self.hud_img_designator_predict = None
        self.hud_img_designator_intercept = None
        self.hud_img_logo_raw = None       # Raw RGBA for rotation
        self.hud_logo_frames = []          # Pre-rendered rotation PhotoImages
        self.hud_logo_frame_index = 0
        self.hud_logo_anim_id = None
        self.hud_logo_label = None

        # Window handles
        self.hud_name_win = None
        self.hud_descriptor_win = None
        self.hud_range_win = None
        self.hud_range_text = None
        self.hud_status_win = None
        self.hud_status_label = None
        self.hud_designator_predict_win = None
        self.hud_designator_intercept_win = None

        # Window HWNDs for click-through
        self.hud_name_hwnd = None
        self.hud_descriptor_hwnd = None
        self.hud_range_hwnd = None
        self.hud_status_hwnd = None
        self.hud_designator_predict_hwnd = None
        self.hud_designator_intercept_hwnd = None

        # State
        self.hud_status = "idle"  # idle, predict, intercept
        self.hud_visible = False
        self.hud_locked = False

        # Designator animation
        self.hud_designator_anim_id = None
        self.hud_designator_anim_start = 0
        self.hud_designator_alpha = 1.0

        # Predict status blink animation
        self.hud_predict_blink_id = None
        self.hud_predict_blink_visible = True
        self.hud_img_status_predict_blank = None
        self.hud_status_canvas_item = None

        # Default positions (screen coordinates)
        sw = self.root.winfo_screenwidth()
        sh = self.root.winfo_screenheight()
        self.hud_name_pos = [50, 50]
        self.hud_descriptor_pos = [sw - 250, 50]
        self.hud_range_pos = [sw - 250, sh // 2 - 50]
        self.hud_status_pos = [sw - 250, sh // 2 + 50]

        # Load images and create windows
        if PIL_OK:
            self._load_hud_images()
            self._create_hud_windows()

    def _load_hud_images(self):
        """Load all HUD images from assets directory."""
        assets_base = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), self.hud_assets_dir)

        def load_png(name):
            path = os.path.join(assets_base, name)
            if not os.path.exists(path):
                print(f"Warning: HUD image not found: {path}")
                return None
            try:
                img = Image.open(path).convert("RGBA")
                # Composite onto transparent background
                bg = Image.new("RGBA", img.size, (0, 0, 1, 255))
                composed = Image.alpha_composite(bg, img).convert("RGB")
                return ImageTk.PhotoImage(composed)
            except Exception as e:
                print(f"Warning: Could not load HUD image {name}: {e}")
                return None

        self.hud_img_name = load_png(self.hud_name_image)
        self.hud_img_descriptor = load_png(self.hud_descriptor_image)
        self.hud_img_range = load_png(self.hud_range_image)
        self.hud_img_status = load_png(self.hud_status_image)
        self.hud_img_status_idle = load_png(self.hud_status_idle)
        self.hud_img_status_predict = load_png(self.hud_status_predict)
        if self.hud_img_status_predict:
            _bw = self.hud_img_status_predict.width()
            _bh = self.hud_img_status_predict.height()
            _blank = Image.new("RGB", (_bw, _bh), (0, 0, 1))
            self.hud_img_status_predict_blank = ImageTk.PhotoImage(_blank)
        self.hud_img_status_intercept = load_png(self.hud_status_intercept)
        self.hud_img_designator_predict = load_png(self.hud_designator_predict)
        self.hud_img_designator_intercept = load_png(self.hud_designator_intercept)

        # Load logo raw RGBA for rotation animation
        logo_path = os.path.join(assets_base, self.hud_logo_image)
        if os.path.exists(logo_path):
            try:
                self.hud_img_logo_raw = Image.open(logo_path).convert("RGBA")
                self._prerender_logo_frames()
            except Exception as e:
                print(f"Warning: Could not load logo: {e}")

    def _prerender_logo_frames(self):
        """Pre-render rotated logo frames for spin animation.
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
        padded.paste(raw, (offset_x, offset_y), raw)

        self.hud_logo_frames = []
        for angle in range(0, 360, 10):
            rotated = padded.rotate(angle, resample=Image.Resampling.BICUBIC, expand=False)
            bg = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 1, 255))
            bg.paste(rotated, (0, 0), rotated)
            self.hud_logo_frames.append(ImageTk.PhotoImage(bg.convert("RGB")))

    def _create_hud_windows(self):
        """Create all HUD windows."""
        # Name window (spinning logo + predictor.png in row)
        self.hud_name_win = tk.Toplevel(self.root)
        self.hud_name_win.title("SACLOS HUD Name")
        self.hud_name_win.overrideredirect(True)
        self.hud_name_win.attributes("-topmost", True)
        self.hud_name_win.attributes("-transparentcolor", self.HUD_BG)
        self.hud_name_win.configure(bg=self.HUD_BG)

        name_frame = tk.Frame(self.hud_name_win, bg=self.HUD_BG)
        name_frame.pack()

        # Spinning logo
        if self.hud_logo_frames:
            self.hud_logo_label = tk.Label(name_frame, image=self.hud_logo_frames[0], bg=self.HUD_BG)
            self.hud_logo_label.pack(side=tk.LEFT)
            tk.Frame(name_frame, width=4, bg=self.HUD_BG).pack(side=tk.LEFT)
            self._make_draggable(self.hud_logo_label)

        # Predictor name image
        name_label = tk.Label(name_frame, bg=self.HUD_BG)
        if self.hud_img_name:
            name_label.config(image=self.hud_img_name)
        else:
            name_label.config(text="H.E.A.T", fg=self.HUD_GREEN, bg="#111111", font=("Courier", 12, "bold"))
        name_label.pack(side=tk.LEFT)

        self.root.update_idletasks()
        self.hud_name_win.geometry(f"{name_frame.winfo_reqwidth()}x{name_frame.winfo_reqheight()}")

        self._make_draggable(self.hud_name_win)
        self._make_draggable(name_label)
        self.hud_name_win.withdraw()

        # Descriptor window
        self.hud_descriptor_win = tk.Toplevel(self.root)
        self.hud_descriptor_win.title("SACLOS HUD Descriptor")
        self.hud_descriptor_win.overrideredirect(True)
        self.hud_descriptor_win.attributes("-topmost", True)
        self.hud_descriptor_win.attributes("-transparentcolor", self.HUD_BG)
        self.hud_descriptor_win.configure(bg=self.HUD_BG)

        desc_label = tk.Label(self.hud_descriptor_win, bg=self.HUD_BG)
        if self.hud_img_descriptor:
            desc_label.config(image=self.hud_img_descriptor)
            desc_label.pack()
            self.hud_descriptor_win.geometry(f"{self.hud_img_descriptor.width()}x{self.hud_img_descriptor.height()}")
        else:
            desc_label.config(text="INTERCEPT", fg=self.HUD_GREEN, bg="#111111", font=("Courier", 12, "bold"))
            desc_label.pack()
            self.hud_descriptor_win.geometry(f"+{self.hud_descriptor_pos[0]}+{self.hud_descriptor_pos[1]}")
        self._make_draggable(self.hud_descriptor_win)
        self.hud_descriptor_win.withdraw()

        # Range window (image + text in row)
        self.hud_range_win = tk.Toplevel(self.root)
        self.hud_range_win.title("SACLOS HUD Range")
        self.hud_range_win.overrideredirect(True)
        self.hud_range_win.attributes("-topmost", True)
        self.hud_range_win.attributes("-transparentcolor", self.HUD_BG)
        self.hud_range_win.configure(bg=self.HUD_BG)

        range_frame = tk.Frame(self.hud_range_win, bg=self.HUD_BG)
        range_frame.pack()

        if self.hud_img_range:
            range_img_label = tk.Label(range_frame, image=self.hud_img_range, bg=self.HUD_BG)
            range_img_label.pack(side=tk.LEFT)
            spacer = tk.Label(range_frame, width=4, bg=self.HUD_BG)
            spacer.pack(side=tk.LEFT)
            self.hud_range_text = tk.Label(
                range_frame,
                text="--- m",
                fg=self.HUD_GREEN,
                bg=self.HUD_BG,
                font=("Consolas", 12, "bold")
            )
            self.hud_range_text.pack(side=tk.LEFT)
            # Update window geometry after packing
            self.root.update_idletasks()
            self.hud_range_win.geometry(f"{range_frame.winfo_reqwidth()}x{range_frame.winfo_reqheight()}")
        else:
            self.hud_range_text = tk.Label(
                range_frame,
                text="RANGE: --- m",
                fg=self.HUD_GREEN,
                bg="#111111",
                font=("Consolas", 12, "bold"),
                padx=4, pady=2
            )
            self.hud_range_text.pack()
            self.hud_range_win.geometry("150x24")

        self._make_draggable(self.hud_range_win)
        self._make_draggable(self.hud_range_text)
        self.hud_range_win.withdraw()

        # Status window (image + conditional status image in row)
        self.hud_status_win = tk.Toplevel(self.root)
        self.hud_status_win.title("SACLOS HUD Status")
        self.hud_status_win.overrideredirect(True)
        self.hud_status_win.attributes("-topmost", True)
        self.hud_status_win.attributes("-transparentcolor", self.HUD_BG)
        self.hud_status_win.configure(bg=self.HUD_BG)

        status_frame = tk.Frame(self.hud_status_win, bg=self.HUD_BG)
        status_frame.pack()

        if self.hud_img_status:
            status_img_label = tk.Label(status_frame, image=self.hud_img_status, bg=self.HUD_BG)
            status_img_label.pack(side=tk.LEFT)
            spacer = tk.Label(status_frame, width=4, bg=self.HUD_BG)
            spacer.pack(side=tk.LEFT)
            status_img = self.hud_img_status_idle
            _status_imgs = [i for i in [self.hud_img_status_idle, self.hud_img_status_predict,
                                         self.hud_img_status_intercept] if i]
            _slw = max((i.width() for i in _status_imgs), default=60)
            _slh = max((i.height() for i in _status_imgs), default=20)
            self.hud_status_label = tk.Canvas(status_frame, width=_slw, height=_slh,
                                              bg=self.HUD_BG, highlightthickness=0, bd=0)
            self.hud_status_canvas_item = self.hud_status_label.create_image(
                0, 0, anchor='nw', image=status_img or ''
            )
            self.hud_status_label.pack(side=tk.LEFT)
            # Update window geometry after packing
            self.root.update_idletasks()
            self.hud_status_win.geometry(f"{status_frame.winfo_reqwidth()}x{status_frame.winfo_reqheight()}")
        else:
            self.hud_status_label = tk.Label(
                status_frame,
                text="STATUS: IDLE",
                fg=self.HUD_GREEN,
                bg="#111111",
                font=("Consolas", 12, "bold"),
                padx=4, pady=2
            )
            self.hud_status_label.pack()
            self.hud_status_win.geometry("180x24")

        self._make_draggable(self.hud_status_win)
        self._make_draggable(self.hud_status_label)
        self.hud_status_win.withdraw()

        # Designator predict window (animated crosshair)
        self.hud_designator_predict_win = tk.Toplevel(self.root)
        self.hud_designator_predict_win.title("SACLOS Designator Predict")
        self.hud_designator_predict_win.overrideredirect(True)
        self.hud_designator_predict_win.attributes("-topmost", True)
        self.hud_designator_predict_win.attributes("-transparentcolor", self.HUD_BG)
        self.hud_designator_predict_win.configure(bg=self.HUD_BG)

        designator_predict_label = tk.Label(self.hud_designator_predict_win, bg=self.HUD_BG)
        if self.hud_img_designator_predict:
            designator_predict_label.config(image=self.hud_img_designator_predict)
            designator_predict_label.pack()
            self.hud_designator_predict_win.geometry(
                f"{self.hud_img_designator_predict.width()}x{self.hud_img_designator_predict.height()}"
            )
        else:
            designator_predict_label.config(text="+", fg=self.HUD_GREEN, bg=self.HUD_BG, font=("Courier", 24))
            designator_predict_label.pack()
            self.hud_designator_predict_win.geometry("30x30")
        self.hud_designator_predict_win.withdraw()

        # Designator intercept window (triangle overlay)
        self.hud_designator_intercept_win = tk.Toplevel(self.root)
        self.hud_designator_intercept_win.title("SACLOS Designator Intercept")
        self.hud_designator_intercept_win.overrideredirect(True)
        self.hud_designator_intercept_win.attributes("-topmost", True)
        self.hud_designator_intercept_win.attributes("-transparentcolor", self.HUD_BG)
        self.hud_designator_intercept_win.configure(bg=self.HUD_BG)

        designator_intercept_label = tk.Label(self.hud_designator_intercept_win, bg=self.HUD_BG)
        if self.hud_img_designator_intercept:
            designator_intercept_label.config(image=self.hud_img_designator_intercept)
            designator_intercept_label.pack()
            self.hud_designator_intercept_win.geometry(
                f"{self.hud_img_designator_intercept.width()}x{self.hud_img_designator_intercept.height()}"
            )
        else:
            designator_intercept_label.config(text="▲", fg="#00ff00", bg=self.HUD_BG, font=("Courier", 24))
            designator_intercept_label.pack()
            self.hud_designator_intercept_win.geometry("30x30")
        self.hud_designator_intercept_win.withdraw()

    def _make_draggable(self, widget_or_window):
        """Make a widget or window draggable for HUD setup."""
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
            # Widget inside a window
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

    def _start_logo_animation(self):
        """Start the continuous spinning logo animation."""
        if not self.hud_logo_frames:
            return
        self._stop_logo_animation()
        self._animate_logo()

    def _stop_logo_animation(self):
        """Stop the logo animation."""
        if self.hud_logo_anim_id:
            self.root.after_cancel(self.hud_logo_anim_id)
            self.hud_logo_anim_id = None

    def _animate_logo(self):
        """Animation step for rotating logo."""
        if not self.hud_logo_frames or not self.hud_logo_label:
            return
        self.hud_logo_frame_index = (self.hud_logo_frame_index + 1) % len(self.hud_logo_frames)
        try:
            self.hud_logo_label.config(image=self.hud_logo_frames[self.hud_logo_frame_index])
        except Exception:
            return
        self.hud_logo_anim_id = self.root.after(33, self._animate_logo)

    def _update_status_image(self):
        """Update the status label image based on current status."""
        if not self.hud_status_label:
            return

        img_map = {
            "idle": self.hud_img_status_idle,
            "predict": self.hud_img_status_predict,
            "intercept": self.hud_img_status_intercept,
        }
        img = img_map.get(self.hud_status, self.hud_img_status_idle)

        if img:
            if self.hud_status_canvas_item is not None:
                self.hud_status_label.itemconfigure(self.hud_status_canvas_item, image=img, state='normal')
            else:
                self.hud_status_label.config(image=img, bg=self.HUD_BG)
            # Update window geometry if HUD is visible (in case image sizes differ)
            if self.hud_visible and self.hud_status_win:
                self.root.update_idletasks()
                status_frame = self.hud_status_label.master
                self.hud_status_win.geometry(f"{status_frame.winfo_reqwidth()}x{status_frame.winfo_reqheight()}")
        else:
            text_map = {
                "idle": "IDLE",
                "predict": "PREDICT",
                "intercept": "INTERCEPT",
            }
            self.hud_status_label.config(
                text=text_map.get(self.hud_status, "IDLE"),
                fg=self.HUD_GREEN,
                bg="#111111",
                font=("Consolas", 10, "bold")
            )

    def _show_hud_setup(self):
        """Show HUD windows in draggable setup mode."""
        self.hud_locked = False

        # Update content while still withdrawn (hud_visible is False)
        self._update_hud_range_text()
        self._update_status_image()

        # Position BEFORE deiconify (matches working OCR pattern)
        self._position_hud_windows()

        # Now deiconify — windows appear at the correct saved position
        for win in [self.hud_name_win, self.hud_descriptor_win,
                    self.hud_range_win, self.hud_status_win]:
            if win:
                win.deiconify()
                win.attributes("-topmost", True)
                win.lift()

        self.hud_visible = True
        self._start_logo_animation()

    def _show_hud_locked(self):
        """Show HUD windows in locked (click-through) mode."""
        self.hud_locked = True

        # Update content while still withdrawn (hud_visible is False)
        self._update_hud_range_text()
        self._update_status_image()

        # Position BEFORE deiconify (matches working OCR pattern)
        self._position_hud_windows()

        # Now deiconify — windows appear at the correct saved position
        for win in [self.hud_name_win, self.hud_descriptor_win,
                    self.hud_range_win, self.hud_status_win]:
            if win:
                win.deiconify()
                win.attributes("-topmost", True)

        self.hud_visible = True

        # Set click-through on all HUD windows
        self.root.update_idletasks()
        for win in [self.hud_name_win, self.hud_descriptor_win,
                    self.hud_range_win, self.hud_status_win]:
            if win:
                self._set_hud_clickthrough(win, True)

        self._start_logo_animation()

    def _hide_hud(self):
        """Hide all HUD windows."""
        self.hud_visible = False
        self.hud_locked = False

        # Stop animations
        self._stop_designator_animation()
        self._stop_predict_blink()
        self._stop_logo_animation()

        # Hide all windows
        for win in [self.hud_name_win, self.hud_descriptor_win,
                    self.hud_range_win, self.hud_status_win,
                    self.hud_designator_predict_win, self.hud_designator_intercept_win]:
            if win:
                win.withdraw()

    def _position_hud_windows(self):
        """Position HUD windows from saved config using full WxH+X+Y geometry."""
        self.root.update_idletasks()
        for win, pos in [(self.hud_name_win, self.hud_name_pos),
                         (self.hud_descriptor_win, self.hud_descriptor_pos),
                         (self.hud_range_win, self.hud_range_pos),
                         (self.hud_status_win, self.hud_status_pos)]:
            if win and pos:
                w = max(1, win.winfo_reqwidth())
                h = max(1, win.winfo_reqheight())
                x, y = int(pos[0]), int(pos[1])
                win.geometry(f"{w}x{h}+{x}+{y}")

    def _update_hud_range_text(self, range_m=None):
        """Update the range text display."""
        if range_m is None:
            range_m = getattr(self, 'target_range_m', 200.0)

        if self.hud_range_text:
            self.hud_range_text.config(text=f"{int(range_m)} m")
            # Update window geometry if HUD is visible (in case text width changes)
            if self.hud_visible and self.hud_range_win:
                self.root.update_idletasks()
                range_frame = self.hud_range_text.master
                self.hud_range_win.geometry(f"{range_frame.winfo_reqwidth()}x{range_frame.winfo_reqheight()}")

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

    def _hide_designators(self):
        """Hide both designator windows."""
        self._stop_designator_animation()
        if self.hud_designator_predict_win:
            self.hud_designator_predict_win.withdraw()
        if self.hud_designator_intercept_win:
            self.hud_designator_intercept_win.withdraw()

    def _show_predict_designator(self):
        """Show predict designator with fade animation."""
        if not self.hud_designator_predict_win:
            return

        # Position at overlay center
        self._position_designators()

        # Hide intercept, show predict
        if self.hud_designator_intercept_win:
            self.hud_designator_intercept_win.withdraw()

        self.hud_designator_predict_win.deiconify()
        self.hud_designator_predict_win.attributes("-topmost", True)

        # Start fade animation
        self._start_designator_animation()

        # Set click-through based on HUD mode
        if self.hud_locked:
            self._set_hud_clickthrough(self.hud_designator_predict_win, True)

    def _show_intercept_designator(self):
        """Show intercept designator (over predict)."""
        if not self.hud_designator_intercept_win:
            return

        # Position at overlay center
        self._position_designators()

        # Show both designators (intercept overlays predict)
        if self.hud_designator_predict_win:
            self.hud_designator_predict_win.deiconify()
        if self.hud_designator_intercept_win:
            self.hud_designator_intercept_win.deiconify()
            self.hud_designator_intercept_win.attributes("-topmost", True)

        # Keep animation running on predict
        # (don't stop it)

        # Set click-through based on HUD mode
        if self.hud_locked:
            if self.hud_designator_predict_win:
                self._set_hud_clickthrough(self.hud_designator_predict_win, True)
            if self.hud_designator_intercept_win:
                self._set_hud_clickthrough(self.hud_designator_intercept_win, True)

    def _position_designators(self):
        """Position designators at the current overlay center (follows tracking)."""
        overlay_cx = self.win_x + self.img_w / 2
        overlay_cy = self.win_y + self.img_h / 2

        # Center designator on this point
        pred_w = self.hud_img_designator_predict.width() if self.hud_img_designator_predict else 30
        pred_h = self.hud_img_designator_predict.height() if self.hud_img_designator_predict else 30

        pred_x = int(overlay_cx - pred_w / 2)
        pred_y = int(overlay_cy - pred_h / 2)

        if self.hud_designator_predict_win:
            self.hud_designator_predict_win.geometry(f"+{pred_x}+{pred_y}")

        if self.hud_designator_intercept_win:
            int_w = self.hud_img_designator_intercept.width() if self.hud_img_designator_intercept else 30
            int_h = self.hud_img_designator_intercept.height() if self.hud_img_designator_intercept else 30
            int_x = int(overlay_cx - int_w / 2)
            int_y = int(overlay_cy - int_h / 2)
            self.hud_designator_intercept_win.geometry(f"+{int_x}+{int_y}")

    def _start_designator_animation(self):
        """Start the fade-in-out animation for predict designator."""
        self._stop_designator_animation()
        self.hud_designator_anim_start = 0
        self._animate_designator()

    def _animate_designator(self):
        """Animation loop for designator fade."""
        import time

        if self.hud_designator_anim_start == 0:
            self.hud_designator_anim_start = time.perf_counter()

        elapsed = time.perf_counter() - self.hud_designator_anim_start
        # Sine wave: period ~2.5 seconds, alpha 0.2 to 1.0
        alpha = 0.6 * (0.5 + 0.5 * math.sin(elapsed * 2.5)) + 0.2
        alpha = max(0.15, min(1.0, alpha))

        if self.hud_designator_predict_win:
            try:
                self.hud_designator_predict_win.attributes("-alpha", alpha)
            except Exception:
                pass

        # Continue animation
        if self.hud_status == "predict":
            self.hud_designator_anim_id = self.root.after(50, self._animate_designator)

    def _start_predict_blink(self):
        """Start square-wave blink on the predict status image."""
        self._stop_predict_blink()
        self.hud_predict_blink_visible = True
        self._animate_predict_blink()

    def _stop_predict_blink(self):
        """Stop predict blink and restore the image to fully visible."""
        if self.hud_predict_blink_id:
            self.root.after_cancel(self.hud_predict_blink_id)
            self.hud_predict_blink_id = None
        if self.hud_status_label and self.hud_img_status_predict:
            try:
                if self.hud_status_canvas_item is not None:
                    self.hud_status_label.itemconfigure(self.hud_status_canvas_item, state='normal')
                else:
                    self.hud_status_label.config(image=self.hud_img_status_predict)
            except Exception:
                pass

    def _animate_predict_blink(self):
        """Toggle predict status image on/off (hold keyframes, no easing)."""
        if not self.hud_status_label:
            return
        try:
            if self.hud_status_canvas_item is not None:
                state = 'normal' if self.hud_predict_blink_visible else 'hidden'
                self.hud_status_label.itemconfigure(self.hud_status_canvas_item, state=state)
            else:
                img = (
                    self.hud_img_status_predict
                    if self.hud_predict_blink_visible
                    else (self.hud_img_status_predict_blank or self.hud_img_status_predict)
                )
                self.hud_status_label.config(image=img)
        except Exception:
            return
        self.hud_predict_blink_visible = not self.hud_predict_blink_visible
        if self.hud_status == "predict":
            self.hud_predict_blink_id = self.root.after(500, self._animate_predict_blink)

    def _stop_designator_animation(self):
        """Stop the designator animation."""
        if self.hud_designator_anim_id:
            self.root.after_cancel(self.hud_designator_anim_id)
            self.hud_designator_anim_id = None
        if self.hud_designator_predict_win:
            try:
                self.hud_designator_predict_win.attributes("-alpha", 1.0)
            except Exception:
                pass

    def _set_hud_clickthrough(self, win, enable):
        """Set click-through for a HUD window."""
        if not WINDOW_UTILS_OK:
            return
        try:
            import ctypes
            # Always re-lookup HWND to ensure we have a valid handle
            hwnd = ctypes.windll.user32.FindWindowW(None, win.title())
            if hwnd:
                set_window_clickthrough(hwnd, enable)
        except Exception:
            pass

    def _capture_hud_positions(self):
        """Capture current HUD window positions from screen coordinates."""
        if self.hud_name_win and self.hud_name_win.winfo_viewable():
            self.hud_name_pos = [self.hud_name_win.winfo_x(), self.hud_name_win.winfo_y()]
        if self.hud_descriptor_win and self.hud_descriptor_win.winfo_viewable():
            self.hud_descriptor_pos = [self.hud_descriptor_win.winfo_x(), self.hud_descriptor_win.winfo_y()]
        if self.hud_range_win and self.hud_range_win.winfo_viewable():
            self.hud_range_pos = [self.hud_range_win.winfo_x(), self.hud_range_win.winfo_y()]
        if self.hud_status_win and self.hud_status_win.winfo_viewable():
            self.hud_status_pos = [self.hud_status_win.winfo_x(), self.hud_status_win.winfo_y()]

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
        """Clean up HUD windows."""
        self._stop_designator_animation()
        self._stop_predict_blink()
        self._stop_logo_animation()
        for win in [self.hud_name_win, self.hud_descriptor_win,
                    self.hud_range_win, self.hud_status_win,
                    self.hud_designator_predict_win, self.hud_designator_intercept_win]:
            if win:
                try:
                    win.destroy()
                except Exception:
                    pass
