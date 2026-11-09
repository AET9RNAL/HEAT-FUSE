<script setup lang="ts">
import { computed } from 'vue'
import { useRegistryStore } from '../../stores/registry'
import { useI18n } from '../../composables/useI18n'
import { renderMarkdown } from '../../composables/useMarkdown'
import { eventBus } from '../../events/eventBus'
import { formatBytes, formatDate, compareVersions, fileType, type RegistryFile, type RegistryDependency } from '../../utils/registry-api'
import ProjectIcon from './ProjectIcon.vue'
import ChannelChip from './ChannelChip.vue'
import CompatTag from './CompatTag.vue'
import HudFrame from './HudFrame.vue'
import HudReadout, { type ReadoutCell } from './HudReadout.vue'
import eButton from '../inputs/eButton.vue'
import eBadge from '../ui/eBadge.vue'
import Icons from '../ui/Icons.vue'

const emit = defineEmits<{ back: []; creator: [username: string] }>()

const registry = useRegistryStore()
const { t } = useI18n()

const project = computed(() => registry.selected!)
const latest = computed(() => project.value.latest_file)
const deps = computed<RegistryDependency[]>(() => registry.files.find(f => f.id === latest.value?.id)?.dependencies ?? [])
const required = computed(() => deps.value.filter(d => d.relation === 'required'))
const optional = computed(() => deps.value.filter(d => d.relation === 'optional'))
const incompatible = computed(() => deps.value.filter(d => d.relation === 'incompatible'))
const descHtml = computed(() => renderMarkdown(project.value.description ?? ''))
const versions = computed(() => [...registry.files].sort((a, b) => compareVersions(b.version, a.version)))
const marked = computed(() => !registry.playerGameVersion || !latest.value || latest.value.game_versions.includes(registry.playerGameVersion))

// Height of the header band of each frame.
const BAND = 34
const pad = (n: number) => String(n).padStart(2, '0')

const stats = computed<ReadoutCell[]>(() => [
    { label: t('registry.stat.downloads'), value: project.value.downloads.toLocaleString() },
    { label: t('registry.stat.views'), value: project.value.views.toLocaleString() },
    { label: t('registry.stat.versions'), value: pad(registry.files.length) },
    { label: t('registry.stat.latest'), value: latest.value?.version ?? '—' },
    { label: t('registry.stat.updated'), value: formatDate(latest.value?.published_at ?? project.value.updated_at) },
])

function stateOf(file: RegistryFile) { return registry.fileState(project.value, file) }

function labelOf(file: RegistryFile) {
    return {
        downloading: t('registry.install.downloading'), installed: t('registry.install.installed'),
        update: t('registry.install.update'), replace: t('registry.install.replace'),
        error: t('registry.install.retry'), idle: t('registry.install.install'),
    }[stateOf(file)]
}

function gameRange(file: RegistryFile) {
    const list = file.game_versions
    if (!list.length) return '—'
    return list.length > 2 ? `${list[0]} – ${list[list.length - 1]}` : list.join(', ')
}

async function copy(text: string) {
    await navigator.clipboard.writeText(text)
    eventBus.emit('notification', { message: t('registry.copied', { value: text }) })
}

function openDep(d: RegistryDependency) { void registry.openProject(d.project_id) }
</script>

<template>
    <div class="pp-root">
        <div class="mp-breadcrumb">
            <button class="mp-back" :aria-label="t('appdiscover.back')" @click="emit('back')"><Icons kind="arrow-left" size="normal" /></button>
            <button class="mp-crumb mp-crumb--link" @click="emit('back')">{{ t('appdiscover.browse') }}</button>
            <span class="mp-crumb">/</span>
            <span class="mp-crumb mp-crumb--current">{{ project.name }}</span>
        </div>

        <div class="pp-scroll mp-scroll">
            <div class="pp-top">
                <!-- The frame label: copyable IDs. -->
                <div class="mp-tagline">
                    <span class="mp-tag-key">PRJ</span>
                    <button v-tip="t('registry.copyTip')" class="mp-tag" @click="copy(project.id)">{{ project.id }}</button>
                    <template v-if="project.plugin_id">
                        <span class="mp-tag-sep">/</span>
                        <span class="mp-tag-key">{{ t('registry.pluginId') }}</span>
                        <button v-tip="t('registry.copyTip')" class="mp-tag" @click="copy(project.plugin_id)">{{ project.plugin_id }}</button>
                    </template>
                </div>

                <HudFrame class="pp-header">
                    <div class="pp-identity">
                        <ProjectIcon :icon-key="project.icon_key" :name="project.name" :size="72" />
                        <div class="pp-meta">
                            <div class="pp-title-row">
                                <h2 class="mp-title">{{ project.name }}</h2>
                                <button v-if="project.owner?.username" class="pp-creator" @click="emit('creator', project.owner.username)">
                                    {{ t('registry.card.by', { name: project.owner.username }) }}
                                </button>
                            </div>
                            <p class="mp-text">{{ project.summary }}</p>
                            <div class="pp-tags">
                                <eBadge v-for="tag in project.tags" :key="tag.id" :label="tag.label" :color="tag.color ?? undefined" />
                            </div>
                            <CompatTag v-if="latest" class="pp-compat" :game="latest.game_versions" :fuse="latest.min_fuse_version" :plugin-type="fileType(latest)" />
                        </div>
                        <div v-if="latest" class="pp-install">
                            <eButton
                                size="half"
                                :label="labelOf(latest)"
                                :system-state="registry.planning === latest.id || stateOf(latest) === 'downloading' ? 'processing' : stateOf(latest) === 'error' ? 'error' : 'idle'"
                                :disabled="stateOf(latest) === 'installed'"
                                @click="registry.requestInstall(latest.id)"
                            />
                            <span v-if="!marked" class="mp-label mp-label--warn">{{ t('registry.card.notMarked', { version: registry.playerGameVersion ?? '' }) }}</span>
                        </div>
                    </div>
                    <HudReadout class="pp-stats" :cells="stats" />
                </HudFrame>
            </div>

            <div class="pp-columns">
                <HudFrame :head="BAND" :ticks="false" :delay="0.06">
                    <div class="mp-band">
                        <span class="mp-band-title">{{ t('registry.listing.description') }}</span>
                    </div>
                    <div class="mp-frame-body pp-desc">
                        <div v-if="project.description" class="mp-markdown" v-html="descHtml" />
                        <p v-else class="mp-text">{{ t('registry.page.noDescription') }}</p>
                    </div>
                </HudFrame>

                <!-- Relations -->
                <aside class="pp-side">
                    <HudFrame :head="BAND" :ticks="false" :delay="0.12">
                        <div class="mp-band">
                            <span class="mp-band-title">{{ t('registry.page.requires') }}</span>
                            <span class="mp-band-code">{{ pad(required.length) }}</span>
                        </div>
                        <div class="mp-frame-body pp-rel">
                            <p v-if="!required.length" class="mp-text">{{ t('registry.page.noRequirements') }}</p>
                            <button v-for="d in required" :key="d.project_id" class="pp-dep" @click="openDep(d)">
                                <ProjectIcon :icon-key="d.icon_key" :name="d.name" :size="28" />
                                <span v-truncate-title class="pp-dep-name">{{ d.name }}</span>
                                <span class="mp-label">{{ d.file_version ?? t('registry.dep.anyVersion') }}</span>
                            </button>
                            <template v-if="optional.length">
                                <span class="mp-label">{{ t('registry.page.worksWith') }}</span>
                                <button v-for="d in optional" :key="d.project_id" class="pp-dep" @click="openDep(d)">
                                    <ProjectIcon :icon-key="d.icon_key" :name="d.name" :size="28" />
                                    <span v-truncate-title class="pp-dep-name">{{ d.name }}</span>
                                </button>
                            </template>
                            <template v-if="incompatible.length">
                                <span class="mp-label mp-label--error">{{ t('registry.page.incompatible') }}</span>
                                <button v-for="d in incompatible" :key="d.project_id" class="pp-dep" @click="openDep(d)">
                                    <ProjectIcon :icon-key="d.icon_key" :name="d.name" :size="28" />
                                    <span v-truncate-title class="pp-dep-name">{{ d.name }}</span>
                                </button>
                            </template>
                        </div>
                    </HudFrame>

                    <HudFrame v-if="registry.usedBy.length" :head="BAND" :ticks="false" :delay="0.18">
                        <div class="mp-band">
                            <span class="mp-band-title">{{ t('registry.page.usedBy', { count: registry.usedBy.length }) }}</span>
                        </div>
                        <div class="mp-frame-body">
                            <div class="pp-rel-list mp-scroll">
                                <button v-for="u in registry.usedBy" :key="u.id" class="pp-dep" @click="registry.openProject(u.id)">
                                    <ProjectIcon :icon-key="u.icon_key" :name="u.name" :size="28" />
                                    <span v-truncate-title class="pp-dep-name">{{ u.name }}</span>
                                    <span class="mp-label">{{ t(`registry.relation.${u.relation}`) }}</span>
                                </button>
                            </div>
                        </div>
                    </HudFrame>
                </aside>
            </div>

            <!-- Versions: the column header row fills the band. -->
            <HudFrame class="pp-versions" :head="BAND" :ticks="false" :delay="0.24">
                <div class="pp-vrow pp-vhead mp-label">
                    <span>{{ t('registry.col.version') }}</span><span>{{ t('registry.col.channel') }}</span>
                    <span>{{ t('registry.col.game') }}</span><span>{{ t('registry.col.fuse') }}</span>
                    <span class="num">{{ t('registry.col.size') }}</span><span class="num">{{ t('registry.col.downloads') }}</span>
                    <span class="num">{{ t('registry.col.released') }}</span><span />
                </div>
                <div v-if="registry.loadingProject" class="mp-empty">{{ t('components.loading') }}</div>
                <div v-else-if="!versions.length" class="mp-empty">{{ t('appdiscover.noVersions') }}</div>
                <div v-for="f in versions" :key="f.id" class="pp-vrow">
                    <span class="mp-mono pp-ver">{{ f.version }}</span>
                    <span><ChannelChip :channel="f.channel" /></span>
                    <span class="mp-mono pp-cell" :class="{ hit: registry.playerGameVersion && f.game_versions.includes(registry.playerGameVersion) }">{{ gameRange(f) }}</span>
                    <span class="mp-mono pp-cell">{{ f.min_fuse_version ? `≥ ${f.min_fuse_version}` : '—' }}</span>
                    <span class="mp-mono pp-cell num">{{ formatBytes(f.size_bytes) }}</span>
                    <span class="mp-mono pp-cell num">{{ f.downloads.toLocaleString() }}</span>
                    <span class="mp-mono pp-cell num">{{ formatDate(f.published_at) }}</span>
                    <eButton
                        size="half"
                        :label="labelOf(f)"
                        :system-state="registry.planning === f.id || stateOf(f) === 'downloading' ? 'processing' : 'idle'"
                        :disabled="stateOf(f) === 'installed'"
                        @click="registry.requestInstall(f.id)"
                    />
                </div>
            </HudFrame>
        </div>
    </div>
</template>

<style scoped src="./mp.css"></style>
<style scoped>
.pp-root {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    height: 100%;
    min-height: 0;
}

.pp-scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    padding-right: var(--space-1);
}

.pp-top {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    flex-shrink: 0;
}

.pp-header {
    padding: var(--space-4);
}

.pp-identity {
    display: flex;
    gap: var(--space-4);
    align-items: flex-start;
}

.pp-meta {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
}

.pp-title-row {
    display: flex;
    align-items: baseline;
    gap: var(--space-3);
}

.pp-creator {
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    font-family: var(--font-primary);
    font-size: var(--main-font-size-3);
    color: var(--text-muted);
}

.pp-creator:hover {
    color: var(--text-main);
    text-decoration: underline;
}

.pp-tags {
    display: flex;
    gap: var(--space-1);
    flex-wrap: wrap;
}

.pp-compat {
    align-self: flex-start;
    margin-top: var(--space-2);
}

.pp-install {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: var(--space-1);
    flex-shrink: 0;
}

.pp-stats {
    margin-top: var(--space-4);
    padding-top: var(--space-3);
    border-top: 1px dashed rgba(255, 255, 255, 0.08);
}

.pp-columns {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 280px;
    gap: var(--space-4);
    align-items: start;
}

.pp-desc {
    min-height: 120px;
}

.pp-side {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
}

.pp-rel {
    gap: var(--space-2);
}

.pp-dep {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-height: var(--pp-row);
    box-sizing: border-box;
    background: none;
    border: none;
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
    padding: var(--space-1) 0;
    cursor: pointer;
    text-align: left;
}

/* Three rows show. More rows scroll. */
.pp-rel-list {
    --pp-row: 36px;
    display: flex;
    flex-direction: column;
    max-height: calc(var(--pp-row) * 3);
    overflow-y: auto;
    padding-right: var(--space-2);
}

.pp-dep:hover .pp-dep-name {
    color: var(--accent-200);
}

.pp-dep-name {
    flex: 1;
    min-width: 0;
    font-family: var(--font-primary);
    font-size: var(--main-font-size-4);
    color: var(--text-main);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.pp-dep > .mp-label {
    flex-shrink: 0;
}

.pp-versions {
    padding: 0 var(--space-4) var(--space-2);
    flex-shrink: 0;
}

.pp-vrow {
    display: grid;
    grid-template-columns:
        minmax(0, 1.2fr) minmax(0, 0.9fr) minmax(0, 1fr) minmax(0, 0.8fr)
        minmax(0, 0.8fr) minmax(0, 0.8fr) minmax(0, 1fr) 140px;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
}

.pp-vrow:last-child {
    border-bottom: none;
}

/* Fills the header band of the frame exactly. */
.pp-vhead {
    height: 34px;
    padding: 0;
    box-sizing: border-box;
    border-bottom: none;
}

.pp-ver {
    font-size: var(--main-font-size-3);
    color: var(--text-main);
}

.pp-cell {
    font-size: var(--main-font-size-4);
    color: var(--text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.pp-cell.hit {
    color: var(--accent-200);
}

.num {
    text-align: right;
}
</style>
