"""
HEAT AILOS-TORC Predictor entry-point
--------------------------------------
Runtime overlay that infers and replays correction trajectories using the
profile-selected ML dataset / attention weights.

Hotkeys (configured at first run; see config JSON):
    Ctrl+O        open image file
    Ctrl+L        lock / unlock (counter-translate mode)
    [tracking]    hold to track
    Ctrl+P        quit
"""

import argparse
import tkinter as tk
from loguru import logger

from overlay.ml.heat_ailos_torc.predictor.auto_overlay import AutoOverlay
from overlay.ml.heat_ailos_torc.profiles import MLProfile, default_profile_name, load_profile
from utils.hardware_inject_router import is_admin, connect, disconnect


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="HEAT AILOS-TORC Predictor (ML-assisted SACLOS overlay)")
    parser.add_argument("image", nargs="?", help="Path to overlay image (PNG/BMP)")
    parser.add_argument("--margins", nargs=2, type=int,
                        metavar=("HORIZONTAL", "VERTICAL"), default=[700, 400])
    parser.add_argument("--tracking-image", type=str, metavar="PATH")
    parser.add_argument("--setup-tracking-key", action="store_true")
    parser.add_argument("--range", type=float, default=70.0)
    parser.add_argument("--disable-correction", action="store_true")
    parser.add_argument("--correction-speed", type=float, default=1.0)
    parser.add_argument("--turret-speed", type=float, default=51.3)
    parser.add_argument("--instant-follow", type=float, default=15.0)
    parser.add_argument("--pixels-per-degree", type=float, default=10.0)
    parser.add_argument("--mouse-scale", type=float, default=1.0)
    parser.add_argument("--ml", action="store_true",
                        help="Enable ML-assisted correction using the selected profile")
    parser.add_argument("--ml-confidence", type=float, default=0.3)
    parser.add_argument("--config", type=str, default="heat_ailos_torc.json",
                        help="Overlay config filename under data/configs/")
    return parser


def main(profile: MLProfile | None = None, argv: list[str] | None = None) -> None:
    """Launch the predictor.

    Parameters
    ----------
    profile : MLProfile, optional
        Bundle of dataset / attention-weights / biases paths. Falls back to
        the registry default when omitted.
    argv : list[str], optional
        Argument vector (excluding program name) for argparse.
    """
    if profile is None:
        profile = load_profile(default_profile_name())

    args = _build_parser().parse_args(argv)

    if not is_admin():
        logger.warning(
            "Not running as Administrator! Windows UIPI may block SendInput "
            "events targeting elevated (admin) game windows."
        )

    connect()

    root = tk.Tk()
    app = AutoOverlay(
        root,
        image_path=args.image,
        tracking_image_path=args.tracking_image,
        margin_x=args.margins[0],
        margin_y=args.margins[1],
        config_filename=args.config,
        ml_profile=profile,
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
            from overlay.ml.heat_ailos_torc.trainer.correction_learner import CorrectionLearner
            app.ml_enabled = True
            app.ml_confidence_threshold = args.ml_confidence
            app.learner = CorrectionLearner(profile=profile)
            stats = app.learner.get_stats()
            logger.info(
                f"ML-ASSISTED CORRECTION ENABLED | profile={profile.name} "
                f"({profile.vehicle_label}) | "
                f"samples: {stats['total']} ({stats['hits']} hits, {stats['misses']} misses) | "
                f"confidence >= {args.ml_confidence:.0%}"
            )
            if stats['hits'] < 3:
                logger.warning("Need at least 3 hit samples for predictions! "
                               "Run trainer to collect training data.")
        except Exception as e:
            logger.error(f"ML init failed: {e}")
            app.ml_enabled = False

    if args.setup_tracking_key:
        app.tracking_key = None
        app.tracking_key_name = "Space"
        app.root.after(500, app._prompt_for_tracking_key)

    root.mainloop()
    disconnect()


if __name__ == "__main__":
    main()
