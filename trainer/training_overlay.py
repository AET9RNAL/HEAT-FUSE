"""
TrainingOverlay - Records manual missile guidance for ML training.

Same overlay as the production predictor, but:
  - auto-correction is DISABLED
  - LMB click during tracking captures the displacement snapshot
  - mouse movement after LMB is recorded as the guidance vector
  - on tracking-key release the user labels the result (1/2/3)
"""

import math
import time

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
        Track -> LMB -> Guide -> Release -> [1] Hit / [2] Miss / [3] Discard
        If MISS: [Q/W/E] timing  then  [A/S/D] magnitude
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

        # Post-cycle labelling (two-step state machine)
        self._label_state          = None
        self._last_capture         = None
        self._miss_timing          = None

        # Start an extra keyboard listener for the 1/2 label keys
        self._label_kbd = None
        self._start_label_kbd()

        # Banner
        stats = self.learner.get_stats()
        print()
        print("=" * 44)
        print("  SACLOS TRAINING MODE")
        print("=" * 44)
        print(f"  ML data file : {self.learner.data_file}")
        print(f"  Samples      : {stats['total']}  "
              f"({stats['hits']} hits, {stats['misses']} misses)")
        print(f"  Auto-correct : DISABLED")
        print()
        print("  Workflow:")
        print("    Track -> LMB -> Guide -> Release -> [1] Hit / [2] Miss / [3] Discard")
        print("    If MISS: [Q/W/E] timing  then  [A/S/D] magnitude")
        print("=" * 44)
        print()

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
        self._label_state        = None

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
            print("Tracking started  -  click LMB to fire & begin recording")

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

        print(f"  LMB!  d={self._train_disp_px:.1f}px  "
              f"n={math.degrees(self._train_disp_angle):.1f}\u00b0  "
              f"r={self._train_range:.0f}m   "
              f"- recording guidance ...")

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

            print()
            print("--- Training Capture ---")
            print(f"  Input  :  d={self._train_disp_px:.1f}px  "
                  f"n={math.degrees(self._train_disp_angle):.1f}\u00b0  "
                  f"r={self._train_range:.0f}m")
            print(f"  Output :  dx={total_dx:.0f}  dy={total_dy:.0f}  "
                  f"({corr_dist:.1f}px at {corr_deg:.1f}\u00b0)")
            print(f"  Time   :  {dur:.2f}s   "
                  f"({len(self._train_deltas)} mouse events)")
            print()
            print("  >>> Press  [1] HIT  /  [2] MISS  /  [3] DISCARD  <<<")

            self._last_capture = {
                'displacement_px': self._train_disp_px,
                'angle_rad':       self._train_disp_angle,
                'range_m':         self._train_range,
                'trajectory':      self._train_deltas,
            }
            self._label_state = 'outcome'

        elif self.tracking_active and not self._train_lmb_detected:
            print("  Tracking ended  -  no LMB detected (nothing recorded)")

        # Reset training state
        self._train_recording    = False
        self._train_lmb_detected = False
        self._train_deltas       = []
        self._train_start_time   = None
        self._train_last_x       = None
        self._train_last_y       = None

        # Parent handles listener shutdown + overlay reset
        super()._stop_tracking()

    # ----------------------------------------------------------------
    #  Label keys  (1 = Hit,  2 = Miss,  3 = Discard)
    # ----------------------------------------------------------------

    def _start_label_kbd(self):
        """Separate keyboard listener for post-capture labelling."""
        if not PYNPUT_OK:
            return

        def on_press(key):
            try:
                char = getattr(key, 'char', None)
                if self._label_state is None or char is None:
                    return

                if self._label_state == 'outcome':
                    if char == '1':
                        if self._last_capture and self.learner:
                            info = self._last_capture
                            n = self.learner.add_sample(
                                info['displacement_px'],
                                info['angle_rad'],
                                info['range_m'],
                                info['trajectory'],
                                hit=True,
                            )
                            stats = self.learner.get_stats()
                            print(f"  Recorded: HIT  -  "
                                  f"total {n} samples  "
                                  f"({stats['hits']} hits, {stats['misses']} misses)")
                        self._label_state = None
                        self._last_capture = None
                    elif char == '2':
                        self._label_state = 'timing'
                        print()
                        print("  MISS — Timing?  [Q] Premature  [W] Optimal  [E] Late")
                    elif char == '3':
                        print("  DISCARDED  (not saved)")
                        self._label_state = None
                        self._last_capture = None

                elif self._label_state == 'timing':
                    if char in ('q', 'w', 'e'):
                        timing_map = {'q': 'premature', 'w': 'optimal', 'e': 'late'}
                        self._miss_timing = timing_map[char]
                        self._label_state = 'magnitude'
                        print(f"  Timing: {self._miss_timing}")
                        print("  MISS — Magnitude?  [A] Undershoot  [S] Optimal  [D] Overshoot")

                elif self._label_state == 'magnitude':
                    if char in ('a', 's', 'd'):
                        mag_map = {'a': 'undershoot', 's': 'optimal', 'd': 'overshoot'}
                        miss_mag = mag_map[char]
                        print(f"  Magnitude: {miss_mag}")
                        if self._last_capture and self.learner:
                            info = self._last_capture
                            n = self.learner.add_sample(
                                info['displacement_px'],
                                info['angle_rad'],
                                info['range_m'],
                                info['trajectory'],
                                hit=False,
                                miss_timing=self._miss_timing,
                                miss_magnitude=miss_mag,
                            )
                            stats = self.learner.get_stats()
                            detail = f"{self._miss_timing} + {miss_mag}"
                            print(f"  Recorded: MISS ({detail})  -  "
                                  f"total {n} samples  "
                                  f"({stats['hits']} hits, {stats['misses']} misses)")
                        self._label_state = None
                        self._last_capture = None
                        self._miss_timing = None
            except Exception:
                import traceback
                traceback.print_exc()

        self._label_kbd = pynkeyboard.Listener(on_press=on_press)
        self._label_kbd.start()

    # ----------------------------------------------------------------
    #  Cleanup
    # ----------------------------------------------------------------

    def _quit(self):
        if self._train_click_listener:
            try:
                self._train_click_listener.stop()
            except Exception:
                pass
        if self._label_kbd:
            try:
                self._label_kbd.stop()
            except Exception:
                pass
        super()._quit()
