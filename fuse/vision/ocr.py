"""FUSE-provided Tesseract OCR utilities.

Generic screen-OCR helpers usable by any plugin that needs to read
digits from a game UI.  No game-specific colour masks or domain limits
live here - those belong in the plugin.

Public API:

* :data:`TESSERACT_OK` - bool, whether Tesseract is reachable.
* :data:`PIL_OK` - bool, whether Pillow is available.
* :class:`TemporalOCRFilter` - sliding-window value confirmation filter.
* :class:`IntHysteresisFilter` - hysteresis filter for integer OCR streams.
* :func:`ocr_capture_int` - read an integer from a screen region.
* :func:`binarize_bright_text` - pre-process bright-on-dark UI text.
* :func:`otsu_threshold` - compute Otsu binarisation threshold.
"""
from __future__ import annotations

import os
import re
import time
from typing import Optional, Sequence

import numpy as np
from loguru import logger

from fuse.ui.screen_capture import grab_region_np

try:
    from PIL import Image  # type: ignore
    PIL_OK = True
except ImportError:
    PIL_OK = False

try:
    import pytesseract  # type: ignore
    try:
        pytesseract.get_tesseract_version()
        TESSERACT_OK = True
    except Exception:
        _common_paths = [
            r"C:\Program Files\Tesseract-OCR\tesseract.exe",
            r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
            os.path.expanduser(r"~\AppData\Local\Programs\Tesseract-OCR\tesseract.exe"),
        ]
        TESSERACT_OK = False
        for _p in _common_paths:
            if os.path.exists(_p):
                pytesseract.pytesseract.tesseract_cmd = _p
                try:
                    pytesseract.get_tesseract_version()
                    TESSERACT_OK = True
                    break
                except Exception:
                    pass
except Exception:
    TESSERACT_OK = False


# ---------------------------------------------------------------------------
#  Image helpers
# ---------------------------------------------------------------------------

def otsu_threshold(gray: np.ndarray) -> int:
    """Return Otsu's binarisation threshold for *gray* (uint8 2-D array)."""
    hist, _ = np.histogram(gray, bins=256, range=(0, 256))
    total = gray.size
    sum_total = float((np.arange(256) * hist).sum())
    sum_bg = 0.0
    w_bg = 0
    max_var = 0.0
    threshold = 127
    for t in range(256):
        w_bg += hist[t]
        if w_bg == 0:
            continue
        w_fg = total - w_bg
        if w_fg == 0:
            break
        sum_bg += t * hist[t]
        mean_bg = sum_bg / w_bg
        mean_fg = (sum_total - sum_bg) / w_fg
        var = w_bg * w_fg * (mean_bg - mean_fg) ** 2
        if var > max_var:
            max_var = var
            threshold = t
    return threshold


def binarize_bright_text(
    img_rgb_np: np.ndarray, brightness: int = 170
) -> tuple[np.ndarray, int]:
    """Return (binary_uint8, bright_pixel_count).

    Pixels where all channels ≥ *brightness* become 0 (black text);
    everything else becomes 255 (white background) - Tesseract default.
    """
    r = img_rgb_np[:, :, 0]
    g = img_rgb_np[:, :, 1]
    b = img_rgb_np[:, :, 2]
    bright = (r >= brightness) & (g >= brightness) & (b >= brightness)
    return np.where(bright, 0, 255).astype(np.uint8), int(bright.sum())


def _ocr_try_pass(pil_mask, psm: int) -> tuple[Optional[int], str]:
    """Run one Tesseract pass on *pil_mask*. Returns (int_or_None, raw_text)."""
    try:
        text = pytesseract.image_to_string(
            pil_mask,
            config=f"--psm {psm} --oem 1 -c tessedit_char_whitelist=0123456789",
        )
    except Exception:
        return None, ""
    m = re.search(r"(\d+)", (text or "").strip())
    return (int(m.group(1)) if m else None), (text or "").strip()


# ---------------------------------------------------------------------------
#  Filters
# ---------------------------------------------------------------------------

class TemporalOCRFilter:
    """Sliding-window filter - confirms a value when ≥2 of the last reads agree."""

    def __init__(self, window: int = 3, tolerance: float = 0.10, max_age_s: float = 1.5):
        self._buf: list = []
        self._last_confirmed = None
        self._last_confirmed_time = None
        self._window = window
        self._tolerance = tolerance
        self._max_age_s = max_age_s

    def update(self, raw_value):
        now = time.perf_counter()
        if (self._last_confirmed_time is not None
                and now - self._last_confirmed_time > self._max_age_s):
            self._buf.clear()
            self._last_confirmed_time = None

        self._buf.append(raw_value)
        if len(self._buf) > self._window:
            self._buf = self._buf[-self._window:]

        values = [v for v in self._buf if v is not None]
        if len(values) < 2:
            return self._last_confirmed

        for i in range(len(values)):
            for j in range(i + 1, len(values)):
                a, b = values[i], values[j]
                denom = max(a, b)
                if denom > 0 and abs(a - b) / denom <= self._tolerance:
                    self._last_confirmed = values[j]
                    self._last_confirmed_time = now
                    return self._last_confirmed
        return self._last_confirmed

    def reset(self) -> None:
        self._buf.clear()
        self._last_confirmed = None
        self._last_confirmed_time = None


class IntHysteresisFilter:
    """Hysteresis filter for monotonic-ish integer OCR streams.

    Accepts a new value immediately if it's within *jump_tol* of the current
    confirmed value; otherwise requires the same outlier to appear twice before
    adopting it.
    """

    def __init__(self, jump_tol: int = 12):
        self._last_confirmed = None
        self._pending = None
        self._pending_count = 0
        self._jump_tol = jump_tol

    def update(self, raw: Optional[int]) -> Optional[int]:
        if raw is None:
            return self._last_confirmed
        if self._last_confirmed is None:
            self._last_confirmed = raw
            self._pending = None
            self._pending_count = 0
            return self._last_confirmed
        if abs(raw - self._last_confirmed) <= self._jump_tol:
            self._last_confirmed = raw
            self._pending = None
            self._pending_count = 0
        else:
            if self._pending == raw:
                self._pending_count += 1
                if self._pending_count >= 2:
                    self._last_confirmed = raw
                    self._pending = None
                    self._pending_count = 0
            else:
                self._pending = raw
                self._pending_count = 1
        return self._last_confirmed

    def current(self) -> Optional[int]:
        return self._last_confirmed

    def reset(self) -> None:
        self._last_confirmed = None
        self._pending = None
        self._pending_count = 0


# ---------------------------------------------------------------------------
#  Generic integer OCR
# ---------------------------------------------------------------------------

def ocr_capture_int(
    ocr_region: Sequence[int],
    min_val: int = 0,
    max_val: int = 100,
    *,
    _filter: Optional[IntHysteresisFilter] = None,
    debug_dir: Optional[str] = None,
) -> Optional[int]:
    """Read an integer from *ocr_region* (bright text on dark UI background).

    Tries multiple binarisation strategies and Tesseract PSM modes, feeds the
    best match through *_filter* (creates a one-shot filter if None given).
    Returns the filtered value, or None on Tesseract / capture failure.
    """
    if not ocr_region or not TESSERACT_OK or not PIL_OK:
        return None

    _f = _filter if _filter is not None else IntHysteresisFilter()

    try:
        img_rgb_np = grab_region_np(ocr_region)
        if img_rgb_np is None or img_rgb_np.size == 0:
            return _f.current()

        if debug_dir:
            try:
                os.makedirs(debug_dir, exist_ok=True)
                Image.fromarray(img_rgb_np, mode="RGB").save(
                    os.path.join(debug_dir, "00_raw.png"))
            except Exception:
                pass

        attempts: list[tuple[str, np.ndarray]] = []
        for thresh in (180, 150, 120, 90):
            binary, hits = binarize_bright_text(img_rgb_np, brightness=thresh)
            if hits >= 4:
                attempts.append((f"bright{thresh}", binary))

        gray = (0.299 * img_rgb_np[:, :, 0]
                + 0.587 * img_rgb_np[:, :, 1]
                + 0.114 * img_rgb_np[:, :, 2]).astype(np.uint8)
        ot = otsu_threshold(gray)
        otsu_hi = gray > ot
        otsu_text = otsu_hi if otsu_hi.sum() < gray.size / 2 else ~otsu_hi
        attempts.append(("otsu", np.where(otsu_text, 0, 255).astype(np.uint8)))

        if not attempts:
            return _f.update(None)

        for idx, (tag, binary) in enumerate(attempts):
            pil_mask = Image.fromarray(binary, mode="L")
            w, h = pil_mask.size
            pil_mask = pil_mask.resize((w * 5, h * 5), Image.Resampling.BILINEAR)
            arr = np.asarray(pil_mask, dtype=np.uint8)
            arr = np.where(arr < 100, 0, 255).astype(np.uint8)
            pil_mask = Image.fromarray(arr, mode="L")

            if debug_dir:
                try:
                    pil_mask.save(os.path.join(debug_dir, f"{idx:02d}_{tag}.png"))
                except Exception:
                    pass

            for psm in (7, 8, 13, 6):
                val, raw_text = _ocr_try_pass(pil_mask, psm)
                if val is not None and min_val <= val <= max_val:
                    out = _f.update(val)
                    logger.debug(f"[OCR int] {tag}/psm{psm} raw={raw_text!r} "
                                 f"-> {val} (filtered={out})")
                    return out

        return _f.update(None)
    except Exception as e:
        logger.error(f"OCR int exception: {e}")
        return _f.current()


__all__ = [
    "TESSERACT_OK",
    "PIL_OK",
    "TemporalOCRFilter",
    "IntHysteresisFilter",
    "otsu_threshold",
    "binarize_bright_text",
    "ocr_capture_int",
]
