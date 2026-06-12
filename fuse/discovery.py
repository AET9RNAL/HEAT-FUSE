"""Plugin discovery for the FUSE mod loader.

Each plugin lives under ``fuse/plugins/<name>/`` (core built-in) or any
extra directory configured in ``fuse_host.json → extra_plugin_dirs``
(external / 3rd-party).  Every plugin directory must contain:

* ``manifest.json`` — required, shape:

  .. code-block:: json

      {
        "name":             "my_plugin",
        "version":          "1.0",
        "author":           "optional",
        "description":      "What it does.",
        "entry":            "plugin:MyPlugin",
        "min_host_version": "1.0",
        "dependencies":     [],
        "hotkeys":          {"toggle": "t"},
        "default_config":   {}
      }

* a Python module (``plugin.py`` by default) exposing the entry class.

``entry`` follows the ``"<module>:<ClassName>"`` convention; ``<module>``
is resolved relative to the plugin package for built-in plugins, or as a
top-level module (with the plugin's parent directory on ``sys.path``) for
external plugins.
"""
from __future__ import annotations

import importlib
import json
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional, Type

from loguru import logger

from fuse.api import FusePlugin

BUILTIN_PLUGINS_DIR = Path(__file__).resolve().parent / "plugins"


@dataclass(frozen=True)
class DiscoveredPlugin:
    name: str
    version: str
    description: str
    package: str       # dotted import path, e.g. "fuse.plugins.game_memory"
    package_dir: Path  # filesystem path to the plugin package directory
    cls: Type[FusePlugin]
    manifest: dict
    is_external: bool = False  # True when loaded from extra_plugin_dirs


def _load_manifest(plugin_dir: Path) -> Optional[dict]:
    manifest_path = plugin_dir / "manifest.json"
    if not manifest_path.exists():
        return None
    try:
        with open(manifest_path, "r") as f:
            return json.load(f)
    except Exception as e:
        logger.error(f"Bad manifest at {manifest_path}: {e}")
        return None


def _resolve_builtin_entry(package: str, entry: str) -> Type[FusePlugin]:
    module_name, _, class_name = entry.partition(":")
    if not class_name:
        raise ValueError(f"manifest 'entry' must be 'module:Class', got {entry!r}")
    full_module = f"{package}.{module_name}"
    module = importlib.import_module(full_module)
    cls = getattr(module, class_name)
    if not issubclass(cls, FusePlugin):
        raise TypeError(f"{full_module}:{class_name} is not a FusePlugin")
    return cls


def _resolve_external_entry(plugin_dir: Path, entry: str) -> Type[FusePlugin]:
    module_name, _, class_name = entry.partition(":")
    if not class_name:
        raise ValueError(f"manifest 'entry' must be 'module:Class', got {entry!r}")

    parent = str(plugin_dir.parent)
    pkg_name = plugin_dir.name
    full_module = f"{pkg_name}.{module_name}"

    if parent not in sys.path:
        sys.path.insert(0, parent)
        logger.debug(f"External plugin path added to sys.path: {parent}")

    module = importlib.import_module(full_module)
    cls = getattr(module, class_name)
    if not issubclass(cls, FusePlugin):
        raise TypeError(f"{full_module}:{class_name} is not a FusePlugin")
    return cls


def _scan_directory(
    directory: Path,
    *,
    is_external: bool,
    package_prefix: str = "",
) -> List[DiscoveredPlugin]:
    found: List[DiscoveredPlugin] = []
    if not directory.exists():
        logger.warning(f"Plugin directory missing: {directory}")
        return found

    for entry in sorted(directory.iterdir()):
        if not entry.is_dir() or entry.name.startswith((".", "_")):
            continue
        manifest = _load_manifest(entry)
        if manifest is None:
            continue
        name = manifest.get("name", entry.name)
        try:
            if is_external:
                cls = _resolve_external_entry(entry, manifest["entry"])
                package = entry.name
            else:
                package = f"{package_prefix}.{entry.name}" if package_prefix else entry.name
                cls = _resolve_builtin_entry(package, manifest["entry"])
        except Exception as e:
            logger.error(f"Skipping plugin {name!r}: {e}")
            continue

        cls.name = name
        cls.version = manifest.get("version", "0.0")
        cls.description = manifest.get("description", "")

        found.append(
            DiscoveredPlugin(
                name=name,
                version=cls.version,
                description=cls.description,
                package=package,
                package_dir=entry.resolve(),
                cls=cls,
                manifest=manifest,
                is_external=is_external,
            )
        )
        source = "external" if is_external else "built-in"
        logger.info(f"Discovered plugin ({source}): {name} v{cls.version}")

    return found


def discover(extra_dirs: Optional[List[Path]] = None) -> List[DiscoveredPlugin]:
    """Scan built-in and optional extra directories; return all valid plugins.

    *extra_dirs* — list of absolute :class:`~pathlib.Path` objects to external
    plugin root directories (each sub-directory is a plugin package).
    Populated from ``fuse_host.json → extra_plugin_dirs``.
    """
    found: List[DiscoveredPlugin] = []

    # Core / built-in plugins shipped with FUSE.
    found.extend(
        _scan_directory(
            BUILTIN_PLUGINS_DIR,
            is_external=False,
            package_prefix="fuse.plugins",
        )
    )

    # External / 3rd-party plugins.
    for ext_dir in (extra_dirs or []):
        ext_path = Path(ext_dir)
        found.extend(_scan_directory(ext_path, is_external=True))

    return found


__all__ = ["DiscoveredPlugin", "discover", "BUILTIN_PLUGINS_DIR"]
