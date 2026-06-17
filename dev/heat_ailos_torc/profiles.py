"""ML profile registry for HEAT AILOS-TORC.

A *profile* bundles the three persistent artefacts that fully parameterise
the ML pipeline for one vehicle / ammunition combination:

* ``dataset``      — JSONL training samples (manual + synthetic).
* ``attn_weights`` — learned per-time-bucket attention weights.
* ``biases``       — per-geometry correction biases (CorrectionSession).

Profiles are listed in ``data/ml/ml_profiles.json``. The active profile is
picked at startup by :mod:`run_heat_ailos_torc` and propagated to the
predictor / trainer / refiner main entry points.
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Dict, List

from loguru import logger

from fuse.utils.paths import (
    ML_PROFILES_REGISTRY,
    ML_PROFILES_DIR,
    resolve_data,
)


@dataclass(frozen=True)
class MLProfile:
    """Immutable bundle of paths describing one ML profile."""
    name: str
    label: str
    vehicle_label: str
    dataset: str        # absolute path
    attn_weights: str   # absolute path
    biases: str         # absolute path


def _read_registry() -> dict:
    if not ML_PROFILES_REGISTRY.exists():
        return {"default": None, "profiles": {}}
    with open(ML_PROFILES_REGISTRY, "r") as f:
        return json.load(f)


def _write_registry(data: dict) -> None:
    ML_PROFILES_REGISTRY.parent.mkdir(parents=True, exist_ok=True)
    with open(ML_PROFILES_REGISTRY, "w") as f:
        json.dump(data, f, indent=2)


def list_profiles() -> List[MLProfile]:
    """Return all registered profiles in registry order."""
    reg = _read_registry()
    out: List[MLProfile] = []
    for name, entry in reg.get("profiles", {}).items():
        out.append(
            MLProfile(
                name=name,
                label=entry.get("label", name),
                vehicle_label=entry.get("vehicle_label", name),
                dataset=resolve_data(entry["dataset"]),
                attn_weights=resolve_data(entry["attn_weights"]),
                biases=resolve_data(entry["biases"]),
            )
        )
    return out


def load_profile(name: str) -> MLProfile:
    """Return the profile by name, raising KeyError if absent."""
    for prof in list_profiles():
        if prof.name == name:
            return prof
    raise KeyError(f"Unknown ML profile: {name!r}")


def default_profile_name() -> str:
    """Return the name of the registry's default profile."""
    reg = _read_registry()
    default = reg.get("default")
    if not default:
        profs = reg.get("profiles", {})
        if not profs:
            raise RuntimeError(
                f"No ML profiles registered in {ML_PROFILES_REGISTRY}"
            )
        default = next(iter(profs))
    return default


def set_default(name: str) -> None:
    """Persist *name* as the registry default profile."""
    reg = _read_registry()
    if name not in reg.get("profiles", {}):
        raise KeyError(f"Unknown ML profile: {name!r}")
    reg["default"] = name
    _write_registry(reg)
    logger.info(f"ML default profile -> {name}")


def add_profile(
    name: str,
    label: str,
    vehicle_label: str,
    dataset: str,
    attn_weights: str,
    biases: str,
    make_default: bool = False,
) -> None:
    """Register a new profile (paths may be repo-relative)."""
    reg = _read_registry()
    profs: Dict[str, dict] = reg.setdefault("profiles", {})
    profs[name] = {
        "label": label,
        "vehicle_label": vehicle_label,
        "dataset": dataset,
        "attn_weights": attn_weights,
        "biases": biases,
    }
    if make_default or not reg.get("default"):
        reg["default"] = name
    _write_registry(reg)
    logger.info(f"ML profile registered: {name}")


__all__ = [
    "MLProfile",
    "list_profiles",
    "load_profile",
    "default_profile_name",
    "set_default",
    "add_profile",
    "ML_PROFILES_DIR",
]
