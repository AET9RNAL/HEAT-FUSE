"""PluginAssets — high-level asset loader for FUSE plugins.

Wraps the plugin's ``assets/`` Traversable (either a ``pathlib.Path`` for
built-in plugins or a ``zipfile.Path`` for ``.fuse`` archive plugins) and
exposes a clean API so plugin code never touches ``importlib.resources``,
raw ``io.BytesIO`` wrapping, PIL, or Win32 GDI directly.

Obtained via ``ctx.assets`` inside ``FusePlugin.setup()``.
"""
from __future__ import annotations

import io
from typing import TYPE_CHECKING

from loguru import logger

if TYPE_CHECKING:
    from PIL import Image as _PILImage


class PluginAssets:
    """Asset accessor bound to a plugin's ``assets/`` directory.

    Works identically whether the plugin is loaded from a folder
    (``pathlib.Path``) or a ``.fuse`` ZIP archive (``zipfile.Path``).
    """

    def __init__(self, assets_root) -> None:
        # Traversable: pathlib.Path for built-ins/dev, zipfile.Path for .fuse.
        self._root = assets_root

    # ------------------------------------------------------------------
    # Primitives
    # ------------------------------------------------------------------

    def read(self, rel_path: str) -> bytes:
        """Return the raw bytes of an asset file.

        Works for any asset type: sounds, Rive files, raw data, etc.
        """
        return (self._root / rel_path).read_bytes()

    def open(self, rel_path: str) -> io.BytesIO:
        """Return a *seekable* ``BytesIO`` for the asset.

        Use this wherever PIL ``Image.open()`` or ``ImageFont.truetype()``
        is called — ``zipfile.Path.open()`` returns a non-seekable stream
        and PIL requires seeking.
        """
        return io.BytesIO(self.read(rel_path))

    def exists(self, rel_path: str) -> bool:
        """Return True if the asset exists inside the plugin's assets dir."""
        return (self._root / rel_path).is_file()

    # ------------------------------------------------------------------
    # High-level helpers
    # ------------------------------------------------------------------

    def load_image(self, rel_path: str) -> "_PILImage.Image":
        """Load an image and return it as an RGBA ``PIL.Image``."""
        from PIL import Image
        try:
            return Image.open(self.open(rel_path)).convert("RGBA")
        except Exception as e:
            logger.warning(f"assets: could not load image {rel_path!r}: {e}")
            raise

    def load_font(self, rel_path: str, key: str) -> bool:
        """Register a font with the OS using ``AddFontMemResourceEx``.

        *key* is an arbitrary dedup handle (e.g. ``'montserrat'``).
        Idempotent — calling twice with the same key is a no-op.
        Returns True on success, False on failure or non-Windows.
        """
        from fuse.ui.fonts import load_font_from_bytes
        try:
            data = self.read(rel_path)
        except Exception as e:
            logger.warning(f"assets: could not read font {rel_path!r}: {e}")
            return False
        return load_font_from_bytes(data, key)

    def load_sound(self, rel_path: str) -> bytes:
        """Return WAV bytes ready for ``winsound.PlaySound(..., SND_MEMORY)``."""
        return self.read(rel_path)


__all__ = ["PluginAssets"]
