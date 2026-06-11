"""HEAT AILOS-TORC startup runner.

Presents a small Tk picker so the user can choose:

1. an **ML profile** (vehicle-keyed dataset / weights / biases triple),
2. a **mode** — Predictor, Trainer, or Refiner.

The selected profile is persisted as the registry default and the chosen
mode is invoked with the profile injected. Pass ``--profile`` to skip the
profile picker; pass ``--mode`` to skip the mode picker.
"""
from __future__ import annotations

import argparse
import sys
import tkinter as tk
from tkinter import ttk
from typing import List, Optional, Tuple

from loguru import logger

from overlay.ml.heat_ailos_torc.profiles import (
    MLProfile,
    default_profile_name,
    list_profiles,
    load_profile,
    set_default,
)


MODES = ("predictor", "trainer", "refiner")


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="HEAT AILOS-TORC launcher — pick ML profile + mode")
    parser.add_argument("--profile", type=str,
                        help="Skip picker; use this registered profile name.")
    parser.add_argument("--mode", choices=MODES,
                        help="Skip picker; launch this mode directly.")
    return parser, parser.parse_known_args


def _show_picker(profiles: List[MLProfile],
                 default_name: str) -> Optional[Tuple[str, str]]:
    """Tk dialog. Returns (profile_name, mode) or None on cancel."""
    result: dict = {}

    root = tk.Tk()
    root.title("HEAT AILOS-TORC")
    root.configure(bg="#0a0a0a")
    root.resizable(False, False)
    try:
        root.attributes("-topmost", True)
    except Exception:
        pass

    style = ttk.Style(root)
    try:
        style.theme_use("clam")
    except Exception:
        pass

    header = tk.Label(
        root, text="HEAT AILOS-TORC",
        bg="#0a0a0a", fg="#77ffaa",
        font=("Montserrat", 14, "bold"),
        padx=20,
    )
    header.pack(pady=(16, 4))
    subhdr = tk.Label(
        root, text="Select ML profile and mode",
        bg="#0a0a0a", fg="#888",
        font=("Montserrat", 9),
        padx=20,
    )
    subhdr.pack(pady=(0, 12))

    # ---- Profile picker ----
    prof_frame = tk.LabelFrame(
        root, text=" ML Profile ",
        bg="#0a0a0a", fg="#ffaa00",
        font=("Montserrat", 9, "bold"),
        padx=16, pady=8,
    )
    prof_frame.pack(fill=tk.X, padx=20, pady=4)

    selected_profile = tk.StringVar(value=default_name)
    for prof in profiles:
        rb = tk.Radiobutton(
            prof_frame,
            text=f"{prof.label}  —  {prof.vehicle_label}",
            variable=selected_profile,
            value=prof.name,
            bg="#0a0a0a", fg="#dddddd",
            selectcolor="#1a1a1a",
            activebackground="#0a0a0a",
            activeforeground="#77ffaa",
            font=("Montserrat", 9),
            anchor="w",
        )
        rb.pack(fill=tk.X, anchor="w")

    # ---- Mode picker ----
    mode_frame = tk.LabelFrame(
        root, text=" Mode ",
        bg="#0a0a0a", fg="#ffaa00",
        font=("Montserrat", 9, "bold"),
        padx=16, pady=8,
    )
    mode_frame.pack(fill=tk.X, padx=20, pady=4)

    selected_mode = tk.StringVar(value="predictor")
    mode_descriptions = {
        "predictor": "Predictor   —  Live ML-assisted SACLOS overlay",
        "trainer":   "Trainer     —  Record manual guidance samples",
        "refiner":   "Refiner     —  Browse / edit existing samples",
    }
    for mode in MODES:
        rb = tk.Radiobutton(
            mode_frame,
            text=mode_descriptions[mode],
            variable=selected_mode,
            value=mode,
            bg="#0a0a0a", fg="#dddddd",
            selectcolor="#1a1a1a",
            activebackground="#0a0a0a",
            activeforeground="#77ffaa",
            font=("Courier", 9),
            anchor="w",
        )
        rb.pack(fill=tk.X, anchor="w")

    # ---- Buttons ----
    btn_frame = tk.Frame(root, bg="#0a0a0a")
    btn_frame.pack(fill=tk.X, padx=20, pady=(12, 16))

    def on_launch():
        result["profile"] = selected_profile.get()
        result["mode"] = selected_mode.get()
        root.destroy()

    def on_cancel():
        root.destroy()

    launch_btn = tk.Button(
        btn_frame, text="Launch", command=on_launch,
        bg="#003322", fg="#77ffaa",
        activebackground="#004433", activeforeground="#aaffcc",
        font=("Montserrat", 10, "bold"), relief=tk.FLAT,
        padx=20, pady=6,
    )
    launch_btn.pack(side=tk.RIGHT, padx=(8, 0))

    cancel_btn = tk.Button(
        btn_frame, text="Cancel", command=on_cancel,
        bg="#221111", fg="#ff8888",
        activebackground="#331818", activeforeground="#ffaaaa",
        font=("Montserrat", 10), relief=tk.FLAT,
        padx=20, pady=6,
    )
    cancel_btn.pack(side=tk.RIGHT)

    root.bind("<Return>", lambda e: on_launch())
    root.bind("<Escape>", lambda e: on_cancel())

    root.update_idletasks()
    sw = root.winfo_screenwidth()
    sh = root.winfo_screenheight()
    w = root.winfo_reqwidth()
    h = root.winfo_reqheight()
    root.geometry(f"+{(sw - w) // 2}+{(sh - h) // 2}")

    root.mainloop()

    if "profile" not in result:
        return None
    return result["profile"], result["mode"]


def _dispatch(profile: MLProfile, mode: str, argv: list[str]) -> None:
    if mode == "predictor":
        from overlay.ml.heat_ailos_torc.predictor.main import main as run_mode
    elif mode == "trainer":
        from overlay.ml.heat_ailos_torc.trainer.main import main as run_mode
    elif mode == "refiner":
        from overlay.ml.heat_ailos_torc.refiner.main import main as run_mode
    else:
        raise ValueError(f"unknown mode {mode!r}")
    logger.info(f"HEAT AILOS-TORC | mode={mode} | profile={profile.name} "
                f"({profile.vehicle_label})")
    run_mode(profile=profile, argv=argv)


def main(argv: list[str] | None = None) -> None:
    parser, _ = _build_parser()
    args, remaining = parser.parse_known_args(argv)

    profiles = list_profiles()
    if not profiles:
        logger.error("No ML profiles registered in data/ml/ml_profiles.json")
        sys.exit(1)

    default_name = args.profile or default_profile_name()
    if not any(p.name == default_name for p in profiles):
        logger.warning(f"Unknown profile {default_name!r}; falling back to "
                       f"first registered profile.")
        default_name = profiles[0].name

    if args.profile and args.mode:
        choice = (args.profile, args.mode)
    else:
        choice = _show_picker(profiles, default_name)
        if choice is None:
            logger.info("Cancelled.")
            return

    profile_name, mode = choice
    profile = load_profile(profile_name)
    set_default(profile_name)
    _dispatch(profile, mode, remaining)


if __name__ == "__main__":
    main()
