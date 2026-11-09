/**
 * Shared runtime types. `Manifest` mirrors the `manifest.json` schema;
 */
import type { FusePlugin } from "../sdk/plugin.js";

/** Dependencies: legacy list (any version) or dict of name => version spec. */
export type DependencySpec = string[] | Record<string, string>;

/** The override part of a manifest: prebuilt game file packs that FUSE puts into the game. */
export interface OverrideManifest {
  format?: number;
  presets?: Array<{ id?: string; name?: string; dir?: string; preview?: string }>;
  /** The preset to use before the user picks one, or null for none. */
  default?: string | null;
}

export interface Manifest {
  plugin_id?: string;
  name?: string;
  version?: string;
  author?: string;
  description?: string;
  homepage?: string;
  /** The runtime part. A plugin with an `override` part can leave it out. */
  entry?: string;
  override?: OverrideManifest;
  tags?: string[];
  core?: boolean;
  dependencies?: DependencySpec;
  optional_dependencies?: string[];
  hotkeys?: Record<string, string>;
  default_config?: Record<string, unknown>;
  min_host_version?: string;
  /** Game versions (X.Y.Z) the plugin fits. Required with an `override` part, together with `min_host_version`. */
  game_versions?: string[];
  runtime?: string;
  sdkVersion?: string;
  /** Scope -> the author's reason, shown to the user. */
  permissions?: Record<string, { reason?: string }>;
  /** https sites its overlays may show in an iframe: `https://site.net` or `https://*.site.net`. */
  frames?: string[];
  /** Services this plugin provides, and the scopes consumers need for them (`<service>.<scope>`). */
  provides?: Record<
    string,
    { description?: string; scopes?: Record<string, { label?: string; description?: string; level?: "normal" | "dangerous" }> }
  >;
  [key: string]: unknown;
}

export interface DiscoveredPlugin {
  pluginId: string;
  name: string;
  version: string;
  description: string;
  author: string;
  homepage: string;
  tags: string[];
  isCore: boolean;
  archivePath: string;
  packageRoot: string;
  checksum: string;
  /** Entry module inside the extracted package; only the plugin's own process imports it. Empty without a runtime part. */
  entryPath: string;
  /** Exported class named by `manifest.entry`. Empty without a runtime part. */
  entryClass: string;
  /** The plugin has a runtime part, so it gets a process. An override-only plugin does not. */
  hasRuntime: boolean;
  /** Reported by the plugin process once its class is loaded. */
  requiresCalibration: boolean;
  calibrationStages: number;
  manifest: Manifest;
}

export enum PluginState {
  PENDING = "pending",
  LOADING = "loading",
  ACTIVE = "active",
  DISABLED = "disabled",
  SKIPPED = "skipped",
  ERROR = "error",
}
