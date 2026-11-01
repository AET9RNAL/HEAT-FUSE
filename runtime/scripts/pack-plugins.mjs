/**
 * Build + pack FUSE Node plugins into `.fuse` archives.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { zipSync } from "fflate";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RUNTIME_DIR = path.resolve(HERE, "..");
const REPO_ROOT = path.resolve(RUNTIME_DIR, "..");
const SRC_ROOT = path.join(REPO_ROOT, "plugins-src");
const OUT_DIR = path.join(REPO_ROOT, "plugins-dist");
const SDK_ENTRY = path.join(RUNTIME_DIR, "src/sdk/index.ts");

async function packOne(id) {
  const srcDir = path.join(SRC_ROOT, id);
  const manifest = JSON.parse(fs.readFileSync(path.join(srcDir, "manifest.json"), "utf-8"));
  const pluginId = manifest.plugin_id ?? id;
  const [moduleName] = String(manifest.entry).split(":");
  if (!moduleName) throw new Error(`${id}: manifest 'entry' must be 'module:Class'`);

  // Resolve the entry source file.
  let entrySrc = "";
  for (const ext of [".ts", ".tsx", ".js", ".mjs"]) {
    const c = path.join(srcDir, moduleName + ext);
    if (fs.existsSync(c)) {
      entrySrc = c;
      break;
    }
  }
  if (!entrySrc) throw new Error(`${id}: entry module '${moduleName}' not found in ${srcDir}`);

  // Bundle to an in-memory string.
  const result = await build({
    entryPoints: [entrySrc],
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node20",
    write: false,
    // Plugins run from an extracted cache dir, so an external .map never resolves;
    // inline is the only form a debugger can follow back to plugins-src.
    sourcemap: process.env.RELEASE === "true" ? false : "inline",
    sourcesContent: true,
    alias: { "@fuse/plugin-sdk": SDK_ENTRY },
    // Native/optional deps a plugin might use stay external (resolved at runtime).
    external: ["uiohook-napi", "chrome-remote-interface"],
    logLevel: "warning",
  });
  const bundled = result.outputFiles[0].text;

  // Stage the archive contents under `<pluginId>/`.
  const files = {};
  files[`${pluginId}/${moduleName}.js`] = new TextEncoder().encode(bundled);
  files[`${pluginId}/manifest.json`] = new TextEncoder().encode(JSON.stringify(manifest, null, 2));
  // `ui` carries raw UI-library sources (.vue/.js/.css/.riv) served to overlays; `components` holds an overlay's own child components.
  const PACKED = ["js", "assets", "ui", "components"];
  for (const sub of PACKED) {
    const dir = path.join(srcDir, sub);
    if (fs.existsSync(dir)) addDir(dir, `${pluginId}/${sub}`, files);
  }
  // A feature folder (such as atgm_preview/cam) keeps its overlay files next to its code: only the overlay files ship.
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    if (entry.isDirectory() && !PACKED.includes(entry.name) && !NOT_PACKED.has(entry.name)) {
      addDir(path.join(srcDir, entry.name), `${pluginId}/${entry.name}`, files, OVERLAY_FILE);
    }
  }

  // Copy root-level .vue files (Vue overlay components live in the plugin root).
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith(".vue")) {
      files[`${pluginId}/${entry.name}`] = fs.readFileSync(path.join(srcDir, entry.name));
    }
  }

  const zipped = zipSync(files, { level: 6 });
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const outName = `${String(manifest.name ?? pluginId).replace(/\s+/g, "")}-${manifest.version ?? "0.0"}.fuse`;
  const outPath = path.join(OUT_DIR, outName);
  fs.writeFileSync(outPath, zipped);
  console.log(`packed ${id} → plugins-dist/${outName} (${Object.keys(files).length} files, ${zipped.length} bytes)`);
}

/** Libraries plugins may import, declared in plugins-src/package.json. */
function sharedDeps() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(SRC_ROOT, "package.json"), "utf-8"));
    return Object.keys(pkg.dependencies ?? {});
  } catch {
    return [];
  }
}

/**
 * A forgotten `npm install` in plugins-src shows up as an unresolvable import,
 * which says nothing about the cause. Name it.
 */
function installHint(err) {
  const text = (err?.errors ?? []).map((e) => e.text).join(" ");
  const missing = sharedDeps().filter((dep) => text.includes(`"${dep}"`));
  if (!missing.length) return "";
  const installed = fs.existsSync(path.join(SRC_ROOT, "node_modules"));
  return installed
    ? `\n  ${missing.join(", ")} is declared in plugins-src/package.json but did not resolve.` +
        `\n  Try: npm install --prefix plugins-src`
    : `\n  ${missing.join(", ")} comes from plugins-src/package.json, which has not been installed.` +
        `\n  Run: npm install --prefix plugins-src`;
}

/** Files an overlay loads at run time. Code in other forms is bundled into the entry module. */
const OVERLAY_FILE = /\.(vue|mjs|css|riv)$/;
/** Plugin folders that never ship. */
const NOT_PACKED = new Set(["node_modules", "tools", "test", "tests"]);

function addDir(dir, prefix, files, only = null) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    const rel = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) addDir(abs, rel, files, only);
    else if (!only || only.test(entry.name)) files[rel] = fs.readFileSync(abs);
  }
}

const args = process.argv.slice(2);
const ids = args.length
  ? args
  : fs
      .readdirSync(SRC_ROOT)
      // `_` marks a directory that isn't a plugin; node_modules holds the
      // libraries plugins import, installed from plugins-src/package.json.
      .filter(
        (n) => !n.startsWith("_") && n !== "node_modules" && fs.statSync(path.join(SRC_ROOT, n)).isDirectory(),
      );

for (const id of ids) {
  try {
    await packOne(id);
  } catch (e) {
    console.error(`FAILED ${id}: ${e.message ?? e}${installHint(e)}`);
    process.exitCode = 1;
  }
}
