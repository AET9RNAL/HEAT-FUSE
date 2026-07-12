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

export function resolveConfig(filename: string): string {
  if (path.isAbsolute(filename) || filename.includes("/") || filename.includes("\\")) {
    return filename;
  }
  return path.join(CONFIGS_DIR, filename);
}
