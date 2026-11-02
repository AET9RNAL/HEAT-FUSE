<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useCreatorStore } from '../../stores/creator'
import { useI18n } from '../../composables/useI18n'
import { eventBus } from '../../events/eventBus'
import { errorText, formatBytes, formatDate } from '../../utils/registry-api'
import ProjectIcon from './ProjectIcon.vue'
import HudFrame from './HudFrame.vue'
import eButton from '../inputs/eButton.vue'
import eInputField from '../inputs/eInputField.vue'
import eProgressBar from '../ui/eProgressBar.vue'
import Icons from '../ui/Icons.vue'

// Height of the header band of each frame.
const BAND = 34

const emit = defineEmits<{ back: [] }>()

const creator = useCreatorStore()
const { t } = useI18n()

const username = ref('')
const bio = ref('')
const saving = ref(false)
const imageBusy = ref(false)

function reset() {
    username.value = creator.profile?.username ?? ''
    bio.value = creator.profile?.bio ?? ''
}
onMounted(async () => { await creator.loadProfile(); reset() })

const dirty = computed(() => username.value !== (creator.profile?.username ?? '') || bio.value !== (creator.profile?.bio ?? ''))

const nameState = ref<'ok' | 'format' | 'taken' | 'checking' | 'same'>('same')
let timer: ReturnType<typeof setTimeout> | null = null
watch(username, name => {
    if (timer) clearTimeout(timer)
    if (name === (creator.profile?.username ?? '')) { nameState.value = 'same'; return }
    if (!/^[A-Za-z0-9_]{3,24}$/.test(name)) { nameState.value = 'format'; return }
    nameState.value = 'checking'
    timer = setTimeout(async () => {
        try { nameState.value = (await creator.usernameAvailable(name)) ? 'ok' : 'taken' }
        catch { nameState.value = 'ok' }
    }, 300)
})

const canSave = computed(() => dirty.value && (nameState.value === 'ok' || nameState.value === 'same') && bio.value.length <= 160)

async function save() {
    saving.value = true
    try {
        await creator.saveProfile(username.value === (creator.profile?.username ?? '') ? null : username.value, bio.value)
        reset()
        nameState.value = 'same'
        eventBus.emit('notification', { message: t('registry.profile.saved'), type: 'success' })
    } catch (err) {
        eventBus.emit('notification', { title: t('registry.profile.title'), message: errorText(t, err), type: 'error' })
    } finally {
        saving.value = false
    }
}

async function uploadAvatar() {
    const path = await window.registryAPI.pickFile('image')
    if (!path) return
    imageBusy.value = true
    try {
        const img = await creator.inspectImage(path, 'avatar')
        if (img.problem) throw new Error(img.problem)
        await creator.uploadImage('avatar', null, img)
    } catch (err) {
        eventBus.emit('notification', { title: t('registry.profile.picture'), message: errorText(t, err), type: 'error' })
    } finally {
        imageBusy.value = false
    }
}

async function removeAvatar() {
    imageBusy.value = true
    try { await creator.removeImage('avatar', null) }
    catch (err) { eventBus.emit('notification', { title: t('registry.profile.picture'), message: errorText(t, err), type: 'error' }) }
    finally { imageBusy.value = false }
}

const usedShare = computed(() => {
    const p = creator.profile
    return p && p.storage_quota_bytes ? Math.min(1, p.storage_used_bytes / p.storage_quota_bytes) : 0
})
</script>

<template>
    <div class="pf">
        <div class="mp-breadcrumb">
            <button class="mp-back" :aria-label="t('appdiscover.back')" @click="emit('back')"><Icons kind="arrow-left" size="normal" /></button>
            <button class="mp-crumb mp-crumb--link" @click="emit('back')">{{ t('appdiscover.myPlugins') }}</button>
            <span class="mp-crumb">/</span>
            <span class="mp-crumb mp-crumb--current">{{ t('registry.profile.title') }}</span>
        </div>

        <div class="pf-body">
            <HudFrame class="pf-main" :head="BAND" :ticks="false">
                <div class="mp-band">
                    <span class="mp-band-title">{{ t('registry.profile.kicker') }}</span>
                    <span class="mp-band-code">PRF-{{ (creator.profile?.username ?? 'N3W').toUpperCase() }}</span>
                </div>
                <div class="mp-frame-body pf-main-body">
                    <div class="pf-field">
                        <label class="mp-field-label">{{ t('registry.profile.picture') }}</label>
                        <div class="pf-avatar">
                            <ProjectIcon :icon-key="creator.profile?.avatar_key" :name="username || '?'" :size="56" />
                            <div class="pf-avatar-text">
                                <div class="pf-avatar-actions">
                                    <button class="mp-link" :disabled="imageBusy" @click="uploadAvatar">{{ t('registry.profile.upload') }}</button>
                                    <button v-if="creator.profile?.avatar_key" class="mp-link" :disabled="imageBusy" @click="removeAvatar">{{ t('registry.profile.remove') }}</button>
                                </div>
                                <span class="mp-label">{{ imageBusy ? t('registry.profile.imageBusy') : t('registry.profile.rules') }}</span>
                            </div>
                        </div>
                    </div>

                    <div class="pf-field">
                        <div class="mp-hint-row">
                            <label class="mp-field-label">{{ t('registry.profile.username') }}<span class="req">*</span></label>
                            <span class="mp-label">{{ username.length }} / 24</span>
                        </div>
                        <div class="pf-row">
                            <eInputField
                                v-model="username"
                                :label="t('registry.profile.username')"
                                size="flex"
                                :maxlength="24"
                                :invalid="nameState === 'format' || nameState === 'taken'"
                            />
                        </div>
                        <div class="mp-hint-row">
                            <span class="mp-label">{{ t('registry.profile.usernameHint') }}</span>
                            <span v-if="nameState !== 'same'" class="mp-label" :class="nameState === 'ok' ? 'mp-label--accent' : nameState === 'checking' ? '' : 'mp-label--error'">
                                {{ t(`registry.profile.name.${nameState}`) }}
                            </span>
                        </div>
                    </div>

                    <div class="pf-field pf-grow">
                        <div class="mp-hint-row">
                            <label class="mp-field-label">{{ t('registry.profile.bio') }}</label>
                            <span class="mp-label">{{ bio.length }} / 160</span>
                        </div>
                        <textarea v-model="bio" class="mp-textarea pf-bio" maxlength="160" :placeholder="t('registry.profile.bioHint')" />
                        <span class="mp-label">{{ t('registry.profile.public') }}</span>
                    </div>
                </div>
            </HudFrame>

            <aside class="pf-side">
                <HudFrame :head="BAND" :ticks="false" :delay="0.06">
                    <div class="mp-band">
                        <span class="mp-band-title">{{ t('registry.profile.limits') }}</span>
                        <span class="mp-band-code">{{ Math.round(usedShare * 100) }}%</span>
                    </div>
                    <div class="mp-frame-body">
                        <div class="mp-hint-row">
                            <span class="mp-label">{{ t('registry.profile.maxFile') }}</span>
                            <span class="mp-mono pf-v">{{ formatBytes(creator.profile?.max_file_bytes) }}</span>
                        </div>
                        <div class="mp-hint-row">
                            <span class="mp-label">{{ t('registry.profile.storage') }}</span>
                            <span class="mp-label">{{ t('registry.profile.storageOf', { used: formatBytes(creator.profile?.storage_used_bytes ?? 0), quota: formatBytes(creator.profile?.storage_quota_bytes) }) }}</span>
                        </div>
                        <eProgressBar :value="usedShare" :color="usedShare > 0.9 ? 'var(--accent-600)' : 'var(--accent-200)'" />
                        <p class="mp-text">{{ t('registry.profile.limitsNote') }}</p>
                    </div>
                </HudFrame>

                <HudFrame :head="BAND" :ticks="false" :delay="0.12">
                    <div class="mp-band">
                        <span class="mp-band-title">{{ t('registry.listing.previewKicker') }}</span>
                        <span class="mp-band-code">{{ t('registry.profile.previewCreator') }}</span>
                    </div>
                    <div class="mp-frame-body">
                        <div class="pf-preview-row">
                            <ProjectIcon :icon-key="creator.profile?.avatar_key" :name="username || '?'" :size="40" />
                            <div>
                                <div class="pf-preview-name">{{ username || '—' }}</div>
                                <span class="mp-label">
                                    {{ t('registry.profile.previewLine', { projects: creator.overview?.live ?? 0, downloads: (creator.overview?.downloads ?? 0).toLocaleString(), joined: formatDate(creator.profile?.created_at) }) }}
                                </span>
                            </div>
                        </div>
                    </div>
                </HudFrame>
            </aside>
        </div>

        <div class="pf-foot">
            <span class="mp-label" :class="{ 'mp-label--warn': dirty }">■ {{ dirty ? t('registry.profile.unsaved') : t('registry.profile.allSaved') }}</span>
            <div class="pf-actions">
                <eButton size="half" variant="tertiary" :label="t('registry.profile.discard')" :disabled="!dirty || saving" @click="reset" />
                <eButton size="half" :label="t('registry.profile.save')" :disabled="!canSave" :system-state="saving ? 'processing' : 'idle'" @click="save" />
            </div>
        </div>
    </div>
</template>

<style scoped src="./mp.css"></style>
<style scoped>
.pf {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    flex: 1;
    min-height: 0;
}

.pf-body {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr);
    gap: var(--space-4);
}

.pf-main {
    min-height: 0;
}

.pf-main-body {
    flex: 1;
    gap: var(--space-4);
}

.pf-row {
    display: flex;
}

.pf-field {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
}

.pf-grow {
    flex: 1;
    min-height: 0;
}

.pf-bio {
    flex: 1;
    resize: none;
    font-family: var(--font-primary);
}

.pf-avatar {
    display: flex;
    align-items: center;
    gap: var(--space-4);
}

.pf-avatar-text {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
}

.pf-avatar-actions {
    display: flex;
    gap: var(--space-5);
}

.pf-avatar-actions .mp-link {
    font-size: var(--main-font-size-3);
    color: var(--text-main);
}

.pf-side {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
}

.pf-v {
    color: var(--text-main);
    font-size: var(--main-font-size-3);
}

.pf-preview-row {
    display: flex;
    align-items: center;
    gap: var(--space-3);
}

.pf-preview-name {
    font-family: var(--font-primary);
    font-size: var(--main-font-size-3);
    font-weight: var(--font-weight-2);
    color: var(--text-main);
}

.pf-foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-top: var(--space-3);
    border-top: 1px solid var(--base-600);
    flex-shrink: 0;
}

.pf-actions {
    display: flex;
    gap: var(--space-2);
}
</style>
