"""Tesseract-driven range OCR — HEAT AILOS-TORC vertical only.

Captures the in-game range readout, masks the team-coloured digits,
upscales, runs Tesseract, and feeds the result through a temporal filter
so single-frame artefacts do not perturb the displayed range.

Public API:

* :data:`TESSERACT_OK` — bool, whether Tesseract is reachable.
* :data:`OCR_MIN_RANGE_M`, :data:`OCR_MAX_RANGE_M` — accepted range domain.
* :func:`ocr_capture_range(region) -> float | None`
* :func:`ocr_capture_int(region, min_val, max_val) -> int | None`
* :func:`reset_ocr_filter()`, :func:`reset_ocr_int_filter()`
"""
from __future__ import annotations

import os
import re
import time
from typing import Optional, Sequence

import numpy as np
from loguru import logger

from utils.screen_capture import grab_region_np

try:
    from PIL import Image  # type: ignore
    PIL_OK = True
except ImportError:  # pragma: no cover
    PIL_OK = False

try:
    import pytesseract  # type: ignore
    try:
        pytesseract.get_tesseract_version()
        TESSERACT_OK = True
    except Exception:
        common_paths = [
            r"C:\Program Files\Tesseract-OCR\tesseract.exe",
            r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
            os.path.expanduser(r"~\AppData\Local\Programs\Tesseract-OCR\tesseract.exe"),
        ]
        TESSERACT_OK = False
        for _p in common_paths:
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


OCR_MIN_RANGE_M = 20.0
OCR_MAX_RANGE_M = 900.0
OCR_DEBUG = False


# ---------------------------------------------------------------------------
#  Pixel masks
# ---------------------------------------------------------------------------

def _color_mask_hsv(img_rgb_np: np.ndarray) -> np.ndarray:
    """Vectorised HSV colour mask for ``#84ffb1`` (H≈142°, S≈48%, V≈100%)."""
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


def _otsu_threshold(gray: np.ndarray) -> int:
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


def _binarize_bright_text(img_rgb_np: np.ndarray, brightness: int = 170):
    r = img_rgb_np[:, :, 0]
    g = img_rgb_np[:, :, 1]
    b = img_rgb_np[:, :, 2]
    bright = (r >= brightness) & (g >= brightness) & (b >= brightness)
    return np.where(bright, 0, 255).astype(np.uint8), int(bright.sum())


# ---------------------------------------------------------------------------
#  Filters
# ---------------------------------------------------------------------------

class TemporalOCRFilter:
    """Sliding-window filter — confirms a value when ≥2 of the last reads agree."""

    def __init__(self, window=3, tolerance=0.10, max_age_s=1.5):
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

    def reset(self):
        self._buf.clear()
        self._last_confirmed = None
        self._last_confirmed_time = None


class _IntHysteresisFilter:
    """Hysteresis filter for monotonic-ish integer OCR streams."""

    def __init__(self, jump_tol=12):
        self._last_confirmed = None
        self._pending = None
        self._pending_count = 0
        self._jump_tol = jump_tol

    def update(self, raw):
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

    def current(self):
        return self._last_confirmed

    def reset(self):
        self._last_confirmed = None
        self._pending = None
        self._pending_count = 0


_temporal_filter = TemporalOCRFilter()
_int_filter = _IntHysteresisFilter(jump_tol=12)


def reset_ocr_filter() -> None:
    """Reset the temporal range filter (call on manual range override)."""
    _temporal_filter.reset()


def reset_ocr_int_filter() -> None:
    """Reset the integer hysteresis filter."""
    _int_filter.reset()


# ---------------------------------------------------------------------------
#  Public OCR entry points
# ---------------------------------------------------------------------------

def ocr_capture_range(ocr_region: Sequence[int]) -> Optional[float]:
    """Read the in-game range value from ``ocr_region``. Returns metres or None."""
    if not ocr_region or not TESSERACT_OK or not PIL_OK:
        if OCR_DEBUG:
            logger.debug(f"[OCR] Skipped: ocr_region={ocr_region!r} "
                         f"TESSERACT_OK={TESSERACT_OK}")
        return None

    try:
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


def _ocr_try_pass(pil_mask, psm: int):
    try:
        text = pytesseract.image_to_string(
            pil_mask,
            config=f"--psm {psm} --oem 1 -c tessedit_char_whitelist=0123456789",
        )
    except Exception:
        return None, ""
    m = re.search(r"(\d+)", (text or "").strip())
    return (int(m.group(1)) if m else None), (text or "").strip()


OCR_INT_DEBUG_DIR = None


def ocr_capture_int(ocr_region: Sequence[int],
                    min_val: int = 0,
                    max_val: int = 100) -> Optional[int]:
    """Integer OCR for bright game-UI digits."""
    if not ocr_region or not TESSERACT_OK or not PIL_OK:
        return None
    try:
        img_rgb_np = grab_region_np(ocr_region)
        if img_rgb_np is None or img_rgb_np.size == 0:
            return _int_filter.current()

        if OCR_INT_DEBUG_DIR:
            try:
                os.makedirs(OCR_INT_DEBUG_DIR, exist_ok=True)
                Image.fromarray(img_rgb_np, mode="RGB").save(
                    os.path.join(OCR_INT_DEBUG_DIR, "00_raw.png"))
            except Exception:
                pass

        attempts = []
        for thresh in (180, 150, 120, 90):
            binary, hits = _binarize_bright_text(img_rgb_np, brightness=thresh)
            if hits < 4:
                continue
            attempts.append((f"bright{thresh}", binary))

        gray = (0.299 * img_rgb_np[:, :, 0]
                + 0.587 * img_rgb_np[:, :, 1]
                + 0.114 * img_rgb_np[:, :, 2]).astype(np.uint8)
        ot = _otsu_threshold(gray)
        otsu_hi = (gray > ot)
        otsu_text = otsu_hi if otsu_hi.sum() < gray.size / 2 else ~otsu_hi
        attempts.append(("otsu",
                         np.where(otsu_text, 0, 255).astype(np.uint8)))

        if not attempts:
            return _int_filter.update(None)

        for idx, (tag, binary) in enumerate(attempts):
            pil_mask = Image.fromarray(binary, mode="L")
            w, h = pil_mask.size
            pil_mask = pil_mask.resize((w * 5, h * 5),
                                       Image.Resampling.BILINEAR)
            arr = np.asarray(pil_mask, dtype=np.uint8)
            arr = np.where(arr < 100, 0, 255).astype(np.uint8)
            pil_mask = Image.fromarray(arr, mode="L")

            if OCR_INT_DEBUG_DIR:
                try:
                    pil_mask.save(os.path.join(
                        OCR_INT_DEBUG_DIR, f"{idx:02d}_{tag}.png"))
                except Exception:
                    pass

            for psm in (7, 8, 13, 6):
                val, raw_text = _ocr_try_pass(pil_mask, psm)
                if val is None:
                    continue
                if min_val <= val <= max_val:
                    out = _int_filter.update(val)
                    logger.info(f"[OCR int] {tag}/psm{psm} raw='{raw_text}' "
                                f"-> {val} (filtered={out})")
                    return out
        return _int_filter.update(None)
    except Exception as e:
        logger.error(f"OCR int Exception: {e}")
        return _int_filter.current()


__all__ = [
    "TESSERACT_OK",
    "OCR_MIN_RANGE_M",
    "OCR_MAX_RANGE_M",
    "ocr_capture_range",
    "ocr_capture_int",
    "reset_ocr_filter",
    "reset_ocr_int_filter",
]
