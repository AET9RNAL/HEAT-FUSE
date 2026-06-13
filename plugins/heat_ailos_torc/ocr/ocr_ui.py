import tkinter as tk
from loguru import logger
from heat_ailos_torc.ocr.range_ocr import TESSERACT_OK

class OCRUiMixin:
    """Mixin for the SACLOS OCR setup and display UI components."""

    def _init_ocr_ui(self):
        self.ocr_enabled = False
        self.ocr_region = None
        self.ocr_poll_interval_ms = 100
        self.ocr_thread = None
        self.ocr_stop_event = None
        self.ocr_last_range = None
        self.ocr_pending_range = None
        self.ocr_paused = False
        self.ocr_update_timer = None
        self.manual_range_override = False

        self.ocr_setup_win = None
        self.ocr_setup_visible = False
        self.OCR_SETUP_W = 120
        self.OCR_SETUP_H = 40

        self.ocr_display_win = None
        self.ocr_display_label = None
        self.ocr_display_pos = None
        self.ocr_display_visible = False
        self.ocr_display_hwnd = None

        self._create_ocr_setup_window()
        # self._create_ocr_display_window()

    def _create_ocr_setup_window(self):
        self.ocr_setup_win = tk.Toplevel(self.root)
        self.ocr_setup_win.title("SACLOS OCR Region")
        self.ocr_setup_win.overrideredirect(True)
        self.ocr_setup_win.attributes("-topmost", True)
        self.ocr_setup_win.configure(bg="#002255")
        self.ocr_setup_win.attributes("-alpha", 0.6)

        self.ocr_setup_canvas = tk.Canvas(
            self.ocr_setup_win,
            width=self.OCR_SETUP_W, height=self.OCR_SETUP_H,
            bg="#002255", highlightthickness=0
        )
        self.ocr_setup_canvas.pack(fill=tk.BOTH, expand=True)
        self._draw_ocr_setup_border()

        self.ocr_setup_canvas.bind("<ButtonPress-1>", self._ocr_setup_drag_start)
        self.ocr_setup_canvas.bind("<B1-Motion>", self._ocr_setup_drag_move)
        self.ocr_setup_canvas.bind("<ButtonPress-3>", self._ocr_setup_resize_start)
        self.ocr_setup_canvas.bind("<B3-Motion>", self._ocr_setup_resize_move)

        self.ocr_setup_win.withdraw()

    def _draw_ocr_setup_border(self):
        c = self.ocr_setup_canvas
        c.delete("all")
        w = self.OCR_SETUP_W
        h = self.OCR_SETUP_H
        c.create_rectangle(2, 2, w - 2, h - 2,
                           outline="#00ffff", width=2, dash=(4, 3))
        c.create_text(w // 2, h // 2, text="OCR",
                      fill="#00ffff", font=("Courier", 9), anchor=tk.CENTER)

    def _show_ocr_setup(self):
        if self.ocr_setup_visible:
            return
        self.ocr_setup_visible = True

        if self.ocr_region:
            x, y = self.ocr_region[0], self.ocr_region[1]
            self.OCR_SETUP_W = self.ocr_region[2] - self.ocr_region[0]
            self.OCR_SETUP_H = self.ocr_region[3] - self.ocr_region[1]
        else:
            sw = self.root.winfo_screenwidth()
            sh = self.root.winfo_screenheight()
            x = sw // 2 - self.OCR_SETUP_W // 2
            y = sh // 2 + 100

        sw = self.root.winfo_screenwidth()
        sh = self.root.winfo_screenheight()
        x = max(0, min(int(x), sw - self.OCR_SETUP_W))
        y = max(0, min(int(y), sh - self.OCR_SETUP_H))
        
        self.ocr_setup_win.geometry(f"{self.OCR_SETUP_W}x{self.OCR_SETUP_H}+{x}+{y}")
        self.ocr_setup_canvas.config(width=self.OCR_SETUP_W, height=self.OCR_SETUP_H)
        self._draw_ocr_setup_border()
        self.ocr_setup_win.deiconify()
        self.ocr_setup_win.attributes("-topmost", True)
        # self._show_ocr_display_setup()

    def _hide_ocr_setup(self):
        if not self.ocr_setup_visible:
            return
        self.ocr_setup_visible = False

        x = self.ocr_setup_win.winfo_x()
        y = self.ocr_setup_win.winfo_y()
        w = self.OCR_SETUP_W
        h = self.OCR_SETUP_H
        self.ocr_region = [x, y, x + w, y + h]
        self.ocr_enabled = True

        self.ocr_setup_win.withdraw()
        # self._hide_ocr_display_setup()
        logger.info(f"OCR region set: {self.ocr_region}")

    def _toggle_ocr_setup(self):
        if not TESSERACT_OK:
            logger.warning("OCR unavailable: pip install pytesseract  "
                           "(+ Tesseract binary on PATH)")
            return
        if self.ocr_setup_visible:
            self._hide_ocr_setup()
        else:
            self._show_ocr_setup()

    def _ocr_setup_drag_start(self, event):
        self._ocr_drag_ox = event.x_root - self.ocr_setup_win.winfo_x()
        self._ocr_drag_oy = event.y_root - self.ocr_setup_win.winfo_y()

    def _ocr_setup_drag_move(self, event):
        nx = event.x_root - self._ocr_drag_ox
        ny = event.y_root - self._ocr_drag_oy
        self.ocr_setup_win.geometry(f"{self.OCR_SETUP_W}x{self.OCR_SETUP_H}+{nx}+{ny}")

    def _ocr_setup_resize_start(self, event):
        self._ocr_resize_ox = event.x_root
        self._ocr_resize_oy = event.y_root
        self._ocr_resize_w0 = self.OCR_SETUP_W
        self._ocr_resize_h0 = self.OCR_SETUP_H

    def _ocr_setup_resize_move(self, event):
        dw = event.x_root - self._ocr_resize_ox
        dh = event.y_root - self._ocr_resize_oy
        self.OCR_SETUP_W = max(40, self._ocr_resize_w0 + dw)
        self.OCR_SETUP_H = max(20, self._ocr_resize_h0 + dh)
        x = self.ocr_setup_win.winfo_x()
        y = self.ocr_setup_win.winfo_y()
        self.ocr_setup_win.geometry(f"{self.OCR_SETUP_W}x{self.OCR_SETUP_H}+{x}+{y}")
        self.ocr_setup_canvas.config(width=self.OCR_SETUP_W, height=self.OCR_SETUP_H)
        self._draw_ocr_setup_border()

    # def _create_ocr_display_window(self):
    #     self.ocr_display_win = tk.Toplevel(self.root)
    #     self.ocr_display_win.title("SACLOS OCR Display")
    #     self.ocr_display_win.overrideredirect(True)
    #     self.ocr_display_win.attributes("-topmost", True)
    #     self.ocr_display_win.configure(bg="#000001")
    #     self.ocr_display_win.attributes("-transparentcolor", "#000001")

    #     self.ocr_display_label = tk.Label(
    #         self.ocr_display_win,
    #         text="--- m",
    #         fg="#00ff00", bg="#111111",
    #         font=("Courier", 14, "bold"),
    #         padx=6, pady=2
    #     )
    #     self.ocr_display_label.pack()

    #     self.ocr_display_label.bind("<ButtonPress-1>", self._ocr_display_drag_start)
    #     self.ocr_display_label.bind("<B1-Motion>", self._ocr_display_drag_move)
    #     self.ocr_display_win.withdraw()

    # def _ocr_display_drag_start(self, event):
    #     self._ocr_disp_ox = event.x_root - self.ocr_display_win.winfo_x()
    #     self._ocr_disp_oy = event.y_root - self.ocr_display_win.winfo_y()

    # def _ocr_display_drag_move(self, event):
    #     nx = event.x_root - self._ocr_disp_ox
    #     ny = event.y_root - self._ocr_disp_oy
    #     self.ocr_display_win.geometry(f"+{nx}+{ny}")

    # def _show_ocr_display_setup(self):
    #     if self.ocr_display_pos:
    #         x, y = self.ocr_display_pos
    #     else:
    #         sw = self.root.winfo_screenwidth()
    #         sh = self.root.winfo_screenheight()
    #         x = sw // 2 + 150
    #         y = sh // 2 + 100

    #     self.ocr_display_label.config(text=f"{int(self.target_range_m)} m", bg="#111111")
    #     self.ocr_display_win.geometry(f"+{x}+{y}")
    #     self.ocr_display_win.deiconify()
    #     self.ocr_display_win.attributes("-topmost", True)
    #     self._set_ocr_display_clickthrough(False)

    # def _hide_ocr_display_setup(self):
    #     x = self.ocr_display_win.winfo_x()
    #     y = self.ocr_display_win.winfo_y()
    #     self.ocr_display_pos = [x, y]
    #     self.ocr_display_win.withdraw()

    # def _show_ocr_display(self):
    #     if self.ocr_display_visible or not self.ocr_display_pos:
    #         return
        
    #     self.ocr_display_visible = True
    #     x, y = self.ocr_display_pos
    #     self.ocr_display_label.config(text=f"{int(self.target_range_m)} m", bg="#111111")
    #     self.ocr_display_win.geometry(f"+{x}+{y}")
    #     self.ocr_display_win.deiconify()
    #     self.ocr_display_win.attributes("-topmost", True)
    #     self._set_ocr_display_clickthrough(True)

    def _hide_ocr_display(self):
        if not getattr(self, "ocr_display_visible", False):
            return
        self.ocr_display_visible = False
        if getattr(self, "ocr_display_win", None):
            self.ocr_display_win.withdraw()

    # def _update_ocr_display(self, range_m):
    #     if self.ocr_display_visible and self.ocr_display_label:
    #         self.ocr_display_label.config(text=f"{int(range_m)} m")

    # def _set_ocr_display_clickthrough(self, enable):
    #     try:
    #         import ctypes
    #         from fuse.utils.window_utils import set_window_clickthrough
    #         if self.ocr_display_hwnd is None:
    #             self.ocr_display_hwnd = ctypes.windll.user32.FindWindowW(None, "SACLOS OCR Display")
    #         if self.ocr_display_hwnd:
    #             set_window_clickthrough(self.ocr_display_hwnd, enable)
    #     except Exception:
    #         pass
