"""
Hardware injection router — picks backend based on heat_ailos_torc.json.

Config key:  "input_backend": "arduino" | "sendinput"
Default:     "arduino"

Re-exports the same public API regardless of backend:
    inject_mouse_movement(dx, dy)
    inject_mouse_click()
    set_cursor_pos(x, y)
    is_admin()
    enable_hires_timer()
    disable_hires_timer()

Arduino backend also exposes:
    connect(port=None)
    disconnect()
    is_connected()
"""

import json
import os
from loguru import logger

from fuse.utils.paths import resolve_config

_CONFIG_PATH = resolve_config('heat_ailos_torc.json')

def _read_backend() -> str:
    try:
        with open(_CONFIG_PATH, 'r') as f:
            cfg = json.load(f)
        return cfg.get('input_backend', 'arduino').lower()
    except Exception:
        return 'arduino'

_backend = _read_backend()
logger.info("Input backend: {}", _backend)

if _backend == 'arduino':
    from fuse.utils.hardware_inject_arduino import (          # noqa: F401
        inject_mouse_movement,
        inject_mouse_click,
        set_cursor_pos,
        is_admin,
        enable_hires_timer,
        disable_hires_timer,
        connect,
        disconnect,
        is_connected,
    )
else:
    from fuse.utils.hardware_inject import (                  # noqa: F401
        inject_mouse_movement,
        inject_mouse_click,
        set_cursor_pos,
        is_admin,
        enable_hires_timer,
        disable_hires_timer,
    )