"""Quick rangefinder smoke test using canonical fuse.utils.game_memory."""
import time

from fuse.utils.game_memory import GameMemory

with GameMemory("engine_launcher.exe", "assets/pointer_chains.json") as mem:
    if not mem.connected:
        raise SystemExit("[!] Failed to attach to engine_launcher.exe")
    print("[*] Reading rangefinder every 250ms. Ctrl+C to stop.")
    try:
        while True:
            print(f"    rangefinder = {mem.read('rangefinder')} m")
            time.sleep(0.25)
    except KeyboardInterrupt:
        pass
