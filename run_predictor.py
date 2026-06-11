#!/usr/bin/env python
"""Launch the SACLOS overlay.

Shows a tank-picker dialog at startup, then dispatches to the chosen
tank-specific overlay. Pass --tank <id> to skip the picker.
"""
import argparse
import importlib
import sys

from tanks import TANKS, get_tank
from ui.tank_picker import show_tank_picker


def main():
    # Pull --tank out of argv ourselves so the chosen tank module can parse
    # its own remaining arguments without conflicts.
    tank_id = None
    remaining = []
    it = iter(sys.argv[1:])
    for a in it:
        if a == "--tank":
            tank_id = next(it, None)
        elif a.startswith("--tank="):
            tank_id = a.split("=", 1)[1]
        else:
            remaining.append(a)

    if tank_id is None:
        tank_id = show_tank_picker(TANKS)

    if not tank_id:
        print("No tank selected. Exiting.")
        return

    tank = get_tank(tank_id)
    if not tank:
        print(f"Unknown tank id: {tank_id}")
        return

    module = importlib.import_module(tank["module"])
    if not hasattr(module, "run"):
        print(f"Tank module {tank['module']} has no run() function.")
        return

    module.run(config_file=tank["config_file"], argv=remaining)


if __name__ == "__main__":
    main()
