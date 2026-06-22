import ctypes
import ctypes.wintypes as _wt
import time

class _MOUSEINPUT(ctypes.Structure):
    _fields_ = [
        ('dx',          _wt.LONG),
        ('dy',          _wt.LONG),
        ('mouseData',   _wt.DWORD),
        ('dwFlags',     _wt.DWORD),
        ('time',        _wt.DWORD),
        ('dwExtraInfo', ctypes.c_size_t),   # ULONG_PTR — must be 0
    ]

class _INPUT(ctypes.Structure):
    class _U(ctypes.Union):
        _fields_ = [('mi', _MOUSEINPUT)]
    _anonymous_ = ('_u',)
    _fields_ = [
        ('type', _wt.DWORD),
        ('_u',   _U),
    ]

_INPUT_MOUSE          = 0
_MOUSEEVENTF_MOVE     = 0x0001
_MOUSEEVENTF_LEFTDOWN = 0x0002
_MOUSEEVENTF_LEFTUP   = 0x0004

_SendInput = ctypes.windll.user32.SendInput
_SendInput.restype = ctypes.c_uint

# High-resolution timer  (1 ms instead of default ~15.6 ms)
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

def is_admin():
    """Return True if the process is running with administrator privileges."""
    try:
        return ctypes.windll.shell32.IsUserAnAdmin() != 0
    except Exception:
        return False

def inject_mouse_movement(dx, dy):
    """Inject relative mouse movement via SendInput (module-level structs)."""
    enable_hires_timer()
    inp = _INPUT()
    inp.type = _INPUT_MOUSE
    inp.mi = _MOUSEINPUT(dx, dy, 0, _MOUSEEVENTF_MOVE, 0, 0)
    _SendInput(1, ctypes.pointer(inp), ctypes.sizeof(_INPUT))

def set_cursor_pos(x, y):
    """Teleport mouse cursor to absolute screen coordinates."""
    ctypes.windll.user32.SetCursorPos(int(x), int(y))

def inject_mouse_click():
    """Inject a left mouse button click (down + up) via SendInput."""
    enable_hires_timer()
    events = (_INPUT * 2)()
    events[0].type = _INPUT_MOUSE
    events[0].mi = _MOUSEINPUT(0, 0, 0, _MOUSEEVENTF_LEFTDOWN, 0, 0)
    events[1].type = _INPUT_MOUSE
    events[1].mi = _MOUSEINPUT(0, 0, 0, _MOUSEEVENTF_LEFTUP, 0, 0)
    _SendInput(2, ctypes.pointer(events[0]), ctypes.sizeof(_INPUT))
    # Give the game engine time to process the click before we start
    # injecting mouse movement (missile guidance mode transition).
    time.sleep(0.06)