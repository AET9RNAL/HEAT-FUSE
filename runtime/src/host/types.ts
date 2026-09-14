/**
 * Shared runtime types. `Manifest` mirrors the `manifest.json` schema;
 */
import type { FusePlugin } from "../sdk/plugin.js";

/** Dependencies: legacy list (any version) or dict of name => version spec. */
export type DependencySpec = string[] | Record<string, string>;

export interface Manifest {
  plugin_id?: string;
  name?: string;
  version?: string;
  author?: string;
  description?: string;
  homepage?: string;
  entry: string;
  tags?: string[];
  core?: boolean;
  dependencies?: DependencySpec;
  optional_dependencies?: string[];
  hotkeys?: Record<string, string>;
  default_config?: Record<string, unknown>;
  min_host_version?: string;
  runtime?: string;
  sdkVersion?: string;
  /** Scope -> the author's reason, shown to the user. */
  permissions?: Record<string, { reason?: string }>;
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
  /** Entry module inside the extracted package; only the plugin's own process imports it. */
  entryPath: string;
  /** Exported class named by `manifest.entry`. */
  entryClass: string;
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
