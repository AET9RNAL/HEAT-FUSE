"""
QuickLabelHudMixin — HUD overlays for Quick Correction mode.

Provides:
  - Prompt overlay: keyboard-driven state prompts
  - Factors graph: timing_factor + magnitude_factor over iterations
  - LR graph: correction step sizes + AttnRes effective LR
  - Trajectory simulation canvas: live animated playback
  - Checkpoint overlay: rollback-capable history list
"""

import copy
import math
import time
import tkinter as tk
from loguru import logger

try:
    from utils.window_utils import set_window_clickthrough
    WINDOW_UTILS_OK = True
except ImportError:
    WINDOW_UTILS_OK = False


def _traj_to_cumulative(traj):
    """Convert [{t, dx, dy}, ...] -> (times[], cum_x[], cum_y[])."""
    n = len(traj)
    times = [0.0] * n
    cum_x = [0.0] * n
    cum_y = [0.0] * n
    sx, sy = 0.0, 0.0
    for i, pt in enumerate(traj):
        sx += pt['dx']
        sy += pt['dy']
        times[i] = pt['t']
        cum_x[i] = sx
        cum_y[i] = sy
    return times, cum_x, cum_y


class QuickLabelHudMixin:
    """Mixin providing Quick-Label HUD overlays for AutoOverlay."""

    HUD_GREEN = "#77ffaa"
    HUD_CYAN = "#77ddff"
    HUD_BG = "#000001"
    QL_CANVAS_BG = "#1a1a2e"
    QL_GRID_COLOR = "#333333"
    QL_REF_COLOR = "#555555"

    # ---- Scale / color helpers (mirrors trajectory_editor) ----

    @staticmethod
    def _ql_nice_interval(span, max_ticks=6):
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

    @staticmethod
    def _ql_time_color(frac):
        """Map fraction [0,1] -> (R,G,B) via blue->cyan->green->yellow->red."""
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

    def _init_ql_hud(self):
        """Initialize Quick-Label HUD state. Call from __init__."""
        # Widgets that have drag bindings (filled during _ql_ensure_windows)
        self._ql_draggable_widgets = []

        # Overlay windows
        self._ql_prompt_win = None
        self._ql_prompt_label = None

        self._ql_graph_factors_win = None
        self._ql_graph_factors_canvas = None

        self._ql_graph_lr_win = None
        self._ql_graph_lr_canvas = None

        self._ql_sim_win = None
        self._ql_sim_canvas = None
        self._ql_sim_after_id = None
        self._ql_sim_start_time = 0.0
        self._ql_sim_data = None      # (times, cum_x, cum_y) — guidance
        self._ql_sim_pre_data = None  # (times, cum_x, cum_y) — pre-fire aiming

        self._ql_checkpoint_win = None
        self._ql_checkpoint_canvas = None
        self._ql_checkpoint_scrollbar = None
        self._ql_checkpoint_frame = None
        self._ql_checkpoint_labels = []

        self._ql_features_win = None
        self._ql_features_frame = None
        self._ql_features_labels = []

        # Default positions — use fallback dimensions; real values come from
        # config (loaded after super().__init__ sets self.root).
        root = getattr(self, 'root', None)
        if root is not None:
            try:
                sw = root.winfo_screenwidth()
                sh = root.winfo_screenheight()
            except Exception:
                sw, sh = 1920, 1080
        else:
            sw, sh = 1920, 1080
        self.ql_prompt_pos = [50, sh - 100]
        self.ql_graph_factors_pos = [50, sh - 320]
        self.ql_graph_lr_pos = [350, sh - 320]
        self.ql_sim_pos = [650, sh - 370]
        self.ql_checkpoint_pos = [960, sh - 320]
        self.ql_features_pos = [50, sh - 560]

    # ================================================================
    #  Window creation (lazy — first call creates, subsequent reuse)
    # ================================================================

    def _ql_ensure_windows(self):
        """Create all QL HUD windows if not yet created."""
        if self._ql_prompt_win is not None:
            return

        # ---- Prompt overlay (not draggable, stays at configured position) ----
        self._ql_prompt_win = tk.Toplevel(self.root)
        self._ql_prompt_win.title("QL Prompt")
        self._ql_prompt_win.overrideredirect(True)
        self._ql_prompt_win.attributes("-topmost", True)
        self._ql_prompt_win.attributes("-transparentcolor", self.HUD_BG)
        self._ql_prompt_win.configure(bg=self.HUD_BG)

        self._ql_prompt_label = tk.Label(
            self._ql_prompt_win, text="", fg=self.HUD_GREEN,
            bg="#111111", font=("Consolas", 11, "bold"),
            padx=8, pady=4, justify=tk.LEFT,
        )
        self._ql_prompt_label.pack()
        # Intentionally NOT _make_draggable — prompt stays at configured position
        self._ql_prompt_win.withdraw()

        # ---- Factors graph ----
        self._ql_graph_factors_win = tk.Toplevel(self.root)
        self._ql_graph_factors_win.title("QL Factors")
        self._ql_graph_factors_win.overrideredirect(True)
        self._ql_graph_factors_win.attributes("-topmost", True)
        self._ql_graph_factors_win.configure(bg=self.QL_CANVAS_BG)

        factors_title = tk.Label(
            self._ql_graph_factors_win, text="Correction Factors",
            fg=self.HUD_GREEN, bg=self.QL_CANVAS_BG,
            font=("Consolas", 9, "bold"),
        )
        factors_title.pack(anchor="w", padx=4)
        self._ql_graph_factors_canvas = tk.Canvas(
            self._ql_graph_factors_win, width=280, height=160,
            bg=self.QL_CANVAS_BG, highlightthickness=0,
        )
        self._ql_graph_factors_canvas.pack()
        self._make_draggable(self._ql_graph_factors_win)
        self._make_draggable(factors_title)
        self._ql_draggable_widgets += [self._ql_graph_factors_win, factors_title]
        self._ql_graph_factors_win.withdraw()

        # ---- LR graph ----
        self._ql_graph_lr_win = tk.Toplevel(self.root)
        self._ql_graph_lr_win.title("QL Learning Rates")
        self._ql_graph_lr_win.overrideredirect(True)
        self._ql_graph_lr_win.attributes("-topmost", True)
        self._ql_graph_lr_win.configure(bg=self.QL_CANVAS_BG)

        lr_title = tk.Label(
            self._ql_graph_lr_win, text="Learning Rates",
            fg=self.HUD_CYAN, bg=self.QL_CANVAS_BG,
            font=("Consolas", 9, "bold"),
        )
        lr_title.pack(anchor="w", padx=4)
        self._ql_graph_lr_canvas = tk.Canvas(
            self._ql_graph_lr_win, width=280, height=160,
            bg=self.QL_CANVAS_BG, highlightthickness=0,
        )
        self._ql_graph_lr_canvas.pack()
        self._make_draggable(self._ql_graph_lr_win)
        self._make_draggable(lr_title)
        self._ql_draggable_widgets += [self._ql_graph_lr_win, lr_title]
        self._ql_graph_lr_win.withdraw()

        # ---- Trajectory simulation ----
        self._ql_sim_win = tk.Toplevel(self.root)
        self._ql_sim_win.title("QL Trajectory Sim")
        self._ql_sim_win.overrideredirect(True)
        self._ql_sim_win.attributes("-topmost", True)
        self._ql_sim_win.configure(bg=self.QL_CANVAS_BG)

        sim_title = tk.Label(
            self._ql_sim_win, text="Trajectory Preview",
            fg=self.HUD_GREEN, bg=self.QL_CANVAS_BG,
            font=("Consolas", 9, "bold"),
        )
        sim_title.pack(anchor="w", padx=4)
        self._ql_sim_canvas = tk.Canvas(
            self._ql_sim_win, width=300, height=230,
            bg=self.QL_CANVAS_BG, highlightthickness=0,
        )
        self._ql_sim_canvas.pack()
        self._make_draggable(self._ql_sim_win)
        self._make_draggable(sim_title)
        self._ql_draggable_widgets += [self._ql_sim_win, sim_title]
        self._ql_sim_win.withdraw()

        # ---- Checkpoint overlay (scrollable Canvas) ----
        self._ql_checkpoint_win = tk.Toplevel(self.root)
        self._ql_checkpoint_win.title("QL Checkpoints")
        self._ql_checkpoint_win.overrideredirect(True)
        self._ql_checkpoint_win.attributes("-topmost", True)
        self._ql_checkpoint_win.configure(bg=self.QL_CANVAS_BG)

        cp_title = tk.Label(
            self._ql_checkpoint_win, text="Checkpoints [click to rollback]",
            fg=self.HUD_CYAN, bg=self.QL_CANVAS_BG,
            font=("Consolas", 9, "bold"),
        )
        cp_title.pack(anchor="w", padx=4)

        # Scrollable area: Canvas + vertical Scrollbar
        self._ql_checkpoint_canvas = tk.Canvas(
            self._ql_checkpoint_win, bg=self.QL_CANVAS_BG,
            highlightthickness=0, width=260,
        )
        self._ql_checkpoint_scrollbar = tk.Scrollbar(
            self._ql_checkpoint_win, orient="vertical",
            command=self._ql_checkpoint_canvas.yview,
        )
        self._ql_checkpoint_frame = tk.Frame(
            self._ql_checkpoint_canvas, bg=self.QL_CANVAS_BG,
        )
        self._ql_checkpoint_frame.bind(
            "<Configure>",
            lambda e: self._ql_checkpoint_canvas.configure(
                scrollregion=self._ql_checkpoint_canvas.bbox("all")))

        self._ql_checkpoint_canvas.create_window(
            (0, 0), window=self._ql_checkpoint_frame, anchor="nw")
        self._ql_checkpoint_canvas.configure(
            yscrollcommand=self._ql_checkpoint_scrollbar.set)

        self._ql_checkpoint_canvas.pack(side=tk.LEFT, fill=tk.BOTH,
                                         expand=True, padx=2, pady=2)
        self._ql_checkpoint_scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
        self._make_draggable(self._ql_checkpoint_win)
        self._make_draggable(cp_title)
        self._ql_draggable_widgets += [self._ql_checkpoint_win, cp_title]
        self._ql_checkpoint_win.withdraw()

        # ---- Features overlay (captured geometry + bias state) ----
        self._ql_features_win = tk.Toplevel(self.root)
        self._ql_features_win.title("QL Features")
        self._ql_features_win.overrideredirect(True)
        self._ql_features_win.attributes("-topmost", True)
        self._ql_features_win.configure(bg=self.QL_CANVAS_BG)

        feat_title = tk.Label(
            self._ql_features_win, text="Captured Features",
            fg=self.HUD_CYAN, bg=self.QL_CANVAS_BG,
            font=("Consolas", 9, "bold"),
        )
        feat_title.pack(anchor="w", padx=4)
        self._ql_features_frame = tk.Frame(
            self._ql_features_win, bg=self.QL_CANVAS_BG,
        )
        self._ql_features_frame.pack(fill=tk.BOTH, padx=4, pady=2)
        self._make_draggable(self._ql_features_win)
        self._make_draggable(feat_title)
        self._ql_draggable_widgets += [self._ql_features_win, feat_title]
        self._ql_features_win.withdraw()

    # ================================================================
    #  Drag toggle
    # ================================================================

    def _ql_set_draggable(self, enable):
        """Enable or disable drag bindings on all QL overlay widgets."""
        for widget in self._ql_draggable_widgets:
            try:
                if enable:
                    self._make_draggable(widget)
                else:
                    widget.unbind("<ButtonPress-1>")
                    widget.unbind("<B1-Motion>")
            except Exception:
                pass

    # ================================================================
    #  Show / hide / position
    # ================================================================

    def _ql_show_all(self):
        """Show all QL HUD windows and position them."""
        self._ql_ensure_windows()
        self._ql_position_windows()
        for win in self._ql_all_windows():
            if win:
                win.deiconify()
                win.attributes("-topmost", True)
                win.lift()

        if getattr(self, 'hud_locked', False):
            self.root.update_idletasks()
            for win in self._ql_all_windows():
                if win:
                    # Prompt, checkpoint, and features windows must stay clickable
                    if win in (self._ql_prompt_win, self._ql_checkpoint_win,
                               self._ql_features_win):
                        self._ql_set_clickthrough(win, False)
                    else:
                        self._ql_set_clickthrough(win, True)

    def _ql_hide_all(self):
        """Hide all QL HUD windows."""
        self._ql_stop_sim()
        for win in self._ql_all_windows():
            if win:
                win.withdraw()

    def _ql_show_idle(self):
        """Show QL overlays with idle prompt (between engagements)."""
        self._ql_ensure_windows()
        self._ql_position_windows()
        for win in self._ql_all_windows():
            if win:
                win.deiconify()
                win.attributes("-topmost", True)
                win.lift()

        if getattr(self, 'hud_locked', False):
            self.root.update_idletasks()
            for win in self._ql_all_windows():
                if win:
                    # Prompt, checkpoint, and features windows must stay clickable
                    if win in (self._ql_prompt_win, self._ql_checkpoint_win,
                               self._ql_features_win):
                        self._ql_set_clickthrough(win, False)
                    else:
                        self._ql_set_clickthrough(win, True)

        self._ql_update_prompt(
            "[Quick-Label Ready]\n"
            "Track target → ML executes → [H]/[M]/[5]/[E]/[Esc]"
        )
        self._ql_show_placeholder_graphs()

    def _ql_all_windows(self):
        return [
            self._ql_prompt_win, self._ql_graph_factors_win,
            self._ql_graph_lr_win, self._ql_sim_win,
            self._ql_checkpoint_win, self._ql_features_win,
        ]

    def _ql_position_windows(self):
        positions = [
            (self._ql_prompt_win, self.ql_prompt_pos),
            (self._ql_graph_factors_win, self.ql_graph_factors_pos),
            (self._ql_graph_lr_win, self.ql_graph_lr_pos),
            (self._ql_sim_win, self.ql_sim_pos),
            (self._ql_checkpoint_win, self.ql_checkpoint_pos),
            (self._ql_features_win, self.ql_features_pos),
        ]
        sw = self.root.winfo_screenwidth()
        sh = self.root.winfo_screenheight()
        for win, pos in positions:
            if win and pos:
                x = max(0, min(int(pos[0]), sw - 50))
                y = max(0, min(int(pos[1]), sh - 50))
                win.geometry(f"+{x}+{y}")

    def _ql_set_clickthrough(self, win, enable):
        if not WINDOW_UTILS_OK:
            return
        try:
            import ctypes
            hwnd = ctypes.windll.user32.FindWindowW(None, win.title())
            if hwnd:
                set_window_clickthrough(hwnd, enable)
        except Exception:
            pass

    def _ql_capture_positions(self):
        """Capture current positions for config persistence."""
        mapping = [
            ('_ql_prompt_win', 'ql_prompt_pos'),
            ('_ql_graph_factors_win', 'ql_graph_factors_pos'),
            ('_ql_graph_lr_win', 'ql_graph_lr_pos'),
            ('_ql_sim_win', 'ql_sim_pos'),
            ('_ql_checkpoint_win', 'ql_checkpoint_pos'),
            ('_ql_features_win', 'ql_features_pos'),
        ]
        for attr, pos_attr in mapping:
            win = getattr(self, attr, None)
            if win and win.winfo_viewable():
                setattr(self, pos_attr,
                        [win.winfo_x(), win.winfo_y()])

    def _ql_save_config(self, config_dict):
        """Save QL HUD positions to config dict."""
        config_dict.update({
            'ql_prompt_pos': self.ql_prompt_pos,
            'ql_graph_factors_pos': self.ql_graph_factors_pos,
            'ql_graph_lr_pos': self.ql_graph_lr_pos,
            'ql_sim_pos': self.ql_sim_pos,
            'ql_checkpoint_pos': self.ql_checkpoint_pos,
            'ql_features_pos': self.ql_features_pos,
        })

    def _ql_load_config(self, config):
        """Load QL HUD positions from config."""
        for key in ['ql_prompt_pos', 'ql_graph_factors_pos',
                     'ql_graph_lr_pos', 'ql_sim_pos', 'ql_checkpoint_pos',
                     'ql_features_pos']:
            val = config.get(key)
            if val:
                setattr(self, key, list(val))

    # ================================================================
    #  Prompt display
    # ================================================================

    def _ql_update_prompt(self, text):
        """Update the prompt overlay text."""
        if not self._ql_prompt_label:
            return
        self._ql_prompt_label.config(text=text)
        self.root.update_idletasks()
        w = self._ql_prompt_label.winfo_reqwidth() + 4
        h = self._ql_prompt_label.winfo_reqheight() + 4
        x, y = self.ql_prompt_pos
        self._ql_prompt_win.geometry(f"{w}x{h}+{int(x)}+{int(y)}")

    # ================================================================
    #  Graph rendering
    # ================================================================

    def _ql_draw_line_graph(self, canvas, series_list, colors, labels,
                            y_ref=None):
        """
        Draw line graph(s) on a tkinter Canvas.

        series_list: list of lists of float values
        colors: list of color strings, one per series
        labels: list of label strings, one per series
        y_ref: optional horizontal reference line value
        """
        canvas.delete("all")
        cw = canvas.winfo_width() or 280
        ch = canvas.winfo_height() or 160
        pad = 30

        # Collect all values for y-range
        all_vals = []
        for s in series_list:
            all_vals.extend(s)
        if y_ref is not None:
            all_vals.append(y_ref)
        if not all_vals:
            canvas.create_text(cw // 2, ch // 2, text="No data",
                               fill="#666666", font=("Consolas", 9))
            return

        y_min = min(all_vals)
        y_max = max(all_vals)
        y_range = y_max - y_min
        if y_range < 0.01:
            y_min -= 0.1
            y_max += 0.1
            y_range = y_max - y_min

        # 10% padding
        y_min -= y_range * 0.1
        y_max += y_range * 0.1
        y_range = y_max - y_min

        max_n = max(len(s) for s in series_list) if series_list else 1
        if max_n < 2:
            max_n = 2

        def to_canvas(xi, yi):
            cx = pad + (cw - 2 * pad) * xi / (max_n - 1)
            cy = pad + (ch - 2 * pad) * (1.0 - (yi - y_min) / y_range)
            return cx, cy

        # Grid lines
        for i in range(5):
            yv = y_min + y_range * i / 4
            _, gy = to_canvas(0, yv)
            canvas.create_line(pad, gy, cw - pad, gy,
                               fill=self.QL_GRID_COLOR, width=1)
            canvas.create_text(pad - 4, gy, text=f"{yv:.2f}",
                               fill="#666666", font=("Consolas", 7),
                               anchor="e")

        # X axis labels
        for i in range(min(max_n, 10)):
            xi = i * (max_n - 1) // min(max_n - 1, 9) if max_n > 1 else 0
            gx, _ = to_canvas(xi, y_min)
            canvas.create_text(gx, ch - pad + 12, text=str(xi),
                               fill="#666666", font=("Consolas", 7))

        # Reference line
        if y_ref is not None and y_min <= y_ref <= y_max:
            _, ry = to_canvas(0, y_ref)
            canvas.create_line(pad, ry, cw - pad, ry,
                               fill=self.QL_REF_COLOR, width=1, dash=(4, 4))

        # Data series
        for si, (series, color, label) in enumerate(
                zip(series_list, colors, labels)):
            if len(series) < 1:
                continue
            # Draw line
            pts = []
            for i, val in enumerate(series):
                cx, cy = to_canvas(i, val)
                pts.extend([cx, cy])
            if len(pts) >= 4:
                canvas.create_line(*pts, fill=color, width=2, smooth=False)
            # Draw dots
            for i, val in enumerate(series):
                cx, cy = to_canvas(i, val)
                r = 3
                canvas.create_oval(cx - r, cy - r, cx + r, cy + r,
                                   fill=color, outline="")

        # Legend
        for si, (color, label) in enumerate(zip(colors, labels)):
            lx = cw - pad - 5
            ly = pad + 5 + si * 14
            canvas.create_rectangle(lx - 8, ly - 4, lx, ly + 4,
                                    fill=color, outline="")
            canvas.create_text(lx - 12, ly, text=label,
                               fill=color, font=("Consolas", 7),
                               anchor="e")

    def _ql_redraw_factors_graph(self, session):
        """Redraw the factors graph from session history."""
        if not self._ql_graph_factors_canvas:
            return
        history = session.get_history() if session else []
        timing = [cp['timing_factor'] for cp in history]
        magnitude = [cp['magnitude_factor'] for cp in history]
        shift = [cp.get('time_shift', 0.0) for cp in history]

        # Add current values at the end
        entry = session.get_active_entry() if session else None
        if entry:
            timing.append(entry['timing_factor'])
            magnitude.append(entry['magnitude_factor'])
            shift.append(entry.get('time_shift', 0.0))

        self._ql_draw_line_graph(
            self._ql_graph_factors_canvas,
            [timing, magnitude, shift],
            [self.HUD_GREEN, self.HUD_CYAN, "#ff99aa"],
            ["Timing", "Magnitude", "Shift(s)"],
            y_ref=1.0,
        )

    def _ql_redraw_lr_graph(self, session, attentioner=None):
        """Redraw the learning rates graph."""
        if not self._ql_graph_lr_canvas:
            return
        history = session.get_history() if session else []

        # Correction step sizes
        t_steps = [cp.get('timing_step', 0.15) for cp in history]
        m_steps = [cp.get('magnitude_step', 0.15) for cp in history]

        entry = session.get_active_entry() if session else None
        if entry:
            t_steps.append(entry.get('timing_step', 0.15))
            m_steps.append(entry.get('magnitude_step', 0.15))

        series = [t_steps, m_steps]
        colors = [self.HUD_GREEN, self.HUD_CYAN]
        labels = ["T Step", "M Step"]

        # AttnRes effective LR
        if attentioner and attentioner.update_count > 0:
            base_lr = attentioner.lr
            attn_lr_series = []
            for cp in history:
                it = cp.get('iteration', 0)
                attn_lr_series.append(base_lr / (1.0 + 0.01 * it))
            if entry:
                attn_lr_series.append(
                    base_lr / (1.0 + 0.01 * attentioner.update_count))
            series.append(attn_lr_series)
            colors.append("#ff77aa")
            labels.append("AttnRes LR")

        self._ql_draw_line_graph(
            self._ql_graph_lr_canvas, series, colors, labels,
        )

    # ================================================================
    #  Trajectory simulation
    # ================================================================

    def _ql_update_sim(self, trajectory, session, pre_trajectory=None):
        """Update sim canvas with the biased trajectory and restart animation."""
        if not self._ql_sim_canvas:
            return
        entry = session.get_active_entry() if session else None
        traj = copy.deepcopy(trajectory)
        if entry:
            from overlay.ml.heat_ailos_torc.trainer.correction_session import CorrectionSession
            CorrectionSession.apply_bias_to_trajectory(
                traj, entry['timing_factor'], entry['magnitude_factor'],
                entry.get('time_shift', 0.0))

        times, cum_x, cum_y = _traj_to_cumulative(traj)
        self._ql_sim_data = (times, cum_x, cum_y)

        # Pre-fire trajectory (shown greyed out, ending at origin)
        if pre_trajectory:
            pt, px, py = _traj_to_cumulative(pre_trajectory)
            # Offset so pre-fire endpoint lands at (0, 0) = guidance start
            if px and py:
                end_x, end_y = px[-1], py[-1]
                px = [x - end_x for x in px]
                py = [y - end_y for y in py]
            self._ql_sim_pre_data = (pt, px, py)
        else:
            self._ql_sim_pre_data = None

        self._ql_stop_sim()
        self._ql_sim_draw_static()
        self._ql_sim_start_time = time.perf_counter()
        self._ql_sim_tick()

    def _ql_sim_layout(self):
        c = self._ql_sim_canvas
        cw = c.winfo_width() or 300
        ch = c.winfo_height() or 230
        pad = 15
        if not self._ql_sim_data:
            return cw, ch, pad, 0, 1, 0, 1, 1.0

        _, cum_x, cum_y = self._ql_sim_data
        x_min = min(0, min(cum_x))
        x_max = max(0, max(cum_x))
        y_min = min(0, min(cum_y))
        y_max = max(0, max(cum_y))

        # Include pre-fire bounds if present
        if self._ql_sim_pre_data:
            _, pre_x, pre_y = self._ql_sim_pre_data
            if pre_x and pre_y:
                x_min = min(x_min, min(pre_x))
                x_max = max(x_max, max(pre_x))
                y_min = min(y_min, min(pre_y))
                y_max = max(y_max, max(pre_y))

        dx = (x_max - x_min) or 1
        dy = (y_max - y_min) or 1
        scale = min((cw - 2 * pad) / dx, (ch - 2 * pad) / dy)
        return cw, ch, pad, x_min, x_max, y_min, y_max, scale

    def _ql_sim_w2c(self, wx, wy):
        cw, ch, pad, x_min, x_max, y_min, y_max, scale = self._ql_sim_layout()
        mid_x = (x_min + x_max) / 2
        mid_y = (y_min + y_max) / 2
        cx = cw / 2 + (wx - mid_x) * scale
        cy = ch / 2 + (wy - mid_y) * scale
        return cx, cy

    def _ql_sim_c2w(self, cx, cy):
        """Canvas pixel coords -> world coords (inverse of _ql_sim_w2c)."""
        cw, ch, pad, x_min, x_max, y_min, y_max, scale = self._ql_sim_layout()
        if scale == 0:
            return 0, 0
        mid_x = (x_min + x_max) / 2
        mid_y = (y_min + y_max) / 2
        wx = (cx - cw / 2) / scale + mid_x
        wy = (cy - ch / 2) / scale + mid_y
        return wx, wy

    def _ql_sim_draw_scales(self, c):
        """Draw X/Y axis ticks with labels and a time color bar."""
        cw, ch, pad, x_min, x_max, y_min, y_max, scale = self._ql_sim_layout()
        font = ("Consolas", 6)
        tc = "#666666"
        tl = 4

        # Visible world range
        w_left, w_top = self._ql_sim_c2w(0, 0)
        w_right, w_bot = self._ql_sim_c2w(cw, ch)

        # --- X axis (bottom edge) ---
        x_span = w_right - w_left
        x_step = self._ql_nice_interval(x_span, max_ticks=6)
        x = math.ceil(w_left / x_step) * x_step
        iters = 0
        while x <= w_right and iters < 100:
            cx_tick, _ = self._ql_sim_w2c(x, 0)
            if 20 < cx_tick < cw - 5:
                c.create_line(cx_tick, ch - tl, cx_tick, ch,
                              fill=tc, width=1)
                lbl = f"{x:.0f}" if x_step >= 1 else f"{x:.1f}"
                c.create_text(cx_tick, ch - tl - 1, text=lbl,
                              fill=tc, font=font, anchor=tk.S)
            x += x_step
            iters += 1
        c.create_text(cw - 3, ch - 12, text="X px", fill=tc,
                      font=font, anchor=tk.E)

        # --- Y axis (left edge) ---
        y_span = w_bot - w_top
        y_step = self._ql_nice_interval(y_span, max_ticks=5)
        y = math.ceil(w_top / y_step) * y_step
        iters = 0
        while y <= w_bot and iters < 100:
            _, cy_tick = self._ql_sim_w2c(0, y)
            if 8 < cy_tick < ch - 14:
                c.create_line(0, cy_tick, tl, cy_tick,
                              fill=tc, width=1)
                lbl = f"{y:.0f}" if y_step >= 1 else f"{y:.1f}"
                c.create_text(tl + 1, cy_tick, text=lbl,
                              fill=tc, font=font, anchor=tk.W)
            y += y_step
            iters += 1
        c.create_text(3, 3, text="Y px", fill=tc,
                      font=font, anchor=tk.NW)

        # --- Time color bar (top-right) ---
        if self._ql_sim_data:
            times = self._ql_sim_data[0]
            if len(times) > 1:
                t_min = times[0]
                t_max = times[-1]
                bar_w = min(80, cw // 5)
                bar_h = 6
                bx = cw - bar_w - 8
                by = 6

                for i in range(bar_w):
                    frac = i / max(bar_w - 1, 1)
                    r, g, b = self._ql_time_color(frac)
                    col = f"#{r:02x}{g:02x}{b:02x}"
                    c.create_line(bx + i, by, bx + i, by + bar_h,
                                  fill=col, width=1)

                c.create_rectangle(bx, by, bx + bar_w, by + bar_h,
                                   outline="#888888", width=1)
                c.create_text(bx, by + bar_h + 1, text=f"{t_min:.2f}s",
                              fill=tc, font=font, anchor=tk.NW)
                c.create_text(bx + bar_w, by + bar_h + 1, text=f"{t_max:.2f}s",
                              fill=tc, font=font, anchor=tk.NE)
                c.create_text(bx + bar_w // 2, by - 1, text="t (dur)",
                              fill=tc, font=font, anchor=tk.S)

    def _ql_sim_draw_static(self):
        c = self._ql_sim_canvas
        c.delete("all")
        if not self._ql_sim_data:
            return
        times, cum_x, cum_y = self._ql_sim_data
        n = len(cum_x)
        if n < 2:
            return

        # Origin crosshair
        ox, oy = self._ql_sim_w2c(0, 0)
        c.create_line(ox - 8, oy, ox + 8, oy, fill="#444444", width=1)
        c.create_line(ox, oy - 8, ox, oy + 8, fill="#444444", width=1)

        # Pre-fire aiming path (greyed out)
        if self._ql_sim_pre_data:
            _, pre_x, pre_y = self._ql_sim_pre_data
            if len(pre_x) >= 2:
                pre_pts = []
                for i in range(len(pre_x)):
                    px, py = self._ql_sim_w2c(pre_x[i], pre_y[i])
                    pre_pts.extend([px, py])
                if len(pre_pts) >= 4:
                    c.create_line(*pre_pts, fill="#444455", width=1,
                                  smooth=False, dash=(3, 3),
                                  tags="sim_prefire")

        # Full guidance path — time-colored segments (dim)
        t_min = times[0]
        t_span = times[-1] - t_min if times[-1] > t_min else 1.0
        for i in range(n - 1):
            frac = (times[i] - t_min) / t_span
            r, g, b = self._ql_time_color(frac)
            # Dim the color for the static path
            r = int(r * 0.4)
            g = int(g * 0.4)
            b = int(b * 0.4)
            color = f"#{r:02x}{g:02x}{b:02x}"
            x1, y1 = self._ql_sim_w2c(cum_x[i], cum_y[i])
            x2, y2 = self._ql_sim_w2c(cum_x[i + 1], cum_y[i + 1])
            c.create_line(x1, y1, x2, y2, fill=color, width=1,
                          smooth=False, tags="sim_static")

        # Axis scales + time bar
        self._ql_sim_draw_scales(c)

    def _ql_sim_tick(self):
        if not self._ql_sim_data or not self._ql_sim_canvas:
            return
        times, cum_x, cum_y = self._ql_sim_data
        n = len(times)
        if n < 2:
            return

        c = self._ql_sim_canvas
        duration = times[-1] if times[-1] > 0 else 1.0
        elapsed = (time.perf_counter() - self._ql_sim_start_time) % (duration + 0.5)

        # Find index
        idx = 0
        for i in range(n):
            if times[i] <= elapsed:
                idx = i
            else:
                break

        # Draw animated trail — time-colored segments
        c.delete("sim_trail")
        c.delete("sim_cursor")

        t_min = times[0]
        t_span = times[-1] - t_min if times[-1] > t_min else 1.0

        if idx > 0:
            for i in range(idx):
                frac = (times[i] - t_min) / t_span
                r, g, b = self._ql_time_color(frac)
                color = f"#{r:02x}{g:02x}{b:02x}"
                x1, y1 = self._ql_sim_w2c(cum_x[i], cum_y[i])
                x2, y2 = self._ql_sim_w2c(cum_x[i + 1], cum_y[i + 1])
                c.create_line(x1, y1, x2, y2, fill=color, width=2,
                              smooth=False, tags="sim_trail")

        # Cursor dot — colored by current time fraction
        frac = (times[idx] - t_min) / t_span
        cr, cg, cb = self._ql_time_color(frac)
        dot_color = f"#{cr:02x}{cg:02x}{cb:02x}"
        cx, cy = self._ql_sim_w2c(cum_x[idx], cum_y[idx])
        r = 4
        c.create_oval(cx - r, cy - r, cx + r, cy + r,
                      fill="#ffffff", outline=dot_color,
                      width=1, tags="sim_cursor")

        self._ql_sim_after_id = self.root.after(16, self._ql_sim_tick)

    def _ql_stop_sim(self):
        if self._ql_sim_after_id:
            self.root.after_cancel(self._ql_sim_after_id)
            self._ql_sim_after_id = None

    # ================================================================
    #  Checkpoint display
    # ================================================================

    def _ql_redraw_checkpoints(self, session):
        """Redraw the checkpoint list overlay.

        Checkpoints are always scoped to the active bias entry (per feature
        set). Switching to a new geometry creates a fresh entry with empty
        checkpoints, so no data from previous corrections leaks through.
        """
        if not self._ql_checkpoint_frame:
            return

        # Clear existing labels
        for lbl in self._ql_checkpoint_labels:
            lbl.destroy()
        self._ql_checkpoint_labels = []

        history = session.get_history() if session else []
        entry = session.get_active_entry() if session else None

        # Feature geometry header — shows which feature set these checkpoints
        # belong to so the user always knows the scope.
        if entry:
            fv = entry.get('feature_vec', [0, 0, 0, 0])
            disp = fv[0] * 300
            rng = fv[1] * 500
            angle_deg = math.degrees(math.atan2(fv[2], fv[3]))
            header_text = (f"Features: disp={disp:.0f}px  "
                           f"rng={rng:.0f}m  ang={angle_deg:.0f}\u00b0")
            hdr = tk.Label(
                self._ql_checkpoint_frame, text=header_text,
                fg="#aaaadd", bg="#1a1a33",
                font=("Consolas", 7, "italic"), anchor="w",
            )
            hdr.pack(fill=tk.X, padx=2, pady=(0, 2))
            self._ql_checkpoint_labels.append(hdr)

        for i, cp in enumerate(history):
            tf = cp['timing_factor']
            mf = cp['magnitude_factor']
            ts = cp.get('time_shift', 0.0)
            label_text = cp.get('label', '')
            text = f"#{i}  T={tf:.3f}  M={mf:.3f}  S={ts:+.3f}"
            if label_text:
                text += f"  \u2190 {label_text}"

            lbl = tk.Label(
                self._ql_checkpoint_frame, text=text,
                fg="#888888", bg=self.QL_CANVAS_BG,
                font=("Consolas", 8), anchor="w",
            )
            lbl.pack(fill=tk.X, padx=2)

            # Bind click for rollback (in setup mode)
            idx = i
            lbl.bind("<Button-1>",
                     lambda e, ci=idx: self._ql_on_checkpoint_click(ci))

            self._ql_checkpoint_labels.append(lbl)

        # Show current active state at the bottom
        if entry:
            tf = entry['timing_factor']
            mf = entry['magnitude_factor']
            ts = entry.get('time_shift', 0.0)
            phase = entry.get('phase', 'seeking_hit').replace('_', ' ').title()
            text = f">> T={tf:.3f}  M={mf:.3f}  S={ts:+.3f}  [{phase}]"
            lbl = tk.Label(
                self._ql_checkpoint_frame, text=text,
                fg=self.HUD_GREEN, bg="#222244",
                font=("Consolas", 8, "bold"), anchor="w",
            )
            lbl.pack(fill=tk.X, padx=2, pady=(2, 0))
            self._ql_checkpoint_labels.append(lbl)

        # Resize window — canvas has fixed max height, content scrolls
        self.root.update_idletasks()
        content_h = self._ql_checkpoint_frame.winfo_reqheight()
        max_h = 300
        canvas_h = min(content_h, max_h)
        w = max(280, self._ql_checkpoint_frame.winfo_reqwidth() + 24)
        x, y = self.ql_checkpoint_pos
        self._ql_checkpoint_canvas.configure(height=canvas_h)
        self._ql_checkpoint_win.geometry(
            f"{w}x{canvas_h + 30}+{int(x)}+{int(y)}")

    def _ql_redraw_features(self, session, context=None):
        """Redraw the captured features overlay (geometry + bias state)."""
        if not self._ql_features_frame:
            return

        # Clear existing labels
        for lbl in self._ql_features_labels:
            lbl.destroy()
        self._ql_features_labels = []

        entry = session.get_active_entry() if session else None

        # Geometry context from the engagement
        if context:
            disp = context.get('displacement_px', 0)
            angle = context.get('angle_rad', 0)
            range_m = context.get('range_m', 0)
            rows = [
                ("Disp", f"{disp:.1f} px"),
                ("Angle", f"{math.degrees(angle):.1f}°"),
                ("Range", f"{range_m:.0f} m"),
            ]
            for label, value in rows:
                lbl = tk.Label(
                    self._ql_features_frame, text=f"{label:>8}: {value}",
                    fg="#cccccc", bg=self.QL_CANVAS_BG,
                    font=("Consolas", 8), anchor="w",
                )
                lbl.pack(fill=tk.X, padx=2)
                self._ql_features_labels.append(lbl)

            # Separator
            sep = tk.Frame(self._ql_features_frame, bg="#333333", height=1)
            sep.pack(fill=tk.X, padx=2, pady=4)
            self._ql_features_labels.append(sep)

        # Bias state
        if entry:
            tf = entry['timing_factor']
            mf = entry['magnitude_factor']
            phase = entry.get('phase', 'seeking_hit').replace('_', ' ').title()
            iters = entry.get('iteration_count', 0)
            torc_q = entry.get('last_torc_quality')

            ts = entry.get('time_shift', 0.0)
            bias_rows = [
                ("Timing", f"{tf:.3f}"),
                ("Magnitude", f"{mf:.3f}"),
                ("Shift", f"{ts:+.3f}s"),
                ("Phase", phase),
                ("Iter", str(iters)),
            ]
            if torc_q is not None:
                bias_rows.append(("TORC Q", f"{torc_q:.3f}"))

            for label, value in bias_rows:
                color = self.HUD_GREEN if label == "TORC Q" and torc_q and torc_q > 0.7 else "#aaaaaa"
                lbl = tk.Label(
                    self._ql_features_frame, text=f"{label:>8}: {value}",
                    fg=color, bg=self.QL_CANVAS_BG,
                    font=("Consolas", 8, "bold" if label == "Phase" else "normal"),
                    anchor="w",
                )
                lbl.pack(fill=tk.X, padx=2)
                self._ql_features_labels.append(lbl)
        else:
            lbl = tk.Label(
                self._ql_features_frame, text="  (no bias active)",
                fg="#555555", bg=self.QL_CANVAS_BG,
                font=("Consolas", 8), anchor="w",
            )
            lbl.pack(fill=tk.X, padx=2)
            self._ql_features_labels.append(lbl)

        # Resize window — keep current position, only update size
        self.root.update_idletasks()
        w = max(200, self._ql_features_frame.winfo_reqwidth() + 8)
        h = min(250, self._ql_features_frame.winfo_reqheight() + 30)
        # Preserve current window position if it exists
        if self._ql_features_win.winfo_viewable():
            x, y = self._ql_features_win.winfo_x(), self._ql_features_win.winfo_y()
            # Update stored position so capture gets the current location
            self.ql_features_pos = [x, y]
        else:
            x, y = self.ql_features_pos
        self._ql_features_win.geometry(f"{w}x{h}+{int(x)}+{int(y)}")

    def _ql_on_checkpoint_click(self, checkpoint_index):
        """Handle click on a checkpoint label (rollback)."""
        # Implemented in AutoOverlay — this is the hook
        if hasattr(self, '_ql_do_rollback'):
            self._ql_do_rollback(checkpoint_index)

    # ================================================================
    #  Full update (call after any correction)
    # ================================================================

    def _ql_update_all_overlays(self, session, trajectory=None,
                                 attentioner=None, pre_trajectory=None,
                                 context=None):
        """Redraw all graphs, sim, checkpoints, and features."""
        self._ql_redraw_factors_graph(session)
        self._ql_redraw_lr_graph(session, attentioner)
        self._ql_redraw_checkpoints(session)
        self._ql_redraw_features(session, context)
        if trajectory:
            self._ql_update_sim(trajectory, session, pre_trajectory)

    # ================================================================
    #  Cleanup
    # ================================================================

    def _ql_cleanup_hud(self):
        """Destroy all QL HUD windows."""
        self._ql_stop_sim()
        for win in self._ql_all_windows():
            if win:
                try:
                    win.destroy()
                except Exception:
                    pass
        self._ql_prompt_win = None
        self._ql_graph_factors_win = None
        self._ql_graph_lr_win = None
        self._ql_sim_win = None
        self._ql_checkpoint_win = None
