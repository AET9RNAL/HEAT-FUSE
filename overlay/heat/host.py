"""Plugin host for the universal HEAT overlay.

Owns:

* a single Tk root (``withdraw``-n; plugins draw into their own toplevels or
  layered windows),
* one ``pynput`` keyboard listener (fanned out via :class:`HotkeyRegistry`),
* one ``pynput`` mouse listener (broadcast to plugins that opt-in),
* per-plugin :class:`~utils.config.ConfigManager` instances,
* the calibrate/locked global state machine, exposed as ``Ctrl+L`` toggle
  and ``Ctrl+P`` quit.
"""
from __future__ import annotations

import time
from pathlib import Path  # noqa: F401 — used inside _instantiate
from typing import Callable, List, Optional

import tkinter as tk
from loguru import logger

try:
    from pynput import keyboard as pynkeyboard, mouse as pynmouse
    PYNPUT_OK = True
except ImportError:  # pragma: no cover
    PYNPUT_OK = False

from utils.config import ConfigManager

from overlay.heat.plugin_api import HeatContext, HeatPlugin, HotkeyRegistry
from overlay.heat.discovery import discover, DiscoveredPlugin


MouseCallback = Callable[[int, int, "pynmouse.Button", bool], None]


class PluginHost:
    """Run-time host for HEAT plugins."""

    HOST_CONFIG_FILENAME = "heat_overlay.json"

    def __init__(self, root: tk.Tk):
        self.root = root
        self.root.withdraw()
        self.root.title("HEAT Overlay")

        self.host_config = ConfigManager(filename=self.HOST_CONFIG_FILENAME)
        self.host_state = self.host_config.load({"enabled_plugins": None})

        self.hotkeys = HotkeyRegistry()
        self.plugins: List[HeatPlugin] = []
        self.contexts: List[HeatContext] = []
        self._state = "calibrate"
        self._last_lock_toggle = 0.0
        self._last_tick = time.perf_counter()
        self._quitting = False

        # Global Ctrl-modifier tracker (mirrors per-listener mod state).
        self._mods: set[str] = set()
        self._mouse_subscribers: List[MouseCallback] = []

        self._register_global_hotkeys()

    # ------------------------------------------------------------------
    # Plugin lifecycle
    # ------------------------------------------------------------------

    def load_plugins(self) -> None:
        """Discover and instantiate every enabled plugin."""
        enabled = self.host_state.get("enabled_plugins")
        for spec in discover():
            if enabled is not None and spec.name not in enabled:
                logger.info(f"Plugin disabled by host config: {spec.name}")
                continue
            self._instantiate(spec)

        if not self.plugins:
            logger.warning("No HEAT plugins loaded — overlay will be inert.")

    def _instantiate(self, spec: DiscoveredPlugin) -> None:
        plugin = spec.cls()
        # Each plugin owns its own ``assets/`` directory next to its package,
        # so the universal core never carries plugin media.
        plugin_assets_dir = Path(spec.package_dir) / "assets"
        ctx = HeatContext(
            tk_root=self.root,
            config=ConfigManager(filename=f"heat_{spec.name}.json"),
            hotkeys=self.hotkeys,
            assets_dir=plugin_assets_dir,
            host=self,
            state=self._state,
        )
        try:
            plugin.setup(ctx)
        except Exception as e:
            logger.exception(f"Plugin {spec.name!r} setup failed: {e}")
            return
        # Seed config with defaults from manifest if missing.
        defaults = spec.manifest.get("default_config")
        if defaults:
            existing = ctx.config.load()
            if not existing:
                ctx.config.save(defaults)
        self.plugins.append(plugin)
        self.contexts.append(ctx)
        logger.info(f"Plugin loaded: {spec.name} v{spec.version}")

    # ------------------------------------------------------------------
    # State machine
    # ------------------------------------------------------------------

    def toggle_lock(self) -> None:
        now = time.perf_counter()
        if now - self._last_lock_toggle < 0.25:
            return  # debounce
        self._last_lock_toggle = now
        self._state = "locked" if self._state == "calibrate" else "calibrate"
        logger.info(f"HEAT host state -> {self._state}")
        for ctx in self.contexts:
            ctx.state = self._state
        for plugin in self.plugins:
            try:
                if self._state == "locked":
                    plugin.enter_locked()
                else:
                    plugin.enter_calibrate()
            except Exception as e:
                logger.exception(f"{plugin.name}: state change error: {e}")

    @property
    def state(self) -> str:
        return self._state

    # ------------------------------------------------------------------
    # Listeners + tick
    # ------------------------------------------------------------------

    def _register_global_hotkeys(self) -> None:
        self.hotkeys.register("ctrl+l", self.toggle_lock)
        self.hotkeys.register("ctrl+p", self.quit)

    def subscribe_mouse(self, cb: MouseCallback) -> None:
        self._mouse_subscribers.append(cb)

    def _start_listeners(self) -> None:
        if not PYNPUT_OK:
            logger.warning("pynput unavailable — hotkeys disabled")
            return

        CTRL = {pynkeyboard.Key.ctrl, pynkeyboard.Key.ctrl_l, pynkeyboard.Key.ctrl_r}
        SHIFT = {pynkeyboard.Key.shift, pynkeyboard.Key.shift_l, pynkeyboard.Key.shift_r}
        ALT = {pynkeyboard.Key.alt, pynkeyboard.Key.alt_l, pynkeyboard.Key.alt_r}

        def on_press(key):
            try:
                if key in CTRL:
                    self._mods.add("ctrl"); return
                if key in SHIFT:
                    self._mods.add("shift"); return
                if key in ALT:
                    self._mods.add("alt"); return

                # Resolve the printable letter for the keypress.
                # Under Ctrl, Windows yields ASCII control codes (Ctrl+L = 0x0c)
                # rather than the letter, so we prefer the virtual-key code
                # whenever Ctrl is held; we additionally translate raw control
                # codes 0x01..0x1A back to their A..Z letters as a fallback.
                vk = getattr(key, "vk", None)
                char = getattr(key, "char", None)
                resolved = None
                if "ctrl" in self._mods and vk is not None and 0x41 <= vk <= 0x5A:
                    resolved = chr(vk).lower()
                elif char:
                    o = ord(char)
                    if 1 <= o <= 26:
                        resolved = chr(o + 0x60)
                    else:
                        resolved = char.lower()
                if not resolved:
                    return

                mods = frozenset(self._mods)
                # Dispatch on the Tk thread so handlers can mutate widgets.
                self.root.after(0, lambda m=mods, c=resolved:
                                self.hotkeys.dispatch(m, c))
            except Exception:
                pass

        def on_release(key):
            try:
                if key in CTRL:
                    self._mods.discard("ctrl")
                elif key in SHIFT:
                    self._mods.discard("shift")
                elif key in ALT:
                    self._mods.discard("alt")
            except Exception:
                pass

        self._kbd_listener = pynkeyboard.Listener(
            on_press=on_press, on_release=on_release)
        self._kbd_listener.start()

        def on_click(x, y, button, pressed):
            for cb in list(self._mouse_subscribers):
                try:
                    cb(x, y, button, pressed)
                except Exception as e:
                    logger.exception(f"mouse subscriber error: {e}")

        self._mouse_listener = pynmouse.Listener(on_click=on_click)
        self._mouse_listener.start()

    def _stop_listeners(self) -> None:
        for attr in ("_kbd_listener", "_mouse_listener"):
            listener = getattr(self, attr, None)
            if listener is not None:
                try:
                    listener.stop()
                except Exception:
                    pass

    def _tick(self) -> None:
        if self._quitting:
            return
        now = time.perf_counter()
        dt = now - self._last_tick
        self._last_tick = now
        for plugin in self.plugins:
            try:
                plugin.tick(dt)
            except Exception as e:
                logger.exception(f"{plugin.name}: tick error: {e}")
        self.root.after(50, self._tick)

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    def run(self) -> None:
        if not self.plugins:
            self.load_plugins()
        self._start_listeners()
        # Start in calibrate (plugins decide their own visuals).
        for plugin in self.plugins:
            try:
                plugin.enter_calibrate()
            except Exception as e:
                logger.exception(f"{plugin.name}: initial calibrate failed: {e}")
        self.root.after(50, self._tick)
        try:
            self.root.mainloop()
        finally:
            self._teardown()

    def quit(self) -> None:
        self._quitting = True
        try:
            self.root.after(0, self.root.destroy)
        except Exception:
            pass

    def _teardown(self) -> None:
        self._stop_listeners()
        for plugin in self.plugins:
            try:
                plugin.teardown()
            except Exception as e:
                logger.exception(f"{plugin.name}: teardown error: {e}")


__all__ = ["PluginHost"]
