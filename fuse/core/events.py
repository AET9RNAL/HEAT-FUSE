"""Lightweight pub/sub event bus for cross-plugin communication.

Plugins subscribe to named events in ``setup()`` and emit them at any time.
All handler invocations are dispatched on the Tk thread via ``root.after``
so handlers can safely mutate widgets.
"""
from __future__ import annotations

from collections import defaultdict
from typing import Callable, Dict, List

import tkinter as tk
from loguru import logger


class EventBus:
    """Shared event bus owned by :class:`~fuse.host.PluginHost`."""

    def __init__(self, root: tk.Tk) -> None:
        self._root = root
        self._handlers: Dict[str, List[tuple[str, Callable]]] = defaultdict(list)

    def subscribe(self, event: str, cb: Callable, *, owner: str = "") -> None:
        """Register *cb* to be called when *event* is emitted."""
        self._handlers[event].append((owner, cb))
        logger.debug(f"EventBus: {owner!r} subscribed to {event!r}")

    def unsubscribe(self, event: str, cb: Callable) -> None:
        """Remove *cb* from *event* subscribers (no-op if not registered)."""
        self._handlers[event] = [
            (o, h) for o, h in self._handlers[event] if h is not cb
        ]

    def emit(self, event: str, **kwargs) -> None:
        """Emit *event* with keyword arguments on the Tk thread."""
        handlers = list(self._handlers.get(event, []))
        if not handlers:
            return

        def _dispatch():
            for owner, cb in handlers:
                try:
                    cb(**kwargs)
                except Exception as e:
                    logger.exception(
                        f"EventBus handler {owner!r} for {event!r} raised: {e}"
                    )

        self._root.after(0, _dispatch)


__all__ = ["EventBus"]
