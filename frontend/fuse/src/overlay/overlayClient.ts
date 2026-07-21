/**
 * Overlay-stage WebSocket client + reactive store.
 *
 * Connects to the runtime's `/ws` with `role:"overlay"`, receives the overlay
 * descriptor set and `overlay:data` streams, and exposes them reactively to the
 * stage components. Live per-overlay input frames are delivered via a mitt bus
 * (keyed `data:<overlayId>`) so a single overlay updates without re-rendering
 * the whole stage. Drag results are sent back as `overlay:transform`.
 *
 * Connection params (port/token) come from `window.__FUSE_OVERLAY__` (injected
 * by the Electron overlay-window preload) or, in dev, from the URL query string.
 */
import { reactive, ref } from "vue";
import mitt from "mitt";
import type { OverlayInput } from "./rive";
import type { HostState, OverlayDescriptor, OverlayRect } from "./types";

type DataEvents = Record<string, Record<string, OverlayInput>>;
export const overlayBus = mitt<DataEvents>();

export const overlays = reactive(new Map<string, OverlayDescriptor>());
export const hostState = ref<HostState>("locked");
export const connected = ref(false);
/**
 * Region of the virtual desktop this client renders, when broadcasting a single
 * display to OBS. Overlay rects are in virtual-desktop coordinates, so the stage
 * shifts by -x/-y to bring the chosen monitor's region into view. Null in the
 * Electron stage window, which already spans the whole virtual desktop.
 */
export const viewport = ref<{ x: number; y: number; w: number; h: number } | null>(null);
/** True while an overlay is being dragged (suppresses hover click-through toggling). */
export const dragging = ref(false);

type IpcSend = { ipcRenderer?: { send(ch: string, ...a: unknown[]): void } };

/** Ask Electron main to make the stage window click-through (true) or interactive (false). */
export function setWindowIgnore(ignore: boolean): void {
  (window as unknown as IpcSend).ipcRenderer?.send("overlay:set-ignore", ignore);
}


export function setWindowFocusable(focusable: boolean): void {
  (window as unknown as IpcSend).ipcRenderer?.send("overlay:set-focusable", focusable);
}

let ws: WebSocket | null = null;
let base = "";

interface FuseOverlayParams {
  port: number;
  token: string;
}

function resolveParams(): FuseOverlayParams | null {
  const injected = (window as unknown as { __FUSE_OVERLAY__?: FuseOverlayParams }).__FUSE_OVERLAY__;
  if (injected?.port && injected?.token) return injected;
  const q = new URLSearchParams(location.search);
  const port = Number(q.get("port"));
  const token = q.get("token");
  if (port && token) return { port, token };
  return null;
}

/** Absolute base (e.g. "http://127.0.0.1:PORT") for fetching overlay assets. */
export function assetBase(): string {
  return base ? `http://${base}` : "";
}

const RECONNECT_MS = 1000;

/**
 * Fetch live params from the OBS server. The port/token change on every runtime
 * restart, so a page served under a stable URL (and cached by OBS indefinitely)
 * must re-read them per attempt rather than trust anything baked in at load.
 */
async function fetchParams(url: string): Promise<FuseOverlayParams | null> {
  try {
    // Forward this page's ?display= so the server resolves the matching viewport.
    // Built via URL so it works whether `url` is relative (prod, injected) or
    // absolute with its own query (dev, passed as ?paramsUrl=).
    const sel = new URLSearchParams(location.search).get("display");
    const target = new URL(url, location.href);
    if (sel) target.searchParams.set("display", sel);
    const res = await fetch(target.toString(), { cache: "no-store" });
    if (!res.ok) return null;
    const j = (await res.json()) as {
      running?: boolean;
      port?: number;
      token?: string;
      viewport?: { x: number; y: number; w: number; h: number };
    };
    // Applied even while the runtime is down so the stage is already framed on
    // the right monitor when overlays arrive.
    if (j.viewport) viewport.value = j.viewport;
    if (!j.running || !j.port || !j.token) return null;
    return { port: Number(j.port), token: String(j.token) };
  } catch {
    return null;
  }
}

export function connectOverlay(): void {
  // OBS browser-source mode: params come from the server, fresh on every attempt.
  // Injected when this server serves the page (prod); passed as a query param
  // when Vite serves it (dev).
  const paramsUrl =
    (window as unknown as { __FUSE_OVERLAY_PARAMS_URL__?: string }).__FUSE_OVERLAY_PARAMS_URL__ ??
    new URLSearchParams(location.search).get("paramsUrl");
  if (typeof paramsUrl === "string") {
    void fetchParams(paramsUrl).then((p) => {
      // FUSE not running yet (or still booting) - keep polling until it is.
      if (!p) setTimeout(connectOverlay, RECONNECT_MS);
      else openSocket(p);
    });
    return;
  }

  const params = resolveParams();
  if (!params) {
    console.error("[overlay] no connection params (window.__FUSE_OVERLAY__ or ?port&token)");
    return;
  }
  openSocket(params);
}

function openSocket(params: FuseOverlayParams): void {
  base = `127.0.0.1:${params.port}`;
  ws = new WebSocket(`ws://${base}/ws`);
  ws.onopen = () => ws!.send(JSON.stringify({ type: "auth", token: params.token, role: "overlay" }));
  ws.onclose = () => {
    connected.value = false;
    // Drop descriptors from the dead session; the next auth re-hydrates them.
    // Without this a reconnect to a restarted runtime leaves ghost overlays.
    overlays.clear();
    setTimeout(connectOverlay, RECONNECT_MS); // simple auto-reconnect
  };
  ws.onmessage = (ev) => handle(JSON.parse(ev.data));
}

function handle(m: Record<string, unknown>): void {
  switch (m.type) {
    case "auth:ok":
      connected.value = true;
      break;
    case "overlay:declared": {
      const d = m as unknown as OverlayDescriptor;
      overlays.set(d.overlayId, { ...d, inputs: d.inputs ?? {} });
      break;
    }
    case "overlay:data": {
      const id = String(m.overlayId);
      overlayBus.emit(id, (m.inputs as Record<string, OverlayInput>) ?? {});
      break;
    }
    case "overlay:visibility": {
      const d = overlays.get(String(m.overlayId));
      if (d) d.visible = Boolean(m.visible);
      break;
    }
    case "overlay:transform": {
      const d = overlays.get(String(m.overlayId));
      if (d) d.rect = m.rect as OverlayRect;
      break;
    }
    case "overlay:removed":
      overlays.delete(String(m.overlayId));
      break;
    case "host:state_changed": {
      hostState.value =
        m.state === "calibrate" ? "calibrate" : m.state === "interactive" ? "interactive" : "locked";
      // Locked => fully click-through. Calibrate/interactive => start
      // click-through; the hover hit-test (StageApp) enables interaction only
      // over an overlay or the editor UI. Both states need a focusable window:
      // interactive for overlay text input, calibrate for the inspector fields.
      setWindowIgnore(true);
      setWindowFocusable(hostState.value === "interactive" || hostState.value === "calibrate");
      break;
    }
  }
}

/** Persist a dragged/resized overlay rect back to the runtime. */
export function sendTransform(overlayId: string, rect: OverlayRect): void {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "overlay:transform", overlayId, rect }));
  }
}

/** Emit an interactive-overlay action (button/input) back to the owning plugin. */
export function sendAction(overlayId: string, action: string, payload?: unknown): void {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "overlay:action", overlayId, action, payload }));
  }
}
