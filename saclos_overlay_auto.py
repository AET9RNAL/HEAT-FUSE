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
import traceback

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

# ---------------------------------------------------------------------------
#  SendInput infrastructure  (defined once at module level, reused every call)
# ---------------------------------------------------------------------------
import ctypes
import ctypes.wintypes as _wt

class _MOUSEINPUT(ctypes.Structure):
    _fields_ = [
        ('dx',          _wt.LONG),
        ('dy',          _wt.LONG),
        ('mouseData',   _wt.DWORD),
        ('dwFlags',     _wt.DWORD),
        ('time',        _wt.DWORD),
        ('dwExtraInfo', ctypes.c_size_t),   # ULONG_PTR — must be 0
    ]

class _INPUT(ctypes.Structure):
    class _U(ctypes.Union):
        _fields_ = [('mi', _MOUSEINPUT)]
    _anonymous_ = ('_u',)
    _fields_ = [
        ('type', _wt.DWORD),
        ('_u',   _U),
    ]

_INPUT_MOUSE          = 0
_MOUSEEVENTF_MOVE     = 0x0001
_MOUSEEVENTF_LEFTDOWN = 0x0002
_MOUSEEVENTF_LEFTUP   = 0x0004

_SendInput = ctypes.windll.user32.SendInput
_SendInput.restype = ctypes.c_uint

# High-resolution timer  (1 ms instead of default ~15.6 ms)
_timer_active = False
def _enable_hires_timer():
    global _timer_active
    if not _timer_active:
        ctypes.windll.winmm.timeBeginPeriod(1)
        _timer_active = True

def _disable_hires_timer():
    global _timer_active
    if _timer_active:
        ctypes.windll.winmm.timeEndPeriod(1)
        _timer_active = False

def _is_admin():
    """Return True if the process is running with administrator privileges."""
    try:
        return ctypes.windll.shell32.IsUserAnAdmin() != 0
    except Exception:
        return False


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
        self.pre_correction_delay_ms = 150  # Delay before starting correction (lets clicks complete)

        # ML-assisted correction
        self.ml_enabled = False       # Set via --ml flag
        self.ml_confidence_threshold = 0.3  # Minimum confidence to use ML prediction
        self.ml_online_learning = True  # Save ML predictions that result in hits
        self.learner = None           # CorrectionLearner instance (lazy-loaded)
        self._ml_awaiting_label = False  # Online learning: waiting for HIT/DISCARD
        self._ml_last_context = None    # Online learning: last prediction context

        # Turret/vehicle traverse limits (critical for realistic guidance)
        self.turret_traverse_speed_deg_s = 51.3  # Maximum turret rotation speed in degrees/second
        self.turret_instant_follow_deg = 15.0  # Turret follows scope instantly within this window
        self.pixels_per_degree = 10.0  # Pixel-to-angular conversion factor (user-tunable)

        # Mouse sensitivity scaling
        # CRITICAL: SendInput "mickeys" ≠ screen pixels
        # This factor converts overlay pixels → SendInput units
        # Must be calibrated: if correction moves cursor HALF the expected distance, set to 2.0
        self.mouse_sensitivity_scale = 1.0  # Multiplier applied to all injected mouse deltas

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

        # Range finder state
        self.rf_key = None          # pynput key object for range finder toggle
        self.rf_key_name = "r"      # Display name for range finder key (default: R)
        self.rf_visible = False
        self.rf_pending_range = None
        self.rf_mouse_listener = None
        self.rf_update_timer = None
        self.rf_mouse_y_anchor = None
        self.rf_range_anchor = None
        self.rf_hwnd = None

        # Range finder constants
        self.RF_WIDTH = 80
        self.RF_HEIGHT = 300
        self.RF_SCALE_TOP = 30      # Canvas Y for 600m (top)
        self.RF_SCALE_BOTTOM = 280  # Canvas Y for 70m (bottom)
        self.RF_RANGE_MIN = 70.0
        self.RF_RANGE_MAX = 600.0
        self.RF_COLOR = "#77ffaa"

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

        # Create range finder window (hidden until Ctrl+R)
        self._create_rangefinder_window()

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
            "rf_key_name": self.rf_key_name,
            # Auto-correction settings
            "correction_enabled": self.correction_enabled,
            "target_range_m": self.target_range_m,
            "correction_min_threshold_px": self.correction_min_threshold_px,
            "correction_speed_multiplier": self.correction_speed_multiplier,
            "pre_correction_delay_ms": self.pre_correction_delay_ms,
            "turret_traverse_speed_deg_s": self.turret_traverse_speed_deg_s,
            "turret_instant_follow_deg": self.turret_instant_follow_deg,
            "pixels_per_degree": self.pixels_per_degree,
            "mouse_sensitivity_scale": self.mouse_sensitivity_scale,
            # Algorithm parameters
            "lead_alpha": self.lead_alpha,
            "lead_beta": self.lead_beta,
            "lead_gamma": self.lead_gamma,
            "urgency_k": self.urgency_k,
            "base_engagement_delay_s": self.base_engagement_delay_s,
            "base_duration_ms": self.base_duration_ms,
            # ML settings
            "ml_enabled": self.ml_enabled,
            "ml_confidence_threshold": self.ml_confidence_threshold,
            "ml_online_learning": getattr(self, 'ml_online_learning', True),
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

            # Load range finder key
            self.rf_key_name = config.get("rf_key_name", "r")
            self._update_rf_key_from_name()

            # Load auto-correction settings
            self.correction_enabled = config.get("correction_enabled", True)
            self.target_range_m = config.get("target_range_m", 200.0)
            self.correction_min_threshold_px = config.get("correction_min_threshold_px", 5.0)
            self.correction_speed_multiplier = config.get("correction_speed_multiplier", 1.0)
            self.pre_correction_delay_ms = config.get("pre_correction_delay_ms", 150)
            self.turret_traverse_speed_deg_s = config.get("turret_traverse_speed_deg_s", 51.3)
            self.turret_instant_follow_deg = config.get("turret_instant_follow_deg", 15.0)
            self.pixels_per_degree = config.get("pixels_per_degree", 10.0)
            self.mouse_sensitivity_scale = config.get("mouse_sensitivity_scale", 1.0)
            # Algorithm parameters
            self.lead_alpha = config.get("lead_alpha", 1.0)
            self.lead_beta = config.get("lead_beta", 0.5)
            self.lead_gamma = config.get("lead_gamma", 0.3)
            self.urgency_k = config.get("urgency_k", 2.0)
            self.base_engagement_delay_s = config.get("base_engagement_delay_s", 0.05)
            self.base_duration_ms = config.get("base_duration_ms", 300.0)

            # ML settings
            self.ml_enabled = config.get("ml_enabled", False)
            self.ml_confidence_threshold = config.get("ml_confidence_threshold", 0.3)
            self.ml_online_learning = config.get("ml_online_learning", True)
            if self.ml_enabled and self.learner is None:
                try:
                    from saclos_trainer import CorrectionLearner
                    self.learner = CorrectionLearner()
                    stats = self.learner.get_stats()
                    print(f"  ML loaded: {stats['total']} samples "
                          f"({stats['hits']} hits, {stats['misses']} misses)")
                except Exception as e:
                    print(f"  ML load failed: {e}")
                    self.ml_enabled = False

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

    def _update_rf_key_from_name(self):
        """Convert range finder key name to pynput key object."""
        if not PYNPUT_OK:
            return

        key_map = {
            "Space": pynkeyboard.Key.space,
            "Shift": pynkeyboard.Key.shift,
            "Alt": pynkeyboard.Key.alt,
            "Tab": pynkeyboard.Key.tab,
            "CapsLock": pynkeyboard.Key.caps_lock,
        }

        if self.rf_key_name in key_map:
            self.rf_key = key_map[self.rf_key_name]
        else:
            self.rf_key = self.rf_key_name.lower()

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

            # Start auto-correction immediately
            # Mouse injection runs in a background thread via SendInput,
            # which is immune to user clicks blocking Tkinter's event loop
            self.root.after(0, lambda: self._start_auto_correction(distance_px, angle_rad))
        else:
            # We must still fire the missile even if no movement is needed!
            # Otherwise, aiming perfectly results in no shot being taken.
            if self.correction_enabled:
                import threading
                threading.Thread(target=self._inject_mouse_click, daemon=True).start()

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

        # === RANGE PROXIMITY ===
        # Proximity should INCREASE with range because more distance requires a stronger
        # initial course correction (more pixels of lead) to bend the trajectory.
        # Scaled linearly from 1.2x at close range, up to 2.7x at 500m
        range_proximity = 1.2 + r_norm * 1.5

        # === LEAD FACTOR (Overcompensation) ===
        # How much to overshoot target to create intercept trajectory
        # Base factors from displacement and angle
        base_lead = (
            self.lead_alpha * d_norm +           # Distance contribution
            self.lead_beta * n_norm +             # Angle contribution
            self.lead_gamma * urgency             # Urgency contribution
        )
        # Scale by range proximity: distant targets multiply overcompensation
        lead_factor = base_lead * range_proximity
        lead_factor = max(lead_factor, 1.0)  # Minimum 100% overcompensation
        lead_factor = min(lead_factor, 3.0)  # Cap at 300%

        # Calculate initial unbounded lead distance
        lead_distance_px_raw = distance_px * (1 + lead_factor)
        
        # Calculate how many pixels PAST the origin this represents (overshoot)
        overshoot_px = lead_distance_px_raw - distance_px
        
        # === LEAD DISTANCE (d') ===
        # CRITICAL: Cap the overshoot based on range. 
        # Large initial displacements should NOT result in linearly unbounded overshoots!
        # This keeps the total movement bounded and prevents over-correction (missile diving).
        # At 80m -> 72px max overshoot. At 400m -> 120px.
        max_overshoot_px = 60.0 + (self.target_range_m / 100.0) * 15.0
        
        overshoot_px = min(overshoot_px, max_overshoot_px)
        
        # Reconstruct final lead distance
        # Apply mouse sensitivity scale to convert overlay pixels → SendInput units
        lead_distance_px = (distance_px + overshoot_px) * self.mouse_sensitivity_scale

        # === LEAD ANGLE (n') ===
        # Direction of mouse movement
        # angle_rad points from overlay position TO origin (direction of displacement v)
        # But y must have OPPOSITE direction to v (to correct the displacement)
        # When overlay is displaced RIGHT of origin, we need to move mouse LEFT
        # to bring the crosshair back (and guide missile back to target)
        lead_angle_rad = angle_rad + math.pi  # Opposite direction to displacement
        # TODO: Add angular lead offset δ based on trajectory prediction

        # === ENGAGEMENT DELAY (s) ===
        # Time to wait before starting correction
        # Base delay scales proportionally with range (r_norm)
        # e.g., 400m -> high delay (let it fly straight for a bit). 80m -> low delay.
        base_range_delay_s = self.base_engagement_delay_s * r_norm
        
        # Modulate dynamically by d and n (via urgency)
        # If the launch displacement/angle is severely bad, we reduce the delay
        # to force a faster intercept, counter-acting the range safety.
        engagement_delay_s = base_range_delay_s / (1.0 + self.urgency_k * urgency)
        
        # Apply a tiny, safe lower-bound limit
        engagement_delay_s = max(0.01, engagement_delay_s)  # Minimum 10ms safety

        # === SPEED FACTOR ===
        # How fast to execute movement (higher = faster)
        speed_factor = 1.0 + urgency
        speed_factor *= self.correction_speed_multiplier  # Apply global multiplier

        # === DURATION ===
        # Total time for correction movement
        # Inversely proportional to speed/urgency
        duration_ms = self.base_duration_ms / speed_factor

        # === TURRET TRAVERSE LIMIT ===
        # CRITICAL: Turret follows scope INSTANTLY within a small window (~15°),
        # then engages normal traverse rate (51.3°/s) for the excess beyond that.
        # Convert pixel distance to angular distance
        angular_distance_deg = lead_distance_px / self.pixels_per_degree

        if angular_distance_deg <= self.turret_instant_follow_deg:
            # Within instant-follow window - turret tracks scope with zero delay
            min_duration_ms = 0.0
        else:
            # Only rate-limit the angular distance BEYOND the instant window
            excess_deg = angular_distance_deg - self.turret_instant_follow_deg
            min_duration_ms = (excess_deg / self.turret_traverse_speed_deg_s) * 1000.0
            # Add 20% safety margin for the rate-limited portion
            min_duration_ms *= 1.2

        # Duration must be AT LEAST the minimum needed for turret to traverse
        # Otherwise turret can't keep up and guidance fails
        duration_ms = max(duration_ms, min_duration_ms)

        # Still apply upper bound to prevent extremely slow corrections
        duration_ms = min(duration_ms, 3000.0)  # Max 3 seconds

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
            'base_lead': base_lead,
            'lead_factor': lead_factor,
            'range_proximity': range_proximity,
            'urgency': urgency,
            'min_duration_ms': min_duration_ms,
            'angular_distance_deg': angular_distance_deg,
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

        Supports two modes:
        - Formula mode (default): Uses physics-based heuristic formula
        - ML mode (--ml): Uses KNN regression on recorded human guidance data

        Args:
            distance_px: Current displacement distance (d)
            angle_rad: Current displacement angle (n)
        """
        if self.correction_active:
            return  # Already correcting

        # Clear any stale online learning prompt (auto-discard if new cycle starts)
        if getattr(self, '_ml_awaiting_label', False):
            print("  DISCARDED  (new cycle started)")
        self._ml_awaiting_label = False
        self._ml_last_context = None

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

        # ---- Try ML prediction first ----
        ml_used = False
        if self.ml_enabled and self.learner is not None:
            try:
                ml_trajectory, confidence = self.learner.predict(
                    distance_px, angle_rad, self.target_range_m
                )
                if confidence >= self.ml_confidence_threshold and ml_trajectory is not None:
                    ml_used = True

                    total_dx = sum(p['dx'] for p in ml_trajectory)
                    total_dy = sum(p['dy'] for p in ml_trajectory)
                    duration = ml_trajectory[-1]['t'] if ml_trajectory else 0

                    stats = self.learner.get_stats()
                    print(f"Auto-correction started [ML TRAJECTORY mode]:")
                    print(f"  Displacement v: {distance_px:.1f}px at {math.degrees(angle_rad):.1f}°")
                    print(f"  Range: {self.target_range_m:.0f}m")
                    print(f"  ML trajectory: {len(ml_trajectory)} points, "
                          f"dx={total_dx:.0f} dy={total_dy:.0f} dur={duration:.2f}s")
                    print(f"  ML confidence: {confidence:.2f}  "
                          f"(threshold: {self.ml_confidence_threshold:.2f})")
                    print(f"  Training data: {stats['total']} samples "
                          f"({stats['hits']} hits, {stats['misses']} misses)")

                    # Store context for online learning
                    self._ml_last_context = {
                        'displacement_px': distance_px,
                        'angle_rad': angle_rad,
                        'range_m': self.target_range_m,
                        'trajectory': ml_trajectory,
                    }

                    # Launch trajectory replay thread
                    self.correction_active = True
                    self.correction_interrupted.clear()
                    self.correction_start_time = time.perf_counter()
                    self.correction_thread = threading.Thread(
                        target=self._ml_trajectory_thread_func,
                        args=(ml_trajectory,),
                        daemon=True
                    )
                    self.correction_thread.start()
                    return  # Done — trajectory thread handles everything

                else:
                    if ml_trajectory is None:
                        print(f"  ML: insufficient data, falling back to formula")
                    else:
                        print(f"  ML: confidence {confidence:.2f} below threshold "
                              f"{self.ml_confidence_threshold:.2f}, falling back to formula")
            except Exception as e:
                print(f"  ML prediction error: {e}")
                traceback.print_exc()

        # ---- Formula fallback ----
        params = self._calculate_correction_params(distance_px, angle_rad)

        mouse_dx = params['lead_distance_px'] * math.cos(params['lead_angle_rad'])
        mouse_dy = params['lead_distance_px'] * math.sin(params['lead_angle_rad'])

        target_mouse_x = current_mouse_x + mouse_dx
        target_mouse_y = current_mouse_y + mouse_dy

        waypoints = self._generate_bezier_waypoints(
            current_mouse_x, current_mouse_y,
            target_mouse_x, target_mouse_y,
            params
        )

        engagement_delay_s = params['engagement_delay_s']

        print(f"Auto-correction started [FORMULA mode]:")
        print(f"  Displacement v: {distance_px:.1f}px at {math.degrees(angle_rad):.1f}°")
        print(f"  Range: {self.target_range_m:.0f}m → proximity: {params['range_proximity']:.2f}x")
        print(f"  Lead y: {params['lead_distance_px']:.1f}px at {math.degrees(params['lead_angle_rad']):.1f}° (base: {params['base_lead']:.2f}, factor: {params['lead_factor']:.2f})")
        print(f"  Direction check: v={math.degrees(angle_rad):.1f}°, y={math.degrees(params['lead_angle_rad']):.1f}° (should be ~180° apart)")
        in_instant = params['angular_distance_deg'] <= self.turret_instant_follow_deg
        print(f"  Angular: {params['angular_distance_deg']:.2f}° traverse needed {'(INSTANT FOLLOW)' if in_instant else ''}")
        print(f"  Traverse: {self.turret_instant_follow_deg:.0f}° instant window, {self.turret_traverse_speed_deg_s:.1f}°/s beyond → min duration: {params['min_duration_ms']:.0f}ms")
        print(f"  Duration: {params['duration_ms']:.0f}ms (urgency: {params['urgency']:.2f})")
        print(f"  Mouse sensitivity: {self.mouse_sensitivity_scale:.1f}x")
        print(f"  Mouse: ({current_mouse_x}, {current_mouse_y}) → ({target_mouse_x:.0f}, {target_mouse_y:.0f})")
        print(f"  Mouse delta: ({mouse_dx:.0f}, {mouse_dy:.0f})")
        print(f"  Pre-correction delay: {self.pre_correction_delay_ms}ms, engagement delay: {params['engagement_delay_s']*1000:.0f}ms")

        # ---- Store waypoints and start formula correction ----
        self.correction_waypoints = waypoints
        self.correction_waypoint_index = 0
        self.correction_active = True
        self.correction_interrupted.clear()
        self.correction_start_time = time.perf_counter()

        self.correction_thread = threading.Thread(
            target=self._correction_thread_func,
            args=(engagement_delay_s,),
            daemon=True
        )
        self.correction_thread.start()

    def _ml_trajectory_thread_func(self, trajectory):
        """
        Replay a recorded human mouse trajectory with exact timing.

        Each entry in trajectory is {'t': seconds, 'dx': pixels, 'dy': pixels}.
        The timing preserves the original human dynamics — fast slews,
        slow fine adjustments, pauses, etc.
        """
        # Fire LMB first (same as formula mode)
        self._inject_mouse_click()

        start_time = time.perf_counter()
        cumulative_dx = 0.0
        cumulative_dy = 0.0
        injected_dx = 0
        injected_dy = 0

        for i, pt in enumerate(trajectory):
            if not self.correction_active or self.correction_interrupted.is_set():
                break

            # Wait until this point's timestamp
            target_time = start_time + pt['t']
            now = time.perf_counter()
            sleep_s = target_time - now
            if sleep_s > 0.0005:  # Only sleep if > 0.5ms
                time.sleep(sleep_s)

            # Accumulate fractional deltas and inject integer steps
            cumulative_dx += pt['dx']
            cumulative_dy += pt['dy']
            inject_x = int(round(cumulative_dx)) - injected_dx
            inject_y = int(round(cumulative_dy)) - injected_dy

            if inject_x != 0 or inject_y != 0:
                try:
                    self._inject_mouse_movement(inject_x, inject_y)
                    injected_dx += inject_x
                    injected_dy += inject_y
                except Exception as e:
                    print(f"Warning: mouse injection error: {e}")
                    break

        elapsed = time.perf_counter() - start_time
        print(f"Auto-correction complete [ML] (took {elapsed:.2f}s, "
              f"injected {injected_dx}dx {injected_dy}dy)")

        # Online learning: prompt for HIT/MISS/DISCARD
        if getattr(self, 'ml_online_learning', True) and hasattr(self, '_ml_last_context'):
            ctx = self._ml_last_context
            self._ml_awaiting_label = True
            print()
            print(f"  >>> Press  [1] HIT  /  [2] MISS  /  [3] DISCARD  <<<")

        self.root.after(0, self._finish_correction)

    def _correction_thread_func(self, engagement_delay_s):
        """
        Execute correction animation in a background thread.

        Uses time.sleep() for timing instead of Tkinter's after(),
        making it immune to user clicks/input blocking the event loop.
        SendInput calls from this thread are still processed by the OS.
        """
        # Simulate LMB click FIRST (fires the missile in-game)
        # This replaces the user needing to manually click before releasing the key
        self._inject_mouse_click()

        # Legacy pre_correction_delay_ms was removed here.
        # We now rely entirely on the dynamically calculated engagement_delay_s 
        # to dictate the physical timing of the control surfaces.

        # Wait for engagement delay
        if engagement_delay_s > 0:
            time.sleep(engagement_delay_s)

        waypoints = self.correction_waypoints
        start_time = time.perf_counter()

        for i in range(len(waypoints)):
            # Check if correction was cancelled
            if not self.correction_active or self.correction_interrupted.is_set():
                break

            target_x, target_y, timestamp_ms = waypoints[i]

            # Calculate relative delta from previous waypoint
            if i == 0:
                try:
                    current_x, current_y = pynmouse.Controller().position
                except Exception:
                    current_x, current_y = target_x, target_y
            else:
                current_x, current_y, _ = waypoints[i - 1]

            delta_x = int(target_x - current_x)
            delta_y = int(target_y - current_y)

            # Inject mouse movement via SendInput (kernel-level, unaffected by clicks)
            try:
                self._inject_mouse_movement(delta_x, delta_y)
            except Exception as e:
                print(f"Warning: Could not move mouse: {e}")
                break

            # Sleep until next waypoint timestamp
            if i + 1 < len(waypoints):
                next_timestamp_ms = waypoints[i + 1][2]
                sleep_s = (next_timestamp_ms - timestamp_ms) / 1000.0
                if sleep_s > 0:
                    time.sleep(sleep_s)

        # Correction complete - schedule cleanup on main thread
        elapsed = time.perf_counter() - start_time
        print(f"Auto-correction complete (took {elapsed:.2f}s)")
        self.root.after(0, self._finish_correction)

    def _finish_correction(self):
        """Called on main thread after correction thread completes."""
        self._reset_to_calibrated_position()
        self._cleanup_correction()

    def _handle_ml_label(self, hit):
        """Online learning: save the last ML prediction as a HIT or MISS sample."""
        ctx = getattr(self, '_ml_last_context', None)
        if ctx is None or self.learner is None:
            print("  Warning: no ML context to save")
            return

        label = "HIT" if hit else "MISS"
        try:
            n = self.learner.add_sample(
                ctx['displacement_px'],
                ctx['angle_rad'],
                ctx['range_m'],
                ctx['trajectory'],
                hit=hit,
            )
            stats = self.learner.get_stats()
            print(f"  Saved {label}  -  total {n} samples  "
                  f"({stats['hits']} hits, {stats['misses']} misses)")
        except Exception as e:
            print(f"  Warning: failed to save ML sample: {e}")
        finally:
            self._ml_last_context = None

    def _inject_mouse_movement(self, dx, dy):
        """Inject relative mouse movement via SendInput (module-level structs)."""
        _enable_hires_timer()
        inp = _INPUT()
        inp.type = _INPUT_MOUSE
        inp.mi = _MOUSEINPUT(dx, dy, 0, _MOUSEEVENTF_MOVE, 0, 0)
        _SendInput(1, ctypes.pointer(inp), ctypes.sizeof(_INPUT))

    def _inject_mouse_click(self):
        """Inject a left mouse button click (down + up) via SendInput.

        Down and up are sent as a single atomic SendInput(2,...) call so the
        game cannot process other events between them, then we sleep 60 ms
        to let the game engine register the full click before any follow-up
        mouse movement begins.
        """
        _enable_hires_timer()
        events = (_INPUT * 2)()
        events[0].type = _INPUT_MOUSE
        events[0].mi = _MOUSEINPUT(0, 0, 0, _MOUSEEVENTF_LEFTDOWN, 0, 0)
        events[1].type = _INPUT_MOUSE
        events[1].mi = _MOUSEINPUT(0, 0, 0, _MOUSEEVENTF_LEFTUP, 0, 0)
        _SendInput(2, ctypes.pointer(events[0]), ctypes.sizeof(_INPUT))
        # Give the game engine time to process the click before we start
        # injecting mouse movement (missile guidance mode transition).
        time.sleep(0.06)

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

        # Hide range finder if visible
        if self.rf_visible:
            self._hide_rangefinder()

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
                # Online learning label keys: [1] HIT, [3] DISCARD
                if getattr(self, '_ml_awaiting_label', False):
                    char_label = getattr(key, 'char', None)
                    if char_label == '1':
                        self._ml_awaiting_label = False
                        self._handle_ml_label(hit=True)
                        return
                    elif char_label == '2':
                        self._ml_awaiting_label = False
                        self._handle_ml_label(hit=False)
                        return
                    elif char_label == '3':
                        self._ml_awaiting_label = False
                        self._ml_last_context = None
                        print("  DISCARDED  (not saved)")
                        return

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

                # Check for range finder keybind (standalone, no Ctrl needed)
                is_rf_key = False
                if self.rf_key is not None:
                    if isinstance(self.rf_key, str):
                        if char and char.lower() == self.rf_key.lower():
                            is_rf_key = True
                    else:
                        if key == self.rf_key:
                            is_rf_key = True
                elif char and char.lower() == self.rf_key_name.lower():
                    # Default: match by name before explicit key is set
                    is_rf_key = True

                if is_rf_key:
                    if self.state == "locked" and not self.tracking_active and not self.ctrl_pressed:
                        self.root.after(0, self._show_rangefinder)

                # Check for CTRL+key combinations
                if self.ctrl_pressed:
                    if char and char.lower() == 'l':
                        self.root.after(0, self._toggle_lock)
                    elif char and char.lower() == 'o':
                        if self.state != "locked":
                            self.root.after(0, self._open_image)
                    elif char and char.lower() == 'p':
                        self.root.after(0, self._quit)
            except Exception as e:
                import traceback
                print("Exception in on_press:", e)
                traceback.print_exc()

        def on_release(key):
            try:
                # Track CTRL key state
                if key in (pynkeyboard.Key.ctrl_l, pynkeyboard.Key.ctrl_r, pynkeyboard.Key.ctrl):
                    self.ctrl_pressed = False
                    return

                # Check range finder key release → hide range finder
                if self.rf_visible:
                    is_rf_release = False
                    if self.rf_key is not None:
                        if isinstance(self.rf_key, str):
                            r_char = None
                            if hasattr(key, 'char'):
                                r_char = key.char
                            if r_char and r_char.lower() == self.rf_key.lower():
                                is_rf_release = True
                        else:
                            if key == self.rf_key:
                                is_rf_release = True
                    else:
                        # Default: match by name
                        r_char = None
                        if hasattr(key, 'char'):
                            r_char = key.char
                        elif hasattr(key, 'name'):
                            r_char = key.name
                        if r_char and r_char.lower() == self.rf_key_name.lower():
                            is_rf_release = True
                    if is_rf_release:
                        self.root.after(0, self._hide_rangefinder)

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
            except Exception as e:
                import traceback
                print("Exception in on_release:", e)
                traceback.print_exc()

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

    # ------------------------------------------- Range Finder

    def _create_rangefinder_window(self):
        """Create the range finder Toplevel window (hidden until Ctrl+R)."""
        self.rf_win = tk.Toplevel(self.root)
        self.rf_win.title("SACLOS RangeFinder")
        self.rf_win.overrideredirect(True)
        self.rf_win.attributes("-topmost", True)
        self.rf_win.attributes("-transparentcolor", "#000001")
        self.rf_win.configure(bg="#000001")
        self.rf_win.geometry(f"{self.RF_WIDTH}x{self.RF_HEIGHT}")
        self.rf_win.withdraw()  # Hidden until Ctrl+R

        self.rf_canvas = tk.Canvas(
            self.rf_win, width=self.RF_WIDTH, height=self.RF_HEIGHT,
            bg="#000001", highlightthickness=0
        )
        self.rf_canvas.pack()

    def _range_to_canvas_y(self, range_m):
        """Convert range in meters to range finder canvas Y coordinate."""
        range_m = max(self.RF_RANGE_MIN, min(range_m, self.RF_RANGE_MAX))
        # 600m = top (RF_SCALE_TOP), 70m = bottom (RF_SCALE_BOTTOM)
        fraction = (self.RF_RANGE_MAX - range_m) / (self.RF_RANGE_MAX - self.RF_RANGE_MIN)
        return self.RF_SCALE_TOP + fraction * (self.RF_SCALE_BOTTOM - self.RF_SCALE_TOP)

    def _canvas_y_to_range(self, y):
        """Convert range finder canvas Y coordinate to range in meters."""
        y = max(self.RF_SCALE_TOP, min(y, self.RF_SCALE_BOTTOM))
        fraction = (y - self.RF_SCALE_TOP) / (self.RF_SCALE_BOTTOM - self.RF_SCALE_TOP)
        return self.RF_RANGE_MAX - fraction * (self.RF_RANGE_MAX - self.RF_RANGE_MIN)

    def _draw_rangefinder(self):
        """Draw all range finder canvas elements."""
        c = self.rf_canvas
        c.delete("all")

        color = self.RF_COLOR
        w = self.RF_WIDTH
        top = self.RF_SCALE_TOP
        bot = self.RF_SCALE_BOTTOM

        # --- Range text label (white, above scale) ---
        c.create_text(w // 2, 15, text=f"{int(self.target_range_m)}m",
                      fill="#ffffff", font=("Courier", 11, "bold"), anchor=tk.CENTER,
                      tags="rf_text")

        # --- Outer corner brackets (L-shapes) ---
        arm = 20
        ox1, oy1, ox2, oy2 = 5, top, w - 5, bot
        # Top-left
        c.create_line(ox1, oy1, ox1 + arm, oy1, fill=color, width=2)
        c.create_line(ox1, oy1, ox1, oy1 + arm, fill=color, width=2)
        # Top-right
        c.create_line(ox2 - arm, oy1, ox2, oy1, fill=color, width=2)
        c.create_line(ox2, oy1, ox2, oy1 + arm, fill=color, width=2)
        # Bottom-left
        c.create_line(ox1, oy2 - arm, ox1, oy2, fill=color, width=2)
        c.create_line(ox1, oy2, ox1 + arm, oy2, fill=color, width=2)
        # Bottom-right
        c.create_line(ox2, oy2 - arm, ox2, oy2, fill=color, width=2)
        c.create_line(ox2 - arm, oy2, ox2, oy2, fill=color, width=2)

        # --- Tick marks along left edge ---
        for range_val in range(int(self.RF_RANGE_MIN), int(self.RF_RANGE_MAX) + 1, 50):
            y = self._range_to_canvas_y(range_val)
            if range_val in (70, 300, 600):
                # Major tick - longer
                c.create_line(0, y, 12, y, fill=color, width=2)
            else:
                # Minor tick
                c.create_line(3, y, 8, y, fill=color, width=1)

        # --- Movable notch (two dashes) ---
        notch_y = self._range_to_canvas_y(self.target_range_m)
        c.create_line(22, notch_y, 33, notch_y, fill=color, width=3, tags="rf_notch")
        c.create_line(47, notch_y, 58, notch_y, fill=color, width=3, tags="rf_notch")

    def _update_rangefinder_notch(self):
        """Update just the notch position and text (fast partial redraw)."""
        c = self.rf_canvas
        c.delete("rf_notch")
        c.delete("rf_text")

        # Redraw text
        c.create_text(self.RF_WIDTH // 2, 15,
                      text=f"{int(self.target_range_m)}m",
                      fill="#ffffff", font=("Courier", 11, "bold"),
                      anchor=tk.CENTER, tags="rf_text")

        # Redraw notch at new position
        notch_y = self._range_to_canvas_y(self.target_range_m)
        c.create_line(22, notch_y, 33, notch_y, fill=self.RF_COLOR, width=3, tags="rf_notch")
        c.create_line(47, notch_y, 58, notch_y, fill=self.RF_COLOR, width=3, tags="rf_notch")

    def _show_rangefinder(self):
        """Show range finder and start mouse tracking for notch adjustment."""
        if self.rf_visible or self.tracking_active:
            return

        self.rf_visible = True

        # Position: centered on the overlay center
        if self.calibrated_x is not None:
            overlay_cx = self.calibrated_x + self.img_w / 2
            overlay_cy = self.calibrated_y + self.img_h / 2
        else:
            overlay_cx = self.win_x + self.img_w / 2
            overlay_cy = self.win_y + self.img_h / 2

        rf_x = int(overlay_cx - self.RF_WIDTH / 2)
        rf_y = int(overlay_cy - self.RF_HEIGHT / 2)

        self.rf_win.geometry(f"{self.RF_WIDTH}x{self.RF_HEIGHT}+{rf_x}+{rf_y}")

        # Draw with current target_range_m
        self._draw_rangefinder()

        # Show window
        self.rf_win.deiconify()
        self.rf_win.attributes("-topmost", True)

        # Make click-through after window is visible
        self.rf_win.after(50, lambda: self._set_rf_clickthrough(True))

        # Anchor mouse position for delta-based tracking
        self.rf_mouse_y_anchor = None  # Will be set on first mouse event
        self.rf_range_anchor = self.target_range_m

        # Start dedicated mouse listener for notch tracking
        self.rf_mouse_listener = pynmouse.Listener(on_move=self._on_rf_mouse_move)
        self.rf_mouse_listener.start()

        # Start update timer (~60fps)
        self.rf_update_timer = self.root.after(16, self._process_rf_updates)

    def _hide_rangefinder(self):
        """Hide range finder and commit the range value."""
        if not self.rf_visible:
            return

        self.rf_visible = False

        # Stop mouse listener
        if self.rf_mouse_listener:
            self.rf_mouse_listener.stop()
            try:
                self.rf_mouse_listener.join(timeout=0.5)
            except Exception:
                pass
            self.rf_mouse_listener = None

        # Cancel update timer
        if self.rf_update_timer:
            self.root.after_cancel(self.rf_update_timer)
            self.rf_update_timer = None

        # Hide window
        self.rf_win.withdraw()

        # target_range_m was updated continuously during dragging
        self._save_config()
        print(f"Range set to: {int(self.target_range_m)}m")

    def _on_rf_mouse_move(self, x, y):
        """Handle mouse movement for range finder notch (pynput listener thread)."""
        if not self.rf_visible:
            return

        if self.rf_mouse_y_anchor is None:
            # First event - anchor the starting mouse Y position
            self.rf_mouse_y_anchor = y
            self.rf_range_anchor = self.target_range_m
            return

        # Calculate delta from anchor
        dy = y - self.rf_mouse_y_anchor

        # Convert pixel delta to range delta
        # Moving mouse UP (negative dy) = INCREASE range
        # Scale height (250px) maps to range span (530m)
        pixels_per_meter = (self.RF_SCALE_BOTTOM - self.RF_SCALE_TOP) / (self.RF_RANGE_MAX - self.RF_RANGE_MIN)
        range_delta = -dy / pixels_per_meter  # Negate: mouse up = more range

        new_range = self.rf_range_anchor + range_delta
        new_range = max(self.RF_RANGE_MIN, min(new_range, self.RF_RANGE_MAX))

        # Thread-safe update
        with self.position_lock:
            self.rf_pending_range = new_range

    def _process_rf_updates(self):
        """Process range finder updates in main thread (16ms timer)."""
        if not self.rf_visible:
            return

        # Check for pending range update
        new_range = None
        with self.position_lock:
            if self.rf_pending_range is not None:
                new_range = self.rf_pending_range
                self.rf_pending_range = None

        if new_range is not None and abs(new_range - self.target_range_m) > 0.5:
            self.target_range_m = new_range
            self._update_rangefinder_notch()

        # Schedule next update
        self.rf_update_timer = self.root.after(16, self._process_rf_updates)

    def _set_rf_clickthrough(self, enable):
        """Set click-through for range finder window."""
        try:
            import ctypes
            if self.rf_hwnd is None:
                self.rf_hwnd = ctypes.windll.user32.FindWindowW(None, "SACLOS RangeFinder")
            if not self.rf_hwnd:
                return
            GWL_EXSTYLE = -20
            WS_EX_LAYERED = 0x00080000
            WS_EX_TRANSPARENT = 0x00000020
            style = ctypes.windll.user32.GetWindowLongW(self.rf_hwnd, GWL_EXSTYLE)
            if enable:
                style |= (WS_EX_LAYERED | WS_EX_TRANSPARENT)
            else:
                style &= ~WS_EX_TRANSPARENT
            ctypes.windll.user32.SetWindowLongW(self.rf_hwnd, GWL_EXSTYLE, style)
        except Exception:
            pass

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

        # Stop range finder mouse listener
        if self.rf_mouse_listener:
            self.rf_mouse_listener.stop()
            try:
                self.rf_mouse_listener.join(timeout=0.5)
            except Exception:
                pass

        # Cancel range finder timer
        if self.rf_update_timer:
            self.root.after_cancel(self.rf_update_timer)
            self.rf_update_timer = None

        # Destroy range finder window
        if hasattr(self, 'rf_win'):
            self.rf_win.destroy()

        # Restore default Windows timer resolution
        _disable_hires_timer()

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
    parser.add_argument("--turret-speed", type=float, default=51.3,
                        help="Turret traverse speed in degrees/second (default: 51.3)")
    parser.add_argument("--instant-follow", type=float, default=15.0,
                        help="Turret instant-follow window in degrees (default: 15.0)")
    parser.add_argument("--pixels-per-degree", type=float, default=10.0,
                        help="Pixel to degree conversion factor (default: 10.0, tune based on FOV)")
    parser.add_argument("--mouse-scale", type=float, default=1.0,
                        help="Mouse sensitivity scale: if correction moves cursor half expected distance, set to 2.0")
    # ML mode
    parser.add_argument("--ml", action="store_true",
                        help="Enable ML-assisted correction using saclos_ml_data.json")
    parser.add_argument("--ml-data", type=str, default="saclos_ml_data.json",
                        help="Path to ML training data file (default: saclos_ml_data.json)")
    parser.add_argument("--ml-confidence", type=float, default=0.3,
                        help="Minimum ML confidence threshold to use prediction (default: 0.3)")
    args = parser.parse_args()

    # --- Admin elevation check ---
    if not _is_admin():
        print()
        print("=" * 60)
        print("  WARNING: Not running as Administrator!")
        print("  Windows UIPI will silently block SendInput events")
        print("  targeting elevated (admin) windows like fullscreen games.")
        print("  If mouse clicks / movements are ignored in-game,")
        print("  re-launch this script with 'Run as administrator'.")
        print("=" * 60)
        print()

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
    if hasattr(args, 'turret_speed'):
        app.turret_traverse_speed_deg_s = args.turret_speed
    if hasattr(args, 'instant_follow'):
        app.turret_instant_follow_deg = args.instant_follow
    if hasattr(args, 'pixels_per_degree'):
        app.pixels_per_degree = args.pixels_per_degree
    if hasattr(args, 'mouse_scale'):
        app.mouse_sensitivity_scale = args.mouse_scale

    # ML mode setup
    if args.ml:
        try:
            from saclos_trainer import CorrectionLearner
            app.ml_enabled = True
            app.ml_confidence_threshold = args.ml_confidence
            app.learner = CorrectionLearner(data_file=args.ml_data)
            stats = app.learner.get_stats()
            print()
            print("=" * 44)
            print("  ML-ASSISTED CORRECTION ENABLED")
            print("=" * 44)
            print(f"  Data file  : {args.ml_data}")
            print(f"  Samples    : {stats['total']}  "
                  f"({stats['hits']} hits, {stats['misses']} misses)")
            print(f"  Confidence : ≥{args.ml_confidence:.0%} to use prediction")
            if stats['hits'] < 3:
                print(f"  ⚠ Need at least 3 hit samples for predictions!")
                print(f"    Run saclos_trainer.py to collect training data.")
            print("=" * 44)
            print()
        except ImportError:
            print("ERROR: Cannot import saclos_trainer. Make sure saclos_trainer.py")
            print("       is in the same directory as saclos_overlay_auto.py")
            app.ml_enabled = False
        except Exception as e:
            print(f"ERROR loading ML data: {e}")
            app.ml_enabled = False

    # Force tracking key setup if requested
    if args.setup_tracking_key:
        app.tracking_key = None
        app.tracking_key_name = "Space"
        app.root.after(500, app._prompt_for_tracking_key)

    root.mainloop()


if __name__ == "__main__":
    main()