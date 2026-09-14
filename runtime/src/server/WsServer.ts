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
  /** A button pressed in the App's plugin config panel. */
  rpcConfigAction(params: Record<string, unknown>): Record<string, unknown>;
  /** The App's master volume and mute for plugin audio. */
  rpcAudioSetMaster(params: Record<string, unknown>): Record<string, unknown>;
  /** Master volume and the sounds to warm, for a newly-connected stage. */
  audioHydration(): { master: { volume: number; muted: boolean }; preload: string[] };
  rpcSetEnabled(params: Record<string, unknown>): Promise<Record<string, unknown>>;
  rpcHotkeyRebind(params: Record<string, unknown>): Record<string, unknown>;
  rpcOverlaySetVisible(params: Record<string, unknown>): Promise<Record<string, unknown>>;

  /** Current overlay descriptors (hydration for a newly-connected overlay client). */
  overlayHydration(): Array<Record<string, unknown>>;
  /** Per-overlay inspector schemas + values (hydration for the stage). */
  inspectorHydration(): Array<Record<string, unknown>>;
  /** Stage notifications still showing, for a newly-connected stage. */
  notificationHydration(): unknown[];
  /** A stage client closed a notification. */
  onStageNotificationDismissed(id: string): void;
  /** Plugin roster for the stage's plugin list. */
  pluginListForStage(): Array<Record<string, unknown>>;
  /** Host shortcut combos after user overrides, for on-screen hints. */
  hostHotkeys(): { lock: string; interactive: string };
  /** A stage window dragged an overlay - persist + propagate. */
  onOverlayTransform(overlayId: string, rect: Record<string, number>): void;
  /** An interactive overlay emitted an action (button/input) - route to plugin. */
  onOverlayAction(overlayId: string, action: string, payload?: unknown): void;
  /** The stage inspector changed a control's value. */
  onInspectorSet(overlayId: string, controlId: string, value: unknown, phase: "live" | "commit"): void;
  /** The stage inspector fired a button. */
  onInspectorAction(overlayId: string, controlId: string, payload?: unknown): void;
  /** The stage asked for a host state (the toolbar's Done button). */
  onHostRequest(state: string): void;
  /** A permission picked in the stage's info bar: Electron shows the consent card for it. */
  onPermissionReview(pluginId: string, scope: string): void;

  /** Resolve an overlay asset request to an absolute file path, or null. */
  resolveAsset(pluginId: string, relPath: string): string | null;
}

/** control: the App. stage: the Electron stage window. view: OBS browser sources, receive-only. */
type Role = "control" | "stage" | "view";

export class WsServer {
  readonly connectionToken: string = randomBytes(32).toString("hex");
  /** Plugin Vue overlays share the stage page, so this token never reaches control RPCs. */
  readonly stageToken: string = randomBytes(32).toString("hex");
  /** Served to OBS over unauthenticated localhost HTTP. */
  readonly obsToken: string = randomBytes(32).toString("hex");
  private bridge!: RuntimeBridge;
  private httpServer: http.Server;
  private wss: WebSocketServer;
  private control = new Set<WebSocket>();
  private overlay = new Set<WebSocket>();
  private stageClients = new Set<WebSocket>();
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
      ".mp3": "audio/mpeg",
      ".wav": "audio/wav",
      ".ogg": "audio/ogg",
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
        const granted = this.roleForAuth(msg);
        if (!granted) {
          ws.close(4401);
          return;
        }
        authed = true;
        clearTimeout(authTimer);
        role = granted;
        (role === "control" ? this.control : this.overlay).add(ws);
        if (role === "stage") this.stageClients.add(ws);
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
      this.stageClients.delete(ws);
    });
    ws.on("error", () => {
      this.control.delete(ws);
      this.overlay.delete(ws);
      this.stageClients.delete(ws);
    });
  }

  private roleForAuth(msg: Record<string, unknown>): Role | null {
    if (msg.type !== "auth" || typeof msg.token !== "string") return null;
    if (msg.token === this.connectionToken) return "control";
    if (msg.token === this.stageToken) return "stage";
    if (msg.token === this.obsToken) return "view";
    return null;
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
      send(ws, { type: "host:hotkeys", ...this.bridge.hostHotkeys() });
    } else {
      for (const desc of this.bridge.overlayHydration()) send(ws, { type: "overlay:declared", ...desc });
      for (const ins of this.bridge.inspectorHydration()) send(ws, { type: "overlay:inspector", ...ins });
      send(ws, { type: "plugin:list", plugins: this.bridge.pluginListForStage() });
      send(ws, { type: "host:hotkeys", ...this.bridge.hostHotkeys() });
      for (const n of this.bridge.notificationHydration()) send(ws, { type: "stage:notify", notification: n });
      const audio = this.bridge.audioHydration();
      send(ws, { type: "audio:master", ...audio.master });
      if (audio.preload.length) send(ws, { type: "audio:preload", urls: audio.preload });
      const hs = this.bridge.hostState();
      send(ws, { type: "host:state_changed", state: hs.state, calib_stage: hs.calib_stage });
    }
  }

  private async dispatch(ws: WebSocket, role: Role, msg: Record<string, unknown>): Promise<void> {
    if (msg.type === "heartbeat") {
      send(ws, { type: "heartbeat_ack" });
      return;
    }
    if (role === "stage" &&msg.type === "overlay:transform") {
      const overlayId = String(msg.overlayId ?? "");
      const rect = (msg.rect as Record<string, number>) ?? {};
      if (overlayId) this.bridge.onOverlayTransform(overlayId, rect);
      return;
    }
    if (role === "stage" &&msg.type === "overlay:action") {
      const overlayId = String(msg.overlayId ?? "");
      const action = String(msg.action ?? "");
      if (overlayId && action) this.bridge.onOverlayAction(overlayId, action, msg.payload);
      return;
    }
    if (role === "stage" &&msg.type === "inspector:set") {
      const overlayId = String(msg.overlayId ?? "");
      const controlId = String(msg.controlId ?? "");
      const phase = msg.phase === "live" ? "live" : "commit";
      if (overlayId && controlId) this.bridge.onInspectorSet(overlayId, controlId, msg.value, phase);
      return;
    }
    if (role === "stage" &&msg.type === "inspector:action") {
      const overlayId = String(msg.overlayId ?? "");
      const controlId = String(msg.controlId ?? "");
      if (overlayId && controlId) this.bridge.onInspectorAction(overlayId, controlId, msg.payload);
      return;
    }
    if (role === "stage" &&msg.type === "stage:dismiss") {
      const id = String(msg.id ?? "");
      if (id) this.bridge.onStageNotificationDismissed(id);
      return;
    }
    if (role === "stage" &&msg.type === "host:request") {
      this.bridge.onHostRequest(String(msg.state ?? ""));
      return;
    }
    if (role === "stage" && msg.type === "permissions:review") {
      const pluginId = String(msg.pluginId ?? "");
      const scope = String(msg.scope ?? "");
      if (pluginId && scope) this.bridge.onPermissionReview(pluginId, scope);
      return;
    }
    if (role === "control" && msg.jsonrpc === "2.0") await this.dispatchRpc(ws, msg);
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
        case "config.action":
          result = this.bridge.rpcConfigAction(params);
          break;
        case "audio.setMaster":
          result = this.bridge.rpcAudioSetMaster(params);
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

  /** A stage window is connected; OBS views don't count. */
  hasOverlayClient(): boolean {
    return this.stageClients.size > 0;
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
