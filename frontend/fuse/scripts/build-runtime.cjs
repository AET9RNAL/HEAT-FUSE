const { execSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const RUNTIME_DIR = path.resolve(__dirname, '..', '..', '..', 'runtime')

if (!fs.existsSync(path.join(RUNTIME_DIR, 'node_modules'))) {
  console.log('[build-runtime] installing runtime deps…')
  execSync('npm install', { cwd: RUNTIME_DIR, stdio: 'inherit' })
}
console.log('[build-runtime] building sidecar…')
execSync('npm run build', { cwd: RUNTIME_DIR, stdio: 'inherit' })

const distPkg = path.join(RUNTIME_DIR, 'dist', 'package.json')
fs.writeFileSync(distPkg, JSON.stringify({ type: 'module' }, null, 2) + '\n')
console.log('[build-runtime] wrote dist/package.json (type:module)')

// Stage the native (external) dependency closure into dist/node_modules so the
// packaged sidecar can resolve uiohook-napi / nut-js and their transitive deps.
execSync('node ' + JSON.stringify(path.join(__dirname, 'stage-native-deps.cjs')), { stdio: 'inherit' })

console.log('[build-runtime] done → runtime/dist/index.js')
