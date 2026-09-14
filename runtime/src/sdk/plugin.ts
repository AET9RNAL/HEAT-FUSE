/**
 * Plugin contract.
 *
 * Every plugin subclasses `FusePlugin` and is handed a `FuseContext` during
 * `setup()`. Plugins run in their own process: the context's reads come from
 * local copies the runtime keeps current, and its changes go to the runtime.
 */
import type { Logger } from "../log.js";
import type { PluginConfigApi } from "./config.js";
import type { PluginEvents } from "./events.js";
import type { PluginServices } from "./services.js";
import type { PluginHotkeys } from "./hotkeys.js";
import type { PluginAssets } from "./assets.js";
import type { OverlayManager } from "./overlay.js";
import type { StageNotifier } from "./notifications.js";
import type { PluginAudio } from "./audio.js";
import type { PluginPermissions } from "./permissions.js";
import type { PluginStorage } from "./storage.js";
import type { PluginSecrets } from "./secrets.js";
import type { PluginLinks } from "./links.js";

export type HostState = "calibrate" | "locked" | "interactive";

/** Why a plugin is being torn down. A crash gets no teardown. */
export type TeardownReason = "disable" | "restart" | "shutdown";

/** Minimal host surface exposed to plugins. */
export interface HostView {
  getService<T = unknown>(name: string): T | undefined;
  readonly state: HostState;
  /** Send a message to the App. Its `type` must start with the plugin's id and a dot. */
  broadcast(message: Record<string, unknown>): void;
}

export interface FuseContext {
  config: PluginConfigApi;
  hotkeys: PluginHotkeys;
  assets: PluginAssets;
  services: PluginServices;
  events: PluginEvents;
  overlays: OverlayManager;
  /** Toasts on the overlay stage, attributed to this plugin. */
  notifications: StageNotifier;
  /** Sounds from this plugin's assets, played on the stage window. */
  audio: PluginAudio;
  /** What this plugin declared in its manifest, and what the user allowed. */
  permissions: PluginPermissions;
  /** Private database. Needs `storage`. */
  storage: PluginStorage;
  /** Encrypted values. Needs `secrets`. */
  secrets: PluginSecrets;
  /** Opening pages in the browser, and `fuse://plugin/<id>/...` callbacks. */
  links: PluginLinks;
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
   * so `instanceof` fails across module realms; the loader checks this flag
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
  teardown(_reason?: TeardownReason): void {}

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
