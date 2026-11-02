<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { AnimatePresence, motion } from 'motion-v'
import { useCreatorStore, type DependencyDraft } from '../../stores/creator'
import { useI18n } from '../../composables/useI18n'
import { compareVersions, type FoundProject, type RegistryFile, type Relation } from '../../utils/registry-api'
import ProjectIcon from './ProjectIcon.vue'
import eButton from '../inputs/eButton.vue'
import eInputField, { type FieldSuggestion } from '../inputs/eInputField.vue'
import eSelect from '../inputs/eSelect.vue'
import Icons from '../ui/Icons.vue'

const props = defineProps<{ open: boolean; selfProjectId: string | null; taken: string[] }>()
const emit = defineEmits<{ add: [dep: DependencyDraft]; close: [] }>()

const creator = useCreatorStore()
const { t } = useI18n()

const query = ref('')
const results = ref<FoundProject[]>([])
const picked = ref<FoundProject | null>(null)
const files = ref<RegistryFile[]>([])
const fileId = ref<string>('')
const relation = ref<Relation>('required')
const searching = ref(false)

// The dialog stays mounted for its exit animation, so each open starts from empty fields.
watch(() => props.open, open => {
    if (!open) return
    query.value = ''
    results.value = []
    picked.value = null
    files.value = []
    fileId.value = ''
    relation.value = 'required'
})

let timer: ReturnType<typeof setTimeout> | null = null
watch(query, q => {
    if (timer) clearTimeout(timer)
    if (picked.value && q === picked.value.name) return
    picked.value = null
    if (q.trim().length < 2) { results.value = []; return }
    timer = setTimeout(async () => {
        searching.value = true
        try { results.value = (await creator.findProjects(q.trim())).filter(p => p.id !== props.selfProjectId) }
        catch { results.value = [] }
        finally { searching.value = false }
    }, 200)
})

const suggestions = computed<FieldSuggestion[]>(() => results.value.map(p => ({
    value: p.id, label: p.name, hint: `${p.id} · ${p.owner ?? '—'}`,
})))

function byId(id: string) { return results.value.find(p => p.id === id) }

function onSelect(s: FieldSuggestion) {
    const p = byId(s.value)
    if (p) void pick(p)
}

const relationOptions = computed(() => (['required', 'optional', 'incompatible'] as const).map(r => ({
    value: r, label: t(`registry.relation.${r}`),
})))

async function pick(p: FoundProject) {
    picked.value = p
    query.value = p.name
    results.value = []
    fileId.value = ''
    files.value = (await creator.projectFiles(p.id).catch(() => []))
        .filter(f => f.status === 'approved')
        .sort((a, b) => compareVersions(b.version, a.version))
}

const versionOptions = computed(() => [
    { value: '', label: t('registry.dep.anyVersion') },
    ...files.value.map(f => ({ value: f.id, label: `${f.version} · ${t(`registry.channel.${f.channel}`)}` })),
])

const duplicate = computed(() => !!picked.value && props.taken.includes(picked.value.id))

function add() {
    const p = picked.value
    if (!p || duplicate.value) return
    emit('add', {
        project_id: p.id, file_id: fileId.value || null, relation: relation.value,
        name: p.name, slug: p.slug, plugin_id: p.plugin_id, icon_key: p.icon_key,
        file_version: files.value.find(f => f.id === fileId.value)?.version ?? null,
    })
}
</script>

<template>
    <Teleport to="body">
        <AnimatePresence>
        <motion.div
            v-if="open"
            key="add-dependency"
            class="ad-backdrop"
            :initial="{ opacity: 0 }"
            :animate="{ opacity: 1 }"
            :exit="{ opacity: 0 }"
            :transition="{ duration: 0.15 }"
            @mousedown.self="emit('close')"
        >
            <motion.div
                class="ad-panel mp-panel"
                :initial="{ opacity: 0, scale: 0.96 }"
                :animate="{ opacity: 1, scale: 1 }"
                :exit="{ opacity: 0, scale: 0.96 }"
                :transition="{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }"
            >
                <div class="ad-header">
                    <span class="ad-title">{{ t('registry.dep.addTitle') }}</span>
                    <button class="ad-close" @click="emit('close')"><Icons kind="cross" size="normal" /></button>
                </div>

                <div class="ad-body">
                    <label class="mp-field-label">{{ t('registry.dep.project') }}<span class="req">*</span></label>
                    <div class="ad-search">
                        <eInputField
                            v-model="query"
                            :label="t('registry.dep.projectHint')"
                            size="flex"
                            :suggestions="suggestions"
                            autofocus
                            @select="onSelect"
                        >
                            <template #suggestion="{ item }">
                                <ProjectIcon :icon-key="byId(item.value)?.icon_key" :name="item.label" :size="28" />
                                <span class="ad-name">{{ item.label }}</span>
                                <span class="mp-label">{{ item.hint }}</span>
                            </template>
                        </eInputField>
                    </div>
                    <span v-if="picked" class="mp-label mp-label--accent">ID {{ picked.id }} · {{ picked.plugin_id ?? '—' }}</span>
                    <span v-else-if="searching" class="mp-label">{{ t('components.loading') }}</span>
                    <span v-else class="mp-label">{{ t('registry.dep.projectSub') }}</span>
                    <span v-if="duplicate" class="mp-label mp-label--error">{{ t('registry.dep.duplicate') }}</span>

                    <label class="mp-field-label">{{ t('registry.dep.version') }}</label>
                    <eSelect v-model="fileId" :options="versionOptions" :disabled="!picked" />

                    <label class="mp-field-label">{{ t('registry.dep.relation') }}</label>
                    <eSelect v-model="relation" :options="relationOptions" />
                    <span class="mp-label">{{ t(`registry.dep.relationHint.${relation}`) }}</span>
                </div>

                <div class="ad-footer">
                    <eButton size="half" variant="secondary" :label="t('common.cancel')" @click="emit('close')" />
                    <eButton size="half" :label="t('registry.dep.add')" :disabled="!picked || duplicate" @click="add" />
                </div>
            </motion.div>
        </motion.div>
        </AnimatePresence>
    </Teleport>
</template>

<style scoped src="./mp.css"></style>
<style scoped>
.ad-backdrop {
    position: fixed;
    inset: 48px 0 0 0;
    z-index: 10001;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.6);
}
.ad-panel {
    width: 460px;
    display: flex;
    flex-direction: column;
    background: hsla(142, 10%, 4%, 0.96);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
}

.ad-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-3) var(--space-4);
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.ad-title {
    font-family: var(--font-primary);
    font-size: var(--main-font-size-3);
    font-weight: var(--font-weight-2);
    color: var(--text-main);
}

.ad-close {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--text-muted);
}

.ad-body {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-4);
}

.ad-search {
    display: flex;
}

.ad-name {
    flex: 1;
    min-width: 0;
    font-family: var(--font-primary);
    font-size: var(--main-font-size-4);
    color: var(--text-main);
}

.ad-footer {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-4);
    border-top: 1px solid rgba(255, 255, 255, 0.06);
}
</style>
