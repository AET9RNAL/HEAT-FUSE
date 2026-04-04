"""
AutoOverlay - Production SACLOS overlay with ML-assisted auto-correction.

Extends BaseSACLOSOverlay with:
  - Displacement calculation on tracking-key release
  - ML trajectory replay (KNN on recorded human guidance)
  - Formula-based bezier correction (deprecated, kept for reference)
  - Online learning: label each correction as HIT/MISS
"""

import math
import time
import threading
import traceback
from loguru import logger

from ui.base_overlay import BaseSACLOSOverlay
from utils.hardware_inject import inject_mouse_movement, inject_mouse_click


class AutoOverlay(BaseSACLOSOverlay):
    """Production overlay that auto-corrects missile trajectory after tracking."""

    def __init__(self, root, *args, **kwargs):
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

        self.turret_traverse_speed_deg_s = 51.3
        self.turret_instant_follow_deg = 15.0
        self.pixels_per_degree = 10.0

        self.mouse_sensitivity_scale = 1.0

        self.lead_alpha = 1.0
        self.lead_beta = 0.5
        self.lead_gamma = 0.3
        self.urgency_k = 2.0
        self.base_engagement_delay_s = 0.05
        self.base_duration_ms = 300.0
        self.correction_speed_multiplier = 1.0

        super().__init__(root, *args, **kwargs)

    # ----------------------------------------------------------------
    #  Config hooks
    # ----------------------------------------------------------------

    def _add_extra_config(self, config_dict):
        config_dict.update({
            "correction_enabled": self.correction_enabled,
            "target_range_m": self.target_range_m,
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
        })

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

        # Auto-load learner if ml_enabled from config and not already set
        if self.ml_enabled and self.learner is None:
            try:
                from trainer.correction_learner import CorrectionLearner
                self.learner = CorrectionLearner()
                stats = self.learner.get_stats()
                logger.info(f"ML loaded from config: {stats['total']} samples "
                            f"({stats['hits']} hits, {stats['misses']} misses)")
            except Exception as e:
                logger.warning(f"Could not load ML data: {e}")
                self.ml_enabled = False


    # ----------------------------------------------------------------
    #  Tracking override: displacement + correction
    # ----------------------------------------------------------------

    def _stop_tracking(self):
        """Override: common teardown, then calculate displacement and trigger correction."""
        was_tracking = self.tracking_active
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
                    total_dx = sum(p['dx'] for p in ml_trajectory)
                    total_dy = sum(p['dy'] for p in ml_trajectory)
                    duration = ml_trajectory[-1]['t'] if ml_trajectory else 0

                    stats = self.learner.get_stats()
                    logger.info(
                        f"Auto-correction [ML TRAJECTORY] | "
                        f"Disp: {distance_px:.1f}px @ {math.degrees(angle_rad):.1f}° | "
                        f"Range: {self.target_range_m:.0f}m | "
                        f"Traj: {len(ml_trajectory)} pts, dx={total_dx:.0f} dy={total_dy:.0f} dur={duration:.2f}s | "
                        f"Confidence: {confidence:.2f} | "
                        f"Data: {stats['total']} samples ({stats['hits']} hits, {stats['misses']} misses)"
                    )

                    self._ml_last_context = {
                        'displacement_px': distance_px,
                        'angle_rad': angle_rad,
                        'range_m': self.target_range_m,
                        'trajectory': ml_trajectory,
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
        inject_mouse_click()

        start_time = time.perf_counter()
        cumulative_dx = 0.0
        cumulative_dy = 0.0
        injected_dx = 0
        injected_dy = 0

        for i, pt in enumerate(trajectory):
            if not self.correction_active or self.correction_interrupted.is_set():
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
                    logger.warning(f"Mouse injection error: {e}")
                    break

        elapsed = time.perf_counter() - start_time
        logger.info(f"Auto-correction complete [ML] (took {elapsed:.2f}s, "
                    f"injected {injected_dx}dx {injected_dy}dy)")

        # Online learning: open visual editor for labelling
        if getattr(self, 'ml_online_learning', True) and self._ml_last_context is not None:
            ctx = self._ml_last_context
            self.root.after(50, lambda c=ctx: self._open_refiner(c))

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
        from refiner.trajectory_editor import TrajectoryEditorWindow

        # Close any existing editor
        if self._refiner_win is not None:
            try:
                self._refiner_win.destroy()
            except Exception:
                pass

        self._refiner_win = TrajectoryEditorWindow(
            self.root,
            trajectory=context['trajectory'],
            context=context,
            learner=self.learner,
            mode='capture',
        )
        logger.info("Visual editor opened — review trajectory, then Save or Discard")

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
