"""FUSE core plugin — exposes CDP-based game reads as the 'accessors' service.

Other plugins declare this as a dependency in their manifest::

    "dependencies": ["accessors"]

Then consume it in setup()::

    acc = ctx.services.require("accessors")   # → Accessors instance

    def tick(self, dt):
        hp = acc.read("multiplayer_vehicle_health")  # → int | None

Supported read() field names match game_memory's names where a DOM source
exists.  Fields with no DOM equivalent (ammo, reload, cooldowns, etc.) return
None — use game_memory for those.

The service also exposes CDP-native extras not in game_memory::

    acc.read("health_regen")   # HP regen per second
    acc.read("health_pct")     # HP bar fill 0–100
    acc.read("energy_regen")   # mana regen per second
    acc.read("boost_active")   # 1 = boost glow visible
    acc.read("zoom_val")       # actual zoom magnification (e.g. 3.0, 10.0)
    acc.read("num_zooms")      # number of available zoom levels

Events emitted on ctx.events (always on the main thread)::

    "accessors.connected"      — CDP connection established
    "accessors.disconnected"   — CDP connection lost
"""
from __future__ import annotations

import threading

from loguru import logger

from fuse.core.api import FuseContext, FusePlugin
from fuse.vision.accessors import Accessors
from fuse.ui.config_schema import ConfigCategory, ConfigEntry


class AccessorsPlugin(FusePlugin):
    """FUSE plugin that connects to the Gameface CDP debugger and registers Accessors."""

    def setup(self, ctx: FuseContext) -> None:
        ctx.config.defaults(
            cdp_port=9222,
            connect_timeout_s=8.0,
            reconnect_interval_s=5.0,
            poll_interval_s=0.1,
        ).load()

        ctx.config.schema([
            ConfigCategory("CDP Debugger", [
                ConfigEntry("cdp_port",             "CDP Port",               type="int",   min=1024, max=65535),
                ConfigEntry("connect_timeout_s",    "Connect Timeout (s)",    type="float", min=1.0,  max=30.0),
                ConfigEntry("reconnect_interval_s", "Reconnect Interval (s)", type="float", min=1.0,  max=60.0),
                ConfigEntry("poll_interval_s",      "Poll Interval (s)",      type="float", min=0.05, max=1.0),
            ]),
        ])

        self._accessors = Accessors(
            port=int(ctx.config.get("cdp_port")),
            connect_timeout=float(ctx.config.get("connect_timeout_s")),
        )
        # reconnect_interval doubles as the cadence at which we re-discover CDP
        # pages and reconcile sockets, so the service follows the game across
        # hangar↔battle transitions (pages appear/disappear) without a restart.
        self._sync_interval = float(ctx.config.get("reconnect_interval_s"))
        self._poll_interval = float(ctx.config.get("poll_interval_s"))
        self._sync_timer    = 0.0
        self._poll_timer    = 0.0
        self._ctx           = ctx
        self._syncing       = False  # True while a background sync thread is alive
        self._was_connected = False  # last-seen battle_hud connection state

        ctx.services.register("accessors", self._accessors, owner=self.name)

        self._start_sync()

    # ──────────────────────────────────────────────────── tick

    def tick(self, dt: float) -> None:
        # Periodically reconcile connections with the game's current page set.
        # This runs regardless of state so hangar→battle (and back) transitions
        # are detected even while a different page is already connected.
        if not self._syncing:
            self._sync_timer += dt
            if self._sync_timer >= self._sync_interval:
                self._sync_timer = 0.0
                self._start_sync()

        # Poll battle pages while battle_hud is connected.
        if self._accessors.connected:
            self._poll_timer += dt
            if self._poll_timer >= self._poll_interval:
                self._poll_timer = 0.0
                if not self._accessors.refresh():
                    logger.warning("accessors: battle_hud poll failed — re-syncing")
                    # Force an immediate reconcile to drop/reopen sockets.
                    self._sync_timer = self._sync_interval

    def teardown(self) -> None:
        self._accessors.close()

    # ──────────────────────────────────────────────────── sync (threaded)

    def _start_sync(self) -> None:
        """Spawn a background thread to reconcile sockets so the main loop stays live."""
        self._syncing = True
        threading.Thread(target=self._sync_worker, daemon=True, name="accessors-sync").start()

    def _sync_worker(self) -> None:
        """Runs on background thread; posts the result back to the main thread."""
        try:
            self._accessors.sync()
        finally:
            self._syncing = False
        self._ctx.tk_root.after(0, self._on_sync_result, self._accessors.connected)

    def _on_sync_result(self, connected: bool) -> None:
        """Runs on main thread; emits connect/disconnect events on battle_hud edges."""
        if connected and not self._was_connected:
            logger.info("accessors: battle_hud connected")
            if self._ctx.events:
                self._ctx.events.emit("accessors.connected")
        elif self._was_connected and not connected:
            logger.info("accessors: battle_hud disconnected")
            if self._ctx.events:
                self._ctx.events.emit("accessors.disconnected")
        self._was_connected = connected


__all__ = ["AccessorsPlugin"]
