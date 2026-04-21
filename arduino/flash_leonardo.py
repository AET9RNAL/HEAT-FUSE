"""
Auto-flash Arduino Leonardo/Pro Micro during bootloader window.

Usage:
    1. Arduino IDE → Sketch → Export Compiled Binary  (saves .hex to sketch folder)
    2. Run this script
    3. Short RST to GND on the board

Script watches for any new COM port to appear and immediately runs avrdude.
"""

import glob
import os
import subprocess
import sys
import time

import serial.tools.list_ports

AVRDUDE = r"C:\Users\maksg\AppData\Local\Arduino15\packages\arduino\tools\avrdude\8.0.0-arduino1\bin\avrdude.exe"
AVRDUDE_CONF = r"C:\Users\maksg\AppData\Local\Arduino15\packages\arduino\tools\avrdude\8.0.0-arduino1\etc\avrdude.conf"
HEX_FILE = os.path.join(os.path.dirname(__file__), "mouse_hid", "mouse_hid.ino.leonardo.hex")

# Fallback: find any .hex in the sketch folder
if not os.path.exists(HEX_FILE):
    candidates = glob.glob(os.path.join(os.path.dirname(__file__), "mouse_hid", "*.hex"))
    if candidates:
        HEX_FILE = candidates[0]
    else:
        print("ERROR: No .hex file found. Do: Arduino IDE → Sketch → Export Compiled Binary")
        sys.exit(1)

print(f"HEX: {HEX_FILE}")
print("Watching for new COM port... Reset the board NOW (short RST to GND)")

def get_ports():
    return {p.device for p in serial.tools.list_ports.comports()}

baseline = get_ports()
print(f"Existing ports: {baseline or 'none'}")

deadline = time.time() + 30  # wait up to 30 seconds
new_port = None
while time.time() < deadline:
    current = get_ports()
    added = current - baseline
    if added:
        new_port = sorted(added)[0]
        print(f"New port detected: {new_port} — flashing immediately...")
        break
    time.sleep(0.05)  # poll every 50ms

if new_port is None:
    print("Timed out waiting for board. Try again.")
    sys.exit(1)

cmd = [
    AVRDUDE,
    "-C", AVRDUDE_CONF,
    "-v",
    "-p", "atmega32u4",
    "-c", "avr109",
    "-P", new_port,
    "-b", "57600",
    "-D",
    "-U", f"flash:w:{HEX_FILE}:i"
]

print(f"Running: {' '.join(cmd)}")
result = subprocess.run(cmd, capture_output=False)
if result.returncode == 0:
    print("\nFlash successful!")
else:
    print(f"\nFlash FAILED (exit {result.returncode})")
    sys.exit(result.returncode)
