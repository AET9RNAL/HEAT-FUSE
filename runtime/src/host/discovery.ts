/**
 * Plugin discovery
 *
 * Plugins ship as `.fuse` ZIP archives whose single top-level directory is the
 * `plugin_id` (e.g. `energy_bar/manifest.json`, `energy_bar/plugin.js`, ...).
 * Each archive is extracted to `data/plugins-cache/<plugin_id>-<checksum>/`,
 * which doubles as the asset root. The runtime never imports plugin code: the
 * entry module is loaded by the plugin's own process. After each scan, the
 * cache keeps only the folders of the archives found in that scan.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { unzipSync, strFromU8 } from "fflate";
import { logger } from "../log.js";
import { PLUGINS_CACHE_DIR, REPO_ROOT } from "../utils/paths.js";
import type { DiscoveredPlugin, Manifest } from "./types.js";

export const USER_PLUGINS_DIR: string = process.env.FUSE_USER_PLUGINS_DIR
  ? path.resolve(process.env.FUSE_USER_PLUGINS_DIR)
  : path.join(REPO_ROOT, "plugins");

/** Called once per archive that couldn't be loaded, with a user-facing reason. */
export type DiscoveryErrorHandler = (file: string, reason: string) => void;

function sha256(buf: Buffer | Uint8Array): string {
  return createHash("sha256").update(buf).digest("hex");
}

/** Extract `files` (from fflate) into `destRoot` if not already present. */
const COMPLETE_MARKER = ".fuse-complete";

function extractOnce(destRoot: string, files: Record<string, Uint8Array>): void {
  // A completion marker (not mere existence) proves the dir is fully written —
  // a crash mid-extract leaves a partial dir that must be redone.
  if (fs.existsSync(path.join(destRoot, COMPLETE_MARKER))) return;
  // Clear any partial (marker-less) leftover so rename has a clean target.
  fs.rmSync(destRoot, RM_RETRY);

  const tmp = `${destRoot}.tmp-${process.pid}-${Date.now()}`;
  fs.rmSync(tmp, RM_RETRY);
  for (const [name, data] of Object.entries(files)) {
    if (name.endsWith("/")) continue; // directory entry
    const out = path.join(tmp, name);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, data);
  }
  // Mark the extracted tree as ESM so `import()` of the bundled entry doesn't
  // fall back to CJS parsing (silences MODULE_TYPELESS_PACKAGE_JSON).
  fs.writeFileSync(path.join(tmp, "package.json"), JSON.stringify({ type: "module" }));
  fs.writeFileSync(path.join(tmp, COMPLETE_MARKER), "");

  // Publish the dir. On Windows a cross-dir rename can EPERM from a concurrent
  // spawn or transient AV/indexer lock, so tolerate races and fall back to copy.
  try {
    fs.renameSync(tmp, destRoot);
  } catch (e) {
    if (fs.existsSync(path.join(destRoot, COMPLETE_MARKER))) {
      // Another process won the race and finished it — use theirs.
      removeLeftover(tmp);
      return;
    }
    try {
      fs.cpSync(tmp, destRoot, { recursive: true, force: true });
    } catch (copyErr) {
      if (!fs.existsSync(path.join(destRoot, COMPLETE_MARKER))) throw copyErr;
    } finally {
      removeLeftover(tmp);
    }
  }
}

/** Windows can hold files of a folder for a moment after a write: retry, as rm does. */
const RM_RETRY = { recursive: true, force: true, maxRetries: 5, retryDelay: 100 } as const;

/** The temp copy of a finished extract. It may stay: the package is complete, and the next scan removes it. */
function removeLeftover(tmp: string): void {
  try {
    fs.rmSync(tmp, RM_RETRY);
  } catch (e) {
    logger.warning(`Could not remove ${path.basename(tmp)} now: ${String(e)} - the next scan removes it`);
  }
}

/** The entry module named by `manifest.entry` ("module:Class"), inside the package. */
function locateEntry(packageRoot: string, entry: string): { entryPath: string; entryClass: string } {
  const [moduleName, className] = entry.split(":");
  if (!moduleName || !className) {
    throw new Error(`manifest 'entry' must be 'module:Class', got '${entry}'`);
  }
  const root = path.resolve(packageRoot);
  for (const ext of [".js", ".mjs", ".cjs", ""]) {
    const candidate = path.resolve(root, moduleName + ext);
    if (!candidate.startsWith(root + path.sep)) break;
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return { entryPath: candidate, entryClass: className };
    }
  }
  throw new Error(`entry module '${moduleName}' not found under ${packageRoot}`);
}

/**
 * Remove every cache folder that no current archive uses
 */
function pruneCache(keep: Set<string>): void {
  let names: string[];
  try {
    names = fs.readdirSync(PLUGINS_CACHE_DIR);
  } catch {
    return; // no cache yet
  }
  for (const name of names) {
    if (keep.has(name)) continue;
    // another runtime process can be writing its extract into this folder now
    const tmp = /\.tmp-(\d+)-\d+$/.exec(name);
    if (tmp && pidAlive(Number(tmp[1]))) continue;
    try {
      fs.rmSync(path.join(PLUGINS_CACHE_DIR, name), RM_RETRY);
      logger.info(`Removed old plugin cache: ${name}`);
    } catch (e) {
      logger.warning(`Could not remove old plugin cache ${name}: ${String(e)}`);
    }
  }
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
}

async function scanFuseArchive(fusePath: string, keep: Set<string>, onError?: DiscoveryErrorHandler): Promise<DiscoveredPlugin | null> {
  const fail = (reason: string): null => {
    onError?.(path.basename(fusePath), reason);
    return null;
  };

  let raw: Buffer;
  try {
    raw = fs.readFileSync(fusePath);
  } catch (e) {
    logger.warning(`Skipping ${path.basename(fusePath)}: ${String(e)}`);
    return fail("The file couldn't be read.");
  }

  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(raw);
  } catch {
    logger.warning(`Skipping ${path.basename(fusePath)}: not a valid ZIP archive`);
    return fail("Not a valid .fuse archive.");
  }

  const topDirs = new Set<string>();
  for (const name of Object.keys(files)) {
    const slash = name.indexOf("/");
    if (slash > 0) topDirs.add(name.slice(0, slash));
  }
  if (topDirs.size !== 1) {
    logger.warning(
      `Skipping ${path.basename(fusePath)}: expected 1 top-level dir, got ${topDirs.size}: ${[...topDirs].join(", ")}`,
    );
    return fail(`Expected one top-level folder, found ${topDirs.size}.`);
  }
  const pluginId = [...topDirs][0]!;

  const manifestBytes = files[`${pluginId}/manifest.json`];
  if (!manifestBytes) {
    logger.error(`Bad manifest inside archive: ${pluginId}/manifest.json missing`);
    return fail("manifest.json is missing.");
  }
  let manifest: Manifest;
  try {
    manifest = JSON.parse(strFromU8(manifestBytes));
  } catch (e) {
    logger.error(`Bad manifest inside ${path.basename(fusePath)}: ${String(e)}`);
    return fail("manifest.json isn't valid JSON.");
  }

  const declaredId = (manifest.plugin_id as string) ?? pluginId;
  if (declaredId !== pluginId) {
    logger.warning(
      `${path.basename(fusePath)}: manifest plugin_id='${declaredId}' differs from archive root dir='${pluginId}' — using archive root`,
    );
  }

  const checksum = sha256(raw);
  const cacheDir = path.join(PLUGINS_CACHE_DIR, `${pluginId}-${checksum.slice(0, 16)}`);
  const packageRoot = path.join(cacheDir, pluginId);
  keep.add(path.basename(cacheDir));
  try {
    extractOnce(cacheDir, files);
  } catch (e) {
    logger.error(`Failed to extract ${path.basename(fusePath)}: ${String(e)}`);
    return fail(`Extraction failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  let located: { entryPath: string; entryClass: string };
  try {
    if (!manifest.entry) throw new Error("manifest missing 'entry'");
    located = locateEntry(packageRoot, manifest.entry);
  } catch (e) {
    logger.error(`Skipping .fuse plugin '${pluginId}': ${String(e)}`);
    return fail(e instanceof Error ? e.message : String(e));
  }

  const version = (manifest.version as string) ?? "0.0";
  const name = (manifest.name as string) ?? pluginId;

  logger.info(`Discovered plugin (.fuse): ${name} [${pluginId}] v${version}`);
  return {
    pluginId,
    name,
    version,
    description: (manifest.description as string) ?? "",
    author: (manifest.author as string) ?? "",
    homepage: (manifest.homepage as string) ?? "",
    tags: (manifest.tags as string[]) ?? [],
    isCore: Boolean(manifest.core),
    archivePath: fusePath,
    packageRoot,
    checksum,
    entryPath: located.entryPath,
    entryClass: located.entryClass,
    requiresCalibration: false,
    calibrationStages: 1,
    manifest,
  };
}

/** Scan `USER_PLUGINS_DIR`, return every valid plugin found, and remove the cache folders no archive uses. */
export async function discover(onError?: DiscoveryErrorHandler): Promise<DiscoveredPlugin[]> {
  const entries = fs.existsSync(USER_PLUGINS_DIR)
    ? fs
        .readdirSync(USER_PLUGINS_DIR)
        .filter((n) => n.endsWith(".fuse"))
        .sort()
    : [];
  const out: DiscoveredPlugin[] = [];
  const keep = new Set<string>();
  for (const name of entries) {
    const spec = await scanFuseArchive(path.join(USER_PLUGINS_DIR, name), keep, onError);
    if (spec) out.push(spec);
  }
  pruneCache(keep);
  return out;
}
