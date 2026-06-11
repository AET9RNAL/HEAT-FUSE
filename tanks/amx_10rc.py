"""AMX-10RC overlay launcher. Wraps the existing AutoOverlay predictor."""
import argparse
import tkinter as tk
from loguru import logger

from predictor.auto_overlay import AutoOverlay
from utils.hardware_inject_router import is_admin, connect, disconnect
from utils.config import ConfigManager


def run(config_file="saclos_config.json", argv=None):
    """Launch the AMX-10RC predictor overlay."""
    parser = argparse.ArgumentParser(description="AMX-10RC SACLOS Overlay")
    parser.add_argument("image", nargs="?", help="Path to overlay image (PNG/BMP)")
    parser.add_argument("--margins", nargs=2, type=int, metavar=("HORIZONTAL", "VERTICAL"),
                        default=[700, 400])
    parser.add_argument("--tracking-image", type=str, metavar="PATH")
    parser.add_argument("--setup-tracking-key", action="store_true")
    parser.add_argument("--range", type=float, default=70.0)
    parser.add_argument("--disable-correction", action="store_true")
    parser.add_argument("--correction-speed", type=float, default=1.0)
    parser.add_argument("--turret-speed", type=float, default=51.3)
    parser.add_argument("--instant-follow", type=float, default=15.0)
    parser.add_argument("--pixels-per-degree", type=float, default=10.0)
    parser.add_argument("--mouse-scale", type=float, default=1.0)
    parser.add_argument("--ml", action="store_true")
    parser.add_argument("--ml-data", type=str, default="saclos_ml_data.json")
    parser.add_argument("--ml-confidence", type=float, default=0.3)
    args = parser.parse_args(argv)

    if not is_admin():
        logger.warning(
            "Not running as Administrator! Windows UIPI may block SendInput "
            "events targeting elevated game windows."
        )

    connect()

    root = tk.Tk()
    app = AutoOverlay(
        root,
        image_path=args.image,
        tracking_image_path=args.tracking_image,
        margin_x=args.margins[0],
        margin_y=args.margins[1],
        config_filename=config_file,
    )

    app.target_range_m = args.range
    if args.disable_correction:
        app.correction_enabled = False
    app.correction_speed_multiplier = args.correction_speed
    app.turret_traverse_speed_deg_s = args.turret_speed
    app.turret_instant_follow_deg = args.instant_follow
    app.pixels_per_degree = args.pixels_per_degree
    app.mouse_sensitivity_scale = args.mouse_scale

    if args.ml:
        try:
            from trainer.correction_learner import CorrectionLearner
            app.ml_enabled = True
            app.ml_confidence_threshold = args.ml_confidence
            app.learner = CorrectionLearner(data_file=args.ml_data)
            stats = app.learner.get_stats()
            logger.info(
                f"ML-ASSISTED CORRECTION ENABLED | Samples: {stats['total']} "
                f"({stats['hits']} hits, {stats['misses']} misses)"
            )
        except Exception as e:
            logger.error(f"ML init failed: {e}")
            app.ml_enabled = False

    if args.setup_tracking_key:
        app.tracking_key = None
        app.tracking_key_name = "Space"
        app.root.after(500, app._prompt_for_tracking_key)

    root.mainloop()
    disconnect()
