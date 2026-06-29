<script setup lang="ts">
import { ref, computed } from 'vue'
import { useMarketplaceStore } from '../stores/marketplace'
import { useI18n } from '../composables/useI18n'
import { eventBus } from '../events/eventBus'
import eButton from './eButton.vue'
import eInputField from './eInputField.vue'
import eBadge from './eBadge.vue'
import type { MarketplaceProject } from '../stores/marketplace'

const props = defineProps<{
    editProject?: MarketplaceProject | null
}>()

const emit = defineEmits<{
    done: []
    cancel: []
}>()

const store = useMarketplaceStore()
const { t } = useI18n()

const name        = ref(props.editProject?.name ?? '')
const summary     = ref(props.editProject?.summary ?? '')
const description = ref(props.editProject?.description ?? '')
const selectedTagIds = ref<string[]>(props.editProject?.tags.map(t => t.id) ?? [])
const iconFile    = ref<File | null>(null)
const saving      = ref(false)

const isEdit = computed(() => !!props.editProject)

function toggleTag(id: string) {
    const idx = selectedTagIds.value.indexOf(id)
    if (idx === -1) selectedTagIds.value.push(id)
    else selectedTagIds.value.splice(idx, 1)
}

function handleIconChange(e: Event) {
    const input = e.target as HTMLInputElement
    iconFile.value = input.files?.[0] ?? null
}

async function handleSave() {
    if (!name.value.trim() || !summary.value.trim()) return
    saving.value = true
    try {
        if (isEdit.value && props.editProject) {
            const res = await store.updateProject(props.editProject.id, {
                name: name.value,
                summary: summary.value,
                description: description.value,
                tagIds: selectedTagIds.value,
            })
            if (!res.success) throw new Error(res.error)
            if (iconFile.value) {
                await store.uploadIcon(props.editProject.id, iconFile.value)
            }
            eventBus.emit('notification', { message: t('appdiscover.notify.projectUpdated') })
        } else {
            const res = await store.createProject({
                name: name.value,
                summary: summary.value,
                description: description.value,
                tagIds: selectedTagIds.value,
            })
            if (!res.success || !res.project) throw new Error(res.error)
            if (iconFile.value) {
                await store.uploadIcon(res.project.id, iconFile.value)
            }
            eventBus.emit('notification', { message: t('appdiscover.notify.projectCreated') })
        }
        emit('done')
    } catch (err: any) {
        eventBus.emit('notification', { title: 'Error', message: err.message ?? 'Failed to save project' })
    } finally {
        saving.value = false
    }
}
</script>

<template>
    <div class="form-panel">
        <div class="form-row">
            <span class="field-label">{{ t('appdiscover.form.name') }}</span>
            <eInputField :label="t('appdiscover.form.name')" v-model="name" size="full" />
        </div>

        <div class="form-row">
            <span class="field-label">{{ t('appdiscover.form.summary') }}</span>
            <eInputField :label="t('appdiscover.form.summary')" v-model="summary" size="full" />
        </div>

        <div class="form-row form-row--col">
            <span class="field-label">{{ t('appdiscover.form.description') }}</span>
            <textarea class="md-textarea" v-model="description" rows="8"
                :placeholder="t('appdiscover.form.description')" />
        </div>

        <div class="form-row form-row--col">
            <span class="field-label">{{ t('appdiscover.form.tagsLabel') }}</span>
            <div class="tag-picker">
                <button
                    v-for="tag in store.tags"
                    :key="tag.id"
                    class="tag-btn"
                    :class="{ active: selectedTagIds.includes(tag.id) }"
                    @click="toggleTag(tag.id)"
                >
                    <eBadge
                        :label="tag.label"
                        :color="selectedTagIds.includes(tag.id) ? (tag.color ?? 'var(--accent-200)') : undefined"
                    />
                </button>
            </div>
        </div>

        <div class="form-row">
            <span class="field-label">{{ t('appdiscover.form.iconLabel') }}</span>
            <label class="file-label">
                <span>{{ iconFile ? iconFile.name : t('appdiscover.form.noFileSelected') }}</span>
                <input type="file" accept="image/*" class="file-input" @change="handleIconChange" />
            </label>
        </div>

        <div class="form-actions">
            <eButton size="half" :label="t('appdiscover.form.cancel')" @click="emit('cancel')" />
            <eButton
                size="half"
                :label="t('appdiscover.form.save')"
                :systemState="saving ? 'processing' : 'idle'"
                :disabled="!name.trim() || !summary.trim()"
                @click="handleSave"
            />
        </div>
    </div>
</template>

<style scoped>
.form-panel {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-4);
}

.form-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
}

.form-row--col {
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-1);
}

.field-label {
    font-family: var(--font-primary);
    font-size: var(--main-font-size-4);
    color: var(--text-muted);
    flex-shrink: 0;
}

.md-textarea {
    width: 100%;
    background: var(--black-1-a);
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

.tag-picker { display: flex; flex-wrap: wrap; gap: var(--space-1); }

.tag-btn {
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    opacity: 0.4;
    transition: opacity 0.15s;
}
.tag-btn.active { opacity: 1; }

.file-label {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    cursor: pointer;
    font-family: var(--font-primary);
    font-size: var(--main-font-size-4);
    color: var(--text-muted);
}
.file-input { display: none; }

.form-actions {
    display: flex;
    gap: var(--space-2);
    justify-content: flex-end;
    padding-top: var(--space-2);
    border-top: 1px solid rgba(255,255,255,0.06);
}
</style>
