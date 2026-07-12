const { execSync } = require('node:child_process')
const path = require('node:path')   

const RUNTIME_DIR = path.resolve(__dirname, '..', '..', '..', 'runtime')
const packer = path.join(RUNTIME_DIR, 'scripts', 'pack-plugins.mjs')

console.log('[pack-plugins] packing plugins-src → plugins-dist…')
execSync(`node "${packer}"`, { cwd: RUNTIME_DIR, stdio: 'inherit' })
