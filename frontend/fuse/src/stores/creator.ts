import { defineStore } from 'pinia'
import { ref } from 'vue'
import { logger } from '../utils/logger'
import {
    rpc, invoke, RegistryError,
    type RegistryProject, type RegistryFile, type MyProfile, type Channel, type Relation, type ProjectKind, type FoundProject,
    type PluginType,
} from '../utils/registry-api'

export interface InspectedPackage {
    filePath: string
    fileName: string
    size: number
    sha256: string
    manifest: Record<string, unknown> | null
    problem: string | null
}

export interface InspectedImage {
    filePath: string
    size: number
    type: string
    width: number
    height: number
    preview: string
    problem: string | null
}

export interface MyProjectRow { project: RegistryProject; newest_file: RegistryFile | null; awaiting_action: boolean }
export interface CreatorOverview { plugins: number; live: number; downloads: number; views: number; awaiting: number }
export interface ReviewNote { resource_type: 'project' | 'file'; resource_id: string; reason: string | null; policy_violations: string[] | null; created_at: string }
export interface DependencyCheck {
    missing: string[]
    suggestions: { plugin_id: string; relation: Relation; project_id: string | null; name: string | null; slug: string | null }[]
}

/** One dependency row in the editor. `name`, `icon_key` and `file_version` are for display only. */
export interface DependencyDraft {
    project_id: string
    file_id: string | null
    relation: Relation
    name: string
    slug: string
    plugin_id: string | null
    icon_key: string | null
    file_version: string | null
}

interface UploadPlan {
    upload_id: string
    file_id: string | null
    mode: 'single' | 'multipart'
    url?: string
    headers?: Record<string, string>
    part_size?: number
    parts?: { n: number; url: string; size: number }[]
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

export const useCreatorStore = defineStore('creator', () => {
    const profile = ref<MyProfile | null>(null)
    const rows = ref<MyProjectRow[]>([])
    const overview = ref<CreatorOverview | null>(null)
    const notes = ref<ReviewNote[]>([])
    const loading = ref(false)

    // ── Profile ─────────────────────────────────────────────────────────────────

    async function loadProfile(): Promise<MyProfile | null> {
        try { profile.value = await rpc<MyProfile>('my_profile') }
        catch (err) { logger.error('creator:profile', { error: err }) }
        return profile.value
    }

    async function saveProfile(username: string | null, bio: string | null): Promise<void> {
        await rpc('update_profile', { p_username: username, p_bio: bio })
        await loadProfile()
    }

    const usernameAvailable = (name: string) => rpc<boolean>('username_available', { p_name: name })
    const slugStatus = (slug: string, projectId: string | null = null) =>
        rpc<'ok' | 'format' | 'reserved' | 'taken'>('slug_available', { p_slug: slug, p_project: projectId })

    // ── Projects ────────────────────────────────────────────────────────────────

    async function loadProjects(): Promise<void> {
        loading.value = true
        try {
            const [list, ov, n] = await Promise.all([
                rpc<MyProjectRow[]>('my_projects'),
                rpc<CreatorOverview>('creator_overview'),
                rpc<ReviewNote[]>('my_review_notes'),
            ])
            rows.value = list
            overview.value = ov
            notes.value = n
        } catch (err) {
            logger.error('creator:projects', { error: err })
        } finally {
            loading.value = false
        }
    }

    function noteFor(type: 'project' | 'file', id: string): ReviewNote | null {
        return notes.value.find(n => n.resource_type === type && n.resource_id === id) ?? null
    }

    async function createProject(input: {
        name: string; slug: string; summary: string; description: string; kind: ProjectKind; tagIds: number[]
    }): Promise<RegistryProject> {
        // The RPC returns the bare table row. get_project adds owner, tags and latest_file.
        const row = await rpc<{ id: string }>('create_project', {
            p_name: input.name, p_slug: input.slug, p_summary: input.summary, p_description: input.description,
            p_kind: input.kind, p_tag_ids: input.tagIds,
        })
        void loadProjects()
        const p = await getProject(row.id)
        if (!p) throw new Error('project_not_found')
        return p
    }

    async function updateProject(id: string, patch: {
        name?: string; slug?: string; summary?: string; description?: string; kind?: ProjectKind; links?: Record<string, string>; tagIds?: number[]
    }): Promise<void> {
        await rpc('update_project', {
            p_project: id, p_name: patch.name ?? null, p_slug: patch.slug ?? null, p_summary: patch.summary ?? null,
            p_description: patch.description ?? null, p_kind: patch.kind ?? null, p_links: patch.links ?? null,
        })
        if (patch.tagIds) await rpc('set_project_tags', { p_project: id, p_tag_ids: patch.tagIds })
        void loadProjects()
    }

    async function setListed(id: string, listed: boolean): Promise<void> {
        await rpc('set_listed', { p_project: id, p_listed: listed })
        void loadProjects()
    }

    const getProject = (id: string) => rpc<RegistryProject | null>('get_project', { p_ref: id })

    async function projectFiles(projectId: string): Promise<RegistryFile[]> {
        const list = await rpc<(RegistryFile | null)[]>('list_files', { p_project: projectId })
        return list.filter((f): f is RegistryFile => !!f)
    }

    // ── Files ───────────────────────────────────────────────────────────────────

    const getFile = (id: string) => rpc<RegistryFile | null>('get_file', { p_file: id })

    async function inspectPackage(filePath: string): Promise<InspectedPackage> {
        const r = await window.registryAPI.inspectPackage(filePath)
        if (!r.success) throw new RegistryError(r.error ?? 'package_invalid')
        return {
            filePath: r.filePath!, fileName: r.fileName!, size: r.size!, sha256: r.sha256!,
            manifest: r.manifest ?? null, problem: r.problem ?? null,
        }
    }

    async function inspectImage(filePath: string, kind: 'icon' | 'avatar'): Promise<InspectedImage> {
        const r = await window.registryAPI.inspectImage(filePath, kind)
        if (!r.success) throw new RegistryError(r.error ?? 'image_unreadable')
        return {
            filePath: r.filePath!, size: r.size ?? 0, type: r.type ?? '', width: r.width ?? 0, height: r.height ?? 0,
            preview: r.preview ?? '', problem: r.problem ?? null,
        }
    }

    async function sendFile(plan: UploadPlan, filePath: string, kind: 'package' | 'image', onProgress?: (share: number) => void): Promise<void> {
        const off = window.registryAPI.onUploadProgress(p => {
            if (p.token === plan.upload_id && p.total) onProgress?.(p.sent / p.total)
        })
        try {
            const res = await window.registryAPI.upload({
                token: plan.upload_id, filePath, kind, mode: plan.mode, url: plan.url, headers: plan.headers,
                partSize: plan.part_size, parts: plan.parts,
            })
            if (!res.success) throw new RegistryError(res.error ?? 'upload_failed')
            await invoke('registry-upload-complete', { upload_id: plan.upload_id, parts: res.parts })
        } finally {
            off()
        }
    }

    /** Uploads a package. The Worker then checks it, so the file starts in `uploaded`, not `ready`. */
    async function uploadPackage(projectId: string, pkg: InspectedPackage, meta: {
        channel: Channel; changelog: string; gameVersions: string[]; pluginType: PluginType
    }, onProgress?: (share: number) => void): Promise<string> {
        const plan = await invoke<UploadPlan>('registry-upload-create', {
            kind: 'file', project_id: projectId, size: pkg.size, sha256: pkg.sha256,
            channel: meta.channel, changelog: meta.changelog, game_versions: meta.gameVersions,
            plugin_type: meta.pluginType,
        })
        await sendFile(plan, pkg.filePath, 'package', onProgress)
        return plan.file_id!
    }

    /** Polls until the Worker marks the file ready or invalid. */
    async function waitForFile(fileId: string, timeoutMs = 120_000): Promise<RegistryFile | null> {
        const end = Date.now() + timeoutMs
        while (Date.now() < end) {
            const f = await getFile(fileId).catch(() => null)
            if (f && (f.state === 'ready' || f.state === 'invalid')) return f
            await sleep(1500)
        }
        return getFile(fileId).catch(() => null)
    }

    async function updateFile(id: string, patch: {
        channel?: Channel; changelog?: string; gameVersions?: string[]; pluginType?: PluginType
    }): Promise<void> {
        await rpc('update_file', {
            p_file: id, p_channel: patch.channel ?? null, p_changelog: patch.changelog ?? null,
            p_game_versions: patch.gameVersions ?? null,
            ...(patch.pluginType ? { p_plugin_type: patch.pluginType } : {}),
        })
    }

    const markCompatible = (fileIds: string[], version: string) => rpc<number>('mark_compatible', { p_files: fileIds, p_version: version })
    const submit = (fileId: string) => rpc<RegistryFile>('submit_for_review', { p_file: fileId })
    const withdraw = (fileId: string) => rpc<RegistryFile>('withdraw_file', { p_file: fileId })
    const deleteDraft = (kind: 'project' | 'file', id: string) => invoke('registry-delete', { kind, id })

    // ── Dependencies ────────────────────────────────────────────────────────────

    const findProjects = (q: string) => rpc<FoundProject[]>('find_projects', { p_q: q })
    const checkDependencies = (fileId: string) => rpc<DependencyCheck>('check_dependencies', { p_file: fileId })

    async function setDependencies(fileId: string, deps: DependencyDraft[]): Promise<RegistryFile> {
        return rpc<RegistryFile>('set_file_dependencies', {
            p_file: fileId,
            p_deps: deps.map(d => ({ project_id: d.project_id, file_id: d.file_id, relation: d.relation })),
        })
    }

    // ── Images ──────────────────────────────────────────────────────────────────

    /** Uploads a project icon or the avatar, then waits until the Worker sets the new key. */
    async function uploadImage(kind: 'icon' | 'avatar', projectId: string | null, img: InspectedImage): Promise<void> {
        const before = kind === 'avatar' ? profile.value?.avatar_key ?? null : (await getProject(projectId!))?.icon_key ?? null
        const plan = await invoke<UploadPlan>('registry-upload-create', { kind, project_id: projectId, size: img.size, type: img.type })
        await sendFile(plan, img.filePath, 'image')
        for (let i = 0; i < 30; i++) {
            await sleep(1000)
            const now = kind === 'avatar' ? (await loadProfile())?.avatar_key ?? null : (await getProject(projectId!))?.icon_key ?? null
            if (now && now !== before) { void loadProjects(); return }
        }
        throw new RegistryError('image_timeout')
    }

    async function removeImage(kind: 'icon' | 'avatar', projectId: string | null): Promise<void> {
        await invoke('registry-delete', { kind, id: projectId })
        if (kind === 'avatar') await loadProfile()
        else void loadProjects()
    }

    return {
        profile, rows, overview, notes, loading,
        loadProfile, saveProfile, usernameAvailable, slugStatus,
        loadProjects, noteFor, createProject, updateProject, setListed, getProject, projectFiles,
        getFile, inspectPackage, inspectImage, uploadPackage, waitForFile, updateFile, markCompatible,
        submit, withdraw, deleteDraft,
        findProjects, checkDependencies, setDependencies,
        uploadImage, removeImage,
    }
})
