/**
 * Plugin discovery
 *
 * Plugins ship as `.fuse` ZIP archives whose single top-level directory is the
 * `plugin_id` (e.g. `energy_bar/manifest.json`, `energy_bar/plugin.js`, ...).
 * Each archive is extracted to `data/plugins-cache/<plugin_id>-<checksum>/` 
 * and the entry class is loaded via dynamic `import()`. The extracted dir 
 * doubles as the asset root.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { unzipSync, strFromU8 } from "fflate";
import { logger } from "../log.js";
import { PLUGINS_CACHE_DIR, REPO_ROOT } from "../utils/paths.js";
import { FusePlugin } from "../sdk/plugin.js";
import type { DiscoveredPlugin, Manifest, PluginClass } from "./types.js";

export const USER_PLUGINS_DIR: string = process.env.FUSE_USER_PLUGINS_DIR
  ? path.resolve(process.env.FUSE_USER_PLUGINS_DIR)
  : path.join(REPO_ROOT, "plugins");

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
  fs.rmSync(destRoot, { recursive: true, force: true });

  const tmp = `${destRoot}.tmp-${process.pid}-${Date.now()}`;
  fs.rmSync(tmp, { recursive: true, force: true });
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
      fs.rmSync(tmp, { recursive: true, force: true });
      return;
    }
    try {
      fs.cpSync(tmp, destRoot, { recursive: true, force: true });
    } catch (copyErr) {
      if (!fs.existsSync(path.join(destRoot, COMPLETE_MARKER))) throw copyErr;
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }
}

/** Resolve the entry export from an extracted package. */
async function resolveEntry(packageRoot: string, entry: string): Promise<PluginClass> {
  const [moduleName, className] = entry.split(":");
  if (!moduleName || !className) {
    throw new Error(`manifest 'entry' must be 'module:Class', got '${entry}'`);
  }
  let modPath = "";
  for (const ext of [".js", ".mjs", ".cjs", ""]) {
    const candidate = path.join(packageRoot, moduleName + ext);
    if (fs.existsSync(candidate)) {
      modPath = candidate;
      break;
    }
  }
  if (!modPath) throw new Error(`entry module '${moduleName}' not found under ${packageRoot}`);

  const mod = await import(pathToFileURL(modPath).href);
  const cls = mod[className] ?? mod.default?.[className] ?? (className === "default" ? mod.default : undefined);
  // Duck-typed check: plugin bundles carry their own FusePlugin copy, so a
  // cross-realm `instanceof` would fail. Check the inherited static marker and
  // a `setup` method on the prototype instead.
  const marked = typeof cls === "function" && (cls.isFusePlugin === true || cls.prototype instanceof FusePlugin);
  if (!marked || typeof cls.prototype?.setup !== "function") {
    throw new Error(`${moduleName}:${className} is not a FusePlugin`);
  }
  return cls as PluginClass;
}

async function scanFuseArchive(fusePath: string): Promise<DiscoveredPlugin | null> {
  let raw: Buffer;
  try {
    raw = fs.readFileSync(fusePath);
  } catch (e) {
    logger.warning(`Skipping ${path.basename(fusePath)}: ${String(e)}`);
    return null;
  }

  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(raw);
  } catch {
    logger.warning(`Skipping ${path.basename(fusePath)}: not a valid ZIP archive`);
    return null;
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
    return null;
  }
  const pluginId = [...topDirs][0]!;

  const manifestBytes = files[`${pluginId}/manifest.json`];
  if (!manifestBytes) {
    logger.error(`Bad manifest inside archive: ${pluginId}/manifest.json missing`);
    return null;
  }
  let manifest: Manifest;
  try {
    manifest = JSON.parse(strFromU8(manifestBytes));
  } catch (e) {
    logger.error(`Bad manifest inside ${path.basename(fusePath)}: ${String(e)}`);
    return null;
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
  try {
    extractOnce(cacheDir, files);
  } catch (e) {
    logger.error(`Failed to extract ${path.basename(fusePath)}: ${String(e)}`);
    return null;
  }

  let cls: PluginClass;
  try {
    if (!manifest.entry) throw new Error("manifest missing 'entry'");
    cls = await resolveEntry(packageRoot, manifest.entry);
  } catch (e) {
    logger.error(`Skipping .fuse plugin '${pluginId}': ${String(e)}`);
    return null;
  }

  const version = (manifest.version as string) ?? "0.0";
  const name = (manifest.name as string) ?? pluginId;
  cls.pluginName = name;
  cls.version = version;
  cls.description = (manifest.description as string) ?? "";

  logger.info(`Discovered plugin (.fuse): ${name} [${pluginId}] v${version}`);
  return {
    pluginId,
    name,
    version,
    description: cls.description,
    author: (manifest.author as string) ?? "",
    homepage: (manifest.homepage as string) ?? "",
    tags: (manifest.tags as string[]) ?? [],
    isCore: Boolean(manifest.core),
    archivePath: fusePath,
    packageRoot,
    checksum,
    cls,
    manifest,
  };
}

/** Scan `USER_PLUGINS_DIR` and return every valid plugin found. */
export async function discover(): Promise<DiscoveredPlugin[]> {
  if (!fs.existsSync(USER_PLUGINS_DIR)) return [];
  const entries = fs
    .readdirSync(USER_PLUGINS_DIR)
    .filter((n) => n.endsWith(".fuse"))
    .sort();
  const out: DiscoveredPlugin[] = [];
  for (const name of entries) {
    const spec = await scanFuseArchive(path.join(USER_PLUGINS_DIR, name));
    if (spec) out.push(spec);
  }
  return out;
}
