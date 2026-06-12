"""Low-level Windows process memory I/O — no external dependencies.

Uses ctypes + kernel32.  Works on x64 target processes.
"""
from __future__ import annotations

import ctypes
import ctypes.wintypes as wt
from dataclasses import dataclass
from typing import List, Optional, Sequence

from loguru import logger

_kernel32 = ctypes.windll.kernel32

_PROCESS_QUERY_INFORMATION = 0x0400
_PROCESS_VM_READ = 0x0010
_PROCESS_VM_WRITE = 0x0020
_PROCESS_VM_OPERATION = 0x0008

_TH32CS_SNAPPROCESS = 0x00000002
_TH32CS_SNAPMODULE = 0x00000008

_INFINITE = 0xFFFFFFFF


class _PROCESSENTRY32(ctypes.Structure):
    _fields_ = [
        ("dwSize", wt.DWORD),
        ("cntUsage", wt.DWORD),
        ("th32ProcessID", wt.DWORD),
        ("th32DefaultHeapID", ctypes.c_size_t),
        ("th32ModuleID", wt.DWORD),
        ("cntThreads", wt.DWORD),
        ("th32ParentProcessID", wt.DWORD),
        ("pcPriClassBase", wt.LONG),
        ("dwFlags", wt.DWORD),
        ("szExeFile", wt.CHAR * 260),
    ]


class _MODULEENTRY32(ctypes.Structure):
    _fields_ = [
        ("dwSize", wt.DWORD),
        ("th32ModuleID", wt.DWORD),
        ("th32ProcessID", wt.DWORD),
        ("GlblcntUsage", wt.DWORD),
        ("ProccntUsage", wt.DWORD),
        ("modBaseAddr", ctypes.c_void_p),
        ("modBaseSize", wt.DWORD),
        ("hModule", wt.HMODULE),
        ("szModule", wt.CHAR * 256),
        ("szExePath", wt.CHAR * 260),
    ]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _err_check(result, _func, _args) -> int:
    if not result:
        raise ctypes.WinError(ctypes.get_last_error())
    return result


def list_processes() -> List[tuple]:
    """Return [(pid, exe_name), ...] for all running processes."""
    h = _kernel32.CreateToolhelp32Snapshot(_TH32CS_SNAPPROCESS, 0)
    if h == -1:
        raise ctypes.WinError(ctypes.get_last_error())
    try:
        pe = _PROCESSENTRY32()
        pe.dwSize = ctypes.sizeof(pe)
        if not _kernel32.Process32First(h, ctypes.byref(pe)):
            raise ctypes.WinError(ctypes.get_last_error())
        out = []
        while True:
            out.append((pe.th32ProcessID, pe.szExeFile.decode("mbcs", "ignore")))
            if not _kernel32.Process32Next(h, ctypes.byref(pe)):
                break
        return out
    finally:
        _kernel32.CloseHandle(h)


def find_pid_by_name(name: str) -> Optional[int]:
    """Return the first PID whose exe name contains *name* (case-insensitive)."""
    name_lower = name.lower()
    for pid, exe in list_processes():
        if name_lower in exe.lower():
            return pid
    return None


# ---------------------------------------------------------------------------
# Module info
# ---------------------------------------------------------------------------

@dataclass(frozen=True, slots=True)
class ModuleInfo:
    name: str
    base: int
    size: int
    path: str


def list_modules(pid: int) -> List[ModuleInfo]:
    """Enumerate loaded modules in *pid*."""
    h = _kernel32.CreateToolhelp32Snapshot(_TH32CS_SNAPMODULE, pid)
    if h == -1:
        raise ctypes.WinError(ctypes.get_last_error())
    try:
        me = _MODULEENTRY32()
        me.dwSize = ctypes.sizeof(me)
        if not _kernel32.Module32First(h, ctypes.byref(me)):
            raise ctypes.WinError(ctypes.get_last_error())
        out = []
        while True:
            out.append(
                ModuleInfo(
                    name=me.szModule.decode("mbcs", "ignore"),
                    base=me.modBaseAddr,
                    size=me.modBaseSize,
                    path=me.szExePath.decode("mbcs", "ignore"),
                )
            )
            if not _kernel32.Module32Next(h, ctypes.byref(me)):
                break
        return out
    finally:
        _kernel32.CloseHandle(h)


def get_module_base(pid: int, module_name: str) -> Optional[int]:
    """Return the base address of *module_name* in *pid*, or None."""
    needle = module_name.lower()
    for m in list_modules(pid):
        if m.name.lower() == needle:
            return m.base
    return None


# ---------------------------------------------------------------------------
# Process handle
# ---------------------------------------------------------------------------

class ProcessHandle:
    """Context-manager wrapper around an OpenProcess handle."""

    def __init__(self, pid: int, write: bool = False):
        self.pid = pid
        access = _PROCESS_QUERY_INFORMATION | _PROCESS_VM_READ
        if write:
            access |= _PROCESS_VM_WRITE | _PROCESS_VM_OPERATION
        self._h = _kernel32.OpenProcess(access, False, pid)
        if not self._h:
            raise ctypes.WinError(ctypes.get_last_error())

    def __enter__(self) -> ProcessHandle:
        return self

    def __exit__(self, *_):
        _kernel32.CloseHandle(self._h)
        self._h = None

    # ---- read ------------------------------------------------------------

    def read(self, addr: int, size: int) -> bytes:
        buf = ctypes.create_string_buffer(size)
        read = ctypes.c_size_t(0)
        ok = _kernel32.ReadProcessMemory(
            self._h, ctypes.c_void_p(addr), buf, size, ctypes.byref(read)
        )
        if not ok:
            raise ctypes.WinError(ctypes.get_last_error())
        return buf.raw[: read.value]

    def read_int8(self, addr: int) -> int:
        return int.from_bytes(self.read(addr, 1), "little", signed=True)

    def read_uint8(self, addr: int) -> int:
        return int.from_bytes(self.read(addr, 1), "little", signed=False)

    def read_int16(self, addr: int) -> int:
        return int.from_bytes(self.read(addr, 2), "little", signed=True)

    def read_uint16(self, addr: int) -> int:
        return int.from_bytes(self.read(addr, 2), "little", signed=False)

    def read_int32(self, addr: int) -> int:
        return int.from_bytes(self.read(addr, 4), "little", signed=True)

    def read_uint32(self, addr: int) -> int:
        return int.from_bytes(self.read(addr, 4), "little", signed=False)

    def read_int64(self, addr: int) -> int:
        return int.from_bytes(self.read(addr, 8), "little", signed=True)

    def read_uint64(self, addr: int) -> int:
        return int.from_bytes(self.read(addr, 8), "little", signed=False)

    def read_float(self, addr: int) -> float:
        import struct
        return struct.unpack("<f", self.read(addr, 4))[0]

    def read_double(self, addr: int) -> float:
        import struct
        return struct.unpack("<d", self.read(addr, 8))[0]

    def read_pointer(self, addr: int) -> int:
        """Read a pointer-sized integer (8 bytes on x64)."""
        return self.read_uint64(addr)

    # ---- write -----------------------------------------------------------

    def write(self, addr: int, data: bytes) -> None:
        written = ctypes.c_size_t(0)
        ok = _kernel32.WriteProcessMemory(
            self._h, ctypes.c_void_p(addr), data, len(data), ctypes.byref(written)
        )
        if not ok:
            raise ctypes.WinError(ctypes.get_last_error())

    def write_int32(self, addr: int, value: int) -> None:
        self.write(addr, value.to_bytes(4, "little", signed=True))

    def write_int64(self, addr: int, value: int) -> None:
        self.write(addr, value.to_bytes(8, "little", signed=True))

    def write_float(self, addr: int, value: float) -> None:
        import struct
        self.write(addr, struct.pack("<f", value))


# ---------------------------------------------------------------------------
# Pointer chain resolution
# ---------------------------------------------------------------------------

def resolve_pointer_chain(
    proc: ProcessHandle,
    base: int,
    offsets: Sequence[int],
    *,
    final_read_size: int = 0,
) -> Optional[int]:
    """Follow a pointer chain: base -> [base] + offset1 -> ... -> final_addr.

    If *final_read_size* is 0, returns the final **address**.
    If > 0, reads *final_read_size* bytes from that address and returns
    the raw bytes.

    Returns None if any dereference yields 0 (null pointer).
    """
    addr = base
    for off in offsets[:-1]:
        addr = proc.read_pointer(addr + off)
        if addr == 0:
            return None
    final = addr + offsets[-1]
    if final_read_size:
        return proc.read(final, final_read_size)  # type: ignore[return-value]
    return final


__all__ = [
    "ProcessHandle",
    "ModuleInfo",
    "list_processes",
    "find_pid_by_name",
    "list_modules",
    "get_module_base",
    "resolve_pointer_chain",
]