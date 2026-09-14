import { safeStorage } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

/** pluginId -> scope -> granted */
export type Decisions = Record<string, Record<string, boolean>>

const FILE_VERSION = 1

/**
 * The user's permission decisions, encrypted with the OS account key. A file
 * that fails to decrypt (edited, or copied from another account) is dropped,
 * so every dangerous scope gets asked again.
 */
export class PermissionStore {
  private decisions: Decisions = {}
  private readonly persistent: boolean

  constructor(private readonly file: string) {
    this.persistent = safeStorage.isEncryptionAvailable()
    if (!this.persistent) console.warn('[permissions] OS encryption unavailable: decisions last for this session only')
    this.reload()
  }

  reload(): void {
    if (!this.persistent) return
    this.decisions = {}
    if (!fs.existsSync(this.file)) return
    try {
      const parsed = JSON.parse(safeStorage.decryptString(fs.readFileSync(this.file))) as { v?: number; decisions?: unknown }
      if (parsed.v === FILE_VERSION) this.decisions = sanitize(parsed.decisions)
    } catch (e) {
      console.warn('[permissions] stored decisions unreadable, asking again:', (e as Error).message)
    }
  }

  all(): Decisions {
    return structuredClone(this.decisions)
  }

  set(pluginId: string, grants: Record<string, boolean>): void {
    const current = (this.decisions[pluginId] ??= {})
    for (const [scope, granted] of Object.entries(grants)) current[scope] = granted === true
    this.save()
  }

  private save(): void {
    if (!this.persistent) return
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true })
      const tmp = `${this.file}.tmp`
      fs.writeFileSync(tmp, safeStorage.encryptString(JSON.stringify({ v: FILE_VERSION, decisions: this.decisions })))
      fs.renameSync(tmp, this.file)
    } catch (e) {
      console.error('[permissions] could not save decisions:', (e as Error).message)
    }
  }
}

function sanitize(raw: unknown): Decisions {
  const out: Decisions = {}
  if (!raw || typeof raw !== 'object') return out
  for (const [pluginId, grants] of Object.entries(raw as Record<string, unknown>)) {
    if (!grants || typeof grants !== 'object') continue
    const clean: Record<string, boolean> = {}
    for (const [scope, granted] of Object.entries(grants as Record<string, unknown>)) {
      if (typeof granted === 'boolean') clean[scope] = granted
    }
    out[pluginId] = clean
  }
  return out
}
