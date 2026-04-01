"""
SACLOS Training Data Generator
-------------------------------
Generates ML training data by recording your manual missile guidance.

Usage:
    python saclos_trainer.py crosshair.png [--tracking-image tracking.png]

Workflow:
    1. Lock overlay (Ctrl+L twice as usual)
    2. Set range with R key (range finder)
    3. Hold tracking key - aim at target
    4. Click LMB (fire missile) - displacement captured automatically
    5. Guide missile with mouse swipe - recorded
    6. Release tracking key - summary shown
    7. Press [1] Hit  or  [2] Miss  to save the sample

Training data is saved to saclos_ml_data.json
Use this data later with saclos_overlay_auto.py for ML-assisted auto-correction.

Keys during gameplay:
    [1] after capture  -  Label as HIT
    [2] after capture  -  Label as MISS
    Ctrl+P             -  Quit
"""

import os
import json
import math
import time
import argparse
import threading
import random
import tkinter as tk

try:
    from pynput import mouse as pynmouse, keyboard as pynkeyboard
    PYNPUT_OK = True
except ImportError:
    PYNPUT_OK = False

from saclos_overlay_auto import SACLOSOverlay


# ======================================================================
#  CorrectionLearner  -  KNN regression on human guidance data
# ======================================================================

class CorrectionLearner:
    """Stores human-guided missile correction trajectories and predicts via KNN."""

    def __init__(self, data_file='saclos_ml_data.json', k=5):
        self.data_file = data_file
        self.k = k
        self.samples = []
        self._load()

    # ---- persistence (JSONL — one JSON object per line, append-only) ----

    def _load(self):
        try:
            with open(self.data_file, 'r') as f:
                content = f.read().strip()
                if not content:
                    # Empty file
                    self.samples = []
                    return
                
                try:
                    # Try to parse the entire file as a single JSON entity
                    data = json.loads(content)
                    if isinstance(data, dict) and 'samples' in data:
                        self.samples = data['samples']
                        self._rewrite_jsonl()
                        return
                    elif isinstance(data, list):
                        self.samples = data
                        self._rewrite_jsonl()
                        return
                    elif isinstance(data, dict):
                         # Just one JSON object (i.e. single line JSONL file parsed as monolithic)
                         self.samples = [data]
                         return
                except json.JSONDecodeError:
                    # Failed single parse -> must be multi-line JSONL
                    pass

                self.samples = []
                for line in content.split('\n'):
                    line = line.strip()
                    if line:
                        self.samples.append(json.loads(line))
        except FileNotFoundError:
            self.samples = []

    def _rewrite_jsonl(self):
        """Rewrite entire file as JSONL (used only for migration or --reset)."""
        with open(self.data_file, 'w') as f:
            for sample in self.samples:
                f.write(json.dumps(sample, separators=(',', ':')) + '\n')

    def _save_append(self, sample):
        """Append a single sample as one JSONL line — O(1) regardless of file size."""
        with open(self.data_file, 'a') as f:
            f.write(json.dumps(sample, separators=(',', ':')) + '\n')

    # ---- recording ----

    def add_sample(self, displacement_px, angle_rad, range_m,
                   trajectory, hit, miss_timing=None, miss_magnitude=None):
        """
        Add one manual-guidance sample with full mouse trajectory.

        trajectory: list of {'t': float, 'dx': int, 'dy': int}
                    where t is seconds since LMB click.
        miss_timing: 'premature'|'optimal'|'late' (misses only)
        miss_magnitude: 'undershoot'|'optimal'|'overshoot' (misses only)
        """
        total_dx = sum(p['dx'] for p in trajectory)
        total_dy = sum(p['dy'] for p in trajectory)
        duration = trajectory[-1]['t'] if trajectory else 0.0

        sample = {
            'disp':  round(displacement_px, 1),
            'angle': round(angle_rad, 4),
            'range': round(range_m, 1),
            'total_dx': total_dx,
            'total_dy': total_dy,
            'dur':   round(duration, 3),
            'traj':  trajectory,
            'hit':   hit,
        }
        # Store rich labels for misses (enables directed correction in predict())
        if not hit:
            if miss_timing:
                sample['miss_timing'] = miss_timing
            if miss_magnitude:
                sample['miss_magnitude'] = miss_magnitude

        self.samples.append(sample)
        self._save_append(sample)
        return len(self.samples)

    # ---- helpers ----

    @staticmethod
    def _feature_vec(disp, range_m, angle_rad):
        D_SCALE = 300.0   # typical displacement range in px
        R_SCALE = 500.0   # typical target-range span in m
        return (
            disp / D_SCALE,
            range_m / R_SCALE,
            math.sin(angle_rad),
            math.cos(angle_rad),
        )

    @staticmethod
    def _feat_dist(a, b):
        return math.sqrt(sum((x - y) ** 2 for x, y in zip(a, b)))

    def _transform_traj(self, sample, query_disp, query_angle):
        """Scale + rotate a sample's trajectory to match query displacement/angle."""
        base_disp = sample['disp']
        scale = (query_disp / base_disp) if base_disp > 0 else 1.0
        scale = max(0.3, min(scale, 3.0))

        angle_diff = query_angle - sample['angle']
        cos_a = math.cos(angle_diff)
        sin_a = math.sin(angle_diff)

        out = []
        for pt in sample['traj']:
            rdx = pt['dx'] * cos_a - pt['dy'] * sin_a
            rdy = pt['dx'] * sin_a + pt['dy'] * cos_a
            out.append({'t': pt['t'], 'dx': rdx * scale, 'dy': rdy * scale})
        return out

    # ---- prediction ----

    def predict(self, displacement_px, angle_rad, range_m):
        """
        K-NN prediction with miss-aware confidence and trajectory nudge.

        1. K-NN weighted average: top-K hits weighted by 1/distance produce
           a blended trajectory that's more robust than single-nearest.
        2. Miss-penalized confidence: nearby misses reduce confidence,
           preventing predictions in high-failure regions.
        3. Miss-repelled nudge: if nearby misses exist, the prediction is
           pushed away from miss trajectories toward hit trajectories.

        Returns (trajectory, confidence) or (None, 0.0).
        """
        hits   = [s for s in self.samples if s['hit'] and s.get('traj')]
        misses = [s for s in self.samples if not s['hit'] and s.get('traj')]

        if len(hits) < 3:
            return None, 0.0

        query_feat = self._feature_vec(displacement_px, range_m, angle_rad)

        # --- distance to every hit ---
        hit_dists = []
        for i, s in enumerate(hits):
            d = self._feat_dist(query_feat,
                    self._feature_vec(s['disp'], s['range'], s['angle']))
            hit_dists.append((d, i))
        hit_dists.sort()

        # --- distance to every miss ---
        miss_dists = []
        for i, s in enumerate(misses):
            d = self._feat_dist(query_feat,
                    self._feature_vec(s['disp'], s['range'], s['angle']))
            miss_dists.append((d, i))
        miss_dists.sort()

        # ============================================================
        #  1.  K-NN weighted-average trajectory  (inverse-distance)
        # ============================================================
        k = min(self.k, len(hits))
        top_k = hit_dists[:k]

        EPS = 1e-6
        weights = [1.0 / (d + EPS) for d, _ in top_k]
        w_sum   = sum(weights)

        # Use the nearest hit's trajectory as the timeline template
        # (all neighbors are resampled onto this timeline).
        base_traj = hits[top_k[0][1]]['traj']
        n_pts     = len(base_traj)

        # Accumulate weighted dx/dy for each time-point
        blended = [{'t': base_traj[j]['t'], 'dx': 0.0, 'dy': 0.0}
                    for j in range(n_pts)]

        for wi, (_, idx) in zip(weights, top_k):
            transformed = self._transform_traj(
                hits[idx], displacement_px, angle_rad)
            # Resample transformed traj onto base timeline length
            t_len = len(transformed)
            for j in range(n_pts):
                # Map j in base → proportional index in this neighbor
                src_j = int(j * t_len / n_pts)
                src_j = min(src_j, t_len - 1)
                blended[j]['dx'] += wi / w_sum * transformed[src_j]['dx']
                blended[j]['dy'] += wi / w_sum * transformed[src_j]['dy']

        # ============================================================
        #  2.  Miss-repelled trajectory nudge
        # ============================================================
        MISS_RADIUS = 0.35   # feature-space radius to consider misses
        NUDGE_STRENGTH = 0.3 # fraction of (hit−miss) delta to apply

        nearby_misses = [(d, i) for d, i in miss_dists if d < MISS_RADIUS]

        if nearby_misses:
            # Compute total correction vector of the blended prediction
            pred_total_dx = sum(p['dx'] for p in blended)
            pred_total_dy = sum(p['dy'] for p in blended)

            # Weighted-average miss correction vector (transformed to query)
            miss_wx = 0.0
            miss_wy = 0.0
            miss_wt = 0.0
            for d, idx in nearby_misses:
                mw = 1.0 / (d + EPS)
                mt = self._transform_traj(
                    misses[idx], displacement_px, angle_rad)
                miss_wx += mw * sum(p['dx'] for p in mt)
                miss_wy += mw * sum(p['dy'] for p in mt)
                miss_wt += mw

            if miss_wt > 0:
                miss_avg_dx = miss_wx / miss_wt
                miss_avg_dy = miss_wy / miss_wt

                # Nudge direction: hit prediction − miss average
                nudge_dx = (pred_total_dx - miss_avg_dx) * NUDGE_STRENGTH
                nudge_dy = (pred_total_dy - miss_avg_dy) * NUDGE_STRENGTH

                # Distribute the nudge proportionally across all points
                if n_pts > 0:
                    for j in range(n_pts):
                        blended[j]['dx'] += nudge_dx / n_pts
                        blended[j]['dy'] += nudge_dy / n_pts

        # ============================================================
        #  3.  Label-directed correction / exploration fallback
        # ============================================================
        # When nearby misses carry rich labels (timing, magnitude),
        # apply systematic adjustments instead of random perturbation.
        # A single labeled miss gives ~5-10x more signal than binary.
        nearby_hits_count = sum(1 for d, _ in hit_dists if d < MISS_RADIUS)
        nearby_miss_count = len(nearby_misses)

        labeled_misses = [(d, i) for d, i in nearby_misses
                          if misses[i].get('miss_timing') or misses[i].get('miss_magnitude')]

        if labeled_misses and n_pts > 0:
            # --- Timing adjustment ---
            # premature -> stretch timeline (corrections happen later)
            # late      -> compress timeline (corrections happen earlier)
            timing_weights = []
            for d, idx in labeled_misses:
                timing = misses[idx].get('miss_timing')
                if timing and timing != 'optimal':
                    w = 1.0 / (d + EPS)
                    factor = 1.20 if timing == 'premature' else 0.80
                    timing_weights.append((w, factor))

            if timing_weights:
                total_w = sum(w for w, _ in timing_weights)
                timing_factor = sum(w * f for w, f in timing_weights) / total_w
                timing_factor = max(0.5, min(timing_factor, 2.0))
                for j in range(n_pts):
                    blended[j]['t'] *= timing_factor

            # --- Magnitude adjustment ---
            # overshoot  -> scale down dx/dy
            # undershoot -> scale up dx/dy
            mag_weights = []
            for d, idx in labeled_misses:
                magnitude = misses[idx].get('miss_magnitude')
                if magnitude and magnitude != 'optimal':
                    w = 1.0 / (d + EPS)
                    factor = 0.82 if magnitude == 'overshoot' else 1.18
                    mag_weights.append((w, factor))

            if mag_weights:
                total_w = sum(w for w, _ in mag_weights)
                mag_factor = sum(w * f for w, f in mag_weights) / total_w
                mag_factor = max(0.5, min(mag_factor, 2.0))
                for j in range(n_pts):
                    blended[j]['dx'] *= mag_factor
                    blended[j]['dy'] *= mag_factor

        elif nearby_miss_count > nearby_hits_count and n_pts > 0:
            # Fallback: no rich labels -> original random exploration
            # (backwards compatible with old unlabeled data)
            miss_ratio = nearby_miss_count / (nearby_miss_count + nearby_hits_count + EPS)
            pred_total_dx = sum(p['dx'] for p in blended)
            pred_total_dy = sum(p['dy'] for p in blended)
            pred_len = math.sqrt(pred_total_dx**2 + pred_total_dy**2) + EPS
            explore_mag = pred_len * 0.15 * miss_ratio

            theta = random.uniform(0, 2 * math.pi)
            explore_dx = explore_mag * math.cos(theta)
            explore_dy = explore_mag * math.sin(theta)

            for j in range(n_pts):
                blended[j]['dx'] += explore_dx / n_pts
                blended[j]['dy'] += explore_dy / n_pts

        # ============================================================
        #  4.  Confidence  (informational — no longer gates prediction)
        # ============================================================
        best_hit_dist = hit_dists[0][0]

        sample_factor    = min(1.0, len(hits) / 20.0)
        proximity_factor = max(0.0, 1.0 - best_hit_dist * 2.0)

        miss_penalty = 1.0
        if miss_dists:
            nearest_miss_dist = miss_dists[0][0]
            if nearest_miss_dist < best_hit_dist:
                miss_penalty = 0.2 + 0.3 * (nearest_miss_dist / (best_hit_dist + EPS))
                miss_penalty = min(miss_penalty, 1.0)
            elif nearest_miss_dist < MISS_RADIUS:
                miss_penalty = 0.7 + 0.3 * (nearest_miss_dist / MISS_RADIUS)

        confidence = sample_factor * proximity_factor * miss_penalty

        return blended, confidence

    # ---- stats ----

    def get_stats(self):
        total = len(self.samples)
        hits  = sum(1 for s in self.samples if s['hit'])
        misses = total - hits
        labeled = sum(1 for s in self.samples
                      if not s['hit'] and (s.get('miss_timing') or s.get('miss_magnitude')))
        return {'total': total, 'hits': hits, 'misses': misses, 'labeled_misses': labeled}


# ======================================================================
#  TrainingOverlay  -  subclass that records manual guidance
# ======================================================================

class TrainingOverlay(SACLOSOverlay):
    """
    Same overlay as the production script, but:
      - auto-correction is DISABLED
      - LMB click during tracking captures the displacement snapshot
      - mouse movement after LMB is recorded as the guidance vector
      - on tracking-key release the user labels the result (1/2)
    """

    def __init__(self, root, *args, **kwargs):
        super().__init__(root, *args, **kwargs)

        # Disable auto-correction in training mode
        self.correction_enabled = False

        # ML learner
        self.learner = CorrectionLearner()

        # Training-cycle state  (reset every tracking cycle)
        self._train_click_listener = None
        self._train_recording      = False
        self._train_lmb_detected   = False
        self._train_disp_px        = None
        self._train_disp_angle     = None
        self._train_range          = None
        self._train_deltas         = []     # [{'t': float, 'dx': int, 'dy': int}, ...]
        self._train_start_time     = None
        self._train_last_x         = None   # Per-event delta tracking for trajectory recording
        self._train_last_y         = None

        # Post-cycle labelling (two-step state machine)
        # States: None -> 'outcome' -> 'timing' -> 'magnitude' -> None
        self._label_state          = None
        self._last_capture         = None
        self._miss_timing          = None

        # Start an extra keyboard listener for the 1 / 2 label keys
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
        # Clear any pending label from previous cycle
        self._train_recording    = False
        self._train_lmb_detected = False
        self._train_deltas       = []
        self._train_start_time   = None
        self._train_last_x       = None
        self._train_last_y       = None
        self._label_state        = None

        super()._start_tracking()

        if self.tracking_active and PYNPUT_OK:
            # Spin up a passive click listener for LMB detection
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

        # Compute displacement from overlay centre to origin
        tw = self.tracking_win_x
        if tw is not None and self.origin_x is not None:
            cx = tw + self.img_w / 2
            cy = self.tracking_win_y + self.img_h / 2
        elif self.origin_x is not None:
            cx = self.win_x + self.img_w / 2
            cy = self.win_y + self.img_h / 2
        else:
            return  # origin not set yet

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
                'trajectory':      self._train_deltas,  # full timestamped path
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

        # Parent handles listener shutdown + overlay reset.
        # correction_enabled=False ensures no auto-correction fires.
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
                        # HIT — save immediately
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
                        # MISS — proceed to timing step
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


# ======================================================================
#  Main
# ======================================================================

def main():
    parser = argparse.ArgumentParser(
        description="SACLOS Training Data Generator")
    parser.add_argument("image", nargs="?",
                        help="Path to overlay image (PNG/BMP)")
    parser.add_argument("--margins", nargs=2, type=int,
                        metavar=("HORIZONTAL", "VERTICAL"),
                        default=[700, 400])
    parser.add_argument("--tracking-image", type=str, metavar="PATH",
                        help="Separate image shown while tracking")
    parser.add_argument("--setup-tracking-key", action="store_true",
                        help="Re-prompt for tracking key binding")
    parser.add_argument("--range", type=float, default=200.0,
                        help="Initial range to target in metres (default 200)")
    parser.add_argument("--mouse-scale", type=float, default=1.0,
                        help="Mouse sensitivity scale (default 1.0)")
    parser.add_argument("--reset", action="store_true",
                        help="Delete training data and start fresh")
    parser.add_argument("--stats", action="store_true",
                        help="Print training data statistics and exit")
    args = parser.parse_args()

    # --reset : wipe the ML data file
    if args.reset:
        if os.path.exists('saclos_ml_data.json'):
            os.remove('saclos_ml_data.json')
            print("Training data deleted.")
        else:
            print("No training data file found.")
        if not args.image and not args.stats:
            return

    # --stats : print statistics and exit
    if args.stats:
        learner = CorrectionLearner()
        stats = learner.get_stats()
        print(f"Training data: {stats['total']} samples  "
              f"({stats['hits']} hits, {stats['misses']} misses)")
        if stats['total'] > 0:
            ranges = {}
            for s in learner.samples:
                r = int(s['range'])
                if r not in ranges:
                    ranges[r] = {'total': 0, 'hits': 0}
                ranges[r]['total'] += 1
                if s['hit']:
                    ranges[r]['hits'] += 1
            print("\nBy range:")
            for r in sorted(ranges):
                info = ranges[r]
                pct = info['hits'] / info['total'] * 100 if info['total'] > 0 else 0
                print(f"  {r:>4d}m : {info['total']:>3d} samples, "
                      f"{info['hits']:>3d} hits ({pct:.0f}%)")
        return

    root = tk.Tk()
    app = TrainingOverlay(
        root,
        image_path=args.image,
        tracking_image_path=args.tracking_image,
        margin_x=args.margins[0],
        margin_y=args.margins[1],
    )

    app.target_range_m = args.range
    app.mouse_sensitivity_scale = args.mouse_scale

    if args.setup_tracking_key:
        app.tracking_key = None
        app.tracking_key_name = "Space"
        app.root.after(500, app._prompt_for_tracking_key)

    root.mainloop()


if __name__ == "__main__":
    main()
