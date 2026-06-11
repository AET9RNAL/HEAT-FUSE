"""Plugin discovery for the universal HEAT overlay.

Each plugin lives under ``overlay/heat/plugins/<name>/`` and must contain:

* ``manifest.json`` — required, shape:

  .. code-block:: json

      {
        "name":        "energy_bar",
        "version":     "1.0",
        "description": "Energy scale OCR overlay.",
        "entry":       "plugin:EnergyBarPlugin",
        "hotkeys":     {"toggle_setup": "t"},
        "default_config": {...}
      }

* a Python module (``plugin.py`` by default) exposing the entry class.

``entry`` follows the ``"<module>:<ClassName>"`` convention; ``<module>``
is resolved relative to the plugin package.
"""
from __future__ import annotations

import importlib
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Type

from loguru import logger

from overlay.heat.plugin_api import HeatPlugin

PLUGINS_DIR = Path(__file__).resolve().parent / "plugins"


@dataclass(frozen=True)
class DiscoveredPlugin:
    name: str
    version: str
    description: str
    package: str          # e.g. "overlay.heat.plugins.energy_bar"
    cls: Type[HeatPlugin]
    manifest: dict


def _load_manifest(plugin_dir: Path) -> dict | None:
    manifest_path = plugin_dir / "manifest.json"
    if not manifest_path.exists():
        return None
    try:
        with open(manifest_path, "r") as f:
            return json.load(f)
    except Exception as e:
        logger.error(f"Bad manifest at {manifest_path}: {e}")
        return None


def _resolve_entry(package: str, entry: str) -> Type[HeatPlugin]:
    module_name, _, class_name = entry.partition(":")
    if not class_name:
        raise ValueError(f"manifest 'entry' must be 'module:Class', got {entry!r}")
    full_module = f"{package}.{module_name}"
    module = importlib.import_module(full_module)
    cls = getattr(module, class_name)
    if not issubclass(cls, HeatPlugin):
        raise TypeError(f"{full_module}:{class_name} is not a HeatPlugin")
    return cls


def discover() -> List[DiscoveredPlugin]:
    """Scan ``plugins/`` and return every valid plugin discovered."""
    found: List[DiscoveredPlugin] = []
    if not PLUGINS_DIR.exists():
        logger.warning(f"Plugins directory missing: {PLUGINS_DIR}")
        return found
    for entry in sorted(PLUGINS_DIR.iterdir()):
        if not entry.is_dir() or entry.name.startswith((".", "_")):
            continue
        manifest = _load_manifest(entry)
        if manifest is None:
            continue
        name = manifest.get("name", entry.name)
        package = f"overlay.heat.plugins.{entry.name}"
        try:
            cls = _resolve_entry(package, manifest["entry"])
        except Exception as e:
            logger.error(f"Skipping plugin {name!r}: {e}")
            continue
        # Decorate the class with manifest metadata.
        cls.name = name
        cls.version = manifest.get("version", "0.0")
        cls.description = manifest.get("description", "")
        found.append(
            DiscoveredPlugin(
                name=name,
                version=cls.version,
                description=cls.description,
                package=package,
                cls=cls,
                manifest=manifest,
            )
        )
        logger.info(f"Discovered plugin: {name} v{cls.version}")
    return found


__all__ = ["DiscoveredPlugin", "discover", "PLUGINS_DIR"]
