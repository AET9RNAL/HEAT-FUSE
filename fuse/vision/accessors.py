"""CDP-based in-game value reader for WoT HEAT.

Reads game values from the Coherent Gameface DOM via Chrome DevTools Protocol
(CDP) WebSocket.  Exposes the same field names as GameMemory so consumers can
use either service interchangeably via the service registry.

Supported fields (see _FIELD_MAP):
    multiplayer_vehicle_health   — current HP (int)
    multiplayer_vehicle_energy   — ability mana, rounded (int)
    multiplayer_vehicle_boost    — sprint energy remaining 0–100 (int)
    multiplayer_camera_zoom      — active FP zoom stage index 0-based (int)
    multiplayer_is_fp_view       — 1 = sniper/FP, 0 = arcade (int)

All others return None — DOM has no selectors for ammo, reload, cooldowns, etc.

Requires the Gameface CDP debugger enabled in coldwar.project:
    "Enable Debugger": true
    "Debugger Port": 9222
See docs/COHTML_CDP_DEBUGGER.md for setup instructions.
"""
from __future__ import annotations

import json
import threading
import urllib.request
from typing import Optional, Union

from loguru import logger

try:
    import websocket as _ws_mod
    _WS_AVAILABLE = True
except ImportError:
    _ws_mod = None  # type: ignore[assignment]
    _WS_AVAILABLE = False

# Single JS expression that reads all available DOM values in one round-trip.
_JS_READ_ALL = r"""
(function() {
  var r = {};
  try {
    // ── HP ──────────────────────────────────────────────────────────────────
    var hpEl = document.querySelector('[class*="HpBar_base"]');
    if (hpEl) {
      var m = hpEl.textContent.match(/^(\d+)([+\-])(\d+)/);
      if (m) {
        r.health = parseInt(m[1]);
        r.health_regen = parseInt(m[3]) * (m[2] === '+' ? 1 : -1);
      }
      var prog = document.querySelector('[class*="HpBar"] [class*="ProgressBar_progress"]');
      if (prog) {
        var pm = prog.style.transform.match(/translateX\((-?[\d.]+)%\)/);
        if (pm) r.health_pct = parseFloat(pm[1]);
      }
    }
    // ── Mana / Ability Energy ───────────────────────────────────────────────
    var manaEl = document.querySelector('[class*="ManaBar_base"]');
    if (manaEl) {
      var mm = manaEl.textContent.match(/^(\d+(?:\.\d+)?)([+\-])(\d+(?:\.\d+)?)/);
      if (mm) {
        r.energy = Math.round(parseFloat(mm[1]));
        r.energy_regen = parseFloat(mm[3]) * (mm[2] === '+' ? 1 : -1);
      }
    }
    // ── Sprint / Boost ──────────────────────────────────────────────────────
    var spEl = document.querySelector('[class*="SprintDrain_drainProgress"]');
    if (spEl) {
      var sm = spEl.style.transform.match(/translateX\((-?[\d.]+)%\)/);
      if (sm) {
        // translateX(0%) = full, translateX(-100%) = empty.
        // 100 + raw gives energy-remaining in [0, 100].
        var raw = parseFloat(sm[1]);
        r.boost = Math.round(Math.max(0, Math.min(100, 100 + raw)));
      }
    }
    var glowEl = document.querySelector('[class*="SprintDrain_glow"]');
    if (glowEl) {
      r.boost_active = (glowEl.style.visibility !== 'hidden') ? 1 : 0;
    }
    // ── Zoom / First-Person ─────────────────────────────────────────────────
    var widget = document.querySelector('zoom-indicator-widget');
    if (widget) {
      var base = widget.querySelector('[class*="ZoomIndicator_base"]');
      if (base) {
        r.is_fp = window.getComputedStyle(base).visibility !== 'hidden' ? 1 : 0;
        var wrappers = base.querySelectorAll('[class*="valueWrapper"]');
        var zooms = [];
        var zoomIdx = 0;
        for (var i = 0; i < wrappers.length; i++) {
          var valEl = wrappers[i].querySelector('[class*="ZoomIndicator_value"]');
          if (valEl) {
            var zm = valEl.textContent.match(/([\d.]+)x/);
            if (zm) zooms.push(parseFloat(zm[1]));
          }
          // "active" class detection is unreliable (see docs/COHTML_CDP_DEBUGGER.md
          // §Limitations #5) but still the best available DOM signal.
          if (wrappers[i].className.indexOf('active') !== -1) zoomIdx = i;
        }
        r.zooms     = zooms;
        r.num_zooms = zooms.length;
        r.zoom_idx  = zoomIdx;
        r.zoom_val  = zooms[zoomIdx] || 0;
      }
    }
  } catch(e) {
    r._err = e.message;
  }
  return JSON.stringify(r);
})()
"""

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
)


class Accessors:
    """High-level read-only accessor for in-game values via Coherent Gameface CDP.

    open() is safe to call from a background thread — it acquires _lock before
    writing _ws/_connected.  refresh() and close() also use _lock so that the
    plugin can thread open() without racing the main-thread refresh() calls.
    """

    def __init__(self, port: int = 9222, connect_timeout: float = 8.0, recv_timeout: float = 0.5) -> None:
        self._port            = port
        self._connect_timeout = connect_timeout
        self._recv_timeout    = recv_timeout
        self._lock            = threading.Lock()
        self._ws: object | None = None
        self._msg_id  = 0
        self._connected = False
        self._cache: dict[str, Optional[Union[int, float, list]]] = {}

    # ──────────────────────────────────────────────────── connection

    @property
    def connected(self) -> bool:
        with self._lock:
            return self._connected

    def open(self) -> bool:
        """Discover the battle_hud CDP target and open a WebSocket connection.

        Blocks for up to connect_timeout seconds — call from a background thread
        inside the plugin so the FUSE main loop stays responsive.
        """
        if not _WS_AVAILABLE:
            logger.error(
                "Accessors: websocket-client not installed — "
                "run: pip install websocket-client"
            )
            return False

        # 1. Discover targets via HTTP (short timeout — port is either open or not)
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

        # 2. Find the battle_hud page
        ws_url: str | None = None
        for t in targets:
            if t.get("type") == "page" and "battle_hud" in t.get("url", ""):
                ws_url = t.get("webSocketDebuggerUrl")
                break

        if ws_url is None:
            logger.debug("Accessors: battle_hud target not in CDP target list (not in battle?)")
            return False

        # 3. WebSocket handshake — may take several seconds during game startup
        try:
            ws = _ws_mod.WebSocket()
            ws.settimeout(self._connect_timeout)
            ws.connect(ws_url)
            ws.settimeout(self._recv_timeout)
        except Exception as exc:
            logger.debug(f"Accessors: WebSocket connect failed: {exc}")
            return False

        with self._lock:
            self._ws        = ws
            self._connected = True
            self._msg_id    = 0
        logger.info(f"Accessors: connected to CDP battle_hud at {ws_url}")
        return True

    def close(self) -> None:
        with self._lock:
            ws, self._ws = self._ws, None
            self._connected = False
            self._cache.clear()
        if ws is not None:
            try:
                ws.close()  # type: ignore[union-attr]
            except Exception:
                pass

    def __enter__(self) -> "Accessors":
        self.open()
        return self

    def __exit__(self, *_) -> None:
        self.close()

    # ──────────────────────────────────────────────────── polling

    def refresh(self) -> bool:
        """Send one Runtime.evaluate and update the value cache. Returns True on success."""
        with self._lock:
            if not self._connected or self._ws is None:
                return False
            ws       = self._ws
            msg_id   = self._msg_id + 1
            self._msg_id = msg_id

        try:
            ws.send(json.dumps({  # type: ignore[union-attr]
                "id":     msg_id,
                "method": "Runtime.evaluate",
                "params": {"expression": _JS_READ_ALL, "returnByValue": True},
            }))
            resp = json.loads(ws.recv())  # type: ignore[union-attr]
            raw  = resp.get("result", {}).get("result", {}).get("value")
            if not raw:
                return False
            data = json.loads(raw)
            if data.get("_err"):
                logger.warning(f"Accessors: JS runtime error: {data['_err']}")
            self._update_cache(data)
            return True

        except Exception as exc:
            logger.warning(f"Accessors: refresh failed — {exc}")
            with self._lock:
                self._connected = False
                self._cache.clear()
            return False

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
