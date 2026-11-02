<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useCreatorStore, type InspectedImage } from '../../stores/creator'
import { useI18n } from '../../composables/useI18n'
import { eventBus } from '../../events/eventBus'
import { errorText, formatBytes, formatDate, compareVersions, type RegistryProject, type RegistryFile } from '../../utils/registry-api'
import ListingForm, { type ListingDraft } from './ListingForm.vue'
import ProjectIcon from './ProjectIcon.vue'
import StatusChip from './StatusChip.vue'
import ChannelChip from './ChannelChip.vue'
import CompatTag from './CompatTag.vue'
import HudFrame from './HudFrame.vue'
import HudTabs, { type HudTab } from './HudTabs.vue'
import HudReadout, { type ReadoutCell } from './HudReadout.vue'
import VisibilityCorner, { type Visibility } from './VisibilityCorner.vue'
import eButton from '../inputs/eButton.vue'
import eMaterialButton from '../inputs/eMaterialButton.vue'
import eContextMenu, { type MenuOption } from '../ui/eContextMenu.vue'
import Icons from '../ui/Icons.vue'

const props = defineProps<{ projectId: string; tab?: 'versions' | 'listing' }>()
const emit = defineEmits<{ back: []; upload: []; edit: [fileId: string]; discover: [] }>()

const creator = useCreatorStore()
const { t } = useI18n()

const project = ref<RegistryProject | null>(null)
const files = ref<RegistryFile[]>([])
const tab = ref<'versions' | 'listing'>(props.tab ?? 'versions')
const busyId = ref<string | null>(null)
const listingBusy = ref(false)

const listing = ref<ListingDraft>({ name: '', slug: '', slugTouched: true, summary: '', description: '', tagIds: [] })
const icon = ref<InspectedImage | null>(null)
const listingValid = ref(false)

function fillListing(p: RegistryProject) {
    listing.value = { name: p.name, slug: p.slug, slugTouched: true, summary: p.summary, description: p.description, tagIds: p.tags.map(x => x.id) }
    icon.value = null
}

async function load() {
    const [p, list] = await Promise.all([creator.getProject(props.projectId), creator.projectFiles(props.projectId)])
    project.value = p
    files.value = list.sort((a, b) => compareVersions(b.version, a.version) || b.created_at.localeCompare(a.created_at))
    if (p) fillListing(p)
}
onMounted(load)

function fail(err: unknown) { eventBus.emit('notification', { title: t('registry.wizard.errorTitle'), message: errorText(t, err), type: 'error' }) }

const latestApproved = computed(() => files.value.find(f => f.status === 'approved') ?? null)
// Before the first approval the header shows the newest file.
const compatFile = computed(() => latestApproved.value ?? files.value[0] ?? null)

// ── Header ──
const CORNER = 56
const CORNER_PX = `${CORNER}px`
const listedBusy = ref(false)

// Only an approved project can be listed in Discover.
const visibility = computed<Visibility>(() => {
    const p = project.value
    if (!p || p.status !== 'approved') return 'locked'
    return p.listed ? 'listed' : 'hidden'
})

const visTip = computed(() => t(`registry.project.vis.tip.${visibility.value}`))

async function toggleListed() {
    const p = project.value
    if (!p || visibility.value === 'locked') return
    listedBusy.value = true
    try { await creator.setListed(p.id, !p.listed); await load() }
    catch (err) { fail(err) }
    finally { listedBusy.value = false }
}

const stats = computed<ReadoutCell[]>(() => {
    const p = project.value
    if (!p) return []
    return [
        { label: t('registry.stat.downloads'), value: p.downloads.toLocaleString() },
        { label: t('registry.stat.views'), value: p.views.toLocaleString() },
        { label: t('registry.stat.versions'), value: String(files.value.length).padStart(2, '0') },
        { label: t('registry.stat.latest'), value: latestApproved.value?.version ?? '—' },
        { label: t('registry.stat.updated'), value: formatDate(p.updated_at) },
    ]
})

// The column header row fills the header band of the versions frame.
const HEAD = 34

const tabs = computed<HudTab<'versions' | 'listing'>[]>(() => [
    { key: 'versions', label: t('registry.stat.versions'), count: files.value.length },
    { key: 'listing', label: t('registry.project.listingTab') },
])

async function submit(f: RegistryFile) {
    busyId.value = f.id
    try { await creator.submit(f.id); await load() }
    catch (err) { fail(err) }
    finally { busyId.value = null }
}

function gameRange(f: RegistryFile) {
    const l = f.game_versions
    return !l.length ? '—' : l.length > 2 ? `${l[0]} – ${l[l.length - 1]}` : l.join(', ')
}

function menu(f: RegistryFile): MenuOption[] {
    const out: MenuOption[] = [
        { label: t('registry.menu.edit'), icon: 'settings', iconSize: 'normal', action: () => emit('edit', f.id) },
        { label: t('registry.menu.copyRef'), icon: 'list', iconSize: 'normal', action: () => void navigator.clipboard.writeText(`${props.projectId}:${f.id}`) },
    ]
    if (f.status === 'approved' || f.status === 'pending_review') {
        out.push({
            label: f.status === 'approved' ? t('registry.menu.withdraw') : t('registry.menu.cancelReview'), icon: 'hide', iconSize: 'normal',
            action: () => void creator.withdraw(f.id).then(load).catch(fail),
        })
    }
    if (f.status === 'draft' || f.status === 'rejected') {
        out.push({
            label: t('registry.menu.deleteFile'), icon: 'delete', iconSize: 'normal',
            action: () => eventBus.emit('modal:pending', {
                label: t('registry.menu.deleteFileConfirm', { version: f.version ?? f.id }),
                saveLabel: t('appdiscover.deleteConfirm'),
                cancelLabel: t('common.cancel'),
                onConfirm: async () => { try { await creator.deleteDraft('file', f.id); await load() } catch (err) { fail(err) } },
            }),
        })
    }
    return out
}

async function saveListing() {
    if (!project.value) return
    listingBusy.value = true
    try {
        const l = listing.value
        await creator.updateProject(project.value.id, {
            name: l.name.trim(), slug: l.slug, summary: l.summary.trim(), description: l.description, tagIds: l.tagIds,
        })
        if (icon.value) await creator.uploadImage('icon', project.value.id, icon.value)
        await load()
        eventBus.emit('notification', { message: t('registry.listing.saved'), type: 'success' })
    } catch (err) {
        fail(err)
    } finally {
        listingBusy.value = false
    }
}

async function removeIcon() {
    if (!project.value) return
    try { await creator.removeImage('icon', project.value.id); await load() }
    catch (err) { fail(err) }
}

const listingDirty = computed(() => {
    const p = project.value
    if (!p) return false
    const l = listing.value
    return !!icon.value || l.name !== p.name || l.slug !== p.slug || l.summary !== p.summary || l.description !== p.description
        || l.tagIds.slice().sort().join(',') !== p.tags.map(x => x.id).sort().join(',')
})

async function copy(text: string) {
    await navigator.clipboard.writeText(text)
    eventBus.emit('notification', { message: t('registry.copied', { value: text }) })
}
</script>

<template>
    <div v-if="project" class="pj">
        <div class="mp-breadcrumb">
            <button class="mp-back" :aria-label="t('appdiscover.back')" @click="emit('back')"><Icons kind="arrow-left" size="normal" /></button>
            <button class="mp-crumb mp-crumb--link" @click="emit('back')">{{ t('appdiscover.myPlugins') }}</button>
            <span class="mp-crumb">/</span>
            <span class="mp-crumb mp-crumb--current">{{ project.name }}</span>
        </div>

        <div class="pj-top">
            <!-- The frame label: copyable IDs on the left, the Discover state above the corner. -->
            <div class="mp-tagline">
                <span class="mp-tag-key">PRJ</span>
                <button class="mp-tag" @click="copy(project.id)">{{ project.id }}</button>
                <span class="mp-tag-sep">/</span>
                <span class="mp-tag-key">{{ t('registry.listing.slug') }}</span>
                <button class="mp-tag" @click="copy(project.slug)">{{ project.slug }}</button>
                <template v-if="project.plugin_id">
                    <span class="mp-tag-sep">/</span>
                    <span class="mp-tag-key">{{ t('registry.pluginId') }}</span>
                    <button class="mp-tag" @click="copy(project.plugin_id)">{{ project.plugin_id }}</button>
                </template>
                <span class="mp-tag-fill" />
                <span class="pj-vis" :class="visibility">
                    {{ t('registry.project.vis.label') }}
                    <span class="pj-vis-state">{{ t(`registry.project.vis.${visibility}`) }}</span>
                </span>
            </div>

            <HudFrame class="pj-header" :corner="CORNER">
                <template #corner>
                    <VisibilityCorner :state="visibility" :busy="listedBusy" :size="CORNER" :tip="visTip" @toggle="toggleListed" />
                </template>
                <div class="pj-identity">
                    <ProjectIcon :icon-key="project.icon_key" :name="project.name" :size="56" />
                    <div class="pj-meta">
                        <div class="pj-title-row">
                            <h2 class="mp-title">{{ project.name }}</h2>
                            <StatusChip :status="project.status" :listed="project.listed" />
                        </div>
                        <p class="mp-text">{{ project.summary }}</p>
                        <CompatTag v-if="compatFile" class="pj-compat" :game="compatFile.game_versions" :fuse="compatFile.min_fuse_version" />
                    </div>
                    <eMaterialButton
                        v-if="project.status === 'approved'"
                        variant="tertiary"
                        icon="discover"
                        :label="t('registry.project.viewInDiscover')"
                        @click="emit('discover')"
                    />
                </div>
                <HudReadout class="pj-stats" :cells="stats" />
            </HudFrame>
        </div>

        <div class="pj-work">
            <HudTabs v-model="tab" :tabs="tabs">
                <template #aside>
                    <eButton v-if="tab === 'versions'" size="half" icon="upload" :label="t('registry.project.upload')" @click="emit('upload')" />
                </template>
            </HudTabs>

            <HudFrame v-if="tab === 'versions'" class="pj-table" :head="HEAD" :ticks="false">
                <div class="pj-row pj-head mp-label">
                    <span>{{ t('registry.col.version') }}</span><span>{{ t('registry.col.channel') }}</span><span>{{ t('registry.col.status') }}</span>
                    <span>{{ t('registry.col.game') }}</span><span>{{ t('registry.col.fuse') }}</span><span class="num">{{ t('registry.col.size') }}</span>
                    <span class="num">{{ t('registry.col.downloads') }}</span><span class="num">{{ t('registry.col.released') }}</span><span /><span /><span />
                </div>
                <div class="pj-scroll mp-scroll">
                    <div v-if="!files.length" class="mp-empty">{{ t('registry.project.noFiles') }}</div>
                    <div v-for="f in files" :key="f.id" class="pj-item" :class="{ alert: f.status === 'rejected' || f.state === 'invalid' }">
                        <div class="pj-row">
                            <span class="pj-ver mp-mono">
                                {{ f.version ?? '—' }}
                                <span v-if="latestApproved?.id === f.id" class="mp-chip mp-chip--live">{{ t('registry.project.latest') }}</span>
                            </span>
                            <span><ChannelChip :channel="f.channel" /></span>
                            <span><StatusChip :status="f.status" :state="f.state" /></span>
                            <span class="mp-mono pj-cell">{{ gameRange(f) }}</span>
                            <span class="mp-mono pj-cell">{{ f.min_fuse_version ? `≥ ${f.min_fuse_version}` : '—' }}</span>
                            <span class="mp-mono pj-cell num">{{ formatBytes(f.size_bytes) }}</span>
                            <span class="mp-mono pj-cell num">{{ f.downloads ? f.downloads.toLocaleString() : '—' }}</span>
                            <span class="mp-mono pj-cell num">{{ formatDate(f.published_at ?? f.created_at) }}</span>
                            <span class="pj-action">
                                <eButton
                                    v-if="(f.status === 'draft' || f.status === 'rejected') && f.state === 'ready'"
                                    size="half"
                                    variant="primary"
                                    :label="f.status === 'rejected' ? t('registry.action.resubmit') : t('registry.action.submit')"
                                    :system-state="busyId === f.id ? 'processing' : 'idle'"
                                    @click="submit(f)"
                                />
                            </span>
                            <eButton v-tip="t('registry.menu.edit')" size="slim" variant="primary" icon="settings" @click="emit('edit', f.id)" />
                            <eContextMenu :options="menu(f)" placement="bottom" trigger-icon="more" />
                        </div>
                        <p v-if="f.state === 'invalid'" class="pj-note">⚠ {{ errorText(t, f.invalid_reason ?? 'package_invalid') }}</p>
                        <p v-else-if="f.status === 'rejected'" class="pj-note">⚠ {{ t('registry.overview.reviewNote') }} · {{ creator.noteFor('file', f.id)?.reason ?? t('registry.overview.noReason') }}</p>
                    </div>
                </div>
            </HudFrame>

            <template v-else>
                <div class="pj-listing mp-scroll">
                    <ListingForm
                        v-model="listing"
                        v-model:icon="icon"
                        :project-id="project.id"
                        :icon-key="project.icon_key"
                        :owner-name="project.owner?.username ?? null"
                        @remove-icon="removeIcon"
                        @validity="listingValid = $event"
                    />
                </div>
                <div class="pj-foot">
                    <span class="mp-label" :class="{ 'mp-label--warn': listingDirty }">■ {{ listingDirty ? t('registry.profile.unsaved') : t('registry.profile.allSaved') }}</span>
                    <div class="pj-actions">
                        <eButton size="half" variant="tertiary" :label="t('registry.profile.discard')" :disabled="!listingDirty || listingBusy" @click="fillListing(project)" />
                        <eButton size="half" :label="t('registry.profile.save')" :disabled="!listingDirty || !listingValid" :system-state="listingBusy ? 'processing' : 'idle'" @click="saveListing" />
                    </div>
                </div>
            </template>
        </div>
    </div>
    <div v-else class="mp-empty">{{ t('components.loading') }}</div>
</template>

<style scoped src="./mp.css"></style>
<style scoped>
.pj {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    flex: 1;
    min-height: 0;
}

.pj-top {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    flex-shrink: 0;
}

.pj-vis {
    color: var(--base-600);
}

.pj-vis-state {
    margin-left: var(--space-1);
    color: var(--text-muted);
}

.pj-vis.listed .pj-vis-state {
    color: var(--accent-200);
}

/* The right padding keeps the content clear of the corner segment. */
.pj-header {
    padding: var(--space-4) calc(v-bind(CORNER_PX) + var(--space-3)) var(--space-4) var(--space-4);
}

.pj-identity {
    display: flex;
    align-items: center;
    gap: var(--space-4);
}

.pj-meta {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.pj-title-row {
    display: flex;
    align-items: center;
    gap: var(--space-3);
}

.pj-compat {
    align-self: flex-start;
    margin-top: var(--space-2);
}

.pj-stats {
    margin-top: var(--space-4);
    padding-top: var(--space-3);
    border-top: 1px dashed rgba(255, 255, 255, 0.08);
}

.pj-work {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    flex: 1;
    min-height: 0;
}

.pj-table {
    flex: 1;
    min-height: 0;
    padding: 0 var(--space-3) var(--space-2);
}

.pj-scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
}

.pj-row {
    display: grid;
    grid-template-columns: minmax(0, 1.5fr) 0.8fr 1.1fr 0.9fr 0.7fr 0.7fr 0.7fr 0.9fr 150px 48px 32px;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2);
}

/* Fills the header band of the frame exactly. */
.pj-head {
    height: 34px;
    padding-top: 0;
    padding-bottom: 0;
    box-sizing: border-box;
    flex-shrink: 0;
}

.pj-item {
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.pj-item.alert {
    background: rgba(102, 35, 43, 0.35);
}


.pj-ver {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--main-font-size-3);
    color: var(--text-main);
}

.pj-cell {
    font-size: var(--main-font-size-4);
    color: var(--text-main);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.pj-action {
    display: flex;
    justify-content: flex-end;
}

.pj-note {
    margin: 0;
    padding: 0 var(--space-2) var(--space-2);
    font-family: var(--font-microcopy);
    font-size: 11px;
    text-transform: uppercase;
    color: var(--error-highlight);
}

.pj-listing {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    display: flex;
}

.pj-foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-top: var(--space-3);
    border-top: 1px solid var(--base-600);
    flex-shrink: 0;
}

.pj-actions {
    display: flex;
    gap: var(--space-2);
}

.num {
    text-align: right;
}
</style>
