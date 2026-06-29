"""Centralised filesystem path resolution.

All persistent data lives under ``<repo>/data``:

* ``data/configs/`` — overlay + plugin runtime configs (JSON).
* ``data/ml/``      — ML profile registry and per-profile datasets/weights.

Modules should resolve paths through this module instead of hand-rolling
``os.path.dirname(__file__)`` chains so that the layout can be changed in one
place.
"""
import os
from pathlib import Path

# fuse/utils/paths.py  →  parent = fuse/utils/, parent.parent = fuse/, parent.parent.parent = repo root
REPO_ROOT: Path = Path(__file__).resolve().parent.parent.parent

_env_data_dir = os.environ.get("FUSE_DATA_DIR")
DATA_DIR: Path = Path(_env_data_dir) if _env_data_dir else REPO_ROOT / "data"
CONFIGS_DIR: Path = DATA_DIR / "configs"
ML_DIR: Path = DATA_DIR / "ml"
ML_PROFILES_DIR: Path = ML_DIR / "profiles"
ML_PROFILES_REGISTRY: Path = ML_DIR / "ml_profiles.json"
LOGS_DIR: Path = DATA_DIR / "logs"

# NOTE: there is no global ASSETS_DIR. Each vertical / plugin owns its own
# `assets/` subdirectory next to its package, so the universal core never
# needs to know about plugin-specific media.


def resolve_config(filename: str) -> str:
    """Resolve a bare config filename to ``data/configs/<filename>``.

    Absolute paths or paths containing a directory separator are returned
    unchanged so callers can still pass explicit paths.
    """
    if os.path.isabs(filename) or os.sep in filename or "/" in filename:
        return filename
    return str(CONFIGS_DIR / filename)


def resolve_data(path: str) -> str:
    """Resolve a repo-relative data path (e.g. from ``ml_profiles.json``)."""
    if os.path.isabs(path):
        return path
    return str(REPO_ROOT / path)


__all__ = [
    "REPO_ROOT",
    "DATA_DIR",
    "CONFIGS_DIR",
    "ML_DIR",
    "ML_PROFILES_DIR",
    "ML_PROFILES_REGISTRY",
    "LOGS_DIR",
    "resolve_config",
    "resolve_data",
]