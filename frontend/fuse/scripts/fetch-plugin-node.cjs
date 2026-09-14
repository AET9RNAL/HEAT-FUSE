/**
 * Fetches the Node binary plugin processes run on. Node 25+ has --allow-net, so
 * network can be denied per plugin; Electron's own Node (24) can't do that.
 * Pinned and checksum-verified; skipped when the pinned version is already there.
 * Never fails the build: without it plugins fall back to Electron's Node.
 */
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { unzipSync } = require('fflate')

const VERSION = 'v26.8.2'
const OUT_DIR = path.resolve(__dirname, '..', 'build', 'node')
const STAMP = path.join(OUT_DIR, 'VERSION')

async function main() {
  if (process.platform !== 'win32' || process.arch !== 'x64') {
    console.log(`[plugin-node] no bundled Node for ${process.platform}-${process.arch}: plugins use Electron's Node, network isn't blockable`)
    return
  }
  const exe = path.join(OUT_DIR, 'node.exe')
  if (fs.existsSync(exe) && fs.existsSync(STAMP) && fs.readFileSync(STAMP, 'utf8').trim() === VERSION) {
    console.log(`[plugin-node] ${VERSION} present`)
    return
  }

  const base = `https://nodejs.org/dist/${VERSION}`
  const zipName = `node-${VERSION}-win-x64.zip`
  console.log(`[plugin-node] downloading ${zipName}…`)

  const sums = await (await fetchOk(`${base}/SHASUMS256.txt`)).text()
  const line = sums.split('\n').find((l) => l.trim().endsWith(`  ${zipName}`))
  if (!line) throw new Error(`no checksum listed for ${zipName}`)
  const expected = line.trim().split(/\s+/)[0]

  const zip = Buffer.from(await (await fetchOk(`${base}/${zipName}`)).arrayBuffer())
  const actual = crypto.createHash('sha256').update(zip).digest('hex')
  if (actual !== expected) throw new Error(`checksum mismatch for ${zipName}`)

  const entry = `node-${VERSION}-win-x64/node.exe`
  const files = unzipSync(new Uint8Array(zip), { filter: (f) => f.name === entry })
  if (!files[entry]) throw new Error(`${entry} missing from the archive`)

  fs.mkdirSync(OUT_DIR, { recursive: true })
  fs.writeFileSync(exe, files[entry])
  fs.writeFileSync(STAMP, `${VERSION}\n`)
  console.log(`[plugin-node] ${VERSION} -> build/node/node.exe`)
}

async function fetchOk(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
  return res
}

main().catch((e) => {
  console.warn(`[plugin-node] skipped: ${e.message}. Plugins will use Electron's Node, where network can't be blocked.`)
})
