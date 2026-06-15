"""Energy bar overlay driven by Rive animation (energyBar.riv).

ViewModel: energyBarVM
  energyValue  — float 0.0-1.0
  colorProperty — color (ARGB int)
Timeline: energyEngine
"""
from __future__ import annotations

from pathlib import Path
from typing import Optional

from loguru import logger

from fuse.api import FuseContext, FusePlugin
from fuse.utils.panel import FusePanel, calibrate_overlay
from fuse.ui.config_schema import ConfigCategory, ConfigEntry

_RIV_PATH = Path(__file__).resolve().parents[2] / "assets" / "energyBar.riv"


def _energy_color(pct: int) -> int:
    """Map energy percentage to ARGB color."""
    if pct > 60:
        return 0x84ffb1  # green
    if pct > 30:
        return 0xff9800  # orange
    return 0xff3935      # red


class EnergyBarRivePlugin(FusePlugin):
    """Energy bar overlay powered by Rive animation instead of PIL compositing."""

    requires_calibration = True

    def __init__(self) -> None:
        self.ctx: Optional[FuseContext] = None
        self._mem = None
        self._anim = None
        self._panel: Optional[FusePanel] = None

    def setup(self, ctx: FuseContext) -> None:
        self.ctx = ctx
        self._mem = ctx.services.get("game_memory")
        if self._mem is None:
            logger.warning("energy_bar_rive: 'game_memory' service not available — energy will read 0")

        ctx.config.defaults(
            bar_custom_pos=None,
            memory_chain="multiplayer_vehicle_energy",
            anim_width=300,
            anim_height=300,
        ).load()

        ctx.config.schema([
            ConfigCategory("Memory Source", [
                ConfigEntry("memory_chain", "Pointer Chain", type="choice",
                            choices=["multiplayer_vehicle_energy", "training_vehicle_energy"],
                            description="Which pointer chain to read energy from"),
            ]),
            ConfigCategory("Animation", [
                ConfigEntry("anim_width", "Render Width", type="int", min=64, max=1024),
                ConfigEntry("anim_height", "Render Height", type="int", min=64, max=1024),
            ]),
            ConfigCategory("Position", [
                ConfigEntry("bar_custom_pos", "Bar Position", type="position"),
            ]),
        ])

        w = ctx.config.get("anim_width")
        h = ctx.config.get("anim_height")

        svc = ctx.services.get("rive_animation")
        if svc is None:
            logger.error("energy_bar_rive: 'rive_animation' service not available — plugin disabled")
            return

        self._anim = svc.create(w, h)

        if not self._anim.load(_RIV_PATH):
            logger.error(f"energy_bar_rive: failed to load {_RIV_PATH}")
        else:
            self._anim.vm_bind("energyBarVM")
            self._anim.vm_set_number("energyValue", 0.5)
            self._anim.vm_set_color("colorProperty", _energy_color(50))
            self._anim.advance(0)

        sw = ctx.tk_root.winfo_screenwidth()
        sh = ctx.tk_root.winfo_screenheight()
        default_x = (sw - w) // 2
        default_y = int(sh * 0.7) - h // 2

        self._panel = FusePanel(
            "HEAT Energy Bar Rive", "bar_custom_pos", ctx.config,
            default_x=default_x, default_y=default_y,
        )
        self._panel.create(self._anim.get_image())
        self._panel.show()

    def enter_calibrate(self) -> None:
        if self._panel:
            self._panel.enter_calibrate()
            if self._anim:
                self._panel.update(calibrate_overlay(self._anim.get_image()))

    def enter_locked(self) -> None:
        if self._panel:
            pos = self._panel.get_position()
            self.ctx.config.update({"bar_custom_pos": list(pos)})
            self._panel.enter_locked()

    def tick(self, dt: float) -> None:
        if not (self.ctx and self.ctx.state == "locked" and self._anim and self._panel):
            return

        pct = 0
        if self._mem is not None:
            val = self._mem.read(self.ctx.config.get("memory_chain", "multiplayer_vehicle_energy"))
            if val is not None:
                pct = max(0, min(100, int(val)))

        self._anim.vm_set_number("energyValue", pct / 100.0)
        self._anim.vm_set_color("colorProperty", _energy_color(pct))
        self._anim.advance(dt)
        self._panel.update(self._anim.get_image())

    def teardown(self) -> None:
        if self._panel:
            try:
                pos = self._panel.get_position()
                self.ctx.config.update({"bar_custom_pos": list(pos)})
            except Exception:
                pass
            try:
                self._panel.destroy()
            except Exception:
                pass
        if self._anim:
            try:
                self._anim.close()
            except Exception:
                pass


__all__ = ["EnergyBarRivePlugin"]
