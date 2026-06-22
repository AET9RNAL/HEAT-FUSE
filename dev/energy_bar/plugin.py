"""Energy bar overlay driven by Rive animation (energyBar.riv).

ViewModel: energyBarVM
  energyValue   — float 0.0-1.0
  colorProperty — color (ARGB int)
  strokeWeight  — float, default 1.5
Timeline: energyEngine
"""
from __future__ import annotations

from typing import Optional

from loguru import logger

from fuse.core.api import FuseContext, FusePlugin
from fuse.ui.panel import FusePanel
from fuse.ui.config_schema import ConfigCategory, ConfigEntry

_DEFAULT_COLOR_HIGH = "84FFB1"
_DEFAULT_COLOR_MID  = "FF9800"
_DEFAULT_COLOR_LOW  = "FF3935"


def _hex_to_argb(hex_str: str, fallback: int) -> int:
    try:
        s = str(hex_str).strip().lstrip("#")
        if len(s) == 6:
            return 0xFF000000 | int(s, 16)
        if len(s) == 8:
            return int(s, 16)
    except (ValueError, AttributeError):
        pass
    return fallback


class EnergyBarPlugin(FusePlugin):
    """Energy bar overlay powered by Rive animation."""

    requires_calibration = True
    calibration_stages = 2

    def __init__(self) -> None:
        self.ctx: Optional[FuseContext] = None
        self._mem = None
        self._anim = None
        self._panel: Optional[FusePanel] = None
        self._color_high    = 0xFF84FFB1
        self._color_mid     = 0xFFFF9800
        self._color_low     = 0xFFFF3935
        self._stroke_weight = 1.5
        self._rotation = 0.0

    def _energy_color(self, pct: int) -> int:
        if pct > 60:
            return self._color_high
        if pct > 30:
            return self._color_mid
        return self._color_low

    def _apply_stroke(self, raw: str) -> None:
        try:
            w = float(raw)
        except (TypeError, ValueError):
            return
        self._stroke_weight = w
        if self._anim:
            self._anim.vm_set_number("strokeWeight", w)

    def setup(self, ctx: FuseContext) -> None:
        self.ctx = ctx
        self._mem = ctx.services.get("game_memory")
        if self._mem is None:
            logger.warning("energy_bar_rive: 'game_memory' service not available — energy will read 0")

        ctx.config.defaults(
            bar_custom_pos=None,
            bar_custom_pos_fp=None,
            memory_chain="multiplayer_vehicle_energy",
            anim_width=300,
            anim_height=300,
            color_high=_DEFAULT_COLOR_HIGH,
            color_mid=_DEFAULT_COLOR_MID,
            color_low=_DEFAULT_COLOR_LOW,
            stroke_weight="1.5",
            rotation="0.0",
        ).load()

        ctx.config.schema([
            ConfigCategory("Memory Source", [
                ConfigEntry("memory_chain", "Pointer Chain", type="choice",
                            choices=["multiplayer_vehicle_energy", "training_vehicle_energy"],
                            description="Which pointer chain to read energy from"),
            ]),
            ConfigCategory("Colors", [
                ConfigEntry("color_high", "High Energy >60% (hex RGB)",
                            type="str", description="e.g. 84FFB1"),
                ConfigEntry("color_mid",  "Mid Energy >30% (hex RGB)",
                            type="str", description="e.g. FF9800"),
                ConfigEntry("color_low",  "Low Energy ≤30% (hex RGB)",
                            type="str", description="e.g. FF3935"),
            ]),
            ConfigCategory("Style", [
                ConfigEntry("stroke_weight", "Stroke Weight",
                            type="float", min=0.5, max=3.0, description="0.5 – 3.0"),
            ]),
            ConfigCategory("Animation", [
                ConfigEntry("anim_width",  "Render Width",  type="int", min=10, max=3000),
                ConfigEntry("anim_height", "Render Height", type="int", min=10, max=3000),
            ]),
            ConfigCategory("Rotation", [
                ConfigEntry("rotation", "Rotation (degrees)", type="float", min=-360.0, max=360.0),
            ]),
            ConfigCategory("Position", [
                ConfigEntry("bar_custom_pos",    "3rd Person Position", type="position"),
                ConfigEntry("bar_custom_pos_fp", "1st Person Position", type="position"),
            ]),
        ])

        self._color_high    = _hex_to_argb(ctx.config.get("color_high"), 0xFF84FFB1)
        self._color_mid     = _hex_to_argb(ctx.config.get("color_mid"),  0xFFFF9800)
        self._color_low     = _hex_to_argb(ctx.config.get("color_low"),  0xFFFF3935)
        try:
            self._stroke_weight = float(ctx.config.get("stroke_weight") or 1.5)
        except (TypeError, ValueError):
            self._stroke_weight = 1.5
        try:
            self._rotation = float(ctx.config.get("rotation") or 0.0)
        except (TypeError, ValueError):
            self._rotation = 0.0

        w = ctx.config.get("anim_width")
        h = ctx.config.get("anim_height")

        svc = ctx.services.get("rive_animation")
        if svc is None:
            logger.error("energy_bar_rive: 'rive_animation' service not available — plugin disabled")
            return

        self._anim = svc.create(w, h)

        if not self._anim.load_bytes(ctx.assets.read("rive/energyBar.riv")):
            logger.error("energy_bar_rive: failed to load energyBar.riv")
        else:
            self._anim.set_state_machine("energyEngine")
            self._anim.vm_bind("energyBarVM")
            self._anim.vm_set_number("energyValue", 0.5)
            self._anim.vm_set_color("colorProperty", self._energy_color(50))
            self._anim.vm_set_number("strokeWeight", self._stroke_weight)
            self._anim.vm_set_bool("isSetupComplete", False)
            self._anim.vm_set_string("state", "CALIBRATING 3rd PERSON")
            self._anim.advance(0)

        sw = ctx.tk_root.winfo_screenwidth()
        sh = ctx.tk_root.winfo_screenheight()
        default_x = (sw - w) // 2
        default_y = int(sh * 0.7) - h // 2

        self._panel = FusePanel(
            "HEAT Energy Bar Rive", "bar_custom_pos", ctx.config,
            config_key_fp="bar_custom_pos_fp",
            default_x=default_x, default_y=default_y,
        )
        self._panel.create(self._anim.get_image())
        self._panel.show()

        ctx.config.watch("color_high",
            lambda v: setattr(self, "_color_high", _hex_to_argb(v, 0xFF84FFB1)))
        ctx.config.watch("color_mid",
            lambda v: setattr(self, "_color_mid",  _hex_to_argb(v, 0xFFFF9800)))
        ctx.config.watch("color_low",
            lambda v: setattr(self, "_color_low",  _hex_to_argb(v, 0xFFFF3935)))
        ctx.config.watch("stroke_weight", self._apply_stroke)
        ctx.config.watch("rotation", self._apply_rotation)
    
    def _apply_rotation(self, raw: str) -> None:
        try:
            r = float(raw)
        except (TypeError, ValueError):
            return
        self._rotation = r
        if self._anim:
            self._anim.vm_set_number("rotation", r)
    
    def enter_calibrate(self, stage: int = 1) -> None:
        if self._panel:
            self._panel.enter_calibrate(stage)
        if self._anim:
            state_str = "CALIBRATING 1st PERSON" if stage == 2 else "CALIBRATING 3rd PERSON"
            self._anim.vm_set_bool("isSetupComplete", False)
            self._anim.vm_set_string("state", state_str)

    def enter_locked(self) -> None:
        if self._panel:
            self._panel.enter_locked()
        if self._anim:
            self._anim.vm_set_bool("isSetupComplete", True)
            self._anim.vm_set_string("state", "COMPLETE")

    def tick(self, dt: float) -> None:
        if self.ctx:
            self.ctx.config.check_reload()
        if not (self._anim and self._panel):
            return

        if self.ctx and self.ctx.state == "locked":
            pct = 0
            fp_flag = None
            if self._mem is not None:
                val = self._mem.read(self.ctx.config.get("memory_chain", "multiplayer_vehicle_energy"))
                if val is not None:
                    pct = max(0, min(100, int(val)))
                fp_flag = self._mem.read("multiplayer_is_fp_view")
            self._panel.update_view(fp_flag)
            self._anim.vm_set_number("energyValue", pct / 100.0)
            self._anim.vm_set_color("colorProperty", self._energy_color(pct))
            self._anim.vm_set_number("strokeWeight", self._stroke_weight)
            self._anim.vm_set_number("rotation", self._rotation)

        self._anim.advance(dt)
        self._panel.update(self._anim.get_image())

    def teardown(self) -> None:
        if self._panel:
            try:
                self._panel.persist_position()
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


__all__ = ["EnergyBarPlugin"]
