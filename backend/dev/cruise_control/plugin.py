from __future__ import annotations

from typing import Optional

from loguru import logger

from fuse.core.api import FuseContext, FusePlugin
from fuse.ui.panel import FusePanel
from fuse.ui.config_schema import ConfigCategory, ConfigEntry


class CruiseControlPlugin(FusePlugin):
    requires_calibration = True
    calibration_stages = 1

    def __init__(self) -> None:
        self.ctx: Optional[FuseContext] = None
        self._kbd = None
        self._anim = None
        self._panel: Optional[FusePanel] = None
        self._active = False  # True while cruise is holding W
        self._toggle_combo = "c"

    def setup(self, ctx: FuseContext) -> None:
        self.ctx = ctx
        self._kbd = ctx.services.get("keyboard")
        if self._kbd is None:
            logger.error("cruise_control: 'keyboard' service not available - plugin inactive")

        ctx.config.defaults(
            overlay_pos=None,
            anim_width=300,
            anim_height=300,
        ).load()

        ctx.config.schema([
            ConfigCategory("Animation", [
                ConfigEntry("anim_width",  "Render Width",  type="int", min=10, max=3000),
                ConfigEntry("anim_height", "Render Height", type="int", min=10, max=3000),
            ]),
            ConfigCategory("Position", [
                ConfigEntry("overlay_pos", "Overlay Position", type="position"),
            ]),
        ])

        w = int(ctx.config.get("anim_width") or 300)
        h = int(ctx.config.get("anim_height") or 300)

        svc = ctx.services.get("rive_animation")
        if svc is not None:
            try:
                self._anim = svc.create(w, h)
                if not self._anim.load_bytes(ctx.assets.read("rive/cruiseControl.riv")):
                    logger.error("cruise_control: failed to load cruiseControl.riv")
                    self._anim = None
                else:
                    self._anim.set_artboard("CRUISEBOARD")
                    self._anim.set_state_machine("cruiseControl")
                    self._anim.vm_bind("VmCruiseControl")
                    self._anim.vm_set_bool("isSetupComplete", False)
                    self._anim.vm_set_bool("isCruiseOn", False)
                    self._anim.advance(0)
            except Exception as e:
                logger.error(f"cruise_control: could not load Rive asset: {e}")
                self._anim = None
        else:
            logger.warning("cruise_control: 'rive_animation' service not available - no overlay")

        sw = ctx.tk_root.winfo_screenwidth()
        sh = ctx.tk_root.winfo_screenheight()
        default_x = (sw - w) // 2
        default_y = int(sh * 0.7) - h // 2

        self._panel = FusePanel(
            "HEAT Cruise Control", "overlay_pos", ctx.config,
            default_x=default_x, default_y=default_y,
        )
        if self._anim is not None:
            self._panel.create(self._anim.get_image())
        else:
            from PIL import Image
            self._panel.create(Image.new("RGBA", (w, h), (0, 0, 0, 0)))
        self._panel.show()

        self._toggle_combo = ctx.hotkey_for("toggle", "c")
        ctx.hotkeys.register(self._toggle_combo, self._on_toggle, label="Toggle Cruise Control")
        ctx.hotkeys.register("s", self._on_s, label="Cruise Control Release")

    # key handlers

    def _set_cruise(self, on: bool) -> None:
        if self._anim:
            self._anim.vm_set_bool("isCruiseOn", on)

    def _on_toggle(self) -> None:
        if self.ctx is None or self.ctx.state != "locked":
            return
        if self._kbd is None:
            return
        if self._active:
            self._release_all()
        else:
            self._kbd.press("w")
            self._active = True
            self._set_cruise(True)

    def _on_s(self) -> None:
        if self.ctx is None or self.ctx.state != "locked":
            return
        if self._kbd is None:
            return
        if self._active:
            self._release_all()

    # lifecycle

    def enter_calibrate(self, stage: int = 1) -> None:
        self._release_all()
        if self._panel:
            self._panel.enter_calibrate(stage)
        if self._anim:
            self._anim.vm_set_bool("isSetupComplete", False)
            self._anim.vm_set_bool("isCruiseOn", False)

    def enter_locked(self) -> None:
        if self._panel:
            self._panel.enter_locked()
        if self._anim:
            self._anim.vm_set_bool("isSetupComplete", True)
            self._anim.vm_set_bool("isCruiseOn", False)

    def tick(self, dt: float) -> None:
        if self.ctx:
            self.ctx.config.check_reload()
        # Re-press W each tick while active — the user's physical key-up
        # cancels our synthetic key-down, so we must re-assert it.
        if self._kbd is not None and self._active and self.ctx and self.ctx.state == "locked":
            self._kbd.press("w")
        if not (self._anim and self._panel):
            return
        self._anim.advance(dt)
        self._panel.update(self._anim.get_image())

    def set_overlay_visible(self, visible: bool) -> None:
        if self.ctx and self.ctx.state == "calibrate":
            return
        if not visible:
            self._release_all()
        if self._panel:
            self._panel.show() if visible else self._panel.hide()

    def teardown(self) -> None:
        self._release_all()
        if self.ctx:
            self.ctx.hotkeys.unregister(self._toggle_combo)
            self.ctx.hotkeys.unregister("s")
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

    def _release_all(self) -> None:
        if self._kbd is None:
            return
        self._kbd.release("w")
        self._active = False
        self._set_cruise(False)


__all__ = ["CruiseControlPlugin"]
