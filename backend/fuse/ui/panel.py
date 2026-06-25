"""FusePanel — LayeredWindow wrapper with config-backed position and
calibrate/locked state management.

Plugins that render per-pixel-alpha overlays can use FusePanel instead of
managing LayeredWindow state manually.  FusePanel handles:

* Position restore from config on creation.
* Draggable + click-through toggling on calibrate/locked state change.
* Position save to config on enter_locked().
* Optional dual-view calibration (3rd-person + 1st-person positions).

FusePanelGroup fans out enter_calibrate/enter_locked/show_all/hide_all to a
collection of panels.

Usage (single-view with config)::

    panel = FusePanel("hud_name", "hud_name_pos", ctx,
                      title="SACLOS HUD Name", default_x=100, default_y=50)
    panel.create(pil_rgba_image)
    panel.enter_calibrate()   # draggable, click-enabled, visible
    panel.enter_locked()      # saves position, click-through, visible

Usage (dual-view — plugin must set calibration_stages = 2)::

    panel = FusePanel("hud_name", "hud_pos_3p", ctx,
                      config_key_fp="hud_pos_1p",
                      fp_zoom_max=4,
                      default_x=100, default_y=50)
    # Stage 1 (3P): user drags to 3rd-person reticle
    panel.enter_calibrate(stage=1)
    # Host advances to stage 2 on Ctrl+L — panel saves 3P pos automatically
    panel.enter_calibrate(stage=2)   # user now drags to 1st-person reticle
    panel.enter_locked()             # saves 1P pos
    # At runtime call update_view() each tick to reposition by view flag:
    panel.update_view(mem.read("multiplayer_is_fp_view"))

Usage (no config — draggable/locked lifecycle only)::

    panel = FusePanel("hud_name", default_x=100, default_y=50)
    panel.create(pil_rgba_image)
    panel.enter_calibrate()

    # animation frame — no position snap:
    panel.update(new_image)
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from PIL import Image

from fuse.ui.layered_window import LayeredWindow

if TYPE_CHECKING:
    from fuse.core.api import FuseContext


class FusePanel:
    """One LayeredWindow with optional config-backed position and calibrate/locked lifecycle."""

    def __init__(
        self,
        name: str,
        config_key: str = None,
        ctx_or_config=None,
        *,
        config_key_fp: str = None,
        title: str = "",
        default_x: int = 0,
        default_y: int = 0,
    ):
        """
        Parameters
        ----------
        name:
            Display/debug name for the window.
        config_key:
            Config key that stores ``[x, y]`` for the 3rd-person (or only)
            position.  When provided with ``ctx_or_config``, position is read
            from config on creation and saved on ``enter_locked()``.
            Pass ``None`` to skip config I/O.
        ctx_or_config:
            Either a ``FuseContext`` (``ctx.config`` is used) or a raw
            ``PluginConfig``.  May be ``None`` when config I/O is not needed.
        config_key_fp:
            Config key for the 1st-person position.  When set, the panel
            supports dual-view calibration (plugin must set
            ``calibration_stages = 2``).  ``update_view(fp_flag)`` then
            switches between the two positions at runtime.
        """
        self._name = name
        self._config_key = config_key
        self._config_key_fp = config_key_fp
        self._last_calib_stage: int = 1
        self._last_view_fp: bool | None = None  # None = unknown, forces first move

        # Accept FuseContext (has .config) or PluginConfig directly.
        if ctx_or_config is not None and hasattr(ctx_or_config, "config"):
            self._config = ctx_or_config.config
        else:
            self._config = ctx_or_config  # PluginConfig or None

        x, y = default_x, default_y
        if config_key and self._config is not None:
            saved = self._config.get(config_key)
            if saved and len(saved) >= 2:
                x = int(saved[0])
                y = int(saved[1])

        self._win = LayeredWindow(title or name, x=x, y=y)

    # ------------------------------------------------------------------
    # Lifecycle

    def create(self, image: Image.Image, global_alpha: int = 255) -> None:
        """Create the Win32 window and push the initial image."""
        self._win.create(image, global_alpha)

    def enter_calibrate(self, stage: int = 1) -> None:
        """Switch to interactive setup: draggable, not click-through, visible.

        For dual-view panels (``config_key_fp`` set):
        - stage 1: restore 3P position, make draggable.
        - stage 2: save current position as 3P, restore 1P position (or copy
          current position as default if no 1P saved yet), make draggable.
        """
        if stage == 2 and self._config_key_fp and self._config is not None:
            # Save the 3P position the user just set.
            self._save_position()
            # Restore saved 1P position, or stay at current pos as starting point.
            saved_fp = self._config.get(self._config_key_fp)
            if saved_fp and len(saved_fp) >= 2:
                self._win.move(int(saved_fp[0]), int(saved_fp[1]))
        self._last_calib_stage = stage
        self._last_view_fp = None  # reset so update_view() re-evaluates after lock
        self._win.set_draggable(True)
        self._win.set_click_through(False)
        self._win.show()

    def enter_locked(self) -> None:
        """Switch to operational mode: save position, not draggable, click-through, visible."""
        if self._last_calib_stage >= 2 and self._config_key_fp:
            self._save_position_fp()
        else:
            self._save_position()
        self._last_view_fp = None  # force update_view() to reposition on first call
        self._win.set_draggable(False)
        self._win.set_click_through(True)
        self._win.show()

    def update_view(self, fp_flag: int | None) -> None:
        """Reposition to 3P or 1P saved position based on *fp_flag*.

        *fp_flag* is the value of ``multiplayer_is_fp_view``: 1 = first-person,
        0 = third-person, None = unknown (no-op).

        Call from the plugin's ``tick()`` while in locked state.  No-op when
        ``config_key_fp`` is not set or no 1P position has been saved yet.
        Only moves the window when the view actually changes, so it is safe
        to call every tick.
        """
        if not self._win.is_created or not self._config_key_fp or self._config is None:
            return
        if fp_flag is None:
            return
        is_fp = bool(fp_flag)
        if is_fp == self._last_view_fp:
            return
        self._last_view_fp = is_fp
        key = self._config_key_fp if is_fp else self._config_key
        if key:
            saved = self._config.get(key)
            if saved and len(saved) >= 2:
                self._win.move(int(saved[0]), int(saved[1]))

    # ------------------------------------------------------------------
    # Display

    def show(self) -> None:
        self._win.show()

    def hide(self) -> None:
        self._win.hide()

    def update(self, image: Image.Image, *, x: int = None, y: int = None) -> None:
        """Update image.  Pass x, y for atomic reposition+repaint; omit for
        animation frames (no position snap during OS drag)."""
        self._win.update_image(image, x=x, y=y)

    def set_alpha(self, alpha: int) -> None:
        self._win.set_alpha(alpha)

    # ------------------------------------------------------------------
    # Position

    def move(self, x: int, y: int) -> None:
        self._win.move(x, y)

    def get_position(self) -> list[int]:
        return self._win.get_position()

    # ------------------------------------------------------------------
    # Misc

    def destroy(self) -> None:
        self._win.destroy()

    def ensure_topmost(self) -> None:
        self._win.ensure_topmost()

    @property
    def win(self) -> LayeredWindow:
        """Direct LayeredWindow access for plugin-specific operations."""
        return self._win

    @property
    def is_created(self) -> bool:
        return self._win.is_created

    # ------------------------------------------------------------------
    # Internal

    def persist_position(self) -> None:
        """Save current window position to the appropriate config key.

        Uses ``_last_view_fp`` to decide: FP key when in 1P view, 3P key
        otherwise.  Safe to call from ``teardown()``.
        """
        if self._last_view_fp is True:
            self._save_position_fp()
        elif self._last_view_fp is False:
            self._save_position()
        elif not self._config_key_fp:
            # Single-view panel: always safe to save current position.
            self._save_position()
        # Dual-view with unknown current view (None): positions were already
        # saved correctly at calibration/lock time — skip to avoid overwriting
        # bar_custom_pos with the FP-calibrated window position.

    def _save_position(self) -> None:
        if self._config_key and self._config is not None and self._win.is_created:
            pos = self._win.get_position()
            self._config.set(self._config_key, pos)

    def _save_position_fp(self) -> None:
        if self._config_key_fp and self._config is not None and self._win.is_created:
            pos = self._win.get_position()
            self._config.set(self._config_key_fp, pos)


class FusePanelGroup:
    """Ordered collection of FusePanel instances — fan-out for calibrate/locked."""

    def __init__(self) -> None:
        self._panels: list[FusePanel] = []

    def add(self, panel: FusePanel) -> FusePanel:
        """Register a panel and return it (for chaining)."""
        self._panels.append(panel)
        return panel

    def enter_calibrate(self, stage: int = 1) -> None:
        for p in self._panels:
            p.enter_calibrate(stage)

    def enter_locked(self) -> None:
        for p in self._panels:
            p.enter_locked()

    def update_view(self, zoom: int | None) -> None:
        """Fan out update_view() to all panels."""
        for p in self._panels:
            p.update_view(zoom)

    def show_all(self) -> None:
        for p in self._panels:
            p.show()

    def hide_all(self) -> None:
        for p in self._panels:
            p.hide()

    def destroy_all(self) -> None:
        for p in self._panels:
            p.destroy()

    def __iter__(self):
        return iter(self._panels)

    def __len__(self) -> int:
        return len(self._panels)


__all__ = ["FusePanel", "FusePanelGroup"]
