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

fs.rmSync(DEST_NM, { recursive: true, force: true })
for (const [name, src] of closure) {
  const dest = path.join(DEST_NM, ...name.split('/'))
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  // Copy the package but drop its nested node_modules — everything is collected
  // flat into DEST_NM, so nested trees would just duplicate the closure.
  fs.cpSync(src, dest, {
    recursive: true,
    filter: (s) => path.basename(s) !== 'node_modules',
  })
}

console.log(`[stage-native-deps] staged ${closure.size} packages -> runtime/dist/node_modules`)
