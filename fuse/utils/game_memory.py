"""Typed in-game memory reader built on pointer chains.

Loads chain definitions from a JSON file and exposes a clean read API:

    mem = GameMemory("engine_launcher.exe", "assets/pointer_chains.json")
    mem.open()
    energy = mem.read("energy")    # → 100 (uint32)
    mem.close()

    # or as a context manager:
    with GameMemory("engine_launcher.exe", "assets/pointer_chains.json") as mem:
        print(mem.read("energy"))

All reads are thread-safe.  On ``OSError`` the method returns ``None`` and
marks the connection as broken only if the process is no longer alive
(prevents reconnect-loops caused by bad chains resolving to unmapped memory).
"""
from __future__ import annotations

import json
import struct
import threading
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Union

from loguru import logger

from fuse.utils.memory_reader import (
    ProcessHandle,
    find_pid_by_name,
    get_module_base,
    resolve_pointer_chain,
)
from fuse.utils.paths import resolve_data


_MISSING = object()  # sentinel for absent cache entries

# ---------------------------------------------------------------------------
# dtype tables
# ---------------------------------------------------------------------------

_DTYPE_SIZE: Dict[str, int] = {
    "uint8": 1,  "int8": 1,
    "uint16": 2, "int16": 2,
    "uint32": 4, "int32": 4,
    "uint64": 8, "int64": 8,
    "float": 4,  "double": 8,
}


def _parse_offset(value: object) -> int:
    """Accept ints or strings like ``"0x208"`` / ``"520"``."""
    if isinstance(value, bool):  # bool is subclass of int — reject explicitly
        raise ValueError(f"bool is not a valid offset: {value!r}")
    if isinstance(value, int):
        return value
    if isinstance(value, str):
        return int(value, 0)
    raise ValueError(f"bad offset type {type(value).__name__}: {value!r}")


def _decode(dtype: str, raw: bytes) -> Union[int, float]:
    if dtype == "float":
        return struct.unpack("<f", raw)[0]
    if dtype == "double":
        return struct.unpack("<d", raw)[0]
    signed = dtype.startswith("int")
    return int.from_bytes(raw, "little", signed=signed)


# ---------------------------------------------------------------------------
# ChainDef
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class ChainDef:
    name: str
    module: str
    offsets: List[int]
    dtype: str = "uint32"


# ---------------------------------------------------------------------------
# GameMemory
# ---------------------------------------------------------------------------

class GameMemory:
    """High-level read-only memory accessor for a running game process."""

    def __init__(
        self,
        process_name: str,
        chains: Union[str, Path, dict],
    ) -> None:
        self._process_name = process_name
        self._lock = threading.Lock()
        self._proc: Optional[ProcessHandle] = None
        self._pid: Optional[int] = None
        self._module_bases: Dict[str, Optional[int]] = {}
        self._chains: Dict[str, ChainDef] = {}
        self._connected = False

        if isinstance(chains, dict):
            self._load_chains_dict(chains)
        else:
            self.load_chains(chains)

    # ------------------------------------------------------------------ load

    def load_chains(self, path: Union[str, Path]) -> None:
        """Load / reload chain definitions from a JSON file."""
        resolved = resolve_data(str(path))
        with open(resolved, "r") as f:
            data = json.load(f)
        self._load_chains_dict(data)
        logger.debug(f"GameMemory: loaded {len(self._chains)} chains from {resolved}")

    def _load_chains_dict(self, data: dict) -> None:
        chains: Dict[str, ChainDef] = {}
        for key, val in data.items():
            if key.startswith("_"):
                continue
            try:
                dtype = val.get("dtype", "uint32")
                if dtype not in _DTYPE_SIZE:
                    raise ValueError(f"unknown dtype {dtype!r}")
                chains[key] = ChainDef(
                    name=key,
                    module=val["module"],
                    offsets=[_parse_offset(o) for o in val["offsets"]],
                    dtype=dtype,
                )
            except (KeyError, ValueError) as e:
                logger.warning(f"GameMemory: skipping bad chain {key!r}: {e}")
        self._chains = chains

    # --------------------------------------------------------------- connect

    def open(self) -> bool:
        """Find the process and open a read handle.  Returns True if connected."""
        with self._lock:
            self._close_unlocked()
            pid = find_pid_by_name(self._process_name)
            if pid is None:
                logger.debug(f"GameMemory: process '{self._process_name}' not found")
                return False
            try:
                proc = ProcessHandle(pid, write=False)
            except OSError as e:
                logger.warning(f"GameMemory: OpenProcess failed: {e}")
                return False
            self._pid = pid
            self._proc = proc
            self._module_bases = {}
            self._connected = True
            logger.info(
                f"GameMemory: connected to '{self._process_name}' (PID {pid})"
            )
            return True

    def close(self) -> None:
        with self._lock:
            self._close_unlocked()

    def _close_unlocked(self) -> None:
        if self._proc is not None:
            try:
                self._proc.__exit__(None, None, None)
            except Exception:
                pass
        self._proc = None
        self._pid = None
        self._module_bases = {}
        self._connected = False

    @property
    def connected(self) -> bool:
        return self._connected

    def __enter__(self) -> "GameMemory":
        self.open()
        return self

    def __exit__(self, *_) -> None:
        self.close()

    # ----------------------------------------------------------------- query

    def chain_names(self) -> List[str]:
        """Return all loaded chain names."""
        return list(self._chains.keys())

    def chain_def(self, name: str) -> Optional[ChainDef]:
        return self._chains.get(name)

    # ------------------------------------------------------------------ read

    def _get_module_base(self, module: str) -> Optional[int]:
        # Only serve from cache when we have a valid (non-None) entry.
        cached = self._module_bases.get(module, _MISSING)
        if cached is not _MISSING and cached is not None:
            return cached
        base = get_module_base(self._pid, module)
        if base is not None:
            self._module_bases[module] = base
        else:
            # Don't cache None — module may reappear on next read (e.g. reloading between matches).
            logger.debug(f"GameMemory: module '{module}' not found in process (will retry)")
        return base

    def read(self, name: str) -> Optional[Union[int, float]]:
        """Read the value for chain *name*.  Returns ``None`` on any failure."""
        with self._lock:
            if not self._connected:
                return None
            chain = self._chains.get(name)
            if chain is None:
                logger.warning(f"GameMemory: unknown chain {name!r}")
                return None
            try:
                base = self._get_module_base(chain.module)
                if base is None:
                    return None
                addr = resolve_pointer_chain(self._proc, base, chain.offsets)
                if addr is None:
                    return None
                size = _DTYPE_SIZE[chain.dtype]
                raw = self._proc.read(addr, size)
                return _decode(chain.dtype, raw)
            except OSError as e:
                if find_pid_by_name(self._process_name) is None:
                    logger.warning("GameMemory: process gone, marking disconnected")
                    self._connected = False
                else:
                    # Chain error with live process = stale module base (DLL reloaded
                    # between matches at a new address). Clear cache so next read
                    # re-resolves the module base from scratch.
                    logger.debug(f"GameMemory: read({name!r}) chain error: {e} — clearing module base cache")
                    self._module_bases.clear()
                return None

    def resolve_address(self, name: str) -> Optional[int]:
        """Resolve chain *name* to its final address without reading the value."""
        with self._lock:
            if not self._connected:
                return None
            chain = self._chains.get(name)
            if chain is None:
                return None
            try:
                base = self._get_module_base(chain.module)
                if base is None:
                    return None
                return resolve_pointer_chain(self._proc, base, chain.offsets)
            except OSError:
                self._connected = False
                return None


__all__ = ["GameMemory", "ChainDef"]