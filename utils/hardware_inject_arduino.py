"""
Hardware mouse injection via Arduino Pro Micro (ATmega32U4) over serial.

Drop-in replacement for hardware_inject.py — same public API:
    connect()                 — open COM port (call once at startup)
    disconnect()              — close COM port
    inject_mouse_movement()   — relative mouse move
    inject_mouse_click()      — left click (down + up)
    set_cursor_pos()          — absolute cursor teleport (fallback: SendInput)
    is_admin()                — admin check (unchanged)
    enable_hires_timer()      — hi-res timer (still useful for Python-side timing)
    disable_hires_timer()

Protocol (Python → Arduino, 5 bytes per packet):
    [CMD:1] [X_LO:1] [X_HI:1] [Y_LO:1] [Y_HI:1]

CMD byte:
    0x01 = relative mouse move   (X, Y = int16 relative deltas)
    0x02 = left click             (X, Y ignored)
    0x03 = left button down       (X, Y ignored)
    0x04 = left button up         (X, Y ignored)
"""

import struct
import time
import ctypes
from loguru import logger as log

try:
    import serial
    import serial.tools.list_ports
    _HAS_SERIAL = True
except ImportError:
    _HAS_SERIAL = False


CMD_MOVE       = 0x01
CMD_CLICK      = 0x02
CMD_LEFT_DOWN  = 0x03
CMD_LEFT_UP    = 0x04
PACKET_FMT     = '<Bhh'        # CMD(uint8) + X(int16) + Y(int16) = 5 bytes
BAUD_RATE      = 115200


_ser = None  

_timer_active = False
def enable_hires_timer():
    global _timer_active
    if not _timer_active:
        ctypes.windll.winmm.timeBeginPeriod(1)
        _timer_active = True

def disable_hires_timer():
    global _timer_active
    if _timer_active:
        ctypes.windll.winmm.timeEndPeriod(1)
        _timer_active = False

def _auto_detect_port():
    """Find first COM port with VID matching Arduino/SparkFun ATmega32U4."""
    if not _HAS_SERIAL:
        return None
    KNOWN_VIDS = {'2341', '1b4f', '1a86', '2a03', '1532'}   # Arduino, SparkFun, CH340, Arduino.org, Razer (spoofed)
    for info in serial.tools.list_ports.comports():
        # Primary: parsed vid field (may be None on Windows composite devices)
        if info.vid is not None and f'{info.vid:04x}' in KNOWN_VIDS:
            log.info("Auto-detected Arduino on {} (VID=0x{:04X} PID=0x{:04X})",
                     info.device, info.vid, info.pid or 0)
            return info.device
        # Fallback: scan hwid string (e.g. 'USB VID:PID=2341:8036')
        hwid = (info.hwid or '').lower()
        if any(f'vid_{v}' in hwid or f'vid:pid={v}' in hwid for v in KNOWN_VIDS):
            log.info("Auto-detected Arduino on {} via hwid: {}", info.device, info.hwid)
            return info.device
    log.error("No Arduino detected. Available ports: {}",
               [(i.device, i.hwid) for i in serial.tools.list_ports.comports()])
    return None

def connect(port=None, baud=BAUD_RATE, timeout=2.0):
    """Open serial connection to Arduino. Auto-detects port if not given.
    Returns True on success."""
    global _ser
    if not _HAS_SERIAL:
        log.error("pyserial not installed. Run: pip install pyserial")
        return False
    if _ser is not None and _ser.is_open:
        return True

    if port is None:
        port = _auto_detect_port()
        if port is None:
            log.error("No Arduino Pro Micro detected. Plug in and retry.")
            return False

    try:
        _ser = serial.Serial(port, baud, timeout=timeout)
        # Arduino resets on serial open — wait for bootloader
        time.sleep(2.0)
        _ser.reset_input_buffer()
        log.info("Connected to Arduino on {} @ {} baud", port, baud)
        return True
    except serial.SerialException as e:
        log.error("Failed to open {}: {}", port, e)
        _ser = None
        return False

def disconnect():
    """Close serial connection."""
    global _ser
    if _ser is not None:
        try:
            _ser.close()
        except Exception:
            pass
        _ser = None
        log.info("Arduino disconnected")

def is_connected() -> bool:
    return _ser is not None and _ser.is_open

def _send(cmd: int, x: int = 0, y: int = 0):
    """Pack and send a 5-byte command packet."""
    if _ser is None or not _ser.is_open:
        log.warning("Arduino not connected — command dropped (cmd=0x%02X)", cmd)
        return
    # Clamp to int16 range
    x = max(-32768, min(32767, int(x)))
    y = max(-32768, min(32767, int(y)))
    _ser.write(struct.pack(PACKET_FMT, cmd, x, y))

def inject_mouse_movement(dx, dy):
    """Inject relative mouse movement via Arduino HID."""
    enable_hires_timer()
    # Arduino Mouse.move() accepts -128..127 per call.
    # For large deltas, split into multiple moves.
    while dx != 0 or dy != 0:
        sx = max(-127, min(127, dx))
        sy = max(-127, min(127, dy))
        _send(CMD_MOVE, sx, sy)
        dx -= sx
        dy -= sy

def set_cursor_pos(x, y):
    """Teleport mouse cursor to absolute screen coordinates.
    Arduino HID = relative only → fall back to SetCursorPos."""
    ctypes.windll.user32.SetCursorPos(int(x), int(y))

def inject_mouse_click():
    """Inject a left mouse button click (down + up) via Arduino HID."""
    enable_hires_timer()
    _send(CMD_CLICK)
    # Give the game engine time to process the click before we start
    # injecting mouse movement (missile guidance mode transition).
    time.sleep(0.06)

def is_admin():
    """Return True if the process is running with administrator privileges."""
    try:
        return ctypes.windll.shell32.IsUserAnAdmin() != 0
    except Exception:
        return False
