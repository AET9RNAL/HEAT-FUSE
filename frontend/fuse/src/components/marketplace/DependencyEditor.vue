<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useCreatorStore, type DependencyDraft } from '../../stores/creator'
import { useI18n } from '../../composables/useI18n'
import { compareVersions, type RegistryFile, type Relation } from '../../utils/registry-api'
import ProjectIcon from './ProjectIcon.vue'
import AddDependencyDialog from './AddDependencyDialog.vue'
import HudFrame from './HudFrame.vue'
import eSelect from '../inputs/eSelect.vue'
import Icons from '../ui/Icons.vue'

const props = withDefaults(defineProps<{
    modelValue: DependencyDraft[]
    selfProjectId: string | null
    /** The plugin IDs the manifest requires. */
    manifestRequires?: string[]
    disabled?: boolean
}>(), { manifestRequires: () => [], disabled: false })
const emit = defineEmits<{ 'update:modelValue': [value: DependencyDraft[]] }>()

const creator = useCreatorStore()
const { t } = useI18n()
const dialog = ref(false)
const importing = ref(false)

// The runtime skips a plugin whose manifest dependency is missing, so a Required row must cover each one.
const uncovered = computed(() => props.manifestRequires.filter(pid =>
    !props.modelValue.some(d => d.relation === 'required' && d.plugin_id?.toLowerCase() === pid.toLowerCase())))

function remove(i: number) {
    emit('update:modelValue', props.modelValue.filter((_, idx) => idx !== i))
}

// ── Row edits: relation and version, for rows from the dialog and from the manifest alike ──
function patchRow(i: number, p: Partial<DependencyDraft>) {
    emit('update:modelValue', props.modelValue.map((d, idx) => idx === i ? { ...d, ...p } : d))
}

const RELATIONS = ['required', 'optional', 'incompatible'] as const
const relationOptions = computed(() => RELATIONS.map(r => ({ value: r, label: t(`registry.relation.${r}`) })))

function setRelation(i: number, value: unknown) {
    const relation = RELATIONS.find(r => r === value)
    if (relation) patchRow(i, { relation })
}

// Approved files of each dependency project, newest first. Loaded once per project.
const filesByProject = ref<Record<string, RegistryFile[]>>({})

watch(() => props.modelValue.map(d => d.project_id), async ids => {
    if (props.disabled) return
    for (const id of ids) {
        if (filesByProject.value[id]) continue
        filesByProject.value[id] = []
        const list = await creator.projectFiles(id).catch(() => [] as RegistryFile[])
        filesByProject.value[id] = list
            .filter(f => f.status === 'approved')
            .sort((a, b) => compareVersions(b.version, a.version))
    }
}, { immediate: true })

function versionOptions(d: DependencyDraft) {
    const files = filesByProject.value[d.project_id] ?? []
    const opts = [
        { value: '', label: t('registry.dep.anyVersion') },
        ...files.map(f => ({ value: f.id, label: `${f.version} · ${t(`registry.channel.${f.channel}`)}` })),
    ]
    // A pinned file shows its version while the list loads.
    if (d.file_id && !files.some(f => f.id === d.file_id)) opts.push({ value: d.file_id, label: d.file_version ?? d.file_id })
    return opts
}

function setVersion(i: number, fileId: unknown) {
    const d = props.modelValue[i]
    const id = typeof fileId === 'string' && fileId ? fileId : null
    const file = (filesByProject.value[d.project_id] ?? []).find(f => f.id === id)
    patchRow(i, { file_id: id, file_version: id ? file?.version ?? d.file_version : null })
}

const RELATION_COLORS: Record<Relation, string> = {
    required: 'var(--accent-200)',
    optional: '#7dd3fc',
    incompatible: 'var(--error-highlight)',
}

function onAdd(dep: DependencyDraft) {
    emit('update:modelValue', [...props.modelValue, dep])
    dialog.value = false
}

async function addFromManifest() {
    importing.value = true
    try {
        const next = [...props.modelValue]
        for (const pid of uncovered.value) {
            const hit = (await creator.findProjects(pid)).find(p => p.plugin_id?.toLowerCase() === pid.toLowerCase())
            if (!hit || next.some(d => d.project_id === hit.id)) continue
            next.push({
                project_id: hit.id, file_id: null, relation: 'required', name: hit.name, slug: hit.slug,
                plugin_id: hit.plugin_id, icon_key: hit.icon_key, file_version: null,
            })
        }
        emit('update:modelValue', next)
    } finally {
        importing.value = false
    }
}
</script>

<template>
    <HudFrame :head="34" :ticks="false" :delay="0.12">
        <div class="mp-band">
            <span class="mp-band-title">{{ t('registry.dep.title') }}</span>
            <span class="mp-band-code">{{ t('registry.dep.rows', { count: modelValue.length }) }}</span>
        </div>

        <div class="mp-frame-body dep">
            <p v-if="!modelValue.length" class="mp-text dep-empty">{{ t('registry.dep.empty') }}</p>
            <div
                v-for="(d, i) in modelValue"
                :key="d.project_id"
                class="dep-row"
                :style="{ '--rel': RELATION_COLORS[d.relation] }"
            >
                <div class="dep-head">
                    <ProjectIcon :icon-key="d.icon_key" :name="d.name" :size="36" />
                    <div class="dep-info">
                        <span v-truncate-title class="dep-name">{{ d.name }}</span>
                        <span class="mp-label">{{ d.project_id }} · {{ d.plugin_id ?? '—' }}</span>
                    </div>
                    <span v-if="disabled" class="mp-chip" :class="{ 'mp-chip--live': d.relation === 'required', 'mp-chip--info': d.relation === 'optional', 'mp-chip--error': d.relation === 'incompatible' }">
                        {{ t(`registry.relation.${d.relation}`) }} · {{ d.file_version ?? t('registry.dep.anyVersion') }}
                    </span>
                    <button v-else v-tip="t('registry.dep.remove')" class="dep-remove" @click="remove(i)">
                        <Icons kind="cross" size="normal" />
                    </button>
                </div>

                <div v-if="!disabled" class="dep-edit">
                    <eSelect
                        :model-value="d.relation"
                        :options="relationOptions"
                        @update:model-value="setRelation(i, $event)"
                    />
                    <eSelect
                        :model-value="d.file_id ?? ''"
                        :options="versionOptions(d)"
                        @update:model-value="setVersion(i, $event)"
                    />
                </div>
            </div>

            <p v-if="uncovered.length" class="dep-warn">
                <Icons kind="warning" size="normal" />
                {{ t('registry.dep.uncovered', { ids: uncovered.join(', ') }) }}
            </p>

            <div v-if="!disabled" class="dep-actions">
                <button class="mp-link" @click="dialog = true">{{ t('registry.dep.add') }}</button>
                <button v-if="uncovered.length" class="mp-link" :disabled="importing" @click="addFromManifest">{{ t('registry.dep.fromManifest') }}</button>
            </div>
        </div>

        <AddDependencyDialog
            :open="dialog"
            :self-project-id="selfProjectId"
            :taken="modelValue.map(d => d.project_id)"
            @add="onAdd"
            @close="dialog = false"
        />
    </HudFrame>
</template>

<style scoped src="./mp.css"></style>
<style scoped>
.dep {
    gap: var(--space-2);
}

.dep-empty {
    padding: var(--space-2) 0;
}

.dep-row {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-2) 0 var(--space-2) var(--space-3);
    border-bottom: 1px dashed rgba(255, 255, 255, 0.08);
}

.dep-row::before {
    content: '';
    position: absolute;
    top: var(--space-2);
    bottom: var(--space-2);
    left: 0;
    width: 2px;
    background: var(--rel);
}

.dep-head {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    min-width: 0;
}

.dep-edit {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: var(--space-2);
}

.dep-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
}

.dep-name {
    font-family: var(--font-primary);
    font-size: var(--main-font-size-4);
    font-weight: var(--font-weight-2);
    color: var(--text-main);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.dep-remove {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--text-muted);
}

.dep-remove:hover {
    color: var(--error-highlight);
}

.dep-warn {
    display: flex;
    gap: var(--space-2);
    align-items: flex-start;
    margin: 0;
    font-family: var(--font-microcopy);
    font-size: 11px;
    text-transform: uppercase;
    color: var(--accent-600);
}

.dep-actions {
    display: flex;
    justify-content: space-between;
    padding-top: var(--space-1);
}
</style>
