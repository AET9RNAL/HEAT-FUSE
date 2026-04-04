"""
TrajectoryEditorWindow — Visual trajectory editor for SACLOS guidance data.

A shared Toplevel window used by:
  - Trainer: after recording, for visual tweaking before saving
  - Predictor: after ML replay, for visual review/tweaking before labeling
  - Standalone: for browsing and editing existing dataset records

Editing model: direct manipulation of cumulative path via control knots
with Gaussian falloff propagation. Timing (t) is never modified.
"""

import copy
import json
import math
import os
import shutil
import threading
import time
import tkinter as tk
from tkinter import ttk
from loguru import logger

import numpy as np


# ---------------------------------------------------------------------------
#  Helpers
# ---------------------------------------------------------------------------

def _traj_to_cumulative(traj):
    """Convert [{t, dx, dy}, ...] → (times, cum_x, cum_y) numpy arrays."""
    n = len(traj)
    times = np.zeros(n)
    cum_x = np.zeros(n)
    cum_y = np.zeros(n)
    sx, sy = 0.0, 0.0
    for i, pt in enumerate(traj):
        sx += pt['dx']
        sy += pt['dy']
        times[i] = pt['t']
        cum_x[i] = sx
        cum_y[i] = sy
    return times, cum_x, cum_y


def _cumulative_to_traj(times, cum_x, cum_y):
    """Convert back to [{t, dx, dy}, ...] with integer deltas."""
    n = len(times)
    traj = []
    prev_x, prev_y = 0.0, 0.0
    for i in range(n):
        dx = int(round(cum_x[i] - prev_x))
        dy = int(round(cum_y[i] - prev_y))
        traj.append({'t': round(float(times[i]), 4), 'dx': dx, 'dy': dy})
        prev_x += dx
        prev_y += dy
    return traj


def _gaussian_weights(n, center, sigma):
    """Return array of Gaussian weights centered at `center` with spread `sigma`."""
    indices = np.arange(n, dtype=float)
    return np.exp(-0.5 * ((indices - center) / max(sigma, 0.5)) ** 2)


# ---------------------------------------------------------------------------
#  Main editor window
# ---------------------------------------------------------------------------

class TrajectoryEditorWindow(tk.Toplevel):
    """
    Visual trajectory editor as a Toplevel window.

    Parameters
    ----------
    parent : tk widget
    trajectory : list of {t, dx, dy}
    context : dict with displacement_px, angle_rad, range_m (for new captures)
    record_index : int or None (for browse/overwrite mode)
    learner : CorrectionLearner or None (for saving new samples)
    on_save : callable(sample_dict) or None
    on_discard : callable() or None
    mode : 'capture' | 'browse'
    all_samples : list of dicts (for browse mode)
    data_file : str path to JSONL file (for browse mode overwrite)
    """

    CANVAS_W = 600
    CANVAS_H = 450
    KNOT_RADIUS = 6
    DEFAULT_NUM_KNOTS = 12
    DEFAULT_SIGMA_FRAC = 0.15  # fraction of trajectory length

    def __init__(self, parent, trajectory, *,
                 pre_trajectory=None,
                 context=None, record_index=None,
                 learner=None,
                 on_save=None, on_discard=None,
                 mode='capture',
                 all_samples=None, data_file=None):
        super().__init__(parent)
        self.title("Trajectory Refiner")
        self.configure(bg="#1a1a2e")
        self.protocol("WM_DELETE_WINDOW", self._on_close)

        self._parent = parent
        self._learner = learner
        self._on_save_cb = on_save
        self._on_discard_cb = on_discard
        self._mode = mode
        self._context = context or {}
        self._record_index = record_index
        self._all_samples = all_samples
        self._data_file = data_file or 'saclos_ml_data.json'
        self._backup_done = False

        # Pre-fire aiming trajectory (tracking start → LMB click)
        # Stateless: never saved to dataset, displayed but not editable
        self._pre_traj = pre_trajectory or []
        if self._pre_traj:
            _, self._pre_cum_x, self._pre_cum_y = _traj_to_cumulative(self._pre_traj)
        else:
            self._pre_cum_x = np.zeros(0)
            self._pre_cum_y = np.zeros(0)

        # Trajectory data (original + working copy)
        self._orig_traj = copy.deepcopy(trajectory)
        self._traj = copy.deepcopy(trajectory)
        self._times, self._cum_x, self._cum_y = _traj_to_cumulative(self._traj)
        self._orig_cum_x = self._cum_x.copy()
        self._orig_cum_y = self._cum_y.copy()

        # Undo stack
        self._undo_stack = []
        self._redo_stack = []

        # View transform
        self._zoom = 1.0
        self._pan_x = 0.0
        self._pan_y = 0.0
        self._selected_knots = set()  # indices of selected knots
        self._dragging = False
        self._pan_start = None

        # Replay state
        self._replay_thread = None
        self._replay_abort = threading.Event()

        # Pre-init tk variables (needed before _build_ui because
        # <Configure> on the canvas can fire during widget creation)
        self._num_knots_var = tk.IntVar(value=self.DEFAULT_NUM_KNOTS)
        self._sigma_var = tk.DoubleVar(value=self.DEFAULT_SIGMA_FRAC)
        self._countdown_var = tk.IntVar(value=3)
        self._replay_status_var = tk.StringVar(value="")

        # ---- Build UI ----
        self._build_ui()
        self._fit_view()
        self._redraw()

        # Bring to front
        self.lift()
        self.attributes("-topmost", True)
        self.after(100, lambda: self.attributes("-topmost", False))

    # ------------------------------------------------------------------
    #  UI construction
    # ------------------------------------------------------------------

    def _build_ui(self):
        frame_bg = {"bg": "#1a1a2e"}
        style = {"bg": "#1a1a2e", "fg": "#e0e0e0"}
        btn_style = {"bg": "#16213e", "fg": "#e0e0e0", "activebackground": "#0f3460",
                     "activeforeground": "#ffffff", "relief": tk.FLAT, "padx": 8, "pady": 4}

        # --- Browse panel (only in browse mode) ---
        if self._mode == 'browse' and self._all_samples:
            self._build_browse_panel()

        # --- Main frame ---
        main = tk.Frame(self, bg="#1a1a2e")
        main.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)

        # Canvas
        canvas_frame = tk.Frame(main, bg="#0d1117", bd=2, relief=tk.SUNKEN)
        canvas_frame.pack(padx=8, pady=(8, 4), fill=tk.BOTH, expand=True)

        self._canvas = tk.Canvas(canvas_frame, bg="#0d1117",
                                 width=self.CANVAS_W, height=self.CANVAS_H,
                                 highlightthickness=0, cursor="crosshair")
        self._canvas.pack(fill=tk.BOTH, expand=True)

        self._canvas.bind("<ButtonPress-1>", self._on_canvas_press)
        self._canvas.bind("<B1-Motion>", self._on_canvas_drag)
        self._canvas.bind("<ButtonRelease-1>", self._on_canvas_release)
        self._canvas.bind("<ButtonPress-2>", self._on_pan_start)
        self._canvas.bind("<B2-Motion>", self._on_pan_move)
        self._canvas.bind("<ButtonPress-3>", self._on_pan_start)
        self._canvas.bind("<B3-Motion>", self._on_pan_move)
        self._canvas.bind("<MouseWheel>", self._on_scroll)
        self._canvas.bind("<Configure>", self._on_canvas_resize)

        # Info bar
        self._info_var = tk.StringVar()
        self._update_info()
        tk.Label(main, textvariable=self._info_var, font=("Consolas", 9),
                 **style).pack(padx=8, anchor=tk.W)

        # --- Sliders ---
        slider_frame = tk.Frame(main, **frame_bg)
        slider_frame.pack(padx=8, pady=4, fill=tk.X)

        tk.Label(slider_frame, text="Knots:", font=("Consolas", 9),
                 **style).pack(side=tk.LEFT)
        knot_slider = tk.Scale(slider_frame, from_=3, to=30, orient=tk.HORIZONTAL,
                               variable=self._num_knots_var, command=self._on_knot_count_change,
                               bg="#16213e", fg="#e0e0e0", troughcolor="#0d1117",
                               highlightthickness=0, length=120, sliderlength=15)
        knot_slider.pack(side=tk.LEFT, padx=(4, 16))

        tk.Label(slider_frame, text="Influence:", font=("Consolas", 9),
                 **style).pack(side=tk.LEFT)
        sigma_slider = tk.Scale(slider_frame, from_=0.02, to=0.5, resolution=0.01,
                                orient=tk.HORIZONTAL, variable=self._sigma_var,
                                bg="#16213e", fg="#e0e0e0", troughcolor="#0d1117",
                                highlightthickness=0, length=120, sliderlength=15)
        sigma_slider.pack(side=tk.LEFT, padx=4)

        # --- Replay ---
        replay_frame = tk.Frame(main, **frame_bg)
        replay_frame.pack(padx=8, pady=4, fill=tk.X)

        tk.Button(replay_frame, text="Replay Original", command=self._replay_original,
                  **btn_style).pack(side=tk.LEFT, padx=(0, 4))
        tk.Button(replay_frame, text="Replay Edited", command=self._replay_edited,
                  **btn_style).pack(side=tk.LEFT, padx=4)

        tk.Label(replay_frame, text="Countdown:", font=("Consolas", 9),
                 **style).pack(side=tk.LEFT, padx=(16, 4))
        tk.Spinbox(replay_frame, from_=0, to=10, width=3, textvariable=self._countdown_var,
                   background="#16213e", foreground="#e0e0e0",
                   highlightthickness=0).pack(side=tk.LEFT)
        tk.Label(replay_frame, text="s", font=("Consolas", 9),
                 **style).pack(side=tk.LEFT)

        tk.Label(replay_frame, textvariable=self._replay_status_var,
                 font=("Consolas", 9, "bold"), bg="#1a1a2e", fg="#00ff88"
                 ).pack(side=tk.LEFT, padx=16)

        # --- Save / Label ---
        save_frame = tk.LabelFrame(main, text=" Save ", font=("Consolas", 9),
                                   bg="#1a1a2e", fg="#e0e0e0", bd=1)
        save_frame.pack(padx=8, pady=(4, 8), fill=tk.X)

        if self._mode == 'capture':
            self._build_capture_save(save_frame, btn_style, style, frame_bg)
        else:
            self._build_browse_save(save_frame, btn_style, style, frame_bg)

    def _build_capture_save(self, parent, btn_style, style, frame_bg):
        """Build save panel for capture mode (trainer/predictor)."""
        row1 = tk.Frame(parent, **frame_bg)
        row1.pack(fill=tk.X, padx=4, pady=2)

        self._hit_var = tk.BooleanVar(value=True)
        tk.Radiobutton(row1, text="HIT", variable=self._hit_var, value=True,
                       command=self._on_hit_miss_change,
                       bg="#1a1a2e", fg="#00ff88", selectcolor="#16213e",
                       activebackground="#1a1a2e", activeforeground="#00ff88",
                       font=("Consolas", 10, "bold")).pack(side=tk.LEFT, padx=(0, 12))
        tk.Radiobutton(row1, text="MISS", variable=self._hit_var, value=False,
                       command=self._on_hit_miss_change,
                       bg="#1a1a2e", fg="#ff4444", selectcolor="#16213e",
                       activebackground="#1a1a2e", activeforeground="#ff4444",
                       font=("Consolas", 10, "bold")).pack(side=tk.LEFT)

        # Miss sub-labels (hidden when HIT selected)
        self._miss_frame = tk.Frame(parent, **frame_bg)

        tk.Label(self._miss_frame, text="Timing:", font=("Consolas", 9),
                 **style).pack(side=tk.LEFT, padx=(4, 2))
        self._timing_var = tk.StringVar(value="optimal")
        for val, txt in [("premature", "Premature"), ("optimal", "Optimal"), ("late", "Late")]:
            tk.Radiobutton(self._miss_frame, text=txt, variable=self._timing_var,
                           value=val, bg="#1a1a2e", fg="#e0e0e0", selectcolor="#16213e",
                           activebackground="#1a1a2e", activeforeground="#e0e0e0",
                           font=("Consolas", 9)).pack(side=tk.LEFT)

        tk.Label(self._miss_frame, text="  Mag:", font=("Consolas", 9),
                 **style).pack(side=tk.LEFT, padx=(8, 2))
        self._magnitude_var = tk.StringVar(value="optimal")
        for val, txt in [("undershoot", "Under"), ("optimal", "Optimal"), ("overshoot", "Over")]:
            tk.Radiobutton(self._miss_frame, text=txt, variable=self._magnitude_var,
                           value=val, bg="#1a1a2e", fg="#e0e0e0", selectcolor="#16213e",
                           activebackground="#1a1a2e", activeforeground="#e0e0e0",
                           font=("Consolas", 9)).pack(side=tk.LEFT)

        # Buttons
        row_btn = tk.Frame(parent, **frame_bg)
        row_btn.pack(fill=tk.X, padx=4, pady=(4, 2))

        tk.Button(row_btn, text="Save & Close", command=self._save_capture,
                  bg="#0f3460", fg="#00ff88", activebackground="#1a5276",
                  activeforeground="#ffffff", relief=tk.FLAT, padx=12, pady=4,
                  font=("Consolas", 10, "bold")).pack(side=tk.LEFT, padx=(0, 8))
        tk.Button(row_btn, text="Discard", command=self._discard,
                  bg="#3d0000", fg="#ff4444", activebackground="#5c0000",
                  activeforeground="#ffffff", relief=tk.FLAT, padx=12, pady=4,
                  font=("Consolas", 10)).pack(side=tk.LEFT, padx=(0, 8))
        tk.Button(row_btn, text="Reset Edits", command=self._reset_edits,
                  **{**btn_style, "font": ("Consolas", 9)}).pack(side=tk.LEFT)
        tk.Button(row_btn, text="Undo", command=self._undo,
                  **{**btn_style, "font": ("Consolas", 9)}).pack(side=tk.RIGHT, padx=2)
        tk.Button(row_btn, text="Redo", command=self._redo,
                  **{**btn_style, "font": ("Consolas", 9)}).pack(side=tk.RIGHT, padx=2)

    def _build_browse_save(self, parent, btn_style, style, frame_bg):
        """Build save panel for browse mode (standalone)."""
        row_btn = tk.Frame(parent, **frame_bg)
        row_btn.pack(fill=tk.X, padx=4, pady=(4, 2))

        tk.Button(row_btn, text="Overwrite Record", command=self._save_browse,
                  bg="#0f3460", fg="#00ff88", activebackground="#1a5276",
                  activeforeground="#ffffff", relief=tk.FLAT, padx=12, pady=4,
                  font=("Consolas", 10, "bold")).pack(side=tk.LEFT, padx=(0, 8))
        tk.Button(row_btn, text="Reset Edits", command=self._reset_edits,
                  **{**btn_style, "font": ("Consolas", 9)}).pack(side=tk.LEFT, padx=(0, 8))
        tk.Button(row_btn, text="Undo", command=self._undo,
                  **{**btn_style, "font": ("Consolas", 9)}).pack(side=tk.RIGHT, padx=2)
        tk.Button(row_btn, text="Redo", command=self._redo,
                  **{**btn_style, "font": ("Consolas", 9)}).pack(side=tk.RIGHT, padx=2)

    def _build_browse_panel(self):
        """Build the record browser sidebar for standalone mode."""
        browse = tk.Frame(self, bg="#111122", width=280)
        browse.pack(side=tk.LEFT, fill=tk.Y)
        browse.pack_propagate(False)

        tk.Label(browse, text="Records", font=("Consolas", 11, "bold"),
                 bg="#111122", fg="#e0e0e0").pack(pady=(8, 4))

        cols = ("#", "disp", "ang°", "rng", "hit", "Σdx", "Σdy", "pts")
        self._tree = ttk.Treeview(browse, columns=cols, show="headings", height=20)

        col_widths = {"#": 32, "disp": 42, "ang°": 42, "rng": 32,
                      "hit": 28, "Σdx": 42, "Σdy": 42, "pts": 32}
        for c in cols:
            self._tree.heading(c, text=c)
            self._tree.column(c, width=col_widths.get(c, 40), anchor=tk.CENTER)

        scrollbar = ttk.Scrollbar(browse, orient=tk.VERTICAL, command=self._tree.yview)
        self._tree.configure(yscrollcommand=scrollbar.set)

        self._tree.pack(side=tk.LEFT, fill=tk.BOTH, expand=True, padx=(4, 0), pady=4)
        scrollbar.pack(side=tk.RIGHT, fill=tk.Y, pady=4, padx=(0, 4))

        self._tree.bind("<<TreeviewSelect>>", self._on_record_select)

        # Populate
        for i, s in enumerate(self._all_samples):
            tag = "hit" if s.get("hit") else "miss"
            self._tree.insert("", tk.END, iid=str(i), values=(
                i,
                f"{s.get('disp', 0):.0f}",
                f"{math.degrees(s.get('angle', 0)):.0f}",
                f"{s.get('range', 0):.0f}",
                "✓" if s.get("hit") else "✗",
                s.get("total_dx", 0),
                s.get("total_dy", 0),
                len(s.get("traj", [])),
            ), tags=(tag,))

        self._tree.tag_configure("hit", foreground="#00cc66")
        self._tree.tag_configure("miss", foreground="#cc4444")

    # ------------------------------------------------------------------
    #  Info bar
    # ------------------------------------------------------------------

    def _update_info(self):
        traj = _cumulative_to_traj(self._times, self._cum_x, self._cum_y)
        tdx = sum(p['dx'] for p in traj)
        tdy = sum(p['dy'] for p in traj)
        dur = traj[-1]['t'] if traj else 0
        ctx = self._context
        parts = []
        if ctx.get('displacement_px') is not None:
            parts.append(f"disp={ctx['displacement_px']:.1f}px")
        if ctx.get('angle_rad') is not None:
            parts.append(f"angle={math.degrees(ctx['angle_rad']):.1f}°")
        if ctx.get('range_m') is not None:
            parts.append(f"range={ctx['range_m']:.0f}m")
        parts.append(f"Σdx={tdx}  Σdy={tdy}  dur={dur:.3f}s  pts={len(traj)}")
        if self._pre_traj:
            pre_dur = self._pre_traj[-1]['t'] if self._pre_traj else 0
            parts.append(f"  |  pre-fire: {len(self._pre_traj)}pts {pre_dur:.3f}s")
        self._info_var.set("  ".join(parts))

    # ------------------------------------------------------------------
    #  View transform
    # ------------------------------------------------------------------

    def _world_to_canvas(self, wx, wy):
        """Convert world (cumulative) coords to canvas pixel coords."""
        cw = self._canvas.winfo_width() or self.CANVAS_W
        ch = self._canvas.winfo_height() or self.CANVAS_H
        cx = cw / 2 + (wx - self._pan_x) * self._zoom
        # Flip Y so positive dy goes down (matching screen coords)
        cy = ch / 2 + (wy - self._pan_y) * self._zoom
        return cx, cy

    def _canvas_to_world(self, cx, cy):
        cw = self._canvas.winfo_width() or self.CANVAS_W
        ch = self._canvas.winfo_height() or self.CANVAS_H
        wx = (cx - cw / 2) / self._zoom + self._pan_x
        wy = (cy - ch / 2) / self._zoom + self._pan_y
        return wx, wy

    def _fit_view(self):
        """Auto-fit the trajectory to fill the canvas with padding."""
        if len(self._cum_x) == 0:
            return
        # Include origin (0,0) in bounds
        min_x = min(0, float(np.min(self._cum_x)))
        max_x = max(0, float(np.max(self._cum_x)))
        min_y = min(0, float(np.min(self._cum_y)))
        max_y = max(0, float(np.max(self._cum_y)))

        # Also include the pre-fire trajectory extent
        if len(self._pre_cum_x) > 1:
            off_x = self._pre_cum_x[-1]
            off_y = self._pre_cum_y[-1]
            min_x = min(min_x, float(np.min(self._pre_cum_x - off_x)))
            max_x = max(max_x, float(np.max(self._pre_cum_x - off_x)))
            min_y = min(min_y, float(np.min(self._pre_cum_y - off_y)))
            max_y = max(max_y, float(np.max(self._pre_cum_y - off_y)))

        span_x = max(max_x - min_x, 1)
        span_y = max(max_y - min_y, 1)

        cw = self._canvas.winfo_width() or self.CANVAS_W
        ch = self._canvas.winfo_height() or self.CANVAS_H
        padding = 0.78

        zoom_x = cw * padding / span_x
        zoom_y = ch * padding / span_y
        self._zoom = min(zoom_x, zoom_y)

        self._pan_x = (min_x + max_x) / 2
        self._pan_y = (min_y + max_y) / 2

    # ------------------------------------------------------------------
    #  Drawing
    # ------------------------------------------------------------------

    def _redraw(self):
        c = self._canvas
        c.delete("all")
        n = len(self._cum_x)
        if n == 0:
            return

        # Draw origin crosshair
        ox, oy = self._world_to_canvas(0, 0)
        arm = 10
        c.create_line(ox - arm, oy, ox + arm, oy, fill="#555555", width=1)
        c.create_line(ox, oy - arm, ox, oy + arm, fill="#555555", width=1)
        c.create_text(ox + 12, oy - 10, text="(0,0)", fill="#555555",
                      font=("Consolas", 7), anchor=tk.W)

        # Pre-fire aiming trajectory (non-editable, dimmed)
        # Offset so the last point lands at origin (0,0)
        n_pre = len(self._pre_cum_x)
        if n_pre > 1:
            off_x = self._pre_cum_x[-1]
            off_y = self._pre_cum_y[-1]
            pre_pts = []
            for i in range(n_pre):
                px, py = self._world_to_canvas(
                    self._pre_cum_x[i] - off_x,
                    self._pre_cum_y[i] - off_y,
                )
                pre_pts.extend([px, py])
            if len(pre_pts) >= 4:
                c.create_line(*pre_pts, fill="#4a3060", width=1.5,
                              dash=(4, 3), smooth=False)
            # Start marker (where tracking began)
            sx, sy = self._world_to_canvas(
                self._pre_cum_x[0] - off_x, self._pre_cum_y[0] - off_y)
            c.create_oval(sx - 3, sy - 3, sx + 3, sy + 3,
                          outline="#4a3060", fill="#2a1840", width=1)
            c.create_text(sx + 8, sy - 8, text="aim",
                          fill="#4a3060", font=("Consolas", 7), anchor=tk.W)

        # Ghost line (original trajectory)
        if n > 1:
            ghost_pts = []
            for i in range(n):
                px, py = self._world_to_canvas(self._orig_cum_x[i], self._orig_cum_y[i])
                ghost_pts.extend([px, py])
            if len(ghost_pts) >= 4:
                c.create_line(*ghost_pts, fill="#333355", width=1, smooth=False)

        # Edited trajectory — colored by time
        if n > 1:
            for i in range(n - 1):
                frac = i / max(n - 1, 1)
                # blue→cyan→green→yellow→red
                r, g, b = self._time_color(frac)
                color = f"#{r:02x}{g:02x}{b:02x}"
                x1, y1 = self._world_to_canvas(self._cum_x[i], self._cum_y[i])
                x2, y2 = self._world_to_canvas(self._cum_x[i + 1], self._cum_y[i + 1])
                c.create_line(x1, y1, x2, y2, fill=color, width=2)

        # Point dots
        for i in range(n):
            frac = i / max(n - 1, 1)
            r, g, b = self._time_color(frac)
            color = f"#{r:02x}{g:02x}{b:02x}"
            px, py = self._world_to_canvas(self._cum_x[i], self._cum_y[i])
            c.create_oval(px - 1.5, py - 1.5, px + 1.5, py + 1.5, fill=color, outline="")

        # Endpoint marker
        ex, ey = self._world_to_canvas(self._cum_x[-1], self._cum_y[-1])
        c.create_oval(ex - 4, ey - 4, ex + 4, ey + 4, outline="#ffffff", width=1)

        # Control knots
        knot_indices = self._get_knot_indices()
        for ki in knot_indices:
            kx, ky = self._world_to_canvas(self._cum_x[ki], self._cum_y[ki])
            r = self.KNOT_RADIUS
            if ki == 0:
                # Locked origin knot — grey, not selectable
                c.create_oval(kx - r, ky - r, kx + r, ky + r,
                              fill="#333333", outline="#666666", width=2,
                              tags=f"knot_{ki}")
            elif ki in self._selected_knots:
                # Selected knot — bright highlight
                c.create_oval(kx - r, ky - r, kx + r, ky + r,
                              fill="#ff8800", outline="#ffcc00", width=2,
                              tags=f"knot_{ki}")
            else:
                c.create_oval(kx - r, ky - r, kx + r, ky + r,
                              fill="#0f3460", outline="#4fc3f7", width=2,
                              tags=f"knot_{ki}")

        # Axis scales + time bar
        self._draw_scales(c)

    # ------------------------------------------------------------------
    #  Axis scales & time bar
    # ------------------------------------------------------------------

    @staticmethod
    def _nice_interval(span, max_ticks=10):
        """Choose a round tick interval for *span* with at most *max_ticks*."""
        if span <= 0:
            return 1
        raw = span / max(max_ticks, 1)
        mag = 10 ** math.floor(math.log10(max(abs(raw), 1e-12)))
        norm = raw / mag
        if norm <= 1:
            step = mag
        elif norm <= 2:
            step = 2 * mag
        elif norm <= 5:
            step = 5 * mag
        else:
            step = 10 * mag
        return max(step, 1e-9)

    def _draw_scales(self, c):
        """Draw X / Y axis ticks with labels and a time (dur) color bar."""
        cw = c.winfo_width() or self.CANVAS_W
        ch = c.winfo_height() or self.CANVAS_H
        font = ("Consolas", 7)
        tc = "#666666"  # tick colour
        tl = 5          # tick length

        # Visible world range
        w_left, w_top = self._canvas_to_world(0, 0)
        w_right, w_bot = self._canvas_to_world(cw, ch)

        # --- X axis (bottom edge) ---
        x_step = self._nice_interval(w_right - w_left)
        x = math.ceil(w_left / x_step) * x_step
        iters = 0
        while x <= w_right and iters < 200:
            cx, _ = self._world_to_canvas(x, 0)
            if 30 < cx < cw - 5:
                c.create_line(cx, ch - tl, cx, ch, fill=tc, width=1)
                lbl = f"{x:.0f}" if x_step >= 1 else f"{x:.1f}"
                c.create_text(cx, ch - tl - 1, text=lbl,
                              fill=tc, font=font, anchor=tk.S)
            x += x_step
            iters += 1
        c.create_text(cw - 4, ch - 14, text="X px", fill=tc,
                      font=font, anchor=tk.E)

        # --- Y axis (left edge) ---
        y_step = self._nice_interval(w_bot - w_top)
        y = math.ceil(w_top / y_step) * y_step
        iters = 0
        while y <= w_bot and iters < 200:
            _, cy = self._world_to_canvas(0, y)
            if 10 < cy < ch - 20:
                c.create_line(0, cy, tl, cy, fill=tc, width=1)
                lbl = f"{y:.0f}" if y_step >= 1 else f"{y:.1f}"
                c.create_text(tl + 2, cy, text=lbl,
                              fill=tc, font=font, anchor=tk.W)
            y += y_step
            iters += 1
        c.create_text(4, 4, text="Y px", fill=tc,
                      font=font, anchor=tk.NW)

        # --- Time (dur) color bar ---
        if len(self._times) > 1:
            t_min = float(self._times[0])
            t_max = float(self._times[-1])
            bar_w = min(140, cw // 4)
            bar_h = 8
            bx = cw - bar_w - 12
            by = 8

            for i in range(bar_w):
                frac = i / max(bar_w - 1, 1)
                r, g, b = self._time_color(frac)
                col = f"#{r:02x}{g:02x}{b:02x}"
                c.create_line(bx + i, by, bx + i, by + bar_h, fill=col, width=1)

            c.create_rectangle(bx, by, bx + bar_w, by + bar_h,
                               outline="#888888", width=1)
            c.create_text(bx, by + bar_h + 2, text=f"{t_min:.3f}s",
                          fill=tc, font=font, anchor=tk.NW)
            c.create_text(bx + bar_w, by + bar_h + 2, text=f"{t_max:.3f}s",
                          fill=tc, font=font, anchor=tk.NE)
            c.create_text(bx + bar_w // 2, by - 1, text="t (dur)",
                          fill=tc, font=font, anchor=tk.S)

    @staticmethod
    def _time_color(frac):
        """Map fraction [0,1] → (R,G,B) via blue→cyan→green→yellow→red."""
        frac = max(0.0, min(1.0, frac))
        if frac < 0.25:
            t = frac / 0.25
            return (0, int(128 * t), 255)
        elif frac < 0.5:
            t = (frac - 0.25) / 0.25
            return (0, 128 + int(127 * t), int(255 * (1 - t)))
        elif frac < 0.75:
            t = (frac - 0.5) / 0.25
            return (int(255 * t), 255, 0)
        else:
            t = (frac - 0.75) / 0.25
            return (255, int(255 * (1 - t)), 0)

    # ------------------------------------------------------------------
    #  Knot management
    # ------------------------------------------------------------------

    def _get_knot_indices(self):
        n = len(self._cum_x)
        if n <= 2:
            return list(range(n))
        num = min(self._num_knots_var.get(), n)
        if num <= 2:
            return [0, n - 1]
        return [int(round(i * (n - 1) / (num - 1))) for i in range(num)]

    def _on_knot_count_change(self, _=None):
        self._redraw()

    # ------------------------------------------------------------------
    #  Canvas interaction
    # ------------------------------------------------------------------

    def _on_canvas_press(self, event):
        """Select knots or start drag. Ctrl+click toggles, click replaces. Index 0 is locked."""
        knot_indices = self._get_knot_indices()
        best_dist = float('inf')
        best_ki = None
        for ki in knot_indices:
            if ki == 0:
                continue  # origin knot is locked
            kx, ky = self._world_to_canvas(self._cum_x[ki], self._cum_y[ki])
            d = math.hypot(event.x - kx, event.y - ky)
            if d < self.KNOT_RADIUS + 6 and d < best_dist:
                best_dist = d
                best_ki = ki

        ctrl_held = bool(event.state & 0x4)

        if best_ki is not None:
            if ctrl_held:
                # Toggle this knot in the selection
                if best_ki in self._selected_knots:
                    self._selected_knots.discard(best_ki)
                else:
                    self._selected_knots.add(best_ki)
            else:
                # If clicking an already-selected knot, keep multi-selection for drag
                if best_ki not in self._selected_knots:
                    self._selected_knots = {best_ki}

            # Start drag if we have a selection
            if self._selected_knots:
                self._dragging = True
                self._drag_start_wx, self._drag_start_wy = self._canvas_to_world(event.x, event.y)
                self._drag_start_cum_x = self._cum_x.copy()
                self._drag_start_cum_y = self._cum_y.copy()
            self._redraw()
        else:
            if not ctrl_held:
                self._selected_knots.clear()
                self._redraw()

    def _on_canvas_drag(self, event):
        if not self._dragging or not self._selected_knots:
            return
        wx, wy = self._canvas_to_world(event.x, event.y)
        dx = wx - self._drag_start_wx
        dy = wy - self._drag_start_wy

        n = len(self._cum_x)
        sigma = max(1.0, self._sigma_var.get() * n)

        # Combine Gaussian influence from all selected knots
        combined = np.zeros(n)
        for ki in self._selected_knots:
            combined = np.maximum(combined, _gaussian_weights(n, ki, sigma))

        # Pin index 0 — origin never moves
        combined[0] = 0.0

        self._cum_x = self._drag_start_cum_x + dx * combined
        self._cum_y = self._drag_start_cum_y + dy * combined

        self._redraw()
        self._update_info()

    def _on_canvas_release(self, event):
        if self._dragging:
            # Push to undo stack
            self._undo_stack.append((self._drag_start_cum_x, self._drag_start_cum_y))
            self._redo_stack.clear()
            self._dragging = False

    def _on_pan_start(self, event):
        self._pan_start = (event.x, event.y, self._pan_x, self._pan_y)

    def _on_pan_move(self, event):
        if self._pan_start is None:
            return
        sx, sy, px, py = self._pan_start
        dx = (event.x - sx) / self._zoom
        dy = (event.y - sy) / self._zoom
        self._pan_x = px - dx
        self._pan_y = py - dy
        self._redraw()

    def _on_scroll(self, event):
        factor = 1.15 if event.delta > 0 else 1 / 1.15
        self._zoom *= factor
        self._zoom = max(0.1, min(self._zoom, 100.0))
        self._redraw()

    def _on_canvas_resize(self, event):
        self._redraw()

    # ------------------------------------------------------------------
    #  Hit/Miss toggle
    # ------------------------------------------------------------------

    def _on_hit_miss_change(self):
        if self._hit_var.get():
            self._miss_frame.pack_forget()
        else:
            self._miss_frame.pack(fill=tk.X, padx=4, pady=2)

    # ------------------------------------------------------------------
    #  Undo / Redo
    # ------------------------------------------------------------------

    def _undo(self):
        if not self._undo_stack:
            return
        self._redo_stack.append((self._cum_x.copy(), self._cum_y.copy()))
        prev_x, prev_y = self._undo_stack.pop()
        self._cum_x = prev_x.copy()
        self._cum_y = prev_y.copy()
        self._redraw()
        self._update_info()

    def _redo(self):
        if not self._redo_stack:
            return
        self._undo_stack.append((self._cum_x.copy(), self._cum_y.copy()))
        next_x, next_y = self._redo_stack.pop()
        self._cum_x = next_x.copy()
        self._cum_y = next_y.copy()
        self._redraw()
        self._update_info()

    def _reset_edits(self):
        self._undo_stack.append((self._cum_x.copy(), self._cum_y.copy()))
        self._redo_stack.clear()
        self._cum_x = self._orig_cum_x.copy()
        self._cum_y = self._orig_cum_y.copy()
        self._redraw()
        self._update_info()

    # ------------------------------------------------------------------
    #  Replay
    # ------------------------------------------------------------------

    def _replay_original(self):
        self._do_replay(self._orig_traj)

    def _replay_edited(self):
        traj = _cumulative_to_traj(self._times, self._cum_x, self._cum_y)
        self._do_replay(traj)

    def _do_replay(self, traj):
        if self._replay_thread and self._replay_thread.is_alive():
            self._replay_abort.set()
            self._replay_thread.join(timeout=2)

        self._replay_abort.clear()
        countdown = self._countdown_var.get()
        self._replay_thread = threading.Thread(
            target=self._replay_thread_func,
            args=(traj, countdown),
            daemon=True
        )
        self._replay_thread.start()

    def _replay_thread_func(self, traj, countdown_s):
        try:
            from utils.hardware_inject import inject_mouse_movement, inject_mouse_click
        except ImportError:
            logger.warning("hardware_inject not available — replay disabled")
            return

        # Countdown
        for i in range(countdown_s, 0, -1):
            if self._replay_abort.is_set():
                return
            self._set_replay_status(f"Replay in {i}...")
            time.sleep(1.0)

        if self._replay_abort.is_set():
            return

        # --- Pre-fire aiming phase (if present) ---
        if self._pre_traj:
            self._set_replay_status("AIMING (pre-fire)")
            pre_start = time.perf_counter()
            pre_cum_dx, pre_cum_dy = 0.0, 0.0
            pre_inj_dx, pre_inj_dy = 0, 0

            for pt in self._pre_traj:
                if self._replay_abort.is_set():
                    return
                target_time = pre_start + pt['t']
                now = time.perf_counter()
                sleep_s = target_time - now
                if sleep_s > 0.0005:
                    time.sleep(sleep_s)

                pre_cum_dx += pt['dx']
                pre_cum_dy += pt['dy']
                ix = int(round(pre_cum_dx)) - pre_inj_dx
                iy = int(round(pre_cum_dy)) - pre_inj_dy
                if ix != 0 or iy != 0:
                    try:
                        inject_mouse_movement(ix, iy)
                        pre_inj_dx += ix
                        pre_inj_dy += iy
                    except Exception as e:
                        logger.warning(f"Pre-fire replay error: {e}")
                        break

            logger.info(f"Pre-fire aiming complete ({pre_inj_dx}dx {pre_inj_dy}dy)")

        if self._replay_abort.is_set():
            return

        # --- Fire click + guidance trajectory ---
        self._set_replay_status("REPLAYING")

        inject_mouse_click()

        start_time = time.perf_counter()
        cumulative_dx = 0.0
        cumulative_dy = 0.0
        injected_dx = 0
        injected_dy = 0

        for pt in traj:
            if self._replay_abort.is_set():
                break

            target_time = start_time + pt['t']
            now = time.perf_counter()
            sleep_s = target_time - now
            if sleep_s > 0.0005:
                time.sleep(sleep_s)

            cumulative_dx += pt['dx']
            cumulative_dy += pt['dy']
            inject_x = int(round(cumulative_dx)) - injected_dx
            inject_y = int(round(cumulative_dy)) - injected_dy

            if inject_x != 0 or inject_y != 0:
                try:
                    inject_mouse_movement(inject_x, inject_y)
                    injected_dx += inject_x
                    injected_dy += inject_y
                except Exception as e:
                    logger.warning(f"Replay injection error: {e}")
                    break

        elapsed = time.perf_counter() - start_time
        logger.info(f"Replay complete ({elapsed:.2f}s, {injected_dx}dx {injected_dy}dy)")
        self._set_replay_status(f"Done ({injected_dx}dx {injected_dy}dy)")
        time.sleep(2)
        self._set_replay_status("")

    def _set_replay_status(self, text):
        try:
            self._parent.after(0, lambda: self._replay_status_var.set(text))
        except Exception:
            pass

    # ------------------------------------------------------------------
    #  Save — Capture mode (trainer / predictor)
    # ------------------------------------------------------------------

    def _save_capture(self):
        traj = _cumulative_to_traj(self._times, self._cum_x, self._cum_y)
        hit = self._hit_var.get()

        miss_timing = None
        miss_magnitude = None
        if not hit:
            timing = self._timing_var.get()
            mag = self._magnitude_var.get()
            miss_timing = timing if timing != 'optimal' else None
            miss_magnitude = mag if mag != 'optimal' else None

        ctx = self._context
        disp = ctx.get('displacement_px', 0)
        angle = ctx.get('angle_rad', 0)
        range_m = ctx.get('range_m', 0)

        if self._learner:
            n = self._learner.add_sample(
                disp, angle, range_m, traj,
                hit=hit,
                miss_timing=miss_timing,
                miss_magnitude=miss_magnitude,
            )
            stats = self._learner.get_stats()
            label = "HIT" if hit else "MISS"
            if not hit and (miss_timing or miss_magnitude):
                parts = [p for p in [miss_timing, miss_magnitude] if p]
                label = f"MISS ({', '.join(parts)})"
            logger.info(f"Refiner saved: {label} | total {n} samples "
                        f"({stats['hits']} hits, {stats['misses']} misses)")

        if self._on_save_cb:
            sample = {
                'disp': round(disp, 1),
                'angle': round(angle, 4),
                'range': round(range_m, 1),
                'total_dx': sum(p['dx'] for p in traj),
                'total_dy': sum(p['dy'] for p in traj),
                'dur': round(traj[-1]['t'] if traj else 0, 3),
                'traj': traj,
                'hit': hit,
            }
            if miss_timing:
                sample['miss_timing'] = miss_timing
            if miss_magnitude:
                sample['miss_magnitude'] = miss_magnitude
            self._on_save_cb(sample)

        self.destroy()

    # ------------------------------------------------------------------
    #  Save — Browse mode (standalone overwrite)
    # ------------------------------------------------------------------

    def _save_browse(self):
        if self._record_index is None:
            logger.warning("No record selected to overwrite")
            return

        traj = _cumulative_to_traj(self._times, self._cum_x, self._cum_y)

        # Auto-backup
        if not self._backup_done and os.path.exists(self._data_file):
            bak = self._data_file + '.bak'
            shutil.copy2(self._data_file, bak)
            logger.info(f"Backup created: {bak}")
            self._backup_done = True

        # Read all lines
        try:
            with open(self._data_file, 'r') as f:
                lines = f.readlines()
        except FileNotFoundError:
            logger.error(f"Data file not found: {self._data_file}")
            return

        if self._record_index >= len(lines):
            logger.error(f"Record index {self._record_index} out of range (file has {len(lines)} lines)")
            return

        # Parse existing record, update trajectory fields
        try:
            record = json.loads(lines[self._record_index].strip())
        except json.JSONDecodeError:
            logger.error(f"Could not parse record at index {self._record_index}")
            return

        record['traj'] = traj
        record['total_dx'] = sum(p['dx'] for p in traj)
        record['total_dy'] = sum(p['dy'] for p in traj)
        record['dur'] = round(traj[-1]['t'] if traj else 0, 3)

        lines[self._record_index] = json.dumps(record, separators=(',', ':')) + '\n'

        with open(self._data_file, 'w') as f:
            f.writelines(lines)

        logger.info(f"Record #{self._record_index} overwritten (Σdx={record['total_dx']} Σdy={record['total_dy']})")

        # Update in-memory samples
        if self._all_samples and self._record_index < len(self._all_samples):
            self._all_samples[self._record_index] = record

    # ------------------------------------------------------------------
    #  Discard / Close
    # ------------------------------------------------------------------

    def _discard(self):
        logger.info("Refiner: DISCARDED (not saved)")
        if self._on_discard_cb:
            self._on_discard_cb()
        self.destroy()

    def _on_close(self):
        if self._replay_thread and self._replay_thread.is_alive():
            self._replay_abort.set()
        if self._on_discard_cb:
            self._on_discard_cb()
        self.destroy()

    # ------------------------------------------------------------------
    #  Record browser selection (browse mode)
    # ------------------------------------------------------------------

    def _on_record_select(self, _event=None):
        sel = self._tree.selection()
        if not sel or not self._all_samples:
            return
        idx = int(sel[0])
        if idx >= len(self._all_samples):
            return

        self._record_index = idx
        sample = self._all_samples[idx]
        traj = sample.get('traj', [])

        self._traj = copy.deepcopy(traj)
        self._orig_traj = copy.deepcopy(traj)
        self._times, self._cum_x, self._cum_y = _traj_to_cumulative(self._traj)
        self._orig_cum_x = self._cum_x.copy()
        self._orig_cum_y = self._cum_y.copy()

        self._context = {
            'displacement_px': sample.get('disp', 0),
            'angle_rad': sample.get('angle', 0),
            'range_m': sample.get('range', 0),
        }

        self._undo_stack.clear()
        self._redo_stack.clear()

        self._fit_view()
        self._redraw()
        self._update_info()
