import threading
import time
import re

try:
    from PIL import Image, ImageGrab
    PIL_OK = True
except ImportError:
    PIL_OK = False

try:
    import pytesseract
    try:
        pytesseract.get_tesseract_version()
        TESSERACT_OK = True
    except Exception:
        # Fallback for Windows if PATH hasn't updated yet or user skipped adding it
        import os
        common_paths = [
            r"C:\Program Files\Tesseract-OCR\tesseract.exe",
            r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
            os.path.expanduser(r"~\AppData\Local\Programs\Tesseract-OCR\tesseract.exe")
        ]
        TESSERACT_OK = False
        for p in common_paths:
            if os.path.exists(p):
                pytesseract.pytesseract.tesseract_cmd = p
                try:
                    pytesseract.get_tesseract_version()
                    TESSERACT_OK = True
                    break
                except Exception:
                    pass
except Exception:
    TESSERACT_OK = False

def ocr_capture_range(ocr_region):
    """Capture screen region and OCR the range value. Returns float or None.
    Runs in background thread -- no Tkinter calls.
    """
    if not ocr_region or not PIL_OK or not TESSERACT_OK:
        return None

    try:
        img = ImageGrab.grab(bbox=tuple(ocr_region))

        # The user explicitly mandated the target color is #84ffb1 (R=132, G=255, B=177)
        img_rgb = img.convert('RGB')
        pixels = img_rgb.getdata()
        
        # Threshold distance = 70 (squared = 4900)
        # Gives a precise 3D spherical color tolerance that cleanly isolates the HUD from bright skies
        threshold_sq = 4900
        
        new_pixels = []
        for r, g, b in pixels:
            dist_sq = (r - 132)**2 + (g - 255)**2 + (b - 177)**2
            # Tesseract wants black text (0) on white background (255)
            if dist_sq < threshold_sq:
                new_pixels.append(0)
            else:
                new_pixels.append(255)
                
        mask = Image.new('L', img.size)
        mask.putdata(new_pixels)

        # Scale up 3x for better OCR accuracy on small text
        w, h = mask.size
        mask = mask.resize((w * 3, h * 3), Image.NEAREST)

        text = pytesseract.image_to_string(
            mask,
            config='--psm 7 --oem 3 -c tessedit_char_whitelist=0123456789m '
        )

        match = re.search(r'(\d+)', text.strip())
        
        # Debug logging toggle off for production usually, but keeping it
        # mask.save("debug_ocr_mask.png")
        
        if match:
            val = float(match.group(1))
            if 50 <= val <= 5000:
                return val

        return None
    except Exception as e:
        print(f"OCR Exception: {e}")
        return None
