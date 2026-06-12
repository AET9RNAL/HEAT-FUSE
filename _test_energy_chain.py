"""Standalone test for the CE energy pointer chain.

Uses only stdlib + ctypes — no loguru / overlay imports needed.
Run while the game is running.
"""
from __future__ import annotations

import struct
from utils.memory_reader import find_pid_by_name, get_module_base, ProcessHandle, resolve_pointer_chain

PROCESS_NAME = "engine_launcher.exe"
ENERGY_CHAIN = {
    "module": "cohtml.WindowsDesktop.dll",
    "offsets": [6607384, 16, 72, 128, 8, 200, 16, 1984],  # 0x64D218, 0x10, 0x48, 0x80, 0x8, 0xC8, 0x10, 0x7C0
}


def safe_read_pointer(proc, addr):
    """Read 8 bytes, return (value, ok)."""
    try:
        raw = proc.read(addr, 8)
        return int.from_bytes(raw, "little", signed=False), True
    except OSError as e:
        return None, False


def main():
    pid = find_pid_by_name(PROCESS_NAME)
    if pid is None:
        print(f"[!] '{PROCESS_NAME}' not found. Is the game running?")
        return

    print(f"[*] Found PID {pid}")

    with ProcessHandle(pid) as proc:
        base = get_module_base(pid, ENERGY_CHAIN["module"])
        if base is None:
            print(f"[!] Module '{ENERGY_CHAIN['module']}' not loaded.")
            print("[*] Loaded modules (relevant):")
            from utils.memory_reader import list_modules
            for m in list_modules(pid):
                if "cohtml" in m.name.lower() or "engine" in m.name.lower():
                    print(f"    {m.name}")
            return

        print(f"[*] {ENERGY_CHAIN['module']} base = 0x{base:016X}")
        print(f"[*] Offsets: {[hex(o) for o in ENERGY_CHAIN['offsets']]}")
        print()

        # step through chain manually to see where it breaks
        addr = base
        offsets = ENERGY_CHAIN["offsets"]
        for i, off in enumerate(offsets):
            read_addr = addr + off
            print(f"  Step {i}: addr=0x{addr:016X} + off={hex(off)} -> read @ 0x{read_addr:016X}", end="")

            if i == len(offsets) - 1:
                # last offset: this is the final address, try multiple types
                try:
                    raw4 = proc.read(read_addr, 4)
                    raw8 = proc.read(read_addr, 8)
                    flt = struct.unpack("<f", raw4)[0]
                    uint = struct.unpack("<I", raw4)[0]
                    sint = struct.unpack("<i", raw4)[0]
                    dbl = struct.unpack("<d", raw8)[0]
                    print(f"\n  => FINAL address: 0x{read_addr:016X}")
                    print(f"      As uint32:  {uint}")
                    print(f"      As int32:   {sint}")
                    print(f"      As float:   {flt}")
                    print(f"      As double:  {dbl}")
                    print(f"      Raw bytes:  {raw4.hex()}")
                except OSError as e:
                    print(f"  => FAIL: {e}")
                break

            ptr, ok = safe_read_pointer(proc, read_addr)
            if not ok:
                print(f"  => FAIL: read_pointer failed (address unmapped?)")
                print(f"\n[!] Chain broken at step {i}. The previous pointer (0x{addr:016X}) + {hex(off)} points to unreadable memory.")
                return
            addr = ptr
            print(f"  => next = 0x{addr:016X}")

        print()
        print("[+] If the final float value printed above matches your energy, the chain works.")


if __name__ == "__main__":
    main()
