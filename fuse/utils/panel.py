"""FusePanel — LayeredWindow wrapper with config-backed position and
calibrate/locked state management.

Plugins that render per-pixel-alpha overlays can use FusePanel instead of
managing LayeredWindow state manually.  FusePanel handles:

* Position restore from config on creation.
* Draggable + click-through toggling on calibrate/locked state change.
* Position save to config on enter_locked().

FusePanelGroup fans out enter_calibrate/enter_locked/show_all/hide_all to a
collection of panels.

Usage (with config)::

    panel = FusePanel("hud_name", "hud_name_pos", ctx,
                      title="SACLOS HUD Name", default_x=100, default_y=50)
    panel.create(pil_rgba_image)
    panel.enter_calibrate()   # draggable, click-enabled, visible
    panel.enter_locked()      # saves position, click-through, visible

Usage (no config — draggable/locked lifecycle only)::

    panel = FusePanel("hud_name", default_x=100, default_y=50)
    panel.create(pil_rgba_image)
    panel.enter_calibrate()

    # animation frame — no position snap:
    panel.update(new_image)
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from PIL import Image, ImageDraw

from fuse.utils.layered_window import LayeredWindow

if TYPE_CHECKING:
    from fuse.api import FuseContext


class FusePanel:
    """One LayeredWindow with optional config-backed position and calibrate/locked lifecycle."""

    def __init__(
        self,
        name: str,
        config_key: str = None,
        ctx_or_config=None,
        *,
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
            Config key that stores ``[x, y]``.  When provided together with
            ``ctx_or_config``, position is read from config on creation and
            saved on ``enter_locked()``.  Pass ``None`` to skip config I/O.
        ctx_or_config:
            Either a ``FuseContext`` (``ctx.config`` is used) or a raw
            ``PluginConfig``.  May be ``None`` when config I/O is not needed.
        """
        self._name = name
        self._config_key = config_key

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

    def enter_calibrate(self) -> None:
        """Switch to interactive setup: draggable, not click-through, visible."""
        self._win.set_draggable(True)
        self._win.set_click_through(False)
        self._win.show()

    def enter_locked(self) -> None:
        """Switch to operational mode: save position, not draggable, click-through, visible."""
        self._save_position()
        self._win.set_draggable(False)
        self._win.set_click_through(True)
        self._win.show()

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

    def _save_position(self) -> None:
        if self._config_key and self._config is not None and self._win.is_created:
            pos = self._win.get_position()
            self._config.set(self._config_key, pos)


class FusePanelGroup:
    """Ordered collection of FusePanel instances — fan-out for calibrate/locked."""

    def __init__(self) -> None:
        self._panels: list[FusePanel] = []

    def add(self, panel: FusePanel) -> FusePanel:
        """Register a panel and return it (for chaining)."""
        self._panels.append(panel)
        return panel

    def enter_calibrate(self) -> None:
        for p in self._panels:
            p.enter_calibrate()

    def enter_locked(self) -> None:
        for p in self._panels:
            p.enter_locked()

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


def calibrate_overlay(img: Image.Image, size: int = 5) -> Image.Image:
    """Return a copy of *img* with an X crosshair composited at center.

    Intended for calibrate-mode frames so the user can align the panel.
    Import from any plugin: ``from fuse.utils.panel import calibrate_overlay``
    """
    cx, cy = img.width // 2, img.height // 2
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(overlay)
    color = (255, 255, 255, 210)
    d.line((cx - size, cy - size, cx + size, cy + size), fill=color, width=2)
    d.line((cx - size, cy + size, cx + size, cy - size), fill=color, width=2)
    return Image.alpha_composite(img, overlay)


__all__ = ["FusePanel", "FusePanelGroup", "calibrate_overlay"]
