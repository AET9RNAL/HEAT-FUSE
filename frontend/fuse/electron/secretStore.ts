import { safeStorage } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

/** pluginId -> key -> value */
type Secrets = Record<string, Record<string, string>>

const FILE_VERSION = 1
const MAX_KEYS = 100
const MAX_VALUE_BYTES = 16 * 1024

/**
 * Plugin secrets, encrypted with the OS account key. A file that fails to decrypt
 * is dropped. Nothing is stored when OS encryption is unavailable.
 */
export class SecretStore {
  private data: Secrets = {}

  constructor(private readonly file: string) {
    this.load()
  }

  get(pluginId: string, key: string): string | undefined {
    return this.data[pluginId]?.[key]
  }

  has(pluginId: string, key: string): boolean {
    return this.get(pluginId, key) !== undefined
  }

  set(pluginId: string, key: string, value: string): void {
    if (!safeStorage.isEncryptionAvailable()) throw new Error("OS encryption is unavailable, so secrets can't be stored")
    if (Buffer.byteLength(value, 'utf8') > MAX_VALUE_BYTES) throw new Error(`secret values are limited to ${MAX_VALUE_BYTES} bytes`)
    const entries = (this.data[pluginId] ??= {})
    if (!(key in entries) && Object.keys(entries).length >= MAX_KEYS) throw new Error(`a plugin can keep up to ${MAX_KEYS} secrets`)
    entries[key] = value
    this.save()
  }

  delete(pluginId: string, key: string): boolean {
    const entries = this.data[pluginId]
    if (!entries || !(key in entries)) return false
    delete entries[key]
    if (!Object.keys(entries).length) delete this.data[pluginId]
    this.save()
    return true
  }

  private load(): void {
    if (!safeStorage.isEncryptionAvailable() || !fs.existsSync(this.file)) return
    try {
      const parsed = JSON.parse(safeStorage.decryptString(fs.readFileSync(this.file))) as { v?: number; secrets?: unknown }
      if (parsed.v === FILE_VERSION) this.data = sanitize(parsed.secrets)
    } catch (e) {
      console.warn('[secrets] stored secrets unreadable, starting empty:', (e as Error).message)
    }
  }

  private save(): void {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true })
      const tmp = `${this.file}.tmp`
      fs.writeFileSync(tmp, safeStorage.encryptString(JSON.stringify({ v: FILE_VERSION, secrets: this.data })))
      fs.renameSync(tmp, this.file)
    } catch (e) {
      console.error('[secrets] could not save:', (e as Error).message)
    }
  }
}

function sanitize(raw: unknown): Secrets {
  const out: Secrets = {}
  if (!raw || typeof raw !== 'object') return out
  for (const [pluginId, entries] of Object.entries(raw as Record<string, unknown>)) {
    if (!entries || typeof entries !== 'object') continue
    const clean: Record<string, string> = {}
    for (const [key, value] of Object.entries(entries as Record<string, unknown>)) {
      if (typeof value === 'string') clean[key] = value
    }
    out[pluginId] = clean
  }
  return out
}
