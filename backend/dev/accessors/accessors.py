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

import importlib.resources as _pkg_res
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

from .hud_selectors import HUD as HUD        # re-exported for plugin authors
from .hud_selectors import HANGAR as HANGAR  # re-exported for plugin authors

_JS_READ_ALL:        str = (_pkg_res.files(__package__) / "js" / "read_all.js").read_text(encoding="utf-8")
_JS_READ_MARKERS:    str = (_pkg_res.files(__package__) / "js" / "read_markers.js").read_text(encoding="utf-8")
_JS_READ_BATTLE_APP: str = (_pkg_res.files(__package__) / "js" / "read_battle_app.js").read_text(encoding="utf-8")

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
    "health", "health_regen", "health_pct",
    "energy", "energy_regen",
    "boost", "boost_active",
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
    # ping / fps
    "ping", "fps",
    # game info
    "game_mode", "match_state", "map_slug",
    # team scores / zones
    "ally_score", "enemy_score", "allied_zones", "enemy_zones",
    # player match stats
    "player_kills", "player_damage", "player_role_pts",
    "player_is_dead", "player_role", "player_vehicle", "player_agent_id", "player_name",
    # from markers page
    "on_fire", "debuff_count", "debuff_tags", "buff_count", "buff_tags",
    "major_effect_count",
    "missile_dist", "missile_in_flight",
    # from battle_app page (scoreboard)
    "sb_open", "sb_map_name", "sb_game_mode_name",
    "sb_ally_rows", "sb_enemy_rows",
    "sb_player_deaths", "sb_player_confirms", "sb_player_denies",
    # debug
    "_dbg_phm", "_dbg_mam",
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
        self._ws: object | None              = None
        self._ws_markers: object | None      = None
        self._ws_battle_app: object | None   = None
        self._ws_hangar: object | None       = None
        # Debugger URL each live socket is connected to, so sync() can detect a
        # page that was destroyed and recreated (new URL) and reconnect to it.
        self._url: str | None                = None
        self._url_markers: str | None        = None
        self._url_battle_app: str | None     = None
        self._url_hangar: str | None         = None
        self._msg_id    = 0
        self._msg_id_m  = 0
        self._msg_id_a  = 0
        self._msg_id_h  = 0
        self._connected         = False
        self._connected_hangar  = False
        self._cache: dict[str, Optional[Union[int, float, list]]] = {}

    # Connection

    @property
    def connected(self) -> bool:
        with self._lock:
            return self._connected

    @property
    def connected_hangar(self) -> bool:
        with self._lock:
            return self._connected_hangar

    # Logical page name → URL substring used to identify its CDP target.
    _PAGE_MATCH: tuple[tuple[str, str], ...] = (
        ("battle_hud", "battle_hud"),
        ("markers",    "markers"),
        ("battle_app", "battle_app"),
        ("hangar",     "meta/index.html"),
    )

    def _connect_ws(self, url: str) -> object | None:
        """Open a single CDP WebSocket. Blocks up to connect_timeout seconds."""
        try:
            ws = _ws_mod.WebSocket()
            ws.settimeout(self._connect_timeout)
            ws.connect(url)
            ws.settimeout(self._recv_timeout)
            return ws
        except Exception as exc:
            logger.debug(f"Accessors: WebSocket connect to {url} failed: {exc}")
            return None

    def _discover_targets(self) -> dict[str, str] | None:
        """Return ``{logical_name: webSocketDebuggerUrl}`` for pages present now.

        Returns ``None`` if the CDP endpoint is unreachable (game not running),
        as distinct from an empty dict (endpoint up, no matching pages yet).
        """
        try:
            resp = urllib.request.urlopen(
                f"http://localhost:{self._port}/json",
                timeout=2.0,
            )
            targets = json.loads(resp.read())
        except Exception as exc:
            logger.debug(f"Accessors: CDP not reachable on port {self._port}: {exc}")
            return None

        if not isinstance(targets, list):
            logger.debug("Accessors: CDP /json returned non-list response")
            return None

        found: dict[str, str] = {}
        for t in targets:
            if t.get("type") != "page":
                continue
            url   = t.get("url", "")
            wsurl = t.get("webSocketDebuggerUrl")
            if not wsurl:
                continue
            for name, needle in self._PAGE_MATCH:
                if name not in found and needle in url:
                    found[name] = wsurl
                    break
        return found

    def open(self) -> bool:
        """Compatibility shim - connect to whatever CDP pages exist right now.

        Equivalent to a single :meth:`sync` call. Blocks for up to
        connect_timeout seconds, so call from a background thread inside the
        plugin to keep the FUSE main loop responsive.
        """
        return self.sync()

    def sync(self) -> bool:
        """Reconcile open WebSocket connections with the CDP pages that exist now.

        Opens sockets for pages that have appeared (e.g. battle_hud/markers when
        entering a battle) and closes sockets for pages that have disappeared
        (e.g. battle_app/hangar when leaving the hangar). This lets the service
        follow the game across hangar↔battle transitions without a restart.

        Safe to call repeatedly from a background thread. Returns True if at
        least one page socket is connected afterwards.
        """
        if not _WS_AVAILABLE:
            logger.error(
                "Accessors: websocket-client not installed - "
                "run: pip install websocket-client"
            )
            return False

        targets = self._discover_targets()
        if targets is None:
            # CDP endpoint gone (game closed / debugger off) - drop everything.
            self.close()
            return False

        # Snapshot the sockets/URLs we currently hold for each logical page.
        with self._lock:
            cur: dict[str, tuple[object | None, str | None]] = {
                "battle_hud": (self._ws,            self._url),
                "markers":    (self._ws_markers,    self._url_markers),
                "battle_app": (self._ws_battle_app, self._url_battle_app),
                "hangar":     (self._ws_hangar,     self._url_hangar),
            }

        # Only slots we actually open or close are written back, so a socket
        # that refresh()/_drop() tears down on the main thread while this runs
        # is not revived from our (now-stale) snapshot.
        results:  dict[str, tuple[object | None, str | None]] = {}
        to_close: list[object]                                = []
        changed:  list[str]                                   = []

        for name in ("battle_hud", "markers", "battle_app", "hangar"):
            want_url      = targets.get(name)
            sock, cur_url = cur[name]
            if want_url and (sock is None or cur_url != want_url):
                # New page, or the page was recreated under a different URL.
                if sock is not None:
                    to_close.append(sock)
                fresh = self._connect_ws(want_url)        # blocking - outside lock
                if fresh is not None:
                    results[name] = (fresh, want_url)
                    changed.append(f"+{name}")
                elif sock is not None:
                    # Old socket closed but reconnect failed - clear the slot.
                    results[name] = (None, None)
            elif not want_url and sock is not None:
                # Page is gone - tear its socket down.
                to_close.append(sock)
                results[name] = (None, None)
                changed.append(f"-{name}")
            # else: unchanged - leave the slot exactly as the live object holds it.

        with self._lock:
            for name, (ws_new, url_new) in results.items():
                if   name == "battle_hud":
                    self._ws,            self._url            = ws_new, url_new
                elif name == "markers":
                    self._ws_markers,    self._url_markers    = ws_new, url_new
                elif name == "battle_app":
                    self._ws_battle_app, self._url_battle_app = ws_new, url_new
                elif name == "hangar":
                    self._ws_hangar,     self._url_hangar     = ws_new, url_new
            self._connected        = self._ws is not None
            self._connected_hangar = self._ws_hangar is not None
            connected_any = self._connected or self._connected_hangar

        for sock in to_close:
            try:
                sock.close()  # type: ignore[union-attr]
            except Exception:
                pass

        if changed:
            logger.info("Accessors: CDP connections updated [" + " ".join(changed) + "]")
        return connected_any

    def close(self) -> None:
        with self._lock:
            ws,  self._ws             = self._ws,             None
            wsm, self._ws_markers     = self._ws_markers,     None
            wsa, self._ws_battle_app  = self._ws_battle_app,  None
            wsh, self._ws_hangar      = self._ws_hangar,      None
            self._url               = None
            self._url_markers       = None
            self._url_battle_app    = None
            self._url_hangar        = None
            self._connected         = False
            self._connected_hangar  = False
            self._cache.clear()
        for sock in (ws, wsm, wsa, wsh):
            if sock is not None:
                try:
                    sock.close()  # type: ignore[union-attr]
                except Exception:
                    pass

    def _drop(self, name: str) -> None:
        """Tear down a single logical socket after a connection failure.

        Nulls the socket and its tracked URL so the next :meth:`sync` pass sees
        ``sock is None`` and reconnects a fresh socket. Without this, a dead
        socket lingers with an unchanged URL and sync keeps reviving it (the
        connection flag flips back to True), so it never reconnects.
        """
        with self._lock:
            if name == "battle_hud":
                sock, self._ws            = self._ws,            None
                self._url                 = None
                self._connected           = False
            elif name == "markers":
                sock, self._ws_markers    = self._ws_markers,    None
                self._url_markers         = None
            elif name == "battle_app":
                sock, self._ws_battle_app = self._ws_battle_app, None
                self._url_battle_app      = None
            elif name == "hangar":
                sock, self._ws_hangar     = self._ws_hangar,     None
                self._url_hangar          = None
                self._connected_hangar    = False
            else:
                return
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

    # Polling

    def refresh(self) -> bool:
        """Send Runtime.evaluate to battle_hud, markers, and battle_app. Returns True on success."""
        with self._lock:
            if not self._connected or self._ws is None:
                return False
            ws             = self._ws
            ws_markers     = self._ws_markers
            ws_battle_app  = self._ws_battle_app
            msg_id         = self._msg_id   + 1
            msg_id_m       = self._msg_id_m + 1
            msg_id_a       = self._msg_id_a + 1
            self._msg_id   = msg_id
            self._msg_id_m = msg_id_m
            self._msg_id_a = msg_id_a

        def _eval(sock, expr: str, mid: int) -> dict | None:
            """Run one CDP eval. Raises on a socket/transport error so the
            caller can drop & reconnect; returns None only for an empty result."""
            sock.send(json.dumps({
                "id": mid, "method": "Runtime.evaluate",
                "params": {"expression": expr, "returnByValue": True},
            }))
            resp = json.loads(sock.recv())
            raw  = resp.get("result", {}).get("result", {}).get("value")
            return json.loads(raw) if raw else None

        # battle_hud (primary) - a transport error here drops the socket so the
        # next sync() reconnects a fresh one instead of reviving the dead one.
        try:
            data = _eval(ws, _JS_READ_ALL, msg_id)
        except Exception as exc:
            logger.warning(f"Accessors: battle_hud eval failed - {exc}")
            self._drop("battle_hud")
            with self._lock:
                self._cache.clear()
            return False

        if data:
            if data.get("_err"):
                logger.warning(f"Accessors: JS error (hud): {data['_err']}")
            self._update_cache(data)

        if ws_markers is not None:
            try:
                mdata = _eval(ws_markers, _JS_READ_MARKERS, msg_id_m)
            except Exception as exc:
                logger.warning(f"Accessors: markers eval failed - {exc}")
                self._drop("markers")
                mdata = None
            if mdata:
                if mdata.get("_err"):
                    logger.warning(f"Accessors: JS error (markers): {mdata['_err']}")
                self._update_cache(mdata)

        if ws_battle_app is not None:
            try:
                adata = _eval(ws_battle_app, _JS_READ_BATTLE_APP, msg_id_a)
            except Exception as exc:
                logger.warning(f"Accessors: battle_app eval failed - {exc}")
                self._drop("battle_app")
                adata = None
            if adata:
                if adata.get("_err"):
                    logger.warning(f"Accessors: JS error (battle_app): {adata['_err']}")
                self._update_cache(adata)

        return True

    def _update_cache(self, data: dict) -> None:
        for field, (key, typ) in _FIELD_MAP.items():
            if key in data:
                val = data[key]
                self._cache[field] = typ(val) if val is not None else None
        for key in _EXTRA_KEYS:
            val = data.get(key)
            if val is not None:
                self._cache[key] = val

    # Read API

    def read(self, name: str) -> Optional[Union[int, float]]:
        """Return the last-cached value for *name*, or None if unavailable.

        Accepts both game_memory-compatible names (e.g. "multiplayer_vehicle_health")
        and native CDP names (e.g. "health_regen", "zoom_val").
        """
        return self._cache.get(name)  # type: ignore[return-value]

    # Setter helpers

    def _exec(self, expr: str) -> None:
        """Fire-and-forget Runtime.evaluate on battle_hud. No return value read."""
        with self._lock:
            if not self._connected or self._ws is None:
                logger.warning("Accessors._exec: not connected - style change skipped")
                return
            ws = self._ws
            self._msg_id += 1
            mid = self._msg_id
        try:
            ws.send(json.dumps({  # type: ignore[union-attr]
                "id": mid,
                "method": "Runtime.evaluate",
                "params": {"expression": expr, "returnByValue": False},
            }))
            ws.recv()  # type: ignore[union-attr]
        except Exception as exc:
            logger.warning(f"Accessors._exec: send failed - {exc}")
            self._drop("battle_hud")

    def _exec_markers(self, expr: str) -> None:
        """Fire-and-forget Runtime.evaluate on the markers page."""
        with self._lock:
            if not self._connected or self._ws_markers is None:
                return
            ws = self._ws_markers
            self._msg_id_m += 1
            mid = self._msg_id_m
        try:
            ws.send(json.dumps({  # type: ignore[union-attr]
                "id": mid,
                "method": "Runtime.evaluate",
                "params": {"expression": expr, "returnByValue": False},
            }))
            ws.recv()  # type: ignore[union-attr]
        except Exception as exc:
            logger.warning(f"Accessors._exec_markers: send failed - {exc}")
            self._drop("markers")

    def inject_stylesheet(self, css: Optional[str], style_id: str = "__fuse__") -> None:
        """Inject, update, or remove a <style id=style_id> element in battle_hud <head>.

        !important rules inside a stylesheet node beat non-important *inline*
        styles the game sets via JS (el.style.prop = value) because stylesheet
        !important outranks normal inline in the CSS cascade.  Inline setProperty
        with 'important' does NOT - two inline declarations race, last write wins.

        css=None  → remove the <style> element from the DOM entirely (full revert).
        css=''    → clear all rules without removing the element.
        """
        sid = style_id.replace("'", "\\'")
        if css is None:
            expr = (
                f"(function(){{var el=document.getElementById('{sid}');if(el)el.remove();}})();null"
            )
        else:
            safe = css.replace("\\", "\\\\").replace("`", "\\`").replace("${", "\\${")
            expr = (
                "(function(){"
                f"var el=document.getElementById('{sid}');"
                f"if(!el){{el=document.createElement('style');el.id='{sid}';document.head.appendChild(el);}}"
                f"el.textContent=`{safe}`;"
                "})();null"
            )
        self._exec(expr)

    def inject_stylesheet_markers(self, css: Optional[str], style_id: str = "__fuse__") -> None:
        """Same as inject_stylesheet but targets the markers WebSocket page."""
        sid = style_id.replace("'", "\\'")
        if css is None:
            expr = f"(function(){{var el=document.getElementById('{sid}');if(el)el.remove();}})();null"
        else:
            safe = css.replace("\\", "\\\\").replace("`", "\\`").replace("${", "\\${")
            expr = (
                "(function(){"
                f"var el=document.getElementById('{sid}');"
                f"if(!el){{el=document.createElement('style');el.id='{sid}';document.head.appendChild(el);}}"
                f"el.textContent=`{safe}`;"
                "})();null"
            )
        self._exec_markers(expr)

    def _exec_hangar(self, expr: str) -> None:
        """Fire-and-forget Runtime.evaluate on the hangar (meta/index.html) page."""
        with self._lock:
            if not self._connected_hangar or self._ws_hangar is None:
                return
            ws = self._ws_hangar
            self._msg_id_h += 1
            mid = self._msg_id_h
        try:
            ws.send(json.dumps({  # type: ignore[union-attr]
                "id": mid,
                "method": "Runtime.evaluate",
                "params": {"expression": expr, "returnByValue": False},
            }))
            ws.recv()  # type: ignore[union-attr]
        except Exception as exc:
            logger.warning(f"Accessors._exec_hangar: send failed - {exc}")
            self._drop("hangar")

    def inject_stylesheet_hangar(self, css: Optional[str], style_id: str = "__fuse__") -> None:
        """Inject, update, or remove a <style> element in the hangar page <head>."""
        sid = style_id.replace("'", "\\'")
        if css is None:
            expr = f"(function(){{var el=document.getElementById('{sid}');if(el)el.remove();}})();null"
        else:
            safe = css.replace("\\", "\\\\").replace("`", "\\`").replace("${", "\\${")
            expr = (
                "(function(){"
                f"var el=document.getElementById('{sid}');"
                f"if(!el){{el=document.createElement('style');el.id='{sid}';document.head.appendChild(el);}}"
                f"el.textContent=`{safe}`;"
                "})();null"
            )
        self._exec_hangar(expr)

    def poll_open_url(self) -> Optional[str]:
        """Read and clear window.__fuse_open_url__ from the hangar page.

        Returns the URL string if one was set (e.g. by an injected button),
        or None if nothing is pending. Thread-safe - uses _exec_hangar lock.
        """
        with self._lock:
            if not self._connected_hangar or self._ws_hangar is None:
                return None
            ws = self._ws_hangar
            self._msg_id_h += 1
            mid = self._msg_id_h
        expr = (
            "(function(){"
            "var u=window.__fuse_open_url__;"
            "if(u){delete window.__fuse_open_url__;return u;}"
            "return null;"
            "})()"
        )
        try:
            ws.send(json.dumps({  # type: ignore[union-attr]
                "id": mid,
                "method": "Runtime.evaluate",
                "params": {"expression": expr, "returnByValue": True},
            }))
            resp = json.loads(ws.recv())  # type: ignore[union-attr]
            val  = resp.get("result", {}).get("result", {}).get("value")
            return str(val) if val else None
        except Exception as exc:
            logger.warning(f"Accessors.poll_open_url: failed - {exc}")
            self._drop("hangar")
            return None

    # Core setters

    def set_style(
        self,
        selector: str,
        prop: str,
        value: str,
        *,
        all_matching: bool = False,
        important: bool = False,
    ) -> None:
        """Set a single CSS property on the element(s) matching *selector*.

        Uses setProperty with 'important' priority by default so Cohtml's
        data-binding tick updates cannot overwrite the override.
        """
        prio = "'important'" if important else "''"
        sel  = json.dumps(selector)
        p    = json.dumps(prop)
        v    = json.dumps(value)
        if all_matching:
            expr = f"Array.from(document.querySelectorAll({sel})).forEach(function(el){{el.style.setProperty({p},{v},{prio})}});null"
        else:
            expr = f"var el=document.querySelector({sel});if(el)el.style.setProperty({p},{v},{prio});null"
        self._exec(expr)

    def set_styles(
        self,
        selector: str,
        styles: dict[str, str],
        *,
        all_matching: bool = False,
        important: bool = False,
    ) -> None:
        """Set multiple CSS properties in a single CDP round-trip."""
        prio        = "'important'" if important else "''"
        sel         = json.dumps(selector)
        assignments = ";".join(
            f"el.style.setProperty({json.dumps(k)},{json.dumps(v)},{prio})"
            for k, v in styles.items()
        )
        if all_matching:
            expr = f"Array.from(document.querySelectorAll({sel})).forEach(function(el){{{assignments}}});null"
        else:
            expr = f"var el=document.querySelector({sel});if(el){{{assignments}}};null"
        self._exec(expr)

    def reset_style(
        self,
        selector: str,
        prop: Optional[str] = None,
        *,
        all_matching: bool = False,
    ) -> None:
        """Remove an inline style override, letting the cascade resume.

        prop=None clears *all* inline styles set by us (cssText='').
        """
        sel = json.dumps(selector)
        if prop is not None:
            p = json.dumps(prop)
            if all_matching:
                expr = f"Array.from(document.querySelectorAll({sel})).forEach(function(el){{el.style.removeProperty({p})}});null"
            else:
                expr = f"var el=document.querySelector({sel});if(el)el.style.removeProperty({p});null"
        else:
            if all_matching:
                expr = f"Array.from(document.querySelectorAll({sel})).forEach(function(el){{el.style.cssText=''}});null"
            else:
                expr = f"var el=document.querySelector({sel});if(el)el.style.cssText='';null"
        self._exec(expr)

    # Convenience wrappers

    def hide(self, selector: str, *, all_matching: bool = False) -> None:
        """Hide element(s) with visibility:hidden !important.

        !important ensures Cohtml's per-tick style updates cannot re-show it.
        Pair with show() to restore.
        """
        self.set_style(selector, "visibility", "hidden", all_matching=all_matching, important=True)

    def show(self, selector: str, *, all_matching: bool = False) -> None:
        """Remove the visibility override applied by hide(), restoring cascade."""
        self.reset_style(selector, "visibility", all_matching=all_matching)

    def set_opacity(
        self,
        selector: str,
        opacity: float,
        *,
        all_matching: bool = False,
        important: bool = False,
    ) -> None:
        self.set_style(selector, "opacity", str(max(0.0, min(1.0, opacity))),
                       all_matching=all_matching, important=important)

    def set_color(
        self,
        selector: str,
        color: str,
        *,
        all_matching: bool = False,
        important: bool = False,
    ) -> None:
        self.set_style(selector, "color", color, all_matching=all_matching, important=important)

    def set_bg_color(
        self,
        selector: str,
        color: str,
        *,
        all_matching: bool = False,
        important: bool = False,
    ) -> None:
        self.set_style(selector, "background-color", color,
                       all_matching=all_matching, important=important)

    # Named per-element helpers

    def hide_hp(self)   -> None: self.hide(HUD.HP_BASE)
    def show_hp(self)   -> None: self.show(HUD.HP_BASE)
    def set_hp_color(self, color: str) -> None:
        self.set_color(HUD.HP_VALUE,    color)
        self.set_color(HUD.HP_THOUSANDS, color)

    def hide_mana(self)  -> None: self.hide(HUD.MANA_BASE)
    def show_mana(self)  -> None: self.show(HUD.MANA_BASE)
    def set_mana_color(self, color: str) -> None:
        self.set_color(HUD.MANA_VALUE, color)

    def hide_sprint(self) -> None: self.hide(HUD.SPRINT)
    def show_sprint(self) -> None: self.show(HUD.SPRINT)
    def hide_boost(self)  -> None: self.hide(HUD.BOOST)
    def show_boost(self)  -> None: self.show(HUD.BOOST)

    def hide_zoom(self)  -> None: self.hide(HUD.ZOOM_BASE)
    def show_zoom(self)  -> None: self.show(HUD.ZOOM_BASE)

    # Hangar setters

    def set_style_hangar(
        self,
        selector: str,
        prop: str,
        value: str,
        *,
        all_matching: bool = False,
        important: bool = False,
    ) -> None:
        """Set a single CSS property on hangar DOM element(s)."""
        prio = "'important'" if important else "''"
        sel  = json.dumps(selector)
        p    = json.dumps(prop)
        v    = json.dumps(value)
        if all_matching:
            expr = f"Array.from(document.querySelectorAll({sel})).forEach(function(el){{el.style.setProperty({p},{v},{prio})}});null"
        else:
            expr = f"var el=document.querySelector({sel});if(el)el.style.setProperty({p},{v},{prio});null"
        self._exec_hangar(expr)

    def set_styles_hangar(
        self,
        selector: str,
        styles: dict[str, str],
        *,
        all_matching: bool = False,
        important: bool = False,
    ) -> None:
        """Set multiple CSS properties on hangar DOM element(s) in one round-trip."""
        prio        = "'important'" if important else "''"
        sel         = json.dumps(selector)
        assignments = ";".join(
            f"el.style.setProperty({json.dumps(k)},{json.dumps(v)},{prio})"
            for k, v in styles.items()
        )
        if all_matching:
            expr = f"Array.from(document.querySelectorAll({sel})).forEach(function(el){{{assignments}}});null"
        else:
            expr = f"var el=document.querySelector({sel});if(el){{{assignments}}};null"
        self._exec_hangar(expr)

    def reset_style_hangar(
        self,
        selector: str,
        prop: Optional[str] = None,
        *,
        all_matching: bool = False,
    ) -> None:
        """Remove an inline style override on a hangar element, restoring the cascade."""
        sel = json.dumps(selector)
        if prop is not None:
            p = json.dumps(prop)
            if all_matching:
                expr = f"Array.from(document.querySelectorAll({sel})).forEach(function(el){{el.style.removeProperty({p})}});null"
            else:
                expr = f"var el=document.querySelector({sel});if(el)el.style.removeProperty({p});null"
        else:
            if all_matching:
                expr = f"Array.from(document.querySelectorAll({sel})).forEach(function(el){{el.style.cssText=''}});null"
            else:
                expr = f"var el=document.querySelector({sel});if(el)el.style.cssText='';null"
        self._exec_hangar(expr)

    def hide_hangar(self, selector: str, *, all_matching: bool = False) -> None:
        self.set_style_hangar(selector, "visibility", "hidden", all_matching=all_matching, important=True)

    def show_hangar(self, selector: str, *, all_matching: bool = False) -> None:
        self.reset_style_hangar(selector, "visibility", all_matching=all_matching)

    def set_opacity_hangar(
        self,
        selector: str,
        opacity: float,
        *,
        all_matching: bool = False,
        important: bool = False,
    ) -> None:
        self.set_style_hangar(selector, "opacity", str(opacity),
                              all_matching=all_matching, important=important)

    def set_color_hangar(
        self,
        selector: str,
        color: str,
        *,
        all_matching: bool = False,
        important: bool = False,
    ) -> None:
        self.set_style_hangar(selector, "color", color,
                              all_matching=all_matching, important=important)

    def set_bg_color_hangar(
        self,
        selector: str,
        color: str,
        *,
        all_matching: bool = False,
        important: bool = False,
    ) -> None:
        self.set_style_hangar(selector, "background-color", color,
                              all_matching=all_matching, important=important)


__all__ = ["Accessors", "HUD", "HANGAR"]
