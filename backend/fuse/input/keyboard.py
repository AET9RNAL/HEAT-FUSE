"""Keyboard input simulation for FUSE plugins.

Provides a service that plugins consume via ``ctx.services.get("keyboard")``::

    kbd = ctx.services.get("keyboard")
    if kbd:
        kbd.press("w")      # hold W
        kbd.release("w")    # release W
        kbd.tap("space")    # quick press+release
        kbd.is_held("w")    # True if W is being held by this controller

The service is registered by the host at startup (before any plugin loads)
so it is always available when pynput is installed.
"""
from __future__ import annotations

from typing import Set

from loguru import logger

try:
    from pynput import keyboard as pynkeyboard
    _PYNPUT_OK = True
except ImportError:  # pragma: no cover
    _PYNPUT_OK = False


class KeyboardInput:
    """Simulates keyboard input via pynput's Controller."""

    def __init__(self) -> None:
        if not _PYNPUT_OK:
            raise RuntimeError("pynput is not available - keyboard input disabled")
        self._controller = pynkeyboard.Controller()
        self._held: Set[str] = set()

    def press(self, key: str) -> None:
        """Press and hold *key* (e.g. "w", "s", "space")."""
        try:
            self._controller.press(key)
            self._held.add(key)
        except Exception as e:
            logger.error(f"KeyboardInput.press({key!r}): {e}")

    def release(self, key: str) -> None:
        """Release *key* if currently held."""
        try:
            self._controller.release(key)
        except Exception as e:
            logger.error(f"KeyboardInput.release({key!r}): {e}")
        self._held.discard(key)

    def tap(self, key: str) -> None:
        """Press and release *key* quickly."""
        try:
            self._controller.tap(key)
        except Exception as e:
            logger.error(f"KeyboardInput.tap({key!r}): {e}")

    def is_held(self, key: str) -> bool:
        """Return True if *key* is currently held by this controller."""
        return key in self._held

    def release_all(self) -> None:
        """Release every key currently held by this controller."""
        for key in list(self._held):
            try:
                self._controller.release(key)
            except Exception:
                pass
        self._held.clear()


__all__ = ["KeyboardInput"]
