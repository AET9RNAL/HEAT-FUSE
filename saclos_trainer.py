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

    # ---- persistence ----

    def _load(self):
        try:
            with open(self.data_file, 'r') as f:
                data = json.load(f)
                self.samples = data.get('samples', [])
        except (FileNotFoundError, json.JSONDecodeError):
            self.samples = []

    def _save(self):
        with open(self.data_file, 'w') as f:
            json.dump({'samples': self.samples}, f, indent=1)

    # ---- recording ----

    def add_sample(self, displacement_px, angle_rad, range_m,
                   trajectory, hit):
        """
        Add one manual-guidance sample with full mouse trajectory.

        trajectory: list of {'t': float, 'dx': int, 'dy': int}
                    where t is seconds since LMB click.
        """
        total_dx = sum(p['dx'] for p in trajectory)
        total_dy = sum(p['dy'] for p in trajectory)
        duration = trajectory[-1]['t'] if trajectory else 0.0

        self.samples.append({
            'disp':  round(displacement_px, 1),
            'angle': round(angle_rad, 4),
            'range': round(range_m, 1),
            'total_dx': total_dx,
            'total_dy': total_dy,
            'dur':   round(duration, 3),
            'traj':  trajectory,
            'hit':   hit,
        })
        self._save()
        return len(self.samples)

    # ---- prediction ----

    def predict(self, displacement_px, angle_rad, range_m):
        """
        KNN prediction from hit samples.

        Returns (trajectory, confidence) where trajectory is a list of
        {'t': float, 'dx': float, 'dy': float} entries,
        or (None, 0.0) if insufficient data.

        The returned trajectory is a displacement-scaled version of the
        nearest hit's trajectory, preserving the original timing/dynamics.
        """
        hits = [s for s in self.samples if s['hit'] and s.get('traj')]
        if len(hits) < 3:
            return None, 0.0

        # Normalise features for distance metric
        D_SCALE = 300.0   # typical displacement range in px
        R_SCALE = 500.0   # typical target-range span in m

        query = (
            displacement_px / D_SCALE,
            range_m / R_SCALE,
            math.sin(angle_rad),
            math.cos(angle_rad),
        )

        distances = []
        for i, s in enumerate(hits):
            feat = (
                s['disp'] / D_SCALE,
                s['range'] / R_SCALE,
                math.sin(s['angle']),
                math.cos(s['angle']),
            )
            dist = math.sqrt(sum((a - b) ** 2 for a, b in zip(query, feat)))
            distances.append((dist, i))

        distances.sort()

        # Use nearest hit's full trajectory as the base
        best_dist, best_idx = distances[0]
        best = hits[best_idx]
        base_traj = best['traj']

        # Scale the trajectory proportionally:
        # If query displacement is 120px and best sample was 80px,
        # scale all dx/dy by 120/80 = 1.5x to match the larger correction needed.
        base_disp = best['disp']
        if base_disp > 0:
            scale = displacement_px / base_disp
        else:
            scale = 1.0
        # Clamp scale to avoid extreme extrapolation
        scale = max(0.3, min(scale, 3.0))

        # Also need to rotate if the angle is different
        angle_diff = angle_rad - best['angle']
        cos_a = math.cos(angle_diff)
        sin_a = math.sin(angle_diff)

        scaled_traj = []
        for pt in base_traj:
            # Rotate then scale
            rdx = pt['dx'] * cos_a - pt['dy'] * sin_a
            rdy = pt['dx'] * sin_a + pt['dy'] * cos_a
            scaled_traj.append({
                't':  pt['t'],
                'dx': rdx * scale,
                'dy': rdy * scale,
            })

        # Confidence: sample density × proximity to nearest neighbour
        sample_factor    = min(1.0, len(hits) / 20.0)
        proximity_factor = max(0.0, 1.0 - best_dist * 2.0)
        confidence       = sample_factor * proximity_factor

        return scaled_traj, confidence

    # ---- stats ----

    def get_stats(self):
        total = len(self.samples)
        hits  = sum(1 for s in self.samples if s['hit'])
        return {'total': total, 'hits': hits, 'misses': total - hits}


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

        # Post-cycle labelling
        self._awaiting_label       = False
        self._last_capture         = None

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
        self._awaiting_label     = False

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

        print(f"  LMB!  d={self._train_disp_px:.1f}px  "
              f"n={math.degrees(self._train_disp_angle):.1f}\u00b0  "
              f"r={self._train_range:.0f}m   "
              f"- recording guidance ...")

    def _on_mouse_move(self, x, y):
        """Override: also accumulate timestamped raw deltas when recording."""
        if self._train_recording and self.last_mouse_x is not None:
            raw_dx = x - self.last_mouse_x
            raw_dy = y - self.last_mouse_y
            t = time.perf_counter() - self._train_start_time
            self._train_deltas.append({'t': round(t, 4), 'dx': raw_dx, 'dy': raw_dy})

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
            self._awaiting_label = True

        elif self.tracking_active and not self._train_lmb_detected:
            print("  Tracking ended  -  no LMB detected (nothing recorded)")

        # Reset training state
        self._train_recording    = False
        self._train_lmb_detected = False
        self._train_deltas       = []
        self._train_start_time   = None

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
                if not self._awaiting_label or char not in ('1', '2', '3'):
                    return

                if char == '3':
                    # Discard — don't save anything
                    print("  DISCARDED  (not saved)")
                else:
                    hit = (char == '1')
                    if self._last_capture and self.learner:
                        info = self._last_capture
                        n = self.learner.add_sample(
                            info['displacement_px'],
                            info['angle_rad'],
                            info['range_m'],
                            info['trajectory'],
                            hit,
                        )
                        stats = self.learner.get_stats()
                        tag = 'HIT' if hit else 'MISS'
                        print(f"  Recorded: {tag}  -  "
                              f"total {n} samples  "
                              f"({stats['hits']} hits, {stats['misses']} misses)")

                self._awaiting_label = False
                self._last_capture   = None
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
