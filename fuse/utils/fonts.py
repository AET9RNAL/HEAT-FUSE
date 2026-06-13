"""Font loading utility for FUSE — registers TrueType fonts with Windows GDI.

Call `load_font(path)` before any Tk window is created so that the font
family name becomes available to Tk widget `font=` parameters.
"""
from __future__ import annotations

import sys
from pathlib import Path

from loguru import logger

_WINDOWS = sys.platform == "win32"

if _WINDOWS:
    import ctypes
    _gdi32 = ctypes.windll.gdi32
    _FR_PRIVATE = 0x10  # font visible only to this process

_loaded: set[str] = set()


def load_font(path: Path | str) -> bool:
    """Register a .ttf/.otf file with the OS for use in Tk font names.

    Idempotent — calling twice with the same resolved path is a no-op.
    Returns True on success, False on failure or non-Windows.
    """
    if not _WINDOWS:
        return False
    path = Path(path).resolve()
    key = str(path).lower()
    if key in _loaded:
        return True
    if not path.exists():
        logger.warning(f"fonts: file not found: {path}")
        return False
    result = _gdi32.AddFontResourceExW(str(path), _FR_PRIVATE, None)
    if result == 0:
        logger.warning(f"fonts: AddFontResourceExW returned 0 for {path.name}")
        return False
    _loaded.add(key)
    logger.debug(f"fonts: registered {path.name}")
    return True
