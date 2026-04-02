import ctypes

def apply_geometry_fast(hwnd, x, y, w, h=0, activate=False):
    """Apply window position/size using fast Windows API without activating."""
    if not hwnd:
        return False
    
    # SWP_NOZORDER (0x0004)
    flags = 0x0004
    if not activate:
        flags |= 0x0010  # SWP_NOACTIVATE
        
    if h == 0:
        # Just move, don't resize: SWP_NOSIZE (0x0001) | SWP_ASYNCWINDOWPOS (0x4000)
        flags |= 0x0001 | 0x4000
        result = ctypes.windll.user32.SetWindowPos(hwnd, 0, int(x), int(y), 0, 0, flags)
    else:
        # Resize and move
        # SWP_NOMOVE (0x0002) if x and y are 0, else just apply size
        if x == 0 and y == 0:
            flags |= 0x0002
        result = ctypes.windll.user32.SetWindowPos(hwnd, 0, int(x), int(y), int(w), int(h), flags)
        
    return result != 0

def set_window_clickthrough(hwnd, enable):
    """Set click-through for a given window handle."""
    if not hwnd:
        return
    GWL_EXSTYLE       = -20
    WS_EX_LAYERED     = 0x00080000
    WS_EX_TRANSPARENT = 0x00000020
    
    style = ctypes.windll.user32.GetWindowLongW(hwnd, GWL_EXSTYLE)
    if enable:
        style |= (WS_EX_LAYERED | WS_EX_TRANSPARENT)
    else:
        style &= ~WS_EX_TRANSPARENT
    ctypes.windll.user32.SetWindowLongW(hwnd, GWL_EXSTYLE, style)

def force_focus(canvas):
    """Force focus on canvas to ensure it receives keyboard events."""
    canvas.config(takefocus=True)
    canvas.focus_set()
