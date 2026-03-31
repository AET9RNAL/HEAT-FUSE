"""
SACLOS Overlay
--------------
  Ctrl+O        open image file
  Ctrl+L        lock / unlock (counter-translate mode)
  [Custom Key]  hold to track (configured on first run)
  Ctrl+P        quit

On first run, you'll be prompted to press a key to set as your tracking key.
To reconfigure the tracking key, use: --setup-tracking-key

No mouse clicks required for lock/unlock — avoids cursor-position
contaminating the first delta after locking.

Requirements:
    pip install pynput pillow
"""

import os
import json
import math
import tkinter as tk
from tkinter import filedialog, messagebox
from collections import deque
import threading
import time

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


class SACLOSOverlay:
    def __init__(self, root, image_path=None, tracking_image_path=None, margin_x=200, margin_y=200):
        self.root = root
        self.root.title("SACLOS Overlay")

        # State: "calibrate" -> "adjust_bounds" -> "locked"
        self.state = "calibrate"
        self.last_mouse_x = None
        self.last_mouse_y = None
        self.mouse_listener = None
        self.kbd_listener = None

        # Bounding box constraints
        self.margin_x = margin_x
        self.margin_y = margin_y
        self.origin_x = None
        self.origin_y = None

        # Tracking state (hold-to-track)
        self.tracking_active = False
        self.calibrated_x = None
        self.calibrated_y = None
        # Thread-local position tracking (listener thread only)
        self.tracking_win_x = None
        self.tracking_win_y = None
        self.last_update_time = 0  # Timestamp of last position queue update

        # Image paths for config persistence
        self.image_path = None
        self.tracking_image_path = None

        # Tracking key configuration
        self.tracking_key = None  # Will be set during setup or loaded from config
        self.tracking_key_name = "Space"  # Display name for UI
        self.awaiting_tracking_key = False  # True when prompting user for key

        # Thread-safe position update system
        self.position_queue = deque(maxlen=1)  # Only keep latest position
        self.position_lock = threading.Lock()
        self.update_timer_id = None  # ID of main-thread update timer

        # Cached window handle for fast positioning
        self.hwnd = None

        # Auto-correction state
        self.correction_active = False
        self.correction_waypoints = []  # List of (x, y, timestamp_ms)
        self.correction_waypoint_index = 0
        self.correction_start_time = 0
        self.correction_interrupted = threading.Event()

        # Synthetic mouse injection
        self.mouse_controller = None  # pynput Controller for mouse injection
        self.correction_thread = None
        self.correction_lock = threading.Lock()

        # Auto-correction configuration (tunable parameters)
        self.correction_enabled = True
        self.target_range_m = 200.0  # Range to target in meters (user-configured)
        self.correction_min_threshold_px = 5.0  # Minimum displacement to trigger correction

        # Physics parameters (missile ballistics)
        self.missile_v0 = 14.7  # Muzzle velocity m/s
        self.missile_accel = 307.2  # Acceleration m/s²
        self.missile_max_speed = 1116.0  # Terminal speed m/s
        self.missile_max_turn_rate = None  # Unknown - to be tuned

        # Algorithm parameters (lead calculation - see GUIDANCE_ALGORITHM_SPEC.md)
        self.lead_alpha = 1.0  # Distance exponent in lead formula
        self.lead_beta = 0.5  # Angle influence on magnitude
        self.lead_gamma = 0.3  # Range influence on magnitude
        self.urgency_k = 2.0  # Urgency scaling factor
        self.base_engagement_delay_s = 0.05  # Base delay before starting
        self.base_duration_ms = 300.0  # Base correction duration

        # Global speed multiplier
        self.correction_speed_multiplier = 1.0

        # Window style
        self.root.attributes("-topmost", True)
        self.root.attributes("-transparentcolor", "#000001")
        self.root.overrideredirect(True)
        self.root.configure(bg="#000001")

        sw = self.root.winfo_screenwidth()
        sh = self.root.winfo_screenheight()
        self.win_x = sw // 2 - 200
        self.win_y = sh // 2 - 200
        self._apply_geometry()

        # Canvas (make it focusable to receive keyboard events)
        self.canvas = tk.Canvas(self.root, bg="#000001",
                                highlightthickness=0, cursor="crosshair")
        self.canvas.pack(fill=tk.BOTH, expand=True)
        # Make canvas focusable and give it focus
        self.canvas.config(takefocus=True)
        self.canvas.focus_set()

        # Status bar — Open button + keybind hints only
        self.bar = tk.Frame(self.root, bg="#111111", pady=3)
        self.bar.pack(side=tk.BOTTOM, fill=tk.X)

        tk.Button(self.bar, text="Open image (Ctrl+O)", command=self._open_image,
                  bg="#222", fg="#aaa", relief=tk.FLAT,
                  padx=8, pady=2).pack(side=tk.LEFT, padx=4)

        self.status_lbl = tk.Label(
            self.bar,
            text="CALIBRATE  |  Ctrl+L = lock    Ctrl+P = quit",
            bg="#111111", fg="#555", font=("Courier", 9)
        )
        self.status_lbl.pack(side=tk.LEFT, padx=10)

        # Image (dual images for normal and tracking states)
        self.img_normal = None  # PhotoImage for normal state
        self.img_tracking = None  # PhotoImage for tracking state
        self.img_id = None
        self.boundary_box_id = None
        self.corner_handles = []  # List of corner handle canvas IDs
        self.dragging_corner = None  # Which corner is being dragged
        self.dragging_center = False  # Whether dragging center to reposition
        self.drag_start_x = None
        self.drag_start_y = None
        self.img_w = 400
        self.img_h = 400
        if image_path and os.path.exists(image_path):
            self._load_images(image_path, tracking_image_path)
        else:
            self._draw_placeholder()

        # Draw boundary box in calibrate mode
        self._draw_boundary_box()

        # Drag to reposition in calibrate mode / resize in adjust_bounds mode
        self.canvas.bind("<ButtonPress-1>", self._drag_start)
        self.canvas.bind("<B1-Motion>", self._drag_move)
        self.canvas.bind("<ButtonRelease-1>", self._drag_end)

        # Give canvas focus when clicked (important when status bar is hidden)
        self.canvas.bind("<Button-1>", lambda e: self.canvas.focus_set(), add=True)

        # Tkinter keyboard (window focus) - CTRL+key bindings
        # Bind to both root and canvas so they work when status bar is hidden
        for widget in [self.root, self.canvas]:
            widget.bind("<Control-o>", lambda e: self._open_image() if self.state != "locked" else None)
            widget.bind("<Control-O>", lambda e: self._open_image() if self.state != "locked" else None)
            widget.bind("<Control-l>", lambda e: self._toggle_lock())
            widget.bind("<Control-L>", lambda e: self._toggle_lock())
            widget.bind("<Control-p>", lambda e: self._quit())
            widget.bind("<Control-P>", lambda e: self._quit())

        # Global keyboard via pynput (works when game has focus)
        self._start_kbd_listener()

        # Load config if exists (must be after all initialization)
        self._load_config()

        # Prompt for tracking key setup if not configured
        if self.tracking_key is None:
            self.root.after(500, self._prompt_for_tracking_key)

    # ------------------------------------------------------------ config persistence

    def _get_config_path(self):
        """Get path to config file (same directory as script)."""
        script_dir = os.path.dirname(os.path.abspath(__file__))
        return os.path.join(script_dir, "saclos_config.json")

    def _save_config(self):
        """Save current configuration to JSON file."""
        config = {
            "calibrated_x": self.calibrated_x,
            "calibrated_y": self.calibrated_y,
            "origin_x": self.origin_x,
            "origin_y": self.origin_y,
            "margin_x": self.margin_x,
            "margin_y": self.margin_y,
            "image_path": self.image_path,
            "tracking_image_path": self.tracking_image_path,
            "tracking_key_name": self.tracking_key_name,
            # Auto-correction settings
            "correction_enabled": self.correction_enabled,
            "target_range_m": self.target_range_m,
            "correction_min_threshold_px": self.correction_min_threshold_px,
            "correction_speed_multiplier": self.correction_speed_multiplier,
            # Algorithm parameters
            "lead_alpha": self.lead_alpha,
            "lead_beta": self.lead_beta,
            "lead_gamma": self.lead_gamma,
            "urgency_k": self.urgency_k,
            "base_engagement_delay_s": self.base_engagement_delay_s,
            "base_duration_ms": self.base_duration_ms,
        }
        try:
            config_path = self._get_config_path()
            with open(config_path, 'w') as f:
                json.dump(config, f, indent=2)
            print(f"Config saved to {config_path}")
        except Exception as e:
            print(f"Warning: Could not save config: {e}")

    def _load_config(self):
        """Load configuration from JSON file if it exists."""
        config_path = self._get_config_path()
        if not os.path.exists(config_path):
            return

        try:
            with open(config_path, 'r') as f:
                config = json.load(f)

            # Load image paths and images if specified
            image_path = config.get("image_path")
            tracking_image_path = config.get("tracking_image_path")
            if image_path and os.path.exists(image_path):
                self._load_images(image_path, tracking_image_path)

            # Restore calibrated position
            self.calibrated_x = config.get("calibrated_x")
            self.calibrated_y = config.get("calibrated_y")

            # Restore origin and margins
            self.origin_x = config.get("origin_x")
            self.origin_y = config.get("origin_y")
            self.margin_x = config.get("margin_x", 200)
            self.margin_y = config.get("margin_y", 200)

            # Restore tracking key configuration
            self.tracking_key_name = config.get("tracking_key_name", "Space")
            self._update_tracking_key_from_name()

            # Load auto-correction settings
            self.correction_enabled = config.get("correction_enabled", True)
            self.target_range_m = config.get("target_range_m", 200.0)
            self.correction_min_threshold_px = config.get("correction_min_threshold_px", 5.0)
            self.correction_speed_multiplier = config.get("correction_speed_multiplier", 1.0)
            # Algorithm parameters
            self.lead_alpha = config.get("lead_alpha", 1.0)
            self.lead_beta = config.get("lead_beta", 0.5)
            self.lead_gamma = config.get("lead_gamma", 0.3)
            self.urgency_k = config.get("urgency_k", 2.0)
            self.base_engagement_delay_s = config.get("base_engagement_delay_s", 0.05)
            self.base_duration_ms = config.get("base_duration_ms", 300.0)

            # Apply calibrated position if we have it
            if self.calibrated_x is not None and self.calibrated_y is not None:
                self.win_x = self.calibrated_x
                self.win_y = self.calibrated_y
                self._apply_geometry()

            # Redraw boundary box with restored settings
            self._draw_boundary_box()

            print(f"Config loaded from {config_path}")
        except Exception as e:
            print(f"Warning: Could not load config: {e}")

    def _update_tracking_key_from_name(self):
        """Convert tracking key name to pynput key object."""
        if not PYNPUT_OK:
            return

        # Map common key names to pynput keys
        key_map = {
            "Space": pynkeyboard.Key.space,
            "Shift": pynkeyboard.Key.shift,
            "Alt": pynkeyboard.Key.alt,
            "Tab": pynkeyboard.Key.tab,
            "CapsLock": pynkeyboard.Key.caps_lock,
        }

        # Check if it's a special key
        if self.tracking_key_name in key_map:
            self.tracking_key = key_map[self.tracking_key_name]
        else:
            # It's a character key - store as lowercase for comparison
            self.tracking_key = self.tracking_key_name.lower()

    def _prompt_for_tracking_key(self):
        """Prompt user to press a key to set as tracking key."""
        self.awaiting_tracking_key = True
        self.status_lbl.config(
            text="SETUP: Press any key to set as tracking key...",
            fg="#ffff00"
        )
        print("Waiting for tracking key assignment. Press any key...")

    def _set_tracking_key(self, key):
        """Set the tracking key from user input."""
        if not self.awaiting_tracking_key:
            return

        self.awaiting_tracking_key = False
        self.tracking_key = key

        # Get display name for the key
        if hasattr(key, 'name'):
            # Special key
            self.tracking_key_name = key.name.capitalize()
        elif hasattr(key, 'char') and key.char:
            # Character key
            self.tracking_key_name = key.char.upper()
        else:
            self.tracking_key_name = str(key)

        # Save to config
        self._save_config()

        # Update status
        self.status_lbl.config(
            text=f"CALIBRATE  |  Tracking key set to: {self.tracking_key_name}  |  Ctrl+L = lock",
            fg="#00ff00"
        )
        print(f"Tracking key set to: {self.tracking_key_name}")

        # Wait a moment, then show normal calibrate status
        self.root.after(2000, lambda: self.status_lbl.config(
            text="CALIBRATE  |  Ctrl+L = lock    Ctrl+P = quit",
            fg="#555"
        ))

    # ------------------------------------------------------------------ image

    def _load_images(self, normal_path, tracking_path=None):
        """Load normal and tracking images. If tracking_path not provided, uses normal for both."""
        if not PIL_OK:
            messagebox.showerror("Missing dependency",
                                 "Install Pillow:\n  pip install pillow")
            return

        # Store image paths for config persistence
        self.image_path = normal_path
        self.tracking_image_path = tracking_path

        # Load normal image
        img = Image.open(normal_path).convert("RGBA")
        self.img_w, self.img_h = img.size
        bg = Image.new("RGBA", img.size, (0, 0, 1, 255))
        composed = Image.alpha_composite(bg, img).convert("RGB")
        self.img_normal = ImageTk.PhotoImage(composed)

        # Load tracking image (or use normal if not specified)
        if tracking_path and os.path.exists(tracking_path):
            tracking_img = Image.open(tracking_path).convert("RGBA")
            # Ensure tracking image is same size as normal
            if tracking_img.size != (self.img_w, self.img_h):
                tracking_img = tracking_img.resize((self.img_w, self.img_h), Image.Resampling.LANCZOS)
            bg_tracking = Image.new("RGBA", tracking_img.size, (0, 0, 1, 255))
            composed_tracking = Image.alpha_composite(bg_tracking, tracking_img).convert("RGB")
            self.img_tracking = ImageTk.PhotoImage(composed_tracking)
        else:
            # Use same image for tracking if no separate image provided
            self.img_tracking = self.img_normal

        bar_h = 28
        self.root.geometry(f"{self.img_w}x{self.img_h + bar_h}")
        self.canvas.config(width=self.img_w, height=self.img_h)
        if self.img_id:
            self.canvas.delete(self.img_id)
        # Start with normal image
        self.img_id = self.canvas.create_image(0, 0, anchor=tk.NW,
                                               image=self.img_normal)
        # Redraw boundary box on top of image
        self._draw_boundary_box()

    def _draw_placeholder(self):
        self.img_w, self.img_h = 400, 400
        self.root.geometry("400x428")
        self.canvas.config(width=400, height=400)
        cx, cy = 200, 200
        r = 80
        self.canvas.create_oval(cx-r, cy-r, cx+r, cy+r,
                                outline="#1d9e75", width=1)
        for x1, y1, x2, y2 in [
            (cx-r-10, cy, cx-12, cy), (cx+12, cy, cx+r+10, cy),
            (cx, cy-r-10, cx, cy-12), (cx, cy+12, cx, cy+r+10),
        ]:
            self.canvas.create_line(x1, y1, x2, y2, fill="#1d9e75", width=1)
        self.canvas.create_oval(cx-3, cy-3, cx+3, cy+3,
                                fill="#1d9e75", outline="")
        self.canvas.create_text(cx, cy + r + 24,
                                text="No image — press O to open",
                                fill="#444", font=("Courier", 10))

    def _open_image(self):
        self.root.overrideredirect(False)
        path = filedialog.askopenfilename(
            title="Open overlay image (normal state)",
            filetypes=[("PNG / BMP", "*.png *.bmp"),
                       ("All images", "*.png *.jpg *.bmp *.tga"),
                       ("All", "*.*")]
        )
        self.root.overrideredirect(True)
        self.root.attributes("-topmost", True)
        if path:
            # Ask for optional tracking image
            self.root.overrideredirect(False)
            tracking_path = filedialog.askopenfilename(
                title="Open tracking image (optional, cancel to use same image)",
                filetypes=[("PNG / BMP", "*.png *.bmp"),
                           ("All images", "*.png *.jpg *.bmp *.tga"),
                           ("All", "*.*")]
            )
            self.root.overrideredirect(True)
            self.root.attributes("-topmost", True)
            self._load_images(path, tracking_path if tracking_path else None)

    # --------------------------------------------------------------- geometry

    def _apply_geometry(self):
        """Apply window position using fast Windows API."""
        try:
            import ctypes
            # Get or cache window handle (FindWindowW is expensive, only do it once)
            if self.hwnd is None:
                self.hwnd = ctypes.windll.user32.FindWindowW(None, "SACLOS Overlay")

            if self.hwnd:
                # Use SetWindowPos for fast, non-blocking window positioning
                # SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_ASYNCWINDOWPOS
                # = 0x0001 | 0x0004 | 0x0010 | 0x4000
                flags = 0x4015
                result = ctypes.windll.user32.SetWindowPos(
                    self.hwnd, 0, int(self.win_x), int(self.win_y), 0, 0, flags
                )
                # If SetWindowPos fails, invalidate cached handle
                if result == 0:
                    self.hwnd = None
                return
        except Exception:
            self.hwnd = None
        # Fallback to Tkinter geometry
        self.root.geometry(f"+{int(self.win_x)}+{int(self.win_y)}")

    def _process_position_queue(self):
        """Process position updates from queue (runs in main thread)."""
        if not self.tracking_active:
            # Stop processing if tracking is no longer active
            self.update_timer_id = None
            return

        # Check if there's a position update in the queue
        has_update = False
        with self.position_lock:
            if self.position_queue:
                # Get the latest position (queue has maxlen=1, so only one item)
                self.win_x, self.win_y = self.position_queue.pop()
                has_update = True

        # Only apply geometry update if there was a position change
        # This prevents unnecessary SetWindowPos calls
        if has_update:
            self._apply_geometry()

        # Schedule next check with fixed 1ms interval (1000Hz)
        # Matches mouse polling rate to prevent position drift and temporal aliasing
        # Critical for accurate tracking - must update as fast as mouse moves
        self.update_timer_id = self.root.after(1, self._process_position_queue)

    # ------------------------------------------------------------------- drag

    def _drag_start(self, event):
        if self.state == "calibrate":
            self._ox = event.x_root - self.win_x
            self._oy = event.y_root - self.win_y
        elif self.state == "adjust_bounds":
            # Check if clicking on a corner handle
            self._check_corner_drag_start(event)

    def _drag_move(self, event):
        if self.state == "calibrate":
            self.win_x = event.x_root - self._ox
            self.win_y = event.y_root - self._oy
            self._apply_geometry()
            # Redraw boundary box as overlay moves
            self._draw_boundary_box()
        elif self.state == "adjust_bounds":
            if self.dragging_corner is not None:
                self._resize_bounds(event)
            elif self.dragging_center:
                # Adjust origin position (offset from overlay center)
                # Calculate mouse delta
                dx = event.x_root - self.drag_start_x
                dy = event.y_root - self.drag_start_y
                # Update origin by delta (overlay stays fixed)
                self.origin_x = self.drag_start_origin_x + dx
                self.origin_y = self.drag_start_origin_y + dy
                # Redraw boundary box at new origin offset
                self._draw_boundary_box()

    def _drag_end(self, event):
        """Handle mouse button release."""
        self.dragging_corner = None
        self.dragging_center = False

    def _check_corner_drag_start(self, event):
        """Check if click is on a corner handle or inside box for repositioning."""
        # Calculate box center (same logic as _draw_boundary_box)
        if self.origin_x is not None:
            cx = self.origin_x - self.win_x
            cy = self.origin_y - self.win_y
        else:
            cx = self.img_w / 2
            cy = self.img_h / 2

        handle_size = 8

        # First check if clicking on a corner handle
        corners = {
            "nw": (cx - self.margin_x, cy - self.margin_y),
            "ne": (cx + self.margin_x, cy - self.margin_y),
            "sw": (cx - self.margin_x, cy + self.margin_y),
            "se": (cx + self.margin_x, cy + self.margin_y)
        }

        for corner_id, (cx_h, cy_h) in corners.items():
            if (abs(event.x - cx_h) <= handle_size and
                abs(event.y - cy_h) <= handle_size):
                self.dragging_corner = corner_id
                self.drag_start_x = event.x
                self.drag_start_y = event.y
                return

        # If not on a corner, check if inside the box for center repositioning
        x1 = cx - self.margin_x
        y1 = cy - self.margin_y
        x2 = cx + self.margin_x
        y2 = cy + self.margin_y

        if x1 <= event.x <= x2 and y1 <= event.y <= y2:
            self.dragging_center = True
            # Store starting mouse position for delta calculation
            self.drag_start_x = event.x_root
            self.drag_start_y = event.y_root
            # Store starting origin for offset adjustment
            self.drag_start_origin_x = self.origin_x
            self.drag_start_origin_y = self.origin_y

    def _resize_bounds(self, event):
        """Resize boundary box by dragging corner."""
        if not self.dragging_corner:
            return

        # Calculate box center (same logic as _draw_boundary_box)
        if self.origin_x is not None:
            cx = self.origin_x - self.win_x
            cy = self.origin_y - self.win_y
        else:
            cx = self.img_w / 2
            cy = self.img_h / 2

        # Calculate distance from center to mouse position
        dx = abs(event.x - cx)
        dy = abs(event.y - cy)

        # Update margins (minimum 50 pixels)
        self.margin_x = max(50, dx)
        self.margin_y = max(50, dy)

        # Redraw boundary box with new margins
        self._draw_boundary_box()

    # ------------------------------------------------------------- boundary box

    def _draw_boundary_box(self):
        """Draw visual boundary box showing allowed movement area."""
        if self.state == "locked":
            return

        # Clear existing box and handles
        if self.boundary_box_id:
            self.canvas.delete(self.boundary_box_id)
        for handle in self.corner_handles:
            self.canvas.delete(handle)
        self.corner_handles.clear()

        # Calculate center position (with origin offset in adjust_bounds mode)
        if self.state == "adjust_bounds" and self.origin_x is not None:
            # Draw box centered at origin position (which may be offset from overlay center)
            # Convert origin from screen coords to canvas coords
            cx = self.origin_x - self.win_x
            cy = self.origin_y - self.win_y
        else:
            # Calibrate mode: box centered on overlay center
            cx = self.img_w / 2
            cy = self.img_h / 2

        # Draw rectangle centered on calculated position
        x1 = cx - self.margin_x
        y1 = cy - self.margin_y
        x2 = cx + self.margin_x
        y2 = cy + self.margin_y

        if self.state == "calibrate":
            # Preview box - dashed outline
            self.boundary_box_id = self.canvas.create_rectangle(
                x1, y1, x2, y2,
                outline="#00ff00", width=2, dash=(5, 3)
            )

            # Draw edge indicators if box extends beyond canvas
            # This makes the box visible even when margins are larger than image
            canvas_w = self.img_w
            canvas_h = self.img_h

            # Draw clipped edge lines at canvas boundaries
            if x1 < 0:  # Left edge off-screen
                line = self.canvas.create_line(0, max(0, y1), 0, min(canvas_h, y2),
                                               fill="#00ff00", width=2)
                self.corner_handles.append(line)
                # Arrow indicating box extends left
                arrow = self.canvas.create_text(10, cy, text="◄", fill="#00ff00",
                                               font=("Arial", 16), anchor=tk.W)
                self.corner_handles.append(arrow)

            if x2 > canvas_w:  # Right edge off-screen
                line = self.canvas.create_line(canvas_w, max(0, y1), canvas_w, min(canvas_h, y2),
                                               fill="#00ff00", width=2)
                self.corner_handles.append(line)
                # Arrow indicating box extends right
                arrow = self.canvas.create_text(canvas_w - 10, cy, text="►", fill="#00ff00",
                                               font=("Arial", 16), anchor=tk.E)
                self.corner_handles.append(arrow)

            if y1 < 0:  # Top edge off-screen
                line = self.canvas.create_line(max(0, x1), 0, min(canvas_w, x2), 0,
                                               fill="#00ff00", width=2)
                self.corner_handles.append(line)
                # Arrow indicating box extends up
                arrow = self.canvas.create_text(cx, 10, text="▲", fill="#00ff00",
                                               font=("Arial", 16), anchor=tk.N)
                self.corner_handles.append(arrow)

            if y2 > canvas_h:  # Bottom edge off-screen
                line = self.canvas.create_line(max(0, x1), canvas_h, min(canvas_w, x2), canvas_h,
                                               fill="#00ff00", width=2)
                self.corner_handles.append(line)
                # Arrow indicating box extends down
                arrow = self.canvas.create_text(cx, canvas_h - 10, text="▼", fill="#00ff00",
                                               font=("Arial", 16), anchor=tk.S)
                self.corner_handles.append(arrow)

            # Show box dimensions as text
            dims_text = self.canvas.create_text(
                cx, cy + 20,
                text=f"Bounds: {self.margin_x*2}×{self.margin_y*2}px",
                fill="#00ff00", font=("Courier", 10), anchor=tk.N
            )
            self.corner_handles.append(dims_text)
        elif self.state == "adjust_bounds":
            # Interactive box - solid outline with corner handles
            self.boundary_box_id = self.canvas.create_rectangle(
                x1, y1, x2, y2,
                outline="#ff9900", width=2
            )
            # Draw center crosshair to indicate draggable center
            crosshair_size = 10
            center_h1 = self.canvas.create_line(
                cx - crosshair_size, cy, cx + crosshair_size, cy,
                fill="#ff9900", width=1
            )
            center_h2 = self.canvas.create_line(
                cx, cy - crosshair_size, cx, cy + crosshair_size,
                fill="#ff9900", width=1
            )
            self.corner_handles.extend([center_h1, center_h2])

            # Draw corner handles
            handle_size = 8
            corners = [
                (x1, y1, "nw"), (x2, y1, "ne"),
                (x1, y2, "sw"), (x2, y2, "se")
            ]
            for cx_h, cy_h, corner_id in corners:
                handle = self.canvas.create_rectangle(
                    cx_h - handle_size, cy_h - handle_size,
                    cx_h + handle_size, cy_h + handle_size,
                    fill="#ff9900", outline="#ffffff", width=1,
                    tags=corner_id
                )
                self.corner_handles.append(handle)

    # -------------------------------------------------------------------- lock

    def _toggle_lock(self):
        if self.state == "calibrate":
            self._enter_adjust_bounds()
        elif self.state == "adjust_bounds":
            self._enter_locked()
        else:  # locked
            self._exit_to_calibrate()

    def _enter_adjust_bounds(self):
        """Enter bounds adjustment mode - overlay frozen, resizable boundary box."""
        self.state = "adjust_bounds"
        # Initialize origin at overlay center (in screen coordinates)
        # Origin = center of the bounding box (where in-game scope center is)
        # User can drag to adjust if scope is not perfectly centered
        self.origin_x = self.win_x + self.img_w / 2
        self.origin_y = self.win_y + self.img_h / 2
        bar_h = 28
        self.root.geometry(f"{self.img_w}x{self.img_h + bar_h}")
        self.status_lbl.config(
            text="ADJUST BOUNDS  |  Drag corners=resize, center=move  |  Ctrl+L=confirm",
            fg="#ff9900"
        )
        if not self.bar.winfo_ismapped():
            self.bar.pack(side=tk.BOTTOM, fill=tk.X)
        # Redraw boundary box with corner handles
        self._draw_boundary_box()

    def _enter_locked(self):
        """Enter locked mode - overlay static, hold Space to track."""
        if not PYNPUT_OK:
            messagebox.showerror("Missing dependency",
                                 "Install pynput:\n  pip install pynput")
            return
        self.state = "locked"
        # Save calibrated position to return to on tracking release
        self.calibrated_x = self.win_x
        self.calibrated_y = self.win_y
        self.tracking_active = False
        # Save config with calibrated settings
        self._save_config()
        # Null out last position
        self.last_mouse_x = None
        self.last_mouse_y = None
        # Hide boundary box and corner handles
        if self.boundary_box_id:
            self.canvas.delete(self.boundary_box_id)
            self.boundary_box_id = None
        for handle in self.corner_handles:
            self.canvas.delete(handle)
        self.corner_handles.clear()
        # Hide status bar in locked mode
        self.bar.pack_forget()
        self.root.geometry(f"{self.img_w}x{self.img_h}")
        self._set_clickthrough(True)
        # DO NOT start mouse listener yet - only when tracking key is pressed

    def _start_tracking(self):
        """Start counter-translation tracking (Space pressed)."""
        if self.state != "locked" or self.tracking_active:
            return

        # Cancel any active correction before starting new tracking
        if self.correction_active:
            self.correction_interrupted.set()
            self._cleanup_correction()

        # Prevent starting new tracking if listener already exists
        if self.mouse_listener is not None:
            return

        self.tracking_active = True
        # Hide status bar during tracking (do this before image swap to minimize visual changes)
        self.bar.pack_forget()
        # Swap to tracking image
        if self.img_tracking and self.img_id:
            self.canvas.itemconfig(self.img_id, image=self.img_tracking)
        # Reset mouse position baseline for clean counter-translation start
        self.last_mouse_x = None
        self.last_mouse_y = None
        # Clear position queue
        with self.position_lock:
            self.position_queue.clear()
        # Adjust window size to hide status bar using Windows API to avoid activation
        try:
            import ctypes
            if self.hwnd is None:
                self.hwnd = ctypes.windll.user32.FindWindowW(None, "SACLOS Overlay")
            if self.hwnd:
                # Resize without activating: SWP_NOMOVE | SWP_NOZORDER | SWP_NOACTIVATE
                flags = 0x0002 | 0x0004 | 0x0010
                ctypes.windll.user32.SetWindowPos(
                    self.hwnd, 0, 0, 0, self.img_w, self.img_h, flags
                )
            else:
                # Fallback to Tkinter if Windows API fails
                self.root.geometry(f"{self.img_w}x{self.img_h}")
        except Exception:
            self.root.geometry(f"{self.img_w}x{self.img_h}")
        # Start mouse listener (runs in separate thread)
        self.mouse_listener = pynmouse.Listener(on_move=self._on_mouse_move)
        self.mouse_listener.start()
        # Start position queue processor in main thread with fixed 1ms interval (1000Hz)
        if self.update_timer_id is None:
            self.update_timer_id = self.root.after(1, self._process_position_queue)

    def _stop_tracking(self):
        """Stop tracking and reset to calibrated position (tracking key released)."""
        if self.state != "locked" or not self.tracking_active:
            return

        self.tracking_active = False

        # Stop the update timer (will automatically stop in _process_position_queue)
        if self.update_timer_id is not None:
            self.root.after_cancel(self.update_timer_id)
            self.update_timer_id = None

        # Stop mouse listener and wait for thread to terminate
        if self.mouse_listener:
            self.mouse_listener.stop()
            # Wait for listener thread to fully stop (prevents thread accumulation)
            # Use a timeout to avoid hanging if something goes wrong
            try:
                self.mouse_listener.join(timeout=0.5)
            except Exception:
                pass
            self.mouse_listener = None

        # Clear position queue
        with self.position_lock:
            self.position_queue.clear()

        # Reset thread-local position tracking
        self.tracking_win_x = None
        self.tracking_win_y = None
        self.last_update_time = 0

        # Swap back to normal image
        if self.img_normal and self.img_id:
            self.canvas.itemconfig(self.img_id, image=self.img_normal)

        # Calculate displacement from current overlay position to origin
        current_center_x = self.win_x + self.img_w / 2
        current_center_y = self.win_y + self.img_h / 2
        target_center_x = self.origin_x
        target_center_y = self.origin_y

        displacement_x = target_center_x - current_center_x
        displacement_y = target_center_y - current_center_y
        distance_px = math.sqrt(displacement_x**2 + displacement_y**2)

        # Only trigger correction if displacement exceeds threshold
        if self.correction_enabled and distance_px > self.correction_min_threshold_px:
            angle_rad = math.atan2(displacement_y, displacement_x)

            # Start auto-correction after engagement delay
            # This will generate mouse movements to guide missile from x to o
            self.root.after(0, lambda: self._start_auto_correction(distance_px, angle_rad))
        else:
            # No correction needed or disabled - reset immediately
            self._reset_to_calibrated_position()
        # Status bar remains hidden (we're still in locked mode)

    def _calculate_correction_params(self, distance_px, angle_rad):
        """
        Calculate physics-based correction parameters using continuous functions.

        Based on GUIDANCE_ALGORITHM_SPEC.md - generates lead point t, not direct aim at o.

        Args:
            distance_px: Displacement distance (d) in pixels
            angle_rad: Displacement angle (n) in radians

        Returns:
            dict: {
                'lead_distance_px': d' (overcompensated distance),
                'lead_angle_rad': n' (angle with lead offset),
                'engagement_delay_s': s (when to start),
                'duration_ms': total correction time,
                'speed_factor': how aggressively to move,
                'aggression': bezier curve sharpness
            }
        """
        # Normalize inputs to [0, 1]
        max_displacement_px = math.sqrt(self.margin_x**2 + self.margin_y**2)
        d_norm = min(distance_px / max_displacement_px, 1.0)
        n_norm = abs(angle_rad) / (math.pi / 2)  # 0 at horizontal, 1 at vertical
        r_norm = min(self.target_range_m / 500.0, 1.0)  # Normalize range, max 500m

        # Urgency factor: combines displacement and angle
        # Higher urgency = more immediate, aggressive correction
        urgency = d_norm * (1 + n_norm)

        # === LEAD FACTOR (Overcompensation) ===
        # How much to overshoot target to create intercept trajectory
        # Increases with: distance, angle, urgency
        # Decreases with: range (more time available)
        lead_factor = (
            self.lead_alpha * d_norm +           # Distance contribution
            self.lead_beta * n_norm +             # Angle contribution
            self.lead_gamma * (urgency / (r_norm + 0.1))  # Urgency/range ratio
        )
        lead_factor = min(lead_factor, 2.0)  # Cap at 200% overcompensation

        # === LEAD DISTANCE (d') ===
        # Magnitude of mouse movement - typically LARGER than displacement
        # This creates the overcompensation needed for intercept
        lead_distance_px = distance_px * (1 + lead_factor)

        # === LEAD ANGLE (n') ===
        # Direction of mouse movement
        # angle_rad points from overlay position TO origin
        # This is the direction the OVERLAY needs to move
        # Counter-translation: when mouse moves by +Δ, overlay moves by -Δ
        # So to make overlay move in direction θ, mouse must move in direction θ
        # (the negative cancels out in the coordinate transformation)
        # Testing showed +π was inverted, so we use the angle as-is
        lead_angle_rad = angle_rad  # Direct angle (tested correct)
        # TODO: Add angular lead offset δ based on trajectory prediction

        # === ENGAGEMENT DELAY (s) ===
        # Time to wait before starting correction
        # Approaches 0 as d→0 (immediate when close)
        # Approaches 0 as urgency→large (immediate when urgent)
        engagement_delay_s = self.base_engagement_delay_s * d_norm / (1 + self.urgency_k * urgency)
        engagement_delay_s = max(0.0, engagement_delay_s)  # Never negative

        # === SPEED FACTOR ===
        # How fast to execute movement (higher = faster)
        speed_factor = 1.0 + urgency
        speed_factor *= self.correction_speed_multiplier  # Apply global multiplier

        # === DURATION ===
        # Total time for correction movement
        # Inversely proportional to speed/urgency
        duration_ms = self.base_duration_ms / speed_factor
        duration_ms = max(100.0, min(duration_ms, 1000.0))  # Clamp [100ms, 1000ms]

        # === AGGRESSION ===
        # Bezier curve sharpness (0 = linear, 1 = very curved)
        aggression = min(0.9, urgency)

        return {
            'lead_distance_px': lead_distance_px,
            'lead_angle_rad': lead_angle_rad,
            'engagement_delay_s': engagement_delay_s,
            'duration_ms': duration_ms,
            'speed_factor': speed_factor,
            'aggression': aggression,
            # Store original for debugging
            'original_distance_px': distance_px,
            'original_angle_rad': angle_rad,
            'lead_factor': lead_factor,
            'urgency': urgency,
        }

    def _generate_bezier_waypoints(self, start_x, start_y, end_x, end_y, params):
        """
        Generate cubic bezier curve waypoints for smooth mouse movement.

        Args:
            start_x, start_y: Starting mouse position
            end_x, end_y: Target mouse position (creates lead point for missile)
            params: Correction parameters from _calculate_correction_params

        Returns:
            List of (x, y, timestamp_ms) waypoints
        """
        duration_ms = params['duration_ms']
        aggression = params['aggression']

        # Calculate control points for cubic bezier
        # Higher aggression = more pronounced curve
        dx = end_x - start_x
        dy = end_y - start_y

        # Control point 1: offset from start
        cp1_x = start_x + dx * (0.25 + aggression * 0.1)
        cp1_y = start_y + dy * (0.1 + aggression * 0.2)

        # Control point 2: offset from end
        cp2_x = end_x - dx * (0.1 + aggression * 0.2)
        cp2_y = end_y - dy * (0.25 + aggression * 0.1)

        # Generate waypoints along curve
        waypoints = []
        steps = max(20, int(duration_ms / 10))  # ~10ms per step minimum

        for i in range(steps + 1):
            t = i / steps

            # Smoothstep easing: smooth acceleration and deceleration
            t_eased = t * t * (3 - 2 * t)

            # Cubic bezier formula: B(t) = (1-t)³P₀ + 3(1-t)²tP₁ + 3(1-t)t²P₂ + t³P₃
            u = 1 - t_eased
            x = (u**3 * start_x +
                 3 * u**2 * t_eased * cp1_x +
                 3 * u * t_eased**2 * cp2_x +
                 t_eased**3 * end_x)
            y = (u**3 * start_y +
                 3 * u**2 * t_eased * cp1_y +
                 3 * u * t_eased**2 * cp2_y +
                 t_eased**3 * end_y)

            timestamp_ms = i * duration_ms / steps
            waypoints.append((x, y, timestamp_ms))

        return waypoints

    def _start_auto_correction(self, distance_px, angle_rad):
        """
        Start auto-correction: generate mouse movements to guide missile from x to o.

        This calculates lead point t and generates smooth mouse movements that will
        create the crosshair motion needed for missile intercept.

        Args:
            distance_px: Current displacement distance (d)
            angle_rad: Current displacement angle (n)
        """
        if self.correction_active:
            return  # Already correcting

        # Calculate correction parameters (includes lead calculation)
        params = self._calculate_correction_params(distance_px, angle_rad)

        # Get current mouse position
        if not PYNPUT_OK:
            print("Warning: pynput not available, cannot perform auto-correction")
            self._reset_to_calibrated_position()
            return

        try:
            self.mouse_controller = pynmouse.Controller()
            current_mouse_x, current_mouse_y = self.mouse_controller.position
        except Exception as e:
            print(f"Warning: Could not get mouse position: {e}")
            self._reset_to_calibrated_position()
            return

        # Calculate target mouse position using lead parameters
        # lead_distance_px and lead_angle_rad define vector y (from x to lead point t)
        # This is in screen coordinate system, relative to current mouse position

        # Convert polar (lead_distance, lead_angle) to Cartesian (mouse_dx, mouse_dy)
        # The lead angle is in overlay coordinate system, need to apply to mouse
        mouse_dx = params['lead_distance_px'] * math.cos(params['lead_angle_rad'])
        mouse_dy = params['lead_distance_px'] * math.sin(params['lead_angle_rad'])

        # Calculate target mouse position
        # Note: This moves the mouse, which will counter-translate the overlay
        # The overlay movement changes crosshair position, which guides the missile
        target_mouse_x = current_mouse_x + mouse_dx
        target_mouse_y = current_mouse_y + mouse_dy

        # Generate smooth bezier path from current to target mouse position
        waypoints = self._generate_bezier_waypoints(
            current_mouse_x, current_mouse_y,
            target_mouse_x, target_mouse_y,
            params
        )

        # Store waypoints and start correction
        self.correction_waypoints = waypoints
        self.correction_waypoint_index = 0
        self.correction_active = True
        self.correction_interrupted.clear()
        self.correction_start_time = time.perf_counter()

        # Debug output
        print(f"Auto-correction started:")
        print(f"  Displacement: {distance_px:.1f}px at {math.degrees(angle_rad):.1f}°")
        print(f"  Lead: {params['lead_distance_px']:.1f}px (factor: {params['lead_factor']:.2f})")
        print(f"  Duration: {params['duration_ms']:.0f}ms, urgency: {params['urgency']:.2f}")
        print(f"  Mouse: ({current_mouse_x}, {current_mouse_y}) → ({target_mouse_x:.0f}, {target_mouse_y:.0f})")
        print(f"  Waypoints: {len(waypoints)}")

        # Schedule correction animation to start after engagement delay
        delay_ms = int(params['engagement_delay_s'] * 1000)
        self.root.after(delay_ms, self._correction_animation_step)

    def _correction_animation_step(self):
        """
        Execute one step of correction animation.

        Runs in main thread, moves mouse along waypoint path.
        User manual movements are ADDED to this, not interrupted.
        """
        # Check if correction was cancelled
        if not self.correction_active or self.correction_interrupted.is_set():
            self._cleanup_correction()
            return

        # Check if we've finished all waypoints
        if self.correction_waypoint_index >= len(self.correction_waypoints):
            print(f"Auto-correction complete (took {time.perf_counter() - self.correction_start_time:.2f}s)")
            # Move overlay back to calibrated position
            # (missile should be approaching target at this point)
            self._reset_to_calibrated_position()
            self._cleanup_correction()
            return

        # Get current waypoint
        target_x, target_y, timestamp_ms = self.correction_waypoints[self.correction_waypoint_index]

        # Calculate relative movement from previous waypoint (or current position)
        if self.correction_waypoint_index == 0:
            # First waypoint - get current actual mouse position
            try:
                current_x, current_y = self.mouse_controller.position
            except:
                current_x, current_y = target_x, target_y
        else:
            # Use previous waypoint
            current_x, current_y, _ = self.correction_waypoints[self.correction_waypoint_index - 1]

        # Calculate delta for relative movement
        delta_x = int(target_x - current_x)
        delta_y = int(target_y - current_y)

        # Use Windows SendInput for relative mouse movement (better game compatibility)
        # This bypasses some game input filtering that blocks absolute positioning
        try:
            self._inject_mouse_movement(delta_x, delta_y)
        except Exception as e:
            print(f"Warning: Could not move mouse: {e}")
            self._cleanup_correction()
            return

        # Move to next waypoint
        self.correction_waypoint_index += 1

        # Calculate delay to next waypoint
        if self.correction_waypoint_index < len(self.correction_waypoints):
            next_timestamp_ms = self.correction_waypoints[self.correction_waypoint_index][2]
            delay_ms = max(1, int(next_timestamp_ms - timestamp_ms))
        else:
            delay_ms = 1

        # Schedule next step
        self.root.after(delay_ms, self._correction_animation_step)

    def _inject_mouse_movement(self, dx, dy):
        """
        Inject relative mouse movement using Windows SendInput API.

        Uses MOUSEEVENTF_MOVE for relative movement, which has better
        compatibility with games using Raw Input.

        Args:
            dx: Relative X movement in pixels
            dy: Relative Y movement in pixels
        """
        try:
            import ctypes
            from ctypes import wintypes

            # Define Windows input structures
            class MOUSEINPUT(ctypes.Structure):
                _fields_ = [
                    ('dx', wintypes.LONG),
                    ('dy', wintypes.LONG),
                    ('mouseData', wintypes.DWORD),
                    ('dwFlags', wintypes.DWORD),
                    ('time', wintypes.DWORD),
                    ('dwExtraInfo', ctypes.POINTER(wintypes.ULONG))
                ]

            class INPUT(ctypes.Structure):
                class _INPUT(ctypes.Union):
                    _fields_ = [('mi', MOUSEINPUT)]
                _anonymous_ = ('_input',)
                _fields_ = [
                    ('type', wintypes.DWORD),
                    ('_input', _INPUT)
                ]

            # Constants
            INPUT_MOUSE = 0
            MOUSEEVENTF_MOVE = 0x0001

            # Create input structure
            extra = ctypes.c_ulong(0)
            ii_ = INPUT()
            ii_.type = INPUT_MOUSE
            ii_.mi = MOUSEINPUT(dx, dy, 0, MOUSEEVENTF_MOVE, 0, ctypes.pointer(extra))

            # Send the input
            ctypes.windll.user32.SendInput(1, ctypes.pointer(ii_), ctypes.sizeof(ii_))

        except Exception as e:
            print(f"Warning: Failed to inject mouse movement via SendInput: {e}")
            # Fallback to pynput if SendInput fails
            try:
                current_x, current_y = self.mouse_controller.position
                self.mouse_controller.position = (current_x + dx, current_y + dy)
            except:
                pass

    def _cleanup_correction(self):
        """Clean up correction state."""
        self.correction_active = False
        self.correction_waypoints = []
        self.correction_waypoint_index = 0
        self.correction_interrupted.clear()
        self.mouse_controller = None

    def _reset_to_calibrated_position(self):
        """Reset overlay to calibrated position."""
        self.win_x = self.calibrated_x
        self.win_y = self.calibrated_y
        self._apply_geometry()

    def _exit_to_calibrate(self):
        """Exit locked mode and return to calibrate mode."""
        # Cancel any active correction
        if self.correction_active:
            self.correction_interrupted.set()
            self._cleanup_correction()

        self.state = "calibrate"
        self.tracking_active = False

        # Stop update timer if running
        if self.update_timer_id is not None:
            self.root.after_cancel(self.update_timer_id)
            self.update_timer_id = None

        # Stop mouse listener if running
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

        self._set_clickthrough(False)
        bar_h = 28
        self.root.geometry(f"{self.img_w}x{self.img_h + bar_h}")
        self.bar.pack(side=tk.BOTTOM, fill=tk.X)
        self.status_lbl.config(
            text="CALIBRATE  |  Ctrl+L = lock    Ctrl+P = quit",
            fg="#555"
        )
        # Redraw boundary box
        self._draw_boundary_box()

    def _on_mouse_move(self, x, y):
        """Handle mouse movement (called from pynput listener thread)."""
        if self.last_mouse_x is None:
            # First event after lock — store position, emit no delta
            self.last_mouse_x = x
            self.last_mouse_y = y
            # Initialize thread-local position tracking
            self.tracking_win_x = self.win_x
            self.tracking_win_y = self.win_y
            return

        dx = x - self.last_mouse_x
        dy = y - self.last_mouse_y
        self.last_mouse_x = x
        self.last_mouse_y = y

        # Calculate new position with counter-translation
        # Use thread-local position to avoid race conditions with main thread
        new_x = self.tracking_win_x - dx
        new_y = self.tracking_win_y - dy

        # Update thread-local position BEFORE clamping for next delta calculation
        # This prevents accumulated error when hitting boundaries
        self.tracking_win_x = new_x
        self.tracking_win_y = new_y

        # Clamp to bounding box relative to origin (origin = box center, not top-left)
        # We want to keep the overlay center within margin distance from origin
        # Only clamp the displayed position, not the tracking position
        if self.origin_x is not None and self.origin_y is not None:
            # Calculate bounds for overlay top-left corner
            # such that overlay center stays within the bounding box
            min_x = self.origin_x - self.margin_x - self.img_w / 2
            max_x = self.origin_x + self.margin_x - self.img_w / 2
            min_y = self.origin_y - self.margin_y - self.img_h / 2
            max_y = self.origin_y + self.margin_y - self.img_h / 2

            new_x = max(min_x, min(new_x, max_x))
            new_y = max(min_y, min(new_y, max_y))

        # Throttle queue updates to ~1000Hz max (1ms between updates)
        # Matches high polling rate mice while preventing excessive overhead
        current_time = time.perf_counter()
        if current_time - self.last_update_time < 0.001:
            return  # Skip this update, too soon since last one
        self.last_update_time = current_time

        # Queue the position update for main thread to process
        # No Tkinter calls from this thread - this is thread-safe
        with self.position_lock:
            self.position_queue.clear()  # Remove old position
            self.position_queue.append((new_x, new_y))  # Add new position

    # ------------------------------------------- global keyboard via pynput

    def _start_kbd_listener(self):
        if not PYNPUT_OK:
            return

        # Track CTRL key state
        self.ctrl_pressed = False

        def on_press(key):
            try:
                # If waiting for tracking key setup, capture this key
                if self.awaiting_tracking_key:
                    self.root.after(0, lambda k=key: self._set_tracking_key(k))
                    return

                # Track CTRL key state
                if key in (pynkeyboard.Key.ctrl_l, pynkeyboard.Key.ctrl_r, pynkeyboard.Key.ctrl):
                    self.ctrl_pressed = True
                    return

                # Handle configured tracking key
                if self.tracking_key is not None:
                    # Check if this is the tracking key
                    is_tracking_key = False
                    if isinstance(self.tracking_key, str):
                        # Character key
                        char = None
                        if hasattr(key, 'char'):
                            char = key.char
                        if char and char.lower() == self.tracking_key.lower():
                            is_tracking_key = True
                    else:
                        # Special key
                        if key == self.tracking_key:
                            is_tracking_key = True

                    if is_tracking_key:
                        if self.state == "locked" and not self.tracking_active:
                            self.root.after(0, self._start_tracking)
                        return

                # Try to get the character from the key
                char = None
                if hasattr(key, 'char'):
                    char = key.char
                elif hasattr(key, 'name'):
                    char = key.name

                # Check for CTRL+key combinations
                if self.ctrl_pressed:
                    if char and char.lower() == 'l':
                        self.root.after(0, self._toggle_lock)
                    elif char and char.lower() == 'o':
                        if self.state != "locked":
                            self.root.after(0, self._open_image)
                    elif char and char.lower() == 'p':
                        self.root.after(0, self._quit)
            except Exception:
                # Silently ignore errors but could log them for debugging
                pass

        def on_release(key):
            try:
                # Track CTRL key state
                if key in (pynkeyboard.Key.ctrl_l, pynkeyboard.Key.ctrl_r, pynkeyboard.Key.ctrl):
                    self.ctrl_pressed = False
                    return

                # Handle configured tracking key release
                if self.tracking_key is not None:
                    is_tracking_key = False
                    if isinstance(self.tracking_key, str):
                        # Character key
                        char = None
                        if hasattr(key, 'char'):
                            char = key.char
                        if char and char.lower() == self.tracking_key.lower():
                            is_tracking_key = True
                    else:
                        # Special key
                        if key == self.tracking_key:
                            is_tracking_key = True

                    if is_tracking_key:
                        if self.state == "locked" and self.tracking_active:
                            self.root.after(0, self._stop_tracking)
            except Exception:
                pass

        try:
            self.kbd_listener = pynkeyboard.Listener(
                on_press=on_press,
                on_release=on_release
            )
            self.kbd_listener.start()
            print("Global keyboard listener started (may require admin rights on Windows)")
        except Exception as e:
            print(f"Warning: Could not start global keyboard listener: {e}")
            print("Keyboard shortcuts will only work when overlay window has focus.")

    # ------------------------------------------- Windows click-through

    def _set_clickthrough(self, enable):
        try:
            import ctypes
            hwnd = ctypes.windll.user32.FindWindowW(None, "SACLOS Overlay")
            if not hwnd:
                return
            GWL_EXSTYLE       = -20
            WS_EX_LAYERED     = 0x00080000
            WS_EX_TRANSPARENT = 0x00000020
            style = ctypes.windll.user32.GetWindowLongW(hwnd, GWL_EXSTYLE)
            if enable:
                style |= (WS_EX_LAYERED | WS_EX_TRANSPARENT)
            else:
                style &= ~WS_EX_TRANSPARENT
            ctypes.windll.user32.SetWindowLongW(hwnd, GWL_EXSTYLE, style)
        except Exception:
            pass

    # -------------------------------------------------------------------  quit

    def _quit(self):
        # Save config before exiting
        self._save_config()

        # Stop update timer
        if self.update_timer_id is not None:
            self.root.after_cancel(self.update_timer_id)
            self.update_timer_id = None

        # Stop and wait for mouse listener thread
        if self.mouse_listener:
            self.mouse_listener.stop()
            try:
                self.mouse_listener.join(timeout=1.0)
            except Exception:
                pass

        # Stop and wait for keyboard listener thread
        if self.kbd_listener:
            self.kbd_listener.stop()
            try:
                self.kbd_listener.join(timeout=1.0)
            except Exception:
                pass

        self.root.destroy()


def main():
    import argparse
    parser = argparse.ArgumentParser(description="SACLOS Overlay with bounded counter-translation")
    parser.add_argument("image", nargs="?", help="Path to overlay image (PNG/BMP)")
    parser.add_argument("--margins", nargs=2, type=int, metavar=("HORIZONTAL", "VERTICAL"),
                        default=[700, 400],
                        help="Movement margins in pixels (default: 700 400)")
    parser.add_argument("--tracking-image", type=str, metavar="PATH",
                        help="Optional separate image for tracking mode (if not specified, uses main image)")
    parser.add_argument("--setup-tracking-key", action="store_true",
                        help="Prompt to reconfigure the tracking key")
    parser.add_argument("--range", type=float, default=200.0,
                        help="Range to target in meters (default: 200)")
    parser.add_argument("--disable-correction", action="store_true",
                        help="Disable auto-correction on tracking key release")
    parser.add_argument("--correction-speed", type=float, default=1.0,
                        help="Correction speed multiplier (default: 1.0)")
    args = parser.parse_args()

    root = tk.Tk()
    app = SACLOSOverlay(root, image_path=args.image,
                        tracking_image_path=args.tracking_image,
                        margin_x=args.margins[0], margin_y=args.margins[1])

    # Apply command-line overrides for auto-correction
    if hasattr(args, 'range'):
        app.target_range_m = args.range
    if hasattr(args, 'disable_correction') and args.disable_correction:
        app.correction_enabled = False
    if hasattr(args, 'correction_speed'):
        app.correction_speed_multiplier = args.correction_speed

    # Force tracking key setup if requested
    if args.setup_tracking_key:
        app.tracking_key = None
        app.tracking_key_name = "Space"
        app.root.after(500, app._prompt_for_tracking_key)

    root.mainloop()


if __name__ == "__main__":
    main()