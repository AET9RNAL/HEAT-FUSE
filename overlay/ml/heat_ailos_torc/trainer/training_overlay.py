"""
TrainingOverlay - Records manual missile guidance for ML training.

Same overlay as the production predictor, but:
  - auto-correction is DISABLED
  - LMB click during tracking captures the displacement snapshot
  - mouse movement after LMB is recorded as the guidance vector
  - on tracking-key release: quick-label mode for rapid tweak & replay,
    or the visual trajectory editor for detailed editing
"""

import math
import time
from loguru import logger

try:
    from pynput import mouse as pynmouse, keyboard as pynkeyboard
    PYNPUT_OK = True
except ImportError:
    PYNPUT_OK = False

from ui.base_overlay import BaseSACLOSOverlay
from predictor.ql_hud import QuickLabelHudMixin
from trainer.training_ql import TrainingQuickLabelMixin
from trainer.correction_learner import CorrectionLearner


class TrainingOverlay(TrainingQuickLabelMixin, QuickLabelHudMixin, BaseSACLOSOverlay):
    """
    Overlay subclass that records manual guidance trajectories.

    Workflow:
        Track -> LMB -> Guide -> Release -> Quick-Label (tweak, replay, save/discard)
    """

    def __init__(self, root, *args, **kwargs):
        # Init HUD and QL state BEFORE super().__init__()
        self._init_ql_hud()
        self._init_training_ql()

        super().__init__(root, *args, **kwargs)

        # Disable auto-correction in training mode
        self.correction_enabled = False

        # ML learner
        self.learner = CorrectionLearner()

        # Training-cycle state (reset every tracking cycle)
        self._train_click_listener = None
        self._train_recording      = False
        self._train_lmb_detected   = False
        self._train_disp_px        = None
        self._train_disp_angle     = None
        self._train_range          = None
        self._train_deltas         = []
        self._train_start_time     = None
        self._train_last_x         = None
        self._train_last_y         = None

        # Pre-fire aiming trajectory (tracking start → LMB click)
        # Stateless — never written to dataset, only used for replay context
        self._prefire_deltas     = []
        self._prefire_start_time = None
        self._prefire_last_x     = None
        self._prefire_last_y     = None

        # Refiner editor window reference
        self._refiner_win = None

        # Banner
        stats = self.learner.get_stats()
        logger.info(
            f"SACLOS TRAINING MODE | "
            f"ML data: {self.learner.data_file} | "
            f"Samples: {stats['total']} ({stats['hits']} hits, {stats['misses']} misses) | "
            f"Auto-correct: DISABLED"
        )
        logger.info(
            "Workflow: Track -> LMB -> Guide -> Release -> Quick-Label / Editor"
        )

    # ----------------------------------------------------------------
    #  Config hooks — persist QL overlay positions
    # ----------------------------------------------------------------

    def _add_extra_config(self, config_dict):
        self._ql_capture_positions()
        self._ql_save_config(config_dict)

    def _load_extra_config(self, config):
        self._ql_load_config(config)

    # ----------------------------------------------------------------
    #  HUD lifecycle — QL overlays visible & draggable in setup
    # ----------------------------------------------------------------

    def _show_hud_setup(self):
        """Show QL overlays alongside base HUD in draggable setup mode."""
        super()._show_hud_setup()
        self._ql_ensure_windows()
        self._ql_set_draggable(True)
        self._ql_position_windows()
        for win in self._ql_all_windows():
            if win:
                win.deiconify()
                win.attributes("-topmost", True)
                win.lift()
        # Show placeholder data so user can see the overlays
        self._ql_update_prompt(
            "[Training Quick-Label]\n"
            "[H] HIT  [M] MISS  [5] Replay  [E] Editor  [Esc] Discard"
        )
        self._tql_show_placeholder_graphs()

    def _show_hud_locked(self):
        """In locked mode, hide QL overlays until a capture triggers them."""
        super()._show_hud_locked()
        self._ql_capture_positions()
        self._ql_set_draggable(False)
        self._ql_hide_all()

    def _hide_hud(self):
        """Hide all HUD windows including QL overlays."""
        super()._hide_hud()
        self._ql_hide_all()

    def _capture_hud_positions(self):
        """Capture HUD positions including QL overlays."""
        super()._capture_hud_positions()
        self._ql_capture_positions()

    def _tql_show_placeholder_graphs(self):
        """Draw placeholder data on QL graphs so they're visible during setup."""
        if self._ql_graph_factors_canvas:
            self._ql_draw_line_graph(
                self._ql_graph_factors_canvas,
                [[1.0, 1.15, 1.15, 1.32], [1.0, 1.0, 1.15, 1.15]],
                [self.HUD_GREEN, self.HUD_CYAN],
                ["Timing", "Magnitude"],
                y_ref=1.0,
            )
        if self._ql_graph_lr_canvas:
            self._ql_draw_line_graph(
                self._ql_graph_lr_canvas,
                [[0.15, 0.15, 0.17, 0.17], [0.15, 0.15, 0.15, 0.17]],
                [self.HUD_GREEN, self.HUD_CYAN],
                ["T Step", "M Step"],
            )
        if self._ql_sim_canvas:
            from predictor.ql_hud import _traj_to_cumulative
            sample_traj = [
                {'t': 0.0, 'dx': 0, 'dy': 0},
                {'t': 0.05, 'dx': 3, 'dy': -1},
                {'t': 0.10, 'dx': 5, 'dy': -2},
                {'t': 0.15, 'dx': 4, 'dy': -3},
                {'t': 0.20, 'dx': 3, 'dy': -2},
                {'t': 0.25, 'dx': 2, 'dy': -1},
                {'t': 0.30, 'dx': 1, 'dy': 0},
            ]
            self._ql_sim_data = _traj_to_cumulative(sample_traj)
            self._ql_sim_draw_static()
            import time as _time
            self._ql_sim_start_time = _time.perf_counter()
            self._ql_sim_tick()
        if self._ql_checkpoint_frame:
            import tkinter as tk
            for lbl in self._ql_checkpoint_labels:
                lbl.destroy()
            self._ql_checkpoint_labels = []
            samples = [
                ("#0  T=1.000  M=1.000  S=+0.000  \u2190 base", "#888888"),
                ("#1  T=1.150  M=1.000  S=+0.000  \u2190 premature", "#888888"),
                (">> T=1.150  M=1.000  S=+0.000  [Seeking Hit]", self.HUD_GREEN),
            ]
            for text, color in samples:
                lbl = tk.Label(
                    self._ql_checkpoint_frame, text=text,
                    fg=color, bg=self.QL_CANVAS_BG,
                    font=("Consolas", 8), anchor="w",
                )
                lbl.pack(fill=tk.X, padx=2)
                self._ql_checkpoint_labels.append(lbl)

    # ----------------------------------------------------------------
    #  Tracking overrides
    # ----------------------------------------------------------------

    def _start_tracking(self):
        """Override: reset training state, add LMB click listener."""
        self._train_recording    = False
        self._train_lmb_detected = False
        self._train_deltas       = []
        self._train_start_time   = None
        self._train_last_x       = None
        self._train_last_y       = None

        self._prefire_deltas     = []
        self._prefire_start_time = None
        self._prefire_last_x     = None
        self._prefire_last_y     = None

        super()._start_tracking()

        if self.tracking_active and PYNPUT_OK:
            if self._train_click_listener:
                try:
                    self._train_click_listener.stop()
                except Exception:
                    pass
            self._prefire_start_time = time.perf_counter()
            self._train_click_listener = pynmouse.Listener(
                on_click=self._on_train_click,
            )
            self._train_click_listener.start()
            logger.info("Tracking started - click LMB to fire & begin recording")

    def _on_train_click(self, x, y, button, pressed):
        """Passive LMB listener: snapshot displacement at fire moment."""
        if not pressed or button != pynmouse.Button.left:
            return
        if not self.tracking_active or self._train_lmb_detected:
            return

        tw = self.tracking_win_x
        if tw is not None and self.origin_x is not None:
            cx = tw + self.img_w / 2
            cy = self.tracking_win_y + self.img_h / 2
        elif self.origin_x is not None:
            cx = self.win_x + self.img_w / 2
            cy = self.win_y + self.img_h / 2
        else:
            return

        dx = self.origin_x - cx
        dy = self.origin_y - cy
        self._train_disp_px    = math.sqrt(dx * dx + dy * dy)
        self._train_disp_angle = math.atan2(dy, dx)
        self._train_range      = self.target_range_m
        self._train_lmb_detected = True
        self._train_recording    = True
        self._train_start_time   = time.perf_counter()
        self._train_deltas       = []
        self._train_last_x       = None
        self._train_last_y       = None

        logger.info(f"LMB! d={self._train_disp_px:.1f}px "
                    f"n={math.degrees(self._train_disp_angle):.1f}\u00b0 "
                    f"r={self._train_range:.0f}m - recording guidance ...")

    def _on_mouse_move(self, x, y):
        """Override: accumulate timestamped raw deltas.

        Before LMB (pre-fire aiming): deltas go into _prefire_deltas.
        After  LMB (guidance recording): deltas go into _train_deltas.
        """
        if self._train_recording:
            # Post-fire guidance
            if self._train_last_x is not None:
                raw_dx = x - self._train_last_x
                raw_dy = y - self._train_last_y
                t = time.perf_counter() - self._train_start_time
                self._train_deltas.append({'t': round(t, 4), 'dx': raw_dx, 'dy': raw_dy})
            self._train_last_x = x
            self._train_last_y = y
        elif self.tracking_active and not self._train_lmb_detected and self._prefire_start_time is not None:
            # Pre-fire aiming phase
            if self._prefire_last_x is not None:
                raw_dx = x - self._prefire_last_x
                raw_dy = y - self._prefire_last_y
                t = time.perf_counter() - self._prefire_start_time
                self._prefire_deltas.append({'t': round(t, 4), 'dx': raw_dx, 'dy': raw_dy})
            self._prefire_last_x = x
            self._prefire_last_y = y

        super()._on_mouse_move(x, y)

    def _stop_tracking(self):
        """Override: capture training data, skip auto-correction."""
        # Stop click listener
        if self._train_click_listener:
            try:
                self._train_click_listener.stop()
            except Exception:
                pass
            self._train_click_listener = None

        # Build capture if we have data
        if self._train_lmb_detected and self._train_deltas:
            total_dx = sum(d['dx'] for d in self._train_deltas)
            total_dy = sum(d['dy'] for d in self._train_deltas)
            corr_dist = math.sqrt(total_dx ** 2 + total_dy ** 2)
            corr_deg  = math.degrees(math.atan2(total_dy, total_dx)) if corr_dist > 0 else 0
            dur = self._train_deltas[-1]['t'] if self._train_deltas else 0

            logger.info(
                f"Training Capture | "
                f"Input: d={self._train_disp_px:.1f}px n={math.degrees(self._train_disp_angle):.1f}\u00b0 r={self._train_range:.0f}m | "
                f"Output: dx={total_dx:.0f} dy={total_dy:.0f} ({corr_dist:.1f}px @ {corr_deg:.1f}\u00b0) | "
                f"Time: {dur:.2f}s ({len(self._train_deltas)} mouse events)"
            )

            capture = {
                'displacement_px': self._train_disp_px,
                'angle_rad':       self._train_disp_angle,
                'range_m':         self._train_range,
                'trajectory':      self._train_deltas,
                'pre_trajectory':  self._prefire_deltas,
                'cursor_start_pos': (self._prefire_last_x, self._prefire_last_y)
                                    if self._prefire_last_x is not None else None,
            }
            # Enter quick-label mode for rapid tweak & replay
            self.root.after(50, lambda c=capture: self._tql_enter(c))

        elif self.tracking_active and not self._train_lmb_detected:
            logger.info("Tracking ended - no LMB detected (nothing recorded)")

        # Reset training state
        self._train_recording    = False
        self._train_lmb_detected = False
        self._train_deltas       = []
        self._train_start_time   = None
        self._train_last_x       = None
        self._train_last_y       = None

        # Parent handles listener shutdown + overlay reset
        super()._stop_tracking()

        # Snap overlay back to calibrated centre immediately
        self._reset_to_calibrated_position()

    # ----------------------------------------------------------------
    #  Keyboard interception
    # ----------------------------------------------------------------

    def _catch_kbd_press(self, key):
        """Override: intercept training QL keys when active."""
        if self._tql_active:
            char = getattr(key, 'char', None)
            name = getattr(key, 'name', None)
            if char:
                self.root.after(0, lambda c=char.lower(): self._tql_handle_key(c))
                return True
            if name:
                self.root.after(0, lambda n=name: self._tql_handle_special(n))
                return True
            return True  # consume all keys while TQL is active

        return super()._catch_kbd_press(key)

    # ----------------------------------------------------------------
    #  Visual editor (escape hatch from quick-label)
    # ----------------------------------------------------------------

    def _open_refiner(self, capture):
        """Open the trajectory editor for visual review/edit before saving."""
        from refiner.trajectory_editor import TrajectoryEditorWindow

        # Close any existing editor
        if self._refiner_win is not None:
            try:
                self._refiner_win.destroy()
            except Exception:
                pass

        self._refiner_win = TrajectoryEditorWindow(
            self.root,
            trajectory=capture['trajectory'],
            pre_trajectory=capture.get('pre_trajectory'),
            context={
                'displacement_px': capture['displacement_px'],
                'angle_rad': capture['angle_rad'],
                'range_m': capture['range_m'],
            },
            learner=self.learner,
            mode='capture',
        )
        logger.info("Visual editor opened — edit trajectory, then Save or Discard")

    # ----------------------------------------------------------------
    #  Cleanup
    # ----------------------------------------------------------------

    def _quit(self):
        if self._tql_active:
            self._tql_exit()
        if self._train_click_listener:
            try:
                self._train_click_listener.stop()
            except Exception:
                pass
        if self._refiner_win is not None:
            try:
                self._refiner_win.destroy()
            except Exception:
                pass
        super()._quit()
