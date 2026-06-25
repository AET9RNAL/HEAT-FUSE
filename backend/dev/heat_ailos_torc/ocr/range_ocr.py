"""SACLOS range OCR — HEAT AILOS-TORC specific.

Wraps the generic FUSE OCR infrastructure with War Thunder's HUD colour mask
(``#84ffb1`` cyan-green digits) and the accepted range domain (20–900 m).

Public API:

* :data:`TESSERACT_OK` — re-exported from ``fuse.vision.ocr``.
* :data:`OCR_MIN_RANGE_M`, :data:`OCR_MAX_RANGE_M` — accepted range domain.
* :func:`ocr_capture_range` — read range from screen region, returns metres or None.
* :func:`ocr_capture_int` — re-exported generic integer OCR.
* :func:`reset_ocr_filter`, :func:`reset_ocr_int_filter` — reset module singletons.
"""
from __future__ import annotations

import re
import time
from typing import Optional, Sequence

import numpy as np
from loguru import logger

from fuse.vision.ocr import (
    TESSERACT_OK,
    PIL_OK,
    TemporalOCRFilter,
    IntHysteresisFilter,
    ocr_capture_int,
)
from fuse.ui.screen_capture import grab_region_np

try:
    from PIL import Image  # type: ignore
except ImportError:
    pass  # PIL_OK from fuse.vision.ocr guards all PIL usage


OCR_MIN_RANGE_M = 20.0
OCR_MAX_RANGE_M = 900.0
OCR_DEBUG = False


# ---------------------------------------------------------------------------
#  War Thunder HUD colour mask  (#84ffb1 — H≈142°, S≈48%, V≈100%)
# ---------------------------------------------------------------------------

def _color_mask_hsv(img_rgb_np: np.ndarray) -> np.ndarray:
    """Vectorised HSV mask for the War Thunder SACLOS range readout colour."""
    r = img_rgb_np[:, :, 0].astype(np.float32) / 255.0
    g = img_rgb_np[:, :, 1].astype(np.float32) / 255.0
    b = img_rgb_np[:, :, 2].astype(np.float32) / 255.0

    maxc = np.maximum(np.maximum(r, g), b)
    minc = np.minimum(np.minimum(r, g), b)
    delta = maxc - minc

    v = maxc
    safe_maxc = np.where(maxc > 1e-6, maxc, 1.0)
    s = np.where(maxc > 1e-6, delta / safe_maxc, 0.0)

    h = np.zeros_like(r)
    eps = 1e-6
    m_r = (maxc == r) & (delta > eps)
    m_g = (maxc == g) & (delta > eps)
    m_b = (maxc == b) & (delta > eps)
    h[m_r] = (60.0 * ((g[m_r] - b[m_r]) / delta[m_r])) % 360.0
    h[m_g] = 60.0 * (b[m_g] - r[m_g]) / delta[m_g] + 120.0
    h[m_b] = 60.0 * (r[m_b] - g[m_b]) / delta[m_b] + 240.0

    return ((h >= 115.0) & (h <= 178.0)
            & (s >= 0.10) & (s <= 0.90)
            & (v >= 0.25))


# ---------------------------------------------------------------------------
#  Module-level filter singletons (one per process)
# ---------------------------------------------------------------------------

_temporal_filter = TemporalOCRFilter()
_int_filter = IntHysteresisFilter(jump_tol=12)


def reset_ocr_filter() -> None:
    """Reset the temporal range filter (call on manual range override)."""
    _temporal_filter.reset()


def reset_ocr_int_filter() -> None:
    """Reset the integer hysteresis filter."""
    _int_filter.reset()


# ---------------------------------------------------------------------------
#  SACLOS-specific range capture
# ---------------------------------------------------------------------------

def ocr_capture_range(ocr_region: Sequence[int]) -> Optional[float]:
    """Read the War Thunder SACLOS range readout. Returns metres or None."""
    if not ocr_region or not TESSERACT_OK or not PIL_OK:
        if OCR_DEBUG:
            logger.debug(f"[OCR] Skipped: ocr_region={ocr_region!r} "
                         f"TESSERACT_OK={TESSERACT_OK}")
        return None

    try:
        import pytesseract  # type: ignore

        t0 = time.perf_counter()
        img_rgb_np = grab_region_np(ocr_region)
        t_grab = time.perf_counter()

        if img_rgb_np is None or img_rgb_np.size == 0:
            if OCR_DEBUG:
                logger.debug("[OCR] Capture returned None or empty array")
            return _temporal_filter.update(None)

        if OCR_DEBUG:
            logger.debug(f"[OCR] Capture shape={img_rgb_np.shape} "
                         f"in {(t_grab - t0) * 1000:.1f}ms")

        mask = _color_mask_hsv(img_rgb_np)
        gray_np = np.where(mask, 0, 255).astype(np.uint8)
        pil_mask = Image.fromarray(gray_np, mode="L")
        if OCR_DEBUG:
            pil_mask.save("debug_ocr_mask_source.png")

        w, h = pil_mask.size
        pil_mask = pil_mask.resize((w * 4, h * 4), Image.Resampling.BILINEAR)
        pil_mask = pil_mask.point(lambda p: 0 if p < 100 else 255)
        if OCR_DEBUG:
            pil_mask.save("debug_ocr_mask.png")

        text = pytesseract.image_to_string(
            pil_mask,
            config="--psm 7 --oem 1 -c tessedit_char_whitelist=0123456789",
        )
        if OCR_DEBUG:
            logger.debug(f"[OCR] Tesseract raw={text.strip()!r}")

        match = re.search(r"(\d+)", text.strip())
        if match:
            raw_val = float(match.group(1))
            if OCR_MIN_RANGE_M <= raw_val <= OCR_MAX_RANGE_M:
                return _temporal_filter.update(raw_val)

        return _temporal_filter.update(None)
    except Exception as e:
        logger.error(f"OCR Exception: {e}")
        return None


__all__ = [
    "TESSERACT_OK",
    "OCR_MIN_RANGE_M",
    "OCR_MAX_RANGE_M",
    "ocr_capture_range",
    "ocr_capture_int",
    "reset_ocr_filter",
    "reset_ocr_int_filter",
]
