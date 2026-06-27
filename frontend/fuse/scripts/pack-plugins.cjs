/**
 * pack-plugins.cjs
 *
 * Packs every plugin directory under backend/dev/ into a .fuse archive
 * (ZIP format) in backend/plugins/.
 *
 * Archive layout:  <plugin_id>/<file>  (mirrors the on-disk layout)
 * Output filename: <Name>-<version>.fuse  (from the plugin's manifest.json)
 *
 * Usage:
 *   node scripts/pack-plugins.cjs           # pack all changed plugins
 *   node scripts/pack-plugins.cjs --force   # pack all regardless of change
 *   node scripts/pack-plugins.cjs --watch   # pack + re-pack on file change
 */

'use strict';

const fs      = require('fs');
const path    = require('path');
const crypto  = require('crypto');
const { execSync } = require('child_process');

const REPO_ROOT  = path.join(__dirname, '..', '..', '..');
const DEV_DIR    = path.join(REPO_ROOT, 'backend', 'dev');
const OUT_DIR    = path.join(REPO_ROOT, 'backend', 'plugins');
const CACHE_FILE = path.join(__dirname, '..', '.plugin-pack-cache.json');

const SKIP_NAMES  = new Set(['__pycache__', '.DS_Store']);
const SKIP_EXTS   = new Set(['.pyc']);
const SKIP_DIRS   = new Set(['__pycache__']);

// helpers 

function loadCache() {
  try {
    if (fs.existsSync(CACHE_FILE))
      return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
  } catch (_) {}
  return {};
}

function saveCache(cache) {
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
}

function hashDir(dir) {
  const h = crypto.createHash('sha256');
  function walk(d) {
    const entries = fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    for (const e of entries) {
      if (SKIP_DIRS.has(e.name)) continue;
      const full = path.join(d, e.name);
      if (e.isDirectory()) {
        walk(full);
      } else if (!SKIP_EXTS.has(path.extname(e.name)) && !SKIP_NAMES.has(e.name)) {
        h.update(e.name);
        h.update(fs.readFileSync(full));
      }
    }
  }
  walk(dir);
  return h.digest('hex');
}

function collectFiles(dir, base) {
  const results = [];
  function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (SKIP_DIRS.has(e.name)) continue;
      const full = path.join(d, e.name);
      if (e.isDirectory()) {
        walk(full);
      } else if (!SKIP_EXTS.has(path.extname(e.name)) && !SKIP_NAMES.has(e.name)) {
        results.push({ disk: full, zip: path.join(base, path.relative(dir, full)).replace(/\\/g, '/') });
      }
    }
  }
  walk(dir);
  return results;
}

// zip (uses Python's zipfile) 

function packWithPython(files, outPath) {
  const payload = JSON.stringify(files.map(f => ({ disk: f.disk, zip: f.zip })));
  const script = `
import sys, json, zipfile, pathlib
files = json.loads(sys.argv[1])
out   = sys.argv[2]
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
    for f in files:
        z.write(f['disk'], f['zip'])
`.trim();
  execSync(`python -c "${script.replace(/"/g, '\\"').replace(/\n/g, '; ')}" "${payload.replace(/"/g, '\\"')}" "${outPath}"`, {
    stdio: 'pipe',
    shell: true,
  });
}

// Simpler approach: write a temp script
function pack(files, outPath) {
  const tmpScript = path.join(REPO_ROOT, '_tmp_pack.py');
  const tmpData   = path.join(REPO_ROOT, '_tmp_pack.json');
  fs.writeFileSync(tmpData, JSON.stringify(files.map(f => ({ disk: f.disk, zip: f.zip }))));
  fs.writeFileSync(tmpScript, [
    'import json, zipfile',
    `with open(${JSON.stringify(tmpData)}) as f: files = json.load(f)`,
    `with zipfile.ZipFile(${JSON.stringify(outPath)}, "w", zipfile.ZIP_DEFLATED) as z:`,
    '    for f in files: z.write(f["disk"], f["zip"])',
  ].join('\n'));
  try {
    execSync(`python "${tmpScript}"`, { stdio: 'inherit' });
  } finally {
    fs.rmSync(tmpScript, { force: true });
    fs.rmSync(tmpData,   { force: true });
  }
}

// discover + pack 

function discoverPlugins() {
  return fs.readdirSync(DEV_DIR, { withFileTypes: true })
    .filter(e => e.isDirectory() && !e.name.startsWith('_') && !e.name.startsWith('.'))
    .map(e => {
      const dir      = path.join(DEV_DIR, e.name);
      const mfPath   = path.join(dir, 'manifest.json');
      if (!fs.existsSync(mfPath)) return null;
      const manifest = JSON.parse(fs.readFileSync(mfPath, 'utf-8'));
      return {
        dir,
        plugin_id: manifest.plugin_id || e.name,
        name:      (manifest.name || e.name).replace(/\s+/g, ''),
        version:   manifest.version || '1.0.0',
      };
    })
    .filter(Boolean);
}

function packPlugin(plugin, cache, force) {
  const hash    = hashDir(plugin.dir);
  const outName = `${plugin.name}-${plugin.version}.fuse`;
  const outPath = path.join(OUT_DIR, outName);

  if (!force && cache[plugin.plugin_id]?.hash === hash && fs.existsSync(outPath)) {
    console.log(`  ✓ ${outName} unchanged`);
    return false;
  }

  const files = collectFiles(plugin.dir, plugin.plugin_id);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  pack(files, outPath);

  const size = fs.statSync(outPath).size;
  console.log(`  ⟳ ${outName}  (${files.length} files, ${(size / 1024).toFixed(1)} KB)`);
  cache[plugin.plugin_id] = { hash, outName, packed: new Date().toISOString() };
  return true;
}

function run(opts = {}) {
  const { force = false } = opts;
  const cache   = loadCache();
  const plugins = discoverPlugins();

  console.log(`\nPacking ${plugins.length} plugin(s) → backend/plugins/\n`);
  let changed = 0;
  for (const p of plugins) {
    if (packPlugin(p, cache, force)) changed++;
  }
  saveCache(cache);
  console.log(changed ? `\n✓ ${changed} plugin(s) repacked.\n` : '\n✓ All plugins up to date.\n');
}

// watch mode

function watch() {
  run();
  console.log('Watching backend/dev/ for changes...\n');
  let debounce = null;
  fs.watch(DEV_DIR, { recursive: true }, (event, filename) => {
    if (!filename) return;
    if (SKIP_DIRS.has(filename.split(/[/\\]/)[0])) return;
    if (SKIP_EXTS.has(path.extname(filename))) return;
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      console.log(`  [watch] ${filename} changed — repacking...`);
      run();
    }, 200);
  });
}

// CLI

if (require.main === module) {
  const args  = process.argv.slice(2);
  const force = args.includes('--force') || args.includes('-f');
  if (args.includes('--watch') || args.includes('-w')) {
    watch();
  } else {
    run({ force });
  }
}

module.exports = { run, watch };
