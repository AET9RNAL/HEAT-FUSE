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
  [key: string]: unknown;
}

/** Constructor type for a plugin's entry class. */
export type PluginClass = (new () => FusePlugin) & {
  pluginName: string;
  version: string;
  description: string;
  requiresCalibration: boolean;
  calibrationStages: number;
};

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
  cls: PluginClass;
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
