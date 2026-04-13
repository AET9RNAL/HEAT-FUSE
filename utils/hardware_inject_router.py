"""
Hardware injection router — picks backend based on saclos_config.json.

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

_CONFIG_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                            'saclos_config.json')

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
    from utils.hardware_inject_arduino import (          # noqa: F401
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
    from utils.hardware_inject import (                  # noqa: F401
        inject_mouse_movement,
        inject_mouse_click,
        set_cursor_pos,
        is_admin,
        enable_hires_timer,
        disable_hires_timer,
    )
    # Stubs so callers don't need to check backend
    def connect(port=None, baud=115200, timeout=2.0):    # noqa: F811
        return True
    def disconnect():                                     # noqa: F811
        pass
    def is_connected():                                   # noqa: F811
        return True
