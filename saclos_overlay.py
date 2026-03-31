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
import tkinter as tk
from tkinter import filedialog, messagebox
from collections import deque
import threading

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
            "tracking_key_name": self.tracking_key_name
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
            # Get window handle
            hwnd = ctypes.windll.user32.FindWindowW(None, "SACLOS Overlay")
            if hwnd:
                # Use SetWindowPos for fast, non-blocking window positioning
                # SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_ASYNCWINDOWPOS
                # = 0x0001 | 0x0004 | 0x0010 | 0x4000
                flags = 0x4015
                ctypes.windll.user32.SetWindowPos(
                    hwnd, 0, int(self.win_x), int(self.win_y), 0, 0, flags
                )
                return
        except Exception:
            pass
        # Fallback to Tkinter geometry
        self.root.geometry(f"+{int(self.win_x)}+{int(self.win_y)}")

    def _process_position_queue(self):
        """Process position updates from queue (runs in main thread)."""
        if not self.tracking_active:
            # Stop processing if tracking is no longer active
            self.update_timer_id = None
            return

        # Check if there's a position update in the queue
        with self.position_lock:
            if self.position_queue:
                # Get the latest position (queue has maxlen=1, so only one item)
                self.win_x, self.win_y = self.position_queue.pop()

        # Apply geometry update
        self._apply_geometry()

        # Schedule next check (1ms = ~1000fps max, but limited by mouse update rate)
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

        # Prevent starting new tracking if listener already exists
        if self.mouse_listener is not None:
            return

        self.tracking_active = True
        # Swap to tracking image
        if self.img_tracking and self.img_id:
            self.canvas.itemconfig(self.img_id, image=self.img_tracking)
        # Reset mouse position baseline for clean counter-translation start
        self.last_mouse_x = None
        self.last_mouse_y = None
        # Clear position queue
        with self.position_lock:
            self.position_queue.clear()
        # Start mouse listener (runs in separate thread)
        self.mouse_listener = pynmouse.Listener(on_move=self._on_mouse_move)
        self.mouse_listener.start()
        # Start position queue processor in main thread
        if self.update_timer_id is None:
            self.update_timer_id = self.root.after(1, self._process_position_queue)
        # Hide status bar during tracking
        self.bar.pack_forget()
        # Adjust window size to hide status bar
        self.root.geometry(f"{self.img_w}x{self.img_h}")

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

        # Swap back to normal image
        if self.img_normal and self.img_id:
            self.canvas.itemconfig(self.img_id, image=self.img_normal)

        # Reset overlay to calibrated position
        self.win_x = self.calibrated_x
        self.win_y = self.calibrated_y
        self._apply_geometry()
        # Status bar remains hidden (we're still in locked mode)

    def _exit_to_calibrate(self):
        """Exit locked mode and return to calibrate mode."""
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

        # Clamp to bounding box relative to origin (origin = box center, not top-left)
        # We want to keep the overlay center within margin distance from origin
        if self.origin_x is not None and self.origin_y is not None:
            # Calculate bounds for overlay top-left corner
            # such that overlay center stays within the bounding box
            min_x = self.origin_x - self.margin_x - self.img_w / 2
            max_x = self.origin_x + self.margin_x - self.img_w / 2
            min_y = self.origin_y - self.margin_y - self.img_h / 2
            max_y = self.origin_y + self.margin_y - self.img_h / 2

            new_x = max(min_x, min(new_x, max_x))
            new_y = max(min_y, min(new_y, max_y))

        # Update thread-local position for next delta calculation
        self.tracking_win_x = new_x
        self.tracking_win_y = new_y

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
    args = parser.parse_args()

    root = tk.Tk()
    app = SACLOSOverlay(root, image_path=args.image,
                        tracking_image_path=args.tracking_image,
                        margin_x=args.margins[0], margin_y=args.margins[1])

    # Force tracking key setup if requested
    if args.setup_tracking_key:
        app.tracking_key = None
        app.tracking_key_name = "Space"
        app.root.after(500, app._prompt_for_tracking_key)

    root.mainloop()


if __name__ == "__main__":
    main()