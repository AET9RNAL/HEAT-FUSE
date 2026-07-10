<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useMarketplaceStore } from '../stores/marketplace'
import { useI18n } from '../composables/useI18n'
import { eventBus } from '../events/eventBus'
import MarketplaceUploadProject from './MarketplaceUploadProject.vue'
import MarketplaceUploadVersion from './MarketplaceUploadVersion.vue'
import eBadge from './eBadge.vue'
import eButton from './eButton.vue'
import eInputField from './eInputField.vue'
import eSwitch from './eSwitch.vue'
import type { eSwitchOption } from './eSwitch.vue'

const editTabOptions = computed<eSwitchOption[]>(() => [
    { label: t('appdiscover.versions'),    value: 'versions' },
    { label: t('appdiscover.editProject'), value: 'metadata' },
])
import type { MarketplaceProject, MarketplaceVersion, ModerationStatus } from '../stores/marketplace'

const store = useMarketplaceStore()
const { t } = useI18n()

type View    = 'list' | 'create' | 'edit' | 'new-version' | 'edit-version'
type EditTab = 'versions' | 'metadata'

const view          = ref<View>('list')
const editTab       = ref<EditTab>('versions')
const activeProject = ref<MarketplaceProject | null>(null)
const activeVersion = ref<MarketplaceVersion | null>(null)
const togglingId    = ref<string | null>(null)
const submittingId  = ref<string | null>(null)

// Edit-version inline form state
const editType        = ref<'alpha' | 'beta' | 'release'>('release')
const editChangelog   = ref('')
const editGameVers    = ref('')
const savingVersion   = ref(false)

onMounted(() => store.fetchMyProjects())

// ── Moderation helpers ────────────────────────────────────────────────────────

const MOD_COLORS: Record<ModerationStatus, string | undefined> = {
    draft:          undefined,
    pending_review: '#fde68a',
    approved:       '#84ffb1',
    rejected:       '#fca5a5',
    withdrawn:      undefined,
}

function modStatusLabel(s: ModerationStatus) {
    return {
        draft:          'Draft',
        pending_review: 'Under Review',
        approved:       'Approved',
        rejected:       'Rejected',
        withdrawn:      'Withdrawn',
    }[s] ?? s
}

async function handleSubmitForReview(type: 'project' | 'version', id: string) {
    submittingId.value = id
    const res = await store.submitForReview(type, id)
    submittingId.value = null
    if (!res.success) {
        eventBus.emit('notification', { title: 'Error', message: res.error ?? 'Failed to submit', type: 'error' })
    } else {
        eventBus.emit('notification', { message: 'Submitted for review' })
    }
}

async function showRejectionReason(type: 'project' | 'version', id: string) {
    const { reason, policy_violations } = await store.fetchRejectionReason(type, id)
    const parts: string[] = []
    if (reason) parts.push(reason)
    if (policy_violations?.length) parts.push(`Policy violations: ${policy_violations.join(', ')}`)
    eventBus.emit('notification', {
        title: 'Rejection reason',
        message: parts.join(' — ') || 'No reason provided',
        type: 'warning',
    })
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
    return new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(iso))
}

function formatSize(bytes: number | null) {
    if (!bytes) return '—'
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

function versionColor(type: string) {
    return type === 'alpha' ? '#fde68a' : type === 'beta' ? '#7dd3fc' : '#84ffb1'
}

// ── Project actions ───────────────────────────────────────────────────────────

async function handleToggleVisibility(project: MarketplaceProject) {
    togglingId.value = project.id
    const res = await store.setVisibility(project.id, !project.visibility)
    if (!res.success) {
        eventBus.emit('notification', { title: 'Error', message: res.error ?? 'Failed to update visibility', type: 'error' })
    } else {
        eventBus.emit('notification', {
            message: project.visibility
                ? t('appdiscover.notify.publishedOff')
                : t('appdiscover.notify.publishedOn'),
        })
    }
    togglingId.value = null
}

function confirmDeleteProject(project: MarketplaceProject) {
    eventBus.emit('modal:pending', {
        label: `Delete "${project.name}"?`,
        saveLabel: t('appdiscover.deleteConfirm'),
        cancelLabel: t('common.cancel'),
        onConfirm: async () => {
            const res = await store.deleteProject(project.id)
            if (!res.success) eventBus.emit('notification', { title: 'Error', message: res.error ?? 'Failed to delete project', type: 'error' })
        },
    })
}

// ── Version management ────────────────────────────────────────────────────────

async function openEdit(project: MarketplaceProject, tab: EditTab = 'versions') {
    activeProject.value = project
    editTab.value = tab
    view.value = 'edit'
    if (tab === 'versions') await store.fetchMyVersions(project.id)
}

async function switchEditTab(tab: string) {
    editTab.value = tab as EditTab
    if (tab === 'versions' && activeProject.value) await store.fetchMyVersions(activeProject.value.id)
}

function confirmDeleteVersion(ver: MarketplaceVersion) {
    eventBus.emit('modal:pending', {
        label: `Delete version ${ver.version_number}?`,
        saveLabel: t('appdiscover.deleteConfirm'),
        cancelLabel: t('common.cancel'),
        onConfirm: async () => {
            const res = await store.deleteVersion(ver.id)
            if (!res.success) eventBus.emit('notification', { title: 'Error', message: res.error ?? 'Failed to delete version', type: 'error' })
        },
    })
}

function startEditVersion(version: MarketplaceVersion) {
    activeVersion.value = version
    editType.value      = version.version_type
    editChangelog.value = version.changelog
    editGameVers.value  = version.compatible_game_versions.join(', ')
    view.value = 'edit-version'
}

async function handleSaveVersionMeta() {
    if (!activeVersion.value) return
    savingVersion.value = true
    const res = await store.updateVersionMeta(activeVersion.value.id, {
        version_type:             editType.value,
        changelog:                editChangelog.value,
        compatible_game_versions: editGameVers.value.split(',').map(s => s.trim()).filter(Boolean),
    })
    savingVersion.value = false
    if (!res.success) {
        eventBus.emit('notification', { title: 'Error', message: res.error ?? 'Failed to save', type: 'error' })
    } else {
        activeVersion.value = null
        view.value = 'edit'
        editTab.value = 'versions'
    }
}

// ── Navigation ────────────────────────────────────────────────────────────────

function backToList() {
    view.value = 'list'
    activeProject.value = null
    activeVersion.value = null
    store.fetchMyProjects()
}

function backToVersionsTab() {
    view.value = 'edit'
    editTab.value = 'versions'
    activeVersion.value = null
}
</script>

<template>
    <div class="my-plugins">

        <!-- ── Project list ─────────────────────────────── -->
        <template v-if="view === 'list'">
            <div class="list-header">
                <span class="creation-text">{{ t('appdiscover.creation') }}</span>
                <eButton size="half" :label="t('appdiscover.createProject')" @click="view = 'create'" />
            </div>

            <div v-if="store.loadingMyProjects" class="empty-state">{{ t('components.loading') }}</div>
            <div v-else-if="store.myProjects.length === 0" class="empty-state">{{ t('appdiscover.myPluginsEmpty') }}</div>

            <div v-else class="item-list">
                <div v-for="project in store.myProjects" :key="project.id" class="item-row">
                    <div class="item-info">
                        <span class="item-name">{{ project.name }}</span>
                        <span class="item-meta">{{ formatDate(project.updated_at) }}</span>
                        <eBadge
                            :label="modStatusLabel(project.moderation_status)"
                            :color="MOD_COLORS[project.moderation_status]"
                            :dot="false"
                        />
                    </div>

                    <div class="item-actions">
                        <!-- Rejected: show reason link + resubmit -->
                        <template v-if="project.moderation_status === 'rejected'">
                            <eButton size="half" label="View Reason"
                                @click="showRejectionReason('project', project.id)" />
                            <eButton size="half" label="Resubmit"
                                :systemState="submittingId === project.id ? 'processing' : 'idle'"
                                @click="handleSubmitForReview('project', project.id)" />
                        </template>
                        <!-- Draft / withdrawn: submit for review -->
                        <template v-else-if="project.moderation_status === 'draft' || project.moderation_status === 'withdrawn'">
                            <eButton size="half" label="Submit for Review"
                                :systemState="submittingId === project.id ? 'processing' : 'idle'"
                                @click="handleSubmitForReview('project', project.id)" />
                        </template>
                        <!-- Pending review: no publish action -->
                        <template v-else-if="project.moderation_status === 'pending_review'">
                            <span class="item-meta">Awaiting review</span>
                        </template>
                        <!-- Approved: visibility toggle -->
                        <template v-else>
                            <eButton
                                size="half"
                                :label="project.visibility ? t('appdiscover.unpublish') : t('appdiscover.publish')"
                                :systemState="togglingId === project.id ? 'processing' : 'idle'"
                                @click="handleToggleVisibility(project)"
                            />
                        </template>
                        <eButton size="slim" icon="settings" @click="openEdit(project)" />
                        <eButton size="slim" icon="delete"   @click="confirmDeleteProject(project)" />
                    </div>
                </div>
            </div>
        </template>

        <!-- ── Edit view: versions + metadata tabs ──────── -->
        <template v-else-if="view === 'edit' && activeProject">
            <div class="sub-header">
                <button class="back-btn" @click="backToList">← {{ t('appdiscover.back') }}</button>
                <span class="sub-title">{{ activeProject.name }}</span>
                <eSwitch :options="editTabOptions" v-model="editTab" @update:model-value="switchEditTab" />
            </div>

            <!-- Versions tab -->
            <template v-if="editTab === 'versions'">
                <div class="tab-toolbar">
                    <eButton size="half" :label="t('appdiscover.uploadVersion')" @click="view = 'new-version'" />
                </div>

                <div v-if="store.loadingMyVersions" class="empty-state">{{ t('components.loading') }}</div>
                <div v-else-if="store.myVersions.length === 0" class="empty-state">{{ t('appdiscover.noVersions') }}</div>

                <div v-else class="item-list">
                    <div v-for="ver in store.myVersions" :key="ver.id" class="item-row">
                        <div class="item-info">
                            <span class="item-name">{{ ver.version_number }}</span>
                            <eBadge :label="t(`appdiscover.versionType.${ver.version_type}`)" :color="versionColor(ver.version_type)" />
                            <eBadge
                                :label="modStatusLabel(ver.moderation_status)"
                                :color="MOD_COLORS[ver.moderation_status]"
                                :dot="false"
                            />
                            <span class="item-meta">{{ formatDate(ver.created_at) }}</span>
                            <span class="item-meta">{{ formatSize(ver.file_size) }}</span>
                            <span class="item-meta">{{ ver.download_count }} {{ t('appdiscover.downloads') }}</span>
                            <eBadge v-if="!ver.asset_key" label="no file" :dot="false" />
                        </div>
                        <div class="item-actions">
                            <template v-if="ver.moderation_status === 'rejected'">
                                <eButton size="half" label="View Reason"
                                    @click="showRejectionReason('version', ver.id)" />
                                <eButton size="half" label="Resubmit" :disabled="!ver.asset_key"
                                    :systemState="submittingId === ver.id ? 'processing' : 'idle'"
                                    @click="handleSubmitForReview('version', ver.id)" />
                            </template>
                            <template v-else-if="ver.moderation_status === 'draft' && ver.asset_key">
                                <eButton size="half" label="Submit for Review"
                                    :systemState="submittingId === ver.id ? 'processing' : 'idle'"
                                    @click="handleSubmitForReview('version', ver.id)" />
                            </template>
                            <eButton size="slim" icon="settings" @click="startEditVersion(ver)" />
                            <eButton size="slim" icon="delete"   @click="confirmDeleteVersion(ver)" />
                        </div>
                    </div>
                </div>
            </template>

            <!-- Metadata tab -->
            <template v-else>
                <MarketplaceUploadProject
                    :editProject="activeProject"
                    @done="editTab = 'versions'"
                    @cancel="backToList"
                />
            </template>
        </template>

        <!-- ── Edit version metadata ─────────────────────── -->
        <template v-else-if="view === 'edit-version' && activeVersion">
            <div class="sub-header">
                <button class="back-btn" @click="backToVersionsTab">← {{ t('appdiscover.back') }}</button>
                <span class="sub-title">{{ activeVersion.version_number }}</span>
            </div>

            <div class="edit-version-form">
                <div class="form-row">
                    <span class="field-label">{{ t('appdiscover.form.versionType') }}</span>
                    <div class="type-picker">
                        <button
                            v-for="opt in (['alpha', 'beta', 'release'] as const)"
                            :key="opt"
                            class="type-btn"
                            :class="{ active: editType === opt }"
                            @click="editType = opt"
                        >
                            <eBadge
                                :label="t(`appdiscover.versionType.${opt}`)"
                                :color="editType === opt ? versionColor(opt) : undefined"
                            />
                        </button>
                    </div>
                </div>

                <div class="form-row form-row--col">
                    <span class="field-label">{{ t('appdiscover.form.changelog') }}</span>
                    <textarea v-model="editChangelog" class="md-textarea" rows="6"
                        :placeholder="t('appdiscover.form.changelog')" />
                </div>

                <div class="form-row">
                    <span class="field-label">{{ t('appdiscover.form.gameVersions') }}</span>
                    <eInputField label="e.g. 1.0, 1.1" v-model="editGameVers" size="full" />
                </div>

                <div class="form-actions">
                    <eButton size="half" :label="t('common.cancel')" @click="backToVersionsTab" />
                    <eButton
                        size="half"
                        :label="t('appdiscover.form.save')"
                        :systemState="savingVersion ? 'processing' : 'idle'"
                        @click="handleSaveVersionMeta"
                    />
                </div>
            </div>
        </template>

        <!-- ── Create project ────────────────────────────── -->
        <template v-else-if="view === 'create'">
            <MarketplaceUploadProject @done="backToList" @cancel="view = 'list'" />
        </template>

        <!-- ── New version ───────────────────────────────── -->
        <template v-else-if="view === 'new-version' && activeProject">
            <MarketplaceUploadVersion :project="activeProject" @done="backToVersionsTab" @cancel="backToVersionsTab" />
        </template>

    </div>
</template>

<style scoped>

.creation-text {
    font-family: var(--font-primary);
    font-size: var(--main-font-size-3);
    color: var(--accent-200);
}

.my-plugins {
    display: flex;
    flex-direction: column;
    gap: 0;
    flex: 1;
    min-height: 0;
    overflow-y: auto;
}

.list-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-3) var(--space-4);
    border-bottom: 1px solid rgba(255,255,255,0.06);
    flex-shrink: 0;
}

.sub-header {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    border-bottom: 1px solid rgba(255,255,255,0.06);
    flex-shrink: 0;
}

.back-btn {
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    font-family: var(--font-primary);
    font-size: var(--main-font-size-4);
    color: var(--accent-200);
    flex-shrink: 0;
}
.back-btn:hover { opacity: 0.7; }

.sub-title {
    flex: 1;
    font-family: var(--font-primary);
    font-size: var(--main-font-size-4);
    font-weight: var(--font-weight-2);
    color: var(--text-main);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
}

.tab-toolbar {
    display: flex;
    justify-content: flex-end;
    padding: var(--space-2) var(--space-4);
    border-bottom: 1px solid rgba(255,255,255,0.04);
    flex-shrink: 0;
}

.empty-state {
    padding: var(--space-6) var(--space-4);
    font-family: var(--font-primary);
    font-size: var(--main-font-size-4);
    color: var(--text-muted);
    text-align: center;
}

.item-list { display: flex; flex-direction: column; }

.item-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-2) var(--space-4);
    border-bottom: 1px solid rgba(255,255,255,0.04);
    min-height: 40px;
}
.item-row:last-child { border-bottom: none; }

.item-info {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
    flex: 1;
    overflow: hidden;
}

.item-name {
    font-family: var(--font-primary);
    font-size: var(--main-font-size-4);
    font-weight: var(--font-weight-2);
    color: var(--text-main);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex-shrink: 1;
    min-width: 0;
}

.item-meta {
    font-family: var(--font-microcopy);
    font-size: var(--main-font-size-4);
    color: var(--text-muted);
    white-space: nowrap;
    flex-shrink: 0;
}

.item-actions {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-shrink: 0;
}

/* Edit version form */
.edit-version-form {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-4);
}

.form-row {
    display: flex;
    align-items: center;
    gap: var(--space-3);
}
.form-row--col { flex-direction: column; align-items: flex-start; }

.field-label {
    font-family: var(--font-primary);
    font-size: var(--main-font-size-4);
    color: var(--text-muted);
    white-space: nowrap;
    flex-shrink: 0;
    min-width: 120px;
}

.type-picker { display: flex; gap: var(--space-1); }
.type-btn { background: none; border: none; padding: 0; cursor: pointer; opacity: 0.4; transition: opacity 0.15s; }
.type-btn.active { opacity: 1; }

.md-textarea {
    width: 100%;
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.08);
    color: var(--text-main);
    font-family: var(--font-microcopy);
    font-size: var(--main-font-size-4);
    padding: var(--space-2);
    resize: vertical;
    outline: none;
    box-sizing: border-box;
}
.md-textarea:focus { border-color: var(--accent-200); }

.form-actions {
    display: flex;
    gap: var(--space-2);
    justify-content: flex-end;
    padding-top: var(--space-2);
}
</style>
