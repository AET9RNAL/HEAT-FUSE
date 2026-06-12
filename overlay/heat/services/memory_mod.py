"""Memory-mod service — user-friendly API for in-game values.

Exposes typed reads/writes via pointer chains so plugins can do::

    mem = ctx.services.require("memory_mod")
    energy = mem.read("energy")
    mem.write("energy", 9999)

Pointer chains are loaded from ``<assets_dir>/pointer_chains.json`` so
users can tweak them without touching code.
"""
from __future__ import annotations

import json
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional

from loguru import logger

from fuse.utils.memory_reader import (
    ProcessHandle,
    find_pid_by_name,
    get_module_base,
    resolve_pointer_chain,
)


@dataclass(frozen=True, slots=True)
class PointerChain:
    """A single pointer chain definition."""

    name: str
    module: str
    offsets: List[int]
    dtype: str = "float"  # float | double | int32 | int64 | uint32 | uint64
    readonly: bool = False


class MemoryModService:
    """High-level memory API for HEAT plugins.

    Lifecycle (managed by the host or a dedicated plugin)::

        svc = MemoryModService(pid_or_name="engine_launcher.exe")
        svc.load_chains(path_to_json)
        svc.open()

        # inside tick()
        energy = svc.read("energy")

        svc.close()
    """

    VALID_DTYPES = {"float", "double", "int32", "int64", "uint32", "uint64"}

    def __init__(
        self,
        *,
        pid: Optional[int] = None,
        process_name: Optional[str] = None,
    ) -> None:
        if pid is None and process_name is None:
            raise ValueError("Provide either pid or process_name")
        self._pid = pid
        self._process_name = process_name
        self._proc: Optional[ProcessHandle] = None
        self._chains: Dict[str, PointerChain] = {}
        self._module_bases: Dict[str, int] = {}
        self._last_refresh = 0.0
        self._refresh_interval = 5.0  # re-cache module bases every 5 s

    # ------------------------------------------------------------------
    # Chain registration / loading
    # ------------------------------------------------------------------

    def register_chain(self, chain: PointerChain) -> None:
        if chain.dtype not in self.VALID_DTYPES:
            raise ValueError(
                f"Invalid dtype {chain.dtype!r} for {chain.name}. "
                f"Valid: {self.VALID_DTYPES}"
            )
        self._chains[chain.name] = chain
        logger.info(f"MemoryMod: registered chain '{chain.name}' -> {chain.module}+{chain.offsets}")

    def register(
        self,
        name: str,
        module: str,
        offsets: List[int],
        dtype: str = "float",
        readonly: bool = False,
    ) -> None:
        """Convenience one-liner."""
        self.register_chain(
            PointerChain(name=name, module=module, offsets=offsets, dtype=dtype, readonly=readonly)
        )

    def load_chains(self, path: Path) -> None:
        """Load chains from JSON::

            {
              "energy": {
                "module": "plugin_hud_battle.dll",
                "offsets": [0x123456, 0x78, 0xC0],
                "dtype": "float",
                "readonly": false
              }
            }
        """
        if not path.exists():
            logger.warning(f"MemoryMod: chain file not found: {path}")
            return
        with open(path, "r", encoding="utf-8") as f:
            data: Dict[str, Any] = json.load(f)
        for key, val in data.items():
            self.register(
                name=key,
                module=val["module"],
                offsets=val["offsets"],
                dtype=val.get("dtype", "float"),
                readonly=val.get("readonly", False),
            )

    def save_chains(self, path: Path) -> None:
        """Persist current chains to JSON."""
        out: Dict[str, Any] = {}
        for name, c in self._chains.items():
            out[name] = {
                "module": c.module,
                "offsets": c.offsets,
                "dtype": c.dtype,
                "readonly": c.readonly,
            }
        with open(path, "w", encoding="utf-8") as f:
            json.dump(out, f, indent=2)

    # ------------------------------------------------------------------
    # Connection lifecycle
    # ------------------------------------------------------------------

    def open(self) -> None:
        if self._proc is not None:
            return
        pid = self._pid or find_pid_by_name(self._process_name)
        if pid is None:
            raise RuntimeError(
                f"Process not found: {self._process_name!r}"
            )
        self._pid = pid
        self._proc = ProcessHandle(pid, write=True)
        self._refresh_module_bases()
        logger.info(f"MemoryMod: attached to PID {pid}")

    def close(self) -> None:
        if self._proc is not None:
            self._proc.__exit__(None, None, None)
            self._proc = None
            self._module_bases.clear()
            logger.info("MemoryMod: detached")

    def is_open(self) -> bool:
        return self._proc is not None

    def _refresh_module_bases(self) -> None:
        now = time.time()
        if now - self._last_refresh < self._refresh_interval:
            return
        if self._proc is None:
            return
        bases = {}
        # Use the internal handle to list modules; ProcessHandle doesn't expose the raw handle,
        # so we call the utility directly with the cached pid.
        from fuse.utils.memory_reader import list_modules
        for mod in list_modules(self._pid):
            bases[mod.name.lower()] = mod.base
        self._module_bases = bases
        self._last_refresh = now

    def _base(self, module: str) -> int:
        self._refresh_module_bases()
        base = self._module_bases.get(module.lower())
        if base is None:
            raise RuntimeError(f"Module not found in target process: {module!r}")
        return base

    # ------------------------------------------------------------------
    # Read / write API
    # ------------------------------------------------------------------

    def read(self, name: str) -> Optional[float]:
        """Return the typed value for *name*, or None if the chain fails."""
        chain = self._chains.get(name)
        if chain is None:
            raise KeyError(f"No pointer chain registered for {name!r}")
        if self._proc is None:
            raise RuntimeError("MemoryMod not open. Call .open() first.")

        base = self._base(chain.module)
        raw = resolve_pointer_chain(
            self._proc, base, chain.offsets, final_read_size=_dtype_size(chain.dtype)
        )
        if raw is None:
            return None
        return _decode(raw, chain.dtype)

    def read_raw(self, name: str) -> Optional[bytes]:
        """Return the raw final-read bytes, or None if chain fails."""
        chain = self._chains[name]
        if self._proc is None:
            raise RuntimeError("MemoryMod not open. Call .open() first.")
        base = self._base(chain.module)
        return resolve_pointer_chain(
            self._proc, base, chain.offsets, final_read_size=_dtype_size(chain.dtype)
        )  # type: ignore[return-value]

    def write(self, name: str, value: float) -> None:
        """Write *value* to the address resolved by *name*.

        Raises if the chain is marked readonly.
        """
        chain = self._chains.get(name)
        if chain is None:
            raise KeyError(f"No pointer chain registered for {name!r}")
        if chain.readonly:
            raise PermissionError(f"Chain {name!r} is readonly")
        if self._proc is None:
            raise RuntimeError("MemoryMod not open. Call .open() first.")

        base = self._base(chain.module)
        addr = resolve_pointer_chain(self._proc, base, chain.offsets)
        if addr is None:
            raise RuntimeError(f"Pointer chain resolution failed for {name!r}")
        raw = _encode(value, chain.dtype)
        self._proc.write(int(addr), raw)
        logger.debug(f"MemoryMod: wrote {name} = {value} ({chain.dtype})")

    def read_at(self, module: str, offsets: List[int], dtype: str = "float") -> Optional[float]:
        """Ad-hoc read without pre-registering a chain."""
        if self._proc is None:
            raise RuntimeError("MemoryMod not open. Call .open() first.")
        base = self._base(module)
        raw = resolve_pointer_chain(
            self._proc, base, offsets, final_read_size=_dtype_size(dtype)
        )
        if raw is None:
            return None
        return _decode(raw, dtype)

    def write_at(self, module: str, offsets: List[int], value: float, dtype: str = "float") -> None:
        """Ad-hoc write without pre-registering a chain."""
        if self._proc is None:
            raise RuntimeError("MemoryMod not open. Call .open() first.")
        base = self._base(module)
        addr = resolve_pointer_chain(self._proc, base, offsets)
        if addr is None:
            raise RuntimeError("Pointer chain resolution failed")
        self._proc.write(int(addr), _encode(value, dtype))

    # ------------------------------------------------------------------
    # Direct address API (for static / AOB-found addresses)
    # ------------------------------------------------------------------

    def read_addr(self, address: int, dtype: str = "float") -> float:
        """Read directly from *address* (already resolved)."""
        if self._proc is None:
            raise RuntimeError("MemoryMod not open. Call .open() first.")
        return _decode(self._proc.read(address, _dtype_size(dtype)), dtype)

    def write_addr(self, address: int, value: float, dtype: str = "float") -> None:
        """Write directly to *address* (already resolved)."""
        if self._proc is None:
            raise RuntimeError("MemoryMod not open. Call .open() first.")
        self._proc.write(address, _encode(value, dtype))


# ---------------------------------------------------------------------------
# Encoding helpers
# ---------------------------------------------------------------------------

def _dtype_size(dtype: str) -> int:
    return {"float": 4, "double": 8, "int32": 4, "uint32": 4, "int64": 8, "uint64": 8}[dtype]


def _decode(raw: bytes, dtype: str) -> float:
    import struct
    if dtype == "float":
        return struct.unpack("<f", raw)[0]
    if dtype == "double":
        return struct.unpack("<d", raw)[0]
    if dtype == "int32":
        return float(struct.unpack("<i", raw)[0])
    if dtype == "uint32":
        return float(struct.unpack("<I", raw)[0])
    if dtype == "int64":
        return float(struct.unpack("<q", raw)[0])
    if dtype == "uint64":
        return float(struct.unpack("<Q", raw)[0])
    raise ValueError(dtype)


def _encode(value: float, dtype: str) -> bytes:
    import struct
    if dtype == "float":
        return struct.pack("<f", float(value))
    if dtype == "double":
        return struct.pack("<d", float(value))
    if dtype == "int32":
        return struct.pack("<i", int(value))
    if dtype == "uint32":
        return struct.pack("<I", int(value))
    if dtype == "int64":
        return struct.pack("<q", int(value))
    if dtype == "uint64":
        return struct.pack("<Q", int(value))
    raise ValueError(dtype)


__all__ = ["MemoryModService", "PointerChain"]
