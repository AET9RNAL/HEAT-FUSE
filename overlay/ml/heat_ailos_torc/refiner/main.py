"""
SACLOS Trajectory Refiner — Standalone Browse Mode
---------------------------------------------------
Browse, visually edit, replay, and overwrite existing dataset records.

Usage:
    python run_refiner.py [--data saclos_ml_data.json]
"""

import argparse
import json
import tkinter as tk
from loguru import logger

from refiner.trajectory_editor import TrajectoryEditorWindow


def _load_samples(data_file):
    """Load all samples from a JSONL file."""
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


def main():
    parser = argparse.ArgumentParser(description="SACLOS Trajectory Refiner")
    parser.add_argument("--data", type=str, default="saclos_ml_data.json",
                        help="Path to JSONL training data file")
    args = parser.parse_args()

    samples = _load_samples(args.data)
    if not samples:
        logger.error("No samples found. Nothing to refine.")
        return

    logger.info(f"Loaded {len(samples)} records from {args.data}")

    root = tk.Tk()
    root.withdraw()

    # Open editor with the first record, in browse mode
    first_traj = samples[0].get('traj', [])
    editor = TrajectoryEditorWindow(
        root,
        trajectory=first_traj,
        context={
            'displacement_px': samples[0].get('disp', 0),
            'angle_rad': samples[0].get('angle', 0),
            'range_m': samples[0].get('range', 0),
        },
        record_index=0,
        mode='browse',
        all_samples=samples,
        data_file=args.data,
        on_discard=lambda: root.quit(),
    )

    # When editor closes, quit the app
    def on_editor_destroy(event):
        if event.widget == editor:
            root.quit()

    editor.bind("<Destroy>", on_editor_destroy)

    root.mainloop()


if __name__ == "__main__":
    main()
