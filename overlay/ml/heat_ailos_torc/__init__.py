"""HEAT AILOS-TORC — ML-driven SACLOS guidance pipeline.

Sub-packages:

* ``predictor`` — runtime overlay that infers correction trajectories.
* ``trainer``   — supervised data collection + on-line attention learning.
* ``refiner``   — interactive trajectory editor for dataset curation.

Each mode is profile-aware: the active dataset / attention weights / biases
triple is selected at startup via :mod:`overlay.ml.heat_ailos_torc.profiles`.
"""

from .profiles import (  # noqa: F401
    MLProfile,
    list_profiles,
    load_profile,
    default_profile_name,
    set_default,
)
