/**
 * The plugin-side `FuseContext`. Reads come from local copies the runtime keeps
 * current; changes go to the runtime, which applies them and tells everyone else.
 */
import { randomUUID } from "node:crypto";
import { logger, type Logger } from "../log.js";
import { asRecord, errorText, type Channel } from "../ipc/channel.js";
import type { InitMessage, ServiceSnapshot, WireMessage } from "../ipc/protocol.js";
import { applyPatch, diffState, jsonClone, type StatePatch } from "../ipc/serviceState.js";
import { PluginAssets } from "../sdk/assets.js";
import { serializeSchema, type ConfigSchemaItem } from "../sdk/configSchema.js";
import type { PluginConfigApi } from "../sdk/config.js";
import type { EventHandler, PluginEvents } from "../sdk/events.js";
import { HotkeyRegistry, type BindingInfo, type PluginHotkeys } from "../sdk/hotkeys.js";
import type { InputPhase, InspectorSection, OverlayInspector } from "../sdk/inspector.js";
import type { OverlayDeclaration, OverlayHandle, OverlayManager, Rect, Size } from "../sdk/overlay.js";
import type { StageNotificationInit, StageNotifier } from "../sdk/notifications.js";
import type { PlayOptions, PluginAudio } from "../sdk/audio.js";
import type { PermissionState, PluginPermissions } from "../sdk/permissions.js";
import type { PluginServices, ServiceHandle, ServiceSpec } from "../sdk/services.js";
import type { PluginStorage, StorageCollection } from "../sdk/storage.js";
import type { PluginSecrets } from "../sdk/secrets.js";
import type { PluginLinks } from "../sdk/links.js";
import type { FuseContext, FusePlugin, HostState, HostView, TeardownReason } from "../sdk/plugin.js";

export type PluginClass = (new () => FusePlugin) & { requiresCalibration?: unknown; calibrationStages?: unknown };

function same(a: unknown, b: unknown): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}

// --- config -------------------------------------------------------------------

class RemoteConfig implements PluginConfigApi {
  loaded = false;
  readonly configPath: string;
  private data: Record<string, unknown> = {};
  private defaultValues: Record<string, unknown>;
  private disk: Record<string, unknown>;
  private watchers = new Map<string, Array<(value: unknown) => void>>();
  private actionHandler: ((controlId: string, payload?: unknown) => void) | null = null;

  constructor(
    private readonly channel: Channel,
    private readonly log: Logger,
    init: InitMessage["config"],
  ) {
    this.configPath = init.path;
    this.defaultValues = { ...init.defaults };
    this.disk = { ...init.disk };
  }

  defaults(dict: Record<string, unknown>): this {
    Object.assign(this.defaultValues, dict);
    this.channel.send({ t: "config.defaults", dict: jsonClone(dict) });
    return this;
  }

  schema(items: ConfigSchemaItem[]): this {
    this.channel.send({ t: "config.schema", items: serializeSchema(items) });
    return this;
  }

  load(): this {
    this.data = { ...this.defaultValues, ...this.disk };
    this.loaded = true;
    this.channel.send({ t: "config.load" });
    return this;
  }

  save(): void {
    this.channel.send({ t: "config.save" });
  }

  reload(): void {
    this.channel.send({ t: "config.reload" });
  }

  checkReload(): boolean {
    return false;
  }

  get<T = unknown>(key: string, def?: T): T {
    if (key in this.data) return this.data[key] as T;
    if (arguments.length >= 2) return def as T;
    throw new Error(`PluginConfig: key '${key}' not found and no default given`);
  }

  has(key: string): boolean {
    return key in this.data;
  }

  snapshot(): Record<string, unknown> {
    return { ...this.data };
  }

  set(key: string, value: unknown): void {
    this.write(key, value, false);
  }

  setLive(key: string, value: unknown): void {
    this.write(key, value, true);
  }

  update(data: Record<string, unknown>): void {
    const changed: Array<[string, unknown]> = [];
    for (const [key, value] of Object.entries(data)) {
      if (!(key in this.data) || !same(this.data[key], value)) changed.push([key, value]);
      this.data[key] = value;
      this.disk[key] = value;
    }
    this.channel.send({ t: "config.update", data: jsonClone(data) });
    for (const [key, value] of changed) this.notify(key, value);
  }

  watch(key: string, callback: (value: unknown) => void): void {
    const list = this.watchers.get(key) ?? [];
    list.push(callback);
    this.watchers.set(key, list);
  }

  onAction(cb: (controlId: string, payload?: unknown) => void): void {
    this.actionHandler = cb;
    this.channel.send({ t: "config.onAction" });
  }

  /** A change that happened on the runtime side: the App, the stage, the file. */
  applyChange(key: string, value: unknown): void {
    if (!key || (key in this.data && same(this.data[key], value))) return;
    this.data[key] = value;
    this.disk[key] = value;
    this.notify(key, value);
  }

  applySnapshot(next: Record<string, unknown>): void {
    const prev = this.data;
    this.data = { ...next };
    this.disk = { ...next };
    this.loaded = true;
    for (const [key, value] of Object.entries(next)) {
      if (!(key in prev) || !same(prev[key], value)) this.notify(key, value);
    }
  }

  runAction(controlId: string, payload: unknown): void {
    try {
      this.actionHandler?.(controlId, payload);
    } catch (e) {
      this.log.exception(`Config: onAction handler raised for '${controlId}'`, e);
    }
  }

  private write(key: string, value: unknown, live: boolean): void {
    const had = key in this.data;
    const old = this.data[key];
    this.data[key] = value;
    if (!live) this.disk[key] = value;
    this.channel.send({ t: "config.set", key, value: jsonClone(value), live });
    if (!had || !same(old, value)) this.notify(key, value);
  }

  private notify(key: string, value: unknown): void {
    for (const cb of this.watchers.get(key) ?? []) {
      try {
        cb(value);
      } catch (e) {
        this.log.exception(`Config: watcher for '${key}' raised`, e);
      }
    }
  }
}

// --- hotkeys ------------------------------------------------------------------

function bindingKey(mods: string[], key: string): string {
  return `${[...mods].sort().join("+")}|${key}`;
}

class RemoteHotkeys implements PluginHotkeys {
  private callbacks = new Map<string, () => void>();
  private bindings = new Map<string, { id: string; combo: string; label: string; mods: string[]; key: string }>();

  constructor(
    private readonly channel: Channel,
    private readonly pluginId: string,
    private readonly log: Logger,
  ) {}

  register(combo: string, callback: () => void, label = ""): void {
    const { mods, key } = HotkeyRegistry.parse(combo);
    const bk = bindingKey(mods, key);
    const prev = this.bindings.get(bk);
    if (prev) this.callbacks.delete(prev.id);
    const id = randomUUID();
    this.callbacks.set(id, callback);
    this.bindings.set(bk, { id, combo, label: label || combo, mods, key });
    this.channel.send({ t: "hotkey.register", combo, label, id });
  }

  unregister(combo: string): boolean {
    const { mods, key } = HotkeyRegistry.parse(combo);
    const bk = bindingKey(mods, key);
    const prev = this.bindings.get(bk);
    if (!prev) return false;
    this.callbacks.delete(prev.id);
    this.bindings.delete(bk);
    this.channel.send({ t: "hotkey.unregister", combo });
    return true;
  }

  reregister(oldMods: string[], oldKey: string, newCombo: string): boolean {
    const bk = bindingKey(oldMods, oldKey);
    const prev = this.bindings.get(bk);
    if (!prev) return false;
    const { mods, key } = HotkeyRegistry.parse(newCombo);
    this.bindings.delete(bk);
    this.bindings.set(bindingKey(mods, key), { ...prev, combo: newCombo, mods, key });
    this.channel.send({ t: "hotkey.reregister", oldMods, oldKey, newCombo });
    return true;
  }

  listBindings(_owner?: string): BindingInfo[] {
    return [...this.bindings.values()]
      .map((b) => ({ mods: b.mods, key: b.key, combo: b.combo, label: b.label, owner: this.pluginId }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  fire(id: string): void {
    const cb = this.callbacks.get(id);
    if (!cb) return;
    try {
      cb();
    } catch (e) {
      this.log.exception("hotkey handler raised", e);
    }
  }
}

// --- events -------------------------------------------------------------------

class RemoteEvents implements PluginEvents {
  private handlers = new Map<string, EventHandler[]>();

  constructor(
    private readonly channel: Channel,
    private readonly log: Logger,
  ) {}

  subscribe(event: string, cb: EventHandler, _owner = ""): void {
    const list = this.handlers.get(event) ?? [];
    if (!list.length) this.channel.send({ t: "events.subscribe", event });
    list.push(cb);
    this.handlers.set(event, list);
  }

  unsubscribe(event: string, cb: EventHandler): void {
    const list = this.handlers.get(event);
    if (!list) return;
    const rest = list.filter((h) => h !== cb);
    if (rest.length) {
      this.handlers.set(event, rest);
      return;
    }
    this.handlers.delete(event);
    this.channel.send({ t: "events.unsubscribe", event });
  }

  emit(event: string, payload: Record<string, unknown> = {}): void {
    this.channel.send({ t: "events.emit", event, payload: jsonClone(payload) });
  }

  dispatch(event: string, payload: Record<string, unknown>): void {
    for (const cb of [...(this.handlers.get(event) ?? [])]) {
      try {
        cb(payload);
      } catch (e) {
        this.log.exception(`EventBus handler for '${event}' raised`, e);
      }
    }
  }
}

// --- overlays -----------------------------------------------------------------

class RemoteInspector implements OverlayInspector {
  inputHandler: ((controlId: string, value: unknown, phase: InputPhase) => void) | null = null;
  actionHandler: ((controlId: string, payload?: unknown) => void) | null = null;
  private warnedValues = false;

  constructor(
    private readonly channel: Channel,
    private readonly localId: string,
    private readonly log: Logger,
  ) {}

  sections(list: InspectorSection[]): void {
    this.channel.send({ t: "inspector.sections", id: this.localId, sections: jsonClone(list) });
  }

  patch(controlId: string, patch: Record<string, unknown>): void {
    this.channel.send({ t: "inspector.patch", id: this.localId, controlId, patch: jsonClone(patch) });
  }

  values(): Record<string, unknown> {
    if (!this.warnedValues) {
      this.warnedValues = true;
      this.log.warning("inspector.values() isn't available in a plugin process; read the config instead");
    }
    return {};
  }

  onInput(cb: (controlId: string, value: unknown, phase: InputPhase) => void): void {
    this.inputHandler = cb;
    this.channel.send({ t: "inspector.onInput", id: this.localId });
  }

  onAction(cb: (controlId: string, payload?: unknown) => void): void {
    this.actionHandler = cb;
    this.channel.send({ t: "inspector.onAction", id: this.localId });
  }
}

class RemoteHandle implements OverlayHandle {
  readonly inspector: RemoteInspector;
  actionHandler: ((action: string, payload?: unknown) => void) | null = null;

  constructor(
    private readonly channel: Channel,
    readonly id: string,
    private readonly localId: string,
    log: Logger,
    private readonly onRemove: () => void,
  ) {
    this.inspector = new RemoteInspector(channel, localId, log);
  }

  set(path: string, value: number): void {
    this.op("set", path, value);
  }
  setBool(path: string, value: boolean): void {
    this.op("setBool", path, value);
  }
  setString(path: string, value: string): void {
    this.op("setString", path, value);
  }
  setColor(path: string, argb: number): void {
    this.op("setColor", path, argb);
  }
  setEnum(path: string, label: string): void {
    this.op("setEnum", path, label);
  }
  trigger(path: string): void {
    this.op("trigger", path);
  }
  setJson(path: string, value: unknown): void {
    this.op("setJson", path, jsonClone(value));
  }
  setRect(rect: Rect): void {
    this.op("setRect", jsonClone(rect));
  }
  setSize(size: Size): void {
    this.op("setSize", jsonClone(size));
  }
  setPositionConfigKey(key: string): void {
    this.op("setPositionConfigKey", key);
  }
  setVisible(visible: boolean): void {
    this.op("setVisible", visible);
  }
  onAction(cb: (action: string, payload?: unknown) => void): void {
    this.actionHandler = cb;
    this.channel.send({ t: "overlay.onAction", id: this.localId });
  }
  remove(): void {
    this.op("remove");
    this.onRemove();
  }

  private op(op: string, ...args: unknown[]): void {
    this.channel.send({ t: "overlay.op", id: this.localId, op, args });
  }
}

class RemoteOverlays implements OverlayManager {
  private handles = new Map<string, RemoteHandle>();

  constructor(
    private readonly channel: Channel,
    private readonly pluginId: string,
    private readonly log: Logger,
  ) {}

  declare(decl: OverlayDeclaration): OverlayHandle {
    const localId = decl.id;
    const handle: RemoteHandle = new RemoteHandle(this.channel, `${this.pluginId}:${localId}`, localId, this.log, () => {
      if (this.handles.get(localId) === handle) this.handles.delete(localId);
    });
    this.handles.set(localId, handle);
    this.channel.send({ t: "overlay.declare", decl: jsonClone(decl) });
    return handle;
  }

  get(id: string): OverlayHandle | undefined {
    return this.handles.get(id);
  }

  all(): OverlayHandle[] {
    return [...this.handles.values()];
  }

  byLocalId(id: string): RemoteHandle | undefined {
    return this.handles.get(id);
  }
}

// --- services -----------------------------------------------------------------

interface Mirror extends ServiceSnapshot {
  available: boolean;
}

interface Provided {
  target: object;
  methods: Set<string>;
  state?: () => Record<string, unknown>;
  last: Record<string, unknown>;
}

class RemoteServices implements PluginServices {
  private mirrors = new Map<string, Mirror>();
  private proxies = new Map<string, object>();
  private subscribed = new Set<string>();
  private provided = new Map<string, Provided>();

  constructor(
    private readonly channel: Channel,
    private readonly log: Logger,
    initial: Record<string, ServiceSnapshot>,
  ) {
    for (const [name, snapshot] of Object.entries(initial)) this.mirrors.set(name, { ...snapshot, available: true });
  }

  get<T = unknown>(name: string): T | undefined {
    // Subscribe even to a service that isn't up yet, so it shows up once its provider starts.
    if (!this.subscribed.has(name)) {
      this.subscribed.add(name);
      this.channel.send({ t: "service.subscribe", name });
    }
    // A withdrawn service reads as missing until its provider is back; proxies handed out earlier reject calls.
    return this.mirrors.get(name)?.available ? (this.proxyFor(name) as T) : undefined;
  }

  require<T = unknown>(name: string): T {
    const service = this.get<T>(name);
    if (service == null) {
      throw new Error(
        `Required service '${name}' is not registered. Ensure the providing plugin is listed in 'dependencies'.`,
      );
    }
    return service;
  }

  provide(name: string, spec: ServiceSpec): ServiceHandle {
    const methods = spec.methods ?? methodNames(spec.target);
    const state = spec.state ? jsonClone(spec.state()) : {};
    this.provided.set(name, { target: spec.target, methods: new Set(methods), state: spec.state, last: state });
    this.channel.send({
      t: "service.provide",
      name,
      methods,
      reads: spec.reads ?? {},
      scopes: spec.scopes ?? {},
      stateScope: spec.stateScope ?? null,
      state,
    });
    return { publish: () => this.publish(name) };
  }

  register(name: string, impl: unknown, _owner = ""): void {
    if (!impl || typeof impl !== "object") throw new Error(`service '${name}' must be an object`);
    this.log.warning(
      `services.register('${name}') shares methods only; use services.provide() for state other plugins read synchronously`,
    );
    this.provide(name, { target: impl });
  }

  unregister(name: string): void {
    if (this.provided.delete(name)) this.channel.send({ t: "service.withdraw", name });
  }

  applyState(name: string, snapshot: ServiceSnapshot): void {
    this.mirrors.set(name, { ...snapshot, available: true });
  }

  applyPatch(name: string, patch: StatePatch): void {
    const mirror = this.mirrors.get(name);
    if (mirror) applyPatch(mirror.state, patch);
  }

  /** The runtime kept another provider under this name. */
  refused(name: string): void {
    if (!this.provided.delete(name)) return;
    this.log.warning(`services.provide('${name}') refused: another plugin or FUSE already provides it`);
  }

  /** The provider stopped: reads return nothing and calls fail until it's back. */
  markGone(name: string): void {
    const mirror = this.mirrors.get(name);
    if (!mirror) return;
    mirror.state = {};
    mirror.available = false;
  }

  async invoke(name: string, method: string, args: unknown[]): Promise<unknown> {
    const entry = this.provided.get(name);
    const fn = entry && entry.methods.has(method) ? (entry.target as Record<string, unknown>)[method] : undefined;
    if (!entry || typeof fn !== "function") throw new Error(`service '${name}' has no method '${method}'`);
    return jsonClone(await (fn as (...a: unknown[]) => unknown).apply(entry.target, args));
  }

  private publish(name: string): void {
    const entry = this.provided.get(name);
    if (!entry?.state) return;
    const next = jsonClone(entry.state());
    const patch = diffState(entry.last, next);
    if (!patch) return;
    entry.last = next;
    this.channel.send({ t: "service.publish", name, patch });
  }

  private proxyFor(name: string): object {
    const existing = this.proxies.get(name);
    if (existing) return existing;
    const proxy = new Proxy(
      {},
      {
        get: (_target, prop) => {
          if (typeof prop !== "string" || prop === "then") return undefined;
          const mirror = this.mirrors.get(name);
          if (!mirror) return undefined;
          const readKey = mirror.reads[prop];
          if (readKey !== undefined) {
            return (arg: unknown) => asRecord(this.mirrors.get(name)?.state[readKey])[String(arg)];
          }
          if (mirror.methods.includes(prop)) return (...args: unknown[]) => this.call(name, prop, args);
          return mirror.state[prop];
        },
      },
    );
    this.proxies.set(name, proxy);
    return proxy;
  }

  private call(name: string, method: string, args: unknown[]): Promise<unknown> {
    if (this.mirrors.get(name)?.available === false) {
      return Promise.reject(new Error(`service '${name}' isn't available`));
    }
    return this.channel.request({ t: "service.call", name, method, args: jsonClone(args) });
  }
}

function methodNames(target: object): string[] {
  const names = new Set<string>();
  for (let o: object | null = target; o && o !== Object.prototype; o = Object.getPrototypeOf(o) as object | null) {
    for (const key of Object.getOwnPropertyNames(o)) {
      if (key === "constructor" || key.startsWith("_")) continue;
      const desc = Object.getOwnPropertyDescriptor(o, key);
      if (desc && typeof desc.value === "function") names.add(key);
    }
  }
  return [...names];
}

// --- brokered: storage, secrets, links ----------------------------------------

class RemoteStorage implements PluginStorage {
  constructor(private readonly channel: Channel) {}

  collection<T = Record<string, unknown>>(name: string): StorageCollection<T> {
    const call = <R>(op: string, ...args: unknown[]): Promise<R> =>
      this.channel.request<R>({ t: "storage", op, collection: String(name), args: jsonClone(args) });
    return {
      get: (id) => call<T | undefined>("get", id),
      put: (id, value) => call<void>("put", id, value),
      update: (id, patch) => call<boolean>("update", id, patch),
      delete: (id) => call<boolean>("delete", id),
      query: (query) => call<Array<{ id: string; value: T }>>("query", query ?? {}),
      count: (query) => call<number>("count", query ?? {}),
      clear: () => call<void>("clear"),
    };
  }
}

class RemoteLinks implements PluginLinks {
  private handlers: Array<(url: string) => void> = [];

  constructor(
    private readonly channel: Channel,
    private readonly log: Logger,
  ) {}

  open(url: string): Promise<boolean> {
    return this.channel.request<boolean>({ t: "links.open", url: String(url) });
  }

  onCallback(cb: (url: string) => void): void {
    this.handlers.push(cb);
  }

  dispatch(url: string): void {
    for (const cb of [...this.handlers]) {
      try {
        cb(url);
      } catch (e) {
        this.log.exception("link callback raised", e);
      }
    }
  }
}

// --- permissions --------------------------------------------------------------

class RemotePermissions implements PluginPermissions {
  constructor(
    private readonly channel: Channel,
    private states: Record<string, PermissionState>,
  ) {}

  has(scope: string): boolean {
    return this.state(scope) === "granted";
  }

  state(scope: string): PermissionState {
    return this.states[scope] ?? "undeclared";
  }

  async request(scope: string): Promise<"granted" | "denied"> {
    const answer = await this.channel.request<string>({ t: "permissions.request", scope });
    return answer === "granted" ? "granted" : "denied";
  }

  apply(states: Record<string, PermissionState>): void {
    this.states = { ...states };
  }
}

// --- runtime ------------------------------------------------------------------

function parseState(v: unknown): HostState {
  return v === "calibrate" || v === "interactive" ? v : "locked";
}

/** The loaded plugin, its context, and the handlers for everything the runtime sends. */
export class PluginRuntime {
  private readonly log: Logger;
  private readonly plugin: FusePlugin;
  private readonly ctx: FuseContext;
  private readonly config: RemoteConfig;
  private readonly hotkeys: RemoteHotkeys;
  private readonly events: RemoteEvents;
  private readonly overlays: RemoteOverlays;
  private readonly services: RemoteServices;
  private readonly permissions: RemotePermissions;
  private readonly links: RemoteLinks;

  constructor(
    private readonly channel: Channel,
    init: InitMessage,
    cls: PluginClass,
  ) {
    const pluginId = init.pluginId;
    this.log = logger.bind(pluginId);
    this.config = new RemoteConfig(channel, this.log, init.config);
    this.hotkeys = new RemoteHotkeys(channel, pluginId, this.log);
    this.events = new RemoteEvents(channel, this.log);
    this.overlays = new RemoteOverlays(channel, pluginId, this.log);
    this.services = new RemoteServices(channel, this.log, init.services);
    this.permissions = new RemotePermissions(channel, init.permissions);
    this.links = new RemoteLinks(channel, this.log);

    const permissions = this.permissions;
    const services = this.services;
    const notifications: StageNotifier = {
      notify: (n: StageNotificationInit) => {
        const id = n.id ?? randomUUID();
        channel.send({ t: "notify", init: jsonClone({ ...n, id }) });
        return id.startsWith(`${pluginId}:`) ? id : `${pluginId}:${id}`;
      },
      dismiss: (id: string) => channel.send({ t: "notify.dismiss", id }),
    };
    const audio: PluginAudio = {
      preload: (assets: string[]) => channel.send({ t: "audio.preload", assets: [...assets] }),
      play: (asset: string, opts: PlayOptions = {}) => {
        const id = `${pluginId}:${randomUUID()}`;
        channel.send({ t: "audio.play", asset, opts: jsonClone(opts), id });
        return permissions.has("audio") ? id : "";
      },
      stop: (id: string) => channel.send({ t: "audio.stop", id }),
      stopAll: () => channel.send({ t: "audio.stopAll" }),
    };
    const secrets: PluginSecrets = {
      get: (key) => channel.request<string | undefined>({ t: "secrets", op: "get", key }),
      set: (key, value) => channel.request<void>({ t: "secrets", op: "set", key, value }),
      delete: (key) => channel.request<boolean>({ t: "secrets", op: "delete", key }),
      has: (key) => channel.request<boolean>({ t: "secrets", op: "has", key }),
    };
    const runtime = this;
    const host: HostView = {
      get state(): HostState {
        return runtime.ctx.state;
      },
      broadcast: (message: Record<string, unknown>) => channel.send({ t: "host.broadcast", message: jsonClone(message) }),
      getService: <T = unknown>(name: string): T | undefined => services.get<T>(name),
    };

    const manifestHotkeys = { ...init.manifestHotkeys };
    this.ctx = {
      config: this.config,
      hotkeys: this.hotkeys,
      assets: new PluginAssets(`${init.packageRoot}/assets`),
      services: this.services,
      events: this.events,
      overlays: this.overlays,
      notifications,
      audio,
      permissions: this.permissions,
      storage: new RemoteStorage(channel),
      secrets,
      links: this.links,
      host,
      logger: this.log,
      state: init.state,
      packageRoot: init.packageRoot,
      manifestHotkeys,
      extras: new Map(),
      hotkeyFor: (name: string, fallback = "") => manifestHotkeys[name] ?? fallback,
    };
    this.plugin = new cls();
  }

  handle(msg: WireMessage): void {
    switch (msg.t) {
      case "call":
        void this.call(msg);
        return;
      case "lifecycle":
        this.lifecycle(String(msg.method ?? ""), Array.isArray(msg.args) ? msg.args : []);
        return;
      case "tick":
        this.guard("tick", () => this.plugin.tick(Number(msg.dt) || 0));
        return;
      case "state":
        this.ctx.state = parseState(msg.state);
        return;
      case "permissions":
        this.permissions.apply(asRecord(msg.states) as Record<string, PermissionState>);
        return;

      case "config.changed":
        this.config.applyChange(String(msg.key ?? ""), msg.value);
        return;
      case "config.snapshot":
        this.config.applySnapshot(asRecord(msg.data));
        return;
      case "config.action":
        this.config.runAction(String(msg.controlId ?? ""), msg.payload);
        return;

      case "overlay.action": {
        const handle = this.overlays.byLocalId(String(msg.id ?? ""));
        this.guard("overlay action", () => handle?.actionHandler?.(String(msg.action ?? ""), msg.payload));
        return;
      }
      case "inspector.input": {
        const handle = this.overlays.byLocalId(String(msg.id ?? ""));
        const phase: InputPhase = msg.phase === "live" ? "live" : "commit";
        this.guard("inspector input", () =>
          handle?.inspector.inputHandler?.(String(msg.controlId ?? ""), msg.value, phase),
        );
        return;
      }
      case "inspector.action": {
        const handle = this.overlays.byLocalId(String(msg.id ?? ""));
        this.guard("inspector action", () =>
          handle?.inspector.actionHandler?.(String(msg.controlId ?? ""), msg.payload),
        );
        return;
      }

      case "hotkey":
        this.hotkeys.fire(String(msg.id ?? ""));
        return;
      case "event":
        this.events.dispatch(String(msg.event ?? ""), asRecord(msg.payload));
        return;
      case "links.callback":
        this.links.dispatch(String(msg.url ?? ""));
        return;

      case "service.state":
        this.services.applyState(String(msg.name ?? ""), msg.snapshot as ServiceSnapshot);
        return;
      case "service.patch":
        this.services.applyPatch(String(msg.name ?? ""), asRecord(msg.patch) as StatePatch);
        return;
      case "service.gone":
        this.services.markGone(String(msg.name ?? ""));
        return;
      case "service.refused":
        this.services.refused(String(msg.name ?? ""));
        return;
      case "service.invoke":
        this.services
          .invoke(String(msg.name ?? ""), String(msg.method ?? ""), Array.isArray(msg.args) ? msg.args : [])
          .then(
            (value) => this.channel.reply(msg.rid, { ok: true, value }),
            (e) => this.channel.reply(msg.rid, { ok: false, error: errorText(e) }),
          );
        return;
    }
  }

  private async call(msg: WireMessage): Promise<void> {
    const method = String(msg.method ?? "");
    try {
      if (method === "setup") {
        await this.plugin.setup(this.ctx);
      } else if (method === "teardown") {
        const reason = (Array.isArray(msg.args) ? msg.args[0] : undefined) as TeardownReason | undefined;
        this.plugin.teardown(reason);
      } else {
        throw new Error(`unknown call '${method}'`);
      }
      this.channel.reply(msg.rid, { ok: true });
    } catch (e) {
      this.log.exception(`${method} failed`, e);
      this.channel.reply(msg.rid, { ok: false, error: errorText(e) });
    }
    // Teardown's config writes must reach the runtime before it kills the process.
    this.channel.flush();
  }

  private lifecycle(method: string, args: unknown[]): void {
    const p = this.plugin;
    this.guard(method, () => {
      switch (method) {
        case "enterCalibrate":
          p.enterCalibrate(Number(args[0]) || 1);
          return;
        case "enterLocked":
          p.enterLocked();
          return;
        case "enterInteractive":
          p.enterInteractive();
          return;
        case "setOverlayVisible":
          p.setOverlayVisible(Boolean(args[0]));
          return;
      }
    });
  }

  private guard(what: string, fn: () => void): void {
    try {
      fn();
    } catch (e) {
      this.log.exception(`${what} error`, e);
    }
  }
}
