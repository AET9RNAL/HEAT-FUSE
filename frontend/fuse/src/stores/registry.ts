import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { eventBus } from '../events/eventBus'
import { logger } from '../utils/logger'
import { useAppStore } from './app'
import { useI18n } from '../composables/useI18n'
import {
    db, rpc, cdnUrl, compareVersions, errorText, RegistryError,
    type RegistryProject, type RegistryFile, type RegistryTag, type InstallRow, type CreatorProfile,
    type UsedByRow, type SortKey, type Channel, type ProjectKind,
} from '../utils/registry-api'

export interface BrowseItem extends RegistryProject { game_compatible: boolean }

/** One file on disk, linked to the registry by its SHA-256 when the registry knows it. */
export interface InstalledFile {
    filePath: string
    sha256: string
    plugin_id: string
    version: string
    fileId: string | null
    projectId: string | null
    update: { fileId: string; version: string } | null
}

/** What one install click does, shown in the confirm list before any download. */
export interface InstallPlan {
    requested: InstallRow
    downloads: InstallRow[]
    kept: InstallRow[]
    optional: InstallRow[]
    blockers: { name: string; reason: string }[]
    warnings: string[]
}

export type InstallUiState = 'idle' | 'downloading' | 'installed' | 'update' | 'replace' | 'error'

const PAGE = 20

// A refetch with the same rows keeps the old array, so the cards do not render again.
function sameRows(a: unknown, b: unknown): boolean {
    return JSON.stringify(a) === JSON.stringify(b)
}

export const useRegistryStore = defineStore('registry', () => {
    const app = useAppStore()
    const { t } = useI18n()

    // A random ID per App install, so downloads count once per day without an account.
    const installId = ref<string>(crypto.randomUUID())
    const channels = ref<Channel[]>(['release'])

    const tags = ref<RegistryTag[]>([])
    const gameVersions = ref<string[]>([])
    const stats = ref<{ projects: number; downloads: number } | null>(null)

    const playerGameVersion = computed(() => app.gameVersion || null)

    // ── Browse ──────────────────────────────────────────────────────────────────

    const filters = ref({ search: '', tagIds: [] as number[], sort: 'downloads' as SortKey, kind: null as ProjectKind | null })
    const projects = ref<BrowseItem[]>([])
    const total = ref(0)
    const loading = ref(false)
    let browseSeq = 0

    async function fetchTags(): Promise<void> {
        const { data, error } = await db().from('tags').select('*').order('label')
        if (error) { logger.error('registry:tags', { error }); return }
        const next = data ?? []
        if (!sameRows(tags.value, next)) tags.value = next
    }

    async function fetchGameVersions(): Promise<void> {
        const { data, error } = await db().from('game_versions').select('version, sort_key').order('sort_key', { ascending: false })
        if (error) { logger.error('registry:game_versions', { error }); return }
        gameVersions.value = (data ?? []).map((r: { version: string }) => r.version)
    }

    async function fetchStats(): Promise<void> {
        try { stats.value = await rpc<{ projects: number; downloads: number }>('public_stats') }
        catch (err) { logger.error('registry:stats', { error: err }) }
    }

    async function search(append = false): Promise<void> {
        const seq = ++browseSeq
        loading.value = true
        try {
            const q = filters.value.search.trim()
            const rows = await rpc<{ project: RegistryProject; game_compatible: boolean; total: number }[]>('search_projects', {
                p_q: q || null,
                p_tag_ids: filters.value.tagIds.length ? filters.value.tagIds : null,
                p_kind: filters.value.kind,
                p_sort: filters.value.sort,
                p_game_version: playerGameVersion.value,
                p_limit: PAGE,
                p_offset: append ? projects.value.length : 0,
            })
            if (seq !== browseSeq) return
            const items = rows.map(r => ({ ...r.project, game_compatible: r.game_compatible }))
            const next = append ? [...projects.value, ...items] : items
            if (!sameRows(projects.value, next)) projects.value = next
            total.value = rows[0]?.total ?? (append ? total.value : 0)
        } catch (err) {
            logger.error('registry:search', { error: err })
        } finally {
            if (seq === browseSeq) loading.value = false
        }
    }

    const hasMore = computed(() => projects.value.length < total.value)

    let searchTimer: ReturnType<typeof setTimeout> | null = null
    watch(() => [filters.value.search, filters.value.tagIds.join(','), filters.value.sort, filters.value.kind], () => {
        if (searchTimer) clearTimeout(searchTimer)
        searchTimer = setTimeout(() => void search(), 250)
    })

    // ── Project page and creator page ───────────────────────────────────────────

    const selected = ref<RegistryProject | null>(null)
    const files = ref<RegistryFile[]>([])
    const usedBy = ref<UsedByRow[]>([])
    const loadingProject = ref(false)
    const creator = ref<{ profile: CreatorProfile; projects: RegistryProject[] } | null>(null)
    const loadingCreator = ref(false)

    // used_by returns no icons. Every row is a listed project, so RLS lets the client read its icon.
    async function withIcons(rows: UsedByRow[]): Promise<UsedByRow[]> {
        if (!rows.length) return rows
        const { data } = await db().from('projects').select('id, icon_key').in('id', rows.map(r => r.id))
        const icons = new Map((data ?? []).map((p: { id: string; icon_key: string | null }) => [p.id, p.icon_key]))
        return rows.map(r => ({ ...r, icon_key: icons.get(r.id) ?? null }))
    }

    /** A Project ID, a slug or an old slug. */
    async function openProject(ref_: string): Promise<boolean> {
        loadingProject.value = true
        creator.value = null
        try {
            const project = await rpc<RegistryProject | null>('get_project', { p_ref: ref_ })
            if (!project) return false
            selected.value = project
            files.value = []
            usedBy.value = []
            const [list, used] = await Promise.all([
                rpc<(RegistryFile | null)[]>('list_files', { p_project: project.id }),
                rpc<UsedByRow[]>('used_by', { p_project: project.id }),
            ])
            files.value = list.filter((f): f is RegistryFile => !!f && f.status === 'approved')
            usedBy.value = await withIcons(used)
            void rpc('record_view', { p_project: project.id, p_install_id: installId.value }).catch(() => {})
            return true
        } catch (err) {
            logger.error('registry:openProject', { error: err })
            return false
        } finally {
            loadingProject.value = false
        }
    }

    async function openFile(fileId: string): Promise<boolean> {
        const file = await rpc<RegistryFile | null>('get_file', { p_file: fileId }).catch(() => null)
        return file ? openProject(file.project_id) : false
    }

    function closeProject(): void {
        selected.value = null
        files.value = []
        usedBy.value = []
    }

    async function openCreator(username: string): Promise<boolean> {
        loadingCreator.value = true
        try {
            const profile = await rpc<CreatorProfile | null>('get_creator', { p_username: username })
            if (!profile) return false
            const { data, error } = await db().from('projects')
                .select('project_json')
                .eq('owner_id', profile.user_id).eq('status', 'approved').eq('listed', true)
                .order('downloads', { ascending: false })
            if (error) throw new RegistryError(error.message)
            creator.value = {
                profile,
                projects: (data ?? []).map((r: { project_json: RegistryProject }) => r.project_json).filter(Boolean),
            }
            selected.value = null
            return true
        } catch (err) {
            logger.error('registry:openCreator', { error: err })
            return false
        } finally {
            loadingCreator.value = false
        }
    }

    function closeCreator(): void { creator.value = null }

    // ── Installed files ─────────────────────────────────────────────────────────

    const installed = ref<InstalledFile[]>([])
    const linkedProjects = ref<Record<string, RegistryProject>>({})
    const progress = ref<Record<string, { state: 'downloading' | 'error'; done: number; total: number; error?: string }>>({})

    // Every file of the installs that overlap in time. A finished file keeps its bytes, so the combined share never drops.
    // `runs` counts the installs that need the file.
    const batch = ref<Record<string, { done: number; total: number; runs: number }>>({})
    let batchRuns = 0
    let batchTimer: ReturnType<typeof setTimeout> | null = null
    // The bar holds at 100% this long before it closes.
    const BATCH_HOLD_MS = 600

    /** All running installs as one download, or null when none runs. Share is 0 to 1, by bytes. */
    const downloads = computed(() => {
        const rows = Object.values(batch.value)
        if (!rows.length) return null
        let done = 0
        let total = 0
        for (const r of rows) {
            done += Math.min(r.done, r.total)
            total += r.total
        }
        return { files: rows.length, share: total > 0 ? done / total : 0 }
    })

    // One download per file ID, shared by parallel installs
    const fetches = new Map<string, ReturnType<typeof window.registryAPI.install>>()

    /** Scans the plugins folder and links each file to its registry file and newer version. */
    async function refreshInstalled(): Promise<void> {
        if (!window.pluginsAPI) return
        try {
            const scanned = await window.pluginsAPI.scan()
            const hashes = scanned.map(p => p.checksum)
            const [known, updates] = hashes.length
                ? await Promise.all([
                    rpc<{ sha256: string; file_id: string; project_id: string; version: string }[]>('files_by_sha256', { p_hashes: hashes }),
                    rpc<{ sha256: string; update_file_id: string | null; update_version: string | null }[]>('check_updates', {
                        p_hashes: hashes, p_game_version: playerGameVersion.value, p_channels: channels.value,
                    }),
                ])
                : [[], []]
            const bySha = new Map(known.map(k => [k.sha256, k]))
            const updBySha = new Map(updates.map(u => [u.sha256, u]))
            const next = scanned.map(p => {
                const hit = bySha.get(p.checksum)
                const upd = updBySha.get(p.checksum)
                return {
                    filePath: p.filePath, sha256: p.checksum, plugin_id: p.plugin_id, version: p.version,
                    fileId: hit?.file_id ?? null, projectId: hit?.project_id ?? null,
                    update: upd?.update_file_id ? { fileId: upd.update_file_id, version: upd.update_version ?? '' } : null,
                }
            })
            if (!sameRows(installed.value, next)) installed.value = next
            await linkProjects(installed.value.map(f => f.projectId).filter((x): x is string => !!x))
        } catch (err) {
            logger.error('registry:refreshInstalled', { error: err })
        }
    }

    async function linkProjects(ids: string[]): Promise<void> {
        const missing = [...new Set(ids)].filter(id => !linkedProjects.value[id])
        if (!missing.length) return
        const { data, error } = await db().from('projects').select('project_json').in('id', missing)
        if (error) { logger.error('registry:linkProjects', { error }); return }
        for (const r of (data ?? []) as { project_json: RegistryProject | null }[]) {
            if (r.project_json) linkedProjects.value[r.project_json.id] = r.project_json
        }
    }

    function installedFor(project: Pick<RegistryProject, 'id' | 'plugin_id'>): InstalledFile | null {
        return installed.value.find(f => f.projectId === project.id)
            ?? (project.plugin_id ? installed.value.find(f => f.plugin_id.toLowerCase() === project.plugin_id!.toLowerCase()) : undefined)
            ?? null
    }

    function fileState(project: Pick<RegistryProject, 'id' | 'plugin_id'>, file: Pick<RegistryFile, 'id' | 'version'> | null): InstallUiState {
        if (!file) return 'idle'
        const p = progress.value[file.id]
        if (p?.state === 'downloading') return 'downloading'
        if (p?.state === 'error') return 'error'
        const have = installedFor(project)
        if (!have) return 'idle'
        if (have.fileId === file.id) return 'installed'
        if (!have.fileId) return 'replace'
        return compareVersions(file.version, have.version) > 0 ? 'update' : 'replace'
    }

    function projectState(project: RegistryProject): InstallUiState {
        return fileState(project, project.latest_file)
    }

    // ── Install ─────────────────────────────────────────────────────────────────

    async function planInstall(fileId: string): Promise<InstallPlan> {
        const rows = await rpc<InstallRow[]>('resolve_install', {
            p_files: [fileId], p_game_version: playerGameVersion.value, p_channels: channels.value,
        })
        const requested = rows.find(r => r.role === 'requested')
        const errors = rows.filter(r => r.role === 'error')
        if (!requested) throw new RegistryError(errors[0]?.error ?? 'file_unavailable')

        const plan: InstallPlan = { requested, downloads: [], kept: [], optional: [], blockers: [], warnings: [] }
        for (const r of rows) {
            if (r.role === 'requested' || r.role === 'dependency') {
                const have = installed.value.find(f => f.sha256 === r.sha256)
                    ?? (r.role === 'dependency' && r.plugin_id
                        ? installed.value.find(f => f.plugin_id.toLowerCase() === r.plugin_id!.toLowerCase() && compareVersions(f.version, r.version) >= 0)
                        : undefined)
                if (have) plan.kept.push(r)
                else plan.downloads.push(r)
                for (const w of r.warnings ?? []) if (!plan.warnings.includes(w)) plan.warnings.push(w)
            } else if (r.role === 'optional') {
                plan.optional.push(r)
            } else if (r.role === 'incompatible') {
                const clash = r.plugin_id && installed.value.find(f => f.plugin_id.toLowerCase() === r.plugin_id!.toLowerCase())
                if (clash) plan.blockers.push({ name: r.project_name ?? r.plugin_id ?? '', reason: 'incompatible' })
            } else if (r.role === 'error') {
                const name = rows.find(x => x.project_id === r.project_id && x.project_name)?.project_name ?? r.project_id ?? r.file_id ?? ''
                plan.blockers.push({ name, reason: r.error ?? 'error' })
            }
        }
        return plan
    }

    /** Downloads each file of the plan in order. Dependencies first, so the runtime finds them. */
    async function runInstall(plan: InstallPlan): Promise<{ success: boolean; error?: string }> {
        if (plan.blockers.length) return { success: false, error: plan.blockers[0].reason }
        const order = [...plan.downloads.filter(r => r.role === 'dependency'), ...plan.downloads.filter(r => r.role === 'requested')]
        const done: string[] = []
        // The downloads this install starts. Other installs can wait on them.
        const mine = new Map<string, ReturnType<typeof window.registryAPI.install>>()
        // A new batch starts only when no other install runs.
        if (batchRuns++ === 0) {
            if (batchTimer) clearTimeout(batchTimer)
            batchTimer = null
            batch.value = {}
        }
        for (const r of order) {
            const row = batch.value[r.file_id!]
            if (row) row.runs++
            else batch.value[r.file_id!] = { done: 0, total: r.size_bytes ?? 0, runs: 1 }
        }
        const off = window.registryAPI.onInstallProgress(p => {
            const cur = progress.value[p.token]
            if (cur) { cur.done = p.received; cur.total = p.total }
            const row = batch.value[p.token]
            if (row) { row.done = p.received; row.total = p.total }
        })
        try {
            for (const r of order) {
                const fileId = r.file_id!
                // An install that ended after this plan was made can already have the file on disk.
                if (installed.value.some(f => f.sha256 === r.sha256)) {
                    const row = batch.value[fileId]
                    if (row) row.done = row.total
                    done.push(fileId)
                    continue
                }
                let job = fetches.get(fileId)
                if (!job) {
                    progress.value[fileId] = { state: 'downloading', done: 0, total: r.size_bytes ?? 0 }
                    const replace = installed.value
                        .filter(f => r.plugin_id && f.plugin_id.toLowerCase() === r.plugin_id.toLowerCase())
                        .map(f => f.filePath)
                    job = window.registryAPI.install({
                        token: fileId, url: cdnUrl(r.storage_key)!, sha256: r.sha256!, size: r.size_bytes ?? 0,
                        fileName: r.file_name!, replace,
                    })
                    fetches.set(fileId, job)
                    mine.set(fileId, job)
                }
                const res = await job
                if (!res.success) {
                    // A failed download leaves the map at once, so the next click tries again.
                    if (fetches.get(fileId) === job) fetches.delete(fileId)
                    progress.value[fileId] = { state: 'error', done: 0, total: 0, error: res.error }
                    throw new RegistryError(res.error ?? 'download_failed')
                }
                delete progress.value[fileId]
                const row = batch.value[fileId]
                if (row) row.done = row.total
                done.push(fileId)
            }
            eventBus.emit('notification', {
                title: plan.requested.project_name ?? '',
                message: order.length > 1
                    ? t('registry.notify.installedWithDeps', { count: order.length - 1 })
                    : t('registry.notify.installed'),
                type: 'success',
            })
            return { success: true }
        } catch (err) {
            logger.error('registry:runInstall', { error: err })
            return { success: false, error: (err as RegistryError).code ?? (err as Error).message }
        } finally {
            off()
            // A failed install takes its unfinished files out of the batch, unless another install still needs them.
            for (const r of order) {
                const row = batch.value[r.file_id!]
                if (row && !done.includes(r.file_id!) && --row.runs === 0) delete batch.value[r.file_id!]
            }
            if (--batchRuns === 0) {
                batchTimer = setTimeout(() => {
                    batchTimer = null
                    batch.value = {}
                }, BATCH_HOLD_MS)
            }
            const fetched = done.filter(id => mine.has(id))
            if (fetched.length) void rpc('record_downloads', { p_files: fetched, p_install_id: installId.value }).catch(() => {})
            await refreshInstalled()
            // A failed download can have a retry from another install under the same ID. Only this install's jobs leave.
            for (const [id, job] of mine) if (fetches.get(id) === job) fetches.delete(id)
        }
    }

    // A plan waits for a confirm only when it downloads dependencies or something blocks it.
    const pending = ref<InstallPlan | null>(null)
    const planning = ref<string | null>(null)

    async function requestInstall(fileId: string): Promise<void> {
        planning.value = fileId
        try {
            const plan = await planInstall(fileId)
            if (plan.downloads.length === 0) {
                eventBus.emit('notification', { title: plan.requested.project_name ?? '', message: t('registry.notify.alreadyInstalled') })
                return
            }
            if (plan.blockers.length || plan.downloads.some(r => r.role === 'dependency')) { pending.value = plan; return }
            const res = await runInstall(plan)
            if (!res.success) eventBus.emit('notification', { title: t('registry.installFailed'), message: errorText(t, res.error), type: 'error' })
        } catch (err) {
            eventBus.emit('notification', { title: t('registry.installFailed'), message: errorText(t, err), type: 'error' })
        } finally {
            planning.value = null
        }
    }

    async function confirmInstall(): Promise<void> {
        const plan = pending.value
        pending.value = null
        if (!plan) return
        const res = await runInstall(plan)
        if (!res.success) eventBus.emit('notification', { title: t('registry.installFailed'), message: errorText(t, res.error), type: 'error' })
    }

    function cancelInstall(): void { pending.value = null }

    /** Removes one installed file. Other plugins that require it stop at the next runtime start. */
    async function uninstall(file: InstalledFile): Promise<boolean> {
        const res = await window.pluginsAPI.deleteFile(file.filePath)
        await refreshInstalled()
        return res.success
    }

    return {
        installId, channels, tags, gameVersions, stats, playerGameVersion,
        filters, projects, total, loading, hasMore,
        selected, files, usedBy, loadingProject, creator, loadingCreator,
        installed, linkedProjects, progress, downloads,
        fetchTags, fetchGameVersions, fetchStats, search,
        openProject, openFile, closeProject, openCreator, closeCreator,
        refreshInstalled, installedFor, fileState, projectState,
        planInstall, runInstall, uninstall,
        pending, planning, requestInstall, confirmInstall, cancelInstall,
    }
}, {
    persist: {
        key: 'registry',
        pick: ['installId', 'channels'],
    },
})
