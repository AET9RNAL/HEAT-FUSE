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


def _monotone_hermite_interp(xs, ys, ms, x_eval):
    """Evaluate monotone cubic Hermite spline at x_eval points.

    Parameters
    ----------
    xs : array of knot x positions (sorted, ascending)
    ys : array of knot y values
    ms : array of tangent slopes at each knot
    x_eval : array of x values to evaluate

    Returns
    -------
    array of interpolated y values (clamped monotone)
    """
    xs = np.asarray(xs, dtype=float)
    ys = np.asarray(ys, dtype=float)
    ms = np.asarray(ms, dtype=float)
    x_eval = np.asarray(x_eval, dtype=float)
    n = len(xs)
    result = np.empty_like(x_eval)

    # Find interval for each eval point
    idx = np.searchsorted(xs, x_eval, side='right') - 1
    idx = np.clip(idx, 0, n - 2)

    for k in range(len(x_eval)):
        i = idx[k]
        h = xs[i + 1] - xs[i]
        if h <= 0:
            result[k] = ys[i]
            continue
        t = (x_eval[k] - xs[i]) / h
        t = max(0.0, min(1.0, t))

        # Hermite basis functions
        h00 = (1 + 2 * t) * (1 - t) ** 2
        h10 = t * (1 - t) ** 2
        h01 = t ** 2 * (3 - 2 * t)
        h11 = t ** 2 * (t - 1)

        result[k] = h00 * ys[i] + h10 * h * ms[i] + h01 * ys[i + 1] + h11 * h * ms[i + 1]

    return result


def _fritsch_carlson_tangents(xs, ys):
    """Compute Fritsch-Carlson monotone tangent slopes for data points.

    Guarantees the interpolant is monotonically increasing when the data is.
    """
    xs = np.asarray(xs, dtype=float)
    ys = np.asarray(ys, dtype=float)
    n = len(xs)
    if n < 2:
        return np.zeros(n)

    # Secant slopes
    deltas = np.diff(ys) / np.maximum(np.diff(xs), 1e-12)

    # Initial tangent estimates (average of adjacent secants)
    ms = np.zeros(n)
    ms[0] = deltas[0]
    ms[-1] = deltas[-1]
    for i in range(1, n - 1):
        if deltas[i - 1] * deltas[i] <= 0:
            ms[i] = 0.0  # local extremum → flat
        else:
            ms[i] = (deltas[i - 1] + deltas[i]) / 2

    # Fritsch-Carlson monotonicity fix
    for i in range(n - 1):
        if abs(deltas[i]) < 1e-12:
            ms[i] = 0.0
            ms[i + 1] = 0.0
        else:
            alpha = ms[i] / deltas[i]
            beta = ms[i + 1] / deltas[i]
            # Restrict to monotone region (circle of radius 3)
            mag = math.hypot(alpha, beta)
            if mag > 3:
                tau = 3.0 / mag
                ms[i] = tau * alpha * deltas[i]
                ms[i + 1] = tau * beta * deltas[i]

    return ms


def _rdp_simplify(points, epsilon):
    """Ramer-Douglas-Peucker path simplification.

    Parameters
    ----------
    points : list of (x, y) tuples
    epsilon : max perpendicular distance tolerance

    Returns
    -------
    list of indices to keep
    """
    if len(points) <= 2:
        return list(range(len(points)))

    # Find point furthest from line between first and last
    start = np.array(points[0], dtype=float)
    end = np.array(points[-1], dtype=float)
    line_vec = end - start
    line_len = np.linalg.norm(line_vec)

    if line_len < 1e-12:
        # Degenerate: all points same, find furthest from start
        dists = [np.linalg.norm(np.array(p) - start) for p in points]
        max_idx = int(np.argmax(dists))
        max_dist = dists[max_idx]
    else:
        line_unit = line_vec / line_len
        perp = np.array([-line_unit[1], line_unit[0]])
        dists = [abs(np.dot(np.array(p) - start, perp)) for p in points]
        max_idx = int(np.argmax(dists))
        max_dist = dists[max_idx]

    if max_dist > epsilon:
        left = _rdp_simplify(points[:max_idx + 1], epsilon)
        right = _rdp_simplify(points[max_idx:], epsilon)
        # Offset right indices
        return left + [max_idx + r for r in right[1:]]
    else:
        return [0, len(points) - 1]


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
        self._orig_times = self._times.copy()

        # Undo stack — entries are (cum_x, cum_y, times) 3-tuples
        self._undo_stack = []
        self._redo_stack = []

        # View transform
        self._zoom = 1.0
        self._pan_x = 0.0
        self._pan_y = 0.0
        self._selected_knots = set()  # indices of selected knots
        self._dragging = False
        self._pan_start = None
        self._marquee_start = None  # (canvas_x, canvas_y) or None
        self._marquee_rect_id = None

        # Time remap state
        self._edit_mode = 'spatial'  # 'spatial' | 'time_remap'
        self._time_remap_expanded = False
        self._time_remap_knots = []  # list of [frac, t, slope] triples
        self._tr_canvas = None
        self._tr_frame = None
        self._tr_selected_knot = None
        self._tr_dragging = False         # dragging a knot body
        self._tr_dragging_handle = None   # 'in' or 'out' tangent handle
        self._tr_drag_start_times = None

        # Replay state
        self._replay_thread = None
        self._replay_abort = threading.Event()

        # Simulation (in-canvas preview) state
        self._sim_running = False
        self._sim_paused = False
        self._sim_loop = False
        self._sim_index = 0          # current point index
        self._sim_start_time = 0.0   # perf_counter when sim started
        self._sim_after_id = None    # tk after id for cancellation
        self._sim_use_edited = True  # True=edited, False=original

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
        tk.Label(main, textvariable=self._info_var, font=("Montserrat", 9),
                 **style).pack(padx=8, anchor=tk.W)

        # --- Sliders ---
        slider_frame = tk.Frame(main, **frame_bg)
        slider_frame.pack(padx=8, pady=4, fill=tk.X)
        self._slider_frame = slider_frame  # ref for time remap insertion

        tk.Label(slider_frame, text="Knots:", font=("Montserrat", 9),
                 **style).pack(side=tk.LEFT)
        knot_slider = tk.Scale(slider_frame, from_=3, to=30, orient=tk.HORIZONTAL,
                               variable=self._num_knots_var, command=self._on_knot_count_change,
                               bg="#16213e", fg="#e0e0e0", troughcolor="#0d1117",
                               highlightthickness=0, length=120, sliderlength=15)
        knot_slider.pack(side=tk.LEFT, padx=(4, 16))

        tk.Label(slider_frame, text="Influence:", font=("Montserrat", 9),
                 **style).pack(side=tk.LEFT)
        sigma_slider = tk.Scale(slider_frame, from_=0.02, to=0.5, resolution=0.01,
                                orient=tk.HORIZONTAL, variable=self._sigma_var,
                                bg="#16213e", fg="#e0e0e0", troughcolor="#0d1117",
                                highlightthickness=0, length=120, sliderlength=15)
        sigma_slider.pack(side=tk.LEFT, padx=4)

        # --- Simplify ---
        simplify_frame = tk.Frame(main, **frame_bg)
        simplify_frame.pack(padx=8, pady=(0, 4), fill=tk.X)

        tk.Button(simplify_frame, text="Simplify Path",
                  command=self._simplify_path, **btn_style).pack(side=tk.LEFT, padx=(0, 8))

        tk.Label(simplify_frame, text="Tolerance:", font=("Consolas", 9),
                 **style).pack(side=tk.LEFT)
        self._simplify_tol_var = tk.DoubleVar(value=1.0)
        tk.Scale(simplify_frame, from_=0.2, to=10.0, resolution=0.1,
                 orient=tk.HORIZONTAL, variable=self._simplify_tol_var,
                 bg="#16213e", fg="#e0e0e0", troughcolor="#0d1117",
                 highlightthickness=0, length=120, sliderlength=15).pack(side=tk.LEFT, padx=4)

        self._simplify_info_var = tk.StringVar(value="")
        tk.Label(simplify_frame, textvariable=self._simplify_info_var,
                 font=("Consolas", 8), bg="#1a1a2e", fg="#00ff88"
                 ).pack(side=tk.LEFT, padx=8)

        # --- Time Remap ---
        self._build_time_remap_panel(main, btn_style, style, frame_bg)

        # --- Replay ---
        replay_frame = tk.Frame(main, **frame_bg)
        replay_frame.pack(padx=8, pady=4, fill=tk.X)

        tk.Button(replay_frame, text="Replay Original", command=self._replay_original,
                  **btn_style).pack(side=tk.LEFT, padx=(0, 4))
        tk.Button(replay_frame, text="Replay Edited", command=self._replay_edited,
                  **btn_style).pack(side=tk.LEFT, padx=4)

        tk.Label(replay_frame, text="Countdown:", font=("Montserrat", 9),
                 **style).pack(side=tk.LEFT, padx=(16, 4))
        tk.Spinbox(replay_frame, from_=0, to=10, width=3, textvariable=self._countdown_var,
                   background="#16213e", foreground="#e0e0e0",
                   highlightthickness=0).pack(side=tk.LEFT)
        tk.Label(replay_frame, text="s", font=("Montserrat", 9),
                 **style).pack(side=tk.LEFT)

        tk.Label(replay_frame, textvariable=self._replay_status_var,
                 font=("Montserrat", 9, "bold"), bg="#1a1a2e", fg="#00ff88"
                 ).pack(side=tk.LEFT, padx=16)

        # --- Simulation (in-editor preview) ---
        self._build_sim_panel(main, btn_style, style, frame_bg)

        # --- Save / Label ---
        save_frame = tk.LabelFrame(main, text=" Save ", font=("Montserrat", 9),
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
                       font=("Montserrat", 10, "bold")).pack(side=tk.LEFT, padx=(0, 12))
        tk.Radiobutton(row1, text="MISS", variable=self._hit_var, value=False,
                       command=self._on_hit_miss_change,
                       bg="#1a1a2e", fg="#ff4444", selectcolor="#16213e",
                       activebackground="#1a1a2e", activeforeground="#ff4444",
                       font=("Montserrat", 10, "bold")).pack(side=tk.LEFT)

        # Miss sub-labels (hidden when HIT selected)
        self._miss_frame = tk.Frame(parent, **frame_bg)

        tk.Label(self._miss_frame, text="Timing:", font=("Montserrat", 9),
                 **style).pack(side=tk.LEFT, padx=(4, 2))
        self._timing_var = tk.StringVar(value="optimal")
        for val, txt in [("premature", "Premature"), ("optimal", "Optimal"), ("late", "Late")]:
            tk.Radiobutton(self._miss_frame, text=txt, variable=self._timing_var,
                           value=val, bg="#1a1a2e", fg="#e0e0e0", selectcolor="#16213e",
                           activebackground="#1a1a2e", activeforeground="#e0e0e0",
                           font=("Montserrat", 9)).pack(side=tk.LEFT)

        tk.Label(self._miss_frame, text="  Mag:", font=("Montserrat", 9),
                 **style).pack(side=tk.LEFT, padx=(8, 2))
        self._magnitude_var = tk.StringVar(value="optimal")
        for val, txt in [("undershoot", "Under"), ("optimal", "Optimal"), ("overshoot", "Over")]:
            tk.Radiobutton(self._miss_frame, text=txt, variable=self._magnitude_var,
                           value=val, bg="#1a1a2e", fg="#e0e0e0", selectcolor="#16213e",
                           activebackground="#1a1a2e", activeforeground="#e0e0e0",
                           font=("Montserrat", 9)).pack(side=tk.LEFT)

        # Buttons
        row_btn = tk.Frame(parent, **frame_bg)
        row_btn.pack(fill=tk.X, padx=4, pady=(4, 2))

        tk.Button(row_btn, text="Save & Close", command=self._save_capture,
                  bg="#0f3460", fg="#00ff88", activebackground="#1a5276",
                  activeforeground="#ffffff", relief=tk.FLAT, padx=12, pady=4,
                  font=("Montserrat", 10, "bold")).pack(side=tk.LEFT, padx=(0, 8))
        tk.Button(row_btn, text="Discard", command=self._discard,
                  bg="#3d0000", fg="#ff4444", activebackground="#5c0000",
                  activeforeground="#ffffff", relief=tk.FLAT, padx=12, pady=4,
                  font=("Montserrat", 10)).pack(side=tk.LEFT, padx=(0, 8))
        tk.Button(row_btn, text="Reset Edits", command=self._reset_edits,
                  **{**btn_style, "font": ("Montserrat", 9)}).pack(side=tk.LEFT)
        tk.Button(row_btn, text="Undo", command=self._undo,
                  **{**btn_style, "font": ("Montserrat", 9)}).pack(side=tk.RIGHT, padx=2)
        tk.Button(row_btn, text="Redo", command=self._redo,
                  **{**btn_style, "font": ("Montserrat", 9)}).pack(side=tk.RIGHT, padx=2)

    def _build_browse_save(self, parent, btn_style, style, frame_bg):
        """Build save panel for browse mode (standalone)."""
        row_btn = tk.Frame(parent, **frame_bg)
        row_btn.pack(fill=tk.X, padx=4, pady=(4, 2))

        tk.Button(row_btn, text="Overwrite Record", command=self._save_browse,
                  bg="#0f3460", fg="#00ff88", activebackground="#1a5276",
                  activeforeground="#ffffff", relief=tk.FLAT, padx=12, pady=4,
                  font=("Montserrat", 10, "bold")).pack(side=tk.LEFT, padx=(0, 8))
        tk.Button(row_btn, text="Reset Edits", command=self._reset_edits,
                  **{**btn_style, "font": ("Montserrat", 9)}).pack(side=tk.LEFT, padx=(0, 8))
        tk.Button(row_btn, text="Undo", command=self._undo,
                  **{**btn_style, "font": ("Montserrat", 9)}).pack(side=tk.RIGHT, padx=2)
        tk.Button(row_btn, text="Redo", command=self._redo,
                  **{**btn_style, "font": ("Montserrat", 9)}).pack(side=tk.RIGHT, padx=2)

    def _build_browse_panel(self):
        """Build the record browser sidebar for standalone mode."""
        browse = tk.Frame(self, bg="#111122", width=280)
        browse.pack(side=tk.LEFT, fill=tk.Y)
        browse.pack_propagate(False)

        tk.Label(browse, text="Records", font=("Montserrat", 11, "bold"),
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
                      font=("Montserrat", 7), anchor=tk.W)

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
                          fill="#4a3060", font=("Montserrat", 7), anchor=tk.W)

        # Ghost line (original trajectory — may differ in length after simplify)
        n_orig = len(self._orig_cum_x)
        if n_orig > 1:
            ghost_pts = []
            for i in range(n_orig):
                px, py = self._world_to_canvas(self._orig_cum_x[i], self._orig_cum_y[i])
                ghost_pts.extend([px, py])
            if len(ghost_pts) >= 4:
                c.create_line(*ghost_pts, fill="#333355", width=1, smooth=False)

        # Edited trajectory — colored by time
        # In time_remap mode: color by actual time fraction (shows speed distribution)
        # In spatial mode: color by index fraction (uniform gradient)
        use_time_color = (self._edit_mode == 'time_remap' and len(self._times) > 1)
        t_min_c = float(self._times[0]) if use_time_color else 0
        t_span_c = float(self._times[-1] - self._times[0]) if use_time_color else 1

        if n > 1:
            for i in range(n - 1):
                if use_time_color:
                    frac = (float(self._times[i]) - t_min_c) / max(t_span_c, 1e-6)
                else:
                    frac = i / max(n - 1, 1)
                r, g, b = self._time_color(frac)
                color = f"#{r:02x}{g:02x}{b:02x}"
                x1, y1 = self._world_to_canvas(self._cum_x[i], self._cum_y[i])
                x2, y2 = self._world_to_canvas(self._cum_x[i + 1], self._cum_y[i + 1])
                c.create_line(x1, y1, x2, y2, fill=color, width=2)

        # Point dots
        for i in range(n):
            if use_time_color:
                frac = (float(self._times[i]) - t_min_c) / max(t_span_c, 1e-6)
            else:
                frac = i / max(n - 1, 1)
            r, g, b = self._time_color(frac)
            color = f"#{r:02x}{g:02x}{b:02x}"
            px, py = self._world_to_canvas(self._cum_x[i], self._cum_y[i])
            c.create_oval(px - 1.5, py - 1.5, px + 1.5, py + 1.5, fill=color, outline="")

        # Endpoint marker
        ex, ey = self._world_to_canvas(self._cum_x[-1], self._cum_y[-1])
        c.create_oval(ex - 4, ey - 4, ex + 4, ey + 4, outline="#ffffff", width=1)

        # Control knots (greyed out in time remap mode)
        knot_indices = self._get_knot_indices()
        in_time_mode = self._edit_mode == 'time_remap'
        for ki in knot_indices:
            kx, ky = self._world_to_canvas(self._cum_x[ki], self._cum_y[ki])
            r = self.KNOT_RADIUS
            if in_time_mode or ki == 0:
                # Locked knot — grey
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
        font = ("Montserrat", 7)
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
    #  Path simplification (Ramer-Douglas-Peucker)
    # ------------------------------------------------------------------

    def _simplify_path(self):
        """Simplify the trajectory path in the selected region or entire path.

        Uses RDP algorithm on cumulative (x, y) positions. Removes intermediate
        points while preserving shape within tolerance. Timing is linearly
        redistributed across surviving points in the simplified segment.
        """
        n = len(self._cum_x)
        if n < 3:
            return

        epsilon = self._simplify_tol_var.get()

        # Determine the range to simplify
        if self._selected_knots:
            selected_ki = sorted(self._selected_knots)
            # Find the trajectory index range covered by the selection
            lo = min(selected_ki)
            hi = max(selected_ki)
            # Extend to include the full span between the outermost selected knots
            # But pin to actual trajectory indices, not knot indices
            lo = max(0, lo)
            hi = min(n - 1, hi)
        else:
            lo, hi = 0, n - 1

        if hi - lo < 2:
            self._simplify_info_var.set("Need 3+ pts")
            return

        # Extract segment
        seg_points = [(float(self._cum_x[i]), float(self._cum_y[i]))
                      for i in range(lo, hi + 1)]
        seg_times = self._times[lo:hi + 1].copy()

        # Run RDP
        keep_local = _rdp_simplify(seg_points, epsilon)

        removed = (hi - lo + 1) - len(keep_local)
        if removed == 0:
            self._simplify_info_var.set("Already simple")
            return

        # Push undo
        self._undo_stack.append((self._cum_x.copy(), self._cum_y.copy(), self._times.copy()))
        self._redo_stack.clear()

        # Build new arrays: keep everything outside [lo, hi], replace inside
        # with only the kept points. Redistribute timing linearly.
        new_cum_x = []
        new_cum_y = []
        new_times = []

        # Before the segment
        for i in range(lo):
            new_cum_x.append(self._cum_x[i])
            new_cum_y.append(self._cum_y[i])
            new_times.append(self._times[i])

        # The simplified segment — redistribute time linearly
        t_start = float(seg_times[0])
        t_end = float(seg_times[-1])
        num_kept = len(keep_local)
        for j, local_idx in enumerate(keep_local):
            new_cum_x.append(seg_points[local_idx][0])
            new_cum_y.append(seg_points[local_idx][1])
            if num_kept > 1:
                frac = j / (num_kept - 1)
            else:
                frac = 0.0
            new_times.append(t_start + frac * (t_end - t_start))

        # After the segment
        for i in range(hi + 1, n):
            new_cum_x.append(self._cum_x[i])
            new_cum_y.append(self._cum_y[i])
            new_times.append(self._times[i])

        self._cum_x = np.array(new_cum_x)
        self._cum_y = np.array(new_cum_y)
        self._times = np.array(new_times)

        # Note: _orig_cum_x/y/times are NOT updated — they retain the
        # pre-simplification shape so the ghost line still shows it and
        # undo can restore to any previous length.

        # Clear selection (indices shifted)
        self._selected_knots.clear()

        new_n = len(self._cum_x)
        self._simplify_info_var.set(f"{n}\u2192{new_n} pts (-{removed})")
        logger.info(f"Path simplified: {n} \u2192 {new_n} points "
                    f"(removed {removed}, tolerance={epsilon:.1f}px, "
                    f"range [{lo}:{hi}])")

        self._redraw()
        self._update_info()

    # ------------------------------------------------------------------
    #  Canvas interaction
    # ------------------------------------------------------------------

    def _on_canvas_press(self, event):
        """Select knots or start drag/marquee. Ctrl+click toggles. Index 0 is locked."""
        if self._edit_mode == 'time_remap':
            return  # spatial editing disabled in time remap mode
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
            # No knot hit — start marquee selection
            if not ctrl_held:
                self._selected_knots.clear()
            self._marquee_start = (event.x, event.y)
            self._redraw()

    def _on_canvas_drag(self, event):
        if self._edit_mode == 'time_remap':
            return
        # Marquee selection drag
        if self._marquee_start is not None and not self._dragging:
            sx, sy = self._marquee_start
            # Draw rubber-band rectangle
            if self._marquee_rect_id:
                self._canvas.delete(self._marquee_rect_id)
            self._marquee_rect_id = self._canvas.create_rectangle(
                sx, sy, event.x, event.y,
                outline="#4fc3f7", width=1, dash=(3, 3))
            return
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
        # Finalize marquee selection
        if self._marquee_start is not None and not self._dragging:
            sx, sy = self._marquee_start
            ex, ey = event.x, event.y
            x1, x2 = min(sx, ex), max(sx, ex)
            y1, y2 = min(sy, ey), max(sy, ey)

            # Only select if marquee has meaningful size (> 4px)
            if (x2 - x1) > 4 or (y2 - y1) > 4:
                ctrl_held = bool(event.state & 0x4)
                if not ctrl_held:
                    self._selected_knots.clear()
                for ki in self._get_knot_indices():
                    if ki == 0:
                        continue
                    kx, ky = self._world_to_canvas(self._cum_x[ki], self._cum_y[ki])
                    if x1 <= kx <= x2 and y1 <= ky <= y2:
                        self._selected_knots.add(ki)

            if self._marquee_rect_id:
                self._canvas.delete(self._marquee_rect_id)
                self._marquee_rect_id = None
            self._marquee_start = None
            self._redraw()
            return

        if self._dragging:
            # Push to undo stack (3-tuple: cum_x, cum_y, times)
            self._undo_stack.append((self._drag_start_cum_x, self._drag_start_cum_y, self._times.copy()))
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
        self._redo_stack.append((self._cum_x.copy(), self._cum_y.copy(), self._times.copy()))
        prev = self._undo_stack.pop()
        self._cum_x = prev[0].copy()
        self._cum_y = prev[1].copy()
        if len(prev) >= 3:
            self._times = prev[2].copy()
        if self._time_remap_expanded:
            self._init_time_remap_knots()
            self._redraw_time_remap()
        self._redraw()
        self._update_info()

    def _redo(self):
        if not self._redo_stack:
            return
        self._undo_stack.append((self._cum_x.copy(), self._cum_y.copy(), self._times.copy()))
        nxt = self._redo_stack.pop()
        self._cum_x = nxt[0].copy()
        self._cum_y = nxt[1].copy()
        if len(nxt) >= 3:
            self._times = nxt[2].copy()
        if self._time_remap_expanded:
            self._init_time_remap_knots()
            self._redraw_time_remap()
        self._redraw()
        self._update_info()

    def _reset_edits(self):
        self._undo_stack.append((self._cum_x.copy(), self._cum_y.copy(), self._times.copy()))
        self._redo_stack.clear()
        self._cum_x = self._orig_cum_x.copy()
        self._cum_y = self._orig_cum_y.copy()
        self._times = self._orig_times.copy()
        if self._time_remap_expanded:
            self._init_time_remap_knots()
            self._redraw_time_remap()
        self._redraw()
        self._update_info()

    # ------------------------------------------------------------------
    #  Time Remap
    # ------------------------------------------------------------------

    def _build_time_remap_panel(self, parent, btn_style, style, frame_bg):
        """Build the collapsible time remap sub-panel."""
        toggle_row = tk.Frame(parent, **frame_bg)
        toggle_row.pack(fill=tk.X, padx=8, pady=(4, 0))

        self._tr_toggle_btn = tk.Button(
            toggle_row, text="Time Remap \u25b6",
            command=self._toggle_time_remap, **btn_style)
        self._tr_toggle_btn.pack(side=tk.LEFT)

        self._tr_mode_label = tk.Label(
            toggle_row, text="", font=("Montserrat", 8),
            bg="#1a1a2e", fg="#ff8800")
        self._tr_mode_label.pack(side=tk.LEFT, padx=8)

        # Collapsible frame (initially hidden)
        self._tr_frame = tk.Frame(parent, bg="#0d1117", bd=1, relief=tk.SUNKEN)

        # Mini timing canvas
        self._tr_canvas = tk.Canvas(
            self._tr_frame, bg="#0d1117", width=580, height=120,
            highlightthickness=0, cursor="hand2")
        self._tr_canvas.pack(padx=4, pady=4, fill=tk.X)

        self._tr_canvas.bind("<ButtonPress-1>", self._on_tr_press)
        self._tr_canvas.bind("<B1-Motion>", self._on_tr_drag)
        self._tr_canvas.bind("<ButtonRelease-1>", self._on_tr_release)
        self._tr_canvas.bind("<Double-Button-1>", self._on_tr_double_click)
        self._tr_canvas.bind("<Button-3>", self._on_tr_right_click)
        self._tr_canvas.bind("<Configure>", lambda e: self._redraw_time_remap()
                             if self._time_remap_expanded else None)

        # Quick action buttons
        small_btn = {**btn_style, "font": ("Montserrat", 8)}
        action_row = tk.Frame(self._tr_frame, **frame_bg)
        action_row.pack(fill=tk.X, padx=4, pady=(0, 4))

        tk.Button(action_row, text="Reset Timing",
                  command=self._reset_timing, **small_btn).pack(side=tk.LEFT, padx=2)
        tk.Button(action_row, text="Delay +20ms",
                  command=lambda: self._shift_onset(0.02), **small_btn).pack(side=tk.LEFT, padx=2)
        tk.Button(action_row, text="Advance -20ms",
                  command=lambda: self._shift_onset(-0.02), **small_btn).pack(side=tk.LEFT, padx=2)
        tk.Button(action_row, text="Stretch x1.2",
                  command=lambda: self._scale_duration(1.2), **small_btn).pack(side=tk.LEFT, padx=2)
        tk.Button(action_row, text="Compress x0.8",
                  command=lambda: self._scale_duration(0.8), **small_btn).pack(side=tk.LEFT, padx=2)

    def _toggle_time_remap(self):
        if self._time_remap_expanded:
            self._tr_frame.pack_forget()
            self._edit_mode = 'spatial'
            self._tr_toggle_btn.config(text="Time Remap \u25b6")
            self._tr_mode_label.config(text="")
            self._time_remap_expanded = False
        else:
            self._tr_frame.pack(fill=tk.X, padx=8, pady=4,
                                after=self._slider_frame)
            self._edit_mode = 'time_remap'
            self._tr_toggle_btn.config(text="Time Remap \u25bc")
            self._tr_mode_label.config(text="EDITING TIMING (spatial locked)")
            self._time_remap_expanded = True
            self._init_time_remap_knots()
            self._redraw_time_remap()
        self._redraw()

    def _init_time_remap_knots(self):
        """Derive remap knots with Fritsch-Carlson monotone tangents."""
        n = len(self._times)
        if n < 2:
            self._time_remap_knots = []
            return
        num_knots = min(7, n)
        fracs = []
        t_vals = []
        for i in range(num_knots):
            frac = i / (num_knots - 1)
            idx = int(round(frac * (n - 1)))
            fracs.append(frac)
            t_vals.append(float(self._times[idx]))

        slopes = _fritsch_carlson_tangents(fracs, t_vals)
        self._time_remap_knots = []
        for i in range(num_knots):
            self._time_remap_knots.append([fracs[i], t_vals[i], float(slopes[i])])

    # --- Timing curve drawing ---

    def _tr_layout(self):
        """Return (cw, ch, pad_l, pad_r, pad_t, pad_b, plot_w, plot_h, t_max)."""
        cw = self._tr_canvas.winfo_width() or 580
        ch = self._tr_canvas.winfo_height() or 120
        pad_l, pad_r, pad_t, pad_b = 44, 10, 10, 20
        plot_w = cw - pad_l - pad_r
        plot_h = ch - pad_t - pad_b
        t_max = float(max(self._times[-1], self._orig_times[-1])) * 1.15
        if t_max <= 0:
            t_max = 0.1
        return cw, ch, pad_l, pad_r, pad_t, pad_b, plot_w, plot_h, t_max

    def _tr_frac_to_cx(self, frac, pad_l, plot_w):
        return pad_l + frac * plot_w

    def _tr_t_to_cy(self, t, pad_t, plot_h, t_max):
        return pad_t + plot_h - t / max(t_max, 1e-6) * plot_h

    def _redraw_time_remap(self):
        """Draw the timing curve on the mini canvas."""
        c = self._tr_canvas
        if c is None:
            return
        c.delete("all")

        n = len(self._times)
        if n < 2:
            return

        cw, ch, pad_l, pad_r, pad_t, pad_b, plot_w, plot_h, t_max = self._tr_layout()
        frac_cx = lambda f: self._tr_frac_to_cx(f, pad_l, plot_w)
        t_cy = lambda t: self._tr_t_to_cy(t, pad_t, plot_h, t_max)
        font = ("Montserrat", 7)
        tc = "#444455"

        # Grid lines
        for i in range(5):
            y = pad_t + i * plot_h / 4
            c.create_line(pad_l, y, pad_l + plot_w, y, fill="#1a1a2e", width=1, dash=(2, 4))

        # Original timing (ghost reference)
        for i in range(n - 1):
            f1 = i / (n - 1)
            f2 = (i + 1) / (n - 1)
            x1, y1 = frac_cx(f1), t_cy(float(self._orig_times[i]))
            x2, y2 = frac_cx(f2), t_cy(float(self._orig_times[i + 1]))
            c.create_line(x1, y1, x2, y2, fill="#333355", width=1)

        # Current remap curve (cubic hermite)
        if self._time_remap_knots:
            fracs_arr = np.array([k[0] for k in self._time_remap_knots])
            t_arr = np.array([k[1] for k in self._time_remap_knots])
            m_arr = np.array([k[2] for k in self._time_remap_knots])
            steps = 120
            x_eval = np.linspace(0, 1, steps + 1)
            y_eval = _monotone_hermite_interp(fracs_arr, t_arr, m_arr, x_eval)
            prev_px, prev_py = None, None
            for s in range(steps + 1):
                px = frac_cx(float(x_eval[s]))
                py = t_cy(float(y_eval[s]))
                if prev_px is not None:
                    c.create_line(prev_px, prev_py, px, py, fill="#4fc3f7", width=2)
                prev_px, prev_py = px, py

        # Tangent handles + knot bodies
        handle_len = 30  # px length of tangent arm on canvas
        r = 5
        for i, knot in enumerate(self._time_remap_knots):
            frac, t_val, slope = knot[0], knot[1], knot[2]
            kx = frac_cx(frac)
            ky = t_cy(t_val)

            # Tangent handle endpoints (slope is dt/dfrac in world units)
            # Convert slope to canvas: dx_canvas per dfrac = plot_w,
            # dy_canvas per dt = -plot_h/t_max
            dx_world = 1.0  # unit in frac
            dy_world = slope  # dt per dfrac
            dx_px = dx_world * plot_w
            dy_px = -dy_world * plot_h / max(t_max, 1e-6)
            arm_len = math.hypot(dx_px, dy_px)
            if arm_len > 0:
                scale = handle_len / arm_len
                hx = dx_px * scale
                hy = dy_px * scale
            else:
                hx, hy = handle_len, 0

            # Draw tangent arms + handle dots (only when this knot is selected)
            if i == self._tr_selected_knot:
                # In handle (behind)
                c.create_line(kx, ky, kx - hx, ky - hy,
                              fill="#996633", width=1, dash=(3, 2))
                c.create_oval(kx - hx - 3, ky - hy - 3,
                              kx - hx + 3, ky - hy + 3,
                              fill="#ff8800", outline="#ffcc00", width=1)
                # Out handle (ahead)
                c.create_line(kx, ky, kx + hx, ky + hy,
                              fill="#996633", width=1, dash=(3, 2))
                c.create_oval(kx + hx - 3, ky + hy - 3,
                              kx + hx + 3, ky + hy + 3,
                              fill="#ff8800", outline="#ffcc00", width=1)

            # Knot body
            if i == self._tr_selected_knot:
                fill, outline = "#ff8800", "#ffcc00"
            else:
                fill, outline = "#0f3460", "#4fc3f7"
            c.create_oval(kx - r, ky - r, kx + r, ky + r,
                          fill=fill, outline=outline, width=2)

        # Axis labels
        c.create_text(pad_l - 4, pad_t, text=f"{t_max:.3f}s",
                      fill=tc, font=font, anchor=tk.NE)
        c.create_text(pad_l - 4, pad_t + plot_h, text="0.000s",
                      fill=tc, font=font, anchor=tk.NE)
        c.create_text(pad_l, ch - 2, text="0%",
                      fill=tc, font=font, anchor=tk.SW)
        c.create_text(pad_l + plot_w, ch - 2, text="100%",
                      fill=tc, font=font, anchor=tk.SE)
        c.create_text(pad_l + plot_w / 2, ch - 2, text="trajectory progress",
                      fill=tc, font=font, anchor=tk.S)
        c.create_text(pad_l - 4, pad_t + plot_h / 2, text="t(s)",
                      fill=tc, font=font, anchor=tk.E)

    # --- Timing knot interaction ---

    def _tr_handle_pos(self, knot_idx, which, pad_l, plot_w, pad_t, plot_h, t_max):
        """Get canvas position of a tangent handle ('in' or 'out')."""
        frac, t_val, slope = self._time_remap_knots[knot_idx]
        kx = self._tr_frac_to_cx(frac, pad_l, plot_w)
        ky = self._tr_t_to_cy(t_val, pad_t, plot_h, t_max)
        dx_px = plot_w
        dy_px = -slope * plot_h / max(t_max, 1e-6)
        arm_len = math.hypot(dx_px, dy_px)
        handle_len = 30
        if arm_len > 0:
            s = handle_len / arm_len
            hx, hy = dx_px * s, dy_px * s
        else:
            hx, hy = handle_len, 0
        if which == 'in':
            return kx - hx, ky - hy
        else:
            return kx + hx, ky + hy

    def _on_tr_press(self, event):
        """Select nearest knot or tangent handle on the timing curve."""
        cw, ch, pad_l, pad_r, pad_t, pad_b, plot_w, plot_h, t_max = self._tr_layout()

        # First check tangent handles of the currently selected knot
        if self._tr_selected_knot is not None:
            si = self._tr_selected_knot
            for which in ('in', 'out'):
                hx, hy = self._tr_handle_pos(si, which, pad_l, plot_w, pad_t, plot_h, t_max)
                if math.hypot(event.x - hx, event.y - hy) < 10:
                    self._tr_dragging_handle = which
                    self._tr_dragging = False
                    self._tr_drag_start_times = self._times.copy()
                    return

        # Then check knot bodies
        best_dist = float('inf')
        best_i = None
        for i, knot in enumerate(self._time_remap_knots):
            kx = self._tr_frac_to_cx(knot[0], pad_l, plot_w)
            ky = self._tr_t_to_cy(knot[1], pad_t, plot_h, t_max)
            d = math.hypot(event.x - kx, event.y - ky)
            if d < 12 and d < best_dist:
                best_dist = d
                best_i = i

        self._tr_dragging_handle = None
        if best_i is not None:
            self._tr_selected_knot = best_i
            self._tr_dragging = True
            self._tr_drag_start_times = self._times.copy()
        else:
            self._tr_selected_knot = None
        self._redraw_time_remap()

    def _on_tr_drag(self, event):
        """Drag selected time knot or tangent handle."""
        if self._tr_selected_knot is None:
            return

        cw, ch, pad_l, pad_r, pad_t, pad_b, plot_w, plot_h, t_max = self._tr_layout()
        ki = self._tr_selected_knot
        knots = self._time_remap_knots

        if self._tr_dragging_handle is not None:
            # Dragging a tangent handle → compute new slope
            kx = self._tr_frac_to_cx(knots[ki][0], pad_l, plot_w)
            ky = self._tr_t_to_cy(knots[ki][1], pad_t, plot_h, t_max)
            dx_px = event.x - kx
            dy_px = event.y - ky
            if self._tr_dragging_handle == 'in':
                dx_px, dy_px = -dx_px, -dy_px

            # Convert canvas deltas back to slope (dt/dfrac)
            # dx_px = dfrac * plot_w → dfrac = dx_px / plot_w
            # dy_px = -dt * plot_h / t_max → dt = -dy_px * t_max / plot_h
            if abs(dx_px) < 2:
                return  # avoid division by near-zero
            dfrac = dx_px / max(plot_w, 1)
            dt = -dy_px * t_max / max(plot_h, 1)
            slope = dt / dfrac
            slope = max(0.0, slope)  # keep non-negative for monotonicity
            knots[ki][2] = slope

            self._apply_remap_from_knots()
            self._redraw_time_remap()
            self._redraw()
            self._update_info()
            return

        if not self._tr_dragging:
            return

        # Dragging knot body vertically
        t_val = (pad_t + plot_h - event.y) / max(plot_h, 1) * t_max
        t_val = max(0.0, t_val)

        # Clamp between neighboring knots for monotonicity
        min_t = knots[ki - 1][1] + 1e-4 if ki > 0 else 0.0
        max_t = knots[ki + 1][1] - 1e-4 if ki < len(knots) - 1 else t_val + 0.5
        t_val = max(min_t, min(max_t, t_val))

        knots[ki][1] = t_val
        self._apply_remap_from_knots()
        self._redraw_time_remap()
        self._redraw()
        self._update_info()

    def _on_tr_release(self, event):
        if (self._tr_dragging or self._tr_dragging_handle) and self._tr_drag_start_times is not None:
            self._undo_stack.append((
                self._cum_x.copy(), self._cum_y.copy(), self._tr_drag_start_times))
            self._redo_stack.clear()
            self._tr_dragging = False
            self._tr_dragging_handle = None
            self._tr_drag_start_times = None

    def _on_tr_double_click(self, event):
        """Double-click: add a new knot with auto-computed slope."""
        cw, ch, pad_l, pad_r, pad_t, pad_b, plot_w, plot_h, t_max = self._tr_layout()

        frac = (event.x - pad_l) / max(plot_w, 1)
        t_val = (pad_t + plot_h - event.y) / max(plot_h, 1) * t_max
        frac = max(0.01, min(0.99, frac))
        t_val = max(0.0, t_val)

        # Insert in sorted order by frac
        insert_idx = 0
        for i, knot in enumerate(self._time_remap_knots):
            if frac > knot[0]:
                insert_idx = i + 1

        # Clamp between neighbors
        if insert_idx > 0:
            t_val = max(t_val, self._time_remap_knots[insert_idx - 1][1] + 1e-4)
        if insert_idx < len(self._time_remap_knots):
            t_val = min(t_val, self._time_remap_knots[insert_idx][1] - 1e-4)

        # Estimate slope from neighbors (secant)
        slope = 0.0
        if insert_idx > 0 and insert_idx < len(self._time_remap_knots):
            prev = self._time_remap_knots[insert_idx - 1]
            nxt = self._time_remap_knots[insert_idx]
            df = nxt[0] - prev[0]
            if df > 0:
                slope = (nxt[1] - prev[1]) / df
        slope = max(0.0, slope)

        self._undo_stack.append((self._cum_x.copy(), self._cum_y.copy(), self._times.copy()))
        self._redo_stack.clear()

        self._time_remap_knots.insert(insert_idx, [frac, t_val, slope])
        self._apply_remap_from_knots()
        self._redraw_time_remap()
        self._redraw()
        self._update_info()

    def _on_tr_right_click(self, event):
        """Right-click: delete nearest intermediate knot."""
        if len(self._time_remap_knots) <= 2:
            return
        cw, ch, pad_l, pad_r, pad_t, pad_b, plot_w, plot_h, t_max = self._tr_layout()
        best_dist = float('inf')
        best_i = None
        for i, knot in enumerate(self._time_remap_knots):
            if i == 0 or i == len(self._time_remap_knots) - 1:
                continue  # don't delete endpoints
            kx = self._tr_frac_to_cx(knot[0], pad_l, plot_w)
            ky = self._tr_t_to_cy(knot[1], pad_t, plot_h, t_max)
            d = math.hypot(event.x - kx, event.y - ky)
            if d < 12 and d < best_dist:
                best_dist = d
                best_i = i

        if best_i is not None:
            self._undo_stack.append((self._cum_x.copy(), self._cum_y.copy(), self._times.copy()))
            self._redo_stack.clear()
            self._time_remap_knots.pop(best_i)
            self._apply_remap_from_knots()
            self._tr_selected_knot = None
            self._redraw_time_remap()
            self._redraw()
            self._update_info()

    # --- Core remap math ---

    def _apply_remap_from_knots(self):
        """Interpolate time remap via monotone cubic Hermite spline."""
        n = len(self._times)
        if n < 2 or not self._time_remap_knots:
            return

        fracs = np.array([k[0] for k in self._time_remap_knots])
        t_outs = np.array([k[1] for k in self._time_remap_knots])
        slopes = np.array([k[2] for k in self._time_remap_knots])

        index_fracs = np.linspace(0, 1, n)
        new_times = _monotone_hermite_interp(fracs, t_outs, slopes, index_fracs)

        # Enforce strict monotonicity (safety net)
        for i in range(1, n):
            if new_times[i] <= new_times[i - 1]:
                new_times[i] = new_times[i - 1] + 1e-5

        self._times = new_times

    # --- Quick actions ---

    def _reset_timing(self):
        """Reset times to original values."""
        self._undo_stack.append((self._cum_x.copy(), self._cum_y.copy(), self._times.copy()))
        self._redo_stack.clear()
        self._times = self._orig_times.copy()
        self._init_time_remap_knots()
        self._redraw_time_remap()
        self._redraw()
        self._update_info()

    def _shift_onset(self, delta_s):
        """Shift all times by delta_s (positive = delay, negative = advance)."""
        self._undo_stack.append((self._cum_x.copy(), self._cum_y.copy(), self._times.copy()))
        self._redo_stack.clear()
        new_times = self._times + delta_s
        min_val = float(np.min(new_times))
        if min_val < 0:
            new_times -= min_val
        self._times = new_times
        self._init_time_remap_knots()
        self._redraw_time_remap()
        self._redraw()
        self._update_info()

    def _scale_duration(self, factor):
        """Scale all times by a factor (>1 = stretch, <1 = compress)."""
        self._undo_stack.append((self._cum_x.copy(), self._cum_y.copy(), self._times.copy()))
        self._redo_stack.clear()
        self._times = self._times * factor
        self._init_time_remap_knots()
        self._redraw_time_remap()
        self._redraw()
        self._update_info()

    # ------------------------------------------------------------------
    #  Simulation (in-editor animated preview)
    # ------------------------------------------------------------------

    SIM_CANVAS_H = 100

    def _build_sim_panel(self, parent, btn_style, style, frame_bg):
        """Build the always-visible simulation preview panel."""
        sim_label = tk.LabelFrame(parent, text=" Simulate ", font=("Montserrat", 9),
                                  bg="#1a1a2e", fg="#e0e0e0", bd=1)
        sim_label.pack(padx=8, pady=4, fill=tk.X)

        # Simulation canvas
        self._sim_canvas = tk.Canvas(sim_label, bg="#0d1117", height=self.SIM_CANVAS_H,
                                     highlightthickness=0)
        self._sim_canvas.pack(padx=4, pady=(4, 2), fill=tk.X)

        # Controls row
        ctrl_row = tk.Frame(sim_label, **frame_bg)
        ctrl_row.pack(fill=tk.X, padx=4, pady=(0, 4))

        small_btn = {**btn_style, "font": ("Montserrat", 8)}

        self._sim_play_btn = tk.Button(ctrl_row, text="\u25b6 Play",
                                       command=self._sim_play_pause, **small_btn)
        self._sim_play_btn.pack(side=tk.LEFT, padx=2)

        tk.Button(ctrl_row, text="\u25a0 Stop",
                  command=self._sim_stop, **small_btn).pack(side=tk.LEFT, padx=2)

        self._sim_loop_var = tk.BooleanVar(value=False)
        self._sim_loop_cb = tk.Checkbutton(
            ctrl_row, text="Loop", variable=self._sim_loop_var,
            command=self._sim_loop_toggle,
            bg="#1a1a2e", fg="#e0e0e0", selectcolor="#16213e",
            activebackground="#1a1a2e", activeforeground="#e0e0e0",
            font=("Montserrat", 8))
        self._sim_loop_cb.pack(side=tk.LEFT, padx=8)

        self._sim_src_var = tk.StringVar(value="edited")
        tk.Radiobutton(ctrl_row, text="Edited", variable=self._sim_src_var,
                       value="edited", command=self._sim_source_change,
                       bg="#1a1a2e", fg="#e0e0e0", selectcolor="#16213e",
                       activebackground="#1a1a2e", activeforeground="#e0e0e0",
                       font=("Montserrat", 8)).pack(side=tk.LEFT, padx=(8, 2))
        tk.Radiobutton(ctrl_row, text="Original", variable=self._sim_src_var,
                       value="original", command=self._sim_source_change,
                       bg="#1a1a2e", fg="#e0e0e0", selectcolor="#16213e",
                       activebackground="#1a1a2e", activeforeground="#e0e0e0",
                       font=("Montserrat", 8)).pack(side=tk.LEFT, padx=2)

        self._sim_time_var = tk.StringVar(value="")
        tk.Label(ctrl_row, textvariable=self._sim_time_var,
                 font=("Montserrat", 8), bg="#1a1a2e", fg="#00ff88"
                 ).pack(side=tk.RIGHT, padx=4)

        # Draw static preview immediately
        self._sim_draw_static()

    def _sim_get_data(self):
        """Return (times, cum_x, cum_y) for the selected source."""
        if self._sim_use_edited:
            return self._times, self._cum_x, self._cum_y
        else:
            return self._orig_times, self._orig_cum_x, self._orig_cum_y

    def _sim_layout(self):
        """Return (cw, ch, pad, x_min, x_max, y_min, y_max, scale)."""
        c = self._sim_canvas
        cw = c.winfo_width() or 580
        ch = c.winfo_height() or self.SIM_CANVAS_H
        pad = 12

        times, cx_arr, cy_arr = self._sim_get_data()
        if len(cx_arr) == 0:
            return cw, ch, pad, 0, 1, 0, 1, 1.0

        x_min = min(0, float(np.min(cx_arr)))
        x_max = max(0, float(np.max(cx_arr)))
        y_min = min(0, float(np.min(cy_arr)))
        y_max = max(0, float(np.max(cy_arr)))

        span_x = max(x_max - x_min, 1)
        span_y = max(y_max - y_min, 1)
        scale = min((cw - 2 * pad) / span_x, (ch - 2 * pad) / span_y)

        return cw, ch, pad, x_min, x_max, y_min, y_max, scale

    def _sim_world_to_canvas(self, wx, wy):
        cw, ch, pad, x_min, x_max, y_min, y_max, scale = self._sim_layout()
        mid_x = (x_min + x_max) / 2
        mid_y = (y_min + y_max) / 2
        cx = cw / 2 + (wx - mid_x) * scale
        cy = ch / 2 + (wy - mid_y) * scale
        return cx, cy

    def _sim_draw_static(self):
        """Draw the full trajectory path (dimmed) as background."""
        c = self._sim_canvas
        c.delete("all")
        times, cx_arr, cy_arr = self._sim_get_data()
        n = len(cx_arr)
        if n < 2:
            return

        # Origin crosshair
        ox, oy = self._sim_world_to_canvas(0, 0)
        c.create_line(ox - 6, oy, ox + 6, oy, fill="#333333", width=1)
        c.create_line(ox, oy - 6, ox, oy + 6, fill="#333333", width=1)

        # Full path (dim)
        pts = []
        for i in range(n):
            px, py = self._sim_world_to_canvas(cx_arr[i], cy_arr[i])
            pts.extend([px, py])
        if len(pts) >= 4:
            c.create_line(*pts, fill="#222244", width=1.5, smooth=False)

        # Endpoint
        ex, ey = self._sim_world_to_canvas(cx_arr[-1], cy_arr[-1])
        c.create_oval(ex - 3, ey - 3, ex + 3, ey + 3, outline="#444466", width=1)

    def _sim_draw_frame(self, up_to_index):
        """Draw the animated portion up to the given index + cursor dot."""
        c = self._sim_canvas
        # Clear previous animated elements
        c.delete("sim_trail")
        c.delete("sim_cursor")

        times, cx_arr, cy_arr = self._sim_get_data()
        n = len(cx_arr)
        if n < 2 or up_to_index < 0:
            return

        idx = min(up_to_index, n - 1)

        # Bright trail up to current point
        if idx > 0:
            pts = []
            for i in range(idx + 1):
                frac = i / max(n - 1, 1)
                px, py = self._sim_world_to_canvas(cx_arr[i], cy_arr[i])
                pts.extend([px, py])
            if len(pts) >= 4:
                c.create_line(*pts, fill="#4fc3f7", width=2, smooth=False,
                              tags="sim_trail")

        # Cursor dot
        px, py = self._sim_world_to_canvas(cx_arr[idx], cy_arr[idx])
        r = 5
        c.create_oval(px - r, py - r, px + r, py + r,
                      fill="#ff8800", outline="#ffcc00", width=2,
                      tags="sim_cursor")

        # Time readout
        t_val = float(times[idx])
        self._sim_time_var.set(f"t={t_val:.4f}s  [{idx+1}/{n}]")

    def _sim_play_pause(self):
        """Toggle play/pause."""
        if self._sim_running and not self._sim_paused:
            # Pause
            self._sim_paused = True
            self._sim_play_btn.config(text="\u25b6 Resume")
            if self._sim_after_id:
                self.after_cancel(self._sim_after_id)
                self._sim_after_id = None
        elif self._sim_running and self._sim_paused:
            # Resume
            self._sim_paused = False
            self._sim_play_btn.config(text="\u23f8 Pause")
            self._sim_start_time = time.perf_counter() - self._sim_pause_elapsed
            self._sim_tick()
        else:
            # Start fresh
            self._sim_start(from_index=0)

    def _sim_start(self, from_index=0):
        """Start simulation from a given index."""
        times, cx_arr, cy_arr = self._sim_get_data()
        n = len(times)
        if n < 2:
            return

        self._sim_running = True
        self._sim_paused = False
        self._sim_index = from_index
        self._sim_loop = self._sim_loop_var.get()
        self._sim_use_edited = (self._sim_src_var.get() == "edited")
        self._sim_play_btn.config(text="\u23f8 Pause")

        # Offset start time so we begin at the correct t for from_index
        t_offset = float(times[from_index]) if from_index > 0 else 0.0
        self._sim_start_time = time.perf_counter() - t_offset
        self._sim_pause_elapsed = t_offset

        self._sim_draw_static()
        self._sim_tick()

    def _sim_tick(self):
        """Advance simulation by one frame (~16ms)."""
        if not self._sim_running or self._sim_paused:
            return

        times, cx_arr, cy_arr = self._sim_get_data()
        n = len(times)
        if n < 2:
            self._sim_stop()
            return

        elapsed = time.perf_counter() - self._sim_start_time
        self._sim_pause_elapsed = elapsed

        # Find the index whose time we've reached
        idx = self._sim_index
        while idx < n and float(times[idx]) <= elapsed:
            idx += 1
        idx = min(idx, n - 1)
        self._sim_index = idx

        self._sim_draw_frame(idx)

        if idx >= n - 1:
            # Reached end
            if self._sim_loop_var.get():
                # Restart after a brief pause
                self._sim_after_id = self.after(300, lambda: self._sim_start(0))
            else:
                self._sim_running = False
                self._sim_play_btn.config(text="\u25b6 Play")
                self._sim_time_var.set(f"t={float(times[-1]):.4f}s  [done]")
            return

        # Schedule next tick (~16ms ≈ 60fps)
        self._sim_after_id = self.after(16, self._sim_tick)

    def _sim_stop(self):
        """Stop simulation and reset."""
        self._sim_running = False
        self._sim_paused = False
        self._sim_play_btn.config(text="\u25b6 Play")
        if self._sim_after_id:
            self.after_cancel(self._sim_after_id)
            self._sim_after_id = None
        self._sim_index = 0
        self._sim_time_var.set("")
        self._sim_draw_static()

    def _sim_loop_toggle(self):
        self._sim_loop = self._sim_loop_var.get()

    def _sim_source_change(self):
        """When switching edited/original source, restart if running."""
        self._sim_use_edited = (self._sim_src_var.get() == "edited")
        if self._sim_running:
            self._sim_stop()
            self._sim_start(0)
        else:
            self._sim_draw_static()

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
        from fuse.vision.trajectory_replay import replay_full_scenario

        dx, dy, elapsed = replay_full_scenario(
            trajectory=traj,
            pre_trajectory=self._pre_traj if self._pre_traj else None,
            cursor_pos=None,
            abort_event=self._replay_abort,
            countdown_s=countdown_s,
            status_callback=lambda msg: self._set_replay_status(msg),
            fire_click=True,
        )

        self._set_replay_status(f"Done ({dx}dx {dy}dy)")
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
        if self._sim_after_id:
            self.after_cancel(self._sim_after_id)
            self._sim_after_id = None
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
