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

from heat_ailos_torc.profiles import (
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


def _build_picker_dialog(
    parent: "tk.Misc",
    profiles: List[MLProfile],
    default_name: str,
    result: dict,
) -> None:
    """Populate *parent* (a Tk root or Toplevel) with the profile/mode picker UI.

    Writes ``{"profile": name, "mode": mode}`` into *result* on launch,
    or leaves it empty on cancel.  The caller is responsible for any
    ``mainloop()`` / ``wait_window()`` call.
    """
    parent.title("HEAT AILOS-TORC")
    parent.configure(bg="#0a0a0a")
    parent.resizable(False, False)
    try:
        parent.attributes("-topmost", True)
    except Exception:
        pass

    style = ttk.Style(parent)
    try:
        style.theme_use("clam")
    except Exception:
        pass

    tk.Label(
        parent, text="HEAT AILOS-TORC",
        bg="#0a0a0a", fg="#77ffaa",
        font=("Montserrat", 14, "bold"),
        padx=20,
    ).pack(pady=(16, 4))
    tk.Label(
        parent, text="Select ML profile and mode",
        bg="#0a0a0a", fg="#888",
        font=("Montserrat", 9),
        padx=20,
    ).pack(pady=(0, 12))

    prof_frame = tk.LabelFrame(
        parent, text=" ML Profile ",
        bg="#0a0a0a", fg="#ffaa00",
        font=("Montserrat", 9, "bold"),
        padx=16, pady=8,
    )
    prof_frame.pack(fill=tk.X, padx=20, pady=4)

    selected_profile = tk.StringVar(value=default_name)
    for prof in profiles:
        tk.Radiobutton(
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
        ).pack(fill=tk.X, anchor="w")

    mode_frame = tk.LabelFrame(
        parent, text=" Mode ",
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
        tk.Radiobutton(
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
        ).pack(fill=tk.X, anchor="w")

    btn_frame = tk.Frame(parent, bg="#0a0a0a")
    btn_frame.pack(fill=tk.X, padx=20, pady=(12, 16))

    def on_launch():
        result["profile"] = selected_profile.get()
        result["mode"] = selected_mode.get()
        parent.destroy()

    def on_cancel():
        parent.destroy()

    tk.Button(
        btn_frame, text="Launch", command=on_launch,
        bg="#003322", fg="#77ffaa",
        activebackground="#004433", activeforeground="#aaffcc",
        font=("Montserrat", 10, "bold"), relief=tk.FLAT,
        padx=20, pady=6,
    ).pack(side=tk.RIGHT, padx=(8, 0))

    tk.Button(
        btn_frame, text="Cancel", command=on_cancel,
        bg="#221111", fg="#ff8888",
        activebackground="#331818", activeforeground="#ffaaaa",
        font=("Montserrat", 10), relief=tk.FLAT,
        padx=20, pady=6,
    ).pack(side=tk.RIGHT)

    parent.bind("<Return>", lambda e: on_launch())
    parent.bind("<Escape>", lambda e: on_cancel())

    parent.update_idletasks()
    sw = parent.winfo_screenwidth()
    sh = parent.winfo_screenheight()
    w = parent.winfo_reqwidth()
    h = parent.winfo_reqheight()
    parent.geometry(f"+{(sw - w) // 2}+{(sh - h) // 2}")


def _show_picker(profiles: List[MLProfile],
                 default_name: str) -> Optional[Tuple[str, str]]:
    """Standalone Tk dialog. Returns (profile_name, mode) or None on cancel."""
    result: dict = {}
    root = tk.Tk()
    _build_picker_dialog(root, profiles, default_name, result)
    root.mainloop()
    if "profile" not in result:
        return None
    return result["profile"], result["mode"]


def _dispatch(profile: MLProfile, mode: str, argv: list[str]) -> None:
    if mode == "predictor":
        from heat_ailos_torc.predictor.main import main as run_mode
    elif mode == "trainer":
        from heat_ailos_torc.trainer.main import main as run_mode
    elif mode == "refiner":
        from heat_ailos_torc.refiner.main import main as run_mode
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
