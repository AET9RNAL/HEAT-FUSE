"""FUSE core plugin — exposes in-game memory reads as the 'game_memory' service.

Other plugins declare this as a dependency in their manifest::

    "dependencies": ["game_memory"]

Then consume it in setup()::

    mem = ctx.services.require("game_memory")   # → GameMemory instance

    def tick(self, dt):
        energy = mem.read("energy")             # → int | None
"""
from __future__ import annotations

from pathlib import Path

from loguru import logger

from fuse.api import FuseContext, FusePlugin
from fuse.utils.game_memory import GameMemory
from fuse.ui.config_schema import ConfigCategory, ConfigEntry


class GameMemoryPlugin(FusePlugin):
    """Core FUSE plugin that opens the game process and registers GameMemory."""

    def setup(self, ctx: FuseContext) -> None:
        ctx.config.defaults(
            process_name="engine_launcher.exe",
            reconnect_interval_s=5.0,
        ).load()

        ctx.config.schema([
            ConfigCategory("Process", [
                ConfigEntry("process_name",         "Process Name",           type="str"),
                ConfigEntry("reconnect_interval_s", "Reconnect Interval (s)", type="float", min=1.0, max=60.0),
            ]),
        ])

        self._memory = GameMemory(ctx.config.get("process_name"))
        self._reconnect_interval = float(ctx.config.get("reconnect_interval_s"))
        self._reconnect_timer = 0.0
        self._ctx = ctx

        ctx.services.register("game_memory", self._memory, owner=self.name)

        self._try_connect()

    def tick(self, dt: float) -> None:
        if not self._memory.connected:
            self._reconnect_timer += dt
            if self._reconnect_timer >= self._reconnect_interval:
                self._reconnect_timer = 0.0
                self._try_connect()

    def teardown(self) -> None:
        self._memory.close()

    def _try_connect(self) -> None:
        was_connected = self._memory.connected
        ok = self._memory.open()
        if ok and not was_connected:
            if self._ctx.events:
                self._ctx.events.emit("game_memory.connected")
        elif not ok:
            if was_connected:
                logger.warning("game_memory: process lost, will retry")
                if self._ctx.events:
                    self._ctx.events.emit("game_memory.disconnected")
            else:
                logger.debug("game_memory: process not found, will retry")


__all__ = ["GameMemoryPlugin"]
