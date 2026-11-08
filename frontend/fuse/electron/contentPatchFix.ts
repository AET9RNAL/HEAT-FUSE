import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const PROJECT_FILE = 'coldwar.project'
const ENTRY_NAME = 'patched_project.json'
const POLL_MS = 10_000
const ENABLE_RE = /("Enable Debugger"\s*:\s*)(true|false)( *)/g
const PORT_RE = /("Debugger Port"\s*:\s*)(\d+)( *)/g

interface DebuggerKeys {
  enabled: boolean
  port: number | null
}

export type PatchResult = 'changed' | 'unchanged' | 'skipped'

let gameDir = ''
let pollTimer: ReturnType<typeof setInterval> | null = null
let rootWatcher: fs.FSWatcher | null = null

const seen = new Map<string, string>()

function patchRoot(): string {
  return path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local'), 'coldwar', '.content_patch')
}

function readRootKeys(dir: string): DebuggerKeys | null {
  try {
    const text = fs.readFileSync(path.join(dir, PROJECT_FILE), 'utf-8')
    const enable = /"Enable Debugger"\s*:\s*(true|false)/.exec(text)
    if (!enable) return null
    const port = /"Debugger Port"\s*:\s*(\d+)/.exec(text)
    return { enabled: enable[1] === 'true', port: port ? Number(port[1]) : null }
  } catch {
    return null
  }
}

export function setKeys(text: string, keys: DebuggerKeys): string {
  let out = text
  let grow = 0
  let growFrom = 0
  const swap = (re: RegExp, value: string): void => {
    out = out.replace(re, (_m, head: string, _old: string, pad: string, at: number) => {
      const room = _old.length + pad.length
      if (value.length > room) {
        grow += value.length - room
        growFrom = Math.max(growFrom, at + head.length + value.length)
        return head + value
      }
      return head + value + ' '.repeat(room - value.length)
    })
  }
  swap(ENABLE_RE, String(keys.enabled))
  if (keys.port !== null) swap(PORT_RE, String(keys.port))
  return grow ? shrinkIndents(out, growFrom, grow) : out
}

function shrinkIndents(text: string, from: number, count: number): string {
  const cuts: Array<[number, number]> = []
  let left = count
  const collect = (start: number, end: number): void => {
    const re = /\n( {2,})/g
    re.lastIndex = start
    for (let m = re.exec(text); m && left > 0 && m.index < end; m = re.exec(text)) {
      const take = Math.min(left, m[1].length - 1)
      cuts.push([m.index + 1, take])
      left -= take
    }
  }
  collect(from, text.length)
  if (left > 0) collect(0, from)
  if (left > 0) throw new Error('no indent room for the edit')
  cuts.sort((a, b) => b[0] - a[0])
  let out = text
  for (const [at, take] of cuts) out = out.slice(0, at) + out.slice(at + take)
  return out
}

// zip 

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(buf: Buffer): number {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function readAt(fd: number, pos: number, len: number): Buffer {
  const buf = Buffer.alloc(len)
  const got = fs.readSync(fd, buf, 0, len, pos)
  if (got !== len) throw new Error('short read')
  return buf
}

interface StoredEntry {
  dataPos: number
  size: number
  localCrcPos: number
  centralCrcPos: number
}

/** Finds a stored (not compressed) entry. Zip64, compression, encryption and data descriptors give null. */
function findStoredEntry(fd: number, fileSize: number, name: string): StoredEntry | null {
  const tailLen = Math.min(fileSize, 22 + 0xffff)
  const tail = readAt(fd, fileSize - tailLen, tailLen)
  let eocd = -1
  for (let i = tailLen - 22; i >= 0; i--) {
    if (tail.readUInt32LE(i) === 0x06054b50) { eocd = i; break }
  }
  if (eocd < 0) return null
  const cdSize = tail.readUInt32LE(eocd + 12)
  const cdPos = tail.readUInt32LE(eocd + 16)
  if (cdPos === 0xffffffff || cdSize === 0xffffffff || cdPos + cdSize > fileSize) return null
  const cd = readAt(fd, cdPos, cdSize)
  for (let p = 0; p + 46 <= cd.length; ) {
    if (cd.readUInt32LE(p) !== 0x02014b50) return null
    const flags = cd.readUInt16LE(p + 8)
    const method = cd.readUInt16LE(p + 10)
    const packed = cd.readUInt32LE(p + 20)
    const size = cd.readUInt32LE(p + 24)
    const nameLen = cd.readUInt16LE(p + 28)
    const extraLen = cd.readUInt16LE(p + 30)
    const commentLen = cd.readUInt16LE(p + 32)
    const localPos = cd.readUInt32LE(p + 42)
    if (cd.toString('utf-8', p + 46, p + 46 + nameLen) === name) {
      if (method !== 0 || packed !== size || flags & 0x09) return null
      const local = readAt(fd, localPos, 30)
      if (local.readUInt32LE(0) !== 0x04034b50 || local.readUInt16LE(6) & 0x09) return null
      const dataPos = localPos + 30 + local.readUInt16LE(26) + local.readUInt16LE(28)
      return { dataPos, size, localCrcPos: localPos + 14, centralCrcPos: cdPos + p + 16 }
    }
    p += 46 + nameLen + extraLen + commentLen
  }
  return null
}

/** Sets the debugger keys in one patch zip. Throws when the zip is locked or broken. */
export function patchZip(zipPath: string, keys: DebuggerKeys): PatchResult {
  const fd = fs.openSync(zipPath, 'r+')
  try {
    const entry = findStoredEntry(fd, fs.fstatSync(fd).size, ENTRY_NAME)
    if (!entry) return 'skipped'
    const before = readAt(fd, entry.dataPos, entry.size).toString('latin1')
    if (!/"Enable Debugger"/.test(before)) return 'skipped'
    const after = setKeys(before, keys)
    if (after === before) return 'unchanged'
    if (after.length !== before.length) throw new Error('edit changed the entry size')
    // The edit only moves whitespace and values, so valid JSON stays valid.
    if (isJson(before) && !isJson(after)) throw new Error('edit broke the JSON')
    const bytes = Buffer.from(after, 'latin1')
    const crc = Buffer.alloc(4)
    crc.writeUInt32LE(crc32(bytes))
    fs.writeSync(fd, bytes, 0, bytes.length, entry.dataPos)
    fs.writeSync(fd, crc, 0, 4, entry.localCrcPos)
    fs.writeSync(fd, crc, 0, 4, entry.centralCrcPos)
    return 'changed'
  } finally {
    fs.closeSync(fd)
  }
}

function isJson(text: string): boolean {
  try {
    JSON.parse(Buffer.from(text, 'latin1').toString('utf-8'))
    return true
  } catch {
    return false
  }
}

// scheduling

function patchZips(): string[] {
  try {
    const root = patchRoot()
    return fs.readdirSync(root, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => path.join(root, d.name, 'patch.zip'))
      .filter((p) => fs.existsSync(p))
  } catch {
    return []
  }
}

/** One pass over all patch zips. A locked zip, for example while the game runs, gets the next pass. */
function syncAll(): void {
  if (!gameDir) return
  const keys = readRootKeys(gameDir)
  if (!keys) return
  for (const zip of patchZips()) {
    let stamp = ''
    try {
      const st = fs.statSync(zip)
      stamp = `${st.mtimeMs}:${st.size}:${keys.enabled}:${keys.port}`
      if (seen.get(zip) === stamp) continue
      const result = patchZip(zip, keys)
      const st2 = fs.statSync(zip)
      seen.set(zip, `${st2.mtimeMs}:${st2.size}:${keys.enabled}:${keys.port}`)
      if (result === 'changed') console.log(`[content-patch] set debugger ${keys.enabled} port ${keys.port} in ${zip}`)
      if (result === 'skipped') console.warn(`[content-patch] no editable ${ENTRY_NAME} in ${zip}`)
    } catch (e) {
      // Log a failure once for each zip state, not every poll.
      if (seen.get(zip) !== `fail:${stamp}`) console.warn(`[content-patch] ${zip}: ${(e as Error).message}`)
      seen.set(zip, `fail:${stamp}`)
    }
  }
}

/** Starts the fix for a game folder. Safe to call again with the same folder. */
export function setGameDir(dir: string): void {
  if (process.platform !== 'win32') return
  const next = dir ? path.resolve(dir) : ''
  if (next === gameDir) return
  gameDir = next
  rootWatcher?.close()
  rootWatcher = null
  if (gameDir && fs.existsSync(gameDir)) {
    try {
      // A root file change (FUSE writes it on Apply) reaches the patch at once.
      let debounce: ReturnType<typeof setTimeout> | null = null
      const w = fs.watch(gameDir, (_event, filename) => {
        if (filename !== PROJECT_FILE) return
        if (debounce) clearTimeout(debounce)
        debounce = setTimeout(syncAll, 300)
      })
      w.on('error', () => w.close())
      rootWatcher = w
    } catch { /* the poll still covers it */ }
  }
  if (!pollTimer) {
    pollTimer = setInterval(syncAll, POLL_MS)
    pollTimer.unref()
  }
  syncAll()
}
