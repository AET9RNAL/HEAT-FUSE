const fs = require('node:fs')
const path = require('node:path')

const RUNTIME_DIR = path.resolve(__dirname, '..', '..', '..', 'runtime')
const ROOT_NM = path.join(RUNTIME_DIR, 'node_modules')
const DEST_NM = path.join(RUNTIME_DIR, 'dist', 'node_modules')

// External packages from tsup.config.ts. bufferutil / utf-8-validate are ws's
// optional native speedups: not installed and require()d in a try/catch, so
// they are intentionally omitted here.
const ROOTS = ['uiohook-napi', '@nut-tree-fork/nut-js']

/** Node-resolution: walk node_modules up from `startDir`, then the root. */
function findPkgDir(name, startDir) {
  let dir = startDir
  while (true) {
    const cand = path.join(dir, 'node_modules', ...name.split('/'))
    if (fs.existsSync(path.join(cand, 'package.json'))) return cand
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  const rootCand = path.join(ROOT_NM, ...name.split('/'))
  return fs.existsSync(path.join(rootCand, 'package.json')) ? rootCand : null
}

function collectClosure(roots) {
  const found = new Map() // name -> source dir
  const queue = [...roots.map((name) => ({ name, from: RUNTIME_DIR }))]
  while (queue.length) {
    const { name, from } = queue.shift()
    if (found.has(name)) continue
    const dir = findPkgDir(name, from)
    if (!dir) {
      console.warn(`[stage-native-deps] WARN: '${name}' not found — skipping`)
      continue
    }
    found.set(name, dir)
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
    const deps = { ...(pkg.dependencies || {}), ...(pkg.optionalDependencies || {}) }
    for (const depName of Object.keys(deps)) {
      // Resolve optional deps relative to the requiring package; skip absent ones.
      if (!found.has(depName)) queue.push({ name: depName, from: dir })
    }
  }
  return found
}

const closure = collectClosure(ROOTS)

// A running sidecar keeps the .node addons mapped, and Windows refuses to
// unlink or overwrite a mapped image (EPERM/EBUSY, or EIO once a delete is
// already pending). A locked staged file is by definition the one in use, so
// keeping it is correct — warn and carry on instead of failing the build.
// Copying is per-file rather than per-package for the same reason: one locked
// addon must not skip the rest of its package's JS.
const LOCK_CODES = new Set(['EPERM', 'EBUSY', 'EIO'])
const locked = []

function tolerateLock(what, fn) {
  try {
    fn()
  } catch (e) {
    if (!LOCK_CODES.has(e.code)) throw e
    locked.push(`${what} (${e.code})`)
  }
}

/** Recursive copy, skipping nested node_modules; per-file lock tolerance. */
function copyTree(src, dest) {
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue
    const from = path.join(src, entry.name)
    const to = path.join(dest, entry.name)
    if (entry.isDirectory()) {
      fs.mkdirSync(to, { recursive: true })
      copyTree(from, to)
    } else {
      tolerateLock(path.relative(DEST_NM, to), () => fs.copyFileSync(from, to))
    }
  }
}

tolerateLock('<clean dist/node_modules>', () => fs.rmSync(DEST_NM, { recursive: true, force: true }))
for (const [name, src] of closure) {
  const dest = path.join(DEST_NM, ...name.split('/'))
  fs.mkdirSync(dest, { recursive: true })
  copyTree(src, dest)
}
for (const what of locked) {
  console.warn(`[stage-native-deps] WARN: locked by a running process, kept existing copy: ${what}`)
}

console.log(`[stage-native-deps] staged ${closure.size} packages -> runtime/dist/node_modules`)
