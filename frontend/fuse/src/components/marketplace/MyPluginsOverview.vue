<script setup lang="ts">
import { ref, computed } from 'vue'
import { AnimatePresence, motion } from 'motion-v'
import { useCreatorStore, type MyProjectRow } from '../../stores/creator'
import { useI18n } from '../../composables/useI18n'
import { Dynamics } from '../../composables/useMotion'
import { eventBus } from '../../events/eventBus'
import { errorText, formatDate } from '../../utils/registry-api'
import HudModule from './HudModule.vue'
import HudReadout, { type ReadoutCell } from './HudReadout.vue'
import ProjectIcon from './ProjectIcon.vue'
import StatusChip from './StatusChip.vue'
import ChannelChip from './ChannelChip.vue'
import DeleteProjectDialog, { type DeleteTarget } from './DeleteProjectDialog.vue'
import eButton from '../inputs/eButton.vue'
import eInputField from '../inputs/eInputField.vue'
import eSelect from '../inputs/eSelect.vue'
import eContextMenu, { type MenuOption } from '../ui/eContextMenu.vue'
import Icons from '../ui/Icons.vue'

const emit = defineEmits<{
    open: [projectId: string, tab?: 'versions' | 'listing']
    create: []
    upload: [projectId: string]
    profile: []
    discover: [projectId: string]
}>()

const creator = useCreatorStore()
const { t } = useI18n()

type RowKey = 'live' | 'hidden' | 'review' | 'draft' | 'changes'
const filter = ref<'all' | RowKey>('all')
const search = ref('')
const sort = ref<'action' | 'updated' | 'downloads' | 'name'>('action')
const busyId = ref<string | null>(null)

/** One status per row: the project status, or the state of its newest file before the first approval. */
function rowKey(r: MyProjectRow): RowKey {
    const p = r.project, f = r.newest_file
    if (p.status === 'approved') return p.listed ? 'live' : 'hidden'
    if (p.status === 'rejected' || f?.status === 'rejected') return 'changes'
    if (p.status === 'pending_review' || f?.status === 'pending_review') return 'review'
    return 'draft'
}

const counts = computed(() => {
    const c: Record<string, number> = { all: creator.rows.length, live: 0, hidden: 0, review: 0, draft: 0, changes: 0 }
    for (const r of creator.rows) c[rowKey(r)]++
    return c
})

const ORDER: Record<RowKey, number> = { changes: 0, draft: 1, review: 2, hidden: 3, live: 4 }
const rows = computed(() => {
    const q = search.value.trim().toLowerCase()
    const list = creator.rows.filter(r =>
        (filter.value === 'all' || rowKey(r) === filter.value) &&
        (!q || r.project.name.toLowerCase().includes(q) || r.project.summary.toLowerCase().includes(q)))
    const by = {
        action: (a: MyProjectRow, b: MyProjectRow) => Number(b.awaiting_action) - Number(a.awaiting_action) || ORDER[rowKey(a)] - ORDER[rowKey(b)],
        updated: (a: MyProjectRow, b: MyProjectRow) => b.project.updated_at.localeCompare(a.project.updated_at),
        downloads: (a: MyProjectRow, b: MyProjectRow) => b.project.downloads - a.project.downloads,
        name: (a: MyProjectRow, b: MyProjectRow) => a.project.name.localeCompare(b.project.name),
    }[sort.value]
    return [...list].sort(by)
})

const sortOptions = computed(() => (['action', 'updated', 'downloads', 'name'] as const).map(v => ({ value: v, label: t(`registry.overview.sort.${v}`) })))

const readout = computed<ReadoutCell[]>(() => {
    const o = creator.overview
    const pad = (n: number | undefined) => String(n ?? 0).padStart(2, '0')
    return [
        { label: t('registry.stat.plugins'), value: pad(o?.plugins) },
        { label: t('registry.stat.live'), value: pad(o?.live) },
        { label: t('registry.stat.downloads'), value: (o?.downloads ?? 0).toLocaleString() },
        { label: t('registry.stat.views'), value: (o?.views ?? 0).toLocaleString() },
        { label: t('registry.stat.awaiting'), value: pad(o?.awaiting), tone: (o?.awaiting ?? 0) > 0 ? 'warn' : undefined },
    ]
})

type Action = { kind: 'fix' | 'submit' | 'publish' | 'version' | 'upload' | 'queued'; label: string }
function actionOf(r: MyProjectRow): Action {
    const p = r.project, f = r.newest_file
    if (f?.status === 'rejected' || p.status === 'rejected') return { kind: 'fix', label: t('registry.action.fix') }
    if (f?.status === 'pending_review') return { kind: 'queued', label: t('registry.action.queued', { date: formatDate(f.updated_at) }) }
    if (f && f.status === 'draft' && f.state === 'ready') return { kind: 'submit', label: t('registry.action.submit') }
    if (!f || f.status === 'draft') return { kind: 'upload', label: t('registry.action.upload') }
    if (p.status === 'approved' && !p.listed) return { kind: 'publish', label: t('registry.action.publish') }
    return { kind: 'version', label: t('registry.action.version') }
}

function fail(err: unknown) { eventBus.emit('notification', { title: t('registry.wizard.errorTitle'), message: errorText(t, err), type: 'error' }) }

async function run(r: MyProjectRow) {
    const a = actionOf(r)
    if (a.kind === 'fix') return emit('open', r.project.id, 'versions')
    if (a.kind === 'upload' || a.kind === 'version') return emit('upload', r.project.id)
    busyId.value = r.project.id
    try {
        if (a.kind === 'submit' && r.newest_file) await creator.submit(r.newest_file.id)
        if (a.kind === 'publish') await creator.setListed(r.project.id, true)
        await creator.loadProjects()
    } catch (err) {
        fail(err)
    } finally {
        busyId.value = null
    }
}

function noteFor(r: MyProjectRow) {
    if (r.newest_file?.status === 'rejected') return creator.noteFor('file', r.newest_file.id)
    if (r.project.status === 'rejected') return creator.noteFor('project', r.project.id)
    return null
}

// The project in the delete dialog. Null closes the dialog.
const deleting = ref<DeleteTarget | null>(null)

function menu(r: MyProjectRow): MenuOption[] {
    const out: MenuOption[] = [
        { label: t('registry.menu.open'), icon: 'settings', iconSize: 'normal', action: () => emit('open', r.project.id) },
        { label: t('registry.menu.listing'), icon: 'content', iconSize: 'normal', action: () => emit('open', r.project.id, 'listing') },
        { label: t('registry.menu.copyId'), icon: 'list', iconSize: 'normal', action: () => void navigator.clipboard.writeText(r.project.id) },
    ]
    if (r.project.status === 'approved') {
        out.push({ label: t('registry.menu.discover'), icon: 'discover', iconSize: 'normal', action: () => emit('discover', r.project.id) })
        out.push({
            label: r.project.listed ? t('registry.menu.hide') : t('registry.menu.publish'), icon: r.project.listed ? 'hide' : 'views', iconSize: 'normal',
            action: () => void creator.setListed(r.project.id, !r.project.listed).catch(fail),
        })
    } else {
        out.push({
            label: t('registry.menu.delete'), icon: 'delete', iconSize: 'normal',
            action: () => { deleting.value = { id: r.project.id, name: r.project.name, slug: r.project.slug } },
        })
    }
    return out
}

const FILTERS: ('all' | RowKey)[] = ['all', 'live', 'hidden', 'review', 'draft', 'changes']
</script>

<template>
    <div class="ov">
        <!-- The creator console: the one module of the screen with the accent strip. -->
        <HudModule :title="t('registry.overview.console')" serial="MYP-C0NS0L3" strip="accent" :index="0">
            <template #aside>
                <eButton size="half" icon="plugin" :label="t('registry.overview.newPlugin')" @click="emit('create')" />
            </template>
            <div class="console">
                <div class="who">
                    <span class="who-plinth">
                        <ProjectIcon :icon-key="creator.profile?.avatar_key" :name="creator.profile?.username ?? '?'" :size="48" />
                    </span>
                    <span class="who-copy">
                        <span class="who-name">{{ creator.profile?.username ?? t('registry.overview.noUsername') }}</span>
                        <button type="button" class="who-link" @click="emit('profile')">{{ t('registry.overview.editProfile') }}</button>
                    </span>
                </div>
                <HudReadout class="console-readout" :cells="readout" />
            </div>
        </HudModule>

        <p v-if="creator.profile && !creator.profile.username" class="ov-banner">
            <Icons kind="warning" size="normal" />
            {{ t('registry.overview.usernameBanner') }}
            <button type="button" class="who-link" @click="emit('profile')">{{ t('registry.wizard.setUsername') }}</button>
        </p>

        <HudModule
            class="ov-projects"
            :title="t('registry.overview.projects')"
            serial="PRJ-L3DG3R"
            :note="t('registry.overview.shown', { shown: String(rows.length).padStart(2, '0'), total: String(creator.rows.length).padStart(2, '0') })"
            :index="1"
        >
            <template #aside>
                <div class="ov-search">
                    <eInputField v-model="search" :label="t('registry.overview.search')" size="flex" orientation="both" />
                </div>
                <div class="ov-sort"><eSelect v-model="sort" :options="sortOptions" /></div>
            </template>

            <div class="ov-filters">
                <button
                    v-for="f in FILTERS"
                    :key="f"
                    type="button"
                    class="ov-filter"
                    :class="[{ on: filter === f }, f]"
                    @click="filter = f"
                >
                    {{ t(`registry.overview.filter.${f}`) }}
                    <span class="ov-filter-count">{{ String(counts[f] ?? 0).padStart(2, '0') }}</span>
                </button>
            </div>

            <div class="ov-row ov-head">
                <span>{{ t('registry.col.plugin') }}</span>
                <span>{{ t('registry.col.status') }}</span>
                <span>{{ t('registry.col.latest') }}</span>
                <span class="num">{{ t('registry.col.downloads') }}</span>
                <span class="num">{{ t('registry.col.views') }}</span>
                <span class="num">{{ t('registry.col.updated') }}</span>
                <span />
                <span />
            </div>

            <div class="ov-scroll mp-scroll">
                <div v-if="creator.loading && !creator.rows.length" class="mp-empty">{{ t('components.loading') }}</div>

                <motion.div
                    v-else-if="!creator.rows.length"
                    class="ov-empty"
                    :initial="{ opacity: 0, scale: 0.96 }"
                    :animate="{ opacity: 1, scale: 1 }"
                    :transition="Dynamics.snappy"
                >
                    <span class="ov-empty-plinth"><Icons kind="plugin" size="large" /></span>
                    <span class="ov-empty-title">{{ t('registry.overview.emptyTitle') }}</span>
                    <p class="ov-empty-body">{{ t('registry.overview.emptyBody') }}</p>
                    <eButton size="half" :label="t('registry.overview.newPlugin')" @click="emit('create')" />
                </motion.div>

                <div v-else-if="!rows.length" class="mp-empty">{{ t('appdiscover.noResults') }}</div>

                <!-- popLayout takes a leaving row out of the flow, so a filter change does not stack both lists. -->
                <AnimatePresence mode="popLayout">
                    <motion.div
                        v-for="(r, i) in rows"
                        :key="r.project.id"
                        class="ov-item"
                        :class="rowKey(r)"
                        :initial="{ opacity: 0, x: 10 }"
                        :animate="{ opacity: 1, x: 0 }"
                        :exit="{ opacity: 0 }"
                        :transition="{ ...Dynamics.snappy, delay: Math.min(i, 12) * 0.02 }"
                    >
                        <div class="ov-row" @click="emit('open', r.project.id)">
                            <div class="ov-plugin">
                                <ProjectIcon :icon-key="r.project.icon_key" :name="r.project.name" :size="40" />
                                <div class="ov-plugin-text">
                                    <span v-truncate-title class="ov-plugin-name">{{ r.project.name }}</span>
                                    <span class="ov-plugin-hint">
                                        <span class="ov-id">{{ r.project.id }}</span>
                                        <span v-truncate-title class="ov-summary">{{ r.project.summary }}</span>
                                    </span>
                                </div>
                            </div>
                            <span>
                                <StatusChip
                                    :status="r.project.status === 'approved' ? 'approved' : (r.newest_file?.status ?? r.project.status)"
                                    :listed="r.project.listed"
                                    :state="r.project.status === 'approved' ? undefined : r.newest_file?.state"
                                />
                            </span>
                            <span class="ov-latest">
                                <span class="ov-mono">{{ r.newest_file?.version ?? '—' }}</span>
                                <ChannelChip v-if="r.newest_file" :channel="r.newest_file.channel" class="ov-latest-chip" />
                            </span>
                            <span class="ov-mono num">{{ r.project.downloads ? r.project.downloads.toLocaleString() : '—' }}</span>
                            <span class="ov-mono num">{{ r.project.views ? r.project.views.toLocaleString() : '—' }}</span>
                            <span class="ov-mono num">{{ formatDate(r.project.updated_at) }}</span>
                            <span class="ov-action" @click.stop>
                                <span v-if="actionOf(r).kind === 'queued'" class="ov-queued">{{ actionOf(r).label }}</span>
                                <eButton v-else size="half" variant="primary" :label="actionOf(r).label" :system-state="busyId === r.project.id ? 'processing' : 'idle'" @click="run(r)" />
                            </span>
                            <span @click.stop><eContextMenu :options="menu(r)" placement="bottom" trigger-icon="more" /></span>
                        </div>
                        <p v-if="noteFor(r)" class="ov-note">⚠ {{ t('registry.overview.reviewNote') }} · {{ noteFor(r)?.reason ?? t('registry.overview.noReason') }}</p>
                    </motion.div>
                </AnimatePresence>
            </div>
        </HudModule>

        <DeleteProjectDialog :project="deleting" @close="deleting = null" />
    </div>
</template>

<style scoped src="./mp.css"></style>
<style scoped>
.ov {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    flex: 1;
    min-height: 0;
}

/* ── Creator console ── */

.console {
    display: flex;
    align-items: stretch;
    gap: var(--space-4);
}

.who {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    min-width: 200px;
}

.who-plinth {
    display: flex;
    padding: 4px;
    background: repeating-linear-gradient(135deg, rgba(255, 255, 255, 0.05) 0 1px, transparent 1px 5px);
    border: 1px solid var(--base-600);
    corner-shape: bevel;
    border-radius: 8px 0 8px 0;
}

.who-copy {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-1);
    min-width: 0;
}

.who-name {
    font-family: var(--font-primary);
    font-size: var(--main-font-size-2);
    font-weight: var(--font-weight-2);
    color: var(--text-main);
    text-transform: uppercase;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.who-link {
    padding: 0;
    border: none;
    background: none;
    font-family: var(--font-microcopy);
    font-size: var(--secondary-font-size-5);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-main);
    text-decoration: underline;
    text-decoration-thickness: 1px;
    text-underline-offset: 2px;
    cursor: pointer;
}

.who-link:hover {
    color: var(--accent-200);
}

.console-readout {
    flex: 1;
}

.ov-banner {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin: 0;
    font-family: var(--font-microcopy);
    font-size: var(--secondary-font-size-4);
    color: var(--accent-600);
}

/* ── Projects ── */

.ov-projects {
    flex: 1;
    min-height: 0;
}

.ov-search {
    display: flex;
    width: 220px;
}

.ov-sort {
    width: 170px;
}

.ov-filters {
    display: flex;
    gap: var(--space-1);
    flex-wrap: wrap;
    margin-bottom: var(--space-2);
}

.ov-filter {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    height: 24px;
    padding: 0 var(--space-2);
    box-sizing: border-box;
    background: transparent;
    border: 1px solid var(--base-600);
    corner-shape: bevel;
    border-radius: 6px 0 6px 0;
    color: var(--text-muted);
    font-family: var(--font-microcopy);
    font-size: var(--secondary-font-size-5);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    cursor: pointer;
}

.ov-filter:hover {
    color: var(--text-main);
    border-color: var(--base-200);
}

.ov-filter-count {
    color: var(--base-600);
    font-variant-numeric: tabular-nums;
}

.ov-filter.changes .ov-filter-count {
    color: var(--error-highlight);
}

.ov-filter.on {
    background: var(--base-50);
    border-color: var(--base-50);
    color: var(--black-1);
}

.ov-filter.on .ov-filter-count {
    color: var(--black-3);
}

.ov-scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding-right: var(--space-1);
}

.ov-row {
    display: grid;
    grid-template-columns:
        minmax(0, 3fr) minmax(0, 1.2fr) minmax(0, 0.9fr) minmax(0, 0.8fr)
        minmax(0, 0.8fr) minmax(0, 0.8fr) 150px 32px;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2);
    cursor: pointer;
}

.ov-head {
    padding-top: 0;
    cursor: default;
    border-bottom: 1px solid var(--base-600);
    font-family: var(--font-microcopy);
    font-size: var(--secondary-font-size-5);
    letter-spacing: 0.1em;
    color: var(--text-muted);
    text-transform: uppercase;
    user-select: none;
    -webkit-user-select: none;
}

.ov-item {
    position: relative;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.ov-item:hover {
    background: rgba(255, 255, 255, 0.02);
}

.ov-item.changes {
    background: linear-gradient(90deg, rgba(252, 165, 165, 0.08), transparent 60%);
}

.ov-plugin {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    min-width: 0;
}

.ov-plugin-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
}

.ov-plugin-name {
    font-family: var(--font-primary);
    font-size: var(--main-font-size-3);
    font-weight: var(--font-weight-2);
    color: var(--text-main);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.ov-plugin-hint {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
    min-width: 0;
    font-family: var(--font-microcopy);
    font-size: var(--secondary-font-size-5);
    color: var(--text-muted);
}

.ov-id {
    flex-shrink: 0;
    letter-spacing: 0.08em;
    color: var(--base-600);
}

.ov-summary {
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.ov-latest {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
}

.ov-latest-chip {
    transform: scale(0.85);
    transform-origin: left;
}

.ov-mono {
    font-family: var(--font-microcopy);
    font-size: var(--main-font-size-4);
    color: var(--text-main);
    font-variant-numeric: tabular-nums;
}

.ov-action {
    display: flex;
    justify-content: flex-end;
}

.ov-queued {
    font-family: var(--font-microcopy);
    font-size: var(--secondary-font-size-5);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--accent-600);
}

.ov-note {
    margin: 0;
    padding: 0 var(--space-2) var(--space-2) calc(var(--space-2) + 40px + var(--space-3));
    font-family: var(--font-microcopy);
    font-size: var(--secondary-font-size-5);
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--error-highlight);
}

/* ── Empty ── */

.ov-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-7) var(--space-4);
    text-align: center;
}

.ov-empty-plinth {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 64px;
    height: 64px;
    background: repeating-linear-gradient(135deg, rgba(255, 255, 255, 0.05) 0 1px, transparent 1px 6px);
    border: 1px solid var(--base-600);
    corner-shape: bevel;
    border-radius: 12px 0 12px 0;
    color: var(--text-muted);
}

.ov-empty-title {
    font-family: var(--font-primary);
    font-size: var(--main-font-size-2);
    font-weight: var(--font-weight-2);
    text-transform: uppercase;
    color: var(--text-main);
}

.ov-empty-body {
    max-width: 360px;
    margin: 0;
    font-family: var(--font-microcopy);
    font-size: var(--secondary-font-size-4);
    color: var(--text-muted);
}

.num {
    text-align: right;
}
</style>
