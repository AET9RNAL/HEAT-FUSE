/**
 * Centralised filesystem path resolution
 *
 * All persistent data lives under `<repo>/data` in dev, or under the dirs
 * provided by Electron via the `FUSE_DATA_DIR` / `FUSE_USER_PLUGINS_DIR` env
 * vars in production. Modules resolve paths through here instead of hand-rolling
 * relative chains so the layout can change in one place.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function findRepoRoot(start: string): string {
  let dir = start;
  for (;;) {
    if (existsSync(path.join(dir, ".git")) || existsSync(path.join(dir, "backend"))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) return start; // hit filesystem root - give up
    dir = parent;
  }
}

const HERE = path.dirname(fileURLToPath(import.meta.url));

export const REPO_ROOT: string = process.env.FUSE_REPO_ROOT
  ? path.resolve(process.env.FUSE_REPO_ROOT)
  : findRepoRoot(HERE);

export const DATA_DIR: string = process.env.FUSE_DATA_DIR
  ? path.resolve(process.env.FUSE_DATA_DIR)
  : path.join(REPO_ROOT, "data");

export const CONFIGS_DIR: string = path.join(DATA_DIR, "configs");
export const LOGS_DIR: string = path.join(DATA_DIR, "logs");

export const PLUGINS_CACHE_DIR: string = path.join(DATA_DIR, "plugins-cache");


export const DEV_PLUGINS_SRC: string = process.env.FUSE_DEV_PLUGINS_SRC
  ? path.resolve(process.env.FUSE_DEV_PLUGINS_SRC)
  : path.join(REPO_ROOT, "plugins-src");

// Unset: every plugin is live-edited whenever the source tree is present, which
// is true in a checkout and false in a packaged install. Set to a comma-separated
// list (or `*`) to narrow it; set to empty to turn it off.
const devEnv = process.env.FUSE_DEV_PLUGINS?.trim();
const devPluginList = (devEnv ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

export const DEV_PLUGINS_ALL: boolean =
  devPluginList.includes("*") || (devEnv === undefined && existsSync(DEV_PLUGINS_SRC));
export const DEV_PLUGINS: ReadonlySet<string> = new Set(devPluginList);

/** True when `pluginId` should have its assets read from `plugins-src`. */
export function isDevPlugin(pluginId: string): boolean {
  return DEV_PLUGINS_ALL || DEV_PLUGINS.has(pluginId);
}

export function resolveConfig(filename: string): string {
  if (path.isAbsolute(filename) || filename.includes("/") || filename.includes("\\")) {
    return filename;
  }
  return path.join(CONFIGS_DIR, filename);
}
