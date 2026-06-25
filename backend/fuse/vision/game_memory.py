from __future__ import annotations

import ctypes
import struct
from typing import Optional, Union

from loguru import logger

from fuse.utils.paths import REPO_ROOT

_DLL_PATH = REPO_ROOT / "native" / "bin" / "game_memory.dll"

# gm_result_t codes (must match game_memory.h)
_GM_OK              = 0
_GM_ERR_NOT_FOUND   = 1
_GM_ERR_ACCESS      = 2
_GM_ERR_DISCONNECTED = 3
_GM_ERR_UNKNOWN     = 4
_GM_ERR_NULL_PTR    = 5
_GM_ERR_READ        = 6
_GM_ERR_COOLDOWN    = 7

# gm_dtype_t → struct format (must match game_memory.h enum order)
_DTYPE_FMT: dict[int, tuple[str, bool]] = {
    0: ("<B", False),  # GM_UINT8
    1: ("<b", False),  # GM_INT8
    2: ("<H", False),  # GM_UINT16
    3: ("<h", False),  # GM_INT16
    4: ("<I", False),  # GM_UINT32
    5: ("<i", False),  # GM_INT32
    6: ("<Q", False),  # GM_UINT64
    7: ("<q", False),  # GM_INT64
    8: ("<f", True),   # GM_FLOAT
    9: ("<d", True),   # GM_DOUBLE
}

_dll: ctypes.CDLL | None = None


def _load_dll() -> ctypes.CDLL:
    global _dll
    if _dll is not None:
        return _dll
    if not _DLL_PATH.exists():
        raise RuntimeError(
            f"game_memory.dll not found at {_DLL_PATH}. "
            "Build it first: python scripts/gen_chains.py, "
            "then premake5 + msbuild in native/game_memory/."
        )
    lib = ctypes.CDLL(str(_DLL_PATH))
    lib.gm_open.argtypes         = [ctypes.c_char_p]
    lib.gm_open.restype          = ctypes.c_int
    lib.gm_close.argtypes        = []
    lib.gm_close.restype         = None
    lib.gm_is_connected.argtypes = []
    lib.gm_is_connected.restype  = ctypes.c_int
    lib.gm_read.argtypes         = [ctypes.c_char_p, ctypes.c_void_p]
    lib.gm_read.restype          = ctypes.c_int
    lib.gm_dtype.argtypes        = [ctypes.c_char_p]
    lib.gm_dtype.restype         = ctypes.c_int
    _dll = lib
    return lib


class GameMemory:
    """High-level read-only accessor for in-game values via game_memory.dll."""

    def __init__(self, process_name: str, chains=None) -> None:
        self._process_name = process_name
        self._dll          = _load_dll()
        self._dtype_cache: dict[str, int] = {}
        # chains arg accepted for API compat but ignored — baked into DLL
        if chains is not None:
            logger.debug("GameMemory: chains arg ignored (compiled into DLL)")

    # ---------------------------------------------------------------- connect

    def open(self) -> bool:
        rc = self._dll.gm_open(self._process_name.encode())
        if rc == _GM_OK:
            logger.info(f"GameMemory: connected to '{self._process_name}'")
            return True
        if rc == _GM_ERR_NOT_FOUND:
            logger.debug(f"GameMemory: process '{self._process_name}' not found")
        else:
            logger.warning(f"GameMemory: gm_open failed (rc={rc})")
        return False

    def close(self) -> None:
        self._dll.gm_close()

    @property
    def connected(self) -> bool:
        return bool(self._dll.gm_is_connected())

    def __enter__(self) -> "GameMemory":
        self.open()
        return self

    def __exit__(self, *_) -> None:
        self.close()

    # ------------------------------------------------------------------ read

    def read(self, name: str) -> Optional[Union[int, float]]:
        buf = (ctypes.c_uint8 * 8)()
        rc  = self._dll.gm_read(name.encode(), buf)

        if rc == _GM_OK:
            dtype = self._dtype_cache.get(name)
            if dtype is None:
                dtype = self._dll.gm_dtype(name.encode())
                self._dtype_cache[name] = dtype

            fmt, is_float = _DTYPE_FMT.get(dtype, ("<I", False))
            value = struct.unpack_from(fmt, bytes(buf))[0]
            return float(value) if is_float else int(value)

        if rc not in (_GM_ERR_COOLDOWN, _GM_ERR_DISCONNECTED, _GM_ERR_NULL_PTR):
            logger.debug(f"GameMemory: read({name!r}) rc={rc}")
        return None


__all__ = ["GameMemory"]
