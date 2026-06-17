import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from fuse.utils.game_memory import GameMemory

PROCESS     = "engine_launcher.exe"
CHAINS_FILE = Path(__file__).resolve().parent / "assets" / "pointer_chains.json"
WATCH       = ["multiplayer_camera_zoom", "multiplayer_is_fp_view"]

def main():
    print(f"Connecting to {PROCESS!r}...")
    with GameMemory(PROCESS, CHAINS_FILE) as mem:
        if not mem.connected:
            print("Process not found. Is the game running?")
            return

        print(f"Connected.\n")
        try:
            while True:
                row = "  ".join(
                    f"{name}: {mem.read(name) if mem.connected else 'disconnected'}"
                    for name in WATCH
                )
                print(f"\r{row}    ", end="", flush=True)
                time.sleep(1.0)
        except KeyboardInterrupt:
            print("\nStopped.")

if __name__ == "__main__":
    main()
