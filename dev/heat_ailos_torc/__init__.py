"""HEAT AILOS-TORC — ML-driven SACLOS guidance pipeline (FUSE plugin).

Sub-packages:

* ``predictor`` — runtime overlay that infers correction trajectories.
* ``trainer``   — supervised data collection + on-line attention learning.
* ``refiner``   — interactive trajectory editor for dataset curation.

Each mode is profile-aware: the active dataset / attention weights / biases
triple is selected at startup via :mod:`heat_ailos_torc.profiles`.
"""

import importlib.resources

#: Traversable root of the plugin's assets/ directory.
#: Works for both filesystem (pathlib.Path) and .fuse ZIP (zipfile.Path) loading.
ASSETS_DIR = importlib.resources.files(__package__) / "assets"

from .profiles import (  # noqa: F401, E402
    MLProfile,
    list_profiles,
    load_profile,
    default_profile_name,
    set_default,
)
