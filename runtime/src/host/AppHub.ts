/**
 * Host-side app hub: the apps of the enabled plugins, their windows on the stage, the
 * taskbar and console state, the launch hotkeys, and the lifecycle of app-only plugins.
 *
 * Window messages go to the stage and to OBS views (read-only there). Launcher, console and
 * focus messages go to the stage only. Window data is coalesced into one `window:data`
 * message per flush, and replayed to a client that connects late.
 */
import { logger } from "../log.js";
import type { WireMessage } from "../ipc/protocol.js";
import { HotkeyRegistry } from "../sdk/hotkeys.js";
import type { AppWindowCommand, AppWindowState } from "../sdk/apps.js";
import type { Rect } from "../sdk/overlay.js";
import type { HostState } from "../sdk/plugin.js";
import { MAIN_VIEW, type AppLifecycle, type AppSpec, type AppViewSpec } from "./appManifest.js";
import { PluginState, type DiscoveredPlugin } from "./types.js";

export type TaskbarEdge = "bottom" | "top" | "left" | "right";

const EDGES: readonly TaskbarEdge[] = ["bottom", "top", "left", "right"];
const COMMANDS: readonly AppWindowCommand[] = ["focus", "minimize", "maximize", "restore", "close"];
const ALIAS_RE = /^[a-z0-9-]{1,24}$/;
const GRACE_MS = 10_000;
const CASCADE_PX = 24;
const MAX_CASCADE = 20;
const MAX_TITLE = 120;

export interface AppsState {
  taskbar: { edge: TaskbarEdge; autoHide: boolean };
  pinned: string[];
  favorites: string[];
  /** The user's settings per app key. `hotkey: null` removes the manifest hotkey. */
  commands: Record<string, { alias?: string; hotkey?: string | null }>;
  usage: Record<string, { count: number; last: number }>;
  /** The last place of each view, by `<plugin>:<app>:<view>`. */
  windows: Record<string, { rect: Rect; maximized: boolean }>;
}

export function defaultAppsState(): AppsState {
  return { taskbar: { edge: "bottom", autoHide: true }, pinned: [], favorites: [], commands: {}, usage: {}, windows: {} };
}

function record(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function num(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function strings(v: unknown): string[] {
  return Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string"))] : [];
}

/** A window rect merged over the previous one. Only finite numbers pass, and the size is at least 1 x 1. */
export function sanitizeWindowRect(raw: Record<string, unknown>, prev: Rect): Rect {
  return {
    x: Math.round(num(raw.x, prev.x)),
    y: Math.round(num(raw.y, prev.y)),
    w: Math.max(1, Math.round(num(raw.w, prev.w))),
    h: Math.max(1, Math.round(num(raw.h, prev.h))),
  };
}

/** A saved state with every missing or broken field replaced by its default. */
export function normalizeAppsState(raw: unknown): AppsState {
  const out = defaultAppsState();
  const r = record(raw);
  if (!r) return out;
  const taskbar = record(r.taskbar);
  if (taskbar) {
    if (EDGES.includes(taskbar.edge as TaskbarEdge)) out.taskbar.edge = taskbar.edge as TaskbarEdge;
    if (typeof taskbar.autoHide === "boolean") out.taskbar.autoHide = taskbar.autoHide;
  }
  out.pinned = strings(r.pinned);
  out.favorites = strings(r.favorites);
  for (const [key, value] of Object.entries(record(r.commands) ?? {})) {
    const c = record(value);
    if (!c) continue;
    const entry: AppsState["commands"][string] = {};
    if (typeof c.alias === "string" && ALIAS_RE.test(c.alias)) entry.alias = c.alias;
    if (c.hotkey === null || typeof c.hotkey === "string") entry.hotkey = c.hotkey;
    if (Object.keys(entry).length) out.commands[key] = entry;
  }
  for (const [key, value] of Object.entries(record(r.usage) ?? {})) {
    const u = record(value);
    if (u) out.usage[key] = { count: Math.max(0, Math.round(num(u.count, 0))), last: num(u.last, 0) };
  }
  for (const [key, value] of Object.entries(record(r.windows) ?? {})) {
    const w = record(value);
    const rect = record(w?.rect);
    if (!w || !rect) continue;
    out.windows[key] = { rect: sanitizeWindowRect(rect, { x: 0, y: 0, w: 1, h: 1 }), maximized: w.maximized === true };
  }
  return out;
}

/** What the hub needs from the plugin host. */
export interface AppHost {
  plugins(): Iterable<DiscoveredPlugin>;
  pluginState(pluginId: string): PluginState | undefined;
  isRunning(pluginId: string): boolean;
  /** Start the plugin's process when it has none. Rejects when it cannot start. */
  ensureRunning(pluginId: string): Promise<void>;
  /** Stop the process of an app-only plugin. */
  stopApp(pluginId: string): Promise<void>;
  sendToPlugin(pluginId: string, msg: WireMessage): void;
  /** The Electron stage only: launcher, console and focus messages. */
  broadcastStage(msg: Record<string, unknown>): void;
  /** The stage and the OBS views: window messages. OBS shows the windows, read-only. */
  broadcastOverlay(msg: Record<string, unknown>): void;
  broadcastControl(msg: Record<string, unknown>): void;
  noteUserAction(pluginId: string): void;
  /** Pause or resume all hotkey dispatch while the stage records a combo. */
  setHotkeyCapture(on: boolean): void;
  notifyError(title: string, message: string): void;
  hostState(): HostState;
  consoleHotkey(): string;
  readonly hotkeys: HotkeyRegistry;
  loadState(): unknown;
  saveState(state: AppsState): void;
}

/** One plugin's view of the hub, for the calls from its process. */
export interface ScopedApps {
  setJson(windowId: string, path: string, value: unknown): void;
  setTitle(windowId: string, title: string): void;
  command(windowId: string, command: string): void;
  openView(appId: string, view: string): Promise<string>;
}

type WindowStatus = "open" | "waiting" | "crashed";

interface WindowRecord {
  id: string;
  app: AppSpec;
  view: AppViewSpec;
  title: string;
  /** Null until the stage places the window. */
  rect: Rect | null;
  maximized: boolean;
  minimized: boolean;
  /** open: the plugin has the window. waiting: its process restarts. crashed: its process exited. */
  status: WindowStatus;
  /** The last value of each data path, for a stage that connects late. */
  inputs: Map<string, unknown>;
}

interface LaunchOptions {
  view?: string;
  newWindow?: boolean;
  /** A user action: counts as a use of the app. */
  user?: boolean;
}

function ownerId(appKey: string): string {
  return `app:${appKey}`;
}

function viewKeyOf(w: { app: AppSpec; view: AppViewSpec }): string {
  return `${w.app.key}:${w.view.key}`;
}

function assetUrl(pluginId: string, rel: string): string {
  return `/overlay-asset/${pluginId}/${rel}`;
}

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export class AppHub {
  private apps = new Map<string, AppSpec>();
  private lifecycles = new Map<string, AppLifecycle>();
  private pluginNames = new Map<string, string>();
  private windows = new Map<string, WindowRecord>();
  /** Window ids, bottom to top. */
  private order: string[] = [];
  private activeId: string | null = null;
  private pending = new Map<string, Map<string, unknown>>();
  private flushScheduled = false;
  private stopTimers = new Map<string, NodeJS.Timeout>();
  private starting = new Map<string, Promise<void>>();
  private boundHotkeys = new Set<string>();
  private hotkeyConflicts = new Map<string, string>();
  private consoleOpen = false;
  private seq = 0;
  private state: AppsState;

  constructor(
    private readonly host: AppHost,
    private readonly graceMs = GRACE_MS,
  ) {
    this.state = normalizeAppsState(host.loadState());
  }

  // --- registry -----------------------------------------------------------

  /** Rebuild the app list from the plugins that are on. Call after discovery and each state change. */
  sync(): void {
    const next = new Map<string, AppSpec>();
    this.lifecycles.clear();
    this.pluginNames.clear();
    for (const spec of this.host.plugins()) {
      this.pluginNames.set(spec.pluginId, spec.name);
      this.lifecycles.set(spec.pluginId, spec.lifecycle);
      const s = this.host.pluginState(spec.pluginId);
      if (s === PluginState.DISABLED || s === PluginState.SKIPPED) continue;
      for (const app of spec.apps) next.set(app.key, app);
    }
    this.apps = next;
    for (const w of [...this.windows.values()]) {
      const app = next.get(w.app.key);
      const view = app?.views[w.view.key];
      if (!app || !view) {
        this.closeWindow(w.id, false);
        continue;
      }
      w.app = app;
      w.view = view;
    }
    this.bindLaunchHotkeys();
    this.broadcastList();
  }

  windowCount(pluginId: string): number {
    let n = 0;
    for (const w of this.windows.values()) if (w.app.pluginId === pluginId) n += 1;
    return n;
  }

  // --- stage and App ------------------------------------------------------

  /** Messages for a newly connected client: the windows, and for the stage also the launcher and the app list. */
  hydration(stage: boolean): Array<Record<string, unknown>> {
    const opened = this.order.map((id) => ({ type: "window:opened", ...this.openedPayload(this.windows.get(id)!, false) }));
    if (!stage) return opened;
    return [{ type: "launcher:settings", ...this.launcherSettings() }, { type: "app:list", apps: this.listPayload() }, ...opened];
  }

  onStageMessage(msg: Record<string, unknown>): void {
    const appKey = String(msg.appKey ?? "");
    const windowId = String(msg.windowId ?? "");
    switch (msg.type) {
      case "app:launch":
        this.userLaunch(appKey, { view: typeof msg.view === "string" ? msg.view : undefined, newWindow: msg.newWindow === true });
        return;
      case "app:favorite":
        this.setFavorite(appKey, msg.favorite === true, typeof msg.index === "number" ? msg.index : undefined);
        return;
      case "app:pin":
        this.setPinned(appKey, msg.pinned === true);
        return;
      case "app:configure":
        this.host.broadcastStage({ type: "app:configure_result", appKey, ...this.configure(appKey, msg) });
        return;
      case "app:quit":
        this.quit(appKey);
        return;
      case "app:open_settings": {
        const spec = this.apps.get(appKey);
        if (spec) this.host.broadcastControl({ type: "app:open_settings", appKey, pluginId: spec.pluginId });
        return;
      }
      case "console:closed":
        this.consoleOpen = false;
        return;
      case "console:toggle":
        // The Start button: the same state as the console hotkey.
        this.toggleConsole();
        return;
      case "hotkeys:capture":
        this.host.setHotkeyCapture(msg.on === true);
        return;
      case "window:command": {
        const command = String(msg.command ?? "");
        if (command === "restart") void this.restart(windowId);
        else if ((COMMANDS as readonly string[]).includes(command)) this.command(windowId, command as AppWindowCommand);
        return;
      }
      case "window:rect":
        this.setRect(windowId, record(msg.rect));
        return;
      case "window:action": {
        const w = this.windows.get(windowId);
        const action = String(msg.action ?? "");
        if (!w || !action || w.status !== "open") return;
        if (!action.startsWith("report:")) this.host.noteUserAction(w.app.pluginId);
        this.host.sendToPlugin(w.app.pluginId, { t: "apps.action", windowId, action, payload: msg.payload });
        return;
      }
    }
  }

  async rpc(method: string, params: Record<string, unknown>): Promise<Record<string, unknown>> {
    const appKey = String(params.appKey ?? "");
    switch (method) {
      case "app.list":
        return { apps: this.listPayload(), launcher: this.launcherSettings() };
      case "app.launch":
        try {
          const view = typeof params.view === "string" ? params.view : undefined;
          return { ok: true, windowId: await this.launch(appKey, { view, newWindow: params.newWindow === true, user: true }) };
        } catch (e) {
          return { ok: false, error: errorText(e) };
        }
      case "app.configure":
        return this.configure(appKey, params);
      case "app.favorite":
        return { ok: this.setFavorite(appKey, params.favorite === true, typeof params.index === "number" ? params.index : undefined) };
      case "app.pin":
        return { ok: this.setPinned(appKey, params.pinned === true) };
      case "launcher.settings":
        this.setLauncher(params);
        return { ok: true, ...this.launcherSettings() };
    }
    throw new Error(`Method not found: ${method}`);
  }

  launcherSettings(): { edge: TaskbarEdge; autoHide: boolean; consoleHotkey: string } {
    return { ...this.state.taskbar, consoleHotkey: this.host.consoleHotkey() };
  }

  /** The console hotkey. Calibrate state ignores it. */
  toggleConsole(): void {
    if (this.host.hostState() === "calibrate") return;
    this.consoleOpen = !this.consoleOpen;
    this.host.broadcastStage({ type: this.consoleOpen ? "console:open" : "console:close" });
  }

  broadcastLauncher(): void {
    const msg = { type: "launcher:settings", ...this.launcherSettings() };
    this.host.broadcastStage(msg);
    this.host.broadcastControl(msg);
  }

  // --- launch and windows -------------------------------------------------

  /** Opens a window, or focuses the open one of a single-instance app. Resolves with the window id. */
  async launch(appKey: string, opts: LaunchOptions = {}): Promise<string> {
    const app = this.apps.get(appKey);
    if (!app) throw new Error(`there is no app '${appKey}'`);
    const viewKey = opts.view || MAIN_VIEW;
    if (!app.views[viewKey]) throw new Error(`app '${appKey}' has no view '${viewKey}'`);
    if (opts.user) {
      this.countUse(appKey);
      this.host.noteUserAction(app.pluginId);
    }
    const reuse = !(opts.newWindow && app.instances === "multi");
    const open = reuse ? this.topWindowOf(appKey, viewKey) : undefined;
    if (open) {
      this.command(open, "focus");
      return open;
    }
    this.cancelStop(app.pluginId);
    await this.startPlugin(app.pluginId);
    // The plugin can go off while it starts, and a second launch can open the window first.
    const current = this.apps.get(appKey);
    const view = current?.views[viewKey];
    if (!current || !view) throw new Error(`app '${appKey}' is not available`);
    const opened = reuse ? this.topWindowOf(appKey, viewKey) : undefined;
    if (opened) {
      this.command(opened, "focus");
      return opened;
    }
    const w = this.createWindow(current, view);
    this.host.sendToPlugin(current.pluginId, { t: "apps.open", ...this.pluginWindow(w) });
    return w.id;
  }

  command(windowId: string, command: AppWindowCommand): void {
    const w = this.windows.get(windowId);
    if (!w) return;
    switch (command) {
      case "focus":
        this.focus(w);
        return;
      case "minimize": {
        if (w.minimized) return;
        w.minimized = true;
        const wasActive = this.activeId === w.id;
        if (wasActive) this.activeId = this.topVisible();
        this.broadcastState(w);
        if (wasActive && this.activeId) this.broadcastState(this.windows.get(this.activeId)!);
        return;
      }
      case "maximize":
        if (w.maximized) return;
        w.maximized = true;
        this.saveView(w);
        this.broadcastState(w);
        return;
      case "restore":
        if (w.minimized) {
          this.focus(w);
          return;
        }
        if (!w.maximized) return;
        w.maximized = false;
        this.saveView(w);
        this.broadcastState(w);
        return;
      case "close":
        this.closeWindow(w.id, true);
        return;
    }
  }

  /** Closes every window of an app. An app-only plugin stops at once when none is left. */
  quit(appKey: string): void {
    const app = this.apps.get(appKey);
    if (!app) return;
    for (const id of [...this.order]) if (this.windows.get(id)?.app.key === appKey) this.closeWindow(id, true);
    if (this.lifecycles.get(app.pluginId) === "app" && !this.windowCount(app.pluginId)) this.stopNow(app.pluginId);
  }

  /** The scoped API for one plugin's process. */
  scoped(pluginId: string): ScopedApps {
    const own = (windowId: string): WindowRecord | undefined => {
      const w = this.windows.get(windowId);
      return w && w.app.pluginId === pluginId ? w : undefined;
    };
    return {
      setJson: (windowId, path, value) => {
        const w = own(windowId);
        if (w && path) this.pushData(w, path, value);
      },
      setTitle: (windowId, title) => {
        const w = own(windowId);
        if (!w) return;
        w.title = String(title ?? "").trim().slice(0, MAX_TITLE) || (w.view.title ?? w.app.name);
        this.broadcastState(w, false);
      },
      command: (windowId, command) => {
        if (own(windowId) && (COMMANDS as readonly string[]).includes(command)) this.command(windowId, command as AppWindowCommand);
      },
      openView: (appId, view) => this.launch(`${pluginId}:${appId}`, { view: view || MAIN_VIEW }),
    };
  }

  // --- plugin process events ---------------------------------------------

  /** The process is up and its `setup()` ran: the open windows go to it again. */
  onPluginStarted(pluginId: string): void {
    for (const id of this.order) {
      const w = this.windows.get(id)!;
      if (w.app.pluginId !== pluginId) continue;
      w.status = "open";
      this.host.sendToPlugin(pluginId, { t: "apps.open", ...this.pluginWindow(w) });
      this.broadcastState(w, false);
    }
    this.broadcastList();
  }

  /** The process stopped. `crashed`: an unexpected exit. Otherwise a restart, and the windows wait for it. */
  onPluginStopped(pluginId: string, crashed: boolean): void {
    for (const w of this.windows.values()) {
      if (w.app.pluginId !== pluginId) continue;
      w.status = crashed ? "crashed" : "waiting";
      this.broadcastState(w, false);
    }
    this.broadcastList();
  }

  /** The plugin is off: its windows close, and the plugin gets no message. */
  onPluginDisabled(pluginId: string): void {
    this.cancelStop(pluginId);
    for (const id of [...this.order]) if (this.windows.get(id)?.app.pluginId === pluginId) this.closeWindow(id, false);
  }

  // --- internals ----------------------------------------------------------

  private userLaunch(appKey: string, opts: LaunchOptions): void {
    this.launch(appKey, { ...opts, user: true }).catch((e) => {
      logger.warning(`apps: '${appKey}' did not open: ${errorText(e)}`);
      this.host.notifyError(`${this.apps.get(appKey)?.name ?? appKey} did not open`, errorText(e));
    });
  }

  private onLaunchHotkey(appKey: string): void {
    if (this.host.hostState() === "calibrate") return;
    const ids = this.order.filter((id) => this.windows.get(id)!.app.key === appKey);
    const top = ids[ids.length - 1];
    if (!top) {
      this.launch(appKey, { user: true }).then(
        (id) => this.host.broadcastStage({ type: "window:take_focus", windowId: id }),
        (e) => this.host.notifyError(`${this.apps.get(appKey)?.name ?? appKey} did not open`, errorText(e)),
      );
      return;
    }
    const w = this.windows.get(top)!;
    if (this.activeId === top && !w.minimized) {
      this.command(top, "minimize");
      return;
    }
    this.countUse(appKey);
    this.command(top, "focus");
    this.host.broadcastStage({ type: "window:take_focus", windowId: top });
  }

  private async restart(windowId: string): Promise<void> {
    const w = this.windows.get(windowId);
    if (!w || w.status === "open") return;
    try {
      await this.startPlugin(w.app.pluginId);
    } catch (e) {
      this.host.notifyError(`${w.app.name} did not start`, errorText(e));
    }
  }

  private topWindowOf(appKey: string, viewKey: string): string | undefined {
    for (let i = this.order.length - 1; i >= 0; i--) {
      const w = this.windows.get(this.order[i]!)!;
      if (w.app.key === appKey && w.view.key === viewKey) return w.id;
    }
    return undefined;
  }

  private startPlugin(pluginId: string): Promise<void> {
    if (this.host.isRunning(pluginId)) return Promise.resolve();
    let p = this.starting.get(pluginId);
    if (!p) {
      p = this.host.ensureRunning(pluginId).finally(() => this.starting.delete(pluginId));
      this.starting.set(pluginId, p);
    }
    return p;
  }

  private createWindow(app: AppSpec, view: AppViewSpec): WindowRecord {
    const id = `${app.key}:${view.key}#${++this.seq}`;
    const saved = this.state.windows[`${app.key}:${view.key}`];
    const rect = saved ? { ...saved.rect } : null;
    if (rect) {
      for (let i = 0; i < MAX_CASCADE && [...this.windows.values()].some((o) => o.rect?.x === rect.x && o.rect?.y === rect.y); i++) {
        rect.x += CASCADE_PX;
        rect.y += CASCADE_PX;
      }
    }
    const w: WindowRecord = {
      id,
      app,
      view,
      title: view.title ?? app.name,
      rect,
      maximized: saved?.maximized ?? false,
      minimized: false,
      status: "open",
      inputs: new Map(),
    };
    const prev = this.activeId ? this.windows.get(this.activeId) : undefined;
    this.windows.set(id, w);
    this.order.push(id);
    this.activeId = id;
    this.host.broadcastOverlay({ type: "window:opened", ...this.openedPayload(w, true) });
    if (prev) this.broadcastState(prev);
    this.broadcastList();
    return w;
  }

  private focus(w: WindowRecord): void {
    const prev = this.activeId && this.activeId !== w.id ? this.windows.get(this.activeId) : undefined;
    const moved = this.order[this.order.length - 1] !== w.id;
    w.minimized = false;
    this.order = [...this.order.filter((id) => id !== w.id), w.id];
    this.activeId = w.id;
    this.broadcastState(w);
    if (prev) this.broadcastState(prev);
    if (moved) this.host.broadcastOverlay({ type: "window:order", order: [...this.order] });
  }

  private closeWindow(id: string, notifyPlugin: boolean): void {
    const w = this.windows.get(id);
    if (!w) return;
    this.saveView(w);
    this.windows.delete(id);
    this.pending.delete(id);
    this.order = this.order.filter((x) => x !== id);
    const wasActive = this.activeId === id;
    if (wasActive) this.activeId = this.topVisible();
    this.host.broadcastOverlay({ type: "window:closed", windowId: id });
    if (wasActive && this.activeId) this.broadcastState(this.windows.get(this.activeId)!);
    if (notifyPlugin && w.status === "open") this.host.sendToPlugin(w.app.pluginId, { t: "apps.close", windowId: id });
    this.broadcastList();
    this.scheduleStop(w.app.pluginId);
  }

  private topVisible(): string | null {
    for (let i = this.order.length - 1; i >= 0; i--) {
      const id = this.order[i]!;
      if (!this.windows.get(id)?.minimized) return id;
    }
    return null;
  }

  private setRect(windowId: string, raw: Record<string, unknown> | null): void {
    const w = this.windows.get(windowId);
    if (!w || !raw) return;
    const prev = w.rect ?? { x: 0, y: 0, w: w.view.size.w, h: w.view.size.h };
    const r = sanitizeWindowRect(raw, prev);
    r.w = Math.max(r.w, w.view.minSize.w);
    r.h = Math.max(r.h, w.view.minSize.h);
    const resized = !w.rect || w.rect.w !== r.w || w.rect.h !== r.h;
    w.rect = r;
    this.saveView(w);
    this.broadcastState(w, resized);
  }

  private saveView(w: WindowRecord): void {
    if (!w.rect) return;
    this.state.windows[viewKeyOf(w)] = { rect: { ...w.rect }, maximized: w.maximized };
    this.persist();
  }

  private pushData(w: WindowRecord, path: string, value: unknown): void {
    w.inputs.set(path, value);
    let m = this.pending.get(w.id);
    if (!m) {
      m = new Map();
      this.pending.set(w.id, m);
    }
    m.set(path, value);
    if (this.flushScheduled) return;
    this.flushScheduled = true;
    setImmediate(() => this.flush());
  }

  private flush(): void {
    this.flushScheduled = false;
    for (const [windowId, inputs] of this.pending) {
      if (!inputs.size) continue;
      const obj: Record<string, { t: "json"; v: unknown }> = {};
      for (const [k, v] of inputs) obj[k] = { t: "json", v };
      this.host.broadcastOverlay({ type: "window:data", windowId, inputs: obj });
      inputs.clear();
    }
  }

  // --- app-only lifecycle -------------------------------------------------

  private scheduleStop(pluginId: string): void {
    if (this.lifecycles.get(pluginId) !== "app" || this.windowCount(pluginId) || this.stopTimers.has(pluginId)) return;
    if (!this.host.isRunning(pluginId)) return;
    this.stopTimers.set(
      pluginId,
      setTimeout(() => this.stopNow(pluginId), this.graceMs),
    );
  }

  private cancelStop(pluginId: string): void {
    const t = this.stopTimers.get(pluginId);
    if (!t) return;
    clearTimeout(t);
    this.stopTimers.delete(pluginId);
  }

  private stopNow(pluginId: string): void {
    this.cancelStop(pluginId);
    if (this.windowCount(pluginId) || !this.host.isRunning(pluginId)) return;
    this.host.stopApp(pluginId).then(
      () => this.broadcastList(),
      (e) => logger.warning(`apps: ${pluginId} did not stop: ${errorText(e)}`),
    );
  }

  // --- favorites, taskbar, commands --------------------------------------

  private setFavorite(appKey: string, favorite: boolean, index?: number): boolean {
    if (!this.apps.has(appKey)) return false;
    const list = this.state.favorites.filter((k) => k !== appKey);
    if (favorite) {
      const at = index === undefined ? list.length : Math.max(0, Math.min(list.length, Math.round(index)));
      list.splice(at, 0, appKey);
    }
    this.state.favorites = list;
    this.persist();
    this.broadcastList();
    return true;
  }

  private setPinned(appKey: string, pinned: boolean): boolean {
    if (!this.apps.has(appKey)) return false;
    const list = this.state.pinned.filter((k) => k !== appKey);
    if (pinned) list.push(appKey);
    this.state.pinned = list;
    this.persist();
    this.broadcastList();
    return true;
  }

  private setLauncher(raw: Record<string, unknown>): void {
    if (EDGES.includes(raw.edge as TaskbarEdge)) this.state.taskbar.edge = raw.edge as TaskbarEdge;
    if (typeof raw.autoHide === "boolean") this.state.taskbar.autoHide = raw.autoHide;
    this.persist();
    this.broadcastLauncher();
  }

  /** Sets the alias and/or the launch hotkey of an app. A key left out of `raw` stays as it is. */
  configure(appKey: string, raw: Record<string, unknown>): { ok: boolean; error?: string; owner?: string } {
    const app = this.apps.get(appKey);
    if (!app) return { ok: false, error: "unknown_app" };
    const cmd = { ...(this.state.commands[appKey] ?? {}) };
    if ("alias" in raw) {
      const alias = raw.alias === null ? "" : String(raw.alias ?? "").trim().toLowerCase();
      if (!alias) delete cmd.alias;
      else {
        if (!ALIAS_RE.test(alias)) return { ok: false, error: "alias_invalid" };
        const other = Object.entries(this.state.commands).find(([k, c]) => k !== appKey && c.alias === alias && this.apps.has(k));
        if (other) return { ok: false, error: "alias_taken", owner: this.apps.get(other[0])!.name };
        cmd.alias = alias;
      }
    }
    if ("hotkey" in raw) {
      if (raw.hotkey === null || raw.hotkey === "") cmd.hotkey = null;
      else {
        let combo: string;
        let owner: string | undefined;
        try {
          const p = HotkeyRegistry.parse(String(raw.hotkey));
          combo = [...p.mods, p.key].join("+");
          owner = this.host.hotkeys.ownerOf(combo);
        } catch {
          return { ok: false, error: "hotkey_invalid" };
        }
        if (owner !== undefined && owner !== ownerId(appKey)) return { ok: false, error: "hotkey_taken", owner: this.ownerName(owner) };
        cmd.hotkey = combo;
      }
    }
    if (Object.keys(cmd).length) this.state.commands[appKey] = cmd;
    else delete this.state.commands[appKey];
    this.persist();
    this.bindLaunchHotkeys();
    this.broadcastList();
    return { ok: true };
  }

  private effectiveHotkey(app: AppSpec): string | null {
    const cmd = this.state.commands[app.key];
    if (cmd && "hotkey" in cmd) return cmd.hotkey ?? null;
    return app.hotkey;
  }

  private bindLaunchHotkeys(): void {
    for (const key of this.boundHotkeys) this.host.hotkeys.unregisterOwner(ownerId(key));
    this.boundHotkeys.clear();
    this.hotkeyConflicts.clear();
    for (const app of this.apps.values()) {
      const combo = this.effectiveHotkey(app);
      if (!combo) continue;
      let owner: string | undefined;
      try {
        owner = this.host.hotkeys.ownerOf(combo);
      } catch {
        continue;
      }
      if (owner !== undefined) {
        this.hotkeyConflicts.set(app.key, this.ownerName(owner));
        logger.warning(`apps: the launch hotkey '${combo}' of '${app.key}' is bound by '${owner || "host"}' - not bound`);
        continue;
      }
      this.host.hotkeys.register(combo, () => this.onLaunchHotkey(app.key), app.name, ownerId(app.key));
      this.boundHotkeys.add(app.key);
    }
  }

  private ownerName(owner: string): string {
    if (!owner || owner === "host") return "FUSE";
    if (owner.startsWith("app:")) return this.apps.get(owner.slice(4))?.name ?? owner.slice(4);
    return this.pluginNames.get(owner) ?? owner;
  }

  private countUse(appKey: string): void {
    const u = this.state.usage[appKey] ?? { count: 0, last: 0 };
    this.state.usage[appKey] = { count: u.count + 1, last: Date.now() };
    this.persist();
  }

  private persist(): void {
    this.host.saveState(this.state);
  }

  // --- payloads -----------------------------------------------------------

  listPayload(): Array<Record<string, unknown>> {
    return [...this.apps.values()].map((app) => {
      const cmd = this.state.commands[app.key] ?? {};
      return {
        key: app.key,
        pluginId: app.pluginId,
        appId: app.appId,
        name: app.name,
        pluginName: this.pluginNames.get(app.pluginId) ?? app.pluginId,
        iconUrl: app.icon ? assetUrl(app.pluginId, app.icon) : null,
        keywords: app.keywords,
        views: Object.keys(app.views),
        instances: app.instances,
        running: this.host.isRunning(app.pluginId),
        windows: this.order.filter((id) => this.windows.get(id)?.app.key === app.key),
        favorite: this.state.favorites.indexOf(app.key),
        pinned: this.state.pinned.includes(app.key),
        alias: cmd.alias ?? null,
        hotkey: this.effectiveHotkey(app),
        hotkeyConflict: this.hotkeyConflicts.get(app.key) ?? null,
        usage: this.state.usage[app.key] ?? { count: 0, last: 0 },
      };
    });
  }

  private broadcastList(): void {
    const msg = { type: "app:list", apps: this.listPayload() };
    this.host.broadcastStage(msg);
    this.host.broadcastControl(msg);
  }

  private stateFields(w: WindowRecord): Record<string, unknown> {
    return {
      title: w.title,
      rect: w.rect,
      maximized: w.maximized,
      minimized: w.minimized,
      focused: this.activeId === w.id && !w.minimized,
      status: w.status,
      z: this.order.indexOf(w.id),
    };
  }

  private openedPayload(w: WindowRecord, focus: boolean): Record<string, unknown> {
    const inputs: Record<string, { t: "json"; v: unknown }> = {};
    for (const [k, v] of w.inputs) inputs[k] = { t: "json", v };
    return {
      windowId: w.id,
      appKey: w.app.key,
      pluginId: w.app.pluginId,
      appId: w.app.appId,
      view: w.view.key,
      viewUrl: assetUrl(w.app.pluginId, w.view.view),
      iconUrl: w.app.icon ? assetUrl(w.app.pluginId, w.app.icon) : null,
      size: w.view.size,
      minSize: w.view.minSize,
      maxSize: w.view.maxSize,
      resizable: w.view.resizable,
      ...this.stateFields(w),
      inputs,
      focus,
    };
  }

  private pluginWindow(w: WindowRecord): { windowId: string; appId: string; view: string; state: AppWindowState } {
    return { windowId: w.id, appId: w.app.appId, view: w.view.key, state: this.pluginState(w) };
  }

  private pluginState(w: WindowRecord): AppWindowState {
    return {
      focused: this.activeId === w.id && !w.minimized,
      maximized: w.maximized,
      minimized: w.minimized,
      size: w.rect ? { w: w.rect.w, h: w.rect.h } : { w: 0, h: 0 },
    };
  }

  /** Tells the stage, and the plugin unless `toPlugin` is false. */
  private broadcastState(w: WindowRecord, toPlugin = true): void {
    this.host.broadcastOverlay({ type: "window:state", windowId: w.id, ...this.stateFields(w) });
    if (toPlugin && w.status === "open") this.host.sendToPlugin(w.app.pluginId, { t: "apps.state", windowId: w.id, state: this.pluginState(w) });
  }
}
