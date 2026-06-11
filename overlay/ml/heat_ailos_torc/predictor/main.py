"""
SACLOS Overlay with ML-Assisted Auto-Correction
-------------------------------------------------
  Ctrl+O        open image file
  Ctrl+L        lock / unlock (counter-translate mode)
  [Custom Key]  hold to track (configured on first run)
  Ctrl+P        quit

On first run, you'll be prompted to press a key to set as your tracking key.
To reconfigure the tracking key, use: --setup-tracking-key

Requirements:
    pip install pynput pillow
"""

import argparse
import tkinter as tk
from loguru import logger

from predictor.auto_overlay import AutoOverlay
from utils.hardware_inject_router import is_admin, connect, disconnect


def main():
    parser = argparse.ArgumentParser(description="SACLOS Overlay with bounded counter-translation")
    parser.add_argument("image", nargs="?", help="Path to overlay image (PNG/BMP)")
    parser.add_argument("--margins", nargs=2, type=int, metavar=("HORIZONTAL", "VERTICAL"),
                        default=[700, 400],
                        help="Movement margins in pixels (default: 700 400)")
    parser.add_argument("--tracking-image", type=str, metavar="PATH",
                        help="Optional separate image for tracking mode")
    parser.add_argument("--setup-tracking-key", action="store_true",
                        help="Prompt to reconfigure the tracking key")
    parser.add_argument("--range", type=float, default=70.0,
                        help="Range to target in meters (default: 70)")
    parser.add_argument("--disable-correction", action="store_true",
                        help="Disable auto-correction on tracking key release")
    parser.add_argument("--correction-speed", type=float, default=1.0,
                        help="Correction speed multiplier (default: 1.0)")
    parser.add_argument("--turret-speed", type=float, default=51.3,
                        help="Turret traverse speed in degrees/second (default: 51.3)")
    parser.add_argument("--instant-follow", type=float, default=15.0,
                        help="Turret instant-follow window in degrees (default: 15.0)")
    parser.add_argument("--pixels-per-degree", type=float, default=10.0,
                        help="Pixel to degree conversion factor (default: 10.0)")
    parser.add_argument("--mouse-scale", type=float, default=1.0,
                        help="Mouse sensitivity scale (default: 1.0)")
    # ML mode
    parser.add_argument("--ml", action="store_true",
                        help="Enable ML-assisted correction using saclos_ml_data.json")
    parser.add_argument("--ml-data", type=str, default="saclos_ml_data.json",
                        help="Path to ML training data file (default: saclos_ml_data.json)")
    parser.add_argument("--ml-confidence", type=float, default=0.3,
                        help="Minimum ML confidence threshold (default: 0.3)")
    args = parser.parse_args()

    # --- Admin elevation check ---
    if not is_admin():
        logger.warning(
            "Not running as Administrator! "
            "Windows UIPI will silently block SendInput events "
            "targeting elevated (admin) windows like fullscreen games. "
            "If mouse clicks / movements are ignored in-game, "
            "re-launch this script with 'Run as administrator'."
        )

    connect()

    root = tk.Tk()
    app = AutoOverlay(root, image_path=args.image,
                      tracking_image_path=args.tracking_image,
                      margin_x=args.margins[0], margin_y=args.margins[1])

    # Apply command-line overrides
    app.target_range_m = args.range
    if args.disable_correction:
        app.correction_enabled = False
    app.correction_speed_multiplier = args.correction_speed
    app.turret_traverse_speed_deg_s = args.turret_speed
    app.turret_instant_follow_deg = args.instant_follow
    app.pixels_per_degree = args.pixels_per_degree
    app.mouse_sensitivity_scale = args.mouse_scale

    # ML mode setup
    if args.ml:
        try:
            from trainer.correction_learner import CorrectionLearner
            app.ml_enabled = True
            app.ml_confidence_threshold = args.ml_confidence
            app.learner = CorrectionLearner(data_file=args.ml_data)
            stats = app.learner.get_stats()
            logger.info(
                f"ML-ASSISTED CORRECTION ENABLED | "
                f"Data file: {args.ml_data} | "
                f"Samples: {stats['total']} ({stats['hits']} hits, {stats['misses']} misses) | "
                f"Confidence: >={args.ml_confidence:.0%}"
            )
            if stats['hits'] < 3:
                logger.warning("Need at least 3 hit samples for predictions! "
                               "Run trainer to collect training data.")
        except ImportError:
            logger.error("Cannot import trainer.correction_learner.")
            app.ml_enabled = False
        except Exception as e:
            logger.error(f"Loading ML data: {e}")
            app.ml_enabled = False

    # Force tracking key setup if requested
    if args.setup_tracking_key:
        app.tracking_key = None
        app.tracking_key_name = "Space"
        app.root.after(500, app._prompt_for_tracking_key)

    root.mainloop()
    disconnect()


if __name__ == "__main__":
    main()
