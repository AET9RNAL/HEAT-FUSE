<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useCreatorStore } from '../../stores/creator'
import { useI18n } from '../../composables/useI18n'
import { eventBus } from '../../events/eventBus'
import { errorText } from '../../utils/registry-api'
import BuildForm, { type BuildDraft } from './BuildForm.vue'
import eButton from '../inputs/eButton.vue'
import Icons from '../ui/Icons.vue'

const props = defineProps<{ projectId: string; projectName: string; fileId: string }>()
const emit = defineEmits<{ back: [] }>()

const creator = useCreatorStore()
const { t } = useI18n()

const draft = ref<BuildDraft | null>(null)
const saved = ref('')
const saving = ref(false)

function snapshot(d: BuildDraft) {
    return JSON.stringify([d.channel, d.changelog, d.gameVersions, d.deps.map(x => [x.project_id, x.file_id, x.relation])])
}

onMounted(async () => {
    const f = await creator.getFile(props.fileId)
    if (!f) return
    draft.value = {
        pkg: null, file: f, channel: f.channel, changelog: f.changelog, gameVersions: [...f.game_versions],
        deps: (f.dependencies ?? []).map(d => ({
            project_id: d.project_id, file_id: d.file_id, relation: d.relation, name: d.name, slug: d.slug,
            plugin_id: d.plugin_id, icon_key: d.icon_key, file_version: d.file_version,
        })),
    }
    saved.value = snapshot(draft.value)
})

const dirty = computed(() => !!draft.value && snapshot(draft.value) !== saved.value)

async function copy(text: string) {
    await navigator.clipboard.writeText(text)
    eventBus.emit('notification', { message: t('registry.copied', { value: text }) })
}

async function save() {
    const d = draft.value
    if (!d?.file) return
    saving.value = true
    try {
        await creator.updateFile(d.file.id, { channel: d.channel, changelog: d.changelog, gameVersions: d.gameVersions })
        await creator.setDependencies(d.file.id, d.deps)
        saved.value = snapshot(d)
        eventBus.emit('notification', { message: t('registry.version.saved'), type: 'success' })
    } catch (err) {
        eventBus.emit('notification', { title: t('registry.wizard.errorTitle'), message: errorText(t, err), type: 'error' })
    } finally {
        saving.value = false
    }
}
</script>

<template>
    <div class="ve">
        <div class="mp-breadcrumb">
            <button class="mp-back" :aria-label="t('appdiscover.back')" @click="emit('back')"><Icons kind="arrow-left" size="normal" /></button>
            <button class="mp-crumb mp-crumb--link" @click="emit('back')">{{ projectName }}</button>
            <span class="mp-crumb">/</span>
            <span class="mp-crumb mp-crumb--current">{{ draft?.file?.version ?? fileId }}</span>
        </div>

        <div class="mp-tagline">
            <span class="mp-tag-key">REF</span>
            <button v-tip="t('registry.copyTip')" class="mp-tag" @click="copy(`${projectId}:${fileId}`)">{{ projectId }}:{{ fileId }}</button>
        </div>

        <div class="ve-body mp-scroll">
            <BuildForm v-if="draft" v-model="draft" :project-id="projectId" locked />
            <div v-else class="mp-empty">{{ t('components.loading') }}</div>
        </div>

        <div class="ve-foot">
            <span class="mp-label" :class="{ 'mp-label--warn': dirty }">■ {{ dirty ? t('registry.profile.unsaved') : t('registry.profile.allSaved') }}</span>
            <div class="ve-actions">
                <eButton size="half" variant="tertiary" :label="t('appdiscover.back')" @click="emit('back')" />
                <eButton size="half" :label="t('registry.profile.save')" :disabled="!dirty" :system-state="saving ? 'processing' : 'idle'" @click="save" />
            </div>
        </div>
    </div>
</template>

<style scoped src="./mp.css"></style>
<style scoped>
.ve {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    flex: 1;
    min-height: 0;
}

.ve-body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    display: flex;
}

.ve-foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-top: var(--space-3);
    border-top: 1px solid var(--base-600);
    flex-shrink: 0;
}

.ve-actions {
    display: flex;
    gap: var(--space-2);
}
</style>
