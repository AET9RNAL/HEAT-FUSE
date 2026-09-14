/**
 * One plugin in its own Node process, sandboxed by Node's permission model.
 * Owns the spawn flags, the heartbeat, and the runtime end of every `ctx` call.
 */
import { fork, type ChildProcess, type ForkOptions } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { logger, type Logger } from "../log.js";
import { Channel, asRecord, errorText } from "../ipc/channel.js";
import type { InitMessage, WireMessage } from "../ipc/protocol.js";
import type { StatePatch } from "../ipc/serviceState.js";
import type { ConfigSchemaItem } from "../sdk/configSchema.js";
import type { HotkeyRegistry } from "../sdk/hotkeys.js";
import type { InputPhase, InspectorSection } from "../sdk/inspector.js";
import type { OverlayDeclaration, OverlayHandle, OverlayManager, Rect, Size } from "../sdk/overlay.js";
import type { StageNotificationInit, StageNotifier } from "../sdk/notifications.js";
import type { PlayOptions } from "../sdk/audio.js";
import type { PermissionState } from "../sdk/permissions.js";
import type { HostState, TeardownReason } from "../sdk/plugin.js";
import type { PluginConfig } from "./config.js";
import type { EventBus, EventHandler } from "./EventBus.js";
import { SCOPES, type PermissionManager } from "./permissions.js";
import type { ServiceConsumer, ServiceHub } from "./ServiceHub.js";
import type { PluginNode } from "./pluginNode.js";
import { openMeter, type ProcessMeter } from "./processMeter.js";
import type { DiscoveredPlugin } from "./types.js";

const READY_TIMEOUT_MS = 15_000;
const SETUP_TIMEOUT_MS = 30_000;
const TEARDOWN_TIMEOUT_MS = 3_000;
const SERVICE_CALL_TIMEOUT_MS = 10_000;
/** Also the resource sample rate. */
const PING_EVERY_MS = 1_000;
const PING_DEADLINE_MS = 20_000;
const CORES = os.availableParallelism();

/** The only environment variables passed on. On Windows libuv also adds the user-profile ones (USERNAME, USERPROFILE, ...). */
const ENV_ALLOWLIST = [
  "SystemRoot",
  "SYSTEMROOT",
  "windir",
  "TEMP",
  "TMP",
  "PATH",
  "Path",
  "PATHEXT",
  "COMSPEC",
  "NUMBER_OF_PROCESSORS",
  "PROCESSOR_ARCHITECTURE",
  "LANG",
  "TZ",
  "FUSE_LOG_LEVEL",
  "FUSE_CDP_PORT",
];

function bootstrapPath(): string {
  return (
    process.env.FUSE_PLUGIN_BOOTSTRAP ?? path.join(path.dirname(fileURLToPath(import.meta.url)), "plugin-host.js")
  );
}

export interface HostAudio {
  preload(assets: string[]): void;
  play(asset: string, opts: PlayOptions, id: string): void;
  stop(id: string): void;
  stopAll(): void;
}

export interface PluginProcessDeps {
  node: PluginNode;
  config: PluginConfig;
  overlays: OverlayManager;
  hotkeys: HotkeyRegistry;
  events: EventBus;
  notifications: StageNotifier;
  audio: HostAudio;
  permissions: PermissionManager;
  services: ServiceHub;
  /** Brokered services, already bound to this plugin and checked against its permissions. */
  storage(op: string, collection: string, args: unknown[]): Promise<unknown>;
  secrets(op: string, key: unknown, value: unknown): Promise<unknown>;
  openLink(url: string): Promise<boolean>;
  broadcast(message: Record<string, unknown>): void;
  onUnexpectedExit(proc: PluginProcess, detail: string): void;
}

export interface ProcessMetrics {
  /** Bytes: private working set when the runtime measures, working set when self-reported. */
  ram: number;
  /** Share of all cores over the last sample, 0-100; null until two samples. */
  cpu: number | null;
  /** Round trip of the last heartbeat, in ms. */
  ping: number;
  /** host: measured by the runtime. plugin: reported by the plugin's bootstrap, which a hostile plugin could forge. */
  source: "host" | "plugin";
}

export class PluginProcess implements ServiceConsumer {
  readonly pluginId: string;
  /** Measured by the runtime when it can, otherwise the plugin's own report. */
  metrics: ProcessMetrics | null = null;
  readonly log: Logger;
  requiresCalibration = false;
  calibrationStages = 1;
  /** Network was granted when this process started; a different answer later means a restart. */
  netAllowed = false;
  /** Started under the permission model. False only while debugging with FUSE_PLUGIN_INSPECT. */
  sandboxed = true;

  private child: ChildProcess | null = null;
  private channel: Channel | null = null;
  private handles = new Map<string, OverlayHandle>();
  private forwarders = new Map<string, EventHandler>();
  private stopping = false;
  private lastPong = Date.now();
  private pingSentAt = 0;
  /** CPU time and clock in ms at the previous sample. */
  private cpuSample: { cpu: number; at: number } | null = null;
  private meter: ProcessMeter | null = null;
  private pingTimer: NodeJS.Timeout | null = null;
  private fromPlugin = false;
  private readyWaiter: ((error?: Error) => void) | null = null;

  constructor(
    readonly spec: DiscoveredPlugin,
    private readonly deps: PluginProcessDeps,
    private state: HostState,
  ) {
    this.pluginId = spec.pluginId;
    this.log = logger.bind(spec.pluginId);
  }

  get config(): PluginConfig {
    return this.deps.config;
  }

  get pid(): number | undefined {
    return this.child?.pid;
  }

  /** Spawn, load the plugin's class, and resolve once it's ready for `setup()`. */
  async start(): Promise<void> {
    const { node, config, permissions } = this.deps;
    this.netAllowed = permissions.has(this.pluginId, "network");
    // ForkOptions' typings omit windowsHide, but fork passes it on to spawn.
    const options: ForkOptions & { windowsHide: boolean } = {
      execPath: node.execPath,
      execArgv: this.flags(),
      env: { ...pickEnv(), ...node.env },
      cwd: this.spec.packageRoot,
      stdio: ["ignore", "inherit", "inherit", "ipc"],
      serialization: "json",
      windowsHide: true,
    };
    const child = fork(bootstrapPath(), [], options);
    this.child = child;
    // Opened now and held until exit, so the process id can't be reused under us.
    this.meter = openMeter(child.pid);
    const channel = new Channel((payload) => {
      if (child.connected) child.send(payload);
    });
    this.channel = channel;

    const ready = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => this.readyWaiter?.(new Error("the plugin process didn't start in time")),
        READY_TIMEOUT_MS,
      );
      this.readyWaiter = (error) => {
        clearTimeout(timer);
        this.readyWaiter = null;
        if (error) reject(error);
        else resolve();
      };
    });

    channel.onMessage((msg) => {
      try {
        this.dispatch(msg);
      } catch (e) {
        this.log.exception(`handling '${msg.t}' from the plugin failed`, e);
      }
    });
    child.on("message", (raw) => channel.receive(raw));
    child.on("error", (e) => this.readyWaiter?.(e));
    child.on("exit", (code, signal) => this.onExit(code, signal));

    config.onAnyChange((key, value) => {
      if (!this.fromPlugin) this.send({ t: "config.changed", key, value });
    });

    const init: InitMessage = {
      t: "init",
      pluginId: this.pluginId,
      name: this.spec.name,
      version: this.spec.version,
      description: this.spec.description,
      entryPath: this.spec.entryPath,
      entryClass: this.spec.entryClass,
      packageRoot: this.spec.packageRoot,
      manifestHotkeys: { ...(this.spec.manifest.hotkeys ?? {}) },
      config: { path: config.configPath, defaults: config.defaultsSnapshot(), disk: config.readDisk() },
      state: this.state,
      permissions: this.permissionStates(),
      services: this.deps.services.snapshotsFor(this.pluginId),
      logLevel: process.env.FUSE_LOG_LEVEL ?? "info",
    };
    channel.send(init as unknown as WireMessage);
    await ready;
    this.lastPong = Date.now();
    this.pingTimer = setInterval(() => this.heartbeat(), PING_EVERY_MS);
  }

  async setup(): Promise<void> {
    await this.request({ t: "call", method: "setup" }, SETUP_TIMEOUT_MS);
    const cfg = this.deps.config;
    if (!cfg.loaded) {
      cfg.load();
      this.send({ t: "config.snapshot", data: cfg.snapshot() });
    }
  }

  enterCalibrate(stage: number): void {
    this.send({ t: "lifecycle", method: "enterCalibrate", args: [stage] });
  }

  enterLocked(): void {
    this.send({ t: "lifecycle", method: "enterLocked", args: [] });
  }

  enterInteractive(): void {
    this.send({ t: "lifecycle", method: "enterInteractive", args: [] });
  }

  setOverlayVisible(visible: boolean): void {
    this.send({ t: "lifecycle", method: "setOverlayVisible", args: [visible] });
  }

  tick(dt: number): void {
    this.send({ t: "tick", dt });
    this.deps.config.checkReload();
  }

  setState(state: HostState): void {
    if (state === this.state) return;
    this.state = state;
    this.send({ t: "state", state });
  }

  /** Brokered scopes change without a restart; the plugin's copy of its states follows. */
  pushPermissions(): void {
    this.send({ t: "permissions", states: this.permissionStates() });
  }

  /** A `fuse://plugin/<id>/...` link, routed here by Electron main. */
  linkCallback(url: string): void {
    this.send({ t: "links.callback", url });
  }

  async teardown(reason: TeardownReason): Promise<void> {
    if (!this.child || this.stopping) return;
    this.stopping = true;
    try {
      await this.request({ t: "call", method: "teardown", args: [reason] }, TEARDOWN_TIMEOUT_MS);
    } catch (e) {
      this.log.warning(`teardown didn't finish: ${errorText(e)}`);
    }
    this.kill();
  }

  kill(): void {
    this.stopping = true;
    this.release();
    const child = this.child;
    if (child && child.exitCode === null && child.signalCode === null) {
      try {
        child.kill();
      } catch {
        /* already gone */
      }
    }
  }

  deliver(msg: WireMessage): void {
    this.send(msg);
  }

  // --- internals ------------------------------------------------------------

  private flags(): string[] {
    if (process.env.FUSE_PLUGIN_INSPECT === this.pluginId) {
      this.sandboxed = false;
      this.log.warning("FUSE_PLUGIN_INSPECT: running WITHOUT the permission model so a debugger can attach");
      return ["--inspect=0"];
    }
    const flags = [
      "--permission",
      `--allow-fs-read=${path.dirname(bootstrapPath())}`,
      // The package's parent holds the `package.json` that marks the bundle as ESM.
      `--allow-fs-read=${path.dirname(this.spec.packageRoot)}`,
      "--disable-warning=ExperimentalWarning",
    ];
    if (this.netAllowed && this.deps.node.netFlag) flags.push("--allow-net");
    return flags;
  }

  private permissionStates(): Record<string, PermissionState> {
    const scopes = new Set([...Object.keys(SCOPES), ...this.deps.permissions.declared(this.pluginId)]);
    return Object.fromEntries([...scopes].map((scope) => [scope, this.deps.permissions.state(this.pluginId, scope)]));
  }

  private measure(): void {
    const s = this.meter?.sample();
    if (!s) return;
    this.metrics = { ram: s.ram, cpu: this.cpuShare(s.cpuMs, Date.now()), ping: this.metrics?.ping ?? 0, source: "host" };
  }

  /** Fallback when the runtime can't measure: the bootstrap's own numbers, sent with each pong. */
  private selfReport(raw: unknown): void {
    const m = asRecord(raw);
    const ram = Number(m.rss);
    const cpuMicros = Number(m.cpu);
    const at = Number(m.at);
    if (!Number.isFinite(ram) || !Number.isFinite(cpuMicros) || !Number.isFinite(at)) return;
    this.metrics = { ram, cpu: this.cpuShare(cpuMicros / 1000, at), ping: this.metrics?.ping ?? 0, source: "plugin" };
  }

  /** Percent of all cores since the previous sample; the last value until there are two. */
  private cpuShare(cpuMs: number, at: number): number | null {
    const prev = this.cpuSample;
    this.cpuSample = { cpu: cpuMs, at };
    if (!prev || at <= prev.at) return this.metrics?.cpu ?? null;
    return Math.min(100, Math.max(0, ((cpuMs - prev.cpu) / (at - prev.at) / CORES) * 100));
  }

  private send(msg: WireMessage): void {
    this.channel?.send(msg);
  }

  private request<T = unknown>(msg: WireMessage, timeoutMs: number): Promise<T> {
    if (!this.channel) return Promise.reject(new Error("the plugin process isn't running"));
    return this.channel.request<T>(msg, timeoutMs);
  }

  private answer(rid: unknown, work: Promise<unknown>): void {
    work.then(
      (value) => this.channel?.reply(rid, { ok: true, value }),
      (e) => this.channel?.reply(rid, { ok: false, error: errorText(e) }),
    );
  }

  /** A config write the plugin made: don't echo it back unless the runtime changed the value. */
  private asPlugin(fn: () => void): void {
    this.fromPlugin = true;
    try {
      fn();
    } finally {
      this.fromPlugin = false;
    }
  }

  /** Undo everything this process registered on the runtime side. Safe to call twice. */
  private release(): void {
    this.meter?.close();
    this.meter = null;
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    this.readyWaiter?.(new Error("the plugin process stopped"));
    this.channel?.close("the plugin process stopped");
    for (const [event, handler] of this.forwarders) this.deps.events.unsubscribe(event, handler);
    this.forwarders.clear();
    this.deps.hotkeys.unregisterOwner(this.pluginId);
    this.deps.services.removeParticipant(this.pluginId, this);
    this.handles.clear();
  }

  private onExit(code: number | null, signal: NodeJS.Signals | null): void {
    const detail = signal ? `signal ${signal}` : `exit code ${code ?? "?"}`;
    const expected = this.stopping;
    this.stopping = true;
    this.release();
    this.child = null;
    if (expected) {
      this.log.debug(`process exited (${detail})`);
      return;
    }
    this.log.error(`process exited unexpectedly (${detail})`);
    this.deps.onUnexpectedExit(this, detail);
  }

  private heartbeat(): void {
    if (Date.now() - this.lastPong > PING_DEADLINE_MS) {
      this.log.error(`not responding for ${PING_DEADLINE_MS / 1000} s - stopping its process`);
      try {
        this.child?.kill();
      } catch {
        /* already gone */
      }
      return;
    }
    this.measure();
    this.pingSentAt = Date.now();
    this.send({ t: "ping" });
  }

  private dispatch(msg: WireMessage): void {
    const d = this.deps;
    switch (msg.t) {
      case "ready":
        this.requiresCalibration = msg.requiresCalibration === true;
        this.calibrationStages = Math.max(1, Number(msg.calibrationStages) || 1);
        this.readyWaiter?.();
        return;
      case "fail":
        this.readyWaiter?.(new Error(String(msg.error ?? "the plugin failed to load")));
        return;
      case "pong":
        this.lastPong = Date.now();
        if (!this.meter) this.selfReport(msg.metrics);
        if (this.metrics && this.pingSentAt) this.metrics.ping = this.lastPong - this.pingSentAt;
        return;

      case "config.defaults":
        d.config.defaults(asRecord(msg.dict));
        return;
      case "config.load":
        d.config.load();
        return;
      case "config.schema":
        d.config.schema(Array.isArray(msg.items) ? (msg.items as ConfigSchemaItem[]) : []);
        return;
      case "config.set": {
        const key = String(msg.key ?? "");
        if (!key) return;
        this.asPlugin(() => (msg.live === true ? d.config.setLive(key, msg.value) : d.config.set(key, msg.value)));
        const stored = d.config.get<unknown>(key, undefined);
        if (JSON.stringify(stored) !== JSON.stringify(msg.value)) this.send({ t: "config.changed", key, value: stored });
        return;
      }
      case "config.update":
        this.asPlugin(() => d.config.update(asRecord(msg.data)));
        return;
      case "config.save":
        d.config.save();
        return;
      case "config.reload":
        d.config.reload();
        return;
      case "config.onAction":
        d.config.onAction((controlId, payload) => this.send({ t: "config.action", controlId, payload }));
        return;

      case "overlay.declare": {
        const decl = asRecord(msg.decl) as unknown as OverlayDeclaration;
        if (typeof decl.id !== "string" || !decl.id) return;
        this.handles.set(decl.id, d.overlays.declare(decl));
        return;
      }
      case "overlay.op":
        this.overlayOp(String(msg.id ?? ""), String(msg.op ?? ""), Array.isArray(msg.args) ? msg.args : []);
        return;
      case "overlay.onAction": {
        const id = String(msg.id ?? "");
        this.handles.get(id)?.onAction((action, payload) => this.send({ t: "overlay.action", id, action, payload }));
        return;
      }
      case "inspector.sections":
        this.handles
          .get(String(msg.id ?? ""))
          ?.inspector.sections(Array.isArray(msg.sections) ? (msg.sections as InspectorSection[]) : []);
        return;
      case "inspector.patch":
        this.handles.get(String(msg.id ?? ""))?.inspector.patch(String(msg.controlId ?? ""), asRecord(msg.patch));
        return;
      case "inspector.onInput": {
        const id = String(msg.id ?? "");
        this.handles
          .get(id)
          ?.inspector.onInput((controlId: string, value: unknown, phase: InputPhase) =>
            this.send({ t: "inspector.input", id, controlId, value, phase }),
          );
        return;
      }
      case "inspector.onAction": {
        const id = String(msg.id ?? "");
        this.handles
          .get(id)
          ?.inspector.onAction((controlId: string, payload?: unknown) =>
            this.send({ t: "inspector.action", id, controlId, payload }),
          );
        return;
      }

      case "hotkey.register":
        this.registerHotkey(String(msg.combo ?? ""), String(msg.id ?? ""), String(msg.label ?? ""));
        return;
      case "hotkey.unregister": {
        const combo = String(msg.combo ?? "");
        if (this.ownsHotkey(combo)) d.hotkeys.unregister(combo);
        return;
      }
      case "hotkey.reregister": {
        const oldMods = Array.isArray(msg.oldMods) ? msg.oldMods.map(String) : [];
        const oldKey = String(msg.oldKey ?? "");
        const owned = d.hotkeys
          .listBindings(this.pluginId)
          .some((b) => b.key === oldKey && [...b.mods].sort().join("+") === [...oldMods].sort().join("+"));
        if (owned) d.hotkeys.reregister(oldMods, oldKey, String(msg.newCombo ?? ""));
        return;
      }

      case "events.subscribe":
        this.subscribeEvent(String(msg.event ?? ""));
        return;
      case "events.unsubscribe": {
        const event = String(msg.event ?? "");
        const handler = this.forwarders.get(event);
        if (!handler) return;
        d.events.unsubscribe(event, handler);
        this.forwarders.delete(event);
        return;
      }
      case "events.emit": {
        const event = String(msg.event ?? "");
        // host_* events drive the runtime; plugins can listen to them but not fake them.
        if (!event || event.startsWith("host_")) {
          this.log.warning(`can't emit '${event}'`);
          return;
        }
        d.events.emit(event, asRecord(msg.payload));
        return;
      }

      case "notify":
        d.notifications.notify(asRecord(msg.init) as unknown as StageNotificationInit);
        return;
      case "notify.dismiss":
        d.notifications.dismiss(String(msg.id ?? ""));
        return;

      case "audio.preload":
        d.audio.preload(Array.isArray(msg.assets) ? msg.assets.map(String) : []);
        return;
      case "audio.play":
        d.audio.play(String(msg.asset ?? ""), asRecord(msg.opts) as PlayOptions, String(msg.id ?? ""));
        return;
      case "audio.stop":
        d.audio.stop(String(msg.id ?? ""));
        return;
      case "audio.stopAll":
        d.audio.stopAll();
        return;

      case "storage":
        this.answer(msg.rid, d.storage(String(msg.op ?? ""), String(msg.collection ?? ""), Array.isArray(msg.args) ? msg.args : []));
        return;
      case "secrets":
        this.answer(msg.rid, d.secrets(String(msg.op ?? ""), msg.key, msg.value));
        return;
      case "links.open":
        this.answer(msg.rid, d.openLink(String(msg.url ?? "")));
        return;

      case "permissions.request":
        this.answer(msg.rid, d.permissions.scoped(this.pluginId).request(String(msg.scope ?? "")));
        return;

      case "service.provide": {
        const name = String(msg.name ?? "");
        if (!name) return;
        const accepted = d.services.provide(
          this.pluginId,
          name,
          {
            state: asRecord(msg.state),
            reads: asRecord(msg.reads),
            methods: Array.isArray(msg.methods) ? msg.methods : [],
            scopes: asRecord(msg.scopes),
            stateScope: msg.stateScope,
          },
          (method, args) => this.request({ t: "service.invoke", name, method, args }, SERVICE_CALL_TIMEOUT_MS),
        );
        if (!accepted) this.send({ t: "service.refused", name });
        return;
      }
      case "service.withdraw":
        d.services.withdraw(this.pluginId, String(msg.name ?? ""));
        return;
      case "service.publish":
        d.services.publish(this.pluginId, String(msg.name ?? ""), asRecord(msg.patch) as StatePatch);
        return;
      case "service.subscribe":
        d.services.subscribe(this, String(msg.name ?? ""));
        return;
      case "service.call":
        this.answer(
          msg.rid,
          d.services.call(this.pluginId, String(msg.name ?? ""), String(msg.method ?? ""), Array.isArray(msg.args) ? msg.args : []),
        );
        return;

      case "host.broadcast": {
        const message = asRecord(msg.message);
        // Types carry the plugin's id, so one plugin can't pose as another to the App.
        if (!String(message.type ?? "").startsWith(`${this.pluginId}.`)) {
          this.log.warning(`broadcast '${String(message.type)}' refused: the type must start with '${this.pluginId}.'`);
          return;
        }
        d.broadcast(message);
        return;
      }

      default:
        this.log.debug(`unknown message '${msg.t}' from the plugin`);
    }
  }

  private overlayOp(id: string, op: string, args: unknown[]): void {
    const h = this.handles.get(id);
    if (!h) return;
    const path_ = String(args[0] ?? "");
    switch (op) {
      case "set":
        h.set(path_, Number(args[1]));
        return;
      case "setBool":
        h.setBool(path_, Boolean(args[1]));
        return;
      case "setString":
        h.setString(path_, String(args[1] ?? ""));
        return;
      case "setColor":
        h.setColor(path_, Number(args[1]));
        return;
      case "setEnum":
        h.setEnum(path_, String(args[1] ?? ""));
        return;
      case "trigger":
        h.trigger(path_);
        return;
      case "setJson":
        h.setJson(path_, args[1]);
        return;
      case "setRect":
        h.setRect(asRecord(args[0]) as unknown as Rect);
        return;
      case "setSize":
        h.setSize(asRecord(args[0]) as unknown as Size);
        return;
      case "setPositionConfigKey":
        h.setPositionConfigKey(path_);
        return;
      case "setVisible":
        h.setVisible(Boolean(args[0]));
        return;
      case "remove":
        h.remove();
        this.handles.delete(id);
        return;
    }
  }

  private registerHotkey(combo: string, id: string, label: string): void {
    if (!combo || !id) return;
    let owner: string | undefined;
    try {
      owner = this.deps.hotkeys.ownerOf(combo);
    } catch (e) {
      this.log.warning(`hotkey '${combo}': ${errorText(e)}`);
      return;
    }
    if (owner !== undefined && owner !== this.pluginId) {
      this.log.warning(`hotkey '${combo}' is already bound by '${owner || "host"}' - not taken over`);
      return;
    }
    this.deps.hotkeys.register(combo, () => this.send({ t: "hotkey", id }), label, this.pluginId);
  }

  private ownsHotkey(combo: string): boolean {
    try {
      return this.deps.hotkeys.ownerOf(combo) === this.pluginId;
    } catch {
      return false;
    }
  }

  private subscribeEvent(event: string): void {
    if (!event || this.forwarders.has(event)) return;
    const handler: EventHandler = (payload) => this.send({ t: "event", event, payload });
    this.forwarders.set(event, handler);
    this.deps.events.subscribe(event, handler, this.pluginId);
  }
}

function pickEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const key of ENV_ALLOWLIST) {
    const value = process.env[key];
    if (value !== undefined) env[key] = value;
  }
  return env;
}
