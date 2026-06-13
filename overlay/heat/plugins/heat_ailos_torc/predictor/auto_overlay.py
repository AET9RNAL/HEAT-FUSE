"""
AutoOverlay - Production SACLOS overlay with ML-assisted auto-correction.

Extends BaseSACLOSOverlay with:
  - Displacement calculation on tracking-key release
  - ML trajectory replay (KNN on recorded human guidance)
  - Formula-based bezier correction (deprecated, kept for reference)
  - Online learning: label each correction as HIT/MISS
  - Quick Correction mode: keyboard-driven rapid iteration with live HUD
"""

import copy
import math
import os
import time
import threading
import traceback
from loguru import logger

try:
    import winsound as _winsound
    from overlay.heat.plugins.heat_ailos_torc import ASSETS_DIR as _ASSETS_DIR
    _SOUNDS_DIR = _ASSETS_DIR / 'sounds'
    _LOCK_SOUND = str(_SOUNDS_DIR / 'lock.wav')
    _INTERCEPT_SOUND = str(_SOUNDS_DIR / 'intercept.wav')
except ImportError:
    _winsound = None
    _LOCK_SOUND = None
    _INTERCEPT_SOUND = None

# Preload WAV files into memory so playback never touches disk.
_LOCK_SOUND_BUF = None
_INTERCEPT_SOUND_BUF = None
if _winsound:
    for _path, _attr in [(_LOCK_SOUND, '_LOCK_SOUND_BUF'),
                          (_INTERCEPT_SOUND, '_INTERCEPT_SOUND_BUF')]:
        try:
            if _path and os.path.exists(_path):
                with open(_path, 'rb') as _f:
                    globals()[_attr] = _f.read()
        except Exception:
            pass


def _play_sound_async(buf):
    """Play a preloaded WAV buffer on a daemon thread (zero main-thread cost)."""
    if buf and _winsound:
        threading.Thread(
            target=_winsound.PlaySound,
            args=(buf, _winsound.SND_MEMORY),
            daemon=True,
        ).start()

from overlay.heat.plugins.heat_ailos_torc.ui.base_overlay import BaseSACLOSOverlay
from overlay.heat.plugins.heat_ailos_torc.ui.tce import TCE
from overlay.heat.plugins.heat_ailos_torc.predictor.ql_hud import QuickLabelHudMixin
from fuse.utils.hardware_inject_router import inject_mouse_movement, inject_mouse_click
from overlay.heat.plugins.heat_ailos_torc.ocr.range_ocr import OCR_MIN_RANGE_M, OCR_MAX_RANGE_M


class AutoOverlay(QuickLabelHudMixin, BaseSACLOSOverlay):
    """Production overlay that auto-corrects missile trajectory after tracking."""

    def __init__(self, root, *args, **kwargs):
        # ML profile injection — pop before forwarding kwargs to base overlay.
        self.ml_profile = kwargs.pop("ml_profile", None)

        # Init predictor-specific state BEFORE super().__init__()
        # because _load_config -> _load_extra_config runs inside it.
        self.correction_active = False
        self.correction_waypoints = []
        self.correction_waypoint_index = 0
        self.correction_start_time = 0
        self.correction_interrupted = threading.Event()

        self.mouse_controller = None
        self.correction_thread = None
        self.correction_lock = threading.Lock()

        self.correction_enabled = True
        self.correction_min_threshold_px = 5.0
        self.pre_correction_delay_ms = 150

        self.ml_enabled = False
        self.ml_confidence_threshold = 0.3
        self.ml_online_learning = True
        self.learner = None
        self._ml_last_context = None
        self._refiner_win = None

        # AttnRes self-improvement config
        self.attn_enabled = True
        self.attn_lr = 0.02
        self.attn_n_buckets = 10
        self.torc_quality_weight = 0.5

        # Pre-fire recording (captures aiming trajectory during tracking)
        self._prefire_deltas = []
        self._prefire_start_time = None
        self._prefire_last_x = None
        self._prefire_last_y = None
        self._replay_cursor_pos = None  # (x, y) screen pos at tracking start

        # Quick-label state
        self._ql_active = False
        self._ql_state = None           # 'prompt' | 'hit' | 'miss' | 'rollback_select'
        self._ql_context = None
        self._ql_torc_quality = None
        self._ql_rollback_digits = ""   # accumulates digits during rollback select
        self._ql_prev_state = None      # state before entering rollback_select
        self._ql_replay_thread = None
        self._ql_replay_abort = threading.Event()
        self._correction_session = None
        self.quick_label_enabled = True

        self.turret_traverse_speed_deg_s = 51.3
        self.turret_instant_follow_deg = 15.0
        self.pixels_per_degree = 10.0

        self.mouse_sensitivity_scale = 1.0

        # TORC Capture Envelope (TCE) — recovery boundary visualization.
        # Config keys keep the `envelope_*` prefix for back-compat with
        # already-tuned saclos_config.json files.
        self.envelope_enabled = True
        self.envelope_d_max_px = None
        self.envelope_n_max_deg = None
        self.envelope_d_base_px = 24.0
        self.envelope_d_per_meter_px = 0.45
        self.envelope_d_min_px = 20.0
        self.envelope_d_max_cap_px = 220.0
        self.envelope_offset_x = 0.0
        self.envelope_offset_y = 0.0
        # Constant pixel arc length (None falls back to envelope_n_max_deg).
        self.envelope_arc_length_px = 60.0
        self.tce = None

        self.lead_alpha = 1.0
        self.lead_beta = 0.5
        self.lead_gamma = 0.3
        self.urgency_k = 2.0
        self.base_engagement_delay_s = 0.05
        self.base_duration_ms = 300.0
        self.correction_speed_multiplier = 1.0

        # Initialize QL HUD state BEFORE super().__init__() so that
        # _ql_load_config (called inside super) finds the attributes
        # and can override defaults with saved positions.
        self._init_ql_hud()

        super().__init__(root, *args, **kwargs)

    # ----------------------------------------------------------------
    #  Config hooks
    # ----------------------------------------------------------------

    def _add_extra_config(self, config_dict):
        if self._fuse_config is None:
            # Standalone mode: save all settings from instance attrs.
            # In FUSE mode these keys are owned by ctx.config.set() which already
            # persisted them to disk; writing stale instance attrs would revert changes.
            config_dict.update({
                "correction_enabled": self.correction_enabled,
                "correction_min_threshold_px": self.correction_min_threshold_px,
                "correction_speed_multiplier": self.correction_speed_multiplier,
                "turret_traverse_speed_deg_s": self.turret_traverse_speed_deg_s,
                "turret_instant_follow_deg": self.turret_instant_follow_deg,
                "pixels_per_degree": self.pixels_per_degree,
                "mouse_sensitivity_scale": self.mouse_sensitivity_scale,
                "lead_alpha": self.lead_alpha,
                "lead_beta": self.lead_beta,
                "lead_gamma": self.lead_gamma,
                "urgency_k": self.urgency_k,
                "base_engagement_delay_s": self.base_engagement_delay_s,
                "base_duration_ms": self.base_duration_ms,
                "ml_enabled": self.ml_enabled,
                "ml_confidence_threshold": self.ml_confidence_threshold,
                "ml_online_learning": self.ml_online_learning,
                "attn_enabled": self.attn_enabled,
                "attn_lr": self.attn_lr,
                "attn_n_buckets": self.attn_n_buckets,
                "torc_quality_weight": self.torc_quality_weight,
                "quick_label_enabled": self.quick_label_enabled,
                "envelope_enabled": self.envelope_enabled,
                "envelope_d_max_px": self.envelope_d_max_px,
                "envelope_n_max_deg": self.envelope_n_max_deg,
                "envelope_d_base_px": self.envelope_d_base_px,
                "envelope_d_per_meter_px": self.envelope_d_per_meter_px,
                "envelope_d_min_px": self.envelope_d_min_px,
                "envelope_d_max_cap_px": self.envelope_d_max_cap_px,
                "envelope_offset_x": self.envelope_offset_x,
                "envelope_offset_y": self.envelope_offset_y,
                "envelope_arc_length_px": self.envelope_arc_length_px,
            })
        self._ql_capture_positions()
        self._ql_save_config(config_dict)

    def _load_extra_config(self, config):
        self.correction_enabled = config.get("correction_enabled", True)
        self.correction_min_threshold_px = config.get("correction_min_threshold_px", 5.0)
        self.correction_speed_multiplier = config.get("correction_speed_multiplier", 1.0)
        self.turret_traverse_speed_deg_s = config.get("turret_traverse_speed_deg_s", 51.3)
        self.turret_instant_follow_deg = config.get("turret_instant_follow_deg", 15.0)
        self.pixels_per_degree = config.get("pixels_per_degree", 10.0)
        self.mouse_sensitivity_scale = config.get("mouse_sensitivity_scale", 1.0)
        self.lead_alpha = config.get("lead_alpha", 1.0)
        self.lead_beta = config.get("lead_beta", 0.5)
        self.lead_gamma = config.get("lead_gamma", 0.3)
        self.urgency_k = config.get("urgency_k", 2.0)
        self.base_engagement_delay_s = config.get("base_engagement_delay_s", 0.05)
        self.base_duration_ms = config.get("base_duration_ms", 300.0)
        self.ml_enabled = config.get("ml_enabled", False)
        self.ml_confidence_threshold = config.get("ml_confidence_threshold", 0.3)
        self.ml_online_learning = config.get("ml_online_learning", True)

        # AttnRes self-improvement config
        self.attn_enabled = config.get("attn_enabled", True)
        self.attn_lr = config.get("attn_lr", 0.02)
        self.attn_n_buckets = config.get("attn_n_buckets", 10)
        self.torc_quality_weight = config.get("torc_quality_weight", 0.5)

        # Quick-label config
        self.quick_label_enabled = config.get("quick_label_enabled", True)
        self._ql_load_config(config)

        # Envelope arc config
        self.envelope_enabled = config.get("envelope_enabled", True)
        self.envelope_d_max_px = config.get("envelope_d_max_px", None)
        self.envelope_n_max_deg = config.get("envelope_n_max_deg", None)
        self.envelope_d_base_px = config.get("envelope_d_base_px", 24.0)
        self.envelope_d_per_meter_px = config.get("envelope_d_per_meter_px", 0.45)
        self.envelope_d_min_px = config.get("envelope_d_min_px", 20.0)
        self.envelope_d_max_cap_px = config.get("envelope_d_max_cap_px", 220.0)
        self.envelope_offset_x = config.get("envelope_offset_x", 0.0)
        self.envelope_offset_y = config.get("envelope_offset_y", 0.0)
        self.envelope_arc_length_px = config.get("envelope_arc_length_px", 60.0)

        # Auto-load learner if ml_enabled from config and not already set
        if self.ml_enabled and self.learner is None:
            try:
                from overlay.heat.plugins.heat_ailos_torc.trainer.correction_learner import CorrectionLearner
                self.learner = CorrectionLearner(
                    profile=self.ml_profile,
                    attn_enabled=self.attn_enabled,
                    attn_lr=self.attn_lr,
                    attn_n_buckets=self.attn_n_buckets,
                    torc_quality_weight=self.torc_quality_weight,
                )
                stats = self.learner.get_stats()
                logger.info(f"ML loaded from config: {stats['total']} samples "
                            f"({stats['hits']} hits, {stats['misses']} misses)"
                            f" | AttnRes: {'ON' if self.attn_enabled else 'OFF'}"
                            f" | TORC Q avg: {stats.get('avg_torc_quality', 0):.3f}")
            except Exception as e:
                # Don't disable ml_enabled on load failure — the user
                # explicitly set it to true and we don't want to clobber
                # the config when _save_config() fires on lock transition.
                logger.warning(f"Could not load ML learner: {e}")


    # ----------------------------------------------------------------
    #  HUD lifecycle overrides — QL overlays visible in setup mode
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
            "[Quick-Label]\n"
            "[H] HIT  [M] MISS  [E] Editor  [Esc] Discard"
        )
        self._ql_show_placeholder_graphs()
        self._tce_show_setup()

    def _show_hud_locked(self):
        """In locked mode, hide QL overlays until the first engagement.

        Empty QL widgets at startup were confusing in predictor mode (looked
        like the training overlay). They reappear after the first QL exit via
        ``_ql_show_idle`` when online-learning is on; when online-learning is
        off they stay hidden.
        """
        super()._show_hud_locked()
        self._ql_capture_positions()
        self._ql_set_draggable(False)
        self._ql_hide_all()
        self._tce_show()

    def _hide_hud(self):
        """Hide all HUD windows including QL overlays."""
        super()._hide_hud()
        self._ql_hide_all()
        self._tce_hide()

    # ----------------------------------------------------------------
    #  TCE (TORC Capture Envelope) lifecycle + feature mapping
    # ----------------------------------------------------------------

    def _tce_ensure(self):
        if self.tce is not None:
            return self.tce
        try:
            self.tce = TCE(
                self.root,
                get_origin=self._tce_get_origin,
                get_envelope=self._tce_compute,
                on_origin_drag=self._tce_on_origin_drag,
            )
        except Exception as e:
            logger.warning(f"TCE init failed: {e}")
            self.tce = None
        return self.tce

    def _tce_show(self):
        if not self.envelope_enabled:
            return
        tce = self._tce_ensure()
        if tce is None:
            return
        tce.set_mode("arc")
        tce.show()

    def _tce_show_setup(self):
        if not self.envelope_enabled:
            return
        tce = self._tce_ensure()
        if tce is None:
            return
        tce.set_mode("ring")
        tce.show()

    def _tce_hide(self):
        if self.tce is not None:
            self.tce.hide()

    def _tce_destroy(self):
        if self.tce is not None:
            self.tce.destroy()
            self.tce = None

    def _tce_get_origin(self):
        if self.state not in ("locked", "adjust_bounds", "calibrate"):
            return None
        if self.origin_x is None or self.origin_y is None:
            if self.state == "calibrate":
                # No calibrated origin yet — show ring at screen centre so the
                # user can see it.  Offset won't persist until the main tracker
                # is calibrated (which sets origin_x/y) and the user locks again.
                sw = self.root.winfo_screenwidth()
                sh = self.root.winfo_screenheight()
                return sw / 2.0, sh / 2.0
            return None
        return (self.origin_x + self.envelope_offset_x,
                self.origin_y + self.envelope_offset_y)

    def _tce_compute(self):
        """Map current input features -> (d_max_px, n_max_rad)."""
        if self.envelope_d_max_px is not None:
            d_max = float(self.envelope_d_max_px)
        else:
            # Clamp to OCR domain so the radius floor is naturally
            # base + OCR_MIN_RANGE_M*slope rather than a magic constant.
            r = max(OCR_MIN_RANGE_M,
                    min(OCR_MAX_RANGE_M, float(self.target_range_m)))
            d_max = self.envelope_d_base_px + r * self.envelope_d_per_meter_px
            d_max = max(float(self.envelope_d_min_px),
                        min(float(self.envelope_d_max_cap_px), d_max))

        # Constant-pixel-length wins; preserves visual sweep size as
        # the radius grows. n_max = arc_length / (2 * d_max).
        if self.envelope_arc_length_px is not None and d_max > 0:
            n_max_rad = float(self.envelope_arc_length_px) / (2.0 * d_max)
            n_max_rad = min(n_max_rad, math.pi - 1e-3)
            return d_max, n_max_rad

        n_deg = (float(self.envelope_n_max_deg)
                 if self.envelope_n_max_deg is not None else 25.0)
        return d_max, math.radians(n_deg)

    def _tce_on_origin_drag(self, new_center_x, new_center_y):
        if self.origin_x is None or self.origin_y is None:
            return
        self.envelope_offset_x = float(new_center_x) - float(self.origin_x)
        self.envelope_offset_y = float(new_center_y) - float(self.origin_y)
        self._save_config()

    def _capture_hud_positions(self):
        """Capture HUD positions including QL overlays."""
        super()._capture_hud_positions()
        self._ql_capture_positions()

    def _ql_show_placeholder_graphs(self):
        """Draw placeholder data on graphs so they're visible during setup."""
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
            # Draw a sample trajectory path
            from overlay.heat.plugins.heat_ailos_torc.predictor.ql_hud import _traj_to_cumulative
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
            self._ql_sim_start_time = __import__('time').perf_counter()
            self._ql_sim_tick()
        if self._ql_checkpoint_frame:
            # Show sample checkpoints
            for lbl in self._ql_checkpoint_labels:
                lbl.destroy()
            self._ql_checkpoint_labels = []
            import tkinter as tk
            samples = [
                ("#0  T=1.000  M=1.000  S=+0.000  \u2190 base", "#888888"),
                ("#1  T=1.150  M=1.000  S=+0.000  \u2190 premature", "#888888"),
                ("#2  T=1.150  M=1.150  S=+0.040  \u2190 delay", "#888888"),
                (">> T=1.320  M=1.150  S=+0.040  [Seeking Hit]", self.HUD_GREEN),
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
    #  Tracking override: pre-fire recording, displacement + correction
    # ----------------------------------------------------------------

    def _start_tracking(self):
        """Override: reset pre-fire state before starting tracking."""
        # Interrupt running correction from previous session to prevent
        # injected mouse deltas from bleeding into the new tracking session.
        if self.correction_active:
            self.correction_interrupted.set()
            self.correction_active = False

        # Exit QL mode so the tracking key isn't swallowed.
        if self._ql_active:
            if self._ql_replay_thread and self._ql_replay_thread.is_alive():
                self._ql_replay_abort.set()
            self._ql_active = False
            self._ql_state = None
            self._ql_context = None

        self._prefire_deltas = []
        self._prefire_start_time = None
        self._prefire_last_x = None
        self._prefire_last_y = None
        self._replay_cursor_pos = None
        super()._start_tracking()
        if self.tracking_active:
            self._prefire_start_time = time.perf_counter()
            _play_sound_async(_LOCK_SOUND_BUF)

    def _on_mouse_move(self, x, y):
        """Override: record pre-fire aiming deltas during tracking."""
        if self.tracking_active and self._prefire_start_time is not None:
            if self._prefire_last_x is None:
                # First move: capture cursor start position for replay teleport
                self._replay_cursor_pos = (x, y)
            else:
                raw_dx = x - self._prefire_last_x
                raw_dy = y - self._prefire_last_y
                t = time.perf_counter() - self._prefire_start_time
                self._prefire_deltas.append(
                    {'t': round(t, 4), 'dx': raw_dx, 'dy': raw_dy})
            self._prefire_last_x = x
            self._prefire_last_y = y
        super()._on_mouse_move(x, y)

    def _stop_tracking(self):
        """Override: common teardown, then calculate displacement and trigger correction."""
        if self.tracking_active:
            _play_sound_async(_INTERCEPT_SOUND_BUF)
        was_tracking = self.tracking_active
        # Capture cursor start pos before super() clears mouse_start_x/y
        if was_tracking and self._replay_cursor_pos is None and self.mouse_start_x is not None:
            self._replay_cursor_pos = (self.mouse_start_x, self.mouse_start_y)
        super()._stop_tracking()  # Common teardown (stop listener, capture position, reset state)
        if not was_tracking:
            return

        # Calculate displacement from accurate final position to origin
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
            self._reset_to_calibrated_position()
            self.root.after(0, lambda: self._start_auto_correction(distance_px, angle_rad))
        else:
            # Still fire the missile even if no movement needed
            if self.correction_enabled:
                threading.Thread(target=inject_mouse_click, daemon=True).start()
            self._reset_to_calibrated_position()

    # ----------------------------------------------------------------
    #  Auto-correction engine
    # ----------------------------------------------------------------

    def _start_auto_correction(self, distance_px, angle_rad):
        """
        Start auto-correction: generate mouse movements to guide missile.

        Supports two modes:
        - ML mode (default when data exists): Uses KNN regression on recorded human guidance
        - Formula mode (deprecated): Uses physics-based heuristic
        """
        if self.correction_active:
            self._reset_to_calibrated_position()
            return

        # Clear any stale context
        self._ml_last_context = None

        # ---- ML prediction ----
        if self.ml_enabled and self.learner is not None:
            try:
                ml_trajectory, confidence = self.learner.predict(
                    distance_px, angle_rad, self.target_range_m
                )

                if ml_trajectory is not None:
                    # Apply correction bias if any
                    bias_info = ""
                    if self.quick_label_enabled:
                        self._ensure_correction_session()
                        tf, mf, _ = self._correction_session.get_bias(
                            distance_px, angle_rad, self.target_range_m)
                        entry = self._correction_session.get_active_entry()
                        ts = entry.get('time_shift', 0.0) if entry else 0.0
                        if tf != 1.0 or mf != 1.0 or ts != 0.0:
                            from overlay.heat.plugins.heat_ailos_torc.trainer.correction_session import CorrectionSession
                            ml_trajectory = copy.deepcopy(ml_trajectory)
                            CorrectionSession.apply_bias_to_trajectory(
                                ml_trajectory, tf, mf, ts)
                            bias_info = f" | Bias: T={tf:.3f} M={mf:.3f} S={ts:+.3f}"

                    total_dx = sum(p['dx'] for p in ml_trajectory)
                    total_dy = sum(p['dy'] for p in ml_trajectory)
                    duration = ml_trajectory[-1]['t'] if ml_trajectory else 0

                    stats = self.learner.get_stats()
                    logger.info(
                        f"Auto-correction [ML TRAJECTORY] | "
                        f"Disp: {distance_px:.1f}px @ {math.degrees(angle_rad):.1f}° | "
                        f"Range: {self.target_range_m:.0f}m | "
                        f"Traj: {len(ml_trajectory)} pts, dx={total_dx:.0f} dy={total_dy:.0f} dur={duration:.2f}s | "
                        f"Confidence: {confidence:.2f}{bias_info} | "
                        f"Data: {stats['total']} samples ({stats['hits']} hits, {stats['misses']} misses)"
                    )

                    self._ml_last_context = {
                        'displacement_px': distance_px,
                        'angle_rad': angle_rad,
                        'range_m': self.target_range_m,
                        'trajectory': ml_trajectory,
                        'pre_trajectory': list(self._prefire_deltas),
                        'cursor_start_pos': self._replay_cursor_pos,
                    }

                    self.correction_active = True
                    self.correction_interrupted.clear()
                    self.correction_start_time = time.perf_counter()
                    self._update_hud_status("intercept")
                    self.correction_thread = threading.Thread(
                        target=self._ml_trajectory_thread_func,
                        args=(ml_trajectory,),
                        daemon=True
                    )
                    self.correction_thread.start()
                    return

                else:
                    logger.warning("ML: insufficient hit data (<3 hits), cannot predict. "
                                    "Run trainer to collect training data.")
                    self._reset_to_calibrated_position()
                    self._update_hud_status("idle")
                    return

            except Exception as e:
                logger.exception(f"ML prediction error: {e}")
                self._reset_to_calibrated_position()
                self._update_hud_status("idle")
                return

        # ---- No ML mode ----
        logger.info("No correction mode active. Use --ml flag with training data.")
        self._reset_to_calibrated_position()
        self._update_hud_status("idle")

    def _ml_trajectory_thread_func(self, trajectory):
        """
        Replay a recorded human mouse trajectory with exact timing.

        Each entry in trajectory is {'t': seconds, 'dx': pixels, 'dy': pixels}.
        """
        from fuse.utils.trajectory_replay import replay_movements

        inject_mouse_click()

        injected_dx, injected_dy, elapsed = replay_movements(
            trajectory, abort_event=self.correction_interrupted)

        logger.info(f"Auto-correction complete [ML] (took {elapsed:.2f}s, "
                    f"injected {injected_dx}dx {injected_dy}dy)")

        # Online learning: quick-label only. The standalone trajectory
        # refiner is a training/curation tool launched from the AILOS-TORC
        # picker — never auto-popped in live predictor mode.
        if (getattr(self, 'ml_online_learning', True)
                and self.quick_label_enabled
                and self._ml_last_context is not None):
            ctx = self._ml_last_context
            self.root.after(50, lambda c=ctx: self._enter_quick_label(c))

        self.root.after(0, self._finish_correction)

    def _correction_thread_func(self, engagement_delay_s):
        """
        Execute bezier correction animation in a background thread (formula mode).
        """
        inject_mouse_click()

        if engagement_delay_s > 0:
            time.sleep(engagement_delay_s)

        waypoints = self.correction_waypoints
        start_time = time.perf_counter()

        for i in range(len(waypoints)):
            if not self.correction_active or self.correction_interrupted.is_set():
                break

            target_x, target_y, timestamp_ms = waypoints[i]

            if i == 0:
                try:
                    from pynput import mouse as pynmouse
                    current_x, current_y = pynmouse.Controller().position
                except Exception:
                    current_x, current_y = target_x, target_y
            else:
                current_x, current_y, _ = waypoints[i - 1]

            delta_x = int(target_x - current_x)
            delta_y = int(target_y - current_y)

            try:
                inject_mouse_movement(delta_x, delta_y)
            except Exception as e:
                logger.warning(f"Could not move mouse: {e}")
                break

            if i + 1 < len(waypoints):
                next_timestamp_ms = waypoints[i + 1][2]
                sleep_s = (next_timestamp_ms - timestamp_ms) / 1000.0
                if sleep_s > 0:
                    time.sleep(sleep_s)

        elapsed = time.perf_counter() - start_time
        logger.info(f"Auto-correction complete (took {elapsed:.2f}s)")
        self.root.after(0, self._finish_correction)

    def _finish_correction(self):
        """Called on main thread after correction thread completes."""
        self._reset_to_calibrated_position()
        self._cleanup_correction()
        self._update_hud_status("idle")

    # ----------------------------------------------------------------
    #  Visual editor (replaces keyboard labelling)
    # ----------------------------------------------------------------

    def _open_refiner(self, context):
        """Open the trajectory editor for visual review/edit before saving."""
        from overlay.heat.plugins.heat_ailos_torc.refiner.trajectory_editor import TrajectoryEditorWindow

        # Close any existing editor
        if self._refiner_win is not None:
            try:
                self._refiner_win.destroy()
            except Exception:
                pass

        def _on_refiner_save(sample):
            """Callback after HIT/MISS label is confirmed — triggers REINFORCE update."""
            if self.learner is not None:
                try:
                    self.learner.update_from_outcome(
                        hit=sample.get('hit', False),
                        trajectory=sample.get('traj'),
                        angle_rad=sample.get('angle'),
                    )
                    q_str = ""
                    if sample.get('traj') and sample.get('angle') is not None:
                        from overlay.heat.plugins.heat_ailos_torc.trainer.torc_quality import estimate_torc_quality
                        q = estimate_torc_quality(sample['traj'], sample['angle'])
                        q_str = f" | TORC Q: {q:.3f}"
                    label = "HIT" if sample.get('hit') else "MISS"
                    logger.info(f"AttnRes update: {label}{q_str}")
                except Exception as e:
                    logger.warning(f"AttnRes update error: {e}")

        self._refiner_win = TrajectoryEditorWindow(
            self.root,
            trajectory=context['trajectory'],
            context=context,
            learner=self.learner,
            mode='capture',
            on_save=_on_refiner_save,
        )
        logger.info("Visual editor opened — review trajectory, then Save or Discard")

    # ----------------------------------------------------------------
    #  Quick Correction mode
    # ----------------------------------------------------------------

    def _ensure_correction_session(self):
        """Lazy-init the CorrectionSession."""
        if self._correction_session is None:
            from overlay.heat.plugins.heat_ailos_torc.trainer.correction_session import CorrectionSession
            self._correction_session = CorrectionSession(profile=self.ml_profile)

    def _enter_quick_label(self, context):
        """Enter quick-label mode after ML trajectory execution."""
        self._ql_active = True
        self._ql_state = 'prompt'
        self._ql_context = context
        self._ql_torc_quality = None
        self._ql_rollback_digits = ""

        self._ensure_correction_session()
        self._correction_session.get_bias(
            context['displacement_px'],
            context['angle_rad'],
            context['range_m'],
        )

        # Show HUD overlays
        self._ql_show_all()
        self._ql_update_prompt(
            "[H] HIT  [M] MISS  [5] Replay  [E] Editor  [Esc] Discard"
        )
        attentioner = getattr(self.learner, 'attentioner', None)
        self._ql_update_all_overlays(
            self._correction_session, context.get('trajectory'),
            attentioner, pre_trajectory=context.get('pre_trajectory'),
            context=context,
        )
        logger.info("Quick-label mode: [H]it / [M]iss / [5] Replay / [E]ditor / [Esc]")

    def _catch_kbd_press(self, key):
        """Override: intercept QL keys when active, then fall through to base."""
        if self._ql_active:
            # Let the tracking key pass through — _start_tracking will exit QL.
            if self.tracking_key is not None:
                char_t = getattr(key, 'char', None)
                is_tracking = (char_t and char_t.lower() == self.tracking_key.lower()) if isinstance(self.tracking_key, str) else (key == self.tracking_key)
                if is_tracking:
                    return super()._catch_kbd_press(key)

            char = getattr(key, 'char', None)
            name = getattr(key, 'name', None)
            if char:
                self.root.after(0, lambda c=char.lower(): self._ql_handle_key(c))
                return True
            if name:
                self.root.after(0, lambda n=name: self._ql_handle_special(n))
                return True
            return True  # consume all keys while QL is active

        return super()._catch_kbd_press(key)

    def _ql_handle_key(self, char):
        """Handle a character key press in quick-label mode."""
        if self._ql_state == 'prompt':
            if char == 'h':
                self._ql_on_hit()
            elif char == 'm':
                self._ql_on_miss()
            elif char == '5':
                self._ql_start_replay()
            elif char == 'e':
                self._ql_open_editor()
            return

        if self._ql_state == 'hit':
            if char == 's':
                self._ql_save_to_dataset()
            elif char == '5':
                self._ql_start_replay()
            elif char == '1':
                self._ql_apply_correction('premature')
            elif char == '2':
                self._ql_apply_correction('late')
            elif char == '3':
                self._ql_apply_correction('undershoot')
            elif char == '4':
                self._ql_apply_correction('overshoot')
            elif char == '6':
                self._ql_apply_correction('delay')
            elif char == '7':
                self._ql_apply_correction('advance')
            elif char == 'r':
                self._ql_prev_state = 'hit'
                self._ql_state = 'rollback_select'
                self._ql_rollback_digits = ""
                self._ql_update_prompt(
                    "ROLLBACK: type checkpoint # then [Enter]\n"
                    "[Esc] cancel"
                )
            return

        if self._ql_state == 'miss':
            if char == '1':
                self._ql_apply_correction('premature')
            elif char == '2':
                self._ql_apply_correction('late')
            elif char == '3':
                self._ql_apply_correction('undershoot')
            elif char == '4':
                self._ql_apply_correction('overshoot')
            elif char == '6':
                self._ql_apply_correction('delay')
            elif char == '7':
                self._ql_apply_correction('advance')
            elif char == '5':
                self._ql_start_replay()
            elif char == 'r':
                self._ql_prev_state = 'miss'
                self._ql_state = 'rollback_select'
                self._ql_update_prompt(
                    "ROLLBACK: type checkpoint # then [Enter]\n"
                    "[Esc] cancel"
                )
            return

        if self._ql_state == 'rollback_select':
            if char.isdigit():
                self._ql_rollback_digits += char
                self._ql_update_prompt(
                    f"ROLLBACK: #{self._ql_rollback_digits}_\n"
                    f"[Enter] confirm  [Esc] cancel"
                )

    def _ql_handle_special(self, name):
        """Handle special keys (Enter, Esc, PgUp, PgDn)."""
        if name == 'esc':
            # If replay is running, abort it
            if self._ql_replay_thread and self._ql_replay_thread.is_alive():
                self._ql_replay_abort.set()
                return
            if self._ql_state == 'rollback_select':
                # Cancel rollback, return to previous state
                prev = self._ql_prev_state or 'miss'
                self._ql_state = prev
                if prev == 'hit':
                    self._ql_update_prompt(
                        f"HIT!  TORC Q: {self._ql_torc_quality:.3f}\n"
                        f"[1-4] Correct  [6] Delay  [7] Advance  [5] Replay\n"
                        f"[PgUp/Dn] step  [R] Rollback  [S] Save  [Enter] Done  [Esc] Discard"
                    )
                else:
                    self._ql_show_miss_prompt()
            else:
                self._ql_exit()
            return

        if name in ('enter', 'return'):
            if self._ql_state == 'rollback_select' and self._ql_rollback_digits:
                idx = int(self._ql_rollback_digits)
                self._ql_do_rollback(idx)
                return
            # Enter in hit or miss state → exit (bias persists)
            if self._ql_state in ('hit', 'miss'):
                self._ql_exit()
            return

        if self._ql_state in ('hit', 'miss'):
            if name == 'page_up':
                self._correction_session.adjust_steps(0.02)
                self._ql_refresh_overlays()
                entry = self._correction_session.get_active_entry()
                if entry:
                    logger.info(f"Step size increased: T={entry.get('timing_step', 0):.3f} "
                                f"M={entry.get('magnitude_step', 0):.3f} "
                                f"S={entry.get('time_shift_step', 0.02):.4f}")
            elif name == 'page_down':
                self._correction_session.adjust_steps(-0.02)
                self._ql_refresh_overlays()
                entry = self._correction_session.get_active_entry()
                if entry:
                    logger.info(f"Step size decreased: T={entry.get('timing_step', 0):.3f} "
                                f"M={entry.get('magnitude_step', 0):.3f} "
                                f"S={entry.get('time_shift_step', 0.02):.4f}")

    def _ql_on_hit(self):
        """Handle HIT in quick-label mode."""
        self._ql_state = 'hit'

        # Compute TORC quality
        traj = self._ql_context.get('trajectory')
        angle = self._ql_context.get('angle_rad', 0)
        if traj:
            from overlay.heat.plugins.heat_ailos_torc.trainer.torc_quality import estimate_torc_quality
            self._ql_torc_quality = estimate_torc_quality(traj, angle)
        else:
            self._ql_torc_quality = 0.0

        # Record in correction session
        self._correction_session.record_hit(self._ql_torc_quality)

        # AttnRes update
        if self.learner is not None:
            try:
                self.learner.update_from_outcome(
                    hit=True, trajectory=traj, angle_rad=angle)
            except Exception as e:
                logger.warning(f"AttnRes update error: {e}")

        self._ql_update_prompt(
            f"HIT!  TORC Q: {self._ql_torc_quality:.3f}\n"
            f"[1-4] Correct  [6] Delay  [7] Advance  [5] Replay\n"
            f"[PgUp/Dn] step  [R] Rollback  [S] Save  [Enter] Done  [Esc] Discard"
        )
        self._ql_refresh_overlays()
        logger.info(f"Quick-label: HIT | TORC Q: {self._ql_torc_quality:.3f}")

    def _ql_on_miss(self):
        """Handle MISS in quick-label mode."""
        self._ql_state = 'miss'

        # AttnRes update
        if self.learner is not None:
            traj = self._ql_context.get('trajectory')
            angle = self._ql_context.get('angle_rad', 0)
            try:
                self.learner.update_from_outcome(
                    hit=False, trajectory=traj, angle_rad=angle)
            except Exception as e:
                logger.warning(f"AttnRes update error: {e}")

        self._ql_show_miss_prompt()
        self._ql_refresh_overlays()
        logger.info("Quick-label: MISS — apply corrections")

    def _ql_show_miss_prompt(self):
        """Show the MISS state prompt with current step sizes."""
        entry = self._correction_session.get_active_entry()
        ts = entry.get('timing_step', 0.15) if entry else 0.15
        ms = entry.get('magnitude_step', 0.15) if entry else 0.15
        ss = entry.get('time_shift_step', 0.02) if entry else 0.02
        self._ql_update_prompt(
            f"MISS — Correct:  step T={ts:.2f} M={ms:.2f} S={ss:.3f}\n"
            f"[1] Premature  [2] Late  [3] Under  [4] Over  [6] Delay  [7] Advance\n"
            f"[5] Replay  [PgUp/Dn] step  [R] Rollback  [Enter] Done  [Esc] Discard"
        )

    def _ql_apply_correction(self, kind):
        """Apply a correction and refresh all overlays."""
        method = {
            'premature': self._correction_session.apply_premature,
            'late': self._correction_session.apply_late,
            'undershoot': self._correction_session.apply_undershoot,
            'overshoot': self._correction_session.apply_overshoot,
            'delay': self._correction_session.apply_delay,
            'advance': self._correction_session.apply_advance,
        }.get(kind)
        if method:
            method()

        entry = self._correction_session.get_active_entry()
        if entry:
            logger.info(f"Correction [{kind}]: T={entry['timing_factor']:.3f} "
                        f"M={entry['magnitude_factor']:.3f} "
                        f"S={entry.get('time_shift', 0.0):+.3f}")

        self._ql_show_miss_prompt()
        self._ql_refresh_overlays()

    def _ql_do_rollback(self, checkpoint_index):
        """Rollback to a checkpoint and refresh."""
        success = self._correction_session.rollback(checkpoint_index)
        if success:
            entry = self._correction_session.get_active_entry()
            if entry:
                logger.info(f"Rollback to #{checkpoint_index}: "
                            f"T={entry['timing_factor']:.3f} "
                            f"M={entry['magnitude_factor']:.3f} "
                            f"S={entry.get('time_shift', 0.0):+.3f}")
        else:
            logger.warning(f"Rollback failed: invalid checkpoint #{checkpoint_index}")

        # Return to the state we were in before entering rollback_select
        prev = self._ql_prev_state or 'miss'
        self._ql_state = prev
        if prev == 'hit':
            self._ql_update_prompt(
                f"HIT!  TORC Q: {self._ql_torc_quality:.3f}\n"
                f"[1-4] Correct  [6] Delay  [7] Advance  [5] Replay\n"
                f"[PgUp/Dn] step  [R] Rollback  [S] Save  [Enter] Done  [Esc] Discard"
            )
        else:
            self._ql_show_miss_prompt()
        self._ql_refresh_overlays()

    def _ql_refresh_overlays(self):
        """Refresh all QL overlays with current state."""
        attentioner = getattr(self.learner, 'attentioner', None)
        traj = self._ql_context.get('trajectory') if self._ql_context else None
        pre_traj = self._ql_context.get('pre_trajectory') if self._ql_context else None
        self._ql_update_all_overlays(
            self._correction_session, traj, attentioner,
            pre_trajectory=pre_traj, context=self._ql_context)

    def _ql_save_to_dataset(self):
        """Save current biased trajectory as a HIT to the dataset."""
        if self.learner is None or self._ql_context is None:
            self._ql_exit()
            return

        ctx = self._ql_context
        traj = copy.deepcopy(ctx.get('trajectory', []))

        # Apply accumulated bias
        entry = self._correction_session.get_active_entry()
        if entry:
            from overlay.heat.plugins.heat_ailos_torc.trainer.correction_session import CorrectionSession
            CorrectionSession.apply_bias_to_trajectory(
                traj, entry['timing_factor'], entry['magnitude_factor'],
                entry.get('time_shift', 0.0))

        # Save as HIT
        self.learner.add_sample(
            displacement_px=ctx['displacement_px'],
            angle_rad=ctx['angle_rad'],
            range_m=ctx['range_m'],
            trajectory=traj,
            hit=True,
        )

        # Clear converged bias
        self._correction_session.clear_active()

        logger.info(f"Quick-label: saved biased trajectory as HIT "
                    f"(T={entry['timing_factor']:.3f} M={entry['magnitude_factor']:.3f})"
                    if entry else "Quick-label: saved trajectory as HIT")
        self._ql_exit()

    def _ql_open_editor(self):
        """Escape hatch: exit QL and open the full trajectory editor."""
        ctx = self._ql_context  # save before exit clears it
        self._ql_exit()
        if ctx:
            self.root.after(50, lambda c=ctx: self._open_refiner(c))

    # ---- Replay ----

    def _ql_start_replay(self):
        """Start replaying the recorded scenario with current bias."""
        if self._ql_context is None:
            return
        if self._ql_replay_thread and self._ql_replay_thread.is_alive():
            self._ql_replay_abort.set()
            self._ql_replay_thread.join(timeout=2)

        self._ql_replay_abort.clear()
        pre_state = self._ql_state  # remember state to return to
        self._ql_state = 'replay'

        # Hide graph overlays so they don't block the game view
        # Keep only the prompt for countdown display
        for win in [self._ql_graph_factors_win, self._ql_graph_lr_win,
                     self._ql_sim_win, self._ql_checkpoint_win]:
            if win:
                win.withdraw()

        self._ql_replay_thread = threading.Thread(
            target=self._ql_replay_thread_func,
            args=(pre_state,),
            daemon=True,
        )
        self._ql_replay_thread.start()

    def _ql_replay_thread_func(self, return_state):
        """Replay: countdown → teleport → pre-fire → click → biased trajectory."""
        from fuse.utils.trajectory_replay import replay_full_scenario

        ctx = self._ql_context
        if ctx is None:
            self.root.after(0, lambda: self._ql_replay_done(return_state))
            return

        # Build biased trajectory
        traj = copy.deepcopy(ctx.get('trajectory', []))
        entry = self._correction_session.get_active_entry() if self._correction_session else None
        if entry and (entry['timing_factor'] != 1.0 or entry['magnitude_factor'] != 1.0
                       or entry.get('time_shift', 0.0) != 0.0):
            from overlay.heat.plugins.heat_ailos_torc.trainer.correction_session import CorrectionSession
            CorrectionSession.apply_bias_to_trajectory(
                traj, entry['timing_factor'], entry['magnitude_factor'],
                entry.get('time_shift', 0.0))

        def _status(msg):
            self.root.after(0, lambda m=msg: self._ql_update_prompt(m))

        injected_dx, injected_dy, elapsed = replay_full_scenario(
            trajectory=traj,
            pre_trajectory=ctx.get('pre_trajectory'),
            cursor_pos=ctx.get('cursor_start_pos'),
            abort_event=self._ql_replay_abort,
            countdown_s=3,
            status_callback=_status,
            fire_click=True,
        )

        self.root.after(0, lambda: self._ql_update_prompt(
            f"Replay done ({injected_dx}dx {injected_dy}dy)"))
        time.sleep(1.5)
        self.root.after(0, lambda: self._ql_replay_done(return_state))

    def _ql_replay_done(self, return_state):
        """Return to QL state after replay completes."""
        # Re-show all overlays
        self._ql_show_all()
        self._ql_state = return_state or 'prompt'
        if self._ql_state == 'miss':
            self._ql_show_miss_prompt()
        elif self._ql_state == 'prompt':
            self._ql_update_prompt(
                "[H] HIT  [M] MISS  [5] Replay  [E] Editor  [Esc] Discard")
        elif self._ql_state == 'hit':
            q = self._ql_torc_quality or 0.0
            self._ql_update_prompt(
                f"HIT!  TORC Q: {q:.3f}\n"
                f"[1-4] Correct  [5] Replay  [PgUp/Dn] step  [R] Rollback\n"
                f"[S] Save to dataset  [Enter] Done  [Esc] Discard")
        self._ql_refresh_overlays()

    def _ql_show_idle(self):
        """Show QL overlays in idle state between engagements.

        Clears all data-dependent content so no stale data from a previous
        feature set leaks into the next engagement.
        """
        self._ql_ensure_windows()
        self._ql_update_prompt("[Quick-Label]  Waiting for next engagement...")

        # Clear graphs — show empty "No data" state
        if self._ql_graph_factors_canvas:
            self._ql_graph_factors_canvas.delete("all")
            cw = self._ql_graph_factors_canvas.winfo_width() or 280
            ch = self._ql_graph_factors_canvas.winfo_height() or 160
            self._ql_graph_factors_canvas.create_text(
                cw // 2, ch // 2, text="No data",
                fill="#666666", font=("Consolas", 9))
        if self._ql_graph_lr_canvas:
            self._ql_graph_lr_canvas.delete("all")
            cw = self._ql_graph_lr_canvas.winfo_width() or 280
            ch = self._ql_graph_lr_canvas.winfo_height() or 160
            self._ql_graph_lr_canvas.create_text(
                cw // 2, ch // 2, text="No data",
                fill="#666666", font=("Consolas", 9))

        # Clear checkpoint overlay
        if self._ql_checkpoint_frame:
            for lbl in self._ql_checkpoint_labels:
                lbl.destroy()
            self._ql_checkpoint_labels = []

        # Clear features overlay
        if self._ql_features_frame:
            for lbl in self._ql_features_labels:
                lbl.destroy()
            self._ql_features_labels = []

        # Stop sim animation, clear canvas
        self._ql_stop_sim()
        if self._ql_sim_canvas:
            self._ql_sim_canvas.delete("all")
            self._ql_sim_data = None
            self._ql_sim_pre_data = None

        # Show all windows (they stay visible between engagements)
        for win in self._ql_all_windows():
            if win:
                win.deiconify()
                win.attributes("-topmost", True)

    def _ql_exit(self):
        """Exit quick-label mode. Keep overlays visible during online learning."""
        # Abort any running replay
        if self._ql_replay_thread and self._ql_replay_thread.is_alive():
            self._ql_replay_abort.set()
            self._ql_replay_thread.join(timeout=2)
        self._ql_active = False
        self._ql_state = None
        self._ql_context = None
        self._ql_torc_quality = None
        self._ql_rollback_digits = ""

        # During online learning, keep overlays visible with idle prompt
        if getattr(self, 'ml_online_learning', True):
            self._ql_show_idle()
        else:
            self._ql_hide_all()
        logger.info("Quick-label mode exited")

    def _cleanup_correction(self):
        """Clean up correction state."""
        self.correction_active = False
        self.correction_waypoints = []
        self.correction_waypoint_index = 0
        self.correction_interrupted.clear()
        self.mouse_controller = None

    # ----------------------------------------------------------------
    #  Formula-based correction (deprecated, kept for reference)
    # ----------------------------------------------------------------

    def _calculate_correction_params(self, distance_px, angle_rad):
        """
        Calculate physics-based correction parameters using continuous functions.
        Based on GUIDANCE_ALGORITHM_SPEC.md.
        """
        max_displacement_px = math.sqrt(self.margin_x**2 + self.margin_y**2)
        d_norm = min(distance_px / max_displacement_px, 1.0)
        n_norm = abs(angle_rad) / (math.pi / 2)
        r_norm = min(self.target_range_m / 500.0, 1.0)

        urgency = d_norm * (1 + n_norm)

        range_proximity = 1.2 + r_norm * 1.5

        base_lead = (
            self.lead_alpha * d_norm +
            self.lead_beta * n_norm +
            self.lead_gamma * urgency
        )
        lead_factor = base_lead * range_proximity
        lead_factor = max(lead_factor, 1.0)
        lead_factor = min(lead_factor, 3.0)

        lead_distance_px_raw = distance_px * (1 + lead_factor)
        overshoot_px = lead_distance_px_raw - distance_px

        max_overshoot_px = 60.0 + (self.target_range_m / 100.0) * 15.0
        overshoot_px = min(overshoot_px, max_overshoot_px)

        lead_distance_px = (distance_px + overshoot_px) * self.mouse_sensitivity_scale
        lead_angle_rad = angle_rad + math.pi

        base_range_delay_s = self.base_engagement_delay_s * r_norm
        engagement_delay_s = base_range_delay_s / (1.0 + self.urgency_k * urgency)
        engagement_delay_s = max(0.01, engagement_delay_s)

        speed_factor = 1.0 + urgency
        speed_factor *= self.correction_speed_multiplier

        duration_ms = self.base_duration_ms / speed_factor

        angular_distance_deg = lead_distance_px / self.pixels_per_degree

        if angular_distance_deg <= self.turret_instant_follow_deg:
            min_duration_ms = 0.0
        else:
            excess_deg = angular_distance_deg - self.turret_instant_follow_deg
            min_duration_ms = (excess_deg / self.turret_traverse_speed_deg_s) * 1000.0
            min_duration_ms *= 1.2

        duration_ms = max(duration_ms, min_duration_ms)
        duration_ms = min(duration_ms, 3000.0)

        aggression = min(0.9, urgency)

        return {
            'lead_distance_px': lead_distance_px,
            'lead_angle_rad': lead_angle_rad,
            'engagement_delay_s': engagement_delay_s,
            'duration_ms': duration_ms,
            'speed_factor': speed_factor,
            'aggression': aggression,
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
        """Generate cubic bezier curve waypoints for smooth mouse movement."""
        duration_ms = params['duration_ms']
        aggression = params['aggression']

        dx = end_x - start_x
        dy = end_y - start_y

        cp1_x = start_x + dx * (0.25 + aggression * 0.1)
        cp1_y = start_y + dy * (0.1 + aggression * 0.2)
        cp2_x = end_x - dx * (0.1 + aggression * 0.2)
        cp2_y = end_y - dy * (0.25 + aggression * 0.1)

        waypoints = []
        steps = max(20, int(duration_ms / 10))

        for i in range(steps + 1):
            t = i / steps
            t_eased = t * t * (3 - 2 * t)

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
