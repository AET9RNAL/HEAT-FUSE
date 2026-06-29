const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const CACHE_FILE = path.join(__dirname, '..', '.python-build-cache.json');

const REPO_ROOT = path.join(__dirname, '..', '..', '..');
const BACKEND_DIR = path.join(REPO_ROOT, 'backend');
const FUSE_DIR = path.join(BACKEND_DIR, 'fuse');
const OUTPUT_DIR = path.join(__dirname, '..', 'resources');
const NUITKA_DIST = path.join(OUTPUT_DIR, 'run_fuse.dist');
const OUTPUT_DIST = path.join(OUTPUT_DIR, 'fuse-backend.dist');
const OUTPUT_EXE = path.join(OUTPUT_DIST, 'fuse-backend.exe');

function calculatePythonHash() {
  const hash = crypto.createHash('sha256');

  function hashDirectory(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === '__pycache__' || entry.name === '.venv') continue;
        hashDirectory(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.py')) {
        const content = fs.readFileSync(fullPath);
        hash.update(content);
      }
    }
  }

  hashDirectory(FUSE_DIR);
  return hash.digest('hex');
}

function loadCachedHash() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
      return cache.hash;
    }
  } catch (_) {}
  return null;
}

function saveCachedHash(hash) {
  fs.writeFileSync(CACHE_FILE, JSON.stringify({ hash, timestamp: new Date().toISOString() }, null, 2));
}

function compile(force = false) {
  if (!force) {
    const currentHash = calculatePythonHash();
    const cachedHash = loadCachedHash();

    if (cachedHash === currentHash && fs.existsSync(OUTPUT_EXE)) {
      console.log('✓ fuse backend unchanged — skipping Nuitka compilation');
      console.log('  (use "npm run compile:py:force" to force rebuild)');

      const hashFile = path.join(OUTPUT_DIR, 'backend-hash.json');
      if (!fs.existsSync(hashFile)) {
        const binaryHash = crypto.createHash('sha256').update(fs.readFileSync(OUTPUT_EXE)).digest('hex');
        fs.writeFileSync(hashFile, JSON.stringify({ hash: binaryHash }) + '\n');
        console.log(`  Regenerated backend-hash.json: ${binaryHash.substring(0, 16)}...`);
      }

      return;
    }

    console.log('fuse backend changed — recompiling with Nuitka...');
    console.log(`  Previous hash: ${cachedHash?.substring(0, 12) || 'none'}`);
    console.log(`  Current hash:  ${currentHash.substring(0, 12)}`);
  } else {
    console.log('Forcing fuse backend recompilation...');
  }

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const nativeBinDir = path.join(BACKEND_DIR, 'native', 'bin');

  const venvPython = path.join(BACKEND_DIR, '.venv', 'Scripts', 'python.exe');

  console.log('Ensuring nuitka is installed in venv...');
  execSync(`"${venvPython}" -m pip install nuitka --quiet`, { stdio: 'inherit' });

  const nuitkaCmd = [
    `"${venvPython}" -m nuitka`,
    '--msvc=latest',
    '--standalone',
    // '--onefile',
    '--windows-console-mode=force',
    '--include-package=fuse',
    '--include-package=pynput',
    '--include-package=PIL',
    '--include-package=pytesseract',
    '--include-package=numpy',
    '--include-package=mss',
    '--include-package=loguru',
    '--include-package=serial',
    '--include-package=fastapi',
    '--include-package=uvicorn',
    '--include-package=h11',
    '--include-package=starlette',
    '--include-package=anyio',
    '--include-package=websockets',
    '--include-package=websocket',
    '--enable-plugin=tk-inter',
    fs.existsSync(path.join(FUSE_DIR, 'assets'))
      ? `--include-data-dir="${path.join(FUSE_DIR, 'assets')}"=fuse/assets`
      : '',
    fs.existsSync(path.join(FUSE_DIR, 'vision', 'js'))
      ? `--include-data-dir="${path.join(FUSE_DIR, 'vision', 'js')}"=fuse/vision/js`
      : '',
    `--output-dir="${OUTPUT_DIR}"`,
    '--output-filename=fuse-backend.exe',
    `"${path.join(FUSE_DIR, 'run_fuse.py')}"`,
  ].filter(Boolean).join(' ');

  try {
    execSync(nuitkaCmd, { cwd: BACKEND_DIR, stdio: 'inherit' });

    if (fs.existsSync(OUTPUT_DIST)) fs.rmSync(OUTPUT_DIST, { recursive: true });
    fs.renameSync(NUITKA_DIST, OUTPUT_DIST);

    // Nuitka may not preserve DLLs from --include-data-dir — copy them explicitly.
    if (fs.existsSync(nativeBinDir)) {
      const destBinDir = path.join(OUTPUT_DIST, 'native', 'bin');
      fs.mkdirSync(destBinDir, { recursive: true });
      for (const file of fs.readdirSync(nativeBinDir)) {
        if (file.endsWith('.dll') || file.endsWith('.so') || file.endsWith('.pyd')) {
          fs.copyFileSync(path.join(nativeBinDir, file), path.join(destBinDir, file));
          console.log(`  Copied native: ${file}`);
        }
      }
    }

    const finalHash = calculatePythonHash();
    saveCachedHash(finalHash);

    const binaryHash = crypto.createHash('sha256').update(fs.readFileSync(OUTPUT_EXE)).digest('hex');
    fs.writeFileSync(
      path.join(OUTPUT_DIR, 'backend-hash.json'),
      JSON.stringify({ hash: binaryHash }) + '\n',
    );
    console.log(`✓ Backend integrity hash: ${binaryHash.substring(0, 16)}...`);
    console.log('✓ Nuitka compilation finished');
  } catch (error) {
    console.error('Nuitka compilation failed:', error.message);
    process.exit(1);
  }
}

const forceFlag = process.argv.includes('--force') || process.argv.includes('-f');
compile(forceFlag);

module.exports = compile;
