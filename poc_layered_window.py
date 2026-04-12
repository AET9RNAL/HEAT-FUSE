"""
POC: Win32 Layered Window with true per-pixel alpha.

Displays assets/predictor.png as a floating overlay with full RGBA transparency.
No grey borders, no drop shadows, no chroma-key hack.

Controls:
  - Drag to move
  - Right-click to close
  - Mouse wheel to change global alpha (stacks with per-pixel alpha)
"""

import ctypes
import ctypes.wintypes as wt
import os
import sys
import struct
import time
import threading

from PIL import Image

# ── Win32 constants ──────────────────────────────────────────────────
WS_EX_LAYERED = 0x00080000
WS_EX_TRANSPARENT = 0x00000020
WS_EX_TOPMOST = 0x00000008
WS_EX_TOOLWINDOW = 0x00000080
WS_EX_NOACTIVATE = 0x08000000
WS_POPUP = 0x80000000
WS_VISIBLE = 0x10000000

GWL_EXSTYLE = -20
SWP_NOMOVE = 0x0002
SWP_NOSIZE = 0x0001
SWP_NOACTIVATE = 0x0010
HWND_TOPMOST = -1

ULW_ALPHA = 0x00000002
AC_SRC_OVER = 0x00
AC_SRC_ALPHA = 0x01

WM_DESTROY = 0x0002
WM_NCHITTEST = 0x0084
WM_LBUTTONDOWN = 0x0201
WM_RBUTTONDOWN = 0x0204
WM_MOUSEWHEEL = 0x020A
WM_PAINT = 0x000F
HTCAPTION = 2

BI_RGB = 0
DIB_RGB_COLORS = 0

# ── Structures ───────────────────────────────────────────────────────
class BLENDFUNCTION(ctypes.Structure):
    _fields_ = [
        ("BlendOp", ctypes.c_byte),
        ("BlendFlags", ctypes.c_byte),
        ("SourceConstantAlpha", ctypes.c_byte),
        ("AlphaFormat", ctypes.c_byte),
    ]

class BITMAPINFOHEADER(ctypes.Structure):
    _fields_ = [
        ("biSize", ctypes.c_uint32),
        ("biWidth", ctypes.c_int32),
        ("biHeight", ctypes.c_int32),
        ("biPlanes", ctypes.c_uint16),
        ("biBitCount", ctypes.c_uint16),
        ("biCompression", ctypes.c_uint32),
        ("biSizeImage", ctypes.c_uint32),
        ("biXPelsPerMeter", ctypes.c_int32),
        ("biYPelsPerMeter", ctypes.c_int32),
        ("biClrUsed", ctypes.c_uint32),
        ("biClrImportant", ctypes.c_uint32),
    ]

class BITMAPINFO(ctypes.Structure):
    _fields_ = [
        ("bmiHeader", BITMAPINFOHEADER),
    ]

# ── Win32 function shortcuts ─────────────────────────────────────────
user32 = ctypes.windll.user32
gdi32 = ctypes.windll.gdi32
kernel32 = ctypes.windll.kernel32

CreateWindowExW = user32.CreateWindowExW
DefWindowProcW = user32.DefWindowProcW
RegisterClassExW = user32.RegisterClassExW
GetModuleHandleW = kernel32.GetModuleHandleW
PostQuitMessage = user32.PostQuitMessage
GetMessageW = user32.GetMessageW
TranslateMessage = user32.TranslateMessage
DispatchMessageW = user32.DispatchMessageW
UpdateLayeredWindow = user32.UpdateLayeredWindow
GetDC = user32.GetDC
ReleaseDC = user32.ReleaseDC
CreateCompatibleDC = gdi32.CreateCompatibleDC
SelectObject = gdi32.SelectObject
DeleteObject = gdi32.DeleteObject
DeleteDC = gdi32.DeleteDC
CreateDIBSection = gdi32.CreateDIBSection
SetWindowPos = user32.SetWindowPos
SendMessageW = user32.SendMessageW
ReleaseCapture = user32.ReleaseCapture
DestroyWindow = user32.DestroyWindow
GetWindowLongW = user32.GetWindowLongW
SetWindowLongW = user32.SetWindowLongW

# WNDCLASSEXW
class WNDCLASSEXW(ctypes.Structure):
    _fields_ = [
        ("cbSize", ctypes.c_uint),
        ("style", ctypes.c_uint),
        ("lpfnWndProc", ctypes.c_void_p),
        ("cbClsExtra", ctypes.c_int),
        ("cbWndExtra", ctypes.c_int),
        ("hInstance", wt.HINSTANCE),
        ("hIcon", wt.HICON),
        ("hCursor", wt.HICON),
        ("hbrBackground", wt.HBRUSH),
        ("lpszMenuName", ctypes.c_wchar_p),
        ("lpszClassName", ctypes.c_wchar_p),
        ("hIconSm", wt.HICON),
    ]


class LayeredOverlay:
    """A single Win32 layered window displaying a PIL RGBA image."""

    def __init__(self, image: Image.Image, x: int = 100, y: int = 100,
                 global_alpha: int = 255, click_through: bool = False):
        self.image = image.convert("RGBA")
        self.width, self.height = self.image.size
        self.x = x
        self.y = y
        self.global_alpha = global_alpha
        self.click_through = click_through
        self.hwnd = None
        self._hdc_mem = None
        self._hbm = None
        self._class_name = f"LayeredOverlayPOC_{id(self)}"

    def run(self):
        """Create window and enter message loop (blocking)."""
        hinstance = GetModuleHandleW(None)

        # Define WndProc — use LRESULT (c_longlong on 64-bit) to avoid overflow
        LRESULT = ctypes.c_longlong
        WNDPROC = ctypes.WINFUNCTYPE(LRESULT, wt.HWND, ctypes.c_uint, wt.WPARAM, wt.LPARAM)

        # Set proper restype for DefWindowProcW
        DefWindowProcW.restype = LRESULT
        DefWindowProcW.argtypes = [wt.HWND, ctypes.c_uint, wt.WPARAM, wt.LPARAM]

        def wnd_proc(hwnd, msg, wparam, lparam):
            if msg == WM_DESTROY:
                PostQuitMessage(0)
                return 0
            if msg == WM_NCHITTEST:
                # Let entire window be draggable
                return HTCAPTION
            if msg == WM_RBUTTONDOWN:
                DestroyWindow(hwnd)
                return 0
            if msg == WM_MOUSEWHEEL:
                delta = ctypes.c_short((wparam >> 16) & 0xFFFF).value
                step = 15
                if delta > 0:
                    self.global_alpha = min(255, self.global_alpha + step)
                else:
                    self.global_alpha = max(10, self.global_alpha - step)
                self._update_layered()
                return 0
            return DefWindowProcW(hwnd, msg, wparam, lparam)

        self._wnd_proc_ref = WNDPROC(wnd_proc)  # prevent GC

        wc = WNDCLASSEXW()
        wc.cbSize = ctypes.sizeof(WNDCLASSEXW)
        wc.lpfnWndProc = ctypes.cast(self._wnd_proc_ref, ctypes.c_void_p).value
        wc.hInstance = hinstance
        wc.lpszClassName = self._class_name
        wc.hCursor = user32.LoadCursorW(None, 32512)  # IDC_ARROW

        RegisterClassExW(ctypes.byref(wc))

        ex_style = WS_EX_LAYERED | WS_EX_TOPMOST | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE
        if self.click_through:
            ex_style |= WS_EX_TRANSPARENT

        self.hwnd = CreateWindowExW(
            ex_style,
            self._class_name,
            "POC Layered Overlay",
            WS_POPUP | WS_VISIBLE,
            self.x, self.y, self.width, self.height,
            None, None, hinstance, None,
        )

        # Create DIB section from PIL image
        self._create_dib()
        self._update_layered()

        print(f"Window created: {self.width}x{self.height} @ ({self.x},{self.y})")
        print(f"Global alpha: {self.global_alpha}/255")
        print(f"Drag to move | Scroll to change alpha | Right-click to close")

        # Message loop
        msg = wt.MSG()
        while GetMessageW(ctypes.byref(msg), None, 0, 0) > 0:
            TranslateMessage(ctypes.byref(msg))
            DispatchMessageW(ctypes.byref(msg))

        self._cleanup()

    def _create_dib(self):
        """Create a Win32 DIB section from PIL RGBA image with premultiplied alpha."""
        # Premultiply alpha (required by UpdateLayeredWindow)
        img = self.image.copy()
        r, g, b, a = img.split()

        # Premultiply: channel = channel * alpha / 255
        import numpy as np
        arr = np.array(img, dtype=np.uint16)
        alpha = arr[:, :, 3:4]
        arr[:, :, :3] = (arr[:, :, :3] * alpha) // 255
        img = Image.fromarray(arr.astype(np.uint8), "RGBA")

        # Convert to BGRA byte order (Win32 expects BGRA)
        raw = img.tobytes("raw", "BGRA")

        # DIB is bottom-up, so flip vertically
        stride = self.width * 4
        flipped = b""
        for row in range(self.height - 1, -1, -1):
            flipped += raw[row * stride : (row + 1) * stride]

        # Create DIB section
        bmi = BITMAPINFO()
        bmi.bmiHeader.biSize = ctypes.sizeof(BITMAPINFOHEADER)
        bmi.bmiHeader.biWidth = self.width
        bmi.bmiHeader.biHeight = self.height  # positive = bottom-up
        bmi.bmiHeader.biPlanes = 1
        bmi.bmiHeader.biBitCount = 32
        bmi.bmiHeader.biCompression = BI_RGB

        ppvBits = ctypes.c_void_p()
        screen_dc = GetDC(None)
        self._hdc_mem = CreateCompatibleDC(screen_dc)
        self._hbm = CreateDIBSection(
            self._hdc_mem, ctypes.byref(bmi), DIB_RGB_COLORS,
            ctypes.byref(ppvBits), None, 0,
        )
        ReleaseDC(None, screen_dc)

        # Copy pixel data into DIB
        ctypes.memmove(ppvBits, flipped, len(flipped))
        SelectObject(self._hdc_mem, self._hbm)

    def _update_layered(self):
        """Push current DIB to the layered window with current global alpha."""
        if not self.hwnd or not self._hdc_mem:
            return

        pt_src = wt.POINT(0, 0)
        pt_dst = wt.POINT(self.x, self.y)
        size = wt.SIZE(self.width, self.height)

        blend = BLENDFUNCTION()
        blend.BlendOp = AC_SRC_OVER
        blend.BlendFlags = 0
        blend.SourceConstantAlpha = self.global_alpha
        blend.AlphaFormat = AC_SRC_ALPHA

        screen_dc = GetDC(None)
        UpdateLayeredWindow(
            self.hwnd, screen_dc,
            ctypes.byref(pt_dst), ctypes.byref(size),
            self._hdc_mem, ctypes.byref(pt_src),
            0, ctypes.byref(blend), ULW_ALPHA,
        )
        ReleaseDC(None, screen_dc)

    def update_image(self, new_image: Image.Image, global_alpha: int = None):
        """Update displayed image at runtime (call from same thread)."""
        self.image = new_image.convert("RGBA")
        if global_alpha is not None:
            self.global_alpha = global_alpha
        # Recreate DIB
        if self._hbm:
            DeleteObject(self._hbm)
        if self._hdc_mem:
            DeleteDC(self._hdc_mem)
        self._create_dib()
        self._update_layered()

    def _cleanup(self):
        if self._hbm:
            DeleteObject(self._hbm)
            self._hbm = None
        if self._hdc_mem:
            DeleteDC(self._hdc_mem)
            self._hdc_mem = None


def main():
    assets_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets")
    img_path = os.path.join(assets_dir, "predictor.png")

    if not os.path.exists(img_path):
        print(f"Image not found: {img_path}")
        sys.exit(1)

    img = Image.open(img_path).convert("RGBA")
    print(f"Loaded: {img_path} ({img.size[0]}x{img.size[1]})")

    # Center on screen
    screen_w = ctypes.windll.user32.GetSystemMetrics(0)
    screen_h = ctypes.windll.user32.GetSystemMetrics(1)
    x = (screen_w - img.size[0]) // 2
    y = (screen_h - img.size[1]) // 2

    overlay = LayeredOverlay(img, x=x, y=y, global_alpha=220)
    overlay.run()


if __name__ == "__main__":
    main()
