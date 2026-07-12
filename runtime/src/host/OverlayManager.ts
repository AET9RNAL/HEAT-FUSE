/**
 * Host-side overlay hub - the concrete implementation behind the SDK
 * `OverlayManager` / `OverlayHandle` interfaces.
 *
 * Plugins declare overlays and push view-model state; the hub keeps the
 * authoritative dsescriptor set, coalesces per-overlay input updates into one
 * `overlay:data` message per flush, serves `.riv` assets over HTTP, and
 * persists dragged positions back into the owning plugin's config.
 */
import fs from "node:fs";
import path from "node:path";
import { logger } from "../log.js";
import type { WsServer } from "../server/WsServer.js";
import type { PluginConfig } from "./config.js";
import type {
  OverlayDeclaration,
  OverlayHandle,
  OverlayManager,
  Rect,
} from "../sdk/overlay.js";

type InputType = "number" | "bool" | "string" | "color" | "enum" | "trigger" | "json";
interface InputValue {
  t: InputType;
  v: unknown;
}

interface Descriptor {
  overlayId: string; // "<pluginId>:<localId>"
  pluginId: string;
  kind: string;
  asset: string;
  assetUrl: string;
  size: { w: number; h: number };
  artboard?: string;
  stateMachine?: string;
  viewModel?: string;
  rect?: Rect;
  visible: boolean;
  positionConfigKey?: string;
}

interface PluginReg {
  pluginId: string;
  assetsRoot: string;
  packageRoot: string;
  config: PluginConfig;
}

export class OverlayHub {
  private server: WsServer;
  private plugins = new Map<string, PluginReg>();
  private descriptors = new Map<string, Descriptor>();
  private pending = new Map<string, Map<string, InputValue>>();
  /** Latest value per path per overlay - replayed to late-joining stage clients. */
  private lastInputs = new Map<string, Map<string, InputValue>>();
  /** Per-overlay handler for actions emitted by interactive Vue overlays. */
  private actionHandlers = new Map<string, (action: string, payload?: unknown) => void>();
  private flushScheduled = false;

  constructor(server: WsServer) {
    this.server = server;
  }

  registerPlugin(pluginId: string, assetsRoot: string, packageRoot: string, config: PluginConfig): OverlayManager {
    this.plugins.set(pluginId, { pluginId, assetsRoot, packageRoot, config });
    return new ScopedOverlayManager(this, pluginId);
  }

  removePlugin(pluginId: string): void {
    for (const [gid, d] of [...this.descriptors]) {
      if (d.pluginId === pluginId) this.removeDescriptor(gid);
    }
    this.plugins.delete(pluginId);
  }

  // --- WsServer bridge hooks ----------------------------------------------

  resolveAsset(pluginId: string, relPath: string): string | null {
    const reg = this.plugins.get(pluginId);
    if (!reg) return null;
    const fromAssets = path.join(reg.assetsRoot, relPath);
    if (fs.existsSync(fromAssets)) return fromAssets;
    return path.join(reg.packageRoot, relPath);
  }

  overlayHydration(): Array<Record<string, unknown>> {
    return [...this.descriptors.values()].map((d) => this.declaredPayload(d));
  }

  onOverlayTransform(overlayId: string, rect: Record<string, number>): void {
    const d = this.descriptors.get(overlayId);
    if (!d) return;
    const r: Rect = { x: rect.x ?? 0, y: rect.y ?? 0, w: rect.w ?? d.size.w, h: rect.h ?? d.size.h };
    d.rect = r;
    this.persistRect(d, r);
  }

  // --- internal (used by ScopedOverlayManager / handles) ------------------

  declare(pluginId: string, decl: OverlayDeclaration): OverlayHandle {
    const reg = this.plugins.get(pluginId);
    if (!reg) throw new Error(`overlay declare: plugin '${pluginId}' not registered`);
    const overlayId = `${pluginId}:${decl.id}`;

    let rect = decl.defaultRect;
    if (decl.positionConfigKey) {
      const saved = reg.config.get<Rect | undefined>(decl.positionConfigKey, undefined);
      if (saved && typeof saved === "object") rect = saved;
    }

    const desc: Descriptor = {
      overlayId,
      pluginId,
      kind: decl.kind,
      asset: decl.asset,
      assetUrl: `/overlay-asset/${pluginId}/${decl.asset}`,
      size: decl.size,
      artboard: decl.artboard,
      stateMachine: decl.stateMachine,
      viewModel: decl.viewModel,
      rect,
      visible: true,
      positionConfigKey: decl.positionConfigKey,
    };
    this.descriptors.set(overlayId, desc);
    this.server.broadcastOverlay({ type: "overlay:declared", ...this.declaredPayload(desc) });
    logger.debug(`overlay declared: ${overlayId} (${desc.kind})`);
    return new OverlayHandleImpl(this, desc);
  }

  getHandle(pluginId: string, localId: string): OverlayHandle | undefined {
    const d = this.descriptors.get(`${pluginId}:${localId}`);
    return d ? new OverlayHandleImpl(this, d) : undefined;
  }

  handlesFor(pluginId: string): OverlayHandle[] {
    return [...this.descriptors.values()]
      .filter((d) => d.pluginId === pluginId)
      .map((d) => new OverlayHandleImpl(this, d));
  }

  pushInput(overlayId: string, path_: string, value: InputValue): void {
    let m = this.pending.get(overlayId);
    if (!m) {
      m = new Map();
      this.pending.set(overlayId, m);
    }
    m.set(path_, value);
    // Retain non-trigger values so a late-joining stage hydrates correctly.
    // Triggers are momentary and are not replayed.
    if (value.t !== "trigger") {
      let last = this.lastInputs.get(overlayId);
      if (!last) {
        last = new Map();
        this.lastInputs.set(overlayId, last);
      }
      last.set(path_, value);
    }
    this.scheduleFlush();
  }

  setRect(desc: Descriptor, rect: Rect): void {
    desc.rect = rect;
    this.persistRect(desc, rect);
    this.server.broadcastOverlay({ type: "overlay:transform", overlayId: desc.overlayId, rect });
  }

  setVisible(desc: Descriptor, visible: boolean): void {
    desc.visible = visible;
    this.server.broadcastOverlay({
      type: "overlay:visibility",
      overlayId: desc.overlayId,
      visible,
    });
  }

  removeDescriptor(overlayId: string): void {
    if (!this.descriptors.delete(overlayId)) return;
    this.pending.delete(overlayId);
    this.lastInputs.delete(overlayId);
    this.actionHandlers.delete(overlayId);
    this.server.broadcastOverlay({ type: "overlay:removed", overlayId });
  }

  onAction(overlayId: string, cb: (action: string, payload?: unknown) => void): void {
    this.actionHandlers.set(overlayId, cb);
  }

  /** Route an action emitted by an interactive overlay to its plugin handler. */
  dispatchAction(overlayId: string, action: string, payload?: unknown): void {
    const cb = this.actionHandlers.get(overlayId);
    if (!cb) {
      logger.debug(`overlay:action '${action}' for ${overlayId} has no handler`);
      return;
    }
    try {
      cb(action, payload);
    } catch (e) {
      logger.exception(`overlay:action handler for ${overlayId} raised`, e);
    }
  }

  private persistRect(desc: Descriptor, rect: Rect): void {
    if (!desc.positionConfigKey) return;
    const reg = this.plugins.get(desc.pluginId);
    reg?.config.set(desc.positionConfigKey, rect);
  }

  private declaredPayload(d: Descriptor): Record<string, unknown> {
    const last = this.lastInputs.get(d.overlayId);
    const inputs: Record<string, InputValue> = {};
    if (last) for (const [k, v] of last) inputs[k] = v;
    return {
      overlayId: d.overlayId,
      pluginId: d.pluginId,
      kind: d.kind,
      assetUrl: d.assetUrl,
      size: d.size,
      artboard: d.artboard ?? null,
      stateMachine: d.stateMachine ?? null,
      viewModel: d.viewModel ?? null,
      rect: d.rect ?? null,
      visible: d.visible,
      inputs,
    };
  }

  private scheduleFlush(): void {
    if (this.flushScheduled) return;
    this.flushScheduled = true;
    setImmediate(() => this.flush());
  }

  private flush(): void {
    this.flushScheduled = false;
    for (const [overlayId, inputs] of this.pending) {
      if (!inputs.size) continue;
      const obj: Record<string, InputValue> = {};
      for (const [k, v] of inputs) obj[k] = v;
      this.server.broadcastOverlay({ type: "overlay:data", overlayId, inputs: obj });
      inputs.clear();
    }
  }

  descriptorFor(overlayId: string): Descriptor | undefined {
    return this.descriptors.get(overlayId);
  }
}

class ScopedOverlayManager implements OverlayManager {
  constructor(
    private hub: OverlayHub,
    private pluginId: string,
  ) {}

  declare(decl: OverlayDeclaration): OverlayHandle {
    return this.hub.declare(this.pluginId, decl);
  }
  get(id: string): OverlayHandle | undefined {
    return this.hub.getHandle(this.pluginId, id);
  }
  all(): OverlayHandle[] {
    return this.hub.handlesFor(this.pluginId);
  }
}

class OverlayHandleImpl implements OverlayHandle {
  readonly id: string;
  constructor(
    private hub: OverlayHub,
    private desc: Descriptor,
  ) {
    this.id = desc.overlayId;
  }

  set(path_: string, value: number): void {
    this.hub.pushInput(this.desc.overlayId, path_, { t: "number", v: value });
  }
  setBool(path_: string, value: boolean): void {
    this.hub.pushInput(this.desc.overlayId, path_, { t: "bool", v: value });
  }
  setString(path_: string, value: string): void {
    this.hub.pushInput(this.desc.overlayId, path_, { t: "string", v: value });
  }
  setColor(path_: string, argb: number): void {
    this.hub.pushInput(this.desc.overlayId, path_, { t: "color", v: argb });
  }
  setEnum(path_: string, label: string): void {
    this.hub.pushInput(this.desc.overlayId, path_, { t: "enum", v: label });
  }
  trigger(path_: string): void {
    this.hub.pushInput(this.desc.overlayId, path_, { t: "trigger", v: true });
  }
  setJson(path_: string, value: unknown): void {
    this.hub.pushInput(this.desc.overlayId, path_, { t: "json", v: value });
  }
  setRect(rect: Rect): void {
    this.hub.setRect(this.desc, rect);
  }
  setPositionConfigKey(key: string): void {
    this.desc.positionConfigKey = key;
  }
  setVisible(visible: boolean): void {
    this.hub.setVisible(this.desc, visible);
  }
  onAction(cb: (action: string, payload?: unknown) => void): void {
    this.hub.onAction(this.desc.overlayId, cb);
  }
  remove(): void {
    this.hub.removeDescriptor(this.desc.overlayId);
  }
}
