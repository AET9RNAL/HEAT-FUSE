"""
LayeredWindow — Win32 per-pixel-alpha overlay window.

Wraps CreateWindowExW + UpdateLayeredWindow for true RGBA transparency.
No grey borders, no drop shadows, no chroma-key. Works alongside tkinter mainloop.

Usage:
    from fuse.utils.layered_window import LayeredWindow
    win = LayeredWindow("My Overlay")
    win.create(pil_rgba_image, global_alpha=220)
    win.show()
    win.move(100, 200)
    win.update_image(new_pil_rgba_image)
    win.destroy()
"""

import ctypes
import ctypes.wintypes as wt
import numpy as np
from PIL import Image
from loguru import logger

# ── Win32 constants ──────────────────────────────────────────────────
WS_EX_LAYERED     = 0x00080000
WS_EX_TRANSPARENT  = 0x00000020
WS_EX_TOPMOST     = 0x00000008
WS_EX_TOOLWINDOW  = 0x00000080
WS_EX_NOACTIVATE  = 0x08000000
WS_POPUP           = 0x80000000

GWL_EXSTYLE = -20
ULW_ALPHA   = 0x00000002
AC_SRC_OVER  = 0x00
AC_SRC_ALPHA = 0x01
BI_RGB       = 0

SW_HIDE          = 0
SW_SHOWNOACTIVATE = 4

HTCAPTION  = 2
HTTRANSPARENT = -1

WM_NCHITTEST = 0x0084
WM_DESTROY   = 0x0002

SWP_NOMOVE     = 0x0002
SWP_NOSIZE     = 0x0001
SWP_NOACTIVATE = 0x0010
SWP_NOZORDER   = 0x0004
SWP_SHOWWINDOW = 0x0040
SWP_HIDEWINDOW = 0x0080
SWP_ASYNCWINDOWPOS = 0x4000

HWND_TOPMOST = -1

# ── Structures ───────────────────────────────────────────────────────
class BLENDFUNCTION(ctypes.Structure):
    _fields_ = [
        ("BlendOp",     ctypes.c_byte),
        ("BlendFlags",  ctypes.c_byte),
        ("SourceConstantAlpha", ctypes.c_byte),
        ("AlphaFormat", ctypes.c_byte),
    ]

class BITMAPINFOHEADER(ctypes.Structure):
    _fields_ = [
        ("biSize",          ctypes.c_uint32),
        ("biWidth",         ctypes.c_int32),
        ("biHeight",        ctypes.c_int32),
        ("biPlanes",        ctypes.c_uint16),
        ("biBitCount",      ctypes.c_uint16),
        ("biCompression",   ctypes.c_uint32),
        ("biSizeImage",     ctypes.c_uint32),
        ("biXPelsPerMeter", ctypes.c_int32),
        ("biYPelsPerMeter", ctypes.c_int32),
        ("biClrUsed",       ctypes.c_uint32),
        ("biClrImportant",  ctypes.c_uint32),
    ]

class BITMAPINFO(ctypes.Structure):
    _fields_ = [("bmiHeader", BITMAPINFOHEADER)]

class WNDCLASSEXW(ctypes.Structure):
    _fields_ = [
        ("cbSize",        ctypes.c_uint),
        ("style",         ctypes.c_uint),
        ("lpfnWndProc",   ctypes.c_void_p),
        ("cbClsExtra",    ctypes.c_int),
        ("cbWndExtra",    ctypes.c_int),
        ("hInstance",     wt.HINSTANCE),
        ("hIcon",         wt.HICON),
        ("hCursor",       wt.HICON),
        ("hbrBackground", wt.HBRUSH),
        ("lpszMenuName",  ctypes.c_wchar_p),
        ("lpszClassName", ctypes.c_wchar_p),
        ("hIconSm",       wt.HICON),
    ]

# ── Win32 function setup ─────────────────────────────────────────────
user32  = ctypes.windll.user32
gdi32   = ctypes.windll.gdi32
kernel32 = ctypes.windll.kernel32

LRESULT = ctypes.c_longlong
WNDPROC = ctypes.WINFUNCTYPE(
    LRESULT, wt.HWND, ctypes.c_uint, wt.WPARAM, wt.LPARAM)

_DefWindowProcW = user32.DefWindowProcW
_DefWindowProcW.restype = LRESULT
_DefWindowProcW.argtypes = [wt.HWND, ctypes.c_uint, wt.WPARAM, wt.LPARAM]

# Class name counter to avoid collisions
_class_counter = 0


def _premultiply_bgra(image: Image.Image) -> bytes:
    """Convert PIL RGBA image to premultiplied BGRA bytes (bottom-up DIB)."""
    w, h = image.size
    arr = np.array(image, dtype=np.uint16)
    alpha = arr[:, :, 3:4]
    arr[:, :, :3] = (arr[:, :, :3] * alpha) // 255
    # RGBA -> BGRA
    result = np.empty((h, w, 4), dtype=np.uint8)
    result[:, :, 0] = arr[:, :, 2]  # B
    result[:, :, 1] = arr[:, :, 1]  # G
    result[:, :, 2] = arr[:, :, 0]  # R
    result[:, :, 3] = arr[:, :, 3]  # A
    # Flip vertically for bottom-up DIB
    return np.ascontiguousarray(result[::-1]).tobytes()


class LayeredWindow:
    """A Win32 layered window displaying a PIL RGBA image with per-pixel alpha.

    Integrates with tkinter mainloop — no separate message pump needed.
    tkinter's Tcl event loop dispatches Win32 messages on the same thread.
    """

    def __init__(self, title="Overlay", x=0, y=0, draggable=False):
        self.title = title
        self.x = x
        self.y = y
        self.width = 1
        self.height = 1
        self.global_alpha = 255
        self.draggable = draggable
        self.visible = False
        self.hwnd = None
        self._hdc_mem = None
        self._hbm = None
        self._wndproc_ref = None  # prevent GC
        self._class_name = None

    @property
    def is_created(self):
        return self.hwnd is not None

    def create(self, image: Image.Image = None, global_alpha: int = 255):
        """Create the Win32 window. Call from GUI thread."""
        if self.hwnd:
            return

        global _class_counter
        _class_counter += 1
        self._class_name = f"LayeredWin_{_class_counter}_{id(self)}"
        self.global_alpha = global_alpha

        hinstance = kernel32.GetModuleHandleW(None)

        # WndProc
        this = self
        def wnd_proc(hwnd, msg, wparam, lparam):
            if msg == WM_NCHITTEST:
                if this.draggable:
                    return HTCAPTION
                return HTTRANSPARENT
            if msg == WM_DESTROY:
                return 0
            return _DefWindowProcW(hwnd, msg, wparam, lparam)

        self._wndproc_ref = WNDPROC(wnd_proc)

        wc = WNDCLASSEXW()
        wc.cbSize = ctypes.sizeof(WNDCLASSEXW)
        wc.lpfnWndProc = ctypes.cast(self._wndproc_ref, ctypes.c_void_p).value
        wc.hInstance = hinstance
        wc.lpszClassName = self._class_name
        wc.hCursor = user32.LoadCursorW(None, 32512)

        user32.RegisterClassExW(ctypes.byref(wc))

        # Determine initial size
        if image:
            image = image.convert("RGBA")
            self.width, self.height = image.size
        else:
            self.width, self.height = 1, 1

        ex_style = WS_EX_LAYERED | WS_EX_TOPMOST | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE

        self.hwnd = user32.CreateWindowExW(
            ex_style,
            self._class_name,
            self.title,
            WS_POPUP,  # hidden initially
            self.x, self.y, self.width, self.height,
            None, None, hinstance, None,
        )

        if not self.hwnd:
            logger.error(f"CreateWindowExW failed for '{self.title}'")
            return

        if image:
            self._create_dib(image)
            self._push_layered()

    def update_image(self, image: Image.Image, global_alpha: int = None,
                     x: int = None, y: int = None):
        """Update displayed image. Call from GUI thread.

        Pass x/y to atomically update position together with the image.
        """
        if not self.hwnd:
            return
        image = image.convert("RGBA")
        new_w, new_h = image.size
        if new_w != self.width or new_h != self.height:
            self.width = new_w
            self.height = new_h
        if global_alpha is not None:
            self.global_alpha = global_alpha
        if x is not None:
            self.x = x
        if y is not None:
            self.y = y
        self._free_gdi()
        self._create_dib(image)
        self._push_layered(set_position=(x is not None or y is not None))

    def set_alpha(self, alpha: int):
        """Update global alpha without changing image."""
        if not self.hwnd:
            return
        self.global_alpha = max(0, min(255, alpha))
        if self._hdc_mem:
            self._push_layered(set_position=False)

    def move(self, x: int, y: int):
        """Reposition the window."""
        self.x = int(x)
        self.y = int(y)
        if self.hwnd:
            user32.SetWindowPos(
                self.hwnd, HWND_TOPMOST, self.x, self.y, 0, 0,
                SWP_NOSIZE | SWP_NOACTIVATE)
            if self._hdc_mem:
                self._push_layered()

    def show(self):
        """Show the window."""
        if not self.hwnd:
            return
        self.visible = True
        user32.ShowWindow(self.hwnd, SW_SHOWNOACTIVATE)
        user32.SetWindowPos(
            self.hwnd, HWND_TOPMOST, 0, 0, 0, 0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_SHOWWINDOW)

    def hide(self):
        """Hide the window."""
        if not self.hwnd:
            return
        self.visible = False
        user32.ShowWindow(self.hwnd, SW_HIDE)

    def set_click_through(self, enable: bool):
        """Toggle click-through (WS_EX_TRANSPARENT)."""
        if not self.hwnd:
            return
        style = user32.GetWindowLongW(self.hwnd, GWL_EXSTYLE)
        if enable:
            style |= WS_EX_TRANSPARENT
        else:
            style &= ~WS_EX_TRANSPARENT
        user32.SetWindowLongW(self.hwnd, GWL_EXSTYLE, style)

    def set_draggable(self, enable: bool):
        """Toggle draggable mode (affects WM_NCHITTEST response)."""
        self.draggable = enable

    def get_position(self):
        """Get current screen position (reads from OS, accounts for drag)."""
        if not self.hwnd:
            return [self.x, self.y]
        rect = wt.RECT()
        if user32.GetWindowRect(self.hwnd, ctypes.byref(rect)):
            self.x = rect.left
            self.y = rect.top
        return [self.x, self.y]

    def get_size(self):
        """Return (width, height)."""
        return self.width, self.height

    def ensure_topmost(self):
        """Re-assert topmost z-order."""
        if self.hwnd:
            user32.SetWindowPos(
                self.hwnd, HWND_TOPMOST, 0, 0, 0, 0,
                SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE)

    def destroy(self):
        """Destroy window and free resources."""
        self._free_gdi()
        if self.hwnd:
            try:
                user32.DestroyWindow(self.hwnd)
            except Exception:
                pass
            self.hwnd = None
        self.visible = False

    # ── Internal ─────────────────────────────────────────────────────

    def _create_dib(self, image: Image.Image):
        """Create a DIB section from a PIL RGBA image."""
        raw = _premultiply_bgra(image)

        bmi = BITMAPINFO()
        bmi.bmiHeader.biSize = ctypes.sizeof(BITMAPINFOHEADER)
        bmi.bmiHeader.biWidth = self.width
        bmi.bmiHeader.biHeight = self.height
        bmi.bmiHeader.biPlanes = 1
        bmi.bmiHeader.biBitCount = 32
        bmi.bmiHeader.biCompression = BI_RGB

        ppvBits = ctypes.c_void_p()
        screen_dc = user32.GetDC(None)
        self._hdc_mem = gdi32.CreateCompatibleDC(screen_dc)
        self._hbm = gdi32.CreateDIBSection(
            self._hdc_mem, ctypes.byref(bmi), 0,
            ctypes.byref(ppvBits), None, 0,
        )
        user32.ReleaseDC(None, screen_dc)

        ctypes.memmove(ppvBits, raw, len(raw))
        gdi32.SelectObject(self._hdc_mem, self._hbm)

    def _push_layered(self, *, set_position: bool = True):
        """Push current DIB to the layered window.

        Pass set_position=False for image/alpha-only updates: pptDst becomes
        NULL so UpdateLayeredWindow renders at the current OS window position
        instead of snapping back to the cached self.x/self.y.  This prevents
        the 33 ms animation loop from interrupting an in-progress drag.
        """
        if not self.hwnd or not self._hdc_mem:
            return

        pt_src = wt.POINT(0, 0)
        size = wt.SIZE(self.width, self.height)

        blend = BLENDFUNCTION()
        blend.BlendOp = AC_SRC_OVER
        blend.BlendFlags = 0
        blend.SourceConstantAlpha = self.global_alpha
        blend.AlphaFormat = AC_SRC_ALPHA

        if set_position:
            pt_dst = wt.POINT(self.x, self.y)
            pdst_ptr = ctypes.byref(pt_dst)
        else:
            pdst_ptr = None

        screen_dc = user32.GetDC(None)
        user32.UpdateLayeredWindow(
            self.hwnd, screen_dc,
            pdst_ptr, ctypes.byref(size),
            self._hdc_mem, ctypes.byref(pt_src),
            0, ctypes.byref(blend), ULW_ALPHA,
        )
        user32.ReleaseDC(None, screen_dc)

    def _free_gdi(self):
        """Free GDI objects."""
        if self._hbm:
            gdi32.DeleteObject(self._hbm)
            self._hbm = None
        if self._hdc_mem:
            gdi32.DeleteDC(self._hdc_mem)
            self._hdc_mem = None