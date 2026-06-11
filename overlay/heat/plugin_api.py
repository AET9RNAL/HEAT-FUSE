"""Plugin contract for the universal HEAT overlay.

Every plugin subclasses :class:`HeatPlugin` and is handed a
:class:`HeatContext` instance during :meth:`HeatPlugin.setup`. The context
owns shared infrastructure (the Tk root, hotkey registry, per-plugin
:class:`~utils.config.ConfigManager`, assets directory) so plugins never
create global state on their own.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Dict, List, Optional

import tkinter as tk
from loguru import logger

from utils.config import ConfigManager


class HotkeyRegistry:
    """Lightweight registry mapping (modifier_set, key_char) -> callback.

    Matching is performed by :class:`PluginHost` from inside the shared
    ``pynput`` keyboard listener; plugins never construct listeners.
    """

    def __init__(self) -> None:
        # key: (frozenset({"ctrl"}, ...), "l")
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
class HeatContext:
    """Runtime context handed to every plugin."""

    tk_root: tk.Tk
    config: ConfigManager
    hotkeys: HotkeyRegistry
    assets_dir: Path
    host: "PluginHost"  # noqa: F821 — forward reference, resolved at runtime
    state: str = "calibrate"  # "calibrate" | "locked"

    # Plugin-private storage (the host never touches this).
    extras: Dict[str, object] = field(default_factory=dict)


class HeatPlugin(ABC):
    """Abstract base class every HEAT plugin must subclass."""

    #: Populated by the host from the plugin's manifest.json.
    name: str = ""
    version: str = ""
    description: str = ""

    @abstractmethod
    def setup(self, ctx: HeatContext) -> None:
        """Construct widgets, load config, register hotkeys."""

    def enter_calibrate(self) -> None:  # pragma: no cover - optional
        """Switch the plugin into calibrate mode (interactive)."""

    def enter_locked(self) -> None:  # pragma: no cover - optional
        """Switch the plugin into locked mode (click-through, scanning)."""

    def tick(self, dt: float) -> None:  # pragma: no cover - optional
        """Called from the host idle loop every ~50 ms."""

    def teardown(self) -> None:  # pragma: no cover - optional
        """Persist state and release resources."""


__all__ = ["HeatPlugin", "HeatContext", "HotkeyRegistry"]
