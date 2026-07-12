/**
 * Plugin contract.
 *
 * Every plugin subclasses `FusePlugin` and is handed a `FuseContext` during
 * `setup()`. The context owns shared infrastructure (config, hotkeys, assets,
 * events, services, overlays, logger) so plugins never create global state.  
 */
import type { Logger } from "../log.js";
import type { PluginConfig } from "../host/config.js";
import type { EventBus } from "../host/EventBus.js";
import type { ServiceRegistry } from "../host/ServiceRegistry.js";
import type { HotkeyRegistryView } from "./hotkeys.js";
import type { PluginAssets } from "./assets.js";
import type { OverlayManager } from "./overlay.js";

export type HostState = "calibrate" | "locked" | "interactive";

/** Minimal host surface exposed to plugins (avoids a hard dep on FuseHost). */
export interface HostView {
  getPlugin(pluginId: string): FusePlugin | undefined;
  getService<T = unknown>(name: string): T | undefined;
  readonly state: HostState;
  /** Broadcast a custom typed message to connected control clients (the UI). */
  broadcast(message: Record<string, unknown>): void;
}

export interface FuseContext {
  config: PluginConfig;
  hotkeys: HotkeyRegistryView;
  assets: PluginAssets;
  services: ServiceRegistry;
  events: EventBus;
  overlays: OverlayManager;
  host: HostView;
  logger: Logger;

  state: HostState;
  packageRoot: string;
  manifestHotkeys: Record<string, string>;
  extras: Map<string, unknown>;

  hotkeyFor(name: string, fallback?: string): string;
}

export abstract class FusePlugin {
  /**
   * Cross-realm marker. Plugin bundles carry their own copy of this base class,
   * so `instanceof` fails across module realms; discovery checks this flag
   * (inherited by subclasses) instead.
   */
  static readonly isFusePlugin = true;

  static pluginName = "";
  static version = "";
  static description = "";

  static requiresCalibration = false;
  static calibrationStages = 1;

  abstract setup(ctx: FuseContext): void | Promise<void>;

  enterCalibrate(_stage = 1): void {}

  enterLocked(): void {}

  /**
   * Interactive state: overlays stay pinned (not draggable) but receive pointer
   * input, so Vue overlays can expose buttons/inputs. Toggled independently of
   * calibrate/locked via Ctrl+I. Defaults to a no-op.
   */
  enterInteractive(): void {}

  /** Called from the host tick loop every ~50 ms. */
  tick(_dt: number): void {}

  /** Persist state and release resources. */
  teardown(): void {}

  /** Show or hide this plugin's overlays (host game-focus change). */
  setOverlayVisible(_visible: boolean): void {}
}

/** Convenience accessors for the per-instance flags set on the subclass. */
export function pluginRequiresCalibration(p: FusePlugin): boolean {
  return (p.constructor as typeof FusePlugin).requiresCalibration ?? false;
}
export function pluginCalibrationStages(p: FusePlugin): number {
  return (p.constructor as typeof FusePlugin).calibrationStages ?? 1;
}
