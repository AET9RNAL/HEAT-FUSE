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
    sourcemap: false,
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
  // `ui` carries raw UI-library sources (.vue/.js/.css/.riv) served to overlays.
  for (const sub of ["js", "assets", "ui"]) {
    const dir = path.join(srcDir, sub);
    if (fs.existsSync(dir)) addDir(dir, `${pluginId}/${sub}`, files);
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

function addDir(dir, prefix, files) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    const rel = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) addDir(abs, rel, files);
    else files[rel] = fs.readFileSync(abs);
  }
}

const args = process.argv.slice(2);
const ids = args.length
  ? args
  : fs
      .readdirSync(SRC_ROOT)
      .filter((n) => !n.startsWith("_") && fs.statSync(path.join(SRC_ROOT, n)).isDirectory());

for (const id of ids) {
  try {
    await packOne(id);
  } catch (e) {
    console.error(`FAILED ${id}: ${e.message ?? e}`);
    process.exitCode = 1;
  }
}
