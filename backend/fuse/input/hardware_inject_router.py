"""
Hardware injection router — picks backend based on config.

Config key:  "input_backend": "arduino" | "sendinput" | "none"
Default:     "arduino"

Public API (same regardless of backend):
    inject_mouse_movement(dx, dy)
    inject_mouse_click()
    set_cursor_pos(x, y)
    is_admin()
    enable_hires_timer()
    disable_hires_timer()
    connect(port=None)      -- no-op for non-arduino backends
    disconnect()            -- no-op for non-arduino backends
    is_connected()          -- always False for non-arduino backends

Call init_backend(name) to switch backends at runtime (FUSE plugin path).
In standalone mode the backend is auto-detected from the config file at import.
"""

import json
from loguru import logger

from fuse.utils.paths import resolve_config

# ---------------------------------------------------------------------------
# Module-level function references — reassigned by _apply_backend()
# ---------------------------------------------------------------------------

def inject_mouse_movement(dx, dy): pass
def inject_mouse_click(): pass
def set_cursor_pos(x, y): pass
def is_admin(): return False
def enable_hires_timer(): pass
def disable_hires_timer(): pass
def connect(port=None): return False
def disconnect(): pass
def is_connected(): return False

_current_backend: str = "none"


def _apply_backend(name: str) -> None:
    global inject_mouse_movement, inject_mouse_click, set_cursor_pos
    global is_admin, enable_hires_timer, disable_hires_timer
    global connect, disconnect, is_connected, _current_backend

    name = (name or "arduino").lower().strip()
    _current_backend = name

    if name == "arduino":
        from fuse.input import hardware_inject_arduino as _m
        inject_mouse_movement = _m.inject_mouse_movement
        inject_mouse_click    = _m.inject_mouse_click
        set_cursor_pos        = _m.set_cursor_pos
        is_admin              = _m.is_admin
        enable_hires_timer    = _m.enable_hires_timer
        disable_hires_timer   = _m.disable_hires_timer
        connect               = _m.connect
        disconnect            = _m.disconnect
        is_connected          = _m.is_connected
    else:
        from fuse.input import hardware_inject as _m
        inject_mouse_movement = _m.inject_mouse_movement
        inject_mouse_click    = _m.inject_mouse_click
        set_cursor_pos        = _m.set_cursor_pos
        is_admin              = _m.is_admin
        enable_hires_timer    = _m.enable_hires_timer
        disable_hires_timer   = _m.disable_hires_timer
        # sendinput / none have no hardware connect lifecycle
        connect      = lambda port=None: False
        disconnect   = lambda: None
        is_connected = lambda: False


def init_backend(name: str) -> None:
    """Switch backends at runtime. Called by the FUSE plugin after config load."""
    _apply_backend(name)
    logger.info("Input backend: {}", _current_backend)


def _read_standalone_backend() -> str:
    """Read backend from the standalone config file (non-FUSE path)."""
    for cfg_name in ("heat_ailos_torc.json",):
        try:
            with open(resolve_config(cfg_name)) as f:
                return json.load(f).get("input_backend", "arduino").lower()
        except Exception:
            pass
    return "arduino"


# Auto-detect for standalone (non-FUSE) usage.
_apply_backend(_read_standalone_backend())
logger.info("Input backend: {}", _current_backend)
