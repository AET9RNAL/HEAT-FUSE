"""Plugin contract for the FUSE mod loader.

Every plugin subclasses :class:`FusePlugin` and is handed a
:class:`FuseContext` instance during :meth:`FusePlugin.setup`. The context
owns shared infrastructure (the Tk root, hotkey registry, per-plugin
:class:`~fuse.utils.config.PluginConfig`, assets directory, event bus,
service registry, and a per-plugin logger) so plugins never create global
state on their own.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Dict, Optional

import tkinter as tk
from loguru import logger

from fuse.utils.config import PluginConfig


class HotkeyRegistry:
    """Lightweight registry mapping (modifier_set, key_char) -> callback.

    Matching is performed by :class:`PluginHost` from inside the shared
    ``pynput`` keyboard listener; plugins never construct listeners.
    """

    def __init__(self) -> None:
        self._bindings: Dict[tuple, Callable[[], None]] = {}

    @staticmethod
    def _parse(combo: str) -> tuple:
        parts = [p.strip().lower() for p in combo.split("+") if p.strip()]
        if not parts:
            raise ValueError(f"empty hotkey combo: {combo!r}")
        key = parts[-1]
        mods = frozenset(parts[:-1])
        return mods, key

    def register(self, combo: str, callback: Callable[[], None]) -> None:
        binding = self._parse(combo)
        if binding in self._bindings:
            logger.warning(f"Hotkey {combo!r} re-registered (overwriting).")
        self._bindings[binding] = callback
        logger.debug(f"Hotkey bound: {combo!r}")

    def dispatch(self, mods: frozenset, key: str) -> bool:
        cb = self._bindings.get((mods, key))
        if cb is None:
            return False
        try:
            cb()
        except Exception as e:
            logger.exception(f"Hotkey {key!r} handler raised: {e}")
        return True


@dataclass
class FuseContext:
    """Runtime context handed to every plugin during setup."""

    tk_root: tk.Tk
    config: PluginConfig
    hotkeys: HotkeyRegistry
    assets_dir: Path
    host: "PluginHost"  # noqa: F821
    state: str = "calibrate"  # "calibrate" | "locked"

    # Cross-plugin event bus.
    events: Optional["EventBus"] = None  # noqa: F821

    # Named service registry — expose and consume inter-plugin APIs.
    services: Optional["ServiceRegistry"] = None  # noqa: F821

    # Hotkey defaults declared in manifest.json → {"logical_name": "combo"}.
    manifest_hotkeys: Dict[str, str] = field(default_factory=dict)

    # Plugin-private storage (the host never touches this).
    extras: Dict[str, object] = field(default_factory=dict)

    # Per-plugin logger bound with plugin=name. Use ctx.logger.info(...).
    logger: Any = None

    def hotkey_for(self, name: str, fallback: str = "") -> str:
        """Return the configured combo for logical hotkey *name*.

        Plugins call this in ``setup()`` and pass the result to
        ``ctx.hotkeys.register()``, enabling future user remapping via
        manifest edits without touching plugin code.
        """
        return self.manifest_hotkeys.get(name, fallback)


class FusePlugin(ABC):
    """Abstract base class every FUSE plugin must subclass."""

    #: Populated by the host from the plugin's manifest.json.
    name: str = ""
    version: str = ""
    description: str = ""

    @abstractmethod
    def setup(self, ctx: FuseContext) -> None:
        """Construct widgets, load config, register hotkeys."""

    def enter_calibrate(self) -> None:  # pragma: no cover
        """Switch the plugin into calibrate mode (interactive)."""

    def enter_locked(self) -> None:  # pragma: no cover
        """Switch the plugin into locked mode (click-through, scanning)."""

    def tick(self, dt: float) -> None:  # pragma: no cover
        """Called from the host idle loop every ~50 ms."""

    def teardown(self) -> None:  # pragma: no cover
        """Persist state and release resources."""


__all__ = ["FusePlugin", "FuseContext", "HotkeyRegistry"]
