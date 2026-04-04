"""
TrainingOverlay - Records manual missile guidance for ML training.

Same overlay as the production predictor, but:
  - auto-correction is DISABLED
  - LMB click during tracking captures the displacement snapshot
  - mouse movement after LMB is recorded as the guidance vector
  - on tracking-key release the visual trajectory editor opens for review/save
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
from trainer.correction_learner import CorrectionLearner


class TrainingOverlay(BaseSACLOSOverlay):
    """
    Overlay subclass that records manual guidance trajectories.

    Workflow:
        Track -> LMB -> Guide -> Release -> Visual Editor (tweak, replay, save/discard)
    """

    def __init__(self, root, *args, **kwargs):
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
            "Workflow: Track -> LMB -> Guide -> Release -> Visual Editor"
        )

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

        super()._start_tracking()

        if self.tracking_active and PYNPUT_OK:
            if self._train_click_listener:
                try:
                    self._train_click_listener.stop()
                except Exception:
                    pass
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
        """Override: also accumulate timestamped raw deltas when recording."""
        if self._train_recording:
            if self._train_last_x is not None:
                raw_dx = x - self._train_last_x
                raw_dy = y - self._train_last_y
                t = time.perf_counter() - self._train_start_time
                self._train_deltas.append({'t': round(t, 4), 'dx': raw_dx, 'dy': raw_dy})
            self._train_last_x = x
            self._train_last_y = y

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
            }
            # Open visual editor on the main thread
            self.root.after(50, lambda c=capture: self._open_refiner(c))

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
    #  Visual editor (replaces keyboard labelling)
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
