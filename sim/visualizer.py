"""
H.E.A.T. AILOS-TORC Simulation Observatory.

Interactive matplotlib dashboard for observing and interacting with the
MK8 ATGM physics simulation.  All controls update the display in real time.

Usage
-----
    from sim.visualizer import SimObservatory
    obs = SimObservatory()
    obs.show()

Or from run_sim_viz.py.
"""

import math
import threading

import numpy as np
import matplotlib
matplotlib.use('TkAgg')
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import matplotlib.animation as animation
from matplotlib.widgets import Slider, Button
from matplotlib.collections import LineCollection
import matplotlib.colors as mcolors

# ---------------------------------------------------------------------------
#  Deferred import
# ---------------------------------------------------------------------------
try:
    from sim.missile_sim import MK8Sim, SimResult, SimState, generate_trajectory
except ImportError:
    import sys, os
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    from sim.missile_sim import MK8Sim, SimResult, SimState, generate_trajectory


# ---------------------------------------------------------------------------
#  Theme
# ---------------------------------------------------------------------------

THEME = dict(
    BG         = '#0a0a0f',
    PANEL      = '#10101a',
    GRID       = '#1a1a2a',
    TEXT       = '#b0b8c8',
    ACCENT     = '#00ff99',
    MISSILE    = '#22aaff',
    CROSSHAIR  = '#ff8833',
    TARGET     = '#ff3355',
    QUIET_FILL = '#1a1a2e',
    HIT_COLOR  = '#00ff99',
    MISS_COLOR = '#ff4444',
    SPEED      = '#ffaa44',
    AUTHORITY  = '#aa55ff',
    AXIS_TEXT  = '#555570',
    SLIDER_BG  = '#16162a',
    SLIDER_ACT = '#00cc77',
    BTN_BG     = '#1c1c36',
    BTN_HOVER  = '#2a2a50',
)

TORC_CMAP = mcolors.LinearSegmentedColormap.from_list(
    'torc', [(0.9, 0.2, 0.1), (1.0, 0.6, 0.0), (0.0, 1.0, 0.5)])


# ---------------------------------------------------------------------------
#  Observatory
# ---------------------------------------------------------------------------

class SimObservatory:
    """
    Interactive simulation observatory window.

    Parameters
    ----------
    data_file : Path to the JSONL dataset (defaults to the active ML profile).
    sim       : Pre-configured MK8Sim instance.  If None, defaults are used.
    """

    def __init__(self, data_file=None, sim=None):
        if data_file is None:
            from overlay.heat.plugins.heat_ailos_torc.profiles import (
                default_profile_name, load_profile)
            data_file = load_profile(default_profile_name()).dataset
        self.data_file  = data_file
        self.sim        = sim or MK8Sim()
        self._result    = None
        self._anim_obj  = None
        self._anim_running = False

        # Twin axis tracking (must remove before redraw)
        self._physics_ax2 = None

        # Current parameter values (updated by sliders)
        self._disp_px   = 120.0
        self._angle_deg = 45.0
        self._range_m   = 200.0
        self._quiet_t   = 0.30
        self._sweep_mag = 1.20
        self._sweep_peak = 0.35
        self._sweep_sigma = 0.18
        self._pix_per_m = 7.0
        self._traj_source = 'param'
        self._knn_trajectory = None

        self._build_figure()
        self._run_sim()
        self._draw_all()

    # ------------------------------------------------------------------
    #  Figure construction — using fig.add_axes() for explicit positioning
    # ------------------------------------------------------------------

    def _build_figure(self):
        plt.style.use('dark_background')
        self.fig = plt.figure(
            figsize=(16, 9.5),
            facecolor=THEME['BG'],
            num='H.E.A.T. AILOS-TORC Observatory',
        )
        try:
            self.fig.canvas.manager.set_window_title(
                'H.E.A.T. AILOS-TORC Sim Observatory')
        except Exception:
            pass

        # ---- Manual axes layout (figure-fraction coords) ----------------
        # All positions: [left, bottom, width, height]

        # Left column: engagement view (large) + thin colorbar beside it
        self._engage_rect = [0.06, 0.32, 0.38, 0.60]
        self.ax_engage = self.fig.add_axes(self._engage_rect)
        # Permanent colorbar axes — thin strip right of engagement view
        self.ax_cbar   = self.fig.add_axes([0.45, 0.38, 0.012, 0.48])

        # Right column: TORC angle, Physics, Results
        self.ax_torc    = self.fig.add_axes([0.54, 0.64, 0.42, 0.28])
        self.ax_physics = self.fig.add_axes([0.54, 0.34, 0.42, 0.24])
        self.ax_results = self.fig.add_axes([0.54, 0.20, 0.42, 0.10])
        self.ax_results.axis('off')

        # ---- Sliders (bottom area) ------------------------------------
        sl_h   = 0.020           # slider height
        sl_gap = 0.035           # vertical gap between rows
        sl_y1  = 0.17            # top slider row
        sl_y2  = sl_y1 - sl_gap  # bottom slider row

        # Three columns
        col_starts = [0.12, 0.42, 0.72]
        sl_w       = 0.22

        def _sax(col, row):
            y = sl_y1 if row == 0 else sl_y2
            return self.fig.add_axes(
                [col_starts[col], y, sl_w, sl_h],
                facecolor=THEME['SLIDER_BG'])

        c = THEME['SLIDER_ACT']
        self.sl_disp  = Slider(_sax(0, 0), 'Disp (px)',   10,  400,  valinit=self._disp_px,   color=c, valstep=1)
        self.sl_angle = Slider(_sax(1, 0), 'Angle (°)',  -180, 180,  valinit=self._angle_deg, color=c, valstep=1)
        self.sl_range = Slider(_sax(2, 0), 'Range (m)',   50,  500,  valinit=self._range_m,   color=c, valstep=5)
        self.sl_quiet = Slider(_sax(0, 1), 'Quiet (s)',   0,   1.5,  valinit=self._quiet_t,   color=c)
        self.sl_sweep = Slider(_sax(1, 1), 'Sweep ×',    0.2,  3.0,  valinit=self._sweep_mag, color=c)
        self.sl_ppm   = Slider(_sax(2, 1), 'px/m',       1.0, 25.0,  valinit=self._pix_per_m, color=c)

        for sl in (self.sl_disp, self.sl_angle, self.sl_range,
                   self.sl_quiet, self.sl_sweep, self.sl_ppm):
            sl.label.set_color(THEME['TEXT'])
            sl.label.set_fontsize(8)
            sl.valtext.set_color(THEME['ACCENT'])
            sl.valtext.set_fontsize(8)
            sl.on_changed(self._on_slider)

        # ---- Buttons ---------------------------------------------------
        btn_y = 0.04
        btn_h = 0.04
        btn_w = 0.12
        btn_gap = 0.015
        btn_x0 = 0.12

        def _bax(i):
            return self.fig.add_axes(
                [btn_x0 + i * (btn_w + btn_gap), btn_y, btn_w, btn_h],
                facecolor=THEME['BTN_BG'])

        self.btn_sim    = Button(_bax(0), 'Simulate',   color=THEME['BTN_BG'], hovercolor=THEME['BTN_HOVER'])
        self.btn_anim   = Button(_bax(1), 'Animate',    color=THEME['BTN_BG'], hovercolor=THEME['BTN_HOVER'])
        self.btn_knn    = Button(_bax(2), 'Load KNN',   color=THEME['BTN_BG'], hovercolor=THEME['BTN_HOVER'])
        self.btn_export = Button(_bax(3), 'Export Hit',  color=THEME['BTN_BG'], hovercolor=THEME['BTN_HOVER'])

        for btn in (self.btn_sim, self.btn_anim, self.btn_knn, self.btn_export):
            btn.label.set_color(THEME['TEXT'])
            btn.label.set_fontsize(9)

        self.btn_sim.on_clicked(lambda _: self._on_simulate())
        self.btn_anim.on_clicked(lambda _: self._on_animate())
        self.btn_knn.on_clicked(lambda _: self._on_load_knn())
        self.btn_export.on_clicked(lambda _: self._on_export())

        # ---- Title ------------------------------------------------------
        self.fig.text(
            0.50, 0.98,
            'H.E.A.T.  AILOS-TORC   Simulation Observatory',
            ha='center', va='top',
            color=THEME['ACCENT'], fontsize=13, fontweight='bold',
            fontfamily='monospace')

        self._style_plot_axes()

    # ------------------------------------------------------------------
    #  Axis styling
    # ------------------------------------------------------------------

    def _style_plot_axes(self):
        for ax in (self.ax_engage, self.ax_torc, self.ax_physics):
            ax.set_facecolor(THEME['PANEL'])
            ax.tick_params(colors=THEME['TEXT'], labelsize=7)
            for sp in ax.spines.values():
                sp.set_color(THEME['GRID'])
            ax.grid(color=THEME['GRID'], linewidth=0.4,
                    linestyle='--', alpha=0.5)

    def _reset_engage_ax(self):
        ax = self.ax_engage
        ax.set_facecolor(THEME['PANEL'])
        ax.tick_params(colors=THEME['TEXT'], labelsize=7)
        for sp in ax.spines.values():
            sp.set_color(THEME['GRID'])
        ax.grid(color=THEME['GRID'], linewidth=0.4,
                linestyle='--', alpha=0.5)
        ax.set_xlabel('X  (px from target)', color=THEME['TEXT'], fontsize=8)
        ax.set_ylabel('Y  (px from target)', color=THEME['TEXT'], fontsize=8)
        ax.set_title('Engagement View', color=THEME['ACCENT'],
                     fontsize=10, fontweight='bold', pad=6)

    def _reset_torc_ax(self):
        ax = self.ax_torc
        ax.set_facecolor(THEME['PANEL'])
        ax.tick_params(colors=THEME['TEXT'], labelsize=7)
        for sp in ax.spines.values():
            sp.set_color(THEME['GRID'])
        ax.grid(color=THEME['GRID'], linewidth=0.4, linestyle='--', alpha=0.5)
        ax.set_ylabel('θ  (deg)', color=THEME['TEXT'], fontsize=8)
        ax.set_xlabel('Time (s)', color=THEME['TEXT'], fontsize=8)
        ax.set_title('TORC Angle  θ(t)', color=THEME['ACCENT'],
                     fontsize=10, fontweight='bold', pad=4)
        ax.set_ylim(0, 105)

    def _reset_physics_ax(self):
        ax = self.ax_physics
        ax.set_facecolor(THEME['PANEL'])
        ax.tick_params(colors=THEME['TEXT'], labelsize=7)
        for sp in ax.spines.values():
            sp.set_color(THEME['GRID'])
        ax.grid(color=THEME['GRID'], linewidth=0.4, linestyle='--', alpha=0.5)
        ax.set_xlabel('Time (s)', color=THEME['TEXT'], fontsize=8)
        ax.set_title('Speed & Authority', color=THEME['ACCENT'],
                     fontsize=10, fontweight='bold', pad=4)

    # ------------------------------------------------------------------
    #  Simulation
    # ------------------------------------------------------------------

    def _current_trajectory(self):
        if self._traj_source == 'knn' and self._knn_trajectory:
            return self._knn_trajectory
        return generate_trajectory(
            disp_px    = self._disp_px,
            angle_rad  = math.radians(self._angle_deg),
            quiet_t    = self._quiet_t,
            sweep_mag  = self._sweep_mag,
            sweep_peak = self._sweep_peak,
            sweep_sigma= self._sweep_sigma,
        )

    def _run_sim(self):
        self.sim.pix_per_m = self._pix_per_m
        traj = self._current_trajectory()
        self._result = self.sim.evaluate(
            disp_px   = self._disp_px,
            angle_rad = math.radians(self._angle_deg),
            range_m   = self._range_m,
            trajectory= traj,
        )

    # ------------------------------------------------------------------
    #  Drawing
    # ------------------------------------------------------------------

    def _draw_all(self):
        self._draw_engagement()
        self._draw_torc()
        self._draw_physics()
        self._draw_results()
        self.fig.canvas.draw_idle()

    def _draw_engagement(self):
        ax  = self.ax_engage
        res = self._result

        ax.cla()
        # Force axes back to its original position (prevents any drift)
        ax.set_position(self._engage_rect)
        self._reset_engage_ax()

        if not res or not res.states:
            self.ax_cbar.cla()
            self.ax_cbar.axis('off')
            return

        xs    = np.array([s.lat_x_px  for s in res.states])
        ys    = np.array([-s.lat_y_px for s in res.states])
        qs    = np.array([s.torc_q    for s in res.states])
        chs_x = np.array([s.ch_x_px   for s in res.states])
        chs_y = np.array([-s.ch_y_px  for s in res.states])

        # Quiet phase shading
        q_end = res.quiet_phase_end_t
        quiet_idx = [i for i, s in enumerate(res.states) if s.t <= q_end]
        if quiet_idx:
            qx = xs[quiet_idx]
            qy = ys[quiet_idx]
            pad = max(6, self._disp_px * 0.05)
            ax.fill_between(qx, qy - pad, qy + pad,
                            color=THEME['QUIET_FILL'], alpha=0.5,
                            zorder=1, label='Quiet phase')

        # Crosshair path
        ax.plot(chs_x, chs_y, color=THEME['CROSSHAIR'], linewidth=1.0,
                linestyle='--', alpha=0.5, zorder=2, label='Crosshair')

        # Missile path — TORC-colored segments
        norm = plt.Normalize(0, 1)
        pts  = np.column_stack([xs, ys]).reshape(-1, 1, 2)
        segs = np.concatenate([pts[:-1], pts[1:]], axis=1)
        lc   = LineCollection(segs, cmap=TORC_CMAP, norm=norm,
                               linewidth=2.5, zorder=3)
        lc.set_array(qs[:-1])
        ax.add_collection(lc)

        # Colorbar — draw into the permanent dedicated axes (no space stealing)
        self.ax_cbar.cla()
        sm = plt.cm.ScalarMappable(cmap=TORC_CMAP, norm=norm)
        sm.set_array([])
        cb = self.fig.colorbar(sm, cax=self.ax_cbar)
        cb.set_label('TORC Q', color=THEME['TEXT'], fontsize=7)
        cb.ax.tick_params(colors=THEME['TEXT'], labelsize=6)

        # Start marker
        ax.scatter(xs[0], ys[0], s=70, c=THEME['MISSILE'], zorder=5,
                   marker='o', edgecolors='white', linewidths=0.5,
                   label='Launch')

        # Target zone
        hit_r = self.sim.hit_radius_px
        ax.add_patch(mpatches.Circle(
            (0, 0), hit_r, fill=True, facecolor=THEME['TARGET'],
            alpha=0.12, edgecolor=THEME['TARGET'],
            linewidth=0.8, linestyle='--', zorder=2))
        ax.scatter([0], [0], s=100, c=THEME['TARGET'], marker='+',
                   linewidths=2, zorder=6, label='Target')

        # Impact point
        ix, iy = res.impact_x_px, -res.impact_y_px
        hit_clr = THEME['HIT_COLOR'] if res.hit else THEME['MISS_COLOR']
        lbl = f"{'HIT' if res.hit else 'MISS'} ({res.miss_dist_px:.0f}px)"
        ax.scatter([ix], [iy], s=160, c=hit_clr, marker='x',
                   linewidths=2.5, zorder=7, label=lbl)

        # Limits — symmetric square bounds, NO set_aspect (it causes shrinking)
        data_extent = max(
            np.abs(xs).max(), np.abs(ys).max(),
            np.abs(chs_x).max(), np.abs(chs_y).max(),
            hit_r, 50) * 1.3
        ax.set_xlim(-data_extent, data_extent)
        ax.set_ylim(-data_extent, data_extent)
        ax.axhline(0, color=THEME['AXIS_TEXT'], linewidth=0.3, zorder=0)
        ax.axvline(0, color=THEME['AXIS_TEXT'], linewidth=0.3, zorder=0)

        ax.legend(loc='upper left', fontsize=6, facecolor=THEME['PANEL'],
                  labelcolor=THEME['TEXT'], framealpha=0.8,
                  handlelength=1.5, borderpad=0.4)

    def _draw_torc(self):
        ax  = self.ax_torc
        res = self._result
        ax.cla()
        self._reset_torc_ax()

        if not res or not res.states:
            return

        ts     = np.array([s.t      for s in res.states])
        thetas = np.degrees(np.array([s.theta for s in res.states]))
        qs     = np.array([s.torc_q  for s in res.states])

        # 90° ideal line
        ax.axhline(90, color=THEME['ACCENT'], linewidth=0.7,
                   linestyle=':', alpha=0.4, label='90° ideal')

        # Quiet phase shading
        ax.axvspan(0, res.quiet_phase_end_t,
                   color=THEME['QUIET_FILL'], alpha=0.4)

        # θ(t) TORC-colored line
        pts  = np.column_stack([ts, thetas]).reshape(-1, 1, 2)
        segs = np.concatenate([pts[:-1], pts[1:]], axis=1)
        lc   = LineCollection(segs, cmap=TORC_CMAP,
                               norm=plt.Normalize(0, 1), linewidth=2.0)
        lc.set_array(qs[:-1])
        ax.add_collection(lc)
        ax.set_xlim(ts[0], ts[-1])

        # Impact marker
        hit_clr = THEME['HIT_COLOR'] if res.hit else THEME['MISS_COLOR']
        ax.scatter([ts[-1]], [thetas[-1]], s=60, c=hit_clr, zorder=5,
                   marker='D', label=f'Impact θ={thetas[-1]:.1f}°')

        ax.legend(loc='lower right', fontsize=6, facecolor=THEME['PANEL'],
                  labelcolor=THEME['TEXT'], framealpha=0.8)

    def _draw_physics(self):
        ax  = self.ax_physics
        res = self._result

        # Remove old twinx axis
        if self._physics_ax2 is not None:
            try:
                self._physics_ax2.remove()
            except Exception:
                pass
            self._physics_ax2 = None

        ax.cla()
        self._reset_physics_ax()

        if not res or not res.states:
            return

        ts     = np.array([s.t              for s in res.states])
        speeds = np.array([s.speed           for s in res.states])
        auths  = np.array([s.turn_authority  for s in res.states])

        ax2 = ax.twinx()
        self._physics_ax2 = ax2
        ax2.set_facecolor('none')
        ax2.tick_params(colors=THEME['AUTHORITY'], labelsize=6)
        ax2.spines['right'].set_color(THEME['AUTHORITY'])

        ln1, = ax.plot(ts, speeds, color=THEME['SPEED'],
                        linewidth=1.5, label='Speed (m/s)')
        ln2, = ax2.plot(ts, auths, color=THEME['AUTHORITY'],
                         linewidth=1.5, linestyle='--',
                         label='Turn auth (°/s)')

        ax.set_ylabel('Speed (m/s)', color=THEME['SPEED'], fontsize=7)
        ax2.set_ylabel('Turn auth (°/s)', color=THEME['AUTHORITY'], fontsize=7)
        ax.set_xlim(ts[0], ts[-1])

        ax.axvspan(0, res.quiet_phase_end_t,
                   color=THEME['QUIET_FILL'], alpha=0.3)
        ax.axhline(MK8Sim.V_MAX, color=THEME['SPEED'],
                   linewidth=0.5, linestyle=':', alpha=0.3)

        ax.legend([ln1, ln2], [ln1.get_label(), ln2.get_label()],
                  loc='lower right', fontsize=6,
                  facecolor=THEME['PANEL'], labelcolor=THEME['TEXT'],
                  framealpha=0.8)

    def _draw_results(self):
        ax  = self.ax_results
        res = self._result
        ax.cla()
        ax.axis('off')

        if not res:
            return

        hit_str = 'HIT' if res.hit else 'MISS'
        clr     = THEME['HIT_COLOR'] if res.hit else THEME['MISS_COLOR']
        q_pct   = int(res.torc_quality * 100)
        pk_pct  = int(res.peak_torc   * 100)

        text = (
            f"{hit_str}   Miss: {res.miss_dist_px:.1f}px ({res.miss_dist_m:.2f}m)   "
            f"TORC Q: {q_pct}%  Peak: {pk_pct}%   "
            f"θ={res.impact_theta_deg:.1f}°   "
            f"t={res.flight_time:.3f}s"
        )

        ax.text(0.02, 0.5, text, color=clr, fontsize=9,
                va='center', transform=ax.transAxes,
                fontweight='bold', fontfamily='monospace')

    # ------------------------------------------------------------------
    #  Widget callbacks
    # ------------------------------------------------------------------

    def _on_slider(self, _val):
        self._disp_px   = self.sl_disp.val
        self._angle_deg = self.sl_angle.val
        self._range_m   = self.sl_range.val
        self._quiet_t   = self.sl_quiet.val
        self._sweep_mag = self.sl_sweep.val
        self._pix_per_m = self.sl_ppm.val
        self._on_simulate()

    def _on_simulate(self):
        if self._anim_running:
            self._stop_animation()
        self._run_sim()
        self._draw_all()

    def _on_animate(self):
        if self._anim_running:
            self._stop_animation()
            return
        self._run_sim()
        self._start_animation()

    def _on_load_knn(self):
        """Load the nearest KNN trajectory from dataset."""
        try:
            import sys, os
            root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            if root not in sys.path:
                sys.path.insert(0, root)
            from overlay.heat.plugins.heat_ailos_torc.trainer.correction_learner import CorrectionLearner
            learner = CorrectionLearner(data_file=self.data_file)
            traj, conf = learner.predict(
                self._disp_px,
                math.radians(self._angle_deg),
                self._range_m)
            if traj is None:
                print('[Observatory] KNN: insufficient data (<3 hits)')
                return
            self._knn_trajectory = traj
            self._traj_source    = 'knn'
            print(f'[Observatory] KNN loaded (conf={conf:.2f}, {len(traj)} pts)')
            self.btn_knn.label.set_text('KNN loaded')
            self._on_simulate()
        except Exception as e:
            print(f'[Observatory] KNN error: {e}')

    def _on_export(self):
        """Export current sim result as synthetic hit."""
        if self._result is None or not self._result.hit:
            print('[Observatory] Can only export HIT results.')
            return
        try:
            import sys, os
            root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            if root not in sys.path:
                sys.path.insert(0, root)
            from overlay.heat.plugins.heat_ailos_torc.trainer.correction_learner import CorrectionLearner
            learner = CorrectionLearner(data_file=self.data_file)
            traj = self._current_trajectory()
            n = learner.add_sample(
                displacement_px=self._disp_px,
                angle_rad=math.radians(self._angle_deg),
                range_m=self._range_m,
                trajectory=traj,
                hit=True)
            print(f'[Observatory] Exported (total: {n})')
            self.btn_export.label.set_text(f'Exported #{n}')
            self.fig.canvas.draw_idle()
        except Exception as e:
            print(f'[Observatory] Export error: {e}')

    # ------------------------------------------------------------------
    #  Animation
    # ------------------------------------------------------------------

    def _start_animation(self):
        res = self._result
        if not res or not res.states:
            return

        self._anim_running = True
        self.btn_anim.label.set_text('Stop')

        states = res.states
        n_frames = len(states)
        ax = self.ax_engage

        # Draw static base
        self._draw_engagement()

        # Animated elements
        self._anim_missile, = ax.plot(
            [], [], 'o', color=THEME['MISSILE'], markersize=7, zorder=10)
        self._anim_ch, = ax.plot(
            [], [], 's', color=THEME['CROSSHAIR'], markersize=5,
            zorder=10, alpha=0.8)
        self._anim_trail_x = []
        self._anim_trail_y = []
        self._anim_trail, = ax.plot(
            [], [], '-', color='white', linewidth=0.8, alpha=0.3, zorder=9)
        self._anim_text = ax.text(
            0.02, 0.97, '', transform=ax.transAxes,
            color=THEME['ACCENT'], fontsize=8, va='top',
            fontfamily='monospace')

        interval = max(16, int(1000 / 60 / 0.5))  # ~0.5x real-time

        def _update(frame):
            if frame >= n_frames:
                return (self._anim_missile,)
            s = states[frame]
            mx, my = s.lat_x_px, -s.lat_y_px
            self._anim_missile.set_data([mx], [my])
            self._anim_ch.set_data([s.ch_x_px], [-s.ch_y_px])
            self._anim_trail_x.append(mx)
            self._anim_trail_y.append(my)
            self._anim_trail.set_data(self._anim_trail_x, self._anim_trail_y)
            self._anim_text.set_text(
                f't={s.t:.3f}s  θ={math.degrees(s.theta):.1f}°  '
                f'Q={s.torc_q:.2f}  v={s.speed:.0f}m/s')
            return (self._anim_missile, self._anim_ch,
                    self._anim_trail, self._anim_text)

        self._anim_obj = animation.FuncAnimation(
            self.fig, _update,
            frames=n_frames,
            interval=interval,
            blit=True,
            repeat=False)
        self.fig.canvas.draw_idle()

    def _stop_animation(self):
        if self._anim_obj is not None:
            try:
                self._anim_obj.event_source.stop()
            except Exception:
                pass
            self._anim_obj = None
        self._anim_running = False
        self.btn_anim.label.set_text('Animate')

    # ------------------------------------------------------------------
    #  Public
    # ------------------------------------------------------------------

    def show(self):
        """Open the observatory window (blocking)."""
        plt.show()


# ---------------------------------------------------------------------------
#  Standalone
# ---------------------------------------------------------------------------

def launch(disp_px=120.0, angle_deg=45.0, range_m=200.0,
           data_file=None):
    obs = SimObservatory(data_file=data_file)
    obs._disp_px   = disp_px
    obs._angle_deg = angle_deg
    obs._range_m   = range_m
    obs.sl_disp.set_val(disp_px)
    obs.sl_angle.set_val(angle_deg)
    obs.sl_range.set_val(range_m)
    obs.show()
