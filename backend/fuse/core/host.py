"""Plugin host for the FUSE mod loader.

Owns:

* a single Tk root (withdrawn; plugins draw into their own toplevels or
  layered windows),
* one ``pynput`` keyboard listener (fanned out via :class:`HotkeyRegistry`),
* one ``pynput`` mouse listener (broadcast to plugins that opt-in),
* per-plugin :class:`~fuse.core.config.PluginConfig` instances,
* the calibrate/locked global state machine (``Ctrl+L`` toggle, ``Ctrl+P`` quit),
* a shared :class:`~fuse.events.EventBus` for cross-plugin events,
* a shared :class:`~fuse.services.ServiceRegistry` for inter-plugin APIs,
* :class:`PluginState` tracking for every discovered plugin.

Plugin setup is **sequential**: the host sets up one plugin at a time.
After each plugin's ``setup()`` returns it enters calibrate mode; for
plugins that declare ``requires_calibration = True`` the user must press
Ctrl+L to lock that plugin before the next one starts.  Plugins that
do not need calibration are locked and advanced automatically.
"""
from __future__ import annotations

import sys
import time
from enum import Enum
from pathlib import Path
from typing import TYPE_CHECKING, Callable, Dict, List, Optional

if TYPE_CHECKING:
    from fuse.core.core import FuseCore

import tkinter as tk
from loguru import logger as _root_logger

try:
    from pynput import keyboard as pynkeyboard, mouse as pynmouse
    PYNPUT_OK = True
except ImportError:  # pragma: no cover
    PYNPUT_OK = False

from fuse.core.config import ConfigManager, PluginConfig

from fuse.core.api import FuseContext, FusePlugin, HotkeyRegistry, HotkeyRegistryView
from fuse.core.discovery import (
    BUILTIN_PLUGINS_DIR,
    DiscoveredPlugin,
    USER_PLUGINS_DIR,
    discover,
)
from fuse.core.resolver import resolve_load_order
from fuse.core.events import EventBus
from fuse.core.services import ServiceRegistry

HOST_VERSION = "2.7.0"

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
            f"but FUSE is v{HOST_VERSION} - skipping."
        )
        return False
    return True


class PluginHost:
    """Run-time host for FUSE plugins."""

    HOST_CONFIG_FILENAME = "fuse_host.json"

    def __init__(self, root: tk.Tk, server: "Optional[FuseCore]" = None):
        self.root = root
        self._server = server
        self.root.withdraw()
        self.root.title("FUSE")

        self.host_config = ConfigManager(filename=self.HOST_CONFIG_FILENAME)
        self.host_state = self.host_config.load(
            {"enabled_plugins": None, "disabled_plugins": [], "hotkey_overrides": {}}
        )

        self.hotkeys = HotkeyRegistry()
        self.events = EventBus(root)
        self.services = ServiceRegistry()

        self.plugins: List[FusePlugin] = []
        self.contexts: List[FuseContext] = []
        self._plugin_map: Dict[str, FusePlugin] = {}
        self._context_map: Dict[str, FuseContext] = {}
        self._plugin_states: Dict[str, PluginState] = {}
        self._discovered: Dict[str, DiscoveredPlugin] = {}

        self._state = "calibrate"
        self._last_lock_toggle = 0.0
        self._last_tick = time.perf_counter()
        self._quitting = False
        self._capturing_rebind = False  # suppresses pynput dispatch during key capture

        self._mods: set[str] = set()
        self._mouse_subscribers: List[MouseCallback] = []

        # Setup queue - plugins are instantiated one at a time.
        self._setup_pending: List[DiscoveredPlugin] = []
        self._setup_active: Optional[DiscoveredPlugin] = None  # currently being calibrated
        self._auto_lock_queue = False  # True while draining a reload queue - skip calibrate UI

        # Calibration stage tracking (1-based). Separate counters for setup
        # queue mode vs. normal (runtime) toggle mode.
        self._setup_calib_stage: int = 1
        self._calib_stage: int = 1

        self._dequeue_started: bool = False

        self._register_global_hotkeys()
        self._apply_hotkey_overrides(only_owner="host")

    # ------------------------------------------------------------------
    # Plugin lifecycle
    # ------------------------------------------------------------------

    def load_plugins(self) -> None:
        """Discover, filter, and sort plugins into the setup queue.

        Plugins are not instantiated here - they are set up one at a time
        after the mainloop starts via :meth:`_dequeue_next_plugin`.
        """
        enabled = self.host_state.get("enabled_plugins")
        disabled_set = set(self.host_state.get("disabled_plugins", []))

        raw_specs = discover()

        for spec in raw_specs:
            self._discovered[spec.plugin_id] = spec
            self._plugin_states[spec.plugin_id] = PluginState.PENDING

        eligible = []
        for spec in raw_specs:
            if enabled is not None and spec.plugin_id not in enabled:
                _root_logger.info(f"Plugin excluded by enabled_plugins list: {spec.name}")
                self._plugin_states[spec.plugin_id] = PluginState.DISABLED
                continue
            if spec.plugin_id in disabled_set:
                _root_logger.info(f"Plugin disabled: {spec.name}")
                self._plugin_states[spec.plugin_id] = PluginState.DISABLED
                continue
            if not _check_compat(spec.manifest, spec.name):
                self._plugin_states[spec.plugin_id] = PluginState.SKIPPED
                continue
            eligible.append(spec)

        ordered = resolve_load_order(eligible)

        ordered_ids = {s.plugin_id for s in ordered}
        for spec in eligible:
            if spec.plugin_id not in ordered_ids:
                self._plugin_states[spec.plugin_id] = PluginState.SKIPPED

        self._setup_pending = list(ordered)

    def _instantiate(self, spec: DiscoveredPlugin) -> None:
        """Create and call setup() for one plugin. Called by the queue."""
        from fuse.ui.assets import PluginAssets

        plugin = spec.cls()
        plugin_logger = _root_logger.bind(plugin=spec.plugin_id)
        plugin_assets = PluginAssets(spec.package_root / "assets")

        cfg = PluginConfig(spec.plugin_id)
        cfg.defaults(spec.manifest.get("default_config", {}))

        ctx = FuseContext(
            tk_root=self.root,
            config=cfg,
            hotkeys=HotkeyRegistryView(self.hotkeys, owner=spec.plugin_id),
            assets=plugin_assets,
            package_root=spec.package_root,
            host=self,
            state=self._state,
            events=self.events,
            services=self.services,
            manifest_hotkeys=dict(spec.manifest.get("hotkeys", {})),
            logger=plugin_logger,
        )

        self._plugin_states[spec.plugin_id] = PluginState.LOADING
        try:
            plugin.setup(ctx)
        except Exception as e:
            plugin_logger.exception(f"setup failed: {e}")
            self._plugin_states[spec.plugin_id] = PluginState.ERROR
            if self._server is not None:
                self._server.notify_plugin_status_changed(spec.plugin_id, PluginState.ERROR.value)
            return

        if not cfg._loaded:
            cfg.load()

        self._plugin_states[spec.plugin_id] = PluginState.ACTIVE
        self.plugins.append(plugin)
        self.contexts.append(ctx)
        self._plugin_map[spec.plugin_id] = plugin
        self._context_map[spec.plugin_id] = ctx
        plugin_logger.info(f"Loaded v{spec.version}")
        if self._server is not None:
            self._server.notify_plugin_registered(spec, PluginState.ACTIVE.value)

    def reload_plugins(self) -> None:
        """Tear down every active plugin and reload all enabled plugins from disk.

        Purges plugin modules from ``sys.modules`` first so edited source files
        are re-read rather than reused from import cache. Bound to Ctrl+R.
        """
        _root_logger.info("FUSE: hot-reloading plugins...")

        self._setup_pending = []
        self._setup_active = None

        for plugin in reversed(self.plugins):
            try:
                plugin.teardown()
            except Exception as e:
                _root_logger.exception(f"{plugin.name}: teardown during reload failed: {e}")

        self.plugins.clear()
        self.contexts.clear()
        self._plugin_map.clear()
        self._context_map.clear()
        self._plugin_states.clear()
        self._discovered.clear()

        self._purge_plugin_modules()

        self._state = "locked"
        self._auto_lock_queue = True
        self.load_plugins()
        self.root.after(0, self._dequeue_next_plugin)
        _root_logger.info("FUSE: plugin reload queued.")

    def _purge_plugin_modules(self) -> None:
        """Drop cached imports for plugin source files so reload re-reads them."""
        roots = [BUILTIN_PLUGINS_DIR, USER_PLUGINS_DIR]
        roots = [r.resolve() for r in roots if r.exists()]

        for mod_name, mod in list(sys.modules.items()):
            mod_file = getattr(mod, "__file__", None)
            if not mod_file:
                continue
            try:
                mod_path = Path(mod_file).resolve()
            except OSError:
                continue
            for root in roots:
                try:
                    mod_path.relative_to(root)
                except ValueError:
                    continue
                del sys.modules[mod_name]
                break

    def _dequeue_next_plugin(self) -> None:
        """Instantiate the next queued plugin and enter its calibrate phase.

        Called from the Tk event loop (via ``root.after``).  For plugins that
        declare ``requires_calibration = False`` the host locks them
        automatically and immediately advances to the next one.
        """
        self._setup_active = None

        if not self._setup_pending:
            _root_logger.info("All plugins initialized.")
            self._auto_lock_queue = False
            self._apply_hotkey_overrides()
            self.events.emit("host_ready")
            return

        spec = self._setup_pending.pop(0)

        # Reset host state to calibrate for this plugin's setup phase, unless
        # we're draining a reload queue - those skip calibration entirely.
        self._state = "locked" if self._auto_lock_queue else "calibrate"
        self._instantiate(spec)

        state = self._plugin_states.get(spec.plugin_id)
        if state != PluginState.ACTIVE:
            # Error / skip - advance without waiting for user.
            self.root.after(0, self._dequeue_next_plugin)
            return

        plugin = self._plugin_map[spec.plugin_id]
        ctx = self._context_map[spec.plugin_id]

        if self._auto_lock_queue:
            # Hot-reload: restore straight to locked, no calibrate UI.
            ctx.state = "locked"
            try:
                plugin.enter_locked()
            except Exception as e:
                _root_logger.exception(f"{spec.name}: enter_locked failed: {e}")
            self.root.after(0, self._dequeue_next_plugin)
            return

        self._setup_active = spec
        self._setup_calib_stage = 1
        ctx.state = "calibrate"

        try:
            plugin.enter_calibrate(1)
        except Exception as e:
            _root_logger.exception(f"{spec.name}: enter_calibrate failed: {e}")

        if not plugin.requires_calibration:
            # No UI to calibrate - lock immediately and advance.
            try:
                plugin.enter_locked()
                ctx.state = "locked"
            except Exception as e:
                _root_logger.exception(f"{spec.name}: enter_locked failed: {e}")
            self._setup_active = None
            self.root.after(0, self._dequeue_next_plugin)

    def _apply_hotkey_overrides(self, only_owner: str | None = None) -> None:
        """Apply persisted hotkey_overrides from fuse_host.json.

        Pass *only_owner* to restrict to one owner (e.g. ``"host"`` at init
        time before plugins have registered any bindings).
        """
        overrides: dict = self.host_state.get("hotkey_overrides", {})
        for plugin_id, bindings in overrides.items():
            if only_owner is not None and plugin_id != only_owner:
                continue
            for action, new_combo in bindings.items():
                # Find current binding for this action/owner.
                current = next(
                    (b for b in self.hotkeys.list_bindings(owner=plugin_id)
                     if b["label"] == action),
                    None,
                )
                if current is None:
                    _root_logger.warning(
                        f"hotkey_overrides: action {action!r} not found for {plugin_id!r} - skipped."
                    )
                    continue
                ok = self.hotkeys.reregister(current["mods"], current["key"], new_combo)
                if ok:
                    _root_logger.info(f"Applied hotkey override: {plugin_id}/{action} → {new_combo!r}")
                else:
                    _root_logger.warning(f"hotkey_overrides: rebind conflict for {plugin_id}/{action}")

    # ------------------------------------------------------------------
    # Public plugin API
    # ------------------------------------------------------------------

    def get_plugin(self, plugin_id: str) -> Optional[FusePlugin]:
        """Return the loaded plugin with *plugin_id*, or ``None``."""
        return self._plugin_map.get(plugin_id)

    def set_overlays_visible(self, visible: bool) -> None:
        """Show or hide every active plugin's overlays (game-focus change)."""
        for plugin in self.plugins:
            try:
                plugin.set_overlay_visible(visible)
            except Exception as e:
                _root_logger.exception(f"{plugin.name}: set_overlay_visible failed: {e}")

    def get_service(self, name: str) -> Optional[object]:
        """Return the service registered under *name*, or ``None``."""
        return self.services.get(name)

    def get_plugin_state(self, plugin_id: str) -> Optional[PluginState]:
        """Return the current :class:`PluginState` for *plugin_id*, or ``None`` if unknown."""
        return self._plugin_states.get(plugin_id)

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
            }
        """
        result = []
        for plugin_id, spec in self._discovered.items():
            result.append({
                "plugin_id":   plugin_id,
                "name":        spec.name,
                "version":     spec.version,
                "description": spec.description,
                "author":      spec.author,
                "homepage":    spec.homepage,
                "tags":        list(spec.tags),
                "is_core":     spec.is_core,
                "status":      self._plugin_states.get(plugin_id, PluginState.PENDING).value,
            })
        return result

    def disable_plugin(self, plugin_id: str) -> None:
        """Tear down an active plugin and persist it to the disabled list."""
        disabled = list(self.host_state.get("disabled_plugins", []))
        if plugin_id not in disabled:
            disabled.append(plugin_id)
            self.host_state["disabled_plugins"] = disabled
            self.host_config.save(self.host_state)
        self._plugin_states[plugin_id] = PluginState.DISABLED
        if self._server is not None:
            self._server.notify_plugin_status_changed(plugin_id, PluginState.DISABLED.value)

        # Tear down if currently active.
        plugin = self._plugin_map.pop(plugin_id, None)
        if plugin is not None:
            ctx = self._context_map.pop(plugin_id, None)
            if plugin in self.plugins:
                self.plugins.remove(plugin)
            if ctx in self.contexts:
                self.contexts.remove(ctx)
            try:
                plugin.teardown()
            except Exception as e:
                _root_logger.exception(f"{plugin_id}: teardown during disable failed: {e}")
            _root_logger.info(f"Plugin {plugin_id!r} disabled and torn down.")

    def enable_plugin(self, plugin_id: str) -> None:
        """Re-enable a disabled plugin at runtime without restarting the setup queue.

        The plugin enters whatever state the host is currently in (locked or
        calibrate) so existing running plugins are not disrupted.  If the plugin
        needs calibration, the user can still press Ctrl+L to toggle it.
        """
        # Remove from disabled list.
        disabled = list(self.host_state.get("disabled_plugins", []))
        if plugin_id in disabled:
            disabled.remove(plugin_id)
            self.host_state["disabled_plugins"] = disabled
            self.host_config.save(self.host_state)

        if self._plugin_states.get(plugin_id) == PluginState.ACTIVE:
            return  # already running

        spec = self._discovered.get(plugin_id)
        if spec is None:
            _root_logger.warning(f"enable_plugin: {plugin_id!r} not in discovered set.")
            return

        self._instantiate(spec)

        if self._plugin_states.get(plugin_id) != PluginState.ACTIVE:
            return  # instantiation failed

        plugin = self._plugin_map[plugin_id]
        ctx = self._context_map[plugin_id]
        ctx.state = self._state
        try:
            if self._state == "locked":
                plugin.enter_locked()
            else:
                plugin.enter_calibrate(self._calib_stage)
        except Exception as e:
            _root_logger.exception(f"{plugin_id}: state entry on enable failed: {e}")
        _root_logger.info(f"Plugin {plugin_id!r} enabled at runtime (state={self._state}).")
        if self._server is not None:
            self._server.notify_plugin_status_changed(plugin_id, PluginState.ACTIVE.value)

    # ------------------------------------------------------------------
    # State machine
    # ------------------------------------------------------------------

    def toggle_lock(self) -> None:
        now = time.perf_counter()
        if now - self._last_lock_toggle < 0.25:
            return
        self._last_lock_toggle = now

        if self._setup_active is not None:
            # Queue mode: only toggle the plugin currently being set up.
            spec = self._setup_active
            plugin = self._plugin_map.get(spec.plugin_id)
            ctx = self._context_map.get(spec.plugin_id)
            if plugin is None or self._plugin_states.get(spec.plugin_id) != PluginState.ACTIVE:
                return

            if self._state == "calibrate":
                stages = getattr(plugin, "calibration_stages", 1)
                if self._setup_calib_stage < stages:
                    # More stages remain - advance without locking.
                    self._setup_calib_stage += 1
                    _root_logger.info(
                        f"FUSE setup calibration stage -> {self._setup_calib_stage}/{stages}"
                    )
                    try:
                        plugin.enter_calibrate(self._setup_calib_stage)
                    except Exception as e:
                        _root_logger.exception(f"{spec.name}: enter_calibrate({self._setup_calib_stage}) failed: {e}")
                    self.events.emit("host_state_changed", state=self._state,
                                     calib_stage=self._setup_calib_stage)
                    return

                # All stages done - lock and advance setup queue.
                self._state = "locked"
                self._setup_calib_stage = 1
                if ctx:
                    ctx.state = "locked"
                _root_logger.info(f"FUSE host state -> locked")
                try:
                    plugin.enter_locked()
                except Exception as e:
                    _root_logger.exception(f"{spec.name}: enter_locked failed: {e}")
                self._setup_active = None
                self.root.after(0, self._dequeue_next_plugin)
            else:
                # Was locked - re-enter calibrate at stage 1.
                self._state = "calibrate"
                self._setup_calib_stage = 1
                if ctx:
                    ctx.state = "calibrate"
                _root_logger.info(f"FUSE host state -> calibrate")
                try:
                    plugin.enter_calibrate(1)
                except Exception as e:
                    _root_logger.exception(f"{spec.name}: enter_calibrate(1) failed: {e}")
            self.events.emit("host_state_changed", state=self._state,
                             calib_stage=self._setup_calib_stage)
            return

        # Normal mode: toggle all active plugins.
        if self._state == "calibrate":
            max_stages = max(
                (getattr(p, "calibration_stages", 1) for p in self.plugins), default=1
            )
            if self._calib_stage < max_stages:
                # Advance calibration stage without locking yet.
                self._calib_stage += 1
                _root_logger.info(f"FUSE calibration stage -> {self._calib_stage}/{max_stages}")
                for ctx in self.contexts:
                    pass  # ctx.state stays "calibrate"
                for plugin in self.plugins:
                    try:
                        plugin.enter_calibrate(self._calib_stage)
                    except Exception as e:
                        _root_logger.exception(f"{plugin.name}: enter_calibrate({self._calib_stage}) failed: {e}")
                self.events.emit("host_state_changed", state=self._state,
                                 calib_stage=self._calib_stage)
                return

            # All stages done - lock.
            self._state = "locked"
            self._calib_stage = 1
        else:
            # Was locked - go back to calibrate stage 1.
            self._state = "calibrate"
            self._calib_stage = 1

        _root_logger.info(f"FUSE host state -> {self._state}")
        for ctx in self.contexts:
            ctx.state = self._state
        for plugin in self.plugins:
            try:
                if self._state == "locked":
                    plugin.enter_locked()
                else:
                    plugin.enter_calibrate(1)
            except Exception as e:
                _root_logger.exception(f"{plugin.name}: state change error: {e}")
        self.events.emit("host_state_changed", state=self._state, calib_stage=self._calib_stage)

    @property
    def state(self) -> str:
        return self._state

    # ------------------------------------------------------------------
    # Listeners + tick
    # ------------------------------------------------------------------

    def _register_global_hotkeys(self) -> None:
        self.hotkeys.register("ctrl+l", self.toggle_lock,    label="Toggle Calibrate/Lock", owner="host")
        self.hotkeys.register("ctrl+p", self.quit,           label="Quit FUSE",             owner="host")
        self.hotkeys.register("ctrl+r", self.reload_plugins, label="Hot-Reload Plugins",    owner="host")

    def subscribe_mouse(self, cb: MouseCallback) -> None:
        self._mouse_subscribers.append(cb)

    def _start_listeners(self) -> None:
        if not PYNPUT_OK:
            _root_logger.warning("pynput unavailable - hotkeys disabled")
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
                if not self._capturing_rebind:
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

    def begin_plugin_init(self) -> None:
        """Trigger plugin instantiation. Called by FuseCore after first WS auth."""
        if self._dequeue_started:
            return
        self._dequeue_started = True
        self.root.after(0, self._dequeue_next_plugin)

    def run(self) -> None:
        if not self._setup_pending:
            _root_logger.warning("No plugins queued - starting with empty host. Use Ctrl+M to enable plugins.")
        self._start_listeners()
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
        from fuse.ui.fonts import unload_mem_fonts
        unload_mem_fonts()


__all__ = ["PluginHost", "PluginState", "HOST_VERSION"]
