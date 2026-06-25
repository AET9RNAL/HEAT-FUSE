"""FUSE bootstrap: FastAPI WebSocket server + Tkinter plugin host."""
from __future__ import annotations

import asyncio
import json
import secrets
import socket
import threading
import time
from pathlib import Path
from typing import Optional, Set, TYPE_CHECKING

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
import uvicorn

if TYPE_CHECKING:
    from fuse.core.host import PluginHost, DiscoveredPlugin

_ASSETS_DIR = Path(__file__).resolve().parent.parent / "assets"

_FUSE_FONTS = [
    "NotoSans-VariableFont_wdth,wght.ttf",
    "NotoSans-Italic-VariableFont_wdth,wght.ttf",
]


class FuseCore:
    """Owns the FastAPI/WebSocket server and boots the Tk plugin host."""

    def __init__(self) -> None:
        self._connection_token: str = ""
        self._clients: Set[WebSocket] = set()
        self._loop: Optional[asyncio.AbstractEventLoop] = None
        self._host: Optional["PluginHost"] = None

        self._app = FastAPI()

        @self._app.get("/health")
        async def health() -> dict:
            return {"status": "ok"}

        @self._app.websocket("/ws")
        async def ws_endpoint(websocket: WebSocket) -> None:
            await self._handle_ws(websocket)

    # ------------------------------------------------------------------
    # WebSocket handler
    # ------------------------------------------------------------------

    async def _handle_ws(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self._clients.add(websocket)
        try:
            # Auth — first message must carry the connection token.
            raw = await asyncio.wait_for(websocket.receive_text(), timeout=5.0)
            msg = json.loads(raw)
            if msg.get("type") != "auth" or msg.get("token") != self._connection_token:
                await websocket.close(code=4401)
                return
            await websocket.send_text(json.dumps({"type": "auth:ok"}))

            # Send current plugin list so late-connecting clients are hydrated.
            if self._host is not None:
                for entry in self._host.list_plugins():
                    await websocket.send_text(json.dumps({
                        "type": "plugin:registered",
                        **entry,
                        "configSchema": [],
                        "hotkeys": self._hotkeys_for(entry["plugin_id"]),
                    }))

            # Main dispatch loop.
            while True:
                raw = await websocket.receive_text()
                await self._dispatch(websocket, json.loads(raw))

        except (WebSocketDisconnect, asyncio.TimeoutError, asyncio.CancelledError):
            pass
        except Exception:
            pass
        finally:
            self._clients.discard(websocket)

    async def _dispatch(self, ws: WebSocket, msg: dict) -> None:
        if msg.get("type") == "heartbeat":
            await ws.send_text(json.dumps({"type": "heartbeat_ack"}))
            return

        if msg.get("jsonrpc") == "2.0":
            await self._dispatch_rpc(ws, msg)

    async def _dispatch_rpc(self, ws: WebSocket, msg: dict) -> None:
        method = msg.get("method", "")
        params = msg.get("params") or {}
        rpc_id = msg.get("id")

        try:
            if method == "config.update":
                result = self._rpc_config_update(params)
            elif method == "plugin.setEnabled":
                result = self._rpc_set_enabled(params)
            elif method == "hotkey.rebind":
                result = self._rpc_hotkey_rebind(params)
            else:
                await ws.send_text(json.dumps({
                    "jsonrpc": "2.0", "id": rpc_id,
                    "error": {"code": -32601, "message": f"Method not found: {method}"},
                }))
                return
            await ws.send_text(json.dumps({"jsonrpc": "2.0", "id": rpc_id, "result": result}))
        except Exception as exc:
            await ws.send_text(json.dumps({
                "jsonrpc": "2.0", "id": rpc_id,
                "error": {"code": -32603, "message": str(exc)},
            }))

    # ------------------------------------------------------------------
    # RPC method handlers (called from async context, safe to block briefly)
    # ------------------------------------------------------------------

    def _rpc_config_update(self, params: dict) -> dict:
        if self._host is None:
            return {"updated": {}}
        plugin_id = params.get("plugin_id")
        key = params.get("key")
        value = params.get("value")
        if plugin_id and key is not None:
            ctx = self._host._context_map.get(plugin_id)
            if ctx is not None:
                ctx.config.set(key, value)
                return {"updated": {key: value}}
        return {"updated": {}}

    def _rpc_set_enabled(self, params: dict) -> dict:
        if self._host is None:
            return {"ok": False}
        plugin_id: str = params["plugin_id"]
        enabled: bool = params["enabled"]
        if enabled:
            self._host.enable_plugin(plugin_id)
        else:
            self._host.disable_plugin(plugin_id)
        return {"ok": True, "plugin_id": plugin_id, "enabled": enabled}

    def _rpc_hotkey_rebind(self, params: dict) -> dict:
        # TODO: wire into HotkeyRegistry when rebind persistence is implemented
        return {"ok": True}

    # ------------------------------------------------------------------
    # Outgoing notifications (called from Tk thread)
    # ------------------------------------------------------------------

    def _hotkeys_for(self, plugin_id: str) -> list:
        if self._host is None:
            return []
        spec = self._host._discovered.get(plugin_id)
        if spec is None:
            return []
        return [
            {"action": action, "combo": combo}
            for action, combo in spec.manifest.get("hotkeys", {}).items()
        ]

    def notify_plugin_registered(self, spec: "DiscoveredPlugin", status: str) -> None:
        payload = json.dumps({
            "type": "plugin:registered",
            "plugin_id": spec.plugin_id,
            "name": spec.name,
            "version": spec.version,
            "description": spec.description,
            "author": spec.author,
            "status": status,
            "configSchema": [],
            "hotkeys": [
                {"action": a, "combo": c}
                for a, c in spec.manifest.get("hotkeys", {}).items()
            ],
        })
        self._schedule_broadcast(payload)

    def notify_plugin_status_changed(self, plugin_id: str, status: str) -> None:
        payload = json.dumps({
            "type": "plugin:status_changed",
            "plugin_id": plugin_id,
            "status": status,
        })
        self._schedule_broadcast(payload)

    def _schedule_broadcast(self, message: str) -> None:
        if self._loop is None:
            return
        asyncio.run_coroutine_threadsafe(self._broadcast(message), self._loop)

    async def _broadcast(self, message: str) -> None:
        dead: Set[WebSocket] = set()
        for ws in list(self._clients):
            try:
                await ws.send_text(message)
            except Exception:
                dead.add(ws)
        self._clients -= dead

    # ------------------------------------------------------------------
    # Server startup
    # ------------------------------------------------------------------

    def _find_free_port(self) -> int:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.bind(("127.0.0.1", 0))
            return s.getsockname()[1]

    def start_server(self) -> int:
        """Start uvicorn in a daemon thread. Returns the bound port."""
        port = self._find_free_port()
        config = uvicorn.Config(
            self._app,
            host="127.0.0.1",
            port=port,
            log_level="error",
            access_log=False,
        )
        server = uvicorn.Server(config)
        loop_ready = threading.Event()

        def _run() -> None:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            self._loop = loop
            loop_ready.set()
            loop.run_until_complete(server.serve())

        t = threading.Thread(target=_run, daemon=True, name="fuse-ws-server")
        t.start()

        loop_ready.wait(timeout=5.0)
        for _ in range(50):
            if server.started:
                break
            time.sleep(0.1)

        return port

    # ------------------------------------------------------------------
    # Full bootstrap
    # ------------------------------------------------------------------

    def run(self, extra_plugin_dirs: list | None = None) -> None:
        """Boot FUSE: start WebSocket server, then enter the Tk mainloop."""
        import tkinter as tk
        from fuse.core.log import setup as _setup_logging
        from fuse.core.host import PluginHost
        from fuse.ui.fonts import load_font
        from fuse.packaging.file_assoc import ensure_registered

        _setup_logging()
        ensure_registered(_ASSETS_DIR / "logo.png")
        for name in _FUSE_FONTS:
            load_font(_ASSETS_DIR / name)

        # Start WebSocket server before printing startup JSON so Electron
        # won't connect before the server is ready.
        self._connection_token = secrets.token_hex(32)
        port = self.start_server()

        # Electron reads this line from stdout to learn the port and token.
        print(json.dumps({"port": port, "connectionToken": self._connection_token}), flush=True)

        root = tk.Tk()
        host = PluginHost(root, server=self)
        self._host = host
        host.load_plugins(extra_plugin_dirs=extra_plugin_dirs)
        host.run()


def run(argv: list | None = None, extra_plugin_dirs: list | None = None) -> None:
    """Module-level entry point (backward-compatible with runner.py)."""
    del argv
    FuseCore().run(extra_plugin_dirs=extra_plugin_dirs)


def main() -> None:  # pragma: no cover
    run()


if __name__ == "__main__":  # pragma: no cover
    main()
