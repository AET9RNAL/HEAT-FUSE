/**
 * WebSocket + HTTP server
 * Adds an **overlay channel**: clients that auth with `role:"overlay"` receive
 * `overlay:*` messages (declared/data/visibility/transform/removed) and may send
 * `overlay:transform` back on drag. Assets are served over HTTP at
 * `/overlay-asset/<pluginId>/<relpath>` (the `.riv` bytes the stage fetches).
 */
import http from "node:http";
import net from "node:net";
import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { WebSocketServer, WebSocket } from "ws";

export interface PluginHydration {
  configSchema: Array<Record<string, unknown>>;
  configValues: Record<string, unknown>;
  hotkeys: Array<{ action: string; combo: string; label: string }>;
}

export interface RuntimeBridge {
  readonly hostVersion: string;
  /** Called when the first authenticated client connects (any role). */
  onFirstClient(): void;
  /** Metadata for every discovered plugin (the `plugin:registered` payload base). */
  listPlugins(): Array<Record<string, unknown>>;
  pluginHydration(pluginId: string): PluginHydration;
  hostState(): { state: string; calib_stage: number };

  rpcConfigUpdate(params: Record<string, unknown>): Record<string, unknown>;
  rpcSetEnabled(params: Record<string, unknown>): Promise<Record<string, unknown>>;
  rpcHotkeyRebind(params: Record<string, unknown>): Record<string, unknown>;
  rpcOverlaySetVisible(params: Record<string, unknown>): Promise<Record<string, unknown>>;

  /** Current overlay descriptors (hydration for a newly-connected overlay client). */
  overlayHydration(): Array<Record<string, unknown>>;
  /** A stage window dragged an overlay - persist + propagate. */
  onOverlayTransform(overlayId: string, rect: Record<string, number>): void;
  /** An interactive overlay emitted an action (button/input) - route to plugin. */
  onOverlayAction(overlayId: string, action: string, payload?: unknown): void;

  /** Resolve an overlay asset request to an absolute file path, or null. */
  resolveAsset(pluginId: string, relPath: string): string | null;
}

type Role = "control" | "overlay";

export class WsServer {
  readonly connectionToken: string = randomBytes(32).toString("hex");
  private bridge!: RuntimeBridge;
  private httpServer: http.Server;
  private wss: WebSocketServer;
  private control = new Set<WebSocket>();
  private overlay = new Set<WebSocket>();
  private firstClientSeen = false;
  private lastHostState: string | null = null;

  constructor() {
    this.httpServer = http.createServer((req, res) => this.handleHttp(req, res));
    this.wss = new WebSocketServer({ server: this.httpServer, path: "/ws" });
    this.wss.on("connection", (ws) => this.handleWs(ws));
  }

  /** Attach the runtime bridge before `start()` (breaks the host↔server cycle). */
  attach(bridge: RuntimeBridge): void {
    this.bridge = bridge;
  }

  // --- startup ------------------------------------------------------------

  private async findFreePort(): Promise<number> {
    return new Promise((resolve, reject) => {
      const srv = net.createServer();
      srv.once("error", reject);
      srv.listen(0, "127.0.0.1", () => {
        const addr = srv.address();
        const port = typeof addr === "object" && addr ? addr.port : 0;
        srv.close(() => resolve(port));
      });
    });
  }

  async start(): Promise<number> {
    const port = await this.findFreePort();
    await new Promise<void>((resolve, reject) => {
      this.httpServer.once("error", reject);
      this.httpServer.listen(port, "127.0.0.1", () => resolve());
    });
    return port;
  }

  // --- HTTP ---------------------------------------------------------------

  private handleHttp(req: http.IncomingMessage, res: http.ServerResponse): void {
    const url = req.url ?? "";
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "*");
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }
    if (url === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ status: "ok" }));
      return;
    }
    if (url.startsWith("/overlay-asset/")) {
      this.serveAsset(url.slice("/overlay-asset/".length), res);
      return;
    }
    res.writeHead(404);
    res.end();
  }

  private serveAsset(rest: string, res: http.ServerResponse): void {
    const decoded = decodeURIComponent(rest.split("?")[0] ?? "");
    const slash = decoded.indexOf("/");
    if (slash <= 0) {
      res.writeHead(400);
      res.end();
      return;
    }
    const pluginId = decoded.slice(0, slash);
    const relPath = decoded.slice(slash + 1);
    if (relPath.includes("..")) {
      res.writeHead(400);
      res.end();
      return;
    }
    const abs = this.bridge.resolveAsset(pluginId, relPath);
    if (!abs || !fs.existsSync(abs)) {
      res.writeHead(404);
      res.end();
      return;
    }
    const ext = path.extname(abs).toLowerCase();
    const MIME: Record<string, string> = {
      ".riv": "application/octet-stream",
      ".png": "image/png",
      ".svg": "image/svg+xml",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".webp": "image/webp",
      ".gif": "image/gif",
      ".json": "application/json",
      ".vue": "text/plain",
    };
    const type = MIME[ext] ?? "application/octet-stream";
    res.writeHead(200, { "content-type": type, "cache-control": "no-cache" });
    fs.createReadStream(abs).pipe(res);
  }

  // --- WebSocket ----------------------------------------------------------

  private handleWs(ws: WebSocket): void {
    let role: Role = "control";
    let authed = false;

    const authTimer = setTimeout(() => {
      if (!authed) ws.close(4401);
    }, 5000);

    ws.on("message", (data) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return;
      }
      if (!authed) {
        if (msg.type !== "auth" || msg.token !== this.connectionToken) {
          ws.close(4401);
          return;
        }
        authed = true;
        clearTimeout(authTimer);
        role = msg.role === "overlay" ? "overlay" : "control";
        (role === "overlay" ? this.overlay : this.control).add(ws);
        ws.send(JSON.stringify({ type: "auth:ok", version: this.bridge.hostVersion }));

        if (!this.firstClientSeen) {
          this.firstClientSeen = true;
          this.bridge.onFirstClient();
        }
        this.hydrate(ws, role);
        return;
      }
      void this.dispatch(ws, role, msg);
    });

    ws.on("close", () => {
      clearTimeout(authTimer);
      this.control.delete(ws);
      this.overlay.delete(ws);
    });
    ws.on("error", () => {
      this.control.delete(ws);
      this.overlay.delete(ws);
    });
  }

  private hydrate(ws: WebSocket, role: Role): void {
    if (role === "control") {
      for (const entry of this.bridge.listPlugins()) {
        const pid = String(entry.plugin_id);
        const h = this.bridge.pluginHydration(pid);
        send(ws, {
          type: "plugin:registered",
          ...entry,
          configSchema: h.configSchema,
          configValues: h.configValues,
          hotkeys: h.hotkeys,
        });
      }
      const hs = this.bridge.hostState();
      send(ws, { type: "host:state_changed", state: hs.state, calib_stage: hs.calib_stage });
    } else {
      for (const desc of this.bridge.overlayHydration()) send(ws, { type: "overlay:declared", ...desc });
      const hs = this.bridge.hostState();
      send(ws, { type: "host:state_changed", state: hs.state, calib_stage: hs.calib_stage });
    }
  }

  private async dispatch(ws: WebSocket, role: Role, msg: Record<string, unknown>): Promise<void> {
    if (msg.type === "heartbeat") {
      send(ws, { type: "heartbeat_ack" });
      return;
    }
    if (role === "overlay" && msg.type === "overlay:transform") {
      const overlayId = String(msg.overlayId ?? "");
      const rect = (msg.rect as Record<string, number>) ?? {};
      if (overlayId) this.bridge.onOverlayTransform(overlayId, rect);
      return;
    }
    if (role === "overlay" && msg.type === "overlay:action") {
      const overlayId = String(msg.overlayId ?? "");
      const action = String(msg.action ?? "");
      if (overlayId && action) this.bridge.onOverlayAction(overlayId, action, msg.payload);
      return;
    }
    if (msg.jsonrpc === "2.0") await this.dispatchRpc(ws, msg);
  }

  private async dispatchRpc(ws: WebSocket, msg: Record<string, unknown>): Promise<void> {
    const method = String(msg.method ?? "");
    const params = (msg.params as Record<string, unknown>) ?? {};
    const rpcId = msg.id;
    try {
      let result: Record<string, unknown>;
      switch (method) {
        case "config.update":
          result = this.bridge.rpcConfigUpdate(params);
          break;
        case "plugin.setEnabled":
          result = await this.bridge.rpcSetEnabled(params);
          break;
        case "hotkey.rebind":
          result = this.bridge.rpcHotkeyRebind(params);
          break;
        case "overlay.setVisible":
          result = await this.bridge.rpcOverlaySetVisible(params);
          break;
        default:
          send(ws, {
            jsonrpc: "2.0",
            id: rpcId,
            error: { code: -32601, message: `Method not found: ${method}` },
          });
          return;
      }
      send(ws, { jsonrpc: "2.0", id: rpcId, result });
    } catch (e) {
      send(ws, { jsonrpc: "2.0", id: rpcId, error: { code: -32603, message: String(e) } });
    }
  }

  // --- outgoing broadcasts ------------------------------------------------

  broadcastControl(obj: Record<string, unknown>): void {
    const text = JSON.stringify(obj);
    for (const ws of this.control) trySend(ws, text, this.control);
  }

  broadcastOverlay(obj: Record<string, unknown>): void {
    const text = JSON.stringify(obj);
    for (const ws of this.overlay) trySend(ws, text, this.overlay);
  }

  /** Deduped host-state broadcast (to both channels). Mirrors notify_host_state_changed. */
  notifyHostStateChanged(state: string, calibStage = 1): void {
    const key = `${state}:${calibStage}`;
    if (key === this.lastHostState) return;
    this.lastHostState = key;
    const payload = { type: "host:state_changed", state, calib_stage: calibStage };
    this.broadcastControl(payload);
    this.broadcastOverlay(payload);
  }
}

function send(ws: WebSocket, obj: Record<string, unknown>): void {
  try {
    ws.send(JSON.stringify(obj));
  } catch {
    /* ignore */
  }
}

function trySend(ws: WebSocket, text: string, set: Set<WebSocket>): void {
  try {
    ws.send(text);
  } catch {
    set.delete(ws);
  }
}
