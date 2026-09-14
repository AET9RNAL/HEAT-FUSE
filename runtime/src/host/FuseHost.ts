/**
 * Plugin host
 *
 * Owns the hotkey registry, event bus, service registry, overlay hub, the
 * calibrate/locked state machine (Ctrl+L toggle, Ctrl+P quit, Ctrl+R reload),
 * per-plugin config, and PluginState tracking. Plugin setup is sequential and
 * queue-driven, kicked off after the first authenticated WS client connects.
 *
 * Node is single-threaded, so `root.after(0, fn)` => `setImmediate`
 * and `root.after(50, tick)` => a 50 ms interval.
 */
import { logger } from "../log.js";
import { ConfigManager, PluginConfig } from "./config.js";
import { EventBus } from "./EventBus.js";
import { ServiceRegistry } from "./ServiceRegistry.js";
import { OverlayHub } from "./OverlayManager.js";
import { NotificationHub } from "./NotificationHub.js";
import { AudioHub } from "./AudioHub.js";
import { DevWatcher } from "./devWatch.js";
import { discover } from "./discovery.js";
import { resolveLoadOrder } from "./resolver.js";
import { PluginState } from "./types.js";
import type { DiscoveredPlugin } from "./types.js";
import { HotkeyRegistry, HotkeyRegistryView } from "../sdk/hotkeys.js";
import { serializeSchema } from "../sdk/configSchema.js";
import {
  pluginCalibrationStages,
  pluginRequiresCalibration,
  type FuseContext,
  type FusePlugin,
  type HostState,
  type HostView,
} from "../sdk/plugin.js";
import { PluginAssets } from "../sdk/assets.js";
import { HotkeyInput, type MouseCallback } from "../input/hotkeys.js";
import type { PluginHydration, RuntimeBridge, WsServer } from "../server/WsServer.js";

export const HOST_VERSION = "5.0.0";
const HOST_CONFIG_FILENAME = "fuse_host.json";
// Also the action names the app's keybind settings and hotkey_overrides use.
const LOCK_HOTKEY_LABEL = "Toggle Calibrate/Lock";
const INTERACTIVE_HOTKEY_LABEL = "Toggle Interactive";

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

/** "ctrl+l" -> "Ctrl+L", matching the app's shortcut hints. */
function formatCombo(combo: string): string {
  return combo
    .split("+")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("+");
}

export class FuseHost implements RuntimeBridge, HostView {
  readonly hostVersion = HOST_VERSION;

  readonly hotkeys = new HotkeyRegistry();
  readonly events = new EventBus();
  readonly services = new ServiceRegistry();
  private overlayHub: OverlayHub;
  private notificationHub: NotificationHub;
  private audioHub: AudioHub;
  private server: WsServer;
  private input: HotkeyInput;
  private devWatcher: DevWatcher;

  private hostConfig = new ConfigManager(HOST_CONFIG_FILENAME);
  private hostCfgState!: HostConfigState;

  private plugins: FusePlugin[] = [];
  private contexts: FuseContext[] = [];
  private pluginMap = new Map<string, FusePlugin>();
  private contextMap = new Map<string, FuseContext>();
  private pluginStates = new Map<string, PluginState>();
  private discovered = new Map<string, DiscoveredPlugin>();

  private _state: HostState = "calibrate";
  private lastLockToggle = 0;
  private lastInteractiveToggle = 0;
  private lastTick = performance.now() / 1000;
  private quitting = false;
  private capturingRebind = false;

  private mouseSubscribers: MouseCallback[] = [];

  private setupPending: DiscoveredPlugin[] = [];
  private setupActive: DiscoveredPlugin | null = null;
  private autoLockQueue = false;
  private setupCalibStage = 1;
  private calibStage = 1;
  private dequeueStarted = false;
  private tickTimer: NodeJS.Timeout | null = null;
  private lastStateNotice: string | null = null;

  constructor(server: WsServer) {
    this.server = server;
    this.overlayHub = new OverlayHub(server);
    this.notificationHub = new NotificationHub(server);
    this.audioHub = new AudioHub(server, (pluginId, rel) => this.overlayHub.resolveAsset(pluginId, rel));
    this.devWatcher = new DevWatcher(server);
    this.input = new HotkeyInput({
      onKey: (mods, key, pressed) => this.onKeyEvent(mods, key, pressed),
      onMouse: (x, y, button, pressed) => this.onMouseEvent(x, y, button, pressed),
    });
    this.services.register("keyboard", this.input.keyboard, "host");

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
  // HostView (plugin-facing)
  // ======================================================================

  getPlugin(pluginId: string): FusePlugin | undefined {
    return this.pluginMap.get(pluginId);
  }
  getService<T = unknown>(name: string): T | undefined {
    return this.services.get<T>(name);
  }
  get state(): HostState {
    return this._state;
  }
  broadcast(message: Record<string, unknown>): void {
    this.server.broadcastControl(message);
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
    for (const spec of rawSpecs) {
      this.discovered.set(spec.pluginId, spec);
      this.pluginStates.set(spec.pluginId, PluginState.PENDING);
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
    const plugin = new spec.cls();
    const pluginLogger = logger.bind(spec.pluginId);
    const assetsRoot = `${spec.packageRoot}/assets`;
    const assets = new PluginAssets(assetsRoot);

    const cfg = new PluginConfig(spec.pluginId);
    cfg.defaults(spec.manifest.default_config ?? {});

    const overlays = this.overlayHub.registerPlugin(spec.pluginId, assetsRoot, spec.packageRoot, cfg);
    this.devWatcher.watch(spec.pluginId);
    const manifestHotkeys = { ...(spec.manifest.hotkeys ?? {}) };

    const ctx: FuseContext = {
      config: cfg,
      hotkeys: new HotkeyRegistryView(this.hotkeys, spec.pluginId),
      assets,
      services: this.services,
      events: this.events,
      overlays,
      notifications: this.notificationHub.scoped(spec.pluginId),
      audio: this.audioHub.scoped(spec.pluginId),
      host: this,
      logger: pluginLogger,
      state: this._state,
      packageRoot: spec.packageRoot,
      manifestHotkeys,
      extras: new Map(),
      hotkeyFor: (name, fallback = "") => manifestHotkeys[name] ?? fallback,
    };

    this.pluginStates.set(spec.pluginId, PluginState.LOADING);
    try {
      await plugin.setup(ctx);
    } catch (e) {
      pluginLogger.exception("setup failed", e);
      this.notifyLoadError(spec.pluginId, `${spec.name} failed to start`, e);
      this.pluginStates.set(spec.pluginId, PluginState.ERROR);
      this.overlayHub.removePlugin(spec.pluginId);
      this.audioHub.removePlugin(spec.pluginId);
      this.notifyPluginStatusChanged(spec.pluginId, PluginState.ERROR);
      return;
    }

    if (!cfg.loaded) cfg.load();

    this.pluginStates.set(spec.pluginId, PluginState.ACTIVE);
    this.plugins.push(plugin);
    this.contexts.push(ctx);
    this.pluginMap.set(spec.pluginId, plugin);
    this.contextMap.set(spec.pluginId, ctx);
    pluginLogger.info(`Loaded v${spec.version}`);
    this.notifyPluginRegistered(spec, PluginState.ACTIVE);
  }

  async reloadPlugins(): Promise<void> {
    logger.info("FUSE: hot-reloading plugins...");
    this.setupPending = [];
    this.setupActive = null;

    for (const plugin of [...this.plugins].reverse()) {
      try {
        plugin.teardown();
      } catch (e) {
        logger.exception(`${describe(plugin)}: teardown during reload failed`, e);
      }
    }
    for (const pid of this.pluginMap.keys()) {
      this.overlayHub.removePlugin(pid);
      this.audioHub.removePlugin(pid);
    }

    this.plugins = [];
    this.contexts = [];
    this.pluginMap.clear();
    this.contextMap.clear();
    this.pluginStates.clear();
    this.discovered.clear();

    this._state = "locked";
    this.autoLockQueue = true;
    await this.loadPlugins();
    setImmediate(() => void this.dequeueNextPlugin());
    logger.info("FUSE: plugin reload queued.");
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
      this.syncContextStates();
      this.events.emit("host_state_changed", { state: this._state, calib_stage: 1 });
      this.events.emit("host_ready", {});
      return;
    }

    const spec = this.setupPending.shift()!;
    this._state = this.autoLockQueue ? "locked" : "calibrate";
    await this.instantiate(spec);

    if (this.pluginStates.get(spec.pluginId) !== PluginState.ACTIVE) {
      setImmediate(() => void this.dequeueNextPlugin());
      return;
    }

    const plugin = this.pluginMap.get(spec.pluginId)!;
    const ctx = this.contextMap.get(spec.pluginId)!;

    if (this.autoLockQueue) {
      ctx.state = "locked";
      try {
        plugin.enterLocked();
      } catch (e) {
        logger.exception(`${spec.name}: enterLocked failed`, e);
        this.notifyLoadError(spec.pluginId, `${spec.name} failed to lock`, e);
      }
      this.events.emit("host_state_changed", { state: this._state, calib_stage: 1 });
      setImmediate(() => void this.dequeueNextPlugin());
      return;
    }

    this.setupActive = spec;
    this.setupCalibStage = 1;
    ctx.state = "calibrate";
    try {
      plugin.enterCalibrate(1);
    } catch (e) {
      logger.exception(`${spec.name}: enterCalibrate failed`, e);
      this.notifyLoadError(spec.pluginId, `${spec.name} failed to calibrate`, e);
    }

    if (!pluginRequiresCalibration(plugin)) {
      try {
        plugin.enterLocked();
        ctx.state = "locked";
      } catch (e) {
        logger.exception(`${spec.name}: enterLocked failed`, e);
        this.notifyLoadError(spec.pluginId, `${spec.name} failed to lock`, e);
      }
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
    for (const plugin of this.plugins) {
      try {
        plugin.setOverlayVisible(visible);
      } catch (e) {
        logger.exception(`${describe(plugin)}: setOverlayVisible failed`, e);
      }
    }
  }

  disablePlugin(pluginId: string): void {
    const disabled = [...(this.hostCfgState.disabled_plugins ?? [])];
    if (!disabled.includes(pluginId)) {
      disabled.push(pluginId);
      this.hostCfgState.disabled_plugins = disabled;
      this.hostConfig.save(this.hostCfgState as unknown as Record<string, unknown>);
    }
    this.pluginStates.set(pluginId, PluginState.DISABLED);
    this.notifyPluginStatusChanged(pluginId, PluginState.DISABLED);

    const plugin = this.pluginMap.get(pluginId);
    if (plugin) {
      this.pluginMap.delete(pluginId);
      const ctx = this.contextMap.get(pluginId);
      this.contextMap.delete(pluginId);
      this.plugins = this.plugins.filter((p) => p !== plugin);
      this.contexts = this.contexts.filter((c) => c !== ctx);
      try {
        plugin.teardown();
      } catch (e) {
        logger.exception(`${pluginId}: teardown during disable failed`, e);
      }
      this.overlayHub.removePlugin(pluginId);
      this.audioHub.removePlugin(pluginId);
      logger.info(`Plugin '${pluginId}' disabled and torn down.`);
    }
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
    await this.instantiate(spec);
    if (this.pluginStates.get(pluginId) !== PluginState.ACTIVE) return;

    const plugin = this.pluginMap.get(pluginId)!;
    const ctx = this.contextMap.get(pluginId)!;
    ctx.state = this._state;
    try {
      if (this._state === "locked") plugin.enterLocked();
      else plugin.enterCalibrate(this.calibStage);
    } catch (e) {
      logger.exception(`${pluginId}: state entry on enable failed`, e);
      this.notifyLoadError(pluginId, `${spec.name} failed to start`, e);
    }
    logger.info(`Plugin '${pluginId}' enabled at runtime (state=${this._state}).`);
    this.notifyPluginStatusChanged(pluginId, PluginState.ACTIVE);
  }

  // ======================================================================
  // Calibrate / locked state machine
  // ======================================================================

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
      const maxStages = Math.max(1, ...this.plugins.map((p) => pluginCalibrationStages(p)));
      if (this.calibStage < maxStages) {
        this.calibStage += 1;
        logger.info(`FUSE calibration stage -> ${this.calibStage}/${maxStages}`);
        for (const plugin of this.plugins) {
          try {
            plugin.enterCalibrate(this.calibStage);
          } catch (e) {
            logger.exception(`${describe(plugin)}: enterCalibrate(${this.calibStage}) failed`, e);
          }
        }
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
    this.syncContextStates();
    for (const plugin of this.plugins) {
      try {
        if (this._state === "locked") plugin.enterLocked();
        else plugin.enterCalibrate(1);
      } catch (e) {
        logger.exception(`${describe(plugin)}: state change error`, e);
      }
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
    this.syncContextStates();
    for (const plugin of this.plugins) {
      try {
        if (entering) plugin.enterInteractive();
        else plugin.enterLocked();
      } catch (e) {
        logger.exception(`${describe(plugin)}: interactive toggle error`, e);
      }
    }
    this.events.emit("host_state_changed", { state: this._state, calib_stage: this.calibStage });
  }

  private toggleLockSetupMode(): void {
    const spec = this.setupActive!;
    const plugin = this.pluginMap.get(spec.pluginId);
    const ctx = this.contextMap.get(spec.pluginId);
    if (!plugin || this.pluginStates.get(spec.pluginId) !== PluginState.ACTIVE) return;

    if (this._state === "calibrate") {
      const stages = pluginCalibrationStages(plugin);
      if (this.setupCalibStage < stages) {
        this.setupCalibStage += 1;
        logger.info(`FUSE setup calibration stage -> ${this.setupCalibStage}/${stages}`);
        try {
          plugin.enterCalibrate(this.setupCalibStage);
        } catch (e) {
          logger.exception(`${spec.name}: enterCalibrate(${this.setupCalibStage}) failed`, e);
          this.notifyLoadError(spec.pluginId, `${spec.name} failed to calibrate`, e);
        }
        this.events.emit("host_state_changed", { state: this._state, calib_stage: this.setupCalibStage });
        return;
      }
      this._state = "locked";
      this.setupCalibStage = 1;
      if (ctx) ctx.state = "locked";
      logger.info("FUSE host state -> locked");
      try {
        plugin.enterLocked();
      } catch (e) {
        logger.exception(`${spec.name}: enterLocked failed`, e);
        this.notifyLoadError(spec.pluginId, `${spec.name} failed to lock`, e);
      }
      this.setupActive = null;
      setImmediate(() => void this.dequeueNextPlugin());
    } else {
      this._state = "calibrate";
      this.setupCalibStage = 1;
      if (ctx) ctx.state = "calibrate";
      logger.info("FUSE host state -> calibrate");
      try {
        plugin.enterCalibrate(1);
      } catch (e) {
        logger.exception(`${spec.name}: enterCalibrate(1) failed`, e);
        this.notifyLoadError(spec.pluginId, `${spec.name} failed to calibrate`, e);
      }
    }
    this.events.emit("host_state_changed", { state: this._state, calib_stage: this.setupCalibStage });
  }

  private syncContextStates(): void {
    for (const ctx of this.contexts) ctx.state = this._state;
  }

  // ======================================================================
  // Input + tick
  // ======================================================================

  private registerGlobalHotkeys(): void {
    this.hotkeys.register("ctrl+l", () => this.toggleLock(), LOCK_HOTKEY_LABEL, "host");
    this.hotkeys.register("ctrl+i", () => this.toggleInteractive(), INTERACTIVE_HOTKEY_LABEL, "host");
    this.hotkeys.register("ctrl+p", () => this.quit(), "Quit FUSE", "host");
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
    for (const plugin of this.plugins) {
      try {
        plugin.tick(dt);
      } catch (e) {
        logger.exception(`${describe(plugin)}: tick error`, e);
      }
    }
  }

  start(): void {
    this.input.start();
    this.lastTick = performance.now() / 1000;
    this.tickTimer = setInterval(() => this.tick(), 50);
  }

  quit(): void {
    this.quitting = true;
    if (this.tickTimer) clearInterval(this.tickTimer);
    this.input.stop();
    this.devWatcher.stop();
    for (const plugin of this.plugins) {
      try {
        plugin.teardown();
      } catch (e) {
        logger.exception(`${describe(plugin)}: teardown error`, e);
      }
    }
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
  onOverlayAction(overlayId: string, action: string, payload?: unknown): void {
    this.overlayHub.dispatchAction(overlayId, action, payload);
  }
  onInspectorSet(overlayId: string, controlId: string, value: unknown, phase: "live" | "commit"): void {
    this.overlayHub.onInspectorSet(overlayId, controlId, value, phase);
  }
  onInspectorAction(overlayId: string, controlId: string, payload?: unknown): void {
    this.overlayHub.onInspectorAction(overlayId, controlId, payload);
  }
  onHostRequest(state: string): void {
    this.requestState(state);
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
    this.syncContextStates();
    for (const plugin of this.plugins) {
      try {
        if (state === "locked") plugin.enterLocked();
        else plugin.enterCalibrate(1);
      } catch (e) {
        logger.exception(`${describe(plugin)}: state change error`, e);
      }
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
        requires_calibration: spec.cls.requiresCalibration ?? false,
        calibration_stages: spec.cls.calibrationStages ?? 1,
        current_stage: calibrating ? stage : 0,
        state: active ? this._state : status.valueOf(),
        in_setup: this.setupActive?.pluginId === pluginId,
        overlay_ids: this.overlayHub.overlayIdsFor(pluginId),
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
      const ctx = this.contextMap.get(pluginId);
      if (ctx) {
        const accepted = ctx.config.accept(key, value);
        if (!accepted.ok) return { updated: {} };
        ctx.config.set(key, accepted.value);
        return { updated: { [key]: accepted.value } };
      }
    }
    return { updated: {} };
  }

  rpcConfigAction(params: Record<string, unknown>): Record<string, unknown> {
    const ctx = this.contextMap.get(String(params.plugin_id ?? ""));
    const controlId = String(params.control_id ?? "");
    if (!ctx || !controlId) return { ok: false };
    return { ok: ctx.config.dispatchAction(controlId, params.payload) };
  }

  async rpcSetEnabled(params: Record<string, unknown>): Promise<Record<string, unknown>> {
    const pluginId = params.plugin_id as string;
    const enabled = Boolean(params.enabled);
    if (enabled) await this.enablePlugin(pluginId);
    else this.disablePlugin(pluginId);
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
      const setupPlugin = setup ? this.pluginMap.get(setup.pluginId) : undefined;
      const stages = setupPlugin
        ? pluginCalibrationStages(setupPlugin)
        : Math.max(1, ...this.plugins.map((p) => pluginCalibrationStages(p)));
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
    const ctx = this.contextMap.get(pluginId);
    if (!ctx) return;
    for (const key of Object.keys(ctx.config.snapshot())) {
      ctx.config.watch(key, (v) =>
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
    const ctx = this.contextMap.get(pluginId);
    if (!ctx) return [[], {}];
    const schema = serializeSchema(ctx.config.schemaCategories);
    return [schema, ctx.config.snapshot()];
  }
}

function describe(p: FusePlugin): string {
  return (p.constructor as { pluginName?: string }).pluginName ?? p.constructor.name;
}
