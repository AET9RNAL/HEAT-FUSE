<script setup lang="ts">
import { ref } from 'vue'
import { useMarketplaceStore } from '../stores/marketplace'
import { useI18n } from '../composables/useI18n'
import { eventBus } from '../events/eventBus'
import eButton from './eButton.vue'
import eInputField from './eInputField.vue'
import eBadge from './eBadge.vue'
import type { MarketplaceProject } from '../stores/marketplace'

const props = defineProps<{ project: MarketplaceProject }>()
const emit = defineEmits<{ done: []; cancel: [] }>()

const store = useMarketplaceStore()
const { t } = useI18n()

const versionNumber      = ref('')
const versionType        = ref<'alpha' | 'beta' | 'release'>('release')
const changelog          = ref('')
const gameVersionsRaw    = ref('')
const fuseVersionsRaw    = ref('')
const fuseFile           = ref<File | null>(null)
const saving             = ref(false)

function handleFileChange(e: Event) {
    const input = e.target as HTMLInputElement
    fuseFile.value = input.files?.[0] ?? null
}

function parseVersionList(raw: string): string[] {
    return raw.split(',').map(s => s.trim()).filter(Boolean)
}

async function computeSha256(file: File): Promise<string> {
    const buf = await file.arrayBuffer()
    const hash = await crypto.subtle.digest('SHA-256', buf)
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')
}

async function handleSave() {
    if (!versionNumber.value.trim() || !fuseFile.value) return
    saving.value = true
    try {
        // 1. Create version row
        const verRes = await store.createVersion({
            project_id: props.project.id,
            version_number: versionNumber.value.trim(),
            version_type: versionType.value,
            changelog: changelog.value,
            compatible_game_versions: parseVersionList(gameVersionsRaw.value),
            compatible_fuse_versions: parseVersionList(fuseVersionsRaw.value),
        })
        if (!verRes.success || !verRes.version) throw new Error(verRes.error)

        // 2. Get presigned upload URL
        const urlRes = await store.getUploadUrl({
            type: 'plugin',
            project_id: props.project.id,
            version_id: verRes.version.id,
            filename: fuseFile.value.name,
            content_type: 'application/zip',
        })
        if (!urlRes.success || !urlRes.upload_url) throw new Error(urlRes.error)

        // 3. Upload to R2 via main process (CSP blocks renderer → R2 direct)
        const fileBuffer = await fuseFile.value.arrayBuffer()
        const uploadRes = await window.pluginsAPI.uploadToR2(urlRes.upload_url, fileBuffer, 'application/zip')
        if (!uploadRes.success) throw new Error(uploadRes.error ?? 'Upload failed')

        // 4. Compute checksum + finalize
        const checksum = await computeSha256(fuseFile.value)
        const finalRes = await store.finalizeVersion({
            version_id: verRes.version.id,
            object_key: urlRes.object_key!,
            file_name: fuseFile.value.name,
            file_size: fuseFile.value.size,
            checksum,
        })
        if (!finalRes.success) throw new Error(finalRes.error)

        eventBus.emit('notification', { message: t('appdiscover.notify.versionFinalized') })
        emit('done')
    } catch (err: any) {
        eventBus.emit('notification', { title: 'Error', message: err.message ?? 'Upload failed' })
    } finally {
        saving.value = false
    }
}
</script>

<template>
    <div class="form-panel">
        <div class="form-row">
            <span class="field-label">{{ t('appdiscover.form.versionNumber') }}</span>
            <eInputField :label="t('appdiscover.form.versionNumber')" v-model="versionNumber" size="half" />
        </div>

        <div class="form-row">
            <span class="field-label">{{ t('appdiscover.form.versionType') }}</span>
            <div class="type-picker">
                <button
                    v-for="opt in (['alpha', 'beta', 'release'] as const)"
                    :key="opt"
                    class="type-btn"
                    :class="{ active: versionType === opt }"
                    @click="versionType = opt"
                >
                    <eBadge
                        :label="t(`appdiscover.versionType.${opt}`)"
                        :color="versionType === opt
                            ? (opt === 'alpha' ? '#fde68a' : opt === 'beta' ? '#7dd3fc' : '#84ffb1')
                            : undefined"
                    />
                </button>
            </div>
        </div>

        <div class="form-row">
            <span class="field-label">{{ t('appdiscover.form.gameVersions') }}</span>
            <eInputField :label="'e.g. 1.0, 1.1'" v-model="gameVersionsRaw" size="full" />
        </div>

        <div class="form-row">
            <span class="field-label">{{ t('appdiscover.form.fuseVersions') }}</span>
            <eInputField :label="'e.g. 0.6'" v-model="fuseVersionsRaw" size="full" />
        </div>

        <div class="form-row form-row--col">
            <span class="field-label">{{ t('appdiscover.form.changelog') }}</span>
            <textarea class="md-textarea" v-model="changelog" rows="5"
                :placeholder="t('appdiscover.form.changelog')" />
        </div>

        <div class="form-row">
            <span class="field-label">{{ t('appdiscover.form.upload') }}</span>
            <label class="file-label">
                <span>{{ fuseFile ? fuseFile.name : t('appdiscover.form.noFileSelected') }}</span>
                <input type="file" accept=".fuse" class="file-input" @change="handleFileChange" />
            </label>
        </div>

        <div class="form-actions">
            <eButton size="half" :label="t('appdiscover.form.cancel')" @click="emit('cancel')" />
            <eButton
                size="half"
                :label="t('appdiscover.form.save')"
                :systemState="saving ? 'processing' : 'idle'"
                :disabled="!versionNumber.trim() || !fuseFile"
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
    min-width: 140px;
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

.type-picker { display: flex; gap: var(--space-1); }
.type-btn {
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    opacity: 0.4;
    transition: opacity 0.15s;
}
.type-btn.active { opacity: 1; }

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
