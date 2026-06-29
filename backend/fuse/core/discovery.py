"""Plugin discovery for the FUSE mod loader.

All plugins — core and user — are loaded exclusively from ``.fuse`` ZIP
archives.  Drop a ``<plugin_id>-<version>.fuse`` file into any of the scanned
directories and FUSE will import it directly via Python's built-in zipimport
machinery — no extraction needed.

Scanned root:

1. ``USER_PLUGINS_DIR``  — single directory for all plugins (core + user)
   Set via ``FUSE_USER_PLUGINS_DIR`` env var in production (userData/plugins).
   Falls back to ``<repo>/plugins`` in dev.

Every plugin must have a ``manifest.json`` inside its archive:

.. code-block:: json

    {
      "plugin_id":             "my_plugin",
      "name":                  "My Plugin",
      "version":               "1.0",
      "author":                "optional",
      "description":           "What it does.",
      "entry":                 "plugin:MyPlugin",
      "tags":                  [],
      "dependencies":          [],
      "optional_dependencies": [],
      "hotkeys":               {"toggle": "t"},
      "default_config":        {}
    }

``entry`` follows the ``"<module>:<ClassName>"`` convention.
"""
from __future__ import annotations

import importlib
import json
import os
import sys
import zipfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Optional, Type

from loguru import logger

from fuse.core.api import FusePlugin
from fuse.utils.paths import REPO_ROOT

BUILTIN_PLUGINS_DIR: Path = Path(__file__).resolve().parent.parent / "plugins"

_env_user_plugins = os.environ.get("FUSE_USER_PLUGINS_DIR")
USER_PLUGINS_DIR: Path = Path(_env_user_plugins) if _env_user_plugins else REPO_ROOT / "plugins"


@dataclass(frozen=True)
class DiscoveredPlugin:
    plugin_id: str      # programmatic identifier — used for config files, deps, enable/disable
    name: str           # display name shown in UI and logs
    version: str
    description: str
    package: str        # dotted import path, e.g. "fuse.plugins.game_memory"
    package_dir: Path   # for built-ins: the package dir; for .fuse: the archive path
    package_root: object  # Traversable: pathlib.Path for built-ins, zipfile.Path for .fuse
    cls: Type[FusePlugin]
    manifest: dict
    author: str = ""
    homepage: str = ""
    tags: list = field(default_factory=list)
    is_core: bool = False


# ---------------------------------------------------------------------------
# .fuse archive loading
# ---------------------------------------------------------------------------

def _load_fuse_manifest(archive: zipfile.ZipFile, plugin_id: str) -> Optional[dict]:
    entry = f"{plugin_id}/manifest.json"
    try:
        with archive.open(entry) as f:
            return json.load(f)
    except Exception as e:
        logger.error(f"Bad manifest inside archive at {entry!r}: {e}")
        return None


def _resolve_fuse_entry(plugin_id: str, entry: str) -> Type[FusePlugin]:
    """Import entry class from a package already on sys.path (zipimport)."""
    module_name, _, class_name = entry.partition(":")
    if not class_name:
        raise ValueError(f"manifest 'entry' must be 'module:Class', got {entry!r}")
    full_module = f"{plugin_id}.{module_name}"
    module = importlib.import_module(full_module)
    cls = getattr(module, class_name)
    if not issubclass(cls, FusePlugin):
        raise TypeError(f"{full_module}:{class_name} is not a FusePlugin")
    return cls


def _scan_fuse_archives(directory: Path) -> List[DiscoveredPlugin]:
    """Scan *directory* for ``*.fuse`` archives and discover plugins within them."""
    found: List[DiscoveredPlugin] = []
    if not directory.exists():
        return found

    for fuse_path in sorted(directory.glob("*.fuse")):
        if not fuse_path.is_file():
            continue

        try:
            archive = zipfile.ZipFile(fuse_path, "r")
        except zipfile.BadZipFile:
            logger.warning(f"Skipping {fuse_path.name}: not a valid ZIP archive")
            continue

        names = archive.namelist()
        top_dirs = {n.split("/")[0] for n in names if "/" in n}
        if len(top_dirs) != 1:
            logger.warning(
                f"Skipping {fuse_path.name}: expected 1 top-level dir, "
                f"got {len(top_dirs)}: {top_dirs}"
            )
            archive.close()
            continue

        plugin_id = next(iter(top_dirs))
        manifest = _load_fuse_manifest(archive, plugin_id)
        if manifest is None:
            archive.close()
            continue

        declared_id = manifest.get("plugin_id", plugin_id)
        if declared_id != plugin_id:
            logger.warning(
                f"{fuse_path.name}: manifest plugin_id={declared_id!r} "
                f"differs from archive root dir={plugin_id!r} — using archive root"
            )

        # Add .fuse archive to sys.path so Python's zipimport can find the package.
        fuse_str = str(fuse_path)
        if fuse_str not in sys.path:
            sys.path.insert(0, fuse_str)
            logger.debug(f"Added to sys.path: {fuse_path.name}")

        name = manifest.get("name", plugin_id)
        try:
            cls = _resolve_fuse_entry(plugin_id, manifest["entry"])
        except Exception as e:
            logger.error(f"Skipping .fuse plugin {plugin_id!r}: {e}")
            archive.close()
            continue

        cls.name = name
        cls.version = manifest.get("version", "0.0")
        cls.description = manifest.get("description", "")

        # zipfile.Path rooted at plugin_id/ — ZipFile stays open for process lifetime.
        package_root = zipfile.Path(archive, plugin_id + "/")

        found.append(
            DiscoveredPlugin(
                plugin_id=plugin_id,
                name=name,
                version=cls.version,
                description=cls.description,
                package=plugin_id,
                package_dir=fuse_path,
                package_root=package_root,
                cls=cls,
                manifest=manifest,
                author=manifest.get("author", ""),
                homepage=manifest.get("homepage", ""),
                tags=manifest.get("tags", []),
                is_core=manifest.get("core", False),
            )
        )
        logger.info(
            f"Discovered plugin (.fuse): {name} [{plugin_id}] v{cls.version}"
        )

    return found


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def discover() -> List[DiscoveredPlugin]:
    """Scan the single plugins directory and return every valid plugin found.

    All plugins (core and user) live in ``USER_PLUGINS_DIR``. Core plugins
    are distinguished by ``"core": true`` in their manifest and loaded
    first by the resolver.
    """
    return _scan_fuse_archives(USER_PLUGINS_DIR)


__all__ = ["DiscoveredPlugin", "discover", "BUILTIN_PLUGINS_DIR", "USER_PLUGINS_DIR"]
