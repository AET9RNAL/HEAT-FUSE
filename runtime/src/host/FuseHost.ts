/**
 * Plugin host
 *
 * Owns the hotkey registry, event bus, service hub, overlay hub, the
 * calibrate/locked state machine (Ctrl+L toggle, Ctrl+P quit, Ctrl+R reload),
 * per-plugin config, and PluginState tracking. Every plugin runs in its own
 * process (PluginProcess). Setup is sequential and queue-driven, kicked off
 * after the first authenticated WS client connects.
 */
import os from "node:os";
import { logger } from "../log.js";
import { ConfigManager, PluginConfig } from "./config.js";
import { EventBus } from "./EventBus.js";
import { OverlayHub } from "./OverlayManager.js";
import { NotificationHub } from "./NotificationHub.js";
import { AudioHub } from "./AudioHub.js";
import { PermissionManager } from "./permissions.js";
import { PluginProcess, type HostAudio, type ProcessMetrics } from "./PluginProcess.js";
import { ServiceHub } from "./ServiceHub.js";
import { StorageHub } from "./StorageHub.js";
import { ElectronBridge } from "./ElectronBridge.js";
import { resolvePluginNode, type PluginNode } from "./pluginNode.js";
import { DevWatcher } from "./devWatch.js";
import { discover } from "./discovery.js";
import { resolveLoadOrder } from "./resolver.js";
import { PluginState } from "./types.js";
import type { DiscoveredPlugin } from "./types.js";
import { HotkeyRegistry } from "../sdk/hotkeys.js";
import { serializeSchema } from "../sdk/configSchema.js";
import type { HostState, TeardownReason } from "../sdk/plugin.js";
import { HotkeyInput, type MouseCallback } from "../input/hotkeys.js";
import type { PluginHydration, RuntimeBridge, WsServer } from "../server/WsServer.js";

export const HOST_VERSION = "5.0.0";
const HOST_CONFIG_FILENAME = "fuse_host.json";
// Also the action names the app's keybind settings and hotkey_overrides use.
const LOCK_HOTKEY_LABEL = "Toggle Calibrate/Lock";
const INTERACTIVE_HOTKEY_LABEL = "Toggle Interactive";
/** Unexpected exits allowed within CRASH_WINDOW_MS before a plugin is left stopped. */
const MAX_RESTARTS = 3;
const CRASH_WINDOW_MS = 120_000;
const RESTART_DELAY_MS = 2_000;
const METRICS_EVERY_MS = 1_000;
const SECRET_KEY_RE = /^[A-Za-z0-9._-]{1,128}$/;
const MAX_SECRET_BYTES = 16 * 1024;
const MAX_LINK_LENGTH = 2048;
const CORES = os.availableParallelism();
/** Resource warnings, once per plugin per session: half a core for 30 s, or 1 GB. */
const HOG_CORE_SHARE = 0.5;
const HOG_CPU_SECONDS = 30;
const HOG_RAM_BYTES = 1024 ** 3;

interface HostConfigState {
  enabled_plugins: string[] | null;
  disabled_plugins: string[];
  hotkey_overrides: Record<string, Record<string, string>>;
  [key: string]: unknown;
}

function versionTuple(v: string): number[] {
  const parts = String(v).split(".").map((x) => Number.parseInt(x, 10));
  return parts.some(Number.isNaN) ? [0] : parts;
}

function cmpTuple(a: number[], b: number[]): number {
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    if (av !== bv) return av < bv ? -1 : 1;
  }
  return 0;
}

/** Null when the host satisfies the manifest, otherwise the user-facing reason it doesn't. */
function compatIssue(manifest: Record<string, unknown>, name: string): string | null {
  const minVer = manifest.min_host_version as string | undefined;
  if (!minVer) return null;
  if (cmpTuple(versionTuple(String(minVer)), versionTuple(HOST_VERSION)) > 0) {
    logger.error(`Plugin '${name}' requires host v${minVer} but FUSE is v${HOST_VERSION} - skipping.`);
    return `Requires FUSE runtime v${minVer}, this is v${HOST_VERSION}.`;
  }
  return null;
}

/** Plain https only; throws with the reason otherwise. */
function parseLink(raw: string): URL {
  if (raw.length > MAX_LINK_LENGTH) throw new Error(`links are limited to ${MAX_LINK_LENGTH} characters`);
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`'${raw.slice(0, 80)}' isn't a valid URL`);
  }
  if (url.protocol !== "https:") throw new Error("only https links can be opened");
  if (url.username || url.password) throw new Error("links can't carry a user name or password");
  return url;
}

/** "ctrl+l" -> "Ctrl+L", matching the app's shortcut hints. */
function formatCombo(combo: string): string {
  return combo
    .split("+")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("+");
}

export class FuseHost implements RuntimeBridge {
  readonly hostVersion = HOST_VERSION;

  readonly hotkeys = new HotkeyRegistry();
  readonly events = new EventBus();
  readonly permissions: PermissionManager;
  private services: ServiceHub;
  private storage = new StorageHub();
  private bridge: ElectronBridge;
  private warnedScopes = new Set<string>();
  /** Consecutive seconds each plugin has been over the CPU threshold. */
  private busySeconds = new Map<string, number>();
  private resourceWarned = new Set<string>();
  private overlayHub: OverlayHub;
  private notificationHub: NotificationHub;
  private audioHub: AudioHub;
  private server: WsServer;
  private input: HotkeyInput;
  private devWatcher: DevWatcher;
  private pluginNode: PluginNode;

  private hostConfig = new ConfigManager(HOST_CONFIG_FILENAME);
  private hostCfgState!: HostConfigState;

  /** Running plugin processes, in load order. */
  private procs = new Map<string, PluginProcess>();
  private pluginStates = new Map<string, PluginState>();
  private discovered = new Map<string, DiscoveredPlugin>();
  /** Unexpected exit times per plugin, for the restart budget. */
  private crashes = new Map<string, number[]>();

  private _state: HostState = "calibrate";
  private lastLockToggle = 0;
  private lastInteractiveToggle = 0;
  private lastTick = performance.now() / 1000;
  private quitting = false;
  private capturingRebind = false;
  private networkNoticeShown = false;

  private mouseSubscribers: MouseCallback[] = [];

  private setupPending: DiscoveredPlugin[] = [];
  private setupActive: DiscoveredPlugin | null = null;
  private autoLockQueue = false;
  private setupCalibStage = 1;
  private calibStage = 1;
  private dequeueStarted = false;
  private tickTimer: NodeJS.Timeout | null = null;
  private metricsTimer: NodeJS.Timeout | null = null;
  private lastStateNotice: string | null = null;

  constructor(server: WsServer, send: ((msg: Record<string, unknown>) => void) | null = null) {
    this.server = server;
    this.overlayHub = new OverlayHub(server);
    this.notificationHub = new NotificationHub(server);
    this.permissions = new PermissionManager(this.notificationHub, send);
    this.permissions.onChange((pluginId) => this.onPermissionsChanged(pluginId));
    this.bridge = new ElectronBridge(send);
    this.services = new ServiceHub((consumer, service, scope, owner) =>
      this.authorizeService(consumer, service, scope, owner),
    );
    this.audioHub = new AudioHub(server, (pluginId, rel) => this.overlayHub.resolveAsset(pluginId, rel));
    this.devWatcher = new DevWatcher(server);
    this.input = new HotkeyInput({
      onKey: (mods, key, pressed) => this.onKeyEvent(mods, key, pressed),
      onMouse: (x, y, button, pressed) => this.onMouseEvent(x, y, button, pressed),
    });

    this.pluginNode = resolvePluginNode();
    logger.info(
      `Plugins run on Node ${this.pluginNode.version} (network permission ${this.pluginNode.netFlag ? "enforced" : "NOT enforced"})`,
    );

    const keyboard = this.input.keyboard;
    this.services.provideHost("keyboard", keyboard, {
      reads: { isHeld: "held" },
      methods: ["press", "release", "tap"],
      state: () => ({ held: Object.fromEntries(keyboard.heldKeys().map((k) => [k, true])) }),
    });

    this.hostCfgState = this.hostConfig.load<HostConfigState>({
      enabled_plugins: null,
      disabled_plugins: [],
      hotkey_overrides: {},
    });

    this.registerGlobalHotkeys();
    this.applyHotkeyOverrides("host");

    this.events.subscribe(
      "host_state_changed",
      (p) => {
        this.server.notifyHostStateChanged(String(p.state), Number(p.calib_stage ?? 1));
        this.broadcastPluginList();
        this.notifyStateChange();
      },
      "core",
    );
  }

  // ======================================================================
  // Lifecycle
  // ======================================================================

  async loadPlugins(): Promise<void> {
    const enabled = this.hostCfgState.enabled_plugins;
    const disabledSet = new Set(this.hostCfgState.disabled_plugins ?? []);

    const rawSpecs = await discover((file, reason) =>
      this.notifyLoadError(`archive-${file}`, `${file} couldn't be loaded`, reason),
    );
    this.permissions.resetRegistrations();
    for (const spec of rawSpecs) {
      this.discovered.set(spec.pluginId, spec);
      this.pluginStates.set(spec.pluginId, PluginState.PENDING);
      this.permissions.register(spec);
    }
    if (!this.pluginNode.netFlag && rawSpecs.some((s) => s.manifest.permissions?.network)) {
      this.notifyNetworkUnenforced();
    }

    const eligible: DiscoveredPlugin[] = [];
    for (const spec of rawSpecs) {
      if (enabled !== null && !enabled.includes(spec.pluginId)) {
        logger.info(`Plugin excluded by enabled_plugins list: ${spec.name}`);
        this.pluginStates.set(spec.pluginId, PluginState.DISABLED);
        continue;
      }
      if (disabledSet.has(spec.pluginId)) {
        logger.info(`Plugin disabled: ${spec.name}`);
        this.pluginStates.set(spec.pluginId, PluginState.DISABLED);
        continue;
      }
      const incompatible = compatIssue(spec.manifest, spec.name);
      if (incompatible) {
        this.pluginStates.set(spec.pluginId, PluginState.SKIPPED);
        this.notifyLoadError(spec.pluginId, `${spec.name} skipped`, incompatible);
        continue;
      }
      eligible.push(spec);
    }

    const ordered = resolveLoadOrder(eligible, (spec, reason) =>
      this.notifyLoadError(spec.pluginId, `${spec.name} skipped`, reason),
    );
    const orderedIds = new Set(ordered.map((s) => s.pluginId));
    for (const spec of eligible) {
      if (!orderedIds.has(spec.pluginId)) this.pluginStates.set(spec.pluginId, PluginState.SKIPPED);
    }
    this.setupPending = [...ordered];
  }

  private async instantiate(spec: DiscoveredPlugin): Promise<void> {
    if (this.procs.has(spec.pluginId)) return;
    const pluginLogger = logger.bind(spec.pluginId);
    const cfg = new PluginConfig(spec.pluginId);
    cfg.defaults(spec.manifest.default_config ?? {});

    const overlays = this.overlayHub.registerPlugin(spec.pluginId, `${spec.packageRoot}/assets`, spec.packageRoot, cfg);
    this.devWatcher.watch(spec.pluginId);

    const proc = new PluginProcess(
      spec,
      {
        node: this.pluginNode,
        config: cfg,
        overlays,
        hotkeys: this.hotkeys,
        events: this.events,
        notifications: this.notificationHub.scoped(spec.pluginId),
        audio: this.hostAudio(spec.pluginId),
        permissions: this.permissions,
        services: this.services,
        storage: (op, collection, args) => this.brokerStorage(spec.pluginId, op, collection, args),
        secrets: (op, key, value) => this.brokerSecrets(spec.pluginId, op, key, value),
        openLink: (url) => this.openLink(spec.pluginId, url),
        broadcast: (message) => this.server.broadcastControl(message),
        onUnexpectedExit: (p, detail) => this.onPluginExited(p, detail),
      },
      this._state,
    );

    this.pluginStates.set(spec.pluginId, PluginState.LOADING);
    try {
      await proc.start();
      spec.requiresCalibration = proc.requiresCalibration;
      spec.calibrationStages = proc.calibrationStages;
      await proc.setup();
    } catch (e) {
      pluginLogger.exception("setup failed", e);
      this.notifyLoadError(spec.pluginId, `${spec.name} failed to start`, e);
      proc.kill();
      this.pluginStates.set(spec.pluginId, PluginState.ERROR);
      this.releasePlugin(spec.pluginId);
      this.notifyPluginStatusChanged(spec.pluginId, PluginState.ERROR);
      return;
    }

    this.pluginStates.set(spec.pluginId, PluginState.ACTIVE);
    this.procs.set(spec.pluginId, proc);
    pluginLogger.info(`Loaded v${spec.version} in process ${proc.pid ?? "?"}${proc.sandboxed ? "" : " (not sandboxed)"}`);
    this.notifyPluginRegistered(spec, PluginState.ACTIVE);
  }

  /** `ctx.audio` for one plugin, refused unless it declared the `audio` scope. */
  private hostAudio(pluginId: string): HostAudio {
    const allowed = (): boolean => this.permissions.check(pluginId, "audio");
    return {
      preload: (assets) => {
        if (allowed()) this.audioHub.preload(pluginId, assets);
      },
      play: (asset, opts, id) => {
        if (allowed()) this.audioHub.play(pluginId, asset, opts, id);
      },
      stop: (id) => this.audioHub.stop(pluginId, id),
      stopAll: () => this.audioHub.stopAll(pluginId),
    };
  }

  /** Stage-side resources a plugin leaves behind when its process stops. */
  private releasePlugin(pluginId: string): void {
    this.overlayHub.removePlugin(pluginId);
    this.audioHub.removePlugin(pluginId);
    this.storage.close(pluginId);
  }

  // ======================================================================
  // Brokered services: storage, secrets, links
  // ======================================================================

  /** Messages from Electron main: answers to bridge requests, link callbacks, permission decisions. */
  onElectronMessage(msg: Record<string, unknown>): void {
    if (this.bridge.onMessage(msg)) return;
    if (msg.type === "links:callback") {
      const pluginId = String(msg.pluginId ?? "");
      const proc = this.procs.get(pluginId);
      if (proc) proc.linkCallback(String(msg.url ?? ""));
      else logger.warning(`links: a callback for '${pluginId}', which isn't running - dropped`);
      return;
    }
    this.permissions.onMessage(msg);
  }

  private authorizeService(consumerId: string, service: string, scope: string, owner: string): boolean {
    const id = `${service}.${scope}`;
    if (!this.permissions.isServiceScope(id, owner)) {
      if (!this.warnedScopes.has(id)) {
        this.warnedScopes.add(id);
        logger.warning(`services: '${owner}' guards '${service}' with '${id}', which its manifest doesn't declare - refused`);
      }
      return false;
    }
    return this.permissions.check(consumerId, id);
  }

  private async brokerStorage(pluginId: string, op: string, collection: string, args: unknown[]): Promise<unknown> {
    if (!this.permissions.check(pluginId, "storage")) throw new Error("storage needs the 'storage' permission");
    return this.storage.handle(pluginId, op, collection, args);
  }

  private async brokerSecrets(pluginId: string, op: string, key: unknown, value: unknown): Promise<unknown> {
    if (!this.permissions.check(pluginId, "secrets")) throw new Error("secrets need the 'secrets' permission");
    if (!["get", "set", "delete", "has"].includes(op)) throw new Error(`unknown secrets operation '${op}'`);
    if (typeof key !== "string" || !SECRET_KEY_RE.test(key)) {
      throw new Error("secret keys are 1-128 letters, digits, '.', '_' or '-'");
    }
    if (op === "set") {
      if (typeof value !== "string") throw new Error("secret values must be strings");
      if (Buffer.byteLength(value, "utf8") > MAX_SECRET_BYTES) {
        throw new Error(`secret values are limited to ${MAX_SECRET_BYTES} bytes`);
      }
    }
    return this.bridge.request("secrets", { op, pluginId, key, ...(op === "set" ? { value } : {}) });
  }

  /** Invalid links throw; a valid one without a recent user action returns false. */
  private async openLink(pluginId: string, url: string): Promise<boolean> {
    const target = parseLink(url);
    if (!this.permissions.consumeUserAction(pluginId)) {
      logger.warning(`links: ${pluginId} tried to open ${target.host} without a user action - ignored`);
      return false;
    }
    await this.bridge.request("links:open", { pluginId, url: target.href });
    const name = this.discovered.get(pluginId)?.name ?? pluginId;
    this.notificationHub.notify("host", {
      id: `link-${pluginId}`,
      type: "info",
      icon: "external",
      title: `${name} opened a page`,
      message: `${target.host} is open in your browser.`,
      duration: 5000,
    });
    return true;
  }

  /** Per-plugin process resources for the stage's info bars, and the resource warnings. */
  private broadcastMetrics(): void {
    const metrics: Record<string, ProcessMetrics> = {};
    for (const [pluginId, proc] of this.procs) {
      if (!proc.metrics) continue;
      metrics[pluginId] = proc.metrics;
      this.watchResources(proc);
    }
    if (this.server.hasOverlayClient()) this.server.broadcastOverlay({ type: "plugin:metrics", metrics });
  }

  /** Warns, never stops: a plugin can be busy for a good reason. */
  private watchResources(proc: PluginProcess): void {
    const m = proc.metrics;
    if (!m) return;
    const busy = m.cpu !== null && m.cpu >= (HOG_CORE_SHARE * 100) / CORES;
    const seconds = busy ? (this.busySeconds.get(proc.pluginId) ?? 0) + METRICS_EVERY_MS / 1000 : 0;
    this.busySeconds.set(proc.pluginId, seconds);
    const name = proc.spec.name;
    if (seconds >= HOG_CPU_SECONDS && m.cpu !== null) {
      this.warnResources(proc, "cpu", `${name} is using a lot of CPU`, `About ${Math.round(m.cpu * CORES)}% of one core for ${HOG_CPU_SECONDS} seconds. If your game stutters, disable it in the App.`);
    }
    if (m.ram >= HOG_RAM_BYTES) {
      this.warnResources(proc, "memory", `${name} is using a lot of memory`, `${(m.ram / 1024 ** 3).toFixed(1)} GB. If your PC slows down, disable it in the App.`);
    }
  }

  private warnResources(proc: PluginProcess, kind: "cpu" | "memory", title: string, message: string): void {
    const key = `${proc.pluginId}:${kind}`;
    if (this.resourceWarned.has(key)) return;
    this.resourceWarned.add(key);
    logger.warning(`${proc.pluginId}: ${title}. ${message}`);
    this.notificationHub.notify("host", { id: `resources-${key}`, type: "warning", icon: kind, title, message, duration: 10_000 });
  }

  async reloadPlugins(): Promise<void> {
    logger.info("FUSE: hot-reloading plugins...");
    this.setupPending = [];
    this.setupActive = null;

    await this.stopAll("restart");
    this.pluginStates.clear();
    this.discovered.clear();

    this._state = "locked";
    this.autoLockQueue = true;
    await this.permissions.waitForDecisions(3000);
    await this.loadPlugins();
    setImmediate(() => void this.dequeueNextPlugin());
    logger.info("FUSE: plugin reload queued.");
  }

  /** Tear every plugin down, consumers before the providers they call. */
  private async stopAll(reason: TeardownReason): Promise<void> {
    const procs = [...this.procs.values()].reverse();
    this.procs.clear();
    for (const proc of procs) {
      await proc.teardown(reason);
      this.releasePlugin(proc.pluginId);
    }
  }

  beginPluginInit(): void {
    if (this.dequeueStarted) return;
    this.dequeueStarted = true;
    setImmediate(() => void this.dequeueNextPlugin());
  }

  /** Launch straight to locked, skipping every plugin's calibration walk (Ctrl+L until locked). */
  setAutoLockOnStart(on: boolean): void {
    if (this.dequeueStarted) return;
    this.autoLockQueue = on;
    if (on) this._state = "locked";
  }

  private async dequeueNextPlugin(): Promise<void> {
    this.setupActive = null;

    if (!this.setupPending.length) {
      logger.info("All plugins initialized.");
      this.autoLockQueue = false;
      this.applyHotkeyOverrides();
      this._state = "locked";
      this.calibStage = 1;
      this.syncStates();
      this.events.emit("host_state_changed", { state: this._state, calib_stage: 1 });
      this.events.emit("host_ready", {});
      return;
    }

    const spec = this.setupPending.shift()!;
    this._state = this.autoLockQueue ? "locked" : "calibrate";
    await this.permissions.ensureConsent(spec.pluginId);
    await this.instantiate(spec);

    const proc = this.procs.get(spec.pluginId);
    if (!proc || this.pluginStates.get(spec.pluginId) !== PluginState.ACTIVE) {
      setImmediate(() => void this.dequeueNextPlugin());
      return;
    }

    if (this.autoLockQueue) {
      proc.setState("locked");
      proc.enterLocked();
      this.events.emit("host_state_changed", { state: this._state, calib_stage: 1 });
      setImmediate(() => void this.dequeueNextPlugin());
      return;
    }

    this.setupActive = spec;
    this.setupCalibStage = 1;
    proc.setState("calibrate");
    proc.enterCalibrate(1);

    if (!proc.requiresCalibration) {
      proc.enterLocked();
      proc.setState("locked");
      this.setupActive = null;
      setImmediate(() => void this.dequeueNextPlugin());
      return;
    }

    this.events.emit("host_state_changed", { state: this._state, calib_stage: this.setupCalibStage });
  }

  private applyHotkeyOverrides(onlyOwner?: string): void {
    const overrides = this.hostCfgState.hotkey_overrides ?? {};
    for (const [pluginId, bindings] of Object.entries(overrides)) {
      if (onlyOwner !== undefined && pluginId !== onlyOwner) continue;
      for (const [action, newCombo] of Object.entries(bindings)) {
        const current = this.hotkeys.listBindings(pluginId).find((b) => b.label === action);
        if (!current) {
          logger.warning(`hotkey_overrides: action '${action}' not found for '${pluginId}' - skipped.`);
          continue;
        }
        if (this.hotkeys.reregister(current.mods, current.key, newCombo)) {
          logger.info(`Applied hotkey override: ${pluginId}/${action} => '${newCombo}'`);
        } else {
          logger.warning(`hotkey_overrides: rebind conflict for ${pluginId}/${action}`);
        }
      }
    }
  }

  // ======================================================================
  // Public plugin management
  // ======================================================================

  setOverlaysVisible(visible: boolean): void {
    for (const proc of this.procs.values()) proc.setOverlayVisible(visible);
  }

  async disablePlugin(pluginId: string): Promise<void> {
    const disabled = [...(this.hostCfgState.disabled_plugins ?? [])];
    if (!disabled.includes(pluginId)) {
      disabled.push(pluginId);
      this.hostCfgState.disabled_plugins = disabled;
      this.hostConfig.save(this.hostCfgState as unknown as Record<string, unknown>);
    }
    this.pluginStates.set(pluginId, PluginState.DISABLED);
    this.notifyPluginStatusChanged(pluginId, PluginState.DISABLED);

    const proc = this.procs.get(pluginId);
    if (!proc) return;
    this.procs.delete(pluginId);
    await proc.teardown("disable");
    this.releasePlugin(pluginId);
    logger.info(`Plugin '${pluginId}' disabled and torn down.`);
  }

  async enablePlugin(pluginId: string): Promise<void> {
    const disabled = [...(this.hostCfgState.disabled_plugins ?? [])];
    const idx = disabled.indexOf(pluginId);
    if (idx >= 0) {
      disabled.splice(idx, 1);
      this.hostCfgState.disabled_plugins = disabled;
      this.hostConfig.save(this.hostCfgState as unknown as Record<string, unknown>);
    }
    if (this.pluginStates.get(pluginId) === PluginState.ACTIVE) return;

    const spec = this.discovered.get(pluginId);
    if (!spec) {
      logger.warning(`enablePlugin: '${pluginId}' not in discovered set.`);
      return;
    }
    this.crashes.delete(pluginId);
    await this.permissions.ensureConsent(pluginId);
    await this.instantiate(spec);
    const proc = this.procs.get(pluginId);
    if (!proc) return;
    this.enterCurrentState(proc);
    logger.info(`Plugin '${pluginId}' enabled at runtime (state=${this._state}).`);
    this.notifyPluginStatusChanged(pluginId, PluginState.ACTIVE);
  }

  /** Bring a plugin that started outside the setup queue into the host's current state. */
  private enterCurrentState(proc: PluginProcess): void {
    proc.setState(this._state);
    if (this._state === "locked") proc.enterLocked();
    else if (this._state === "interactive") proc.enterInteractive();
    else proc.enterCalibrate(this.calibStage);
  }

  private async restartPlugin(pluginId: string): Promise<void> {
    if (this.quitting || this.procs.has(pluginId)) return;
    if ((this.hostCfgState.disabled_plugins ?? []).includes(pluginId)) return;
    const spec = this.discovered.get(pluginId);
    if (!spec) return;
    await this.permissions.ensureConsent(pluginId);
    await this.instantiate(spec);
    const proc = this.procs.get(pluginId);
    if (!proc) return;
    this.enterCurrentState(proc);
    this.notifyPluginStatusChanged(pluginId, PluginState.ACTIVE);
  }

  private onPluginExited(proc: PluginProcess, detail: string): void {
    const { pluginId, spec } = proc;
    if (this.procs.get(pluginId) !== proc) return;
    this.procs.delete(pluginId);
    this.releasePlugin(pluginId);
    this.pluginStates.set(pluginId, PluginState.ERROR);
    this.notifyPluginStatusChanged(pluginId, PluginState.ERROR);
    if (this.setupActive?.pluginId === pluginId) {
      this.setupActive = null;
      setImmediate(() => void this.dequeueNextPlugin());
    }
    if (this.quitting) return;

    const now = Date.now();
    const recent = (this.crashes.get(pluginId) ?? []).filter((t) => now - t < CRASH_WINDOW_MS);
    recent.push(now);
    this.crashes.set(pluginId, recent);
    if (recent.length > MAX_RESTARTS) {
      this.notifyLoadError(
        pluginId,
        `${spec.name} stopped`,
        `It exited ${recent.length} times in ${CRASH_WINDOW_MS / 60_000} minutes (${detail}). Re-enable it to try again.`,
      );
      return;
    }
    this.notificationHub.notify("host", {
      id: `plugin-restart-${pluginId}`,
      type: "warning",
      title: `${spec.name} stopped unexpectedly`,
      message: `Restarting it (${detail}).`,
      duration: 6000,
    });
    setTimeout(() => void this.restartPlugin(pluginId), RESTART_DELAY_MS * recent.length);
  }

  private onPermissionsChanged(pluginId: string): void {
    this.broadcastPluginList();
    const proc = this.procs.get(pluginId);
    if (!proc) return;
    // Network is a spawn flag: a different answer needs a new process.
    if (proc.netAllowed !== this.permissions.has(pluginId, "network")) {
      logger.info(`${pluginId}: network permission changed - restarting its process`);
      void this.restartForPermissions(proc);
      return;
    }
    proc.pushPermissions();
    this.services.refresh(proc);
  }

  private async restartForPermissions(proc: PluginProcess): Promise<void> {
    if (this.procs.get(proc.pluginId) !== proc) return;
    this.procs.delete(proc.pluginId);
    await proc.teardown("restart");
    this.releasePlugin(proc.pluginId);
    await this.restartPlugin(proc.pluginId);
  }

  // ======================================================================
  // Calibrate / locked state machine
  // ======================================================================

  private maxCalibrationStages(): number {
    return Math.max(1, ...[...this.procs.values()].map((p) => p.calibrationStages));
  }

  toggleLock(): void {
    const now = performance.now() / 1000;
    if (now - this.lastLockToggle < 0.25) return;
    this.lastLockToggle = now;

    if (this.setupActive) {
      this.toggleLockSetupMode();
      return;
    }

    // Normal mode: toggle all active plugins.
    if (this._state === "calibrate") {
      const maxStages = this.maxCalibrationStages();
      if (this.calibStage < maxStages) {
        this.calibStage += 1;
        logger.info(`FUSE calibration stage -> ${this.calibStage}/${maxStages}`);
        for (const proc of this.procs.values()) proc.enterCalibrate(this.calibStage);
        this.events.emit("host_state_changed", { state: this._state, calib_stage: this.calibStage });
        return;
      }
      this._state = "locked";
      this.calibStage = 1;
    } else {
      this._state = "calibrate";
      this.calibStage = 1;
    }

    logger.info(`FUSE host state -> ${this._state}`);
    this.syncStates();
    for (const proc of this.procs.values()) {
      if (this._state === "locked") proc.enterLocked();
      else proc.enterCalibrate(1);
    }
    this.events.emit("host_state_changed", { state: this._state, calib_stage: this.calibStage });
  }

  /**
   * Interactive is a separate toggle from the calibrate/locked cycle: it pins
   * overlays in place but lets pointer input reach them (Vue buttons/inputs).
   * Ignored while a plugin is still in setup calibration. Toggling out returns
   * to locked.
   */
  toggleInteractive(): void {
    const now = performance.now() / 1000;
    if (now - this.lastInteractiveToggle < 0.25) return;
    this.lastInteractiveToggle = now;

    // Don't disturb the sequential plugin-setup calibration flow.
    if (this.setupActive) return;

    const entering = this._state !== "interactive";
    this._state = entering ? "interactive" : "locked";
    this.calibStage = 1;
    logger.info(`FUSE host state -> ${this._state}`);
    this.syncStates();
    for (const proc of this.procs.values()) {
      if (entering) proc.enterInteractive();
      else proc.enterLocked();
    }
    this.events.emit("host_state_changed", { state: this._state, calib_stage: this.calibStage });
  }

  private toggleLockSetupMode(): void {
    const spec = this.setupActive!;
    const proc = this.procs.get(spec.pluginId);
    if (!proc || this.pluginStates.get(spec.pluginId) !== PluginState.ACTIVE) return;

    if (this._state === "calibrate") {
      const stages = proc.calibrationStages;
      if (this.setupCalibStage < stages) {
        this.setupCalibStage += 1;
        logger.info(`FUSE setup calibration stage -> ${this.setupCalibStage}/${stages}`);
        proc.enterCalibrate(this.setupCalibStage);
        this.events.emit("host_state_changed", { state: this._state, calib_stage: this.setupCalibStage });
        return;
      }
      this._state = "locked";
      this.setupCalibStage = 1;
      proc.setState("locked");
      logger.info("FUSE host state -> locked");
      proc.enterLocked();
      this.setupActive = null;
      setImmediate(() => void this.dequeueNextPlugin());
    } else {
      this._state = "calibrate";
      this.setupCalibStage = 1;
      proc.setState("calibrate");
      logger.info("FUSE host state -> calibrate");
      proc.enterCalibrate(1);
    }
    this.events.emit("host_state_changed", { state: this._state, calib_stage: this.setupCalibStage });
  }

  private syncStates(): void {
    for (const proc of this.procs.values()) proc.setState(this._state);
  }

  // ======================================================================
  // Input + tick
  // ======================================================================

  private registerGlobalHotkeys(): void {
    this.hotkeys.register("ctrl+l", () => this.toggleLock(), LOCK_HOTKEY_LABEL, "host");
    this.hotkeys.register("ctrl+i", () => this.toggleInteractive(), INTERACTIVE_HOTKEY_LABEL, "host");
    this.hotkeys.register("ctrl+p", () => void this.quit(), "Quit FUSE", "host");
    this.hotkeys.register("ctrl+r", () => void this.reloadPlugins(), "Hot-Reload Plugins", "host");
  }

  subscribeMouse(cb: MouseCallback): void {
    this.mouseSubscribers.push(cb);
  }

  private onKeyEvent(mods: Set<string>, key: string | null, pressed: boolean): void {
    if (!pressed || key == null) return;
    if (this.capturingRebind) return;
    this.hotkeys.dispatch([...mods], key);
  }

  private onMouseEvent(x: number, y: number, button: number, pressed: boolean): void {
    for (const cb of [...this.mouseSubscribers]) {
      try {
        cb(x, y, button, pressed);
      } catch (e) {
        logger.exception("mouse subscriber error", e);
      }
    }
  }

  private tick(): void {
    if (this.quitting) return;
    const now = performance.now() / 1000;
    const dt = now - this.lastTick;
    this.lastTick = now;
    for (const proc of this.procs.values()) proc.tick(dt);
    this.services.publishHost("keyboard");
  }

  start(): void {
    this.input.start();
    this.lastTick = performance.now() / 1000;
    this.tickTimer = setInterval(() => this.tick(), 50);
    this.metricsTimer = setInterval(() => this.broadcastMetrics(), METRICS_EVERY_MS);
  }

  async quit(): Promise<void> {
    if (this.quitting) return;
    this.quitting = true;
    if (this.tickTimer) clearInterval(this.tickTimer);
    if (this.metricsTimer) clearInterval(this.metricsTimer);
    this.input.stop();
    this.devWatcher.stop();
    await this.stopAll("shutdown");
    this.storage.closeAll();
    process.exit(0);
  }

  // ======================================================================
  // RuntimeBridge (server-facing)
  // ======================================================================

  onFirstClient(): void {
    this.beginPluginInit();
  }

  listPlugins(): Array<Record<string, unknown>> {
    const result: Array<Record<string, unknown>> = [];
    for (const [pluginId, spec] of this.discovered) {
      result.push({
        plugin_id: pluginId,
        name: spec.name,
        version: spec.version,
        description: spec.description,
        author: spec.author,
        homepage: spec.homepage,
        tags: [...spec.tags],
        is_core: spec.isCore,
        status: (this.pluginStates.get(pluginId) ?? PluginState.PENDING).valueOf(),
      });
    }
    return result;
  }

  pluginHydration(pluginId: string): PluginHydration {
    const [configSchema, configValues] = this.schemaAndValues(pluginId);
    return { configSchema, configValues, hotkeys: this.hotkeysFor(pluginId) };
  }

  hostState(): { state: string; calib_stage: number } {
    return { state: this._state, calib_stage: this.currentStage() };
  }

  /** Stage the calibrate cycle is on - the setup queue's while a plugin owns it. */
  private currentStage(): number {
    return this.setupActive ? this.setupCalibStage : this.calibStage;
  }

  overlayHydration(): Array<Record<string, unknown>> {
    return this.overlayHub.overlayHydration();
  }
  inspectorHydration(): Array<Record<string, unknown>> {
    return this.overlayHub.inspectorHydration();
  }
  notificationHydration(): unknown[] {
    return this.notificationHub.hydration();
  }
  onStageNotificationDismissed(id: string): void {
    this.notificationHub.onStageDismissed(id);
  }
  audioHydration(): { master: { volume: number; muted: boolean }; preload: string[] } {
    return this.audioHub.hydration();
  }
  rpcAudioSetMaster(params: Record<string, unknown>): Record<string, unknown> {
    this.audioHub.setMaster(params.volume, params.muted);
    return { ok: true };
  }
  onOverlayTransform(overlayId: string, rect: Record<string, number>): void {
    this.overlayHub.onOverlayTransform(overlayId, rect);
  }
  // Stage input is what lets a plugin re-ask for a denied permission.
  onOverlayAction(overlayId: string, action: string, payload?: unknown): void {
    this.permissions.noteUserAction(overlayId.split(":")[0] ?? "");
    this.overlayHub.dispatchAction(overlayId, action, payload);
  }
  onInspectorSet(overlayId: string, controlId: string, value: unknown, phase: "live" | "commit"): void {
    if (phase === "commit") this.permissions.noteUserAction(overlayId.split(":")[0] ?? "");
    this.overlayHub.onInspectorSet(overlayId, controlId, value, phase);
  }
  onInspectorAction(overlayId: string, controlId: string, payload?: unknown): void {
    this.permissions.noteUserAction(overlayId.split(":")[0] ?? "");
    this.overlayHub.onInspectorAction(overlayId, controlId, payload);
  }
  onHostRequest(state: string): void {
    this.requestState(state);
  }
  onPermissionReview(pluginId: string, scope: string): void {
    this.permissions.review(pluginId, scope);
  }

  /**
   * State entry for the stage toolbar. "toggle" is the Ctrl+L cycle - advance a
   * calibration stage, then lock - so the toolbar and the hotkey agree; the
   * explicit states are there for callers that want one specific state.
   */
  requestState(state: string): void {
    if (state === "toggle") {
      this.toggleLock();
      return;
    }
    if (this.setupActive) return;
    if (state !== "locked" && state !== "calibrate") return;
    if (state === this._state) return;
    this._state = state;
    this.calibStage = 1;
    this.syncStates();
    for (const proc of this.procs.values()) {
      if (state === "locked") proc.enterLocked();
      else proc.enterCalibrate(1);
    }
    logger.info(`FUSE host state -> ${this._state} (stage request)`);
    this.events.emit("host_state_changed", { state: this._state, calib_stage: this.calibStage });
  }

  /** Plugin roster for the stage's plugin list - read-only metadata. */
  pluginListForStage(): Array<Record<string, unknown>> {
    const stage = this.currentStage();
    return [...this.discovered].map(([pluginId, spec]) => {
      const status = this.pluginStates.get(pluginId) ?? PluginState.PENDING;
      const active = status === PluginState.ACTIVE;
      const calibrating = active && this._state === "calibrate";
      return {
        plugin_id: pluginId,
        name: spec.name,
        version: spec.version,
        status: status.valueOf(),
        is_core: spec.isCore,
        requires_calibration: spec.requiresCalibration,
        calibration_stages: spec.calibrationStages,
        current_stage: calibrating ? stage : 0,
        state: active ? this._state : status.valueOf(),
        in_setup: this.setupActive?.pluginId === pluginId,
        overlay_ids: this.overlayHub.overlayIdsFor(pluginId),
        permissions: this.permissions.summary(pluginId),
      };
    });
  }

  private broadcastPluginList(): void {
    this.server.broadcastOverlay({ type: "plugin:list", plugins: this.pluginListForStage() });
  }

  /** Host shortcut combos as bound right now, overrides included - the source for on-screen hints. */
  hostHotkeys(): { lock: string; interactive: string } {
    const bindings = this.hotkeys.listBindings("host");
    const combo = (label: string, fallback: string): string =>
      bindings.find((b) => b.label === label)?.combo ?? fallback;
    return { lock: combo(LOCK_HOTKEY_LABEL, "ctrl+l"), interactive: combo(INTERACTIVE_HOTKEY_LABEL, "ctrl+i") };
  }

  private broadcastHostHotkeys(): void {
    const payload = { type: "host:hotkeys", ...this.hostHotkeys() };
    this.server.broadcastControl(payload);
    this.server.broadcastOverlay(payload);
  }
  resolveAsset(pluginId: string, relPath: string): string | null {
    return this.overlayHub.resolveAsset(pluginId, relPath);
  }

  rpcConfigUpdate(params: Record<string, unknown>): Record<string, unknown> {
    const pluginId = params.plugin_id as string | undefined;
    const key = params.key as string | undefined;
    const value = params.value;
    if (pluginId && key != null) {
      const proc = this.procs.get(pluginId);
      if (proc) {
        const accepted = proc.config.accept(key, value);
        if (!accepted.ok) return { updated: {} };
        proc.config.set(key, accepted.value);
        return { updated: { [key]: accepted.value } };
      }
    }
    return { updated: {} };
  }

  rpcConfigAction(params: Record<string, unknown>): Record<string, unknown> {
    const pluginId = String(params.plugin_id ?? "");
    this.permissions.noteUserAction(pluginId);
    const proc = this.procs.get(pluginId);
    const controlId = String(params.control_id ?? "");
    if (!proc || !controlId) return { ok: false };
    return { ok: proc.config.dispatchAction(controlId, params.payload) };
  }

  async rpcSetEnabled(params: Record<string, unknown>): Promise<Record<string, unknown>> {
    const pluginId = params.plugin_id as string;
    const enabled = Boolean(params.enabled);
    if (enabled) await this.enablePlugin(pluginId);
    else await this.disablePlugin(pluginId);
    return { ok: true, plugin_id: pluginId, enabled };
  }

  rpcHotkeyRebind(params: Record<string, unknown>): Record<string, unknown> {
    const pluginId = String(params.plugin_id ?? "");
    const action = String(params.action ?? "");
    const newCombo = String(params.combo ?? "");
    if (!pluginId || !action || !newCombo) return { ok: false, error: "missing params" };

    const current = this.hotkeys.listBindings(pluginId).find((b) => b.label === action);
    if (!current) return { ok: false, error: `action '${action}' not found for '${pluginId}'` };

    if (!this.hotkeys.reregister(current.mods, current.key, newCombo)) {
      return { ok: false, error: "rebind conflict or action not found" };
    }

    const overrides = (this.hostCfgState.hotkey_overrides ??= {});
    (overrides[pluginId] ??= {})[action] = newCombo;
    this.hostConfig.save(this.hostCfgState as unknown as Record<string, unknown>);

    this.server.broadcastControl({ type: "hotkey:rebound", plugin_id: pluginId, action, combo: newCombo });
    if (pluginId === "host") this.broadcastHostHotkeys();
    return { ok: true };
  }

  async rpcOverlaySetVisible(params: Record<string, unknown>): Promise<Record<string, unknown>> {
    const visible = params.visible === undefined ? true : Boolean(params.visible);
    this.setOverlaysVisible(visible);
    return { ok: true, visible };
  }

  // --- notification helpers ----------------------------------------------

  /** Error toast for a plugin or archive that failed to load; the latest failure per key wins. */
  private notifyLoadError(key: string, title: string, err: unknown): void {
    this.notificationHub.notify("host", {
      id: `load-error-${key}`,
      type: "error",
      title,
      message: err instanceof Error ? err.message : String(err),
      duration: 10_000,
    });
  }

  /** Plugins are running on a Node without --allow-net, so a denied network permission can't be enforced. */
  private notifyNetworkUnenforced(): void {
    if (this.networkNoticeShown) return;
    this.networkNoticeShown = true;
    logger.warning(`Plugins run on Node ${this.pluginNode.version}: network permission can't be enforced`);
    this.notificationHub.notify("host", {
      id: "network-unenforced",
      type: "warning",
      icon: "cloud",
      title: "Network access can't be blocked",
      message: `Plugins run on Node ${this.pluginNode.version}, which has no network permission. Plugins you deny can still connect.`,
      duration: 10_000,
    });
  }

  /** One replaceable toast per state change; calibration stage advances don't count. */
  private notifyStateChange(): void {
    // Locks between setup-queue plugins aren't a resting state: the next plugin calibrates straight away.
    if (this._state === "locked" && this.setupPending.length > 0) return;
    const setup = this._state === "calibrate" ? this.setupActive : null;
    const key = `${this._state}:${setup?.pluginId ?? ""}`;
    if (key === this.lastStateNotice) return;
    this.lastStateNotice = key;

    const hk = this.hostHotkeys();
    const lock = formatCombo(hk.lock);
    const interactive = formatCombo(hk.interactive);

    if (this._state === "calibrate") {
      const setupProc = setup ? this.procs.get(setup.pluginId) : undefined;
      const stages = setupProc ? setupProc.calibrationStages : this.maxCalibrationStages();
      const steps = stages > 1 ? `${stages} stages, ${lock} advances.` : `${lock} to lock.`;
      this.notificationHub.notify("host", {
        id: "host-state",
        type: "warning",
        icon: "unlock",
        title: setup ? `Calibrating ${setup.name}` : "Calibrating",
        message: setup ? `First-time setup. ${steps}` : `Arrange overlays. ${steps}`,
        duration: 4000,
      });
      return;
    }

    if (this._state === "interactive") {
      this.notificationHub.notify("host", {
        id: "host-state",
        type: "success",
        icon: "interactive",
        title: "Interactive",
        message: `Overlays take clicks. ${interactive} to lock.`,
        duration: 4000,
      });
      return;
    }

    this.notificationHub.notify("host", {
      id: "host-state",
      type: "info",
      icon: "lock",
      title: "Locked",
      message: `${lock} to calibrate, ${interactive} for interactive.`,
      duration: 4000,
    });
  }

  private notifyPluginRegistered(spec: DiscoveredPlugin, status: PluginState): void {
    const [configSchema, configValues] = this.schemaAndValues(spec.pluginId);
    this.server.broadcastControl({
      type: "plugin:registered",
      plugin_id: spec.pluginId,
      name: spec.name,
      version: spec.version,
      description: spec.description,
      author: spec.author,
      status: status.valueOf(),
      configSchema,
      configValues,
      hotkeys: this.hotkeysFor(spec.pluginId),
    });
    this.installConfigWatchers(spec.pluginId);
    this.broadcastPluginList();
  }

  private installConfigWatchers(pluginId: string): void {
    const config = this.procs.get(pluginId)?.config;
    if (!config) return;
    for (const key of Object.keys(config.snapshot())) {
      config.watch(key, (v) =>
        this.server.broadcastControl({ type: "config:value_changed", plugin_id: pluginId, key, value: v }),
      );
    }
  }

  private notifyPluginStatusChanged(pluginId: string, status: PluginState): void {
    this.server.broadcastControl({ type: "plugin:status_changed", plugin_id: pluginId, status: status.valueOf() });
    this.broadcastPluginList();
  }

  private hotkeysFor(pluginId: string): Array<{ action: string; combo: string; label: string }> {
    const live = this.hotkeys.listBindings(pluginId);
    if (live.length) return live.map((b) => ({ action: b.label, combo: b.combo, label: b.label }));
    const spec = this.discovered.get(pluginId);
    if (!spec) return [];
    return Object.entries(spec.manifest.hotkeys ?? {}).map(([action, combo]) => ({
      action,
      combo,
      label: action,
    }));
  }

  private schemaAndValues(pluginId: string): [Array<Record<string, unknown>>, Record<string, unknown>] {
    const config = this.procs.get(pluginId)?.config;
    if (!config) return [[], {}];
    return [serializeSchema(config.schemaCategories), config.snapshot()];
  }
}
