"""FUSE plugin wrapper for HEAT AILOS-TORC.

Exposes the ML-assisted SACLOS overlay (predictor / trainer / refiner)
as a first-class FUSE plugin.  All persistent state — calibration,
HUD layout, ML params — goes through ``ctx.config`` (``PluginConfig``).

Standalone entry points (``runner.py``, ``predictor/main.py``, …) remain
fully functional; this plugin is an additional integration path.
"""
from __future__ import annotations

import tkinter as tk
from typing import TYPE_CHECKING

from fuse.api import FuseContext, FusePlugin

if TYPE_CHECKING:
    from overlay.heat.plugins.heat_ailos_torc.ui.base_overlay import BaseSACLOSOverlay


class HeatAilosTorcPlugin(FusePlugin):
    """FUSE wrapper for the HEAT AILOS-TORC SACLOS overlay."""

    requires_calibration = True

    def setup(self, ctx: FuseContext) -> None:
        # Host pre-seeds manifest default_config; load merges with on-disk.
        ctx.config.load()

        from fuse.utils.hardware_inject_router import is_admin, connect
        if not is_admin():
            ctx.logger.warning(
                "Not running as Administrator — SendInput events may be "
                "blocked by elevated game windows (UIPI)."
            )
        connect()
        self._hw_connected = True
        self._ctx = ctx
        self._overlay: BaseSACLOSOverlay | None = None

        profile, mode = self._pick(ctx)
        ctx.config.set("mode", mode)
        ctx.config.set("profile_name", profile.name)
        ctx.logger.info(
            f"heat_ailos_torc: mode={mode} profile={profile.name} "
            f"({profile.vehicle_label})"
        )

        if mode == "predictor":
            from overlay.heat.plugins.heat_ailos_torc.predictor.main import open_overlay
            self._overlay = open_overlay(
                ctx.tk_root,
                profile,
                fuse_config=ctx.config,
                ml_enabled=ctx.config.get("ml_enabled"),
                ml_confidence=ctx.config.get("ml_confidence_threshold"),
            )
        elif mode == "trainer":
            from overlay.heat.plugins.heat_ailos_torc.trainer.main import open_overlay
            self._overlay = open_overlay(ctx.tk_root, profile, fuse_config=ctx.config)
        elif mode == "refiner":
            from overlay.heat.plugins.heat_ailos_torc.refiner.main import open_editor
            self._overlay = open_editor(ctx.tk_root, profile)
        else:
            ctx.logger.error(f"heat_ailos_torc: unknown mode {mode!r} — aborting setup.")

    def enter_calibrate(self) -> None:
        if self._overlay and hasattr(self._overlay, "_on_calibrate"):
            self._overlay._on_calibrate()

    def enter_locked(self) -> None:
        if self._overlay and hasattr(self._overlay, "_on_locked"):
            self._overlay._on_locked()

    def tick(self, dt: float) -> None:
        pass  # overlay drives itself via pynput listeners and root.after() chains

    def teardown(self) -> None:
        from fuse.utils.hardware_inject_router import disconnect
        if getattr(self, "_hw_connected", False):
            try:
                disconnect()
            except Exception:
                pass
            self._hw_connected = False

        if self._overlay and hasattr(self._overlay, "_fuse_teardown"):
            try:
                self._overlay._fuse_teardown()
            except Exception as e:
                if hasattr(self, "_ctx") and self._ctx.logger:
                    self._ctx.logger.exception(f"teardown error: {e}")

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _pick(self, ctx: FuseContext):
        """Return (MLProfile, mode_str).

        Skips the picker if both profile_name and mode are already persisted.
        Otherwise shows a blocking Toplevel modal (safe because setup() runs
        before the FUSE mainloop starts).
        """
        from overlay.heat.plugins.heat_ailos_torc.profiles import (
            default_profile_name, list_profiles, load_profile, set_default,
        )
        from overlay.heat.plugins.heat_ailos_torc.runner import _build_picker_dialog

        pname = ctx.config.get("profile_name")
        mode = ctx.config.get("mode", "predictor")

        if pname:
            try:
                return load_profile(pname), mode
            except Exception:
                ctx.logger.warning(
                    f"heat_ailos_torc: saved profile {pname!r} not found — showing picker."
                )

        profiles = list_profiles()
        if not profiles:
            raise RuntimeError(
                "heat_ailos_torc: no ML profiles registered in data/ml/ml_profiles.json"
            )

        default = default_profile_name()
        result: dict = {}

        dlg = tk.Toplevel(ctx.tk_root)
        _build_picker_dialog(dlg, profiles, default, result)
        ctx.tk_root.wait_window(dlg)

        if not result:
            raise RuntimeError("heat_ailos_torc: profile picker cancelled.")

        set_default(result["profile"])
        return load_profile(result["profile"]), result["mode"]


__all__ = ["HeatAilosTorcPlugin"]
