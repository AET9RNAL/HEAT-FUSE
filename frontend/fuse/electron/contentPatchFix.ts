import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'
import { findStoredEntry, readAt, shrinkIndents } from './gameZip'

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
    crc.writeUInt32LE(zlib.crc32(bytes) >>> 0)
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
