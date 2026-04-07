"""
CorrectionSession — Stores per-geometry correction biases for rapid iteration.

Biases are parametric (timing_factor, magnitude_factor, time_shift) and
compound across iterations. They live in saclos_correction_biases.json,
completely separate from the training dataset. Supports checkpointing
with rollback.
"""

import json
import math
import os
import time

from loguru import logger


class CorrectionSession:
    """Manages correction biases per geometry region with checkpointing."""

    DEFAULT_RADIUS = 0.08
    DEFAULT_STEP = 0.15
    MAX_FACTOR = 10.0
    MIN_FACTOR = 0.05
    MIN_STEP = 0.02
    MAX_STEP = 0.50

    DEFAULT_SHIFT_STEP = 0.02   # 20 ms per tap
    MAX_TIME_SHIFT = 2.0        # ±2 s clamp
    MIN_SHIFT_STEP = 0.005
    MAX_SHIFT_STEP = 0.200

    def __init__(self, bias_file='saclos_correction_biases.json',
                 proximity_radius=None):
        self.bias_file = bias_file
        self.proximity_radius = proximity_radius or self.DEFAULT_RADIUS
        self.biases = []
        self._active_index = None
        self._load()

    # ---- persistence ----

    def _resolve_path(self):
        if self.bias_file is None:
            return None
        if os.path.isabs(self.bias_file):
            return self.bias_file
        base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        return os.path.join(base, self.bias_file)

    def _load(self):
        path = self._resolve_path()
        if path is None or not os.path.exists(path):
            self.biases = []
            return
        try:
            with open(path, 'r') as f:
                data = json.load(f)
            self.biases = data.get('biases', [])
        except Exception as e:
            logger.warning(f"Could not load correction biases: {e}")
            self.biases = []

    def save(self):
        path = self._resolve_path()
        if path is None:
            return  # in-memory mode — no persistence
        try:
            with open(path, 'w') as f:
                json.dump({'biases': self.biases}, f, indent=2)
        except Exception as e:
            logger.warning(f"Could not save correction biases: {e}")

    # ---- geometry helpers (mirrors CorrectionLearner._feature_vec) ----

    @staticmethod
    def _feature_vec(disp, range_m, angle_rad):
        return (
            disp / 300.0,
            range_m / 500.0,
            math.sin(angle_rad),
            math.cos(angle_rad),
        )

    @staticmethod
    def _feat_dist(a, b):
        return math.sqrt(sum((x - y) ** 2 for x, y in zip(a, b)))

    # ---- lookup / create ----

    def get_bias(self, displacement_px, angle_rad, range_m):
        """
        Find or create a bias entry for the given geometry.

        Returns (timing_factor, magnitude_factor, entry_index).
        Sets self._active_index for subsequent calls.
        """
        query = self._feature_vec(displacement_px, range_m, angle_rad)

        best_idx = None
        best_dist = float('inf')
        for i, entry in enumerate(self.biases):
            d = self._feat_dist(query, tuple(entry['feature_vec']))
            if d < best_dist:
                best_dist = d
                best_idx = i

        if best_idx is not None and best_dist <= self.proximity_radius:
            self._active_index = best_idx
            e = self.biases[best_idx]
            return e['timing_factor'], e['magnitude_factor'], best_idx

        # No nearby entry — create neutral
        entry = {
            'feature_vec': list(query),
            'timing_factor': 1.0,
            'magnitude_factor': 1.0,
            'time_shift': 0.0,
            'timing_step': self.DEFAULT_STEP,
            'magnitude_step': self.DEFAULT_STEP,
            'time_shift_step': self.DEFAULT_SHIFT_STEP,
            'iteration_count': 0,
            'phase': 'seeking_hit',
            'last_torc_quality': None,
            'checkpoints': [],
        }
        self.biases.append(entry)
        self._active_index = len(self.biases) - 1
        return 1.0, 1.0, self._active_index

    # ---- checkpointing ----

    def _checkpoint(self, entry, label=''):
        """Push current state to checkpoints before mutation."""
        entry['checkpoints'].append({
            'timing_factor': entry['timing_factor'],
            'magnitude_factor': entry['magnitude_factor'],
            'time_shift': entry.get('time_shift', 0.0),
            'timing_step': entry.get('timing_step', self.DEFAULT_STEP),
            'magnitude_step': entry.get('magnitude_step', self.DEFAULT_STEP),
            'time_shift_step': entry.get('time_shift_step', self.DEFAULT_SHIFT_STEP),
            'iteration': entry['iteration_count'],
            'timestamp': time.time(),
            'label': label,
        })

    def rollback(self, checkpoint_index):
        """Restore timing_factor and magnitude_factor from a checkpoint."""
        if self._active_index is None:
            return False
        e = self.biases[self._active_index]
        cps = e.get('checkpoints', [])
        if checkpoint_index < 0 or checkpoint_index >= len(cps):
            return False
        cp = cps[checkpoint_index]
        e['timing_factor'] = cp['timing_factor']
        e['magnitude_factor'] = cp['magnitude_factor']
        e['time_shift'] = cp.get('time_shift', 0.0)
        e['timing_step'] = cp.get('timing_step', self.DEFAULT_STEP)
        e['magnitude_step'] = cp.get('magnitude_step', self.DEFAULT_STEP)
        e['time_shift_step'] = cp.get('time_shift_step', self.DEFAULT_SHIFT_STEP)
        # Truncate checkpoints after rollback point, then re-checkpoint current
        e['checkpoints'] = cps[:checkpoint_index + 1]
        self.save()
        return True

    def get_history(self):
        """Return checkpoints list for the active entry."""
        if self._active_index is None:
            return []
        e = self.biases[self._active_index]
        return e.get('checkpoints', [])

    # ---- correction application ----

    def _clamp(self, val):
        return max(self.MIN_FACTOR, min(val, self.MAX_FACTOR))

    def apply_premature(self):
        """Trajectory arrived too early — stretch timing."""
        if self._active_index is None:
            return
        e = self.biases[self._active_index]
        step = e.get('timing_step', self.DEFAULT_STEP)
        self._checkpoint(e, 'premature')
        e['timing_factor'] = self._clamp(e['timing_factor'] * (1.0 + step))
        e['iteration_count'] += 1
        self.save()

    def apply_late(self):
        """Trajectory arrived too late — compress timing."""
        if self._active_index is None:
            return
        e = self.biases[self._active_index]
        step = e.get('timing_step', self.DEFAULT_STEP)
        self._checkpoint(e, 'late')
        e['timing_factor'] = self._clamp(e['timing_factor'] * (1.0 - step))
        e['iteration_count'] += 1
        self.save()

    def apply_delay(self):
        """Shift trajectory later in time (preserve dynamics)."""
        if self._active_index is None:
            return
        e = self.biases[self._active_index]
        step = e.get('time_shift_step', self.DEFAULT_SHIFT_STEP)
        self._checkpoint(e, 'delay')
        cur = e.get('time_shift', 0.0)
        e['time_shift'] = min(cur + step, self.MAX_TIME_SHIFT)
        e['iteration_count'] += 1
        self.save()

    def apply_advance(self):
        """Shift trajectory earlier in time (preserve dynamics)."""
        if self._active_index is None:
            return
        e = self.biases[self._active_index]
        step = e.get('time_shift_step', self.DEFAULT_SHIFT_STEP)
        self._checkpoint(e, 'advance')
        cur = e.get('time_shift', 0.0)
        e['time_shift'] = max(cur - step, -self.MAX_TIME_SHIFT)
        e['iteration_count'] += 1
        self.save()

    def apply_undershoot(self):
        """Not enough magnitude — increase displacement."""
        if self._active_index is None:
            return
        e = self.biases[self._active_index]
        step = e.get('magnitude_step', self.DEFAULT_STEP)
        self._checkpoint(e, 'undershoot')
        e['magnitude_factor'] = self._clamp(e['magnitude_factor'] * (1.0 + step))
        e['iteration_count'] += 1
        self.save()

    def apply_overshoot(self):
        """Too much magnitude — decrease displacement."""
        if self._active_index is None:
            return
        e = self.biases[self._active_index]
        step = e.get('magnitude_step', self.DEFAULT_STEP)
        self._checkpoint(e, 'overshoot')
        e['magnitude_factor'] = self._clamp(e['magnitude_factor'] * (1.0 - step))
        e['iteration_count'] += 1
        self.save()

    # ---- step size adjustment ----

    def adjust_timing_step(self, delta):
        """Adjust the timing correction step size."""
        if self._active_index is None:
            return
        e = self.biases[self._active_index]
        e['timing_step'] = max(self.MIN_STEP,
                               min(e.get('timing_step', self.DEFAULT_STEP) + delta,
                                   self.MAX_STEP))
        self.save()

    def adjust_magnitude_step(self, delta):
        """Adjust the magnitude correction step size."""
        if self._active_index is None:
            return
        e = self.biases[self._active_index]
        e['magnitude_step'] = max(self.MIN_STEP,
                                  min(e.get('magnitude_step', self.DEFAULT_STEP) + delta,
                                      self.MAX_STEP))
        self.save()

    def adjust_time_shift_step(self, delta):
        """Adjust the time shift step size."""
        if self._active_index is None:
            return
        e = self.biases[self._active_index]
        e['time_shift_step'] = max(
            self.MIN_SHIFT_STEP,
            min(e.get('time_shift_step', self.DEFAULT_SHIFT_STEP) + delta,
                self.MAX_SHIFT_STEP))
        self.save()

    def adjust_steps(self, delta):
        """Adjust all step sizes together."""
        self.adjust_timing_step(delta)
        self.adjust_magnitude_step(delta)
        self.adjust_time_shift_step(delta * 0.1)

    # ---- phase transitions ----

    def record_hit(self, torc_quality=None):
        """Record a HIT. Transitions to optimizing_torc phase."""
        if self._active_index is None:
            return
        e = self.biases[self._active_index]
        if e['phase'] == 'seeking_hit':
            e['phase'] = 'optimizing_torc'
        if torc_quality is not None:
            e['last_torc_quality'] = round(torc_quality, 4)
        self._checkpoint(e, 'hit')
        self.save()

    def clear_active(self):
        """Remove the active bias entry after user saves (converged)."""
        if self._active_index is not None and self._active_index < len(self.biases):
            del self.biases[self._active_index]
            self._active_index = None
            self.save()

    def get_active_entry(self):
        """Return the currently active bias entry dict, or None."""
        if self._active_index is not None and self._active_index < len(self.biases):
            return self.biases[self._active_index]
        return None

    # ---- trajectory bias application ----

    @staticmethod
    def apply_bias_to_trajectory(trajectory, timing_factor, magnitude_factor,
                                 time_shift=0.0):
        """
        Apply timing, magnitude, and time-shift bias to a trajectory.

        Order: scale time by timing_factor, then add time_shift.
        Negative shift advances the stroke; positive delays it.
        All t values are clamped to >= 0.
        Mutates in-place. Returns the same list.
        """
        for pt in trajectory:
            pt['t'] = max(0.0, pt['t'] * timing_factor + time_shift)
            pt['dx'] *= magnitude_factor
            pt['dy'] *= magnitude_factor
        return trajectory
