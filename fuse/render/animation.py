"""AnimationLoop — root.after-based animation with fps control and clean stop.

Replaces ad-hoc ``root.after(33, self._animate)`` patterns across plugins.
Exceptions in the callback are caught per-frame and logged without stopping
the loop.

Usage::

    from fuse.utils.animation import AnimationLoop

    logo_anim = AnimationLoop(ctx.tk_root, self._tick_logo, fps=30)
    logo_anim.start()   # in _show_hud_setup / _show_hud_locked
    logo_anim.stop()    # in _hide_hud / teardown
"""

from __future__ import annotations

import tkinter as tk
from typing import Callable

from loguru import logger


class AnimationLoop:
    """Drives a callback at a fixed frame rate via ``tk.Tk.after``."""

    def __init__(
        self,
        root: tk.Tk,
        callback: Callable[[], None],
        fps: int = 30,
    ) -> None:
        self._root = root
        self._callback = callback
        self._interval_ms = max(1, round(1000 / fps))
        self._running = False
        self._after_id: str | None = None

    # ------------------------------------------------------------------

    def start(self) -> None:
        """Start the loop.  Idempotent — safe to call when already running."""
        if self._running:
            return
        self._running = True
        self._schedule()

    def stop(self) -> None:
        """Stop the loop and cancel any pending callback."""
        self._running = False
        if self._after_id is not None:
            try:
                self._root.after_cancel(self._after_id)
            except Exception:
                pass
            self._after_id = None

    @property
    def running(self) -> bool:
        return self._running

    # ------------------------------------------------------------------

    def _schedule(self) -> None:
        if self._running:
            self._after_id = self._root.after(self._interval_ms, self._tick)

    def _tick(self) -> None:
        self._after_id = None
        if not self._running:
            return
        try:
            self._callback()
        except Exception as exc:
            logger.exception(f"AnimationLoop callback error: {exc}")
        self._schedule()


__all__ = ["AnimationLoop"]
