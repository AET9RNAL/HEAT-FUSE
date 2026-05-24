import threading
import time
import re

import numpy as np
from loguru import logger

OCR_MIN_RANGE_M = 20.0
OCR_MAX_RANGE_M = 900.0

try:
    from PIL import Image, ImageGrab
    PIL_OK = True
except ImportError:
    PIL_OK = False

try:
    import mss as _mss_lib
    _mss_local = threading.local()
    MSS_OK = True
except ImportError:
    MSS_OK = False

try:
    import pytesseract
    try:
        pytesseract.get_tesseract_version()
        TESSERACT_OK = True
    except Exception:
        # Fallback for Windows if PATH hasn't updated yet or user skipped adding it
        import os
        common_paths = [
            r"C:\Program Files\Tesseract-OCR\tesseract.exe",
            r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
            os.path.expanduser(r"~\AppData\Local\Programs\Tesseract-OCR\tesseract.exe")
        ]
        TESSERACT_OK = False
        for p in common_paths:
            if os.path.exists(p):
                pytesseract.pytesseract.tesseract_cmd = p
                try:
                    pytesseract.get_tesseract_version()
                    TESSERACT_OK = True
                    break
                except Exception:
                    pass
except Exception:
    TESSERACT_OK = False


def _grab_region_np(ocr_region):
    """Grab screen region as numpy uint8 RGB array (H, W, 3).
    Uses mss if available (3–8 ms), falls back to ImageGrab (~20 ms)."""
    x1, y1, x2, y2 = int(ocr_region[0]), int(ocr_region[1]), int(ocr_region[2]), int(ocr_region[3])
    if MSS_OK:
        if not hasattr(_mss_local, 'sct'):
            _mss_local.sct = _mss_lib.mss()
        mon = {"left": x1, "top": y1, "width": x2 - x1, "height": y2 - y1}
        sct_img = _mss_local.sct.grab(mon)
        img_np = np.frombuffer(sct_img.bgra, dtype=np.uint8).reshape(sct_img.height, sct_img.width, 4)
        return img_np[:, :, [2, 1, 0]]  # BGRA -> RGB
    elif PIL_OK:
        pil_img = ImageGrab.grab(bbox=(x1, y1, x2, y2))
        return np.array(pil_img.convert('RGB'), dtype=np.uint8)
    return None


def _color_mask_hsv(img_rgb_np):
    """Vectorized HSV color mask for #84ffb1 (H≈142°, S≈48%, V≈100%).
    HSV isolates hue from brightness, making it robust against bloom, bright
    skies and diverse terrain backgrounds. Returns a 2D boolean array."""
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

    # #84ffb1 = HSV(142°, 48%, 100%)
    # Tolerances are generous enough to recover anti-aliased edge pixels
    # blended against any background while still rejecting unrelated colors.
    return (h >= 115.0) & (h <= 178.0) & (s >= 0.10) & (s <= 0.90) & (v >= 0.25)


def _dilate_binary(arr):
    """Single-pass 3×3 morphological dilation on a 2D boolean numpy array.
    Thickens thin strokes to recover anti-aliased edge pixels lost by masking."""
    result = arr.copy()
    result[1:] |= arr[:-1]
    result[:-1] |= arr[1:]
    result[:, 1:] |= arr[:, :-1]
    result[:, :-1] |= arr[:, 1:]
    result[1:, 1:] |= arr[:-1, :-1]
    result[:-1, :-1] |= arr[1:, 1:]
    result[1:, :-1] |= arr[:-1, 1:]
    result[:-1, 1:] |= arr[1:, :-1]
    return result


class TemporalOCRFilter:
    """Sliding-window temporal filter to eliminate single-frame digit artifacts.

    Confirms a value only when ≥2 of the last `window` raw reads agree within
    ±`tolerance`. Holds the last confirmed value on disagreement.
    Auto-flushes the buffer after `max_age_s` seconds of no confirmation to
    prevent stale locks when the range value is genuinely absent."""

    def __init__(self, window=3, tolerance=0.10, max_age_s=1.5):
        self._buf = []
        self._last_confirmed = None
        self._last_confirmed_time = None
        self._window = window
        self._tolerance = tolerance
        self._max_age_s = max_age_s

    def update(self, raw_value):
        now = time.perf_counter()
        if self._last_confirmed_time is not None and now - self._last_confirmed_time > self._max_age_s:
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


_temporal_filter = TemporalOCRFilter()


def reset_ocr_filter():
    """Reset the temporal filter. Call when the user sets a manual range so
    the next OCR result is a genuinely fresh confirmed reading."""
    _temporal_filter.reset()


OCR_DEBUG = False


def ocr_capture_range(ocr_region):
    """Capture screen region and OCR the range value. Returns float or None.
    Runs in background thread -- no Tkinter calls.
    """
    if not ocr_region or not TESSERACT_OK:
        if OCR_DEBUG:
            logger.debug(f"[OCR] Skipped: ocr_region={ocr_region!r} TESSERACT_OK={TESSERACT_OK}")
        return None

    try:
        t0 = time.perf_counter()
        img_rgb_np = _grab_region_np(ocr_region)
        t_grab = time.perf_counter()

        if img_rgb_np is None or img_rgb_np.size == 0:
            if OCR_DEBUG:
                logger.debug("[OCR] Capture returned None or empty array")
            return _temporal_filter.update(None)

        if OCR_DEBUG:
            backend = "mss" if MSS_OK else "ImageGrab"
            logger.debug(f"[OCR] Capture ({backend}) shape={img_rgb_np.shape} in {(t_grab-t0)*1000:.1f}ms")

        mask = _color_mask_hsv(img_rgb_np)
        t_mask = time.perf_counter()

        if OCR_DEBUG:
            hits = int(mask.sum())
            total = mask.size
            logger.debug(f"[OCR] HSV mask hits: {hits}/{total}")

        gray_np = np.where(mask, 0, 255).astype(np.uint8)
        pil_mask = Image.fromarray(gray_np, mode='L')

        if OCR_DEBUG:
            pil_mask.save("debug_ocr_mask_source.png")

        # Scale up 4x with BILINEAR — naturally thickens 1px strokes to ~2px
        # without dilation (which merges gaps inside thin font glyphs).
        # Re-threshold at 100 to recover blurred edge pixels.
        w, h = pil_mask.size
        pil_mask = pil_mask.resize((w * 4, h * 4), Image.Resampling.BILINEAR)
        pil_mask = pil_mask.point(lambda p: 0 if p < 100 else 255)

        if OCR_DEBUG:
            pil_mask.save("debug_ocr_mask.png")

        text = pytesseract.image_to_string(
            pil_mask,
            config='--psm 7 --oem 1 -c tessedit_char_whitelist=0123456789'
        )
        t_tess = time.perf_counter()

        if OCR_DEBUG:
            logger.debug(f"[OCR] Tesseract raw={text.strip()!r} in {(t_tess-t_mask)*1000:.1f}ms")

        match = re.search(r'(\d+)', text.strip())
        if match:
            raw_val = float(match.group(1))
            in_range = OCR_MIN_RANGE_M <= raw_val <= OCR_MAX_RANGE_M
            if OCR_DEBUG:
                logger.debug(f"[OCR] Parsed raw_val={raw_val} in_range={in_range} -> filter={_temporal_filter._last_confirmed}")
            if in_range:
                confirmed = _temporal_filter.update(raw_val)
                if OCR_DEBUG:
                    logger.debug(f"[OCR] Confirmed={confirmed}")
                return confirmed
        else:
            if OCR_DEBUG:
                logger.debug("[OCR] No digit match in Tesseract output")

        return _temporal_filter.update(None)

    except Exception as e:
        logger.error(f"OCR Exception: {e}")
        return None
