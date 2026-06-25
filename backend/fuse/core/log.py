"""Logging setup for the FUSE mod loader.

Call :func:`setup` once at process start (before any other FUSE import logs).
Every FUSE session gets its own file under ``<repo>/logs/``:

    logs/fuse_2026-06-12--14-30.log

Log lines include the plugin name when a logger is bound with ``plugin=``:

    2026-06-12 14:30:01.234 | DEBUG    | game_memory          | Config loaded from ...
    2026-06-12 14:30:01.235 | INFO     | fuse                 | FUSE session log: ...
"""
from __future__ import annotations

import sys
from datetime import datetime
from pathlib import Path

from loguru import logger

from fuse.utils.paths import LOGS_DIR


def _fmt(record: dict) -> str:
    """Format string factory — injects ``plugin`` from extra if bound."""
    plugin = record["extra"].get("plugin", "fuse")
    return (
        f"{{time:YYYY-MM-DD HH:mm:ss.SSS}} | {{level:<8}} | {plugin:<20} | {{message}}\n{{exception}}"
    )


def setup(stderr_level: str = "DEBUG") -> Path:
    """Configure loguru sinks for a new FUSE session.

    Removes the default loguru sink and installs two replacements:

    * **stderr** — colored, at *stderr_level* (default ``DEBUG``).
    * **session file** — UTF-8, always at ``DEBUG``, written via a background
      thread (``enqueue=True``) so the tick loop is never blocked by disk I/O.

    Returns the path of the session log file.
    """
    LOGS_DIR.mkdir(parents=True, exist_ok=True)

    session_file = LOGS_DIR / f"fuse_{datetime.now().strftime('%Y-%m-%d--%H-%M')}.log"

    logger.remove()

    logger.add(
        sys.stderr,
        level=stderr_level,
        format=_fmt,
        colorize=True,
    )

    logger.add(
        session_file,
        level="DEBUG",
        format=_fmt,
        encoding="utf-8",
        enqueue=True,   # background thread — non-blocking for tick loop
    )

    logger.info(f"Session log: {session_file}")
    return session_file


__all__ = ["setup", "LOGS_DIR"]
