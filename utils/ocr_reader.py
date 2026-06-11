import threading
import time
import re

import numpy as np
from loguru import logger

OCR_MIN_RANGE_M = 20.0
OCR_MAX_RANGE_M = 900.0

try:
    from PIL import Image, ImageGrab, ImageFilter
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


def _otsu_threshold(gray):
    """Compute Otsu threshold for a uint8 grayscale array."""
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


class _IntHysteresisFilter:
    """Reliability-oriented filter for monotonic-ish UI integers.

    Rules:
      - First confirmed value: requires 2 consecutive identical raw reads.
      - Subsequent updates: accept immediately if |new - last| <= jump_tol.
      - Larger jumps require the same new value twice in a row (pending slot)
        before becoming the new confirmed value. Single-frame OCR glitches
        therefore can never push the displayed value.
      - None / low-confidence reads do not affect the confirmed value.
    """
    def __init__(self, jump_tol=12):
        self._last_confirmed = None
        self._pending = None
        self._pending_count = 0
        self._jump_tol = jump_tol

    def update(self, raw):
        if raw is None:
            return self._last_confirmed

        if self._last_confirmed is None:
            # Bootstrap: trust the first valid read so the bar updates promptly.
            self._last_confirmed = raw
            self._pending = None
            self._pending_count = 0
            return self._last_confirmed

        # Have a confirmed value already.
        if abs(raw - self._last_confirmed) <= self._jump_tol:
            self._last_confirmed = raw
            self._pending = None
            self._pending_count = 0
        else:
            # Suspicious jump — require a second matching read.
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


_int_filter = _IntHysteresisFilter(jump_tol=12)


def _binarize_bright_text(img_rgb_np, brightness=170):
    """Fast bright-text isolation: returns uint8 mask (text=0, bg=255)."""
    r = img_rgb_np[:, :, 0]
    g = img_rgb_np[:, :, 1]
    b = img_rgb_np[:, :, 2]
    bright = (r >= brightness) & (g >= brightness) & (b >= brightness)
    return np.where(bright, 0, 255).astype(np.uint8), int(bright.sum())


OCR_INT_DEBUG_DIR = None  # Set to a folder path to dump per-poll debug images.


def _ocr_try_pass(pil_mask, psm):
    """Run one Tesseract pass; return parsed int or None."""
    try:
        text = pytesseract.image_to_string(
            pil_mask,
            config=f'--psm {psm} --oem 1 -c tessedit_char_whitelist=0123456789'
        )
    except Exception:
        return None, ""
    m = re.search(r'(\d+)', (text or "").strip())
    return (int(m.group(1)) if m else None), (text or "").strip()


def ocr_capture_int(ocr_region, min_val=0, max_val=100):
    """Integer OCR for bright game-UI digits. Returns filtered int or None.

    Multiple brightness thresholds tried + multiple PSMs. First in-range
    parse wins. Hysteresis filter rejects single-frame glitches.

    Set OCR_INT_DEBUG_DIR to dump the raw region + each mask to PNG.
    """
    if not ocr_region or not TESSERACT_OK:
        return None
    try:
        img_rgb_np = _grab_region_np(ocr_region)
        if img_rgb_np is None or img_rgb_np.size == 0:
            return _int_filter.current()

        if OCR_INT_DEBUG_DIR:
            try:
                import os as _os
                _os.makedirs(OCR_INT_DEBUG_DIR, exist_ok=True)
                Image.fromarray(img_rgb_np, mode='RGB').save(
                    _os.path.join(OCR_INT_DEBUG_DIR, "00_raw.png"))
            except Exception:
                pass

        attempts = []
        # Try several brightness thresholds for bright text on dark bg.
        for thresh in (180, 150, 120, 90):
            binary, hits = _binarize_bright_text(img_rgb_np, brightness=thresh)
            if hits < 4:
                continue
            attempts.append((f"bright{thresh}", binary))

        # Also try Otsu as a generic fallback.
        gray = (0.299 * img_rgb_np[:, :, 0]
                + 0.587 * img_rgb_np[:, :, 1]
                + 0.114 * img_rgb_np[:, :, 2]).astype(np.uint8)
        ot = _otsu_threshold(gray)
        otsu_hi = (gray > ot)
        if otsu_hi.sum() < gray.size / 2:
            otsu_text = otsu_hi
        else:
            otsu_text = ~otsu_hi
        attempts.append(("otsu", np.where(otsu_text, 0, 255).astype(np.uint8)))

        if not attempts:
            logger.info("[OCR int] no usable mask (no bright pixels)")
            return _int_filter.update(None)

        for idx, (tag, binary) in enumerate(attempts):
            pil_mask = Image.fromarray(binary, mode='L')
            # Upscale, then re-threshold to crisp edges.
            w, h = pil_mask.size
            pil_mask = pil_mask.resize((w * 5, h * 5), Image.Resampling.BILINEAR)
            arr = np.asarray(pil_mask, dtype=np.uint8)
            arr = np.where(arr < 100, 0, 255).astype(np.uint8)
            pil_mask = Image.fromarray(arr, mode='L')

            if OCR_INT_DEBUG_DIR:
                try:
                    import os as _os
                    pil_mask.save(_os.path.join(OCR_INT_DEBUG_DIR, f"{idx:02d}_{tag}.png"))
                except Exception:
                    pass

            for psm in (7, 8, 13, 6):
                val, raw_text = _ocr_try_pass(pil_mask, psm)
                if val is None:
                    continue
                if min_val <= val <= max_val:
                    out = _int_filter.update(val)
                    logger.info(f"[OCR int] {tag}/psm{psm} raw='{raw_text}' -> {val} (filtered={out})")
                    return out

        logger.info("[OCR int] no in-range digit across all attempts")
        return _int_filter.update(None)
    except Exception as e:
        logger.error(f"OCR int Exception: {e}")
        return _int_filter.current()


def reset_ocr_int_filter():
    """Reset the int-OCR hysteresis filter. Call when the region changes."""
    _int_filter.reset()


_bar_filter = _IntHysteresisFilter(jump_tol=8)


def scan_bar_fill_pct(region):
    """Read fill % of a left-to-right white-fill bar on a dark background.

    Scans each column: a column is "filled" when >40% of its middle rows are
    bright (R+G+B > 500). Returns the rightmost filled column position as a
    0–100 float, filtered through a hysteresis smoother.
    Returns None on capture failure.
    """
    if not region:
        return None
    try:
        img = _grab_region_np(region)
        if img is None or img.size == 0:
            return _bar_filter.current()

        h, w, _ = img.shape
        y0 = h // 4
        y1 = 3 * h // 4
        if y1 <= y0:
            y0, y1 = 0, h

        strip = img[y0:y1].astype(np.int32)
        bright = (strip[:, :, 0] + strip[:, :, 1] + strip[:, :, 2]) > 500
        col_bright = bright.mean(axis=0) > 0.40

        bright_cols = np.where(col_bright)[0]
        if len(bright_cols) == 0:
            raw_pct = 0
        else:
            raw_pct = int(round((int(bright_cols[-1]) + 1) / w * 100))

        out = _bar_filter.update(raw_pct)
        logger.info(f"[bar fill] raw={raw_pct}% -> filtered={out}%")
        return out
    except Exception as e:
        logger.error(f"scan_bar_fill_pct error: {e}")
        return _bar_filter.current()


def reset_bar_filter():
    _bar_filter.reset()
