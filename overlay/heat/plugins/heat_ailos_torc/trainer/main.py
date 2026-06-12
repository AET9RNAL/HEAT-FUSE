"""
HEAT AILOS-TORC Trainer entry-point
------------------------------------
Generates ML training data by recording your manual missile guidance.

Workflow:
    1. Lock overlay (Ctrl+L twice as usual)
    2. Set range with R key (range finder)
    3. Hold tracking key — aim at target
    4. Click LMB (fire missile) — displacement captured automatically
    5. Guide missile with mouse swipe — recorded
    6. Release tracking key — summary shown
    7. Press [1] Hit or [2] Miss to save the sample

The active dataset / weights / biases triple is selected via the ML profile
registry. Defaults to the registry default profile when none is supplied.
"""
import argparse
import os
import tkinter as tk

from loguru import logger

from overlay.heat.plugins.heat_ailos_torc.profiles import MLProfile, default_profile_name, load_profile
from overlay.heat.plugins.heat_ailos_torc.trainer.training_overlay import TrainingOverlay
from overlay.heat.plugins.heat_ailos_torc.trainer.correction_learner import CorrectionLearner
from fuse.utils.hardware_inject_router import connect, disconnect


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="HEAT AILOS-TORC Trainer")
    parser.add_argument("image", nargs="?", help="Path to overlay image (PNG/BMP)")
    parser.add_argument("--margins", nargs=2, type=int,
                        metavar=("HORIZONTAL", "VERTICAL"), default=[700, 400])
    parser.add_argument("--tracking-image", type=str, metavar="PATH")
    parser.add_argument("--setup-tracking-key", action="store_true")
    parser.add_argument("--range", type=float, default=70.0)
    parser.add_argument("--mouse-scale", type=float, default=1.0)
    parser.add_argument("--reset", action="store_true",
                        help="Delete training data for the active profile and start fresh")
    parser.add_argument("--stats", action="store_true",
                        help="Print training data statistics and exit")
    parser.add_argument("--config", type=str, default="heat_ailos_torc.json",
                        help="Overlay config filename under data/configs/")
    return parser


def open_overlay(
    root: "tk.Tk",
    profile: "MLProfile",
    fuse_config=None,
    cfg_filename: str = "heat_ailos_torc.json",
) -> TrainingOverlay:
    """Create and return the training overlay. Caller is responsible for mainloop."""
    return TrainingOverlay(
        root,
        config_filename=cfg_filename,
        ml_profile=profile,
        fuse_config=fuse_config,
    )


def main(profile: MLProfile | None = None, argv: list[str] | None = None) -> None:
    if profile is None:
        profile = load_profile(default_profile_name())

    args = _build_parser().parse_args(argv)

    if args.reset:
        if os.path.exists(profile.dataset):
            os.remove(profile.dataset)
            logger.info(f"Training data deleted: {profile.dataset}")
        else:
            logger.info(f"No training data file at {profile.dataset}.")
        if not args.image and not args.stats:
            return

    if args.stats:
        learner = CorrectionLearner(profile=profile)
        stats = learner.get_stats()
        logger.info(f"Profile: {profile.name} ({profile.vehicle_label}) — "
                    f"{stats['total']} samples ({stats['hits']} hits, {stats['misses']} misses)")
        if stats['total'] > 0:
            ranges = {}
            for s in learner.samples:
                r = int(s['range'])
                bin_ = ranges.setdefault(r, {'total': 0, 'hits': 0})
                bin_['total'] += 1
                if s['hit']:
                    bin_['hits'] += 1
            for r in sorted(ranges):
                info = ranges[r]
                pct = info['hits'] / info['total'] * 100 if info['total'] > 0 else 0
                logger.info(f"{r:>4d}m : {info['total']:>3d} samples, "
                            f"{info['hits']:>3d} hits ({pct:.0f}%)")
        return

    connect()

    root = tk.Tk()
    app = open_overlay(root, profile, cfg_filename=args.config)
    app.target_range_m = args.range
    app.mouse_sensitivity_scale = args.mouse_scale

    if args.setup_tracking_key:
        app.tracking_key = None
        app.tracking_key_name = "Space"
        app.root.after(500, app._prompt_for_tracking_key)

    root.mainloop()
    disconnect()


if __name__ == "__main__":
    main()
