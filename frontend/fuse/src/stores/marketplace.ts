import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from '../composables/supabase-client'
import { eventBus } from '../events/eventBus'
import { logger } from '../utils/logger'
import { useAppStore } from './app'

export interface MarketplaceTag {
    id: string
    slug: string
    label: string
    color: string | null
}

export type ModerationStatus = 'draft' | 'pending_review' | 'approved' | 'rejected' | 'withdrawn'

export interface MarketplaceProject {
    id: string
    owner_id: string
    name: string
    summary: string
    description: string
    icon_key: string | null
    visibility: boolean
    moderation_status: ModerationStatus
    review_submitted_at: string | null
    total_download_count: number
    view_count: number
    created_at: string
    updated_at: string
    tags: MarketplaceTag[]
    latest_version?: MarketplaceVersion | null
    creator_username?: string | null
}

export interface MarketplaceVersion {
    id: string
    project_id: string
    version_number: string
    version_type: 'alpha' | 'beta' | 'release'
    changelog: string
    compatible_game_versions: string[]
    compatible_fuse_versions: string[]
    asset_key: string | null
    file_name: string | null
    file_size: number | null
    checksum: string | null
    download_count: number
    moderation_status: ModerationStatus
    review_submitted_at: string | null
    created_at: string
}

export interface MarketplaceDependency {
    id: string
    version_id: string
    dependency_project_id: string | null
    dependency_slug: string | null
    requirement: string
    optional: boolean
    dep_type: string
}

const R2_PUBLIC_BASE = import.meta.env.VITE_R2_PUBLIC_URL as string | undefined

function buildPublicUrl(objectKey: string): string {
    const base = R2_PUBLIC_BASE ?? 'https://pub-placeholder.r2.dev'
    return `${base.replace(/\/$/, '')}/${objectKey}`
}

export const useMarketplaceStore = defineStore('marketplace', () => {
    const projects = ref<MarketplaceProject[]>([])
    const selectedProject = ref<MarketplaceProject | null>(null)
    const versions = ref<MarketplaceVersion[]>([])
    const dependencies = ref<MarketplaceDependency[]>([])
    const tags = ref<MarketplaceTag[]>([])
    const myProjects = ref<MarketplaceProject[]>([])

    const loading = ref(false)
    const loadingVersions = ref(false)
    const loadingMyProjects = ref(false)

    const installing = ref<Record<string, 'idle' | 'downloading' | 'done' | 'error'>>({})
    const installedFiles = ref<Record<string, string>>({})
    const myVersions = ref<MarketplaceVersion[]>([])
    const loadingMyVersions = ref(false)

    const filters = ref({
        search: '',
        tagIds: [] as string[],
    })

    const filteredProjects = computed(() => {
        let list = projects.value
        const q = filters.value.search.trim().toLowerCase()
        if (q) list = list.filter(p =>
            p.name.toLowerCase().includes(q) ||
            p.summary.toLowerCase().includes(q)
        )
        if (filters.value.tagIds.length > 0) {
            list = list.filter(p =>
                filters.value.tagIds.every(tid => p.tags.some(t => t.id === tid))
            )
        }
        return list
    })

    async function fetchTags(): Promise<void> {
        const { data, error } = await supabase
            .from('marketplace_tags')
            .select('*')
            .order('label')
        if (error) { logger.error('fetchTags:', { error }); return }
        tags.value = data ?? []
    }

    async function fetchProjects(): Promise<void> {
        loading.value = true
        try {
            const { data, error } = await supabase
                .from('marketplace_projects')
                .select(`
                    *,
                    marketplace_project_tags(
                        marketplace_tags(id, slug, label, color)
                    ),
                    marketplace_versions(
                        id, version_number, version_type, file_name, asset_key, checksum, download_count, created_at
                    )
                `)
                .eq('visibility', true)
                .order('updated_at', { ascending: false })

            if (error) throw error

            projects.value = (data ?? []).map(raw => {
                const tagList: MarketplaceTag[] = (raw.marketplace_project_tags ?? [])
                    .map((pt: any) => pt.marketplace_tags)
                    .filter(Boolean)

                const versionList: MarketplaceVersion[] = (raw.marketplace_versions ?? [])
                    .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

                const { marketplace_project_tags, marketplace_versions, ...rest } = raw
                return { ...rest, tags: tagList, latest_version: versionList[0] ?? null }
            })
            projects.value = await enrichWithUsernames(projects.value)
        } catch (err) {
            logger.error('fetchProjects:', { error: err })
        } finally {
            loading.value = false
        }
    }

    async function fetchProject(id: string): Promise<void> {
        loading.value = true
        try {
            const { data, error } = await supabase
                .from('marketplace_projects')
                .select(`
                    *,
                    marketplace_project_tags(
                        marketplace_tags(id, slug, label, color)
                    )
                `)
                .eq('id', id)
                .single()

            if (error) throw error

            const tagList: MarketplaceTag[] = (data.marketplace_project_tags ?? [])
                .map((pt: any) => pt.marketplace_tags)
                .filter(Boolean)

            const { marketplace_project_tags, ...rest } = data
            selectedProject.value = { ...rest, tags: tagList }
            await fetchVersions(id)
        } catch (err) {
            logger.error('fetchProject:', { error: err })
        } finally {
            loading.value = false
        }
    }

    async function fetchVersions(projectId: string): Promise<void> {
        loadingVersions.value = true
        try {
            const { data, error } = await supabase
                .from('marketplace_versions')
                .select('*')
                .eq('project_id', projectId)
                .order('created_at', { ascending: false })
            if (error) throw error
            versions.value = data ?? []
        } catch (err) {
            logger.error('fetchVersions:', { error: err })
        } finally {
            loadingVersions.value = false
        }
    }

    async function enrichWithUsernames(list: MarketplaceProject[]): Promise<MarketplaceProject[]> {
        const ownerIds = [...new Set(list.map(p => p.owner_id))]
        if (ownerIds.length === 0) return list
        // Query public_user_profiles only contains username, safe for world-read
        const { data } = await supabase
            .from('public_user_profiles')
            .select('user_id, username')
            .in('user_id', ownerIds)
        const map: Record<string, string | null> = {}
        for (const row of data ?? []) map[row.user_id] = row.username ?? null
        return list.map(p => ({ ...p, creator_username: map[p.owner_id] ?? null }))
    }

    async function fetchDependencies(versionId: string): Promise<void> {
        const { data, error } = await supabase
            .from('marketplace_dependencies')
            .select('*')
            .eq('version_id', versionId)
        if (error) { logger.error('fetchDependencies:', { error }); return }
        dependencies.value = data ?? []
    }

    async function installVersion(version: MarketplaceVersion): Promise<{ success: boolean; error?: string }> {
        if (!version.asset_key || !version.file_name) {
            return { success: false, error: 'No file available for this version' }
        }

        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { success: false, error: 'Sign in to install plugins' }

        installing.value[version.id] = 'downloading'
        try {
            const { data: urlData, error: urlError } = await supabase.functions.invoke('marketplace-get-download-url', {
                body: { version_id: version.id },
            })
            if (urlError || !urlData?.download_url) throw new Error(urlError?.message ?? 'Failed to get download URL')

            const result = await window.pluginsAPI.downloadPlugin(urlData.download_url, version.file_name)
            if (!result.success) throw new Error(result.error ?? 'Download failed')

            const expectedChecksum = urlData.checksum ?? version.checksum
            if (expectedChecksum && result.checksum && result.checksum !== expectedChecksum) {
                if (result.filePath) await window.pluginsAPI.deleteFile(result.filePath)
                throw new Error('Checksum mismatch — file may be corrupted')
            }

            installing.value[version.id] = 'done'
            if (version.file_name) installedFiles.value[version.id] = version.file_name
            eventBus.emit('notification', {
                title: 'Plugin Installed',
                message: `${version.file_name} installed. Restart the runtime to load it.`,
            })
            return { success: true }
        } catch (err: any) {
            installing.value[version.id] = 'error'
            logger.error('installVersion:', { error: err })
            return { success: false, error: err.message }
        }
    }

    // Creator actions

    async function fetchMyProjects(): Promise<void> {
        loadingMyProjects.value = true
        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return

            const { data, error } = await supabase
                .from('marketplace_projects')
                .select(`
                    *,
                    marketplace_project_tags(
                        marketplace_tags(id, slug, label, color)
                    ),
                    marketplace_versions(id, version_number, version_type, created_at, download_count)
                `)
                .eq('owner_id', user.id)
                .order('updated_at', { ascending: false })

            if (error) throw error

            myProjects.value = (data ?? []).map(raw => {
                const tagList: MarketplaceTag[] = (raw.marketplace_project_tags ?? [])
                    .map((pt: any) => pt.marketplace_tags)
                    .filter(Boolean)
                const versionList = (raw.marketplace_versions ?? [])
                    .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                const { marketplace_project_tags, marketplace_versions, ...rest } = raw
                return { ...rest, tags: tagList, latest_version: versionList[0] ?? null }
            })
            myProjects.value = await enrichWithUsernames(myProjects.value)
        } catch (err) {
            logger.error('fetchMyProjects:', { error: err })
        } finally {
            loadingMyProjects.value = false
        }
    }

    async function createProject(data: {
        name: string
        summary: string
        description: string
        tagIds: string[]
    }): Promise<{ success: boolean; project?: MarketplaceProject; error?: string }> {
        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return { success: false, error: 'not_signed_in' }

            const { data: row, error } = await supabase
                .from('marketplace_projects')
                .insert({ owner_id: user.id, name: data.name, summary: data.summary, description: data.description })
                .select()
                .single()

            if (error) throw error

            if (data.tagIds.length > 0) {
                await supabase.from('marketplace_project_tags').insert(
                    data.tagIds.map(tid => ({ project_id: row.id, tag_id: tid }))
                )
            }

            await fetchMyProjects()
            return { success: true, project: { ...row, tags: [] } }
        } catch (err: any) {
            return { success: false, error: err.message }
        }
    }

    async function updateProject(id: string, data: {
        name?: string
        summary?: string
        description?: string
        tagIds?: string[]
    }): Promise<{ success: boolean; error?: string }> {
        try {
            const { name, summary, description, tagIds } = data
            if (name || summary || description) {
                const { error } = await supabase
                    .from('marketplace_projects')
                    .update({ ...(name && { name }), ...(summary && { summary }), ...(description !== undefined && { description }) })
                    .eq('id', id)
                if (error) throw error
            }

            if (tagIds !== undefined) {
                await supabase.from('marketplace_project_tags').delete().eq('project_id', id)
                if (tagIds.length > 0) {
                    await supabase.from('marketplace_project_tags').insert(
                        tagIds.map(tid => ({ project_id: id, tag_id: tid }))
                    )
                }
            }

            await fetchMyProjects()
            return { success: true }
        } catch (err: any) {
            return { success: false, error: err.message }
        }
    }

    async function setVisibility(projectId: string, visible: boolean): Promise<{ success: boolean; error?: string }> {
        if (visible && !useAppStore().username) {
            return { success: false, error: 'Set a username in Account settings before publishing' }
        }
        try {
            const { error } = await supabase
                .from('marketplace_projects')
                .update({ visibility: visible })
                .eq('id', projectId)
            if (error) throw error
            await fetchMyProjects()
            return { success: true }
        } catch (err: any) {
            const msg = err.message === 'username_required'
                ? 'Set a username in Account settings before publishing'
                : err.message
            return { success: false, error: msg }
        }
    }

    async function createVersion(data: {
        project_id: string
        version_number: string
        version_type: 'alpha' | 'beta' | 'release'
        changelog: string
        compatible_game_versions: string[]
        compatible_fuse_versions: string[]
    }): Promise<{ success: boolean; version?: MarketplaceVersion; error?: string }> {
        try {
            const { data: row, error } = await supabase
                .from('marketplace_versions')
                .insert(data)
                .select()
                .single()
            if (error) throw error
            return { success: true, version: row }
        } catch (err: any) {
            return { success: false, error: err.message }
        }
    }

    async function getUploadUrl(params: {
        type: 'plugin' | 'icon'
        project_id: string
        version_id?: string
        filename: string
        content_type: string
    }): Promise<{ success: boolean; upload_url?: string; object_key?: string; error?: string }> {
        try {
            const { data, error } = await supabase.functions.invoke('marketplace-get-upload-url', { body: params })
            if (error) throw error
            return { success: true, ...data }
        } catch (err: any) {
            return { success: false, error: err.message }
        }
    }

    async function finalizeVersion(params: {
        version_id: string
        object_key: string
        file_name: string
        file_size: number
        checksum: string
    }): Promise<{ success: boolean; error?: string }> {
        try {
            const { error } = await supabase.functions.invoke('marketplace-finalize-version', { body: params })
            if (error) throw error
            return { success: true }
        } catch (err: any) {
            return { success: false, error: err.message }
        }
    }

    async function uploadIcon(projectId: string, file: File): Promise<{ success: boolean; icon_key?: string; error?: string }> {
        try {
            const iconMime: Record<string, string> = {
                png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
                gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
            }
            const rawExt = file.name.split('.').pop()?.toLowerCase() ?? ''
            const contentType = file.type || iconMime[rawExt] || 'image/png'

            const urlResult = await getUploadUrl({
                type: 'icon',
                project_id: projectId,
                filename: file.name,
                content_type: contentType,
            })
            if (!urlResult.success || !urlResult.upload_url) throw new Error(urlResult.error ?? 'Failed to get upload URL')

            const iconBuffer = await file.arrayBuffer()
            const uploadRes = await window.pluginsAPI.uploadToR2(urlResult.upload_url, iconBuffer, contentType)
            if (!uploadRes.success) throw new Error(uploadRes.error ?? 'Upload failed')

            const { error } = await supabase
                .from('marketplace_projects')
                .update({ icon_key: urlResult.object_key })
                .eq('id', projectId)
            if (error) throw error

            return { success: true, icon_key: urlResult.object_key }
        } catch (err: any) {
            return { success: false, error: err.message }
        }
    }

    async function fetchMyVersions(projectId: string): Promise<void> {
        loadingMyVersions.value = true
        try {
            const { data, error } = await supabase
                .from('marketplace_versions')
                .select('*')
                .eq('project_id', projectId)
                .order('created_at', { ascending: false })
            if (error) throw error
            myVersions.value = data ?? []
        } catch (err) {
            logger.error('fetchMyVersions:', { error: err })
        } finally {
            loadingMyVersions.value = false
        }
    }

    async function deleteProject(projectId: string): Promise<{ success: boolean; error?: string }> {
        try {
            const { error } = await supabase.functions.invoke('marketplace-delete-project', {
                body: { project_id: projectId },
            })
            if (error) throw error
            myProjects.value = myProjects.value.filter(p => p.id !== projectId)
            return { success: true }
        } catch (err: any) {
            return { success: false, error: err.message }
        }
    }

    async function deleteVersion(versionId: string): Promise<{ success: boolean; error?: string }> {
        try {
            const { error } = await supabase.functions.invoke('marketplace-delete-version', {
                body: { version_id: versionId },
            })
            if (error) throw error
            myVersions.value = myVersions.value.filter(v => v.id !== versionId)
            return { success: true }
        } catch (err: any) {
            return { success: false, error: err.message }
        }
    }

    async function updateVersionMeta(versionId: string, data: {
        version_type?: 'alpha' | 'beta' | 'release'
        changelog?: string
        compatible_game_versions?: string[]
        compatible_fuse_versions?: string[]
    }): Promise<{ success: boolean; error?: string }> {
        try {
            const { error } = await supabase
                .from('marketplace_versions')
                .update(data)
                .eq('id', versionId)
            if (error) throw error
            myVersions.value = myVersions.value.map(v =>
                v.id === versionId ? { ...v, ...data } : v
            )
            return { success: true }
        } catch (err: any) {
            return { success: false, error: err.message }
        }
    }

    async function submitForReview(
        resource_type: 'project' | 'version',
        resource_id: string
    ): Promise<{ success: boolean; error?: string }> {
        try {
            const { error } = await supabase.functions.invoke('marketplace-submit-review', {
                body: { resource_type, resource_id },
            })
            if (error) throw error
            if (resource_type === 'project') {
                myProjects.value = myProjects.value.map(p =>
                    p.id === resource_id
                        ? { ...p, moderation_status: 'pending_review', review_submitted_at: new Date().toISOString() }
                        : p
                )
            } else {
                myVersions.value = myVersions.value.map(v =>
                    v.id === resource_id
                        ? { ...v, moderation_status: 'pending_review', review_submitted_at: new Date().toISOString() }
                        : v
                )
            }
            return { success: true }
        } catch (err: any) {
            return { success: false, error: err.message }
        }
    }

    async function fetchRejectionReason(
        resource_type: 'project' | 'version',
        resource_id: string
    ): Promise<{ reason: string | null; policy_violations: string[] | null }> {
        const { data } = await supabase
            .from('moderation_reviews')
            .select('reason, policy_violations')
            .eq('resource_type', resource_type)
            .eq('resource_id', resource_id)
            .eq('decision', 'rejected')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()
        return {
            reason: data?.reason ?? null,
            policy_violations: data?.policy_violations ?? null,
        }
    }

    function selectProject(project: MarketplaceProject | null) {
        selectedProject.value = project
        if (project) {
            versions.value = []
            dependencies.value = []
            void fetchVersions(project.id)
        }
    }

    async function recordView(projectId: string): Promise<void> {
        await supabase.rpc('record_project_view', { p_project_id: projectId })
    }

    function clearFilters() {
        filters.value.search = ''
        filters.value.tagIds = []
    }

    // Map from file basename → project - allows ePlugin rows to link to marketplace entries.
    // Only matches against latest_version since full version lists aren't loaded in browse mode.
    const fileToProject = computed(() => {
        const map = new Map<string, MarketplaceProject>()
        for (const p of projects.value) {
            if (p.latest_version?.file_name) map.set(p.latest_version.file_name, p)
        }
        return map
    })

    // Called on mount and after any plugin deletion.
    // scannedPlugins = results from pluginsAPI.scan() (includes checksum).
    // Matches installed files by checksum against known marketplace versions.
    // Also detects manually-installed plugins whose checksum resolves to a marketplace entry.
    function reconcileInstallStates(scannedPlugins: { filePath: string; checksum: string }[]): void {
        const checksumToVersionId = new Map<string, string>()
        for (const project of projects.value) {
            const v = project.latest_version
            if (v?.checksum && v.id) checksumToVersionId.set(v.checksum, v.id)
        }

        const confirmedIds = new Set<string>()
        const confirmedFiles: Record<string, string> = {}
        for (const p of scannedPlugins) {
            const versionId = checksumToVersionId.get(p.checksum)
            if (versionId) {
                confirmedIds.add(versionId)
                confirmedFiles[versionId] = p.filePath.replace(/\\/g, '/').split('/').pop() ?? p.filePath
            }
        }

        for (const versionId of Object.keys(installedFiles.value)) {
            if (!confirmedIds.has(versionId)) {
                delete installedFiles.value[versionId]
                if (installing.value[versionId] === 'done') delete installing.value[versionId]
            }
        }
        for (const [versionId, fileName] of Object.entries(confirmedFiles)) {
            installedFiles.value[versionId] = fileName
            installing.value[versionId] = 'done'
        }
    }

    return {
        projects,
        selectedProject,
        versions,
        dependencies,
        tags,
        myProjects,
        myVersions,
        loading,
        loadingVersions,
        loadingMyProjects,
        loadingMyVersions,
        installing,
        filters,
        filteredProjects,
        fileToProject,
        fetchTags,
        fetchProjects,
        fetchProject,
        fetchVersions,
        fetchDependencies,
        installVersion,
        fetchMyProjects,
        fetchMyVersions,
        createProject,
        updateProject,
        deleteProject,
        setVisibility,
        createVersion,
        deleteVersion,
        updateVersionMeta,
        getUploadUrl,
        finalizeVersion,
        uploadIcon,
        selectProject,
        recordView,
        clearFilters,
        buildPublicUrl,
        reconcileInstallStates,
        submitForReview,
        fetchRejectionReason,
    }
}, {
    persist: {
        pick: ['installedFiles'],
    },
})
