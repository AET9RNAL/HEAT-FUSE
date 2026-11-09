/**
 * Writes the override state that the runtime wants into the game files, while the game is closed.
 *
 * Electron main is the only writer of game files. The applier composes one FUSE pack (aa_fuse.zip) from the
 * picked presets and makes their project edits: patched_project.json and the dependency DB in each content
 * patch, or coldwar.project and the game's DB pack when no content patch exists. A ledger keeps the value
 * before each edit, so a revert puts back what was there before FUSE.
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import {
  decodeDb, encodeDb, findStoredEntry, getDeps, getJsonValue, isJson, readStoredEntry, setDeps, setJsonValue,
  storedEntries, storedZip, writeStoredEntry,
} from './gameZip'

const PACK_NAME = 'aa_fuse.zip'
const PROJECT_ENTRY = 'patched_project.json'
const DB_ENTRY = '.assets/output/client_dependencies_db.json'
const ROOT_PROJECT = 'coldwar.project'
const GAME_POLL_MS = 3000
const WATCH_DEBOUNCE_MS = 2000
const OWN_WRITE_QUIET_MS = 2500
// patch.zip is about 50 MB: one backup for each file.
const BACKUPS_KEPT = 1

type ProjectOp =
  | { op: 'set'; key: string; value: unknown; pluginId: string }
  | { op: 'dependencies'; asset: string; dependencies: string[]; pluginId: string }

export interface WantedState {
  seq: number
  gameDir: string | null
  packs: Array<{ pluginId: string; preset: string; zip: string; entries: string[] }>
  project: ProjectOp[]
}

export type ApplyResults = Record<string, { state: 'applied' | 'failed'; reason?: string }>

interface Target {
  file: string
  /** The zip entry, or null for a plain file. */
  entry: string | null
  kind: 'project' | 'db'
}

type LedgerEdit =
  | { op: 'set'; file: string; entry: string | null; key: string; value: unknown; old: unknown; pluginId: string }
  | {
      op: 'dependencies'; file: string; entry: string; asset: string
      wanted: string[]; applied: string[]; old: string[] | null; pluginId: string
      /** SHA-256 of the DB entry after FUSE's last pass: the same hash skips the decode. */
      entrySha?: string
    }

interface Ledger {
  format: 1
  /** `presets` lists plugin/preset for each preset in the pack. */
  pack: { file: string; sha256: string; presets?: string[] } | null
  edits: LedgerEdit[]
}

/** What FUSE holds in the game files, for the App. */
export interface HeldChanges {
  pack: { file: string; presets: string[] } | null
  files: Array<{ file: string; entry: string | null; edits: number; plugins: string[] }>
  /** True while changes wait for the game to close. */
  waiting: boolean
  error?: string
}

interface EditResult {
  body: Buffer | null
  keep: LedgerEdit[]
  added: LedgerEdit[]
  undone: number
}

export interface ApplierDeps {
  isGameRunning(): Promise<boolean>
  /** The folder with one sub-folder for each content patch (patch.zip). */
  contentPatchRoot(): string
  /** The ledger and the backups. One folder for the PC, so dev and release builds share it. */
  stateDir(): string
  log(msg: string): void
  warn(msg: string): void
  /** The ledger or the wait for the game changed. */
  onHeldChange?(held: HeldChanges): void
}

const sha256 = (b: Buffer | string): string => crypto.createHash('sha256').update(b).digest('hex')
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b)
const fileId = (file: string): string => path.resolve(file).toLowerCase()
const targetId = (file: string, entry: string | null): string => `${fileId(file)}|${entry ?? ''}`
/** A `set` key is a path under "settings", for example cw::session::ClientSessionSettings/lobby/path. */
const keyPath = (key: string): string[] => ['settings', ...key.split('/')]

function hasStored(file: string, entry: string): boolean {
  try {
    const fd = fs.openSync(file, 'r')
    try {
      return findStoredEntry(fd, fs.fstatSync(fd).size, entry) !== null
    } finally {
      fs.closeSync(fd)
    }
  } catch {
    return false
  }
}

function describe(e: unknown): string {
  const err = e as NodeJS.ErrnoException
  if (err?.code === 'EBUSY' || err?.code === 'EPERM' || err?.code === 'EACCES') {
    return `${path.basename(err.path ?? 'a game file')} is locked. Close the game, and FUSE applies the change`
  }
  return err instanceof Error ? err.message : String(e)
}

export class OverrideApplier {
  private wanted: WantedState | null = null
  private reply: ((msg: Record<string, unknown>) => void) | null = null
  private queue: Promise<void> = Promise.resolve()
  private queued = false
  private gamePoll: ReturnType<typeof setTimeout> | null = null
  private watchers: fs.FSWatcher[] = []
  private watchedDir: string | null = null
  private watchTimer: ReturnType<typeof setTimeout> | null = null
  private heldTimer: ReturnType<typeof setTimeout> | null = null
  private quietUntil = 0

  constructor(private readonly deps: ApplierDeps) {}

  /** A new wanted state from the runtime. `reply` reaches the runtime that sent it. */
  setWanted(state: WantedState, reply: (msg: Record<string, unknown>) => void): void {
    this.wanted = state
    this.reply = reply
    this.watch(state.gameDir)
    this.schedule()
  }

  /** Takes back every FUSE change, for "Remove all" while the runtime is down. */
  removeAll(): void {
    this.setWanted({ seq: -1, gameDir: null, packs: [], project: [] }, () => {})
  }

  /** What the ledger holds now. */
  held(): HeldChanges {
    const waiting = this.gamePoll !== null
    try {
      const ledger = this.loadLedger()
      const files = new Map<string, HeldChanges['files'][number]>()
      for (const e of ledger.edits) {
        const id = targetId(e.file, e.entry)
        const f = files.get(id) ?? { file: e.file, entry: e.entry, edits: 0, plugins: [] }
        f.edits++
        if (!f.plugins.includes(e.pluginId)) f.plugins.push(e.pluginId)
        files.set(id, f)
      }
      const pack = ledger.pack ? { file: ledger.pack.file, presets: ledger.pack.presets ?? [] } : null
      return { pack, files: [...files.values()], waiting }
    } catch (e) {
      return { pack: null, files: [], waiting, error: describe(e) }
    }
  }

  dispose(): void {
    for (const w of this.watchers) w.close()
    this.watchers = []
    if (this.gamePoll) clearTimeout(this.gamePoll)
    if (this.watchTimer) clearTimeout(this.watchTimer)
    if (this.heldTimer) clearTimeout(this.heldTimer)
    this.gamePoll = null
    this.watchTimer = null
    this.heldTimer = null
  }

  /** One event for a burst of ledger saves. */
  private heldChanged(): void {
    if (!this.deps.onHeldChange || this.heldTimer) return
    this.heldTimer = setTimeout(() => {
      this.heldTimer = null
      this.deps.onHeldChange?.(this.held())
    }, 100)
  }

  private schedule(): void {
    if (this.queued) return
    this.queued = true
    this.queue = this.queue
      .then(() => {
        this.queued = false
        return this.run()
      })
      .catch((e: unknown) => this.deps.warn(`[overrides] apply failed: ${describe(e)}`))
  }

  private async run(): Promise<void> {
    const state = this.wanted
    if (!state) return
    if (await this.deps.isGameRunning()) {
      // An answer from the ledger now: what the game files already hold, and what still waits for the game.
      if (state === this.wanted) {
        const { results, held } = this.fromLedger(state)
        this.reply?.({ type: 'overrides:status', seq: state.seq, results, held, waiting: true })
      }
      this.waitForGame()
      return
    }
    if (this.gamePoll) {
      clearTimeout(this.gamePoll)
      this.gamePoll = null
      this.heldChanged()
    }
    let results: ApplyResults
    try {
      results = await this.apply(state)
    } catch (e) {
      const reason = describe(e)
      this.deps.warn(`[overrides] ${reason}`)
      results = Object.fromEntries(state.packs.map((p) => [p.pluginId, { state: 'failed' as const, reason }]))
    }
    if (state === this.wanted) this.reply?.({ type: 'overrides:status', seq: state.seq, results, held: this.fromLedger(state).held, waiting: false })
  }

  /**
   * From the ledger, with no game file read: "applied" for each wanted plugin whose preset and edits the files
   * hold, and every plugin with changes in the files.
   */
  private fromLedger(state: WantedState): { results: ApplyResults; held: string[] } {
    let ledger: Ledger
    try {
      ledger = this.loadLedger()
    } catch {
      return { results: {}, held: [] }
    }
    const file = state.gameDir ? path.join(state.gameDir, '.assets', 'output', PACK_NAME) : null
    const inPack = new Set(ledger.pack && file && fileId(ledger.pack.file) === fileId(file) ? ledger.pack.presets ?? [] : [])
    const edits = new Set(ledger.edits.map((e) => (e.op === 'set'
      ? `set|${e.pluginId}|${e.key}|${JSON.stringify(e.value)}`
      : `dependencies|${e.pluginId}|${e.asset}|${JSON.stringify(e.wanted)}`)))
    const results: ApplyResults = {}
    for (const p of state.packs) {
      const ops = state.project.filter((o) => o.pluginId === p.pluginId).map((o) => (o.op === 'set'
        ? `set|${o.pluginId}|${o.key}|${JSON.stringify(o.value)}`
        : `dependencies|${o.pluginId}|${o.asset}|${JSON.stringify(o.dependencies)}`))
      if (inPack.has(`${p.pluginId}/${p.preset}`) && ops.every((k) => edits.has(k))) results[p.pluginId] = { state: 'applied' }
    }
    const held = new Set([
      ...(ledger.pack?.presets ?? []).map((s) => s.slice(0, s.lastIndexOf('/'))),
      ...ledger.edits.map((e) => e.pluginId),
    ])
    return { results, held: [...held] }
  }

  /** The game locks its files while it runs: check again until it closes. */
  private waitForGame(): void {
    if (this.gamePoll) return
    this.deps.log('[overrides] the game runs: the changes wait until it closes')
    const tick = async (): Promise<void> => {
      if (await this.deps.isGameRunning()) {
        this.gamePoll = setTimeout(() => void tick(), GAME_POLL_MS)
        return
      }
      this.gamePoll = null
      this.heldChanged()
      this.schedule()
    }
    this.gamePoll = setTimeout(() => void tick(), GAME_POLL_MS)
    this.heldChanged()
  }

  async apply(state: WantedState): Promise<ApplyResults> {
    const ledger = this.loadLedger()
    const failed = new Map<string, string>()
    const fail = (ids: string[], e: unknown): void => {
      const reason = describe(e)
      this.deps.warn(`[overrides] ${ids.join(', ') || 'revert'}: ${reason}`)
      for (const id of ids) if (!failed.has(id)) failed.set(id, reason)
    }

    const parts = new Map<string, Array<{ name: string; data: Buffer }>>()
    for (const p of state.packs) {
      try {
        const stored = storedEntries(p.zip)
        parts.set(p.pluginId, p.entries.map((name) => {
          const data = stored.get(name)
          if (!data) throw new Error(`the '${p.preset}' pack has no stored ${name}`)
          return { name, data }
        }))
      } catch (e) {
        fail([p.pluginId], e)
      }
    }

    // A plugin whose edits fail leaves the state, and a second pass takes back its other edits.
    let ops = state.project.filter((o) => !failed.has(o.pluginId))
    for (let pass = 0; pass < 2; pass++) {
      const before = failed.size
      await this.applyProject(state.gameDir, ops, ledger, fail)
      ops = ops.filter((o) => !failed.has(o.pluginId))
      if (failed.size === before) break
    }

    const live = state.packs.filter((p) => !failed.has(p.pluginId))
    try {
      this.writePack(state.gameDir, live.flatMap((p) => parts.get(p.pluginId) ?? []), ledger, live.map((p) => `${p.pluginId}/${p.preset}`))
    } catch (e) {
      // Without their pack, the project edits of these plugins go back too.
      fail(live.map((p) => p.pluginId), e)
      await this.applyProject(state.gameDir, ops.filter((o) => !failed.has(o.pluginId)), ledger, fail)
    }

    const results: ApplyResults = {}
    for (const id of new Set([...state.packs.map((p) => p.pluginId), ...state.project.map((o) => o.pluginId)])) {
      const reason = failed.get(id)
      results[id] = reason ? { state: 'failed', reason } : { state: 'applied' }
    }
    return results
  }

  // project edits

  private async applyProject(gameDir: string | null, ops: ProjectOp[], ledger: Ledger, fail: (ids: string[], e: unknown) => void): Promise<void> {
    const targets = gameDir ? this.targets(gameDir) : { project: [], db: [] }
    const groups = new Map<string, { target: Target; ops: ProjectOp[] }>()
    for (const op of ops) {
      const reach = op.op === 'set' ? targets.project : targets.db
      if (!reach.length) {
        fail([op.pluginId], new Error(op.op === 'set' ? 'no project file found in the game' : 'no dependency DB found in the game'))
        continue
      }
      for (const t of reach) {
        const id = targetId(t.file, t.entry)
        const g = groups.get(id) ?? { target: t, ops: [] }
        g.ops.push(op)
        groups.set(id, g)
      }
    }
    // Targets that only the ledger knows still get their edits reverted.
    for (const e of ledger.edits) {
      const id = targetId(e.file, e.entry)
      if (!groups.has(id)) groups.set(id, { target: { file: e.file, entry: e.entry, kind: e.op === 'set' ? 'project' : 'db' }, ops: [] })
    }
    for (const g of groups.values()) {
      try {
        await this.editTarget(g.target, g.ops, ledger)
      } catch (e) {
        fail([...new Set(g.ops.map((o) => o.pluginId))], e)
      }
    }
  }

  /** Where the game reads its project and its dependency DB from. A content patch wins over the game folder. */
  private targets(gameDir: string): { project: Target[]; db: Target[] } {
    const project: Target[] = []
    const db: Target[] = []
    const add = (list: Target[], t: Target | null): void => {
      if (t && !list.some((x) => targetId(x.file, x.entry) === targetId(t.file, t.entry))) list.push(t)
    }
    const rootProject: Target = { file: path.join(gameDir, ROOT_PROJECT), entry: null, kind: 'project' }
    let gameDb: Target | null | undefined
    const gameDbPack = (): Target | null => {
      if (gameDb === undefined) gameDb = this.gameDbPack(gameDir)
      return gameDb
    }
    const patches = this.patchZips()
    for (const zip of patches) {
      add(project, hasStored(zip, PROJECT_ENTRY) ? { file: zip, entry: PROJECT_ENTRY, kind: 'project' } : rootProject)
      add(db, hasStored(zip, DB_ENTRY) ? { file: zip, entry: DB_ENTRY, kind: 'db' } : gameDbPack())
    }
    if (!patches.length) {
      add(project, fs.existsSync(rootProject.file) ? rootProject : null)
      add(db, gameDbPack())
    }
    return { project, db }
  }

  private patchZips(): string[] {
    const root = this.deps.contentPatchRoot()
    try {
      return fs.readdirSync(root, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => path.join(root, d.name, 'patch.zip'))
        .filter((p) => fs.existsSync(p))
        .sort()
    } catch {
      return []
    }
  }

  /** The first game pack in name order that holds the DB. FUSE's own pack and user packs (aa_) do not count. */
  private gameDbPack(gameDir: string): Target | null {
    const out = path.join(gameDir, '.assets', 'output')
    try {
      for (const f of fs.readdirSync(out).filter((x) => x.endsWith('.zip') && !x.startsWith('aa_')).sort()) {
        const file = path.join(out, f)
        if (hasStored(file, DB_ENTRY)) return { file, entry: DB_ENTRY, kind: 'db' }
      }
    } catch { /* no game folder: no target */ }
    return null
  }

  private async editTarget(target: Target, ops: ProjectOp[], ledger: Ledger): Promise<void> {
    const id = targetId(target.file, target.entry)
    const own = ledger.edits.filter((e) => targetId(e.file, e.entry) === id)
    const others = ledger.edits.filter((e) => targetId(e.file, e.entry) !== id)
    if (!fs.existsSync(target.file)) {
      if (own.length) {
        this.deps.log(`[overrides] ${target.file} is gone: its ${own.length} edits leave the ledger`)
        ledger.edits = others
        this.saveLedger(ledger)
      }
      if (ops.length) throw new Error(`${path.basename(target.file)} is missing`)
      return
    }
    const raw = target.entry ? readStoredEntry(target.file, target.entry) : fs.readFileSync(target.file)
    if (!raw) throw new Error(`${path.basename(target.file)} has no stored ${target.entry}`)
    const rawSha = target.kind === 'db' ? sha256(raw) : ''
    if (target.kind === 'db' && this.dbInPlace(own, ops, rawSha)) return
    const r = target.kind === 'project' ? this.editProject(target, raw, ops, own) : await this.editDb(target, raw, ops, own)
    if (r.body) {
      this.backup(target.file, ledger)
      // The ledger first: a stop before the write leaves edits that the next run finds not in place and drops.
      ledger.edits = [...others, ...own, ...r.added]
      this.saveLedger(ledger)
      this.quiet()
      if (target.entry) writeStoredEntry(target.file, target.entry, raw, r.body)
      else fs.writeFileSync(target.file, r.body)
      this.deps.log(`[overrides] ${path.basename(target.file)}${target.entry ? ` ${target.entry}` : ''}: ${r.added.length} set, ${r.undone} taken back`)
    }
    const entrySha = target.kind === 'db' ? (r.body ? sha256(r.body) : rawSha) : ''
    // Kept edits stay in place, so a pass with no change saves nothing.
    const kept = new Set(r.keep)
    const added = new Set(r.added)
    const next = [
      ...ledger.edits.filter((e) => !added.has(e) && (targetId(e.file, e.entry) !== id || kept.has(e))),
      ...r.added,
    ].map((e) => (targetId(e.file, e.entry) === id && e.op === 'dependencies' ? { ...e, entrySha } : e))
    if (!same(ledger.edits, next)) {
      ledger.edits = next
      this.saveLedger(ledger)
    }
  }

  /** True when the DB entry is still the one FUSE left, and the state wants the same edits. */
  private dbInPlace(own: LedgerEdit[], ops: ProjectOp[], rawSha: string): boolean {
    const deps = ops.filter((o) => o.op === 'dependencies')
    if (!own.length || own.length !== deps.length) return false
    return own.every((e) => e.op === 'dependencies' && e.entrySha === rawSha
      && deps.some((o) => o.asset === e.asset && o.pluginId === e.pluginId && same(o.dependencies, e.wanted)))
  }

  private editProject(target: Target, raw: Buffer, ops: ProjectOp[], own: LedgerEdit[]): EditResult {
    const keepSize = target.entry !== null
    const text = raw.toString('latin1')
    let next = text
    const keep: LedgerEdit[] = []
    const kept = new Set<string>()
    let undone = 0
    for (const e of [...own].reverse()) {
      if (e.op !== 'set') continue
      // Another value means a new patch or another tool: nothing of FUSE is there to take back.
      if (!same(getJsonValue(next, keyPath(e.key)), e.value)) continue
      const still = ops.some((o) => o.op === 'set' && o.key === e.key && o.pluginId === e.pluginId && same(o.value, e.value))
      if (still && !kept.has(e.key)) {
        keep.unshift(e)
        kept.add(e.key)
        continue
      }
      next = setJsonValue(next, keyPath(e.key), e.old, keepSize).text
      undone++
    }
    const added: LedgerEdit[] = []
    for (const o of ops) {
      if (o.op !== 'set' || kept.has(o.key)) continue
      const r = setJsonValue(next, keyPath(o.key), o.value, keepSize)
      next = r.text
      added.push({ op: 'set', file: target.file, entry: target.entry, key: o.key, value: o.value, old: r.old, pluginId: o.pluginId })
    }
    if (next === text) return { body: null, keep, added, undone }
    if (keepSize && next.length !== text.length) throw new Error('the project edit changed the entry size')
    if (isJson(text) && !isJson(next)) throw new Error('the project edit broke the JSON')
    return { body: Buffer.from(next, 'latin1'), keep, added, undone }
  }

  private async editDb(target: Target, raw: Buffer, ops: ProjectOp[], own: LedgerEdit[]): Promise<EditResult> {
    const { db, frame } = decodeDb(raw)
    let changed = false
    const keep: LedgerEdit[] = []
    const kept = new Set<string>()
    let undone = 0
    for (const e of [...own].reverse()) {
      if (e.op !== 'dependencies' || !same(getDeps(db, e.asset), e.applied)) continue
      const still = ops.some((o) => o.op === 'dependencies' && o.asset === e.asset && o.pluginId === e.pluginId && same(o.dependencies, e.wanted))
      if (still && !kept.has(e.asset)) {
        keep.unshift(e)
        kept.add(e.asset)
        continue
      }
      setDeps(db, e.asset, e.old)
      undone++
      if (!same(e.old, e.applied)) changed = true
    }
    const added: LedgerEdit[] = []
    for (const o of ops) {
      if (o.op !== 'dependencies' || kept.has(o.asset)) continue
      const old = getDeps(db, o.asset)
      setDeps(db, o.asset, [...new Set([...(old ?? []), ...o.dependencies])])
      const applied = getDeps(db, o.asset) ?? []
      if (!same(old, applied)) changed = true
      added.push({
        op: 'dependencies', file: target.file, entry: target.entry!, asset: o.asset,
        wanted: [...o.dependencies], applied, old, pluginId: o.pluginId,
      })
    }
    if (!changed) return { body: null, keep, added, undone }
    return { body: await encodeDb(db, frame, raw.length), keep, added, undone }
  }

  // the FUSE pack

  private writePack(gameDir: string | null, entries: Array<{ name: string; data: Buffer }>, ledger: Ledger, label: string[]): void {
    const file = gameDir ? path.join(gameDir, '.assets', 'output', PACK_NAME) : null
    if (ledger.pack && (!file || !entries.length || fileId(ledger.pack.file) !== fileId(file))) {
      this.removePack(ledger.pack)
      ledger.pack = null
      this.saveLedger(ledger)
    }
    if (!file || !entries.length) return
    const names = new Set<string>()
    for (const e of entries) {
      if (names.has(e.name)) throw new Error(`two presets put ${e.name} into the game`)
      names.add(e.name)
    }
    const body = storedZip(entries)
    const hash = sha256(body)
    const record = { file, sha256: hash, presets: label }
    if (fs.existsSync(file)) {
      const current = sha256(fs.readFileSync(file))
      if (current === hash) {
        if (!same(ledger.pack, record)) {
          ledger.pack = record
          this.saveLedger(ledger)
        }
        return
      }
      // FUSE replaces only the pack it wrote last: the ledger has its hash.
      if (current !== ledger.pack?.sha256) throw new Error(`${PACK_NAME} in the game folder is not the pack FUSE wrote. Move it away, and FUSE applies the change`)
    }
    ledger.pack = record
    this.saveLedger(ledger)
    const part = `${file}.part`
    this.quiet()
    try {
      fs.writeFileSync(part, body)
      fs.renameSync(part, file)
    } catch (e) {
      fs.rmSync(part, { force: true })
      throw e
    }
    this.deps.log(`[overrides] wrote ${PACK_NAME} (${entries.length} entries): ${label.join(', ')}`)
  }

  private removePack(pack: { file: string; sha256: string }): void {
    if (!fs.existsSync(pack.file)) return
    if (sha256(fs.readFileSync(pack.file)) !== pack.sha256) {
      this.deps.warn(`[overrides] ${pack.file} is not the pack FUSE wrote: FUSE keeps it`)
      return
    }
    this.quiet()
    fs.unlinkSync(pack.file)
    this.deps.log(`[overrides] removed ${pack.file}`)
  }

  // ledger and backups

  private ledgerFile(): string {
    return path.join(this.deps.stateDir(), 'ledger.json')
  }

  private loadLedger(): Ledger {
    let text: string
    try {
      text = fs.readFileSync(this.ledgerFile(), 'utf-8')
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return { format: 1, pack: null, edits: [] }
      throw e
    }
    const j = JSON.parse(text) as Partial<Ledger>
    if (j.format !== 1 || !Array.isArray(j.edits)) throw new Error(`${this.ledgerFile()} is not a FUSE ledger`)
    return { format: 1, pack: j.pack ?? null, edits: j.edits }
  }

  private saveLedger(ledger: Ledger): void {
    const file = this.ledgerFile()
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(`${file}.part`, JSON.stringify(ledger, null, 2))
    fs.renameSync(`${file}.part`, file)
    this.heldChanged()
  }

  /** A copy of a file before its first FUSE edit. A new content hash replaces the older copy. */
  private backup(file: string, ledger: Ledger): void {
    if (ledger.edits.some((e) => fileId(e.file) === fileId(file))) return
    const dir = path.join(this.deps.stateDir(), 'backups')
    const data = fs.readFileSync(file)
    const tag = sha256(fileId(file)).slice(0, 8)
    const full = path.join(dir, `${tag}-${sha256(data).slice(0, 16)}-${path.basename(file)}`)
    fs.mkdirSync(dir, { recursive: true })
    if (!fs.existsSync(full)) {
      fs.writeFileSync(full, data)
      this.deps.log(`[overrides] backup of ${file}: ${full}`)
    }
    const mine = fs.readdirSync(dir)
      .filter((n) => n.startsWith(`${tag}-`))
      .map((n) => ({ n, t: fs.statSync(path.join(dir, n)).mtimeMs }))
      .sort((a, b) => b.t - a.t)
    for (const old of mine.slice(BACKUPS_KEPT)) fs.rmSync(path.join(dir, old.n), { force: true })
  }

  // watchers: a patch download or a game update undoes FUSE's changes

  private watch(gameDir: string | null): void {
    const dir = gameDir ? path.resolve(gameDir) : ''
    if (dir === this.watchedDir) return
    for (const w of this.watchers) w.close()
    this.watchers = []
    this.watchedDir = dir
    const add = (folder: string, recursive: boolean): void => {
      try {
        const w = fs.watch(folder, { recursive }, () => this.onFilesChanged())
        w.on('error', () => w.close())
        this.watchers.push(w)
      } catch { /* a missing folder gets no watcher */ }
    }
    if (dir) add(path.join(dir, '.assets', 'output'), false)
    add(this.deps.contentPatchRoot(), true)
  }

  private onFilesChanged(): void {
    if (Date.now() < this.quietUntil) return
    if (this.watchTimer) clearTimeout(this.watchTimer)
    this.watchTimer = setTimeout(() => {
      this.watchTimer = null
      if (Date.now() < this.quietUntil) return
      // The runtime checks the presets against the new files. The applier puts back what a download took away.
      this.reply?.({ type: 'overrides:recheck' })
      this.schedule()
    }, WATCH_DEBOUNCE_MS)
  }

  private quiet(): void {
    this.quietUntil = Date.now() + OWN_WRITE_QUIET_MS
  }
}
