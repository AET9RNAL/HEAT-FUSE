"""Font loading utility for FUSE — registers TrueType fonts with Windows GDI.

Call `load_font(path)` before any Tk window is created so that the font
family name becomes available to Tk widget `font=` parameters.

For .fuse archive plugins use `load_font_from_bytes(data, key)` instead —
it uses AddFontMemResourceEx so no temp file is needed.
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
    # Set restype once at module load to prevent 64-bit handle truncation.
    _gdi32.AddFontMemResourceEx.restype = ctypes.c_void_p

_loaded: set[str] = set()
# key -> (handle, data_buf): data_buf must stay alive while font is in use.
_mem_handles: dict[str, tuple] = {}


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


def load_font_from_bytes(data: bytes, key: str) -> bool:
    """Register a font from a bytes buffer using AddFontMemResourceEx.

    Idempotent on *key*. No temp file needed — suitable for .fuse plugins.
    *key* is an arbitrary dedup handle (e.g. 'montserrat').
    Returns True on success, False on failure or non-Windows.
    """
    if not _WINDOWS:
        return False
    if key in _mem_handles:
        return True
    buf = (ctypes.c_char * len(data)).from_buffer_copy(data)
    num = ctypes.c_uint32(0)
    handle = _gdi32.AddFontMemResourceEx(buf, len(data), None, ctypes.byref(num))
    if not handle:
        logger.warning(f"fonts: AddFontMemResourceEx returned NULL for key={key!r}")
        return False
    _mem_handles[key] = (handle, buf)
    logger.debug(f"fonts: registered in-memory font key={key!r}")
    return True


def unload_mem_fonts() -> None:
    """Remove all in-memory fonts registered via load_font_from_bytes. Call on shutdown."""
    if not _WINDOWS:
        return
    for key, (handle, _buf) in list(_mem_handles.items()):
        try:
            _gdi32.RemoveFontMemResourceEx(handle)
        except Exception:
            pass
    _mem_handles.clear()
