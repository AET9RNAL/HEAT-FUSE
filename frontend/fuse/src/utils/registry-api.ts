// Calls and types of the plugin registry (Supabase schema `registry`, edge functions `registry-*`).
import { supabase } from '../composables/supabase-client'

export const CDN_URL = ((import.meta.env.VITE_CDN_URL as string | undefined) || 'https://cdn.wotheatfuse.com').replace(/\/$/, '')

export type Status = 'draft' | 'pending_review' | 'approved' | 'rejected' | 'withdrawn'
export type FileState = 'awaiting_upload' | 'uploaded' | 'processing' | 'ready' | 'invalid'
export type Channel = 'release' | 'beta' | 'alpha'
export type Relation = 'required' | 'optional' | 'incompatible'
export type ProjectKind = 'plugin' | 'library'
export type SortKey = 'downloads' | 'views' | 'updated' | 'name'

export const CHANNELS: Channel[] = ['release', 'beta', 'alpha']
export const GAME_VERSION_RE = /^[0-9]{1,4}\.[0-9]{1,4}\.[0-9]{1,4}$/

/** A plugin process (runtime), game file changes (override), or both parts (hybrid). */
export type PluginType = 'runtime' | 'override' | 'hybrid'
export const PLUGIN_TYPES: PluginType[] = ['runtime', 'override', 'hybrid']

/** The type the manifest declares: `entry` gives a process, `override` gives game file changes. */
export function pluginTypeOf(manifest: Record<string, unknown> | null | undefined): PluginType {
    const o = manifest?.override
    const hasOverride = !!o && typeof o === 'object' && !Array.isArray(o)
    const hasEntry = typeof manifest?.entry === 'string' && manifest.entry.trim() !== ''
    if (hasOverride) return hasEntry ? 'hybrid' : 'override'
    return 'runtime'
}

/** The game versions a manifest declares, sorted, without bad values. */
export function manifestGameVersions(manifest: Record<string, unknown> | null | undefined): string[] {
    const list = manifest?.game_versions
    if (!Array.isArray(list)) return []
    const valid = list.filter((v): v is string => typeof v === 'string' && GAME_VERSION_RE.test(v))
    return [...new Set(valid)].sort(compareVersions)
}

/** The type of a file, or null without a file. A file from before the type column is runtime. */
export const fileType = (f: Pick<RegistryFile, 'plugin_type'> | null | undefined): PluginType | null =>
    f ? f.plugin_type ?? 'runtime' : null

export interface RegistryTag { id: number; slug: string; label: string; color: string | null }

export interface RegistryFile {
    id: string
    project_id: string
    version: string | null
    channel: Channel
    changelog: string
    game_versions: string[]
    /** Missing before the 20261109 migration: read it as runtime. */
    plugin_type?: PluginType
    file_name: string | null
    size_bytes: number | null
    sha256: string | null
    expected_sha256: string | null
    state: FileState
    status: Status
    min_fuse_version: string | null
    storage_key: string | null
    invalid_reason: string | null
    warnings: string[]
    downloads: number
    created_at: string
    updated_at: string
    published_at: string | null
    manifest?: Record<string, unknown> | null
    dependencies?: RegistryDependency[]
}

export interface RegistryDependency {
    project_id: string
    file_id: string | null
    relation: Relation
    source: 'creator' | 'imported'
    name: string
    slug: string
    plugin_id: string | null
    icon_key: string | null
    file_version: string | null
}

export interface RegistryProject {
    id: string
    slug: string
    plugin_id: string | null
    owner_id: string
    kind: ProjectKind
    name: string
    summary: string
    description: string
    icon_key: string | null
    links: Record<string, string>
    status: Status
    listed: boolean
    downloads: number
    views: number
    published_at: string | null
    created_at: string
    updated_at: string
    owner: { username: string | null; avatar_key: string | null } | null
    tags: RegistryTag[]
    latest_file: RegistryFile | null
}

export interface InstallRow {
    role: 'requested' | 'dependency' | 'optional' | 'incompatible' | 'error'
    project_id: string | null
    plugin_id: string | null
    project_name: string | null
    file_id: string | null
    version: string | null
    file_name: string | null
    sha256: string | null
    size_bytes: number | null
    storage_key: string | null
    warnings: string[]
    error: string | null
}

export interface CreatorProfile {
    user_id: string
    username: string | null
    bio: string
    avatar_key: string | null
    created_at: string
    projects: number
    downloads: number
}

export interface MyProfile {
    user_id: string
    username: string | null
    bio: string
    avatar_key: string | null
    created_at: string
    max_file_bytes: number
    storage_quota_bytes: number
    storage_used_bytes: number
}

export interface UsedByRow { id: string; slug: string; name: string; relation: Relation; icon_key?: string | null }
export interface FoundProject { id: string; slug: string; name: string; plugin_id: string | null; kind: ProjectKind; icon_key: string | null; owner: string | null }

/** A failed registry call. `code` is the stable error code from SQL or an edge function. */
export class RegistryError extends Error {
    code: string
    detail: string
    constructor(code: string, detail = '') {
        super(code)
        this.code = code
        this.detail = detail
    }
}

/** The caller's own file with the same bytes, from the detail of a duplicate_file error. */
export interface DuplicateFile {
    file_id: string
    project_id: string
    project_name: string
    version: string | null
    status: string
    state: string
}

export function duplicateOf(err: unknown): DuplicateFile | null {
    if (!(err instanceof RegistryError) || err.code !== 'duplicate_file' || !err.detail) return null
    try {
        const d = JSON.parse(err.detail) as Partial<DuplicateFile>
        return typeof d.file_id === 'string' && typeof d.project_id === 'string' ? d as DuplicateFile : null
    } catch {
        return null
    }
}

/** The translated text for an error code, or the code itself when no text exists. */
export function errorText(t: (key: string, params?: Record<string, string | number>) => string, err: unknown): string {
    const dup = duplicateOf(err)
    if (dup) return t('registry.error.duplicate_file_own', { project: dup.project_name, version: dup.version ?? '—' })
    const code = err instanceof RegistryError ? err.code : err instanceof Error ? err.message : String(err)
    const key = `registry.error.${code.split(':')[0]}`
    const text = t(key)
    return text === key ? code : text
}

export const db = () => supabase.schema('registry')

export async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
    const { data, error } = await db().rpc(fn, args)
    if (error) throw new RegistryError(error.message, error.details ?? '')
    return data as T
}

export async function invoke<T>(name: string, body: Record<string, unknown>): Promise<T> {
    const { data, error } = await supabase.functions.invoke(name, { body })
    if (error) {
        let code = error.message
        let detail = ''
        const res = (error as { context?: Response }).context
        if (res && typeof res.json === 'function') {
            try {
                const body = (await res.json()) as { error?: string; detail?: string }
                code = body.error ?? code
                detail = body.detail ?? ''
            } catch { /* not JSON */ }
        }
        throw new RegistryError(code, detail)
    }
    return data as T
}

export function cdnUrl(key: string | null | undefined): string | null {
    return key ? `${CDN_URL}/${key}` : null
}

/** Newest first, the same tuple order as the runtime resolver. */
export function compareVersions(a: string | null, b: string | null): number {
    const tuple = (v: string | null) => (v ?? '0').split('.').map(p => parseInt(p, 10) || 0)
    const x = tuple(a), y = tuple(b)
    for (let i = 0; i < Math.max(x.length, y.length); i++) {
        const d = (x[i] ?? 0) - (y[i] ?? 0)
        if (d !== 0) return d < 0 ? -1 : 1
    }
    return 0
}

export function formatBytes(bytes: number | null | undefined): string {
    if (!bytes) return '—'
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    if (bytes < 1024 ** 3) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
    return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}

export function formatDate(iso: string | null | undefined): string {
    if (!iso) return '—'
    return new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(iso))
}

export const CHANNEL_COLORS: Record<Channel, string> = { release: '#84ffb1', beta: '#7dd3fc', alpha: '#fde68a' }
