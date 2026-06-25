"""Packing and verification utilities for the .fuse plugin archive format.

A .fuse file is a standard ZIP archive with the plugin's package at the root:

    heat_ailos_torc.fuse (ZIP):
      heat_ailos_torc/
        manifest.json
        __init__.py
        plugin.py
        assets/
          ...

This layout puts the plugin's package directory directly inside the archive,
which is the convention required by Python's built-in zipimport machinery.
"""
from __future__ import annotations

import json
import zipfile
from pathlib import Path

from loguru import logger

_EXCLUDE_PARTS = frozenset({"__pycache__", ".git", ".venv", ".mypy_cache"})
_EXCLUDE_SUFFIXES = (".pyc", ".pyo", ".pyd")  # tuple — required by str.endswith


def _excluded(rel: Path) -> bool:
    return any(
        p in _EXCLUDE_PARTS or p.endswith(_EXCLUDE_SUFFIXES)
        for p in rel.parts
    )


def pack(plugin_dir: Path | str, out_dir: Path | str | None = None) -> Path:
    """Create a ``.fuse`` archive from a plugin folder.

    The archive root will contain a single subfolder named after the plugin's
    ``plugin_id`` (from ``manifest.json``), which is required for Python's
    zipimport to find the package.

    Args:
        plugin_dir: Path to the plugin folder (must contain ``manifest.json``).
        out_dir:    Output directory. Defaults to ``plugin_dir.parent``.

    Returns:
        Path to the created ``<plugin_id>-<version>.fuse`` file.
    """
    plugin_dir = Path(plugin_dir).resolve()
    manifest_path = plugin_dir / "manifest.json"
    if not manifest_path.exists():
        raise FileNotFoundError(f"manifest.json not found in {plugin_dir}")

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    plugin_id   = manifest.get("plugin_id", plugin_dir.name)
    plugin_name = manifest.get("name", plugin_id).replace(" ", "")
    version     = manifest.get("version", "0.0")

    if out_dir is None:
        from fuse.utils.paths import REPO_ROOT
        out_dir = REPO_ROOT / "out"
    out_dir = Path(out_dir).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"{plugin_name}-{version}.fuse"

    with zipfile.ZipFile(out_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for file_path in sorted(plugin_dir.rglob("*")):
            if file_path.is_dir():
                continue
            rel = file_path.relative_to(plugin_dir)
            if _excluded(rel):
                continue
            arc_name = f"{plugin_id}/{rel.as_posix()}"
            zf.write(file_path, arc_name)

    logger.info(f"pack: created {out_path.name} ({out_path.stat().st_size // 1024} KB)")
    return out_path


def verify(fuse_path: Path | str) -> bool:
    """Validate the structure of a ``.fuse`` archive.

    Checks:
    1. Valid ZIP file.
    2. Exactly one top-level directory inside the archive.
    3. That directory contains ``manifest.json``.
    4. ``manifest.json`` is valid JSON with a required ``entry`` field.

    Returns True if valid, False otherwise (logs warnings on each failure).
    """
    fuse_path = Path(fuse_path)
    try:
        with zipfile.ZipFile(fuse_path) as zf:
            names = zf.namelist()
            if not names:
                logger.warning(f"verify: {fuse_path.name} is empty")
                return False

            top_dirs = {n.split("/")[0] for n in names if "/" in n}
            if len(top_dirs) != 1:
                logger.warning(
                    f"verify: {fuse_path.name} — expected 1 top-level dir, "
                    f"got {len(top_dirs)}: {top_dirs}"
                )
                return False

            plugin_id = next(iter(top_dirs))
            manifest_entry = f"{plugin_id}/manifest.json"
            if manifest_entry not in names:
                logger.warning(f"verify: {fuse_path.name} — missing {manifest_entry}")
                return False

            with zf.open(manifest_entry) as f:
                manifest = json.load(f)

            if "entry" not in manifest:
                logger.warning(
                    f"verify: {fuse_path.name} — manifest missing 'entry' field"
                )
                return False

        logger.info(
            f"verify: {fuse_path.name} OK — "
            f"plugin_id={plugin_id!r} v{manifest.get('version', '?')}"
        )
        return True

    except zipfile.BadZipFile:
        logger.warning(f"verify: {fuse_path.name} is not a valid ZIP archive")
        return False
    except json.JSONDecodeError as e:
        logger.warning(f"verify: {fuse_path.name} — bad manifest JSON: {e}")
        return False
    except Exception as e:
        logger.warning(f"verify: {fuse_path.name} — unexpected error: {e}")
        return False


def pack_core(out_dir: Path | str | None = None) -> list[Path]:
    """Pack every core plugin directory under ``fuse/plugins/`` into a ``.fuse`` archive.

    Outputs archives to *out_dir* (defaults to ``fuse/plugins/`` itself so that
    :func:`fuse.core.discovery.discover` picks them up immediately).

    Returns a list of created archive paths.
    """
    from fuse.core.discovery import BUILTIN_PLUGINS_DIR

    if out_dir is None:
        out_dir = BUILTIN_PLUGINS_DIR

    results: list[Path] = []
    for entry in sorted(BUILTIN_PLUGINS_DIR.iterdir()):
        if not entry.is_dir() or entry.name.startswith((".", "_")):
            continue
        if not (entry / "manifest.json").exists():
            continue
        results.append(pack(entry, out_dir=out_dir))

    return results


__all__ = ["pack", "pack_core", "verify"]
