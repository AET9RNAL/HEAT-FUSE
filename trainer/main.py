"""
SACLOS Training Data Generator
-------------------------------
Generates ML training data by recording your manual missile guidance.

Usage:
    python -m trainer.main crosshair.png [--tracking-image tracking.png]

Workflow:
    1. Lock overlay (Ctrl+L twice as usual)
    2. Set range with R key (range finder)
    3. Hold tracking key - aim at target
    4. Click LMB (fire missile) - displacement captured automatically
    5. Guide missile with mouse swipe - recorded
    6. Release tracking key - summary shown
    7. Press [1] Hit  or  [2] Miss  to save the sample
"""

import os
import argparse
import tkinter as tk

from trainer.training_overlay import TrainingOverlay
from trainer.correction_learner import CorrectionLearner


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
