"""CDP-based in-game value reader for WoT HEAT.

Reads game values from the Coherent Gameface DOM via Chrome DevTools Protocol
(CDP) WebSocket.  Exposes the same field names as GameMemory so consumers can
use either service interchangeably via the service registry.

Supported fields (see _FIELD_MAP):
    multiplayer_vehicle_health   - current HP (int)
    multiplayer_vehicle_energy   - ability mana, rounded (int)
    multiplayer_vehicle_boost    - sprint energy remaining 0–100 (int)
    multiplayer_camera_zoom      - active FP zoom stage index 0-based (int)
    multiplayer_is_fp_view       - 1 = sniper/FP, 0 = arcade (int)

All others return None - DOM has no selectors for ammo, reload, cooldowns, etc.

Requires the Gameface CDP debugger enabled in coldwar.project:
    "Enable Debugger": true
    "Debugger Port": 9222
See docs/COHTML_CDP_DEBUGGER.md for setup instructions.
"""
from __future__ import annotations

import json
import threading
import urllib.request
from pathlib import Path
from typing import Optional, Union

from loguru import logger

try:
    import websocket as _ws_mod
    _WS_AVAILABLE = True
except ImportError:
    _ws_mod = None  # type: ignore[assignment]
    _WS_AVAILABLE = False

_JS_READ_ALL:     str = (Path(__file__).parent / "js" / "read_all.js").read_text(encoding="utf-8")
_JS_READ_MARKERS: str = (Path(__file__).parent / "js" / "read_markers.js").read_text(encoding="utf-8")

# game_memory-compatible field names → (JS result key, Python type).
# Consumers using game_memory can call accessors.read("multiplayer_vehicle_health")
# and get the same semantics.
_FIELD_MAP: dict[str, tuple[str, type]] = {
    "multiplayer_vehicle_health": ("health",   int),
    "multiplayer_vehicle_energy": ("energy",   int),
    "multiplayer_vehicle_boost":  ("boost",    int),
    "multiplayer_camera_zoom":    ("zoom_idx", int),
    "multiplayer_is_fp_view":     ("is_fp",    int),
}

# Extra keys stored in cache under their native names (not in game_memory).
_EXTRA_KEYS = (
    "health_regen", "health_pct",
    "energy_regen",
    "boost_active",
    "zoom_val", "zoom_idx", "num_zooms", "zooms",
    "speed",
    "ab1_state", "ab1_cd", "ab1_charges",
    "ab2_state", "ab2_cd", "ab2_charges",
    "ult_state", "ult_charge_pct",
    "target_dist", "target_dist_vis",
    "xp_action", "xp_action_type",
    "equip1_state", "equip1_cd", "equip1_charges",
    "equip2_state", "equip2_cd", "equip2_charges",
    "trait_state", "trait_cur_time", "trait_time", "trait_type",
    "battle_state", "battle_countdown",
    # from markers page
    "on_fire", "debuff_count", "debuff_tags", "buff_count", "buff_tags",
    "major_effect_count",
    "missile_dist", "missile_in_flight",
)


class Accessors:
    """High-level read-only accessor for in-game values via Coherent Gameface CDP.

    open() is safe to call from a background thread - it acquires _lock before
    writing _ws/_connected.  refresh() and close() also use _lock so that the
    plugin can thread open() without racing the main-thread refresh() calls.
    """

    def __init__(self, port: int = 9222, connect_timeout: float = 8.0, recv_timeout: float = 0.5) -> None:
        self._port            = port
        self._connect_timeout = connect_timeout
        self._recv_timeout    = recv_timeout
        self._lock            = threading.Lock()
        self._ws: object | None         = None
        self._ws_markers: object | None = None
        self._msg_id    = 0
        self._msg_id_m  = 0
        self._connected = False
        self._cache: dict[str, Optional[Union[int, float, list]]] = {}

    # ──────────────────────────────────────────────────── connection

    @property
    def connected(self) -> bool:
        with self._lock:
            return self._connected

    def open(self) -> bool:
        """Discover battle_hud and markers CDP targets and open WebSocket connections.

        Blocks for up to connect_timeout seconds - call from a background thread
        inside the plugin so the FUSE main loop stays responsive.
        markers connection is optional; battle_hud is required.
        """
        if not _WS_AVAILABLE:
            logger.error(
                "Accessors: websocket-client not installed - "
                "run: pip install websocket-client"
            )
            return False

        # 1. Discover targets via HTTP (short timeout - port is either open or not)
        try:
            resp = urllib.request.urlopen(
                f"http://localhost:{self._port}/json",
                timeout=2.0,
            )
            targets = json.loads(resp.read())
        except Exception as exc:
            logger.debug(f"Accessors: CDP not reachable on port {self._port}: {exc}")
            return False

        if not isinstance(targets, list):
            logger.debug("Accessors: CDP /json returned non-list response")
            return False

        # 2. Find battle_hud (required) and markers (optional)
        ws_url: str | None         = None
        ws_url_markers: str | None = None
        for t in targets:
            url = t.get("url", "")
            if t.get("type") == "page":
                if "battle_hud" in url:
                    ws_url = t.get("webSocketDebuggerUrl")
                elif "markers" in url:
                    ws_url_markers = t.get("webSocketDebuggerUrl")

        if ws_url is None:
            logger.debug("Accessors: battle_hud target not in CDP target list (not in battle?)")
            return False

        # 3. WebSocket handshake - may take several seconds during game startup
        def _connect(url: str) -> object | None:
            try:
                ws = _ws_mod.WebSocket()
                ws.settimeout(self._connect_timeout)
                ws.connect(url)
                ws.settimeout(self._recv_timeout)
                return ws
            except Exception as exc:
                logger.debug(f"Accessors: WebSocket connect to {url} failed: {exc}")
                return None

        ws         = _connect(ws_url)
        ws_markers = _connect(ws_url_markers) if ws_url_markers else None

        if ws is None:
            return False

        with self._lock:
            self._ws         = ws
            self._ws_markers = ws_markers
            self._connected  = True
            self._msg_id     = 0
            self._msg_id_m   = 0
        logger.info(
            f"Accessors: connected to CDP battle_hud at {ws_url}"
            + (f" + markers at {ws_url_markers}" if ws_markers else "")
        )
        return True

    def close(self) -> None:
        with self._lock:
            ws, self._ws               = self._ws, None
            wsm, self._ws_markers      = self._ws_markers, None
            self._connected = False
            self._cache.clear()
        for sock in (ws, wsm):
            if sock is not None:
                try:
                    sock.close()  # type: ignore[union-attr]
                except Exception:
                    pass

    def __enter__(self) -> "Accessors":
        self.open()
        return self

    def __exit__(self, *_) -> None:
        self.close()

    # ──────────────────────────────────────────────────── polling

    def refresh(self) -> bool:
        """Send Runtime.evaluate to battle_hud (and markers if connected). Returns True on success."""
        with self._lock:
            if not self._connected or self._ws is None:
                return False
            ws         = self._ws
            ws_markers = self._ws_markers
            msg_id     = self._msg_id + 1
            msg_id_m   = self._msg_id_m + 1
            self._msg_id   = msg_id
            self._msg_id_m = msg_id_m

        def _eval(sock, expr: str, mid: int) -> dict | None:
            try:
                sock.send(json.dumps({
                    "id": mid, "method": "Runtime.evaluate",
                    "params": {"expression": expr, "returnByValue": True},
                }))
                resp = json.loads(sock.recv())
                raw  = resp.get("result", {}).get("result", {}).get("value")
                return json.loads(raw) if raw else None
            except Exception as exc:
                logger.warning(f"Accessors: eval failed - {exc}")
                return None

        data = _eval(ws, _JS_READ_ALL, msg_id)
        if data is None:
            with self._lock:
                self._connected = False
                self._cache.clear()
            return False

        if data.get("_err"):
            logger.warning(f"Accessors: JS error (hud): {data['_err']}")
        self._update_cache(data)

        if ws_markers is not None:
            mdata = _eval(ws_markers, _JS_READ_MARKERS, msg_id_m)
            if mdata is not None:
                if mdata.get("_err"):
                    logger.warning(f"Accessors: JS error (markers): {mdata['_err']}")
                self._update_cache(mdata)

        return True

    def _update_cache(self, data: dict) -> None:
        for field, (key, typ) in _FIELD_MAP.items():
            val = data.get(key)
            self._cache[field] = typ(val) if val is not None else None
        for key in _EXTRA_KEYS:
            val = data.get(key)
            if val is not None:
                self._cache[key] = val

    # ──────────────────────────────────────────────────── read API

    def read(self, name: str) -> Optional[Union[int, float]]:
        """Return the last-cached value for *name*, or None if unavailable.

        Accepts both game_memory-compatible names (e.g. "multiplayer_vehicle_health")
        and native CDP names (e.g. "health_regen", "zoom_val").
        """
        return self._cache.get(name)  # type: ignore[return-value]


__all__ = ["Accessors"]
