/**
 * In-place edits of stored entries in the game's zips (packs and content patch).
 *
 * An edit keeps the entry size, so the zip layout stays the same: only the entry bytes and its two CRCs change.
 * Every read-check-write runs sync, so two editors in Electron main never interleave on one zip.
 */
import fs from 'node:fs'
import zlib from 'node:zlib'

export interface StoredEntry {
  dataPos: number
  size: number
  localCrcPos: number
  centralCrcPos: number
}

export function readAt(fd: number, pos: number, len: number): Buffer {
  const buf = Buffer.alloc(len)
  const got = fs.readSync(fd, buf, 0, len, pos)
  if (got !== len) throw new Error('short read')
  return buf
}

/** Finds a stored (not compressed) entry. Zip64, compression, encryption and data descriptors give null. */
export function findStoredEntry(fd: number, fileSize: number, name: string): StoredEntry | null {
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

/** The bytes of a stored entry, or null when the zip has no such stored entry. */
export function readStoredEntry(file: string, name: string): Buffer | null {
  const fd = fs.openSync(file, 'r')
  try {
    const entry = findStoredEntry(fd, fs.fstatSync(fd).size, name)
    return entry ? readAt(fd, entry.dataPos, entry.size) : null
  } finally {
    fs.closeSync(fd)
  }
}

/** Writes `body` over a stored entry of the same size. Throws when the entry no longer holds `expect`. */
export function writeStoredEntry(file: string, name: string, expect: Buffer, body: Buffer): void {
  if (body.length !== expect.length) throw new Error(`the edit of ${name} changed the entry size`)
  const fd = fs.openSync(file, 'r+')
  try {
    const entry = findStoredEntry(fd, fs.fstatSync(fd).size, name)
    if (!entry) throw new Error(`${name} is no longer a stored entry`)
    if (entry.size !== body.length) throw new Error(`${name} changed its size while FUSE edited it`)
    if (!readAt(fd, entry.dataPos, entry.size).equals(expect)) throw new Error(`${name} changed while FUSE edited it`)
    const crc = Buffer.alloc(4)
    crc.writeUInt32LE(zlib.crc32(body) >>> 0)
    fs.writeSync(fd, body, 0, body.length, entry.dataPos)
    fs.writeSync(fd, crc, 0, 4, entry.localCrcPos)
    fs.writeSync(fd, crc, 0, 4, entry.centralCrcPos)
  } finally {
    fs.closeSync(fd)
  }
}

/** A zip of stored entries. No zip comment: the game reads the end record from the last 22 bytes only. */
export function storedZip(entries: Array<{ name: string; data: Buffer }>): Buffer {
  const parts: Buffer[] = []
  const central: Buffer[] = []
  const DOS_DATE = (0 << 9) | (1 << 5) | 1
  let offset = 0
  for (const e of entries) {
    const name = Buffer.from(e.name, 'utf-8')
    const crc = zlib.crc32(e.data) >>> 0
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(DOS_DATE, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(e.data.length, 18)
    local.writeUInt32LE(e.data.length, 22)
    local.writeUInt16LE(name.length, 26)
    const cd = Buffer.alloc(46)
    cd.writeUInt32LE(0x02014b50, 0)
    cd.writeUInt16LE(20, 4)
    cd.writeUInt16LE(20, 6)
    cd.writeUInt16LE(DOS_DATE, 14)
    cd.writeUInt32LE(crc, 16)
    cd.writeUInt32LE(e.data.length, 20)
    cd.writeUInt32LE(e.data.length, 24)
    cd.writeUInt16LE(name.length, 28)
    cd.writeUInt32LE(offset, 42)
    parts.push(local, name, e.data)
    central.push(cd, name)
    offset += 30 + name.length + e.data.length
  }
  const cdBuf = Buffer.concat(central)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(entries.length, 8)
  eocd.writeUInt16LE(entries.length, 10)
  eocd.writeUInt32LE(cdBuf.length, 12)
  eocd.writeUInt32LE(offset, 16)
  return Buffer.concat([...parts, cdBuf, eocd])
}

/** Stored entries of a zip by name, with the bytes. Compressed entries are left out. */
export function storedEntries(file: string): Map<string, Buffer> {
  const out = new Map<string, Buffer>()
  const fd = fs.openSync(file, 'r')
  try {
    const size = fs.fstatSync(fd).size
    const tailLen = Math.min(size, 22 + 0xffff)
    const tail = readAt(fd, size - tailLen, tailLen)
    let eocd = -1
    for (let i = tailLen - 22; i >= 0; i--) {
      if (tail.readUInt32LE(i) === 0x06054b50) { eocd = i; break }
    }
    if (eocd < 0) throw new Error('not a zip')
    const cdSize = tail.readUInt32LE(eocd + 12)
    const cdPos = tail.readUInt32LE(eocd + 16)
    if (cdPos + cdSize > size) throw new Error('broken zip')
    const cd = readAt(fd, cdPos, cdSize)
    for (let p = 0; p + 46 <= cd.length && cd.readUInt32LE(p) === 0x02014b50; ) {
      const method = cd.readUInt16LE(p + 10)
      const packed = cd.readUInt32LE(p + 20)
      const nameLen = cd.readUInt16LE(p + 28)
      const extraLen = cd.readUInt16LE(p + 30)
      const commentLen = cd.readUInt16LE(p + 32)
      const localPos = cd.readUInt32LE(p + 42)
      const name = cd.toString('utf-8', p + 46, p + 46 + nameLen)
      p += 46 + nameLen + extraLen + commentLen
      if (method !== 0) continue
      const local = readAt(fd, localPos, 30)
      if (local.readUInt32LE(0) !== 0x04034b50) throw new Error(`bad local header for ${name}`)
      out.set(name, readAt(fd, localPos + 30 + local.readUInt16LE(26) + local.readUInt16LE(28), packed))
    }
    return out
  } finally {
    fs.closeSync(fd)
  }
}

// JSON text, kept as latin1 so one char is one byte

const latin1 = (s: string): string => Buffer.from(s, 'utf-8').toString('latin1')
const fromLatin1 = (s: string): string => Buffer.from(s, 'latin1').toString('utf-8')

/** Takes `count` spaces out of line indents, after `from` first. Each indent keeps one space. */
export function shrinkIndents(text: string, from: number, count: number): string {
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

function skipWs(t: string, i: number): number {
  while (i < t.length) {
    const c = t.charCodeAt(i)
    if (c === 32 || c === 10 || c === 13 || c === 9) i++
    else break
  }
  return i
}

function stringEnd(t: string, i: number): number {
  for (i++; i < t.length; i++) {
    const c = t.charCodeAt(i)
    if (c === 92) i++
    else if (c === 34) return i + 1
  }
  throw new Error('a JSON string has no end')
}

function valueEnd(t: string, i: number): number {
  const c = t.charCodeAt(i)
  if (c === 34) return stringEnd(t, i)
  if (c === 123 || c === 91) {
    let depth = 0
    while (i < t.length) {
      const ch = t.charCodeAt(i)
      if (ch === 34) { i = stringEnd(t, i); continue }
      if (ch === 123 || ch === 91) depth++
      else if ((ch === 125 || ch === 93) && --depth === 0) return i + 1
      i++
    }
    throw new Error('a JSON object has no end')
  }
  while (i < t.length && !',}] \t\r\n'.includes(t[i])) i++
  return i
}

/** Where the value of the first member named `key` starts, in the object at `at`. */
function memberValue(t: string, at: number, key: string): number | null {
  let i = skipWs(t, at + 1)
  if (t[i] === '}') return null
  for (;;) {
    if (t[i] !== '"') throw new Error('the project file is not valid JSON')
    const end = stringEnd(t, i)
    const name = JSON.parse(t.slice(i, end)) as string
    i = skipWs(t, end)
    if (t[i] !== ':') throw new Error('the project file is not valid JSON')
    i = skipWs(t, i + 1)
    if (name === key) return i
    i = skipWs(t, valueEnd(t, i))
    if (t[i] === ',') { i = skipWs(t, i + 1); continue }
    if (t[i] === '}') return null
    throw new Error('the project file is not valid JSON')
  }
}

/** Start and end of the value at a key path, or null when a key is missing. */
export function valueSpan(text: string, keys: string[]): [number, number] | null {
  let i = skipWs(text, 0)
  for (const key of keys) {
    if (text[i] !== '{') return null
    const at = memberValue(text, i, latin1(key))
    if (at === null) return null
    i = at
  }
  return [i, valueEnd(text, i)]
}

export function getJsonValue(text: string, keys: string[]): unknown {
  const span = valueSpan(text, keys)
  return span ? JSON.parse(fromLatin1(text.slice(span[0], span[1]))) : undefined
}

/**
 * Sets the value at a key path. With `keepSize`, the text keeps its length: spaces after the value and
 * line indents give the room, and a shorter value leaves spaces after it.
 */
export function setJsonValue(text: string, keys: string[], value: unknown, keepSize: boolean): { text: string; old: unknown } {
  const span = valueSpan(text, keys)
  if (!span) throw new Error(`the project file has no ${keys.join('/')}`)
  const [start, end] = span
  const before = text.slice(start, end)
  const old = JSON.parse(fromLatin1(before)) as unknown
  const next = latin1(JSON.stringify(value))
  if (next === before) return { text, old }
  let out = text.slice(0, start) + next + text.slice(end)
  if (!keepSize) return { text: out, old }
  const after = start + next.length
  let grow = next.length - before.length
  if (grow > 0) {
    let pad = 0
    while (out[after + pad] === ' ' && pad < grow) pad++
    out = out.slice(0, after) + out.slice(after + pad)
    grow -= pad
    if (grow > 0) out = shrinkIndents(out, after, grow)
  } else if (grow < 0) {
    // Spaces after the value keep the JSON valid.
    out = out.slice(0, after) + ' '.repeat(-grow) + out.slice(after)
  }
  return { text: out, old }
}

export function isJson(text: string): boolean {
  try {
    JSON.parse(fromLatin1(text))
    return true
  } catch {
    return false
  }
}

// dependency DB: {"assets":[{"asset":"/path","dependencies":[<index>, ...]}, ...]}, sorted by asset

const ZSTD_MAGIC = 0xfd2fb528
const SKIPPABLE = 0x184d2a50

interface DbAsset { asset: string; dependencies: number[] }
export interface DependencyDb { assets: DbAsset[]; [key: string]: unknown }

interface ZstdFrame { windowLog: number; checksum: boolean; contentSize: boolean }

const hasContentSize = (fhd: number): boolean => fhd >> 6 > 0 || ((fhd >> 5) & 1) === 1

function zstdFrame(raw: Buffer): ZstdFrame {
  const fhd = raw[4]
  const checksum = ((fhd >> 2) & 1) === 1
  const contentSize = hasContentSize(fhd)
  let window: number
  if (((fhd >> 5) & 1) === 0) {
    const wd = raw[5]
    const base = 2 ** (10 + (wd >> 3))
    window = base + (base / 8) * (wd & 7)
  } else {
    const at = 5 + [0, 1, 2, 4][fhd & 3]
    const fcs = [1, 2, 4, 8][fhd >> 6]
    window = fcs === 1 ? raw[at] : fcs === 2 ? raw.readUInt16LE(at) + 256 : fcs === 4 ? raw.readUInt32LE(at) : Number(raw.readBigUInt64LE(at))
  }
  return { windowLog: Math.max(10, Math.floor(Math.log2(window))), checksum, contentSize }
}

export function decodeDb(raw: Buffer): { db: DependencyDb; frame: ZstdFrame | null } {
  const packed = raw.length >= 6 && raw.readUInt32LE(0) === ZSTD_MAGIC
  const text = packed ? zlib.zstdDecompressSync(raw) : raw
  const db = JSON.parse(text.toString('utf-8')) as DependencyDb
  if (!Array.isArray(db.assets)) throw new Error('the dependency DB has no asset list')
  for (let i = 1; i < db.assets.length; i++) {
    if (!(db.assets[i - 1].asset < db.assets[i].asset)) throw new Error('the dependency DB is not sorted: no safe place for a new entry')
  }
  if (db.assets.slice(0, 200).some((a) => !a.dependencies.every((d) => Number.isInteger(d)))) {
    throw new Error('the dependency DB does not use index dependencies')
  }
  return { db, frame: packed ? zstdFrame(raw) : null }
}

function findAsset(db: DependencyDb, asset: string): { at: number; found: boolean } {
  let lo = 0
  let hi = db.assets.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (db.assets[mid].asset < asset) lo = mid + 1
    else hi = mid
  }
  return { at: lo, found: db.assets[lo]?.asset === asset }
}

/** The dependencies of an asset as asset paths, in DB order, or null when the DB has no entry for it. */
export function getDeps(db: DependencyDb, asset: string): string[] | null {
  const { at, found } = findAsset(db, asset)
  return found ? db.assets[at].dependencies.map((d) => db.assets[d].asset) : null
}

/** Sets the dependencies of an asset. A new entry goes in at its sorted place, and null removes the entry. */
export function setDeps(db: DependencyDb, asset: string, deps: string[] | null): void {
  let { at, found } = findAsset(db, asset)
  if (deps === null) {
    if (!found) return
    if (db.assets.some((a) => a.dependencies.includes(at))) throw new Error(`other assets depend on ${asset}`)
    db.assets.splice(at, 1)
    for (const a of db.assets) a.dependencies = a.dependencies.map((d) => (d > at ? d - 1 : d))
    return
  }
  const missing = deps.filter((d) => !findAsset(db, d).found && d !== asset)
  if (missing.length) throw new Error(`not in the dependency DB: ${missing.join(', ')}`)
  if (!found) {
    for (const a of db.assets) a.dependencies = a.dependencies.map((d) => (d >= at ? d + 1 : d))
    db.assets.splice(at, 0, { asset, dependencies: [] })
    found = true
  }
  db.assets[at].dependencies = [...new Set(deps.map((d) => findAsset(db, d).at))].sort((a, b) => a - b)
}

function zstd(body: Buffer, frame: ZstdFrame, level: number): Promise<Buffer> {
  const c = zlib.constants
  // Without the pledged size, the async path leaves the content size out of the frame header.
  const options: zlib.ZstdOptions & { pledgedSrcSize: number } = {
    params: {
      [c.ZSTD_c_compressionLevel]: level,
      [c.ZSTD_c_windowLog]: frame.windowLog,
      [c.ZSTD_c_checksumFlag]: frame.checksum ? 1 : 0,
      [c.ZSTD_c_contentSizeFlag]: 1,
    },
    pledgedSrcSize: body.length,
  }
  return new Promise((resolve, reject) => {
    zlib.zstdCompress(body, options, (err, out) => (err ? reject(err) : resolve(out)))
  })
}

/**
 * The DB as bytes of exactly `size`. zstd data gets compressed again with the original window, at the lowest
 * level that fits, and a zstd skippable frame fills the rest. Plain JSON gets trailing spaces.
 */
export async function encodeDb(db: DependencyDb, frame: ZstdFrame | null, size: number): Promise<Buffer> {
  const body = Buffer.from(JSON.stringify(db), 'utf-8')
  if (!frame) {
    if (body.length > size) throw new Error('the new dependency DB is larger than the old one')
    return Buffer.concat([body, Buffer.alloc(size - body.length, 0x20)])
  }
  for (const level of [3, 9, 19, 22]) {
    const comp = await zstd(body, frame, level)
    if (frame.contentSize && !hasContentSize(comp[4])) throw new Error('the new dependency DB has no content size in its zstd header')
    const pad = size - comp.length
    if (pad !== 0 && pad < 8) continue
    const out = Buffer.alloc(size)
    comp.copy(out)
    if (pad) {
      out.writeUInt32LE(SKIPPABLE, comp.length)
      out.writeUInt32LE(pad - 8, comp.length + 4)
    }
    if (!zlib.zstdDecompressSync(out).equals(body)) throw new Error('the new dependency DB does not read back')
    return out
  }
  throw new Error('the new dependency DB does not fit in the old entry size')
}
