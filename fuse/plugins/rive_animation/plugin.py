"""FUSE core plugin — exposes Rive C++ runtime as the 'rive_animation' service.

Other plugins declare this as a dependency in their manifest::

    "dependencies": ["rive_animation"]

Then consume it in setup()::

    svc = ctx.services.require("rive_animation")   # → RiveAnimationService
    anim = svc.create(256, 256)                    # → RiveAnimation
    anim.load(ctx.assets_dir / "gauge.riv")
    anim.vm_bind("GaugeVM")

    # each frame (drive via AnimationLoop):
    anim.vm_set_number("heat", value)
    anim.advance(1 / 30)
    panel.update(anim.get_image())

Requires native/bin/rive_plugin.dll — see native/rive_plugin/CMakeLists.txt.
"""
from __future__ import annotations

from loguru import logger

from fuse.api import FuseContext, FusePlugin
from fuse.utils.rive_animation import RiveAnimation, _DLL_PATH


class RiveAnimationService:
    """Factory handed to consumer plugins via ctx.services.get('rive_animation')."""

    def create(self, width: int, height: int) -> RiveAnimation:
        """Return a new RiveAnimation context of the given pixel dimensions."""
        return RiveAnimation(width, height)


class RiveAnimationPlugin(FusePlugin):
    """Core FUSE plugin that registers the Rive animation service."""

    requires_calibration = False

    def setup(self, ctx: FuseContext) -> None:
        if not _DLL_PATH.exists():
            logger.error(
                f"rive_animation: DLL not found at {_DLL_PATH}. "
                "Build native/rive_plugin first (see CMakeLists.txt). "
                "The 'rive_animation' service will not be available."
            )
            return

        self._svc = RiveAnimationService()
        ctx.services.register("rive_animation", self._svc, owner=self.name)
        self._ctx = ctx
        logger.info(f"rive_animation: service registered (DLL: {_DLL_PATH})")

    def teardown(self) -> None:
        if hasattr(self, "_ctx"):
            self._ctx.services.unregister("rive_animation")


__all__ = ["RiveAnimationPlugin"]
