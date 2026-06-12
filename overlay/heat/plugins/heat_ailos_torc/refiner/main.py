"""
HEAT AILOS-TORC Refiner entry-point
------------------------------------
Browse, visually edit, replay, and overwrite existing dataset records for
the active ML profile.
"""
import argparse
import json
import tkinter as tk
from loguru import logger

from overlay.heat.plugins.heat_ailos_torc.profiles import MLProfile, default_profile_name, load_profile
from overlay.heat.plugins.heat_ailos_torc.refiner.trajectory_editor import TrajectoryEditorWindow


def _load_samples(data_file):
    samples = []
    try:
        with open(data_file, 'r') as f:
            for line in f:
                line = line.strip()
                if line:
                    samples.append(json.loads(line))
    except FileNotFoundError:
        logger.warning(f"Data file not found: {data_file}")
    except Exception as e:
        logger.error(f"Error loading data: {e}")
    return samples


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="HEAT AILOS-TORC Refiner")
    parser.add_argument(
        "--data", type=str, default=None,
        help="Override path to JSONL training data file (defaults to active profile dataset)")
    return parser


def open_editor(
    root: "tk.Tk",
    profile: "MLProfile",
    data_file: str | None = None,
) -> "TrajectoryEditorWindow":
    """Load samples and open the trajectory editor. Caller is responsible for mainloop."""
    resolved = data_file or profile.dataset
    samples = _load_samples(resolved)
    if not samples:
        logger.error("No samples found. Nothing to refine.")
        return None

    logger.info(f"Loaded {len(samples)} records from {resolved} (profile: {profile.name})")
    root.withdraw()

    first_traj = samples[0].get("traj", [])
    editor = TrajectoryEditorWindow(
        root,
        trajectory=first_traj,
        context={
            "displacement_px": samples[0].get("disp", 0),
            "angle_rad": samples[0].get("angle", 0),
            "range_m": samples[0].get("range", 0),
        },
        record_index=0,
        mode="browse",
        all_samples=samples,
        data_file=resolved,
        on_discard=lambda: root.quit(),
    )
    return editor


def main(profile: MLProfile | None = None, argv: list[str] | None = None) -> None:
    if profile is None:
        profile = load_profile(default_profile_name())

    args = _build_parser().parse_args(argv)
    data_file = args.data or profile.dataset

    root = tk.Tk()
    editor = open_editor(root, profile, data_file=data_file)
    if editor is None:
        return

    def on_editor_destroy(event):
        if event.widget == editor:
            root.quit()

    editor.bind("<Destroy>", on_editor_destroy)

    root.mainloop()


if __name__ == "__main__":
    main()
