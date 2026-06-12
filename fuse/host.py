"""Plugin host for the FUSE mod loader.

Owns:

* a single Tk root (withdrawn; plugins draw into their own toplevels or
  layered windows),
* one ``pynput`` keyboard listener (fanned out via :class:`HotkeyRegistry`),
* one ``pynput`` mouse listener (broadcast to plugins that opt-in),
* per-plugin :class:`~fuse.utils.config.PluginConfig` instances,
* the calibrate/locked global state machine (``Ctrl+L`` toggle, ``Ctrl+P`` quit),
* a shared :class:`~fuse.events.EventBus` for cross-plugin events,
* a shared :class:`~fuse.services.ServiceRegistry` for inter-plugin APIs,
* :class:`PluginState` tracking for every discovered plugin.
"""
from __future__ import annotations

import time
from enum import Enum
from pathlib import Path
from typing import Callable, Dict, List, Optional

import tkinter as tk
from loguru import logger as _root_logger

try:
    from pynput import keyboard as pynkeyboard, mouse as pynmouse
    PYNPUT_OK = True
except ImportError:  # pragma: no cover
    PYNPUT_OK = False

from fuse.utils.config import ConfigManager, PluginConfig

from fuse.api import FuseContext, FusePlugin, HotkeyRegistry
from fuse.discovery import DiscoveredPlugin, discover
from fuse.resolver import resolve_load_order
from fuse.events import EventBus
from fuse.services import ServiceRegistry

# Bump when the plugin API surface changes in a breaking way.
HOST_VERSION = "1.0"

MouseCallback = Callable[[int, int, "pynmouse.Button", bool], None]


class PluginState(str, Enum):
    """Lifecycle state of a discovered plugin."""
    PENDING  = "pending"    # discovered, not yet processed
    LOADING  = "loading"    # setup() in progress
    ACTIVE   = "active"     # running normally
    DISABLED = "disabled"   # excluded by enabled_plugins / disabled_plugins config
    SKIPPED  = "skipped"    # missing or incompatible dependency / compat check failed
    ERROR    = "error"      # setup() raised an exception


def _version_tuple(v: str) -> tuple:
    try:
        return tuple(int(x) for x in str(v).split("."))
    except ValueError:
        return (0,)


def _check_compat(manifest: dict, name: str) -> bool:
    min_ver = manifest.get("min_host_version")
    if not min_ver:
        return True
    if _version_tuple(str(min_ver)) > _version_tuple(HOST_VERSION):
        _root_logger.error(
            f"Plugin {name!r} requires host v{min_ver} "
            f"but FUSE is v{HOST_VERSION} — skipping."
        )
        return False
    return True


class PluginHost:
    """Run-time host for FUSE plugins."""

    HOST_CONFIG_FILENAME = "fuse_host.json"

    def __init__(self, root: tk.Tk):
        self.root = root
        self.root.withdraw()
        self.root.title("FUSE")

        self.host_config = ConfigManager(filename=self.HOST_CONFIG_FILENAME)
        self.host_state = self.host_config.load(
            {"enabled_plugins": None, "disabled_plugins": [], "extra_plugin_dirs": []}
        )

        self.hotkeys = HotkeyRegistry()
        self.events = EventBus(root)
        self.services = ServiceRegistry()

        self.plugins: List[FusePlugin] = []
        self.contexts: List[FuseContext] = []
        self._plugin_map: Dict[str, FusePlugin] = {}
        self._plugin_states: Dict[str, PluginState] = {}
        self._discovered: Dict[str, DiscoveredPlugin] = {}

        self._state = "calibrate"
        self._last_lock_toggle = 0.0
        self._last_tick = time.perf_counter()
        self._quitting = False

        self._mods: set[str] = set()
        self._mouse_subscribers: List[MouseCallback] = []

        self._register_global_hotkeys()

    # ------------------------------------------------------------------
    # Plugin lifecycle
    # ------------------------------------------------------------------

    def load_plugins(self, extra_plugin_dirs: list | None = None) -> None:
        """Discover, filter, sort by dependency, and instantiate all plugins."""
        enabled = self.host_state.get("enabled_plugins")
        disabled_set = set(self.host_state.get("disabled_plugins", []))
        extra_dirs = [
            Path(p) for p in self.host_state.get("extra_plugin_dirs", [])
        ]
        if extra_plugin_dirs:
            extra_dirs += [Path(p) for p in extra_plugin_dirs]

        raw_specs = discover(extra_dirs=extra_dirs)

        # Record all discovered plugins with an initial PENDING state.
        for spec in raw_specs:
            self._discovered[spec.name] = spec
            self._plugin_states[spec.name] = PluginState.PENDING

        eligible = []
        for spec in raw_specs:
            if enabled is not None and spec.name not in enabled:
                _root_logger.info(f"Plugin excluded by enabled_plugins list: {spec.name}")
                self._plugin_states[spec.name] = PluginState.DISABLED
                continue
            if spec.name in disabled_set:
                _root_logger.info(f"Plugin disabled: {spec.name}")
                self._plugin_states[spec.name] = PluginState.DISABLED
                continue
            if not _check_compat(spec.manifest, spec.name):
                self._plugin_states[spec.name] = PluginState.SKIPPED
                continue
            eligible.append(spec)

        ordered = resolve_load_order(eligible)

        # Plugins in eligible but not in ordered were dropped by the resolver.
        ordered_names = {s.name for s in ordered}
        for spec in eligible:
            if spec.name not in ordered_names:
                self._plugin_states[spec.name] = PluginState.SKIPPED

        for spec in ordered:
            self._instantiate(spec)

        if not self.plugins:
            _root_logger.warning("No FUSE plugins loaded — overlay will be inert.")

    def _instantiate(self, spec: DiscoveredPlugin) -> None:
        plugin = spec.cls()
        plugin_logger = _root_logger.bind(plugin=spec.name)
        plugin_assets_dir = Path(spec.package_dir) / "assets"

        cfg = PluginConfig(spec.name)
        cfg.defaults(spec.manifest.get("default_config", {}))

        ctx = FuseContext(
            tk_root=self.root,
            config=cfg,
            hotkeys=self.hotkeys,
            assets_dir=plugin_assets_dir,
            host=self,
            state=self._state,
            events=self.events,
            services=self.services,
            manifest_hotkeys=dict(spec.manifest.get("hotkeys", {})),
            logger=plugin_logger,
        )

        self._plugin_states[spec.name] = PluginState.LOADING
        try:
            plugin.setup(ctx)
        except Exception as e:
            plugin_logger.exception(f"setup failed: {e}")
            self._plugin_states[spec.name] = PluginState.ERROR
            return

        # Ensure config is loaded even if the plugin didn't call .load() in setup.
        if not cfg._loaded:
            cfg.load()

        self._plugin_states[spec.name] = PluginState.ACTIVE
        self.plugins.append(plugin)
        self.contexts.append(ctx)
        self._plugin_map[spec.name] = plugin
        plugin_logger.info(f"Loaded v{spec.version}")

    # ------------------------------------------------------------------
    # Public plugin API
    # ------------------------------------------------------------------

    def get_plugin(self, name: str) -> Optional[FusePlugin]:
        """Return the loaded plugin with *name*, or ``None``."""
        return self._plugin_map.get(name)

    def get_service(self, name: str) -> Optional[object]:
        """Return the service registered under *name*, or ``None``."""
        return self.services.get(name)

    def get_plugin_state(self, name: str) -> Optional[PluginState]:
        """Return the current :class:`PluginState` for *name*, or ``None`` if unknown."""
        return self._plugin_states.get(name)

    def list_plugins(self) -> List[dict]:
        """Return metadata for every discovered plugin.

        Each entry::

            {
                "name":        str,
                "version":     str,
                "description": str,
                "author":      str,
                "homepage":    str,
                "tags":        list[str],
                "state":       str,          # PluginState value
                "is_external": bool,
            }
        """
        result = []
        for name, spec in self._discovered.items():
            result.append({
                "name":        name,
                "version":     spec.version,
                "description": spec.description,
                "author":      spec.author,
                "homepage":    spec.homepage,
                "tags":        list(spec.tags),
                "state":       self._plugin_states.get(name, PluginState.PENDING).value,
                "is_external": spec.is_external,
            })
        return result

    def disable_plugin(self, name: str) -> None:
        """Persist *name* to the disabled list in ``fuse_host.json``.

        Takes effect on the next FUSE restart.
        """
        disabled = list(self.host_state.get("disabled_plugins", []))
        if name not in disabled:
            disabled.append(name)
            self.host_state["disabled_plugins"] = disabled
            self.host_config.save(self.host_state)
        self._plugin_states[name] = PluginState.DISABLED

    # ------------------------------------------------------------------
    # State machine
    # ------------------------------------------------------------------

    def toggle_lock(self) -> None:
        now = time.perf_counter()
        if now - self._last_lock_toggle < 0.25:
            return
        self._last_lock_toggle = now
        self._state = "locked" if self._state == "calibrate" else "calibrate"
        _root_logger.info(f"FUSE host state -> {self._state}")
        for ctx in self.contexts:
            ctx.state = self._state
        for plugin in self.plugins:
            try:
                if self._state == "locked":
                    plugin.enter_locked()
                else:
                    plugin.enter_calibrate()
            except Exception as e:
                _root_logger.exception(f"{plugin.name}: state change error: {e}")
        self.events.emit("host_state_changed", state=self._state)

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
            _root_logger.warning("pynput unavailable — hotkeys disabled")
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
                    _root_logger.exception(f"mouse subscriber error: {e}")

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
                _root_logger.exception(f"{plugin.name}: tick error: {e}")
        self.root.after(50, self._tick)

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    def run(self) -> None:
        if not self.plugins:
            self.load_plugins()
        self._start_listeners()
        for plugin in self.plugins:
            try:
                plugin.enter_calibrate()
            except Exception as e:
                _root_logger.exception(f"{plugin.name}: initial calibrate failed: {e}")
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
                _root_logger.exception(f"{plugin.name}: teardown error: {e}")


__all__ = ["PluginHost", "PluginState", "HOST_VERSION"]
