"""Plugin contract for the FUSE mod loader.

Every plugin subclasses :class:`FusePlugin` and is handed a
:class:`FuseContext` instance during :meth:`FusePlugin.setup`. The context
owns shared infrastructure (the Tk root, hotkey registry, per-plugin
:class:`~fuse.core.config.PluginConfig`, :class:`~fuse.ui.assets.PluginAssets`,
event bus, service registry, and a per-plugin logger) so plugins never create
global state on their own.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, Optional

import tkinter as tk
from loguru import logger

from fuse.core.config import PluginConfig
from fuse.ui.assets import PluginAssets


class HotkeyRegistry:
    """Lightweight registry mapping (modifier_set, key_char) -> callback.

    Matching is performed by :class:`PluginHost` from inside the shared
    ``pynput`` keyboard listener; plugins never construct listeners.
    """

    def __init__(self) -> None:
        self._bindings: Dict[tuple, Callable[[], None]] = {}
        self._labels: Dict[tuple, str] = {}   # binding -> display label
        self._combos: Dict[tuple, str] = {}   # binding -> "ctrl+l" string

    @staticmethod
    def _parse(combo: str) -> tuple:
        parts = [p.strip().lower() for p in combo.split("+") if p.strip()]
        if not parts:
            raise ValueError(f"empty hotkey combo: {combo!r}")
        key = parts[-1]
        mods = frozenset(parts[:-1])
        return mods, key

    def register(self, combo: str, callback: Callable[[], None], label: str = "") -> None:
        binding = self._parse(combo)
        if binding in self._bindings:
            logger.warning(f"Hotkey {combo!r} re-registered (overwriting).")
        self._bindings[binding] = callback
        self._labels[binding] = label or combo
        self._combos[binding] = combo
        logger.debug(f"Hotkey bound: {combo!r}")

    def unregister(self, combo: str) -> bool:
        """Remove a binding. Returns True if it existed."""
        binding = self._parse(combo)
        existed = binding in self._bindings
        self._bindings.pop(binding, None)
        self._labels.pop(binding, None)
        self._combos.pop(binding, None)
        return existed

    def reregister(self, old_mods: frozenset, old_key: str, new_combo: str) -> bool:
        """Move an existing binding to a new combo.  Returns False on conflict."""
        old_binding = (old_mods, old_key)
        callback = self._bindings.get(old_binding)
        if callback is None:
            return False
        new_binding = self._parse(new_combo)
        if new_binding in self._bindings and new_binding != old_binding:
            logger.warning(f"Rebind conflict: {new_combo!r} already bound.")
            return False
        label    = self._labels.get(old_binding, new_combo)
        old_repr = self._combos.get(old_binding, repr(old_binding))
        # Remove old
        self._bindings.pop(old_binding, None)
        self._labels.pop(old_binding, None)
        self._combos.pop(old_binding, None)
        # Register new
        self._bindings[new_binding] = callback
        self._labels[new_binding] = label
        self._combos[new_binding] = new_combo
        logger.info(f"Hotkey rebound: {old_repr!r} -> {new_combo!r}")
        return True

    def list_bindings(self) -> list:
        """Return all registered bindings as dicts for display in the manager UI."""
        result = []
        for (mods, key), cb in self._bindings.items():
            result.append({
                "mods":  mods,
                "key":   key,
                "combo": self._combos.get((mods, key), key),
                "label": self._labels.get((mods, key), key),
            })
        return sorted(result, key=lambda b: b["label"])

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
    assets: PluginAssets          # high-level asset loader — use ctx.assets.load_image() etc.
    host: "PluginHost"  # noqa: F821
    state: str = "calibrate"  # "calibrate" | "locked"

    # Raw Traversable root of the entire plugin package (parent of assets/).
    # Use ctx.assets for all normal asset access; this is for advanced use only.
    package_root: object = None

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

    #: Set True for plugins that show calibration UI. The host will wait for
    #: the user to press Ctrl+L (entering locked state) before starting the
    #: next plugin's setup. Plugins that require no user interaction leave
    #: this False and are advanced automatically after setup().
    requires_calibration: bool = False

    #: Number of Ctrl+L presses required to complete calibration.
    #: 1 = single-pass (default). 2 = two-pass (e.g. 3rd-person then 1st-person).
    #: The host calls enter_calibrate(stage) for stages 1..N-1 and enter_locked()
    #: on the final press.
    calibration_stages: int = 1

    @abstractmethod
    def setup(self, ctx: FuseContext) -> None:
        """Construct widgets, load config, register hotkeys."""

    def enter_calibrate(self, stage: int = 1) -> None:  # pragma: no cover
        """Switch the plugin into calibrate mode (interactive).

        stage is 1-based. Stage 1 is the initial (or only) calibration pass.
        For calibration_stages > 1, the host calls enter_calibrate(2), etc.
        on subsequent Ctrl+L presses before the final enter_locked() call.
        """

    def enter_locked(self) -> None:  # pragma: no cover
        """Switch the plugin into locked mode (click-through, scanning)."""

    def tick(self, dt: float) -> None:  # pragma: no cover
        """Called from the host idle loop every ~50 ms."""

    def teardown(self) -> None:  # pragma: no cover
        """Persist state and release resources."""


__all__ = ["FusePlugin", "FuseContext", "HotkeyRegistry", "PluginAssets"]
