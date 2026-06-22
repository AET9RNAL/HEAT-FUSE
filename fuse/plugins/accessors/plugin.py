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

from fuse.api import FuseContext, FusePlugin
from fuse.utils.accessors import Accessors
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
        self._reconnect_interval = float(ctx.config.get("reconnect_interval_s"))
        self._poll_interval      = float(ctx.config.get("poll_interval_s"))
        self._reconnect_timer    = 0.0
        self._poll_timer         = 0.0
        self._ctx                = ctx
        self._connecting         = False  # True while background connect thread is alive

        ctx.services.register("accessors", self._accessors, owner=self.name)

        self._start_connect()

    # ──────────────────────────────────────────────────── tick

    def tick(self, dt: float) -> None:
        if not self._accessors.connected:
            if not self._connecting:
                self._reconnect_timer += dt
                if self._reconnect_timer >= self._reconnect_interval:
                    self._reconnect_timer = 0.0
                    self._start_connect()
            return

        self._poll_timer += dt
        if self._poll_timer >= self._poll_interval:
            self._poll_timer = 0.0
            if not self._accessors.refresh():
                logger.warning("accessors: CDP connection lost, will retry")
                if self._ctx.events:
                    self._ctx.events.emit("accessors.disconnected")

    def teardown(self) -> None:
        self._accessors.close()

    # ──────────────────────────────────────────────────── connect (threaded)

    def _start_connect(self) -> None:
        """Spawn a background thread to call open() so the main loop stays live."""
        self._connecting = True
        threading.Thread(target=self._connect_worker, daemon=True, name="accessors-connect").start()

    def _connect_worker(self) -> None:
        """Runs on background thread. Schedules the result callback on the main thread."""
        ok = self._accessors.open()
        self._connecting = False
        # Post result back to main thread via Tkinter's after(0, …)
        self._ctx.tk_root.after(0, self._on_connect_result, ok)

    def _on_connect_result(self, ok: bool) -> None:
        """Runs on main thread after the background connect attempt completes."""
        if ok:
            logger.info("accessors: CDP connected")
            if self._ctx.events:
                self._ctx.events.emit("accessors.connected")
        else:
            logger.debug("accessors: CDP not available yet, will retry")


__all__ = ["AccessorsPlugin"]
