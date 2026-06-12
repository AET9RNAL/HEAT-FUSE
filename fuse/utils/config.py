from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

from loguru import logger

from fuse.utils.paths import resolve_config

_MISSING = object()


class PluginConfig:
    """Rich config API for FUSE plugins.

    Typical usage in setup():

        ctx.config.defaults(opacity=200, position=None).load()
        opacity = ctx.config.get("opacity")
        ctx.config.watch("opacity", self._on_opacity_changed)
        ctx.config.set("opacity", 180)   # persists immediately + fires callback
    """

    def __init__(self, name: str) -> None:
        self._path = Path(resolve_config(f"fuse_{name}.json"))
        self._path.parent.mkdir(parents=True, exist_ok=True)
        self._data: Dict[str, Any] = {}
        self._defaults: Dict[str, Any] = {}
        self._watchers: Dict[str, List[Callable]] = {}
        self._loaded = False
        self._log = logger.bind(plugin=name)

    # ------------------------------------------------------------------
    # Defaults

    def defaults(self, _dict: Optional[dict] = None, **kwargs) -> "PluginConfig":
        """Register fallback values. Fluent — returns self."""
        before = len(self._defaults)
        if _dict:
            self._defaults.update(_dict)
        self._defaults.update(kwargs)
        added = len(self._defaults) - before
        self._log.debug(f"Config: {added} default(s) registered ({list(self._defaults)})")
        return self

    # ------------------------------------------------------------------
    # Load / save

    def load(self, _compat_defaults: Optional[dict] = None) -> "PluginConfig":
        """Load from disk; fill gaps from registered defaults. Fluent.

        Accepts an optional dict for backward compatibility with the old
        ``ctx.config.load({"key": default})`` call pattern.
        """
        if _compat_defaults:
            self.defaults(_compat_defaults)
        on_disk: dict = {}
        from_disk = False
        if self._path.exists():
            try:
                with open(self._path, "r") as f:
                    on_disk = json.load(f)
                from_disk = True
            except Exception as e:
                self._log.warning(f"Config: could not read {self._path}: {e}")
        # defaults are the base; on-disk values override them
        self._data = {**self._defaults, **on_disk}
        self._loaded = True
        if from_disk:
            disk_keys = set(on_disk) - set(self._defaults)
            self._log.debug(
                f"Config loaded from {self._path} "
                f"({len(on_disk)} disk key(s), {len(disk_keys)} extra beyond defaults)"
            )
        else:
            self._log.debug(
                f"Config: no file at {self._path} — using {len(self._defaults)} default(s)"
            )
        return self

    def save(self) -> None:
        """Persist current state to disk."""
        try:
            with open(self._path, "w") as f:
                json.dump(self._data, f, indent=2)
            self._log.debug(f"Config saved: {self._path} ({len(self._data)} key(s))")
        except Exception as e:
            self._log.warning(f"Config: could not save {self._path}: {e}")

    def reload(self) -> None:
        """Re-read from disk; fire watchers for any changed keys."""
        old = dict(self._data)
        self.load()
        changed = [k for k, v in self._data.items() if old.get(k) != v]
        self._log.debug(f"Config reloaded: {len(changed)} key(s) changed ({changed})")
        for key in changed:
            self._notify(key, self._data[key])

    # ------------------------------------------------------------------
    # Read / write

    def get(self, key: str, default: Any = _MISSING) -> Any:
        """Return value for key. Falls back to per-call default or raises KeyError."""
        if key in self._data:
            return self._data[key]
        if default is not _MISSING:
            return default
        raise KeyError(f"PluginConfig: key {key!r} not found and no default given")

    def __getitem__(self, key: str) -> Any:
        return self.get(key)

    def __contains__(self, key: str) -> bool:
        return key in self._data

    def set(self, key: str, value: Any) -> None:
        """Set one value, auto-save, notify watchers if value changed."""
        old = self._data.get(key, _MISSING)
        self._data[key] = value
        self.save()
        if old is _MISSING or old != value:
            old_repr = repr(old) if old is not _MISSING else "<unset>"
            self._log.debug(f"Config set: {key!r} = {value!r} (was {old_repr})")
            self._notify(key, value)

    def update(self, data: dict) -> None:
        """Batch-set multiple values, save once, notify watchers for each changed key."""
        changed: Dict[str, Any] = {}
        for key, value in data.items():
            old = self._data.get(key, _MISSING)
            self._data[key] = value
            if old is _MISSING or old != value:
                changed[key] = value
        self.save()
        if changed:
            self._log.debug(f"Config update: {list(changed.keys())} ({len(changed)} key(s) changed)")
        for key, value in changed.items():
            self._notify(key, value)

    def snapshot(self) -> dict:
        """Return a shallow copy of the current config state."""
        return dict(self._data)

    # ------------------------------------------------------------------
    # Watch

    def watch(self, key: str, callback: Callable[[Any], None]) -> None:
        """Register a callback fired when *key* changes via set() or update()."""
        self._watchers.setdefault(key, []).append(callback)
        self._log.debug(f"Config watch registered: {key!r} -> {callback.__qualname__}")

    def _notify(self, key: str, value: Any) -> None:
        for cb in self._watchers.get(key, []):
            try:
                cb(value)
            except Exception as e:
                self._log.exception(f"Config: watcher for {key!r} raised: {e}")

    # ------------------------------------------------------------------
    # Misc

    @property
    def config_path(self) -> str:
        return str(self._path)


# ---------------------------------------------------------------------------
# Legacy — kept for backward compat; prefer PluginConfig for new plugins.
# ---------------------------------------------------------------------------

class ConfigManager:
    """Manages loading and saving application configuration.

    Bare filenames are resolved under ``data/configs/``. Paths containing a
    separator (or absolute paths) are used verbatim so callers may opt out
    of the convention.
    """

    def __init__(self, filename="heat_ailos_torc.json"):
        self.config_path = resolve_config(filename)
        os.makedirs(os.path.dirname(self.config_path), exist_ok=True)

    def load(self, defaults=None):
        """Load configuration from JSON file. Returns dictionary."""
        config = defaults.copy() if defaults else {}
        if not os.path.exists(self.config_path):
            return config

        try:
            with open(self.config_path, 'r') as f:
                loaded = json.load(f)
                config.update(loaded)
        except Exception as e:
            logger.warning(f"Could not load config: {e}")

        return config

    def save(self, config_dict):
        """Save dictionary of configuration to JSON file."""
        try:
            with open(self.config_path, 'w') as f:
                json.dump(config_dict, f, indent=2)
            logger.info(f"Config saved to {self.config_path}")
        except Exception as e:
            logger.warning(f"Could not save config: {e}")
