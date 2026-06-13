"""Plugin discovery for the FUSE mod loader.

Each plugin lives under one of three scanned roots:

* ``fuse/plugins/<name>/``        — core built-in plugins shipped with FUSE
* ``<repo>/plugins/<name>/``      — standard user drop-in directory (zero config)
* ``FUSE_PLUGIN_DIRS`` env var    — colon/semicolon-separated extra paths
* ``extra_plugin_dirs`` arg       — caller-supplied (from fuse_host.json / launcher)

Every plugin directory must contain:

* ``manifest.json`` — required, shape:

  .. code-block:: json

      {
        "name":                 "my_plugin",
        "version":              "1.0",
        "author":               "optional",
        "homepage":             "optional",
        "tags":                 [],
        "description":          "What it does.",
        "entry":                "plugin:MyPlugin",
        "min_host_version":     "1.0",
        "dependencies":         ["other_plugin"],
        "optional_dependencies":[],
        "hotkeys":              {"toggle": "t"},
        "default_config":       {}
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
import os
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Optional, Type

from loguru import logger

from fuse.api import FusePlugin
from fuse.utils.paths import REPO_ROOT

BUILTIN_PLUGINS_DIR: Path = Path(__file__).resolve().parent / "plugins"
USER_PLUGINS_DIR: Path = REPO_ROOT / "plugins"


@dataclass(frozen=True)
class DiscoveredPlugin:
    plugin_id: str      # programmatic identifier — used for config files, deps, enable/disable
    name: str           # display name shown in UI and logs
    version: str
    description: str
    package: str        # dotted import path, e.g. "fuse.plugins.game_memory"
    package_dir: Path   # filesystem path to the plugin package directory
    cls: Type[FusePlugin]
    manifest: dict
    is_external: bool = False  # True when loaded from outside fuse/plugins/
    author: str = ""
    homepage: str = ""
    tags: list = field(default_factory=list)


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

    parent = str(plugin_dir.resolve().parent)
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
        plugin_id = manifest.get("plugin_id", entry.name)
        name = manifest.get("name", plugin_id)
        try:
            if is_external:
                cls = _resolve_external_entry(entry, manifest["entry"])
                package = entry.name
            else:
                package = f"{package_prefix}.{entry.name}" if package_prefix else entry.name
                cls = _resolve_builtin_entry(package, manifest["entry"])
        except Exception as e:
            logger.error(f"Skipping plugin {plugin_id!r}: {e}")
            continue

        cls.name = name
        cls.version = manifest.get("version", "0.0")
        cls.description = manifest.get("description", "")

        found.append(
            DiscoveredPlugin(
                plugin_id=plugin_id,
                name=name,
                version=cls.version,
                description=cls.description,
                package=package,
                package_dir=entry.resolve(),
                cls=cls,
                manifest=manifest,
                is_external=is_external,
                author=manifest.get("author", ""),
                homepage=manifest.get("homepage", ""),
                tags=manifest.get("tags", []),
            )
        )
        source = "external" if is_external else "built-in"
        logger.info(f"Discovered plugin ({source}): {name} [{plugin_id}] v{cls.version}")

    return found


def discover(extra_dirs: Optional[List[Path]] = None) -> List[DiscoveredPlugin]:
    """Scan all plugin sources and return every valid plugin found.

    Scan order (earlier sources take precedence on name collision):

    1. ``fuse/plugins/``           — built-in core plugins
    2. ``<repo>/plugins/``         — user drop-in directory (zero config)
    3. ``FUSE_PLUGIN_DIRS`` env    — colon/semicolon-separated paths
    4. *extra_dirs*                 — caller-supplied (fuse_host.json / launcher)
    """
    found: List[DiscoveredPlugin] = []

    # 1. Core built-in plugins shipped with FUSE.
    found.extend(
        _scan_directory(
            BUILTIN_PLUGINS_DIR,
            is_external=False,
            package_prefix="fuse.plugins",
        )
    )

    # 2. Standard user drop-in directory — no config needed.
    if USER_PLUGINS_DIR.exists():
        found.extend(_scan_directory(USER_PLUGINS_DIR, is_external=True))

    # 3. FUSE_PLUGIN_DIRS environment variable.
    env_dirs = os.environ.get("FUSE_PLUGIN_DIRS", "")
    for raw in (p.strip() for p in env_dirs.replace(";", ":").split(":") if p.strip()):
        found.extend(_scan_directory(Path(raw), is_external=True))

    # 4. Caller-supplied extra directories (fuse_host.json / launcher script).
    for ext_dir in (extra_dirs or []):
        found.extend(_scan_directory(Path(ext_dir), is_external=True))

    return found


__all__ = ["DiscoveredPlugin", "discover", "BUILTIN_PLUGINS_DIR", "USER_PLUGINS_DIR"]
