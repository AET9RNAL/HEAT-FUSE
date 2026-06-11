"""HEAT AILOS-TORC — ML-driven SACLOS guidance pipeline.

Sub-packages:

* ``predictor`` — runtime overlay that infers correction trajectories.
* ``trainer``   — supervised data collection + on-line attention learning.
* ``refiner``   — interactive trajectory editor for dataset curation.

Each mode is profile-aware: the active dataset / attention weights / biases
triple is selected at startup via :mod:`overlay.ml.heat_ailos_torc.profiles`.
"""

from pathlib import Path

#: Vertical-local assets (HUD images, calibration BDC, sounds). Owned by
#: this package — neither the universal HEAT core nor ``utils/`` know about
#: the file names here.
ASSETS_DIR: Path = Path(__file__).resolve().parent / "assets"

from .profiles import (  # noqa: F401, E402
    MLProfile,
    list_profiles,
    load_profile,
    default_profile_name,
    set_default,
)
