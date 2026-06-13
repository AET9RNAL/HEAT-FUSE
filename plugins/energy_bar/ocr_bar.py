"""Pixel-scan bar-fill reader for the energy_bar HEAT plugin.

No Tesseract dependency. Scans columns of the configured screen region,
flags columns whose middle band is bright on a dark background, and
reports the rightmost filled column as a percentage. A small hysteresis
filter rejects single-frame OCR-style glitches.
"""
from __future__ import annotations

from typing import Optional, Sequence

import numpy as np
from loguru import logger

from fuse.utils.screen_capture import grab_region_np


class _IntHysteresisFilter:
    """Small hysteresis smoother — single-frame jumps require confirmation."""

    def __init__(self, jump_tol: int = 8):
        self._last_confirmed: Optional[int] = None
        self._pending: Optional[int] = None
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


_bar_filter = _IntHysteresisFilter(jump_tol=8)


def scan_bar_fill_pct(region: Sequence[int]) -> Optional[int]:
    """Read fill % of a left-to-right white-fill bar on a dark background.

    A column is considered "filled" when >40 % of its middle rows have
    R + G + B > 500. The rightmost filled column gives the raw percent,
    which is then passed through a hysteresis filter.
    """
    if not region:
        return None
    try:
        img = grab_region_np(region)
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


def reset_bar_filter() -> None:
    _bar_filter.reset()


__all__ = ["scan_bar_fill_pct", "reset_bar_filter"]
