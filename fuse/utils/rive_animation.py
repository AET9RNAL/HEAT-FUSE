"""Ctypes wrapper around native/bin/rive_plugin.dll.

Usage::

    from fuse.utils.rive_animation import RiveAnimation

    anim = RiveAnimation(256, 256)
    anim.load(Path("assets/gauge.riv"))
    anim.vm_bind("GaugeVM")

    # each frame:
    anim.vm_set_number("heat", current_heat)
    anim.advance(1 / 30)
    pil_image = anim.get_image()   # straight-alpha RGBA, ready for FusePanel

    anim.close()

The DLL must be built first — see native/rive_plugin/CMakeLists.txt.
Output lands at native/bin/rive_plugin.dll.
"""
from __future__ import annotations

import ctypes
import ctypes.wintypes as wt
from pathlib import Path
from typing import Optional

from PIL import Image

from fuse.utils.paths import REPO_ROOT

_DLL_PATH = REPO_ROOT / "native" / "bin" / "rive_plugin.dll"

# ---------------------------------------------------------------------------
# DLL loading (once at module import)
# ---------------------------------------------------------------------------

_lib: Optional[ctypes.CDLL] = None
_load_error: Optional[str] = None

try:
    _lib = ctypes.CDLL(str(_DLL_PATH))

    _lib.rive_create.argtypes  = [ctypes.c_int, ctypes.c_int]
    _lib.rive_create.restype   = ctypes.c_void_p

    _lib.rive_destroy.argtypes = [ctypes.c_void_p]
    _lib.rive_destroy.restype  = None

    _lib.rive_load_file.argtypes  = [ctypes.c_void_p, ctypes.c_char_p]
    _lib.rive_load_file.restype   = ctypes.c_int

    _lib.rive_load_bytes.argtypes = [ctypes.c_void_p, ctypes.c_char_p, ctypes.c_size_t]
    _lib.rive_load_bytes.restype  = ctypes.c_int

    # State machine
    _lib.rive_set_state_machine.argtypes = [ctypes.c_void_p, ctypes.c_char_p]
    _lib.rive_set_state_machine.restype  = None

    _lib.rive_sm_bool.argtypes    = [ctypes.c_void_p, ctypes.c_char_p, ctypes.c_int]
    _lib.rive_sm_bool.restype     = None

    _lib.rive_sm_number.argtypes  = [ctypes.c_void_p, ctypes.c_char_p, ctypes.c_float]
    _lib.rive_sm_number.restype   = None

    _lib.rive_sm_trigger.argtypes = [ctypes.c_void_p, ctypes.c_char_p]
    _lib.rive_sm_trigger.restype  = None

    # ViewModel
    _lib.rive_vm_bind.argtypes       = [ctypes.c_void_p, ctypes.c_char_p]
    _lib.rive_vm_bind.restype        = None

    _lib.rive_vm_set_number.argtypes = [ctypes.c_void_p, ctypes.c_char_p, ctypes.c_float]
    _lib.rive_vm_set_number.restype  = None

    _lib.rive_vm_set_bool.argtypes   = [ctypes.c_void_p, ctypes.c_char_p, ctypes.c_int]
    _lib.rive_vm_set_bool.restype    = None

    _lib.rive_vm_set_string.argtypes = [ctypes.c_void_p, ctypes.c_char_p, ctypes.c_char_p]
    _lib.rive_vm_set_string.restype  = None

    _lib.rive_vm_set_color.argtypes  = [ctypes.c_void_p, ctypes.c_char_p, ctypes.c_uint32]
    _lib.rive_vm_set_color.restype   = None

    _lib.rive_vm_set_enum.argtypes   = [ctypes.c_void_p, ctypes.c_char_p, ctypes.c_char_p]
    _lib.rive_vm_set_enum.restype    = None

    _lib.rive_vm_trigger.argtypes    = [ctypes.c_void_p, ctypes.c_char_p]
    _lib.rive_vm_trigger.restype     = None

    _lib.rive_vm_get_number.argtypes = [ctypes.c_void_p, ctypes.c_char_p]
    _lib.rive_vm_get_number.restype  = ctypes.c_float

    _lib.rive_vm_get_bool.argtypes   = [ctypes.c_void_p, ctypes.c_char_p]
    _lib.rive_vm_get_bool.restype    = ctypes.c_int

    # Rendering
    _lib.rive_advance.argtypes = [ctypes.c_void_p, ctypes.c_float]
    _lib.rive_advance.restype  = None

    _lib.rive_render.argtypes  = [ctypes.c_void_p, ctypes.c_char_p]
    _lib.rive_render.restype   = None

except OSError as exc:
    _load_error = str(exc)


# ---------------------------------------------------------------------------
# Public class
# ---------------------------------------------------------------------------

class RiveAnimation:
    """Wraps one Rive artboard for offscreen rendering.

    Each instance has its own D3D11 WARP device and pixel buffer.
    Call close() or use as a context manager to release GPU resources.
    """

    def __init__(self, width: int, height: int) -> None:
        if _lib is None:
            raise RuntimeError(
                f"rive_plugin.dll not found — build native/rive_plugin first.\n"
                f"Expected: {_DLL_PATH}\nError: {_load_error}"
            )
        self._w = width
        self._h = height
        self._handle = _lib.rive_create(width, height)
        if not self._handle:
            raise RuntimeError("rive_create() failed — D3D11 WARP device could not be created")
        self._buf = (ctypes.c_uint8 * (width * height * 4))()

    # ------------------------------------------------------------------
    # Content loading
    # ------------------------------------------------------------------

    def load(self, path: Path) -> bool:
        """Load a .riv file. Returns True on success."""
        return bool(_lib.rive_load_file(self._handle, str(path).encode()))

    def load_bytes(self, data: bytes) -> bool:
        """Load a .riv from a bytes object. Returns True on success."""
        return bool(_lib.rive_load_bytes(self._handle, data, len(data)))

    # ------------------------------------------------------------------
    # State machine (legacy input API)
    # ------------------------------------------------------------------

    def set_state_machine(self, name: str) -> None:
        _lib.rive_set_state_machine(self._handle, name.encode())

    def sm_bool(self, name: str, value: bool) -> None:
        _lib.rive_sm_bool(self._handle, name.encode(), int(value))

    def sm_number(self, name: str, value: float) -> None:
        _lib.rive_sm_number(self._handle, name.encode(), value)

    def sm_trigger(self, name: str) -> None:
        _lib.rive_sm_trigger(self._handle, name.encode())

    # ------------------------------------------------------------------
    # ViewModel (modern data binding)
    # Path syntax: "property" or "nested/property"
    # ------------------------------------------------------------------

    def vm_bind(self, vm_name: str) -> None:
        """Create and bind a ViewModel instance by name from the loaded file."""
        _lib.rive_vm_bind(self._handle, vm_name.encode())

    def vm_set_number(self, path: str, value: float) -> None:
        _lib.rive_vm_set_number(self._handle, path.encode(), value)

    def vm_set_bool(self, path: str, value: bool) -> None:
        _lib.rive_vm_set_bool(self._handle, path.encode(), int(value))

    def vm_set_string(self, path: str, value: str) -> None:
        _lib.rive_vm_set_string(self._handle, path.encode(), value.encode())

    def vm_set_color(self, path: str, argb: int) -> None:
        """Set a color property. argb is a 32-bit ARGB integer (0xFFRRGGBB)."""
        _lib.rive_vm_set_color(self._handle, path.encode(), ctypes.c_uint32(argb))

    def vm_set_enum(self, path: str, label: str) -> None:
        _lib.rive_vm_set_enum(self._handle, path.encode(), label.encode())

    def vm_trigger(self, path: str) -> None:
        _lib.rive_vm_trigger(self._handle, path.encode())

    def vm_get_number(self, path: str) -> float:
        return float(_lib.rive_vm_get_number(self._handle, path.encode()))

    def vm_get_bool(self, path: str) -> bool:
        return bool(_lib.rive_vm_get_bool(self._handle, path.encode()))

    # ------------------------------------------------------------------
    # Rendering
    # ------------------------------------------------------------------

    def advance(self, dt: float) -> None:
        """Advance animation state by dt seconds."""
        _lib.rive_advance(self._handle, dt)

    def get_image(self) -> Image.Image:
        """Render current frame and return a straight-alpha RGBA PIL Image."""
        _lib.rive_render(self._handle, self._buf)
        return Image.frombuffer(
            "RGBA",
            (self._w, self._h),
            bytes(self._buf),
            "raw", "RGBA", 0, 1,
        )

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    def close(self) -> None:
        if self._handle:
            _lib.rive_destroy(self._handle)
            self._handle = None

    def __enter__(self) -> "RiveAnimation":
        return self

    def __exit__(self, *_) -> None:
        self.close()

    def __del__(self) -> None:
        self.close()


__all__ = ["RiveAnimation"]
