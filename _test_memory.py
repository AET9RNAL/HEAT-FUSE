"""Test script for the new memory reader + mod API.

Run this while the game is running to verify attachment and scan
for the energy instruction you found in CE.
"""
from utils.memory_reader import find_pid_by_name, list_modules, ProcessHandle
from overlay.heat.services.memory_mod import MemoryModService

PROCESS_NAME = "engine_launcher.exe"


def demo_attach():
    pid = find_pid_by_name(PROCESS_NAME)
    if pid is None:
        print(f"[!] Process '{PROCESS_NAME}' not found. Is the game running?")
        return
    print(f"[*] Found PID {pid}")

    print("\n[*] Modules (first 20):")
    for m in list_modules(pid)[:20]:
        print(f"    {m.name:30s} base=0x{m.base:016X} size=0x{m.size:08X}")

    # look for plugin_hud_battle.dll
    hud = [m for m in list_modules(pid) if "hud_battle" in m.name.lower()]
    if hud:
        print(f"\n[+] plugin_hud_battle.dll found: base=0x{hud[0].base:016X}")
        with ProcessHandle(pid) as proc:
            # read a few bytes at the known CE offset to verify
            addr = hud[0].base + 0x666199
            raw = proc.read(addr, 16)
            print(f"    Bytes at base+0x666199: {raw.hex()}")
    else:
        print("\n[!] plugin_hud_battle.dll not found in module list")


def demo_mod_service():
    svc = MemoryModService(process_name=PROCESS_NAME)
    try:
        svc.open()
        print(f"[*] MemoryMod attached to PID {svc._pid}")

        # Example: ad-hoc read (you need a real pointer chain for this to work)
        # val = svc.read_at("plugin_hud_battle.dll", [0x0, 0x0], "float")
        # print(f"    energy = {val}")

    except Exception as e:
        print(f"[!] {e}")
    finally:
        svc.close()


def scan_for_energy_value():
    """Scan the whole process memory for a specific float value.
    This is slow — use it only to confirm the energy value is readable."""
    import struct

    pid = find_pid_by_name(PROCESS_NAME)
    if pid is None:
        print(f"[!] Process not found")
        return

    # Change this to whatever your current energy % is (e.g. 43.0)
    target_value = 43.0
    target_bytes = struct.pack("<f", target_value)

    print(f"[*] Scanning PID {pid} for float {target_value} ...")
    with ProcessHandle(pid) as proc:
        # Quick scan of a known heap region — you'd normally scan all regions
        # For demo, just read a chunk around the address you found earlier
        addr = 0x229FE3708B0  # <-- the dynamic address from your CE screenshot
        try:
            raw = proc.read(addr, 4)
            val = struct.unpack("<f", raw)[0]
            print(f"[+] Read 0x{addr:016X} -> float {val}")
        except Exception as e:
            print(f"[!] Read failed: {e}")


if __name__ == "__main__":
    demo_attach()
    print()
    demo_mod_service()
    print()
    scan_for_energy_value()
