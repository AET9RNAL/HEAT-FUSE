"""Generic screen-region capture used by every overlay.

A thin, dependency-light wrapper that prefers ``mss`` (3–8 ms per grab) and
falls back to PIL ``ImageGrab`` (~20 ms). Returns a contiguous ``numpy``
``uint8`` array shaped ``(H, W, 3)`` in RGB order.

Each thread keeps its own ``mss`` instance because ``mss.mss()`` objects are
not thread-safe.
"""
from __future__ import annotations

import threading
from typing import Optional, Sequence

import numpy as np

try:
    from PIL import ImageGrab  # type: ignore
    PIL_OK = True
except ImportError:  # pragma: no cover
    PIL_OK = False

try:
    import mss as _mss_lib  # type: ignore
    _mss_local = threading.local()
    MSS_OK = True
except ImportError:  # pragma: no cover
    MSS_OK = False


def grab_region_np(region: Sequence[int]) -> Optional[np.ndarray]:
    """Grab ``(x1, y1, x2, y2)`` and return an RGB ``uint8`` array, or ``None``."""
    x1, y1, x2, y2 = (int(region[0]), int(region[1]),
                      int(region[2]), int(region[3]))
    if MSS_OK:
        if not hasattr(_mss_local, "sct"):
            _mss_local.sct = _mss_lib.mss()
        mon = {"left": x1, "top": y1, "width": x2 - x1, "height": y2 - y1}
        sct_img = _mss_local.sct.grab(mon)
        img_np = np.frombuffer(sct_img.bgra, dtype=np.uint8).reshape(
            sct_img.height, sct_img.width, 4)
        return img_np[:, :, [2, 1, 0]]
    if PIL_OK:
        pil_img = ImageGrab.grab(bbox=(x1, y1, x2, y2))
        return np.array(pil_img.convert("RGB"), dtype=np.uint8)
    return None


__all__ = ["grab_region_np", "MSS_OK", "PIL_OK"]
