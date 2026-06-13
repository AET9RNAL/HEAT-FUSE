"""FUSE plugin wrapper for HEAT AILOS-TORC.

Exposes the ML-assisted SACLOS overlay (predictor / trainer / refiner)
as a first-class FUSE plugin.  All persistent state — calibration,
HUD layout, ML params — goes through ``ctx.config`` (``PluginConfig``).

Standalone entry points (``runner.py``, ``predictor/main.py``, …) remain
fully functional; this plugin is an additional integration path.
"""
from __future__ import annotations

import threading
import tkinter as tk
from typing import TYPE_CHECKING

from fuse.api import FuseContext, FusePlugin
from fuse.ui.config_schema import ConfigCategory, ConfigEntry
from fuse.utils.fonts import load_font
from overlay.heat.plugins.heat_ailos_torc import ASSETS_DIR as _AILOS_ASSETS_DIR

if TYPE_CHECKING:
    from overlay.heat.plugins.heat_ailos_torc.ui.base_overlay import BaseSACLOSOverlay


class HeatAilosTorcPlugin(FusePlugin):
    """FUSE wrapper for the HEAT AILOS-TORC SACLOS overlay."""

    requires_calibration = True

    def setup(self, ctx: FuseContext) -> None:
        load_font(_AILOS_ASSETS_DIR / "Montserrat-VariableFont_wght.ttf")
        load_font(_AILOS_ASSETS_DIR / "Montserrat-Italic-VariableFont_wght.ttf")
        # Host pre-seeds manifest default_config; load merges with on-disk.
        ctx.config.load()

        ctx.config.schema([
            ConfigCategory("ML", [
                ConfigEntry("ml_enabled",              "ML Enabled",            type="bool"),
                ConfigEntry("ml_confidence_threshold", "Confidence Threshold",  type="float", min=0.0, max=1.0),
                ConfigEntry("ml_online_learning",      "Online Learning",       type="bool"),
                ConfigEntry("attn_enabled",            "Attention Enabled",     type="bool"),
                ConfigEntry("attn_lr",                 "Attention LR",          type="float", min=0.001, max=1.0),
            ]),
            ConfigCategory("Correction", [
                ConfigEntry("correction_enabled",              "Correction Enabled",     type="bool"),
                ConfigEntry("correction_speed_multiplier",     "Speed Multiplier",       type="float", min=0.1, max=5.0),
                ConfigEntry("correction_min_threshold_px",    "Min Threshold (px)",     type="float", min=0.0, max=50.0),
                ConfigEntry("mouse_sensitivity_scale",         "Mouse Sensitivity",      type="float", min=0.1, max=5.0),
            ]),
            ConfigCategory("Turret", [
                ConfigEntry("turret_traverse_speed_deg_s", "Traverse Speed (°/s)", type="float", min=1.0, max=360.0),
                ConfigEntry("pixels_per_degree",           "Pixels per Degree",    type="float", min=1.0, max=100.0),
            ]),
            ConfigCategory("Input", [
                ConfigEntry("input_backend", "Input Backend", type="choice",
                            choices=["arduino", "sendinput", "none"]),
                ConfigEntry("tracking_key_name", "Track Key",    type="str"),
                ConfigEntry("rf_key_name",        "Rangefinder Key", type="str"),
            ]),
            ConfigCategory("HUD Positions", [
                ConfigEntry("hud_name_pos",       "Name",       type="position"),
                ConfigEntry("hud_descriptor_pos", "Descriptor", type="position"),
                ConfigEntry("hud_range_pos",      "Range",      type="position"),
                ConfigEntry("hud_status_pos",     "Status",     type="position"),
            ]),
        ])

        from fuse.utils.hardware_inject_router import is_admin, init_backend
        init_backend(ctx.config.get("input_backend", "arduino"))
        if not is_admin():
            ctx.logger.warning(
                "Not running as Administrator — SendInput events may be "
                "blocked by elevated game windows (UIPI)."
            )
        # Run connect() on a daemon thread — the Arduino backend sleeps 2s
        # during initialization, which would freeze the Tk main thread.
        # Import connect inside the closure so it resolves AFTER init_backend
        # has pointed the router at the correct backend module.
        self._hw_connected = False
        def _connect_hw():
            from fuse.utils.hardware_inject_router import connect
            if connect():
                self._hw_connected = True
        threading.Thread(target=_connect_hw, daemon=True).start()
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

        # Wire optional 'game_memory' service into the overlay so the range
        # source can be flipped to memory via USE_MEMORY_API in base_overlay.py.
        if self._overlay is not None:
            mem = ctx.services.get("game_memory")
            if mem is not None:
                self._overlay._game_memory = mem
                ctx.logger.info("heat_ailos_torc: connected to 'game_memory' service")
            else:
                ctx.logger.debug(
                    "heat_ailos_torc: 'game_memory' service not available — "
                    "OCR fallback will be used regardless of USE_MEMORY_API."
                )
            self._setup_config_watchers(ctx)

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

    def _setup_config_watchers(self, ctx: FuseContext) -> None:
        """Register config.watch() callbacks so manager edits take effect live."""
        overlay = self._overlay
        if overlay is None:
            return

        # (config_key, overlay_attr, type_coerce)
        _float_attrs = [
            ("ml_confidence_threshold",     "ml_confidence_threshold",     float),
            ("attn_lr",                     "attn_lr",                     float),
            ("correction_speed_multiplier", "correction_speed_multiplier", float),
            ("correction_min_threshold_px", "correction_min_threshold_px", float),
            ("mouse_sensitivity_scale",     "mouse_sensitivity_scale",     float),
            ("turret_traverse_speed_deg_s", "turret_traverse_speed_deg_s", float),
            ("pixels_per_degree",           "pixels_per_degree",           float),
        ]
        _bool_attrs = [
            ("ml_enabled",           "ml_enabled"),
            ("ml_online_learning",   "ml_online_learning"),
            ("attn_enabled",         "attn_enabled"),
            ("correction_enabled",   "correction_enabled"),
            ("quick_label_enabled",  "quick_label_enabled"),
        ]

        for key, attr, coerce in _float_attrs:
            def _make_float_setter(a, c):
                def _set(v):
                    if hasattr(overlay, a):
                        try:
                            setattr(overlay, a, c(v))
                        except (TypeError, ValueError):
                            pass
                return _set
            ctx.config.watch(key, _make_float_setter(attr, coerce))

        for key, attr in _bool_attrs:
            def _make_bool_setter(a):
                def _set(v):
                    if hasattr(overlay, a):
                        setattr(overlay, a, bool(v))
                return _set
            ctx.config.watch(key, _make_bool_setter(attr))

        # input_backend: update both overlay attr AND the router so the change
        # takes effect immediately without a restart.
        def _on_backend_change(v):
            from fuse.utils.hardware_inject_router import init_backend
            init_backend(v)
            if hasattr(overlay, "input_backend"):
                overlay.input_backend = v
        ctx.config.watch("input_backend", _on_backend_change)

        # Fallback: any schema key without a specific watcher gets a plain
        # attr-sync watcher so _save_config() never writes stale overlay attrs.
        if ctx.config._schema:
            for _cat in ctx.config._schema:
                for _entry in _cat.entries:
                    if _entry.key not in ctx.config._watchers and hasattr(overlay, _entry.key):
                        def _make_sync(k):
                            return lambda v: setattr(overlay, k, v)
                        ctx.config.watch(_entry.key, _make_sync(_entry.key))

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
