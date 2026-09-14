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
import { DEV_PLUGINS_SRC, isDevPlugin } from "../utils/paths.js";
import type { WsServer } from "../server/WsServer.js";
import type { PluginConfig } from "./config.js";
import type {
  OverlayDeclaration,
  OverlayHandle,
  OverlayManager,
  Rect,
  Size,
} from "../sdk/overlay.js";
import {
  coerceValue,
  controlKeys,
  indexControls,
  isValueControl,
  type InputPhase,
  type InspectorControl,
  type InspectorSection,
  type OverlayInspector,
} from "../sdk/inspector.js";

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
  interactive: boolean;
}

/**
 * Coerce an inbound rect into a valid one, merging over the overlay's current
 * rect. The stage is an untrusted-ish input path: a NaN slipping through here
 * would be written straight to a plugin's config file and poison it.
 *
 * Merging (rather than defaulting) matters because plugins reposition overlays
 * with a bare `{x,y,w,h}` - `savedRect` helpers typically reconstruct only
 * those four. Defaulting the absent fields would silently wipe the rotation and
 * opacity the user set during calibration. A plugin that genuinely wants to
 * reset either one passes it explicitly (`rot: 0` / `opacity: 1`).
 */
function sanitizeRect(rect: Partial<Rect>, d: { size: { w: number; h: number }; rect?: Rect }): Rect {
  const num = (v: unknown, fallback: number): number =>
    typeof v === "number" && Number.isFinite(v) ? v : fallback;
  const prev = d.rect;
  const r: Rect = {
    x: num(rect.x, num(prev?.x, 0)),
    y: num(rect.y, num(prev?.y, 0)),
    w: Math.max(1, num(rect.w, num(prev?.w, d.size.w))),
    h: Math.max(1, num(rect.h, num(prev?.h, d.size.h))),
  };
  const rot = num(rect.rot, num(prev?.rot, 0));
  if (rot !== 0) r.rot = ((rot % 360) + 360) % 360;
  const opacity = num(rect.opacity, num(prev?.opacity, 1));
  if (opacity !== 1) r.opacity = Math.min(1, Math.max(0, opacity));
  return r;
}

interface PluginReg {
  pluginId: string;
  assetsRoot: string;
  packageRoot: string;
  config: PluginConfig;
}

interface InspectorReg {
  sections: InspectorSection[];
  byId: Map<string, InspectorControl>;
  /** Values for controls with no config key - stage-side state, not persisted. */
  transient: Map<string, unknown>;
  /** Config keys already watched, so a re-declare doesn't stack watchers. */
  watched: Set<string>;
  rev: number;
  onInput?: (controlId: string, value: unknown, phase: InputPhase) => void;
  onAction?: (controlId: string, payload?: unknown) => void;
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
  /** Per-overlay inspector schema + transient state. */
  private inspectors = new Map<string, InspectorReg>();
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

  /** Drop a re-declared overlay's stale inspector schema (hot reload). */
  private resetInspector(overlayId: string): void {
    this.inspectors.delete(overlayId);
  }

  // --- WsServer bridge hooks ----------------------------------------------

  resolveAsset(pluginId: string, relPath: string): string | null {
    const reg = this.plugins.get(pluginId);
    if (!reg) return null;
    // Dev override: read live sources from `plugins-src/<id>`
    const dev = this.resolveDevAsset(pluginId, relPath);
    if (dev) return dev;
    const fromAssets = path.join(reg.assetsRoot, relPath);
    if (fs.existsSync(fromAssets)) return fromAssets;
    return path.join(reg.packageRoot, relPath);
  }

  /**
   * Same `assets/` -then-root lookup order as the packed tree, rooted at the
   * plugin's source dir. Returns null unless the plugin is opted into dev mode
   * and the file actually exists there.
   */
  private resolveDevAsset(pluginId: string, relPath: string): string | null {
    if (!isDevPlugin(pluginId)) return null;
    const srcRoot = path.join(DEV_PLUGINS_SRC, pluginId);
    for (const candidate of [path.join(srcRoot, "assets", relPath), path.join(srcRoot, relPath)]) {
      // Containment check: `relPath` arrives from an HTTP path, and a symlink
      // or odd separator could still walk out of the source dir.
      const resolved = path.resolve(candidate);
      if (resolved !== srcRoot && !resolved.startsWith(srcRoot + path.sep)) continue;
      if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) return resolved;
    }
    return null;
  }

  overlayHydration(): Array<Record<string, unknown>> {
    return [...this.descriptors.values()].map((d) => this.declaredPayload(d));
  }

  /** Inspector payloads for a newly-connected stage client. */
  inspectorHydration(): Array<Record<string, unknown>> {
    const out: Array<Record<string, unknown>> = [];
    for (const [overlayId, reg] of this.inspectors) {
      out.push(this.inspectorPayload(overlayId, reg));
    }
    return out;
  }

  /**
   * Apply a control change from the stage. `live` keeps the write in memory so a
   * slider drag doesn't rewrite the config file every frame; `commit` persists.
   */
  onInspectorSet(overlayId: string, controlId: string, value: unknown, phase: InputPhase): void {
    const reg = this.inspectors.get(overlayId);
    const control = reg?.byId.get(controlId);
    // Unknown control => the stage is out of date, or writing a key it was never
    // offered. Either way it does not get to touch the config.
    if (!reg || !control || !isValueControl(control)) return;

    const coerced = coerceValue(control, value);
    if (!coerced.ok) {
      logger.debug(`inspector:set rejected ${overlayId}/${controlId} (bad value)`);
      return;
    }
    const v = coerced.value;

    const [keyA, keyB] = controlKeys(control);
    if (keyA) {
      const desc = this.descriptors.get(overlayId);
      const cfg = desc ? this.plugins.get(desc.pluginId)?.config : undefined;
      if (cfg) {
        if (control.type === "vec2" && keyB) {
          const pair = v as { x: number; y: number };
          this.writeKey(cfg, keyA, pair.x, phase);
          this.writeKey(cfg, keyB, pair.y, phase);
        } else {
          this.writeKey(cfg, keyA, v, phase);
        }
      }
    } else {
      reg.transient.set(controlId, v);
    }

    try {
      reg.onInput?.(controlId, v, phase);
    } catch (e) {
      logger.exception(`inspector onInput handler for ${overlayId} raised`, e);
    }
    // Echo so other stage clients (a second monitor, the OBS view) follow along.
    this.server.broadcastOverlay({
      type: "inspector:values",
      overlayId,
      values: { [controlId]: v },
      phase,
    });
  }

  onInspectorAction(overlayId: string, controlId: string, payload?: unknown): void {
    const reg = this.inspectors.get(overlayId);
    if (!reg?.byId.has(controlId)) return;
    try {
      if (reg.onAction) {
        reg.onAction(controlId, payload);
      } else {
        // Sections shared with ctx.config.schema() keep one handler, on the config.
        const desc = this.descriptors.get(overlayId);
        const cfg = desc ? this.plugins.get(desc.pluginId)?.config : undefined;
        cfg?.runAction(controlId, payload);
      }
    } catch (e) {
      logger.exception(`inspector onAction handler for ${overlayId} raised`, e);
    }
  }

  private writeKey(cfg: PluginConfig, key: string, value: unknown, phase: InputPhase): void {
    if (phase === "commit") cfg.set(key, value);
    else cfg.setLive(key, value);
  }

  onOverlayTransform(overlayId: string, rect: Partial<Rect>): void {
    const d = this.descriptors.get(overlayId);
    if (!d) return;
    // Echo the sanitized result back to every stage client, including the
    // sender: the descriptor is the single source of truth, and a client that
    // only mutated its own local copy would drift from what got persisted.
    this.setRect(d, rect as Rect);
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
      interactive: decl.interactive ?? false,
    };
    this.descriptors.set(overlayId, desc);
    this.resetInspector(overlayId);
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
    const r = sanitizeRect(rect, desc);
    desc.rect = r;
    this.persistRect(desc, r);
    this.server.broadcastOverlay({ type: "overlay:transform", overlayId: desc.overlayId, rect: r });
  }

  /** The declared size, changed after the fact; late-joining stages get it via `overlay:declared`. */
  setSize(desc: Descriptor, size: Size): void {
    const w = Math.round(Number(size.w));
    const h = Math.round(Number(size.h));
    if (!Number.isFinite(w) || !Number.isFinite(h) || w < 1 || h < 1) return;
    if (desc.size.w === w && desc.size.h === h) return;
    desc.size = { w, h };
    this.server.broadcastOverlay({ type: "overlay:size", overlayId: desc.overlayId, size: desc.size });
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
    this.inspectors.delete(overlayId);
    this.server.broadcastOverlay({ type: "overlay:removed", overlayId });
  }

  /** Overlay ids owned by a plugin, for the stage's plugin list. */
  overlayIdsFor(pluginId: string): string[] {
    return [...this.descriptors.values()].filter((d) => d.pluginId === pluginId).map((d) => d.overlayId);
  }

  onAction(overlayId: string, cb: (action: string, payload?: unknown) => void): void {
    this.actionHandlers.set(overlayId, cb);
  }

  // --- inspector -----------------------------------------------------------

  private inspectorReg(overlayId: string): InspectorReg {
    let reg = this.inspectors.get(overlayId);
    if (!reg) {
      reg = { sections: [], byId: new Map(), transient: new Map(), watched: new Set(), rev: 0 };
      this.inspectors.set(overlayId, reg);
    }
    return reg;
  }

  setInspectorSections(overlayId: string, sections: InspectorSection[]): void {
    const reg = this.inspectorReg(overlayId);
    reg.sections = sections;
    reg.byId = indexControls(sections);
    reg.rev += 1;
    this.watchInspectorKeys(overlayId, reg);
    this.server.broadcastOverlay({ type: "overlay:inspector", ...this.inspectorPayload(overlayId, reg) });
  }

  patchInspectorControl(overlayId: string, controlId: string, patch: Record<string, unknown>): void {
    const reg = this.inspectors.get(overlayId);
    const control = reg?.byId.get(controlId);
    if (!reg || !control) return;
    Object.assign(control, patch);
    reg.rev += 1;
    this.watchInspectorKeys(overlayId, reg);
    this.server.broadcastOverlay({ type: "overlay:inspector", ...this.inspectorPayload(overlayId, reg) });
  }

  onInspectorInput(overlayId: string, cb: (id: string, value: unknown, phase: InputPhase) => void): void {
    this.inspectorReg(overlayId).onInput = cb;
  }

  onInspectorActionHandler(overlayId: string, cb: (id: string, payload?: unknown) => void): void {
    this.inspectorReg(overlayId).onAction = cb;
  }

  inspectorValues(overlayId: string): Record<string, unknown> {
    const reg = this.inspectors.get(overlayId);
    if (!reg) return {};
    const desc = this.descriptors.get(overlayId);
    const cfg = desc ? this.plugins.get(desc.pluginId)?.config : undefined;
    const out: Record<string, unknown> = {};
    for (const [id, control] of reg.byId) {
      if (!isValueControl(control)) continue;
      const [keyA, keyB] = controlKeys(control);
      if (!keyA) {
        if (reg.transient.has(id)) out[id] = reg.transient.get(id);
        continue;
      }
      if (!cfg) continue;
      if (control.type === "vec2" && keyB) {
        out[id] = { x: cfg.get(keyA, 0), y: cfg.get(keyB, 0) };
      } else {
        const v = cfg.get<unknown>(keyA, undefined);
        if (v !== undefined) out[id] = v;
      }
    }
    return out;
  }

  /**
   * Mirror config changes (App panel, a plugin writing its own key, a file edit)
   * into the stage, so both config surfaces show the same value.
   */
  private watchInspectorKeys(overlayId: string, reg: InspectorReg): void {
    const desc = this.descriptors.get(overlayId);
    const cfg = desc ? this.plugins.get(desc.pluginId)?.config : undefined;
    if (!cfg) return;
    for (const control of reg.byId.values()) {
      for (const key of controlKeys(control)) {
        if (reg.watched.has(key)) continue;
        reg.watched.add(key);
        // Pushes the whole value map rather than this key's control: a later
        // re-declare can rebind the key to a different control id.
        cfg.watch(key, () => {
          this.server.broadcastOverlay({
            type: "inspector:values",
            overlayId,
            values: this.inspectorValues(overlayId),
            phase: "commit",
          });
        });
      }
    }
  }

  private inspectorPayload(overlayId: string, reg: InspectorReg): Record<string, unknown> {
    return {
      overlayId,
      rev: reg.rev,
      sections: reg.sections,
      values: this.inspectorValues(overlayId),
    };
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
      interactive: d.interactive,
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

class ScopedInspector implements OverlayInspector {
  constructor(
    private hub: OverlayHub,
    private overlayId: string,
  ) {}

  sections(list: InspectorSection[]): void {
    this.hub.setInspectorSections(this.overlayId, list);
  }
  patch(controlId: string, patch: Record<string, unknown>): void {
    this.hub.patchInspectorControl(this.overlayId, controlId, patch);
  }
  values(): Record<string, unknown> {
    return this.hub.inspectorValues(this.overlayId);
  }
  onInput(cb: (controlId: string, value: unknown, phase: InputPhase) => void): void {
    this.hub.onInspectorInput(this.overlayId, cb);
  }
  onAction(cb: (controlId: string, payload?: unknown) => void): void {
    this.hub.onInspectorActionHandler(this.overlayId, cb);
  }
}

class OverlayHandleImpl implements OverlayHandle {
  readonly id: string;
  readonly inspector: OverlayInspector;
  constructor(
    private hub: OverlayHub,
    private desc: Descriptor,
  ) {
    this.id = desc.overlayId;
    this.inspector = new ScopedInspector(hub, desc.overlayId);
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
  setSize(size: Size): void {
    this.hub.setSize(this.desc, size);
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
