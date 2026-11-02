<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { AnimatePresence, motion } from 'motion-v'
import { useCreatorStore } from '../../stores/creator'
import { useRegistryStore } from '../../stores/registry'
import { useAppStore } from '../../stores/app'
import { useI18n } from '../../composables/useI18n'
import { Dynamics } from '../../composables/useMotion'
import { formatBytes } from '../../utils/registry-api'
import MyPluginsOverview from './MyPluginsOverview.vue'
import MyProjectPage from './MyProjectPage.vue'
import ReleaseWizard from './ReleaseWizard.vue'
import VersionEditor from './VersionEditor.vue'
import ProfileEditor from './ProfileEditor.vue'
import Icons from '../ui/Icons.vue'

const emit = defineEmits<{ 'view-in-discover': [projectId: string] }>()

const creator = useCreatorStore()
const registry = useRegistryStore()
const { t } = useI18n()

type View =
    | { name: 'overview' }
    | { name: 'project'; projectId: string; tab?: 'versions' | 'listing' }
    | { name: 'create' }
    | { name: 'upload'; projectId: string; projectName: string }
    | { name: 'edit'; projectId: string; projectName: string; fileId: string }

const view = ref<View>({ name: 'overview' })
// The profile opens over the current view, so a wizard in progress keeps its state.
const profileOpen = ref(false)

onMounted(async () => {
    if (!registry.tags.length) void registry.fetchTags()
    await Promise.all([creator.loadProfile(), creator.loadProjects()])
})

function overview() { view.value = { name: 'overview' }; void creator.loadProjects() }
function openProject(projectId: string, tab?: 'versions' | 'listing') { view.value = { name: 'project', projectId, tab } }
function nameOf(projectId: string) { return creator.rows.find(r => r.project.id === projectId)?.project.name ?? projectId }
function upload(projectId: string) { view.value = { name: 'upload', projectId, projectName: nameOf(projectId) } }
function profile() { profileOpen.value = true }

function wizardDone(projectId: string | null) {
    void creator.loadProjects()
    if (projectId) openProject(projectId)
    else overview()
}

// ── Frame: a working area for creators, read as a path and a status line ──
const app = useAppStore()

const viewKey = computed(() => {
    const v = view.value
    return v.name === 'overview' || v.name === 'create' ? v.name : `${v.name}:${v.projectId}`
})

function slugOf(projectId: string) { return creator.rows.find(r => r.project.id === projectId)?.project.slug ?? projectId }

const path = computed(() => {
    const root = `~/registry/@${(creator.profile?.username ?? 'creator').toLowerCase()}`
    if (profileOpen.value) return `${root}/profile`
    const v = view.value
    if (v.name === 'overview') return root
    if (v.name === 'create') return `${root}/new`
    const project = `${root}/${slugOf(v.projectId)}`
    if (v.name === 'upload') return `${project}/upload`
    if (v.name === 'edit') return `${project}/${v.fileId}`
    return project
})

const status = computed(() => {
    const p = creator.profile
    const storage = p ? `${formatBytes(p.storage_used_bytes)} / ${formatBytes(p.storage_quota_bytes)}` : '—'
    return `${String(creator.rows.length).padStart(2, '0')} PROJ · ${storage}`
})
</script>

<template>
    <div class="frame">
        <div class="frame-grid" aria-hidden="true" />
        <span v-for="c in ['tl', 'tr', 'bl', 'br']" :key="c" class="frame-corner" :class="c" aria-hidden="true" />

        <div class="frame-stage">
            <!-- The profile opens over the current view, so a wizard in progress keeps its state. -->
            <AnimatePresence>
                <motion.div
                    v-if="profileOpen"
                    key="profile"
                    class="frame-view"
                    :initial="{ opacity: 0, x: 12 }"
                    :animate="{ opacity: 1, x: 0 }"
                    :exit="{ opacity: 0, x: 12 }"
                    :transition="Dynamics.smooth"
                >
                    <ProfileEditor @back="profileOpen = false" />
                </motion.div>
            </AnimatePresence>

            <div v-show="!profileOpen" class="myp">
                <AnimatePresence mode="wait">
                    <motion.div
                        :key="viewKey"
                        class="frame-view"
                        :initial="{ opacity: 0, x: 12 }"
                        :animate="{ opacity: 1, x: 0 }"
                        :exit="{ opacity: 0, x: -12 }"
                        :transition="Dynamics.smooth"
                    >
                        <MyPluginsOverview
                            v-if="view.name === 'overview'"
                            @open="openProject"
                            @create="view = { name: 'create' }"
                            @upload="upload"
                            @profile="profile"
                            @discover="emit('view-in-discover', $event)"
                        />

                        <MyProjectPage
                            v-else-if="view.name === 'project'"
                            :key="view.projectId"
                            :project-id="view.projectId"
                            :tab="view.tab"
                            @back="overview"
                            @upload="upload(view.projectId)"
                            @edit="(fileId: string) => { if (view.name === 'project') view = { name: 'edit', projectId: view.projectId, projectName: nameOf(view.projectId), fileId } }"
                            @discover="emit('view-in-discover', view.projectId)"
                        />

                        <template v-else-if="view.name === 'create' || view.name === 'upload'">
                            <div class="mp-breadcrumb">
                                <button class="mp-back" :aria-label="t('appdiscover.back')" @click="view.name === 'upload' ? openProject(view.projectId) : overview()">
                                    <Icons kind="arrow-left" size="normal" />
                                </button>
                                <button class="mp-crumb mp-crumb--link" @click="overview">{{ t('appdiscover.myPlugins') }}</button>
                                <span class="mp-crumb">/</span>
                                <template v-if="view.name === 'upload'">
                                    <button class="mp-crumb mp-crumb--link" @click="openProject(view.projectId)">{{ view.projectName }}</button>
                                    <span class="mp-crumb">/</span>
                                </template>
                                <span class="mp-crumb mp-crumb--current">{{ view.name === 'upload' ? t('registry.project.upload') : t('registry.overview.newPlugin') }}</span>
                            </div>
                            <ReleaseWizard
                                :key="view.name === 'upload' ? view.projectId : 'new'"
                                :project-id="view.name === 'upload' ? view.projectId : null"
                                @done="wizardDone"
                                @profile="profile"
                            />
                        </template>

                        <VersionEditor
                            v-else-if="view.name === 'edit'"
                            :project-id="view.projectId"
                            :project-name="view.projectName"
                            :file-id="view.fileId"
                            @back="openProject(view.projectId)"
                        />
                    </motion.div>
                </AnimatePresence>
            </div>
        </div>

        <footer class="frame-rail" aria-hidden="true">
            <span class="rail-path"><span class="rail-prompt">$</span> {{ path }}</span>
            <span class="rail-meta">{{ status }}</span>
            <span class="rail-meta">++FUSE+REGISTRY-{{ app.appVersion || 'DEV' }}</span>
        </footer>
    </div>
</template>

<style scoped src="./mp.css"></style>
<style scoped>
/* creator working area*/
.frame {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    flex: 1;
    min-height: 0;
    padding: var(--space-3) var(--space-3) var(--space-1);
}

/* 24 px grid */
.frame-grid {
    position: absolute;
    inset: 0;
    pointer-events: none;
    background-image:
        url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='96' height='96'%3E%3Cpath d='M48 43v10M43 48h10' stroke='%23ffffff' stroke-opacity='0.18' fill='none'/%3E%3Cpath d='M0 0L96 96M96 0L0 96' stroke='%23ffffff' stroke-opacity='0.04' stroke-dasharray='2 6' fill='none'/%3E%3C/svg%3E"),
        linear-gradient(to right, rgba(255, 255, 255, 0.025) 1px, transparent 1px),
        linear-gradient(to bottom, rgba(255, 255, 255, 0.025) 1px, transparent 1px);
    background-size: 96px 96px, 24px 24px, 24px 24px;
    background-position: 0 0, 0 0, 0 0;
    mask-image: radial-gradient(ellipse at center, #000 45%, transparent 100%);
    -webkit-mask-image: radial-gradient(ellipse at center, #000 45%, transparent 100%);
}

.frame-corner {
    position: absolute;
    width: 7px;
    height: 7px;
    box-sizing: border-box;
    border: 1px solid var(--base-600);
    pointer-events: none;
}

.frame-corner.tl {
    top: 0;
    left: 0;
}

.frame-corner.tr {
    top: 0;
    right: 0;
}

.frame-corner.bl {
    bottom: 0;
    left: 0;
}

.frame-corner.br {
    bottom: 0;
    right: 0;
}

.frame-stage {
    position: relative;
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
}

.frame-view {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    flex: 1;
    min-height: 0;
}

.myp {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
}

/* A CLI line: where the creator is, and what the registry holds. */
.frame-rail {
    position: relative;
    display: flex;
    align-items: center;
    gap: var(--space-4);
    flex-shrink: 0;
    padding-top: var(--space-1);
    border-top: 1px solid rgba(255, 255, 255, 0.05);
    font-family: var(--font-microcopy);
    font-size: var(--secondary-font-size-5);
    letter-spacing: 0.08em;
    color: var(--base-600);
    text-transform: uppercase;
    white-space: nowrap;
    user-select: none;
    -webkit-user-select: none;
}

.rail-path {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--text-muted);
    text-transform: none;
}

.rail-prompt {
    color: var(--base-600);
}

.rail-meta {
    flex-shrink: 0;
}
</style>
