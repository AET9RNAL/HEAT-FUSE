<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRegistryStore } from '../../stores/registry'
import { useCreatorStore, type InspectedImage } from '../../stores/creator'
import { useI18n } from '../../composables/useI18n'
import { eventBus } from '../../events/eventBus'
import { errorText } from '../../utils/registry-api'
import { slugify, slugFormat, SLUG_MAX } from '../../../supabase/functions/_shared/slug.ts'
import RegistryCard from './RegistryCard.vue'
import ProjectIcon from './ProjectIcon.vue'
import MarkdownField from './MarkdownField.vue'
import HudFrame from './HudFrame.vue'
import Icons from '../ui/Icons.vue'
import eInputField from '../inputs/eInputField.vue'

// Height of the header band of each frame.
const BAND = 34

export interface ListingDraft {
    name: string
    slug: string
    /** False while the slug follows the name. */
    slugTouched: boolean
    summary: string
    description: string
    tagIds: number[]
}

const props = defineProps<{
    modelValue: ListingDraft
    projectId: string | null
    iconKey: string | null
    icon: InspectedImage | null
    ownerName: string | null
}>()
const emit = defineEmits<{
    'update:modelValue': [value: ListingDraft]
    'update:icon': [value: InspectedImage | null]
    'remove-icon': []
    validity: [ok: boolean]
}>()

const registry = useRegistryStore()
const creator = useCreatorStore()
const { t } = useI18n()

function patch(p: Partial<ListingDraft>) { emit('update:modelValue', { ...props.modelValue, ...p }) }

function onName(name: string) {
    patch(props.modelValue.slugTouched ? { name } : { name, slug: slugify(name) })
}

function onSlug(raw: string) {
    patch({ slug: raw.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, SLUG_MAX), slugTouched: true })
}

// ── Slug check: format here, availability on the server ──
const slugState = ref<'ok' | 'format' | 'reserved' | 'taken' | 'checking'>('format')
let slugTimer: ReturnType<typeof setTimeout> | null = null
watch(() => props.modelValue.slug, slug => {
    if (slugTimer) clearTimeout(slugTimer)
    const local = slugFormat(slug)
    if (local !== 'ok') { slugState.value = local; return }
    slugState.value = 'checking'
    slugTimer = setTimeout(async () => {
        try { slugState.value = await creator.slugStatus(slug, props.projectId) }
        catch { slugState.value = 'ok' }
    }, 300)
}, { immediate: true })

const nameOk = computed(() => props.modelValue.name.trim().length >= 2 && props.modelValue.name.trim().length <= 64)
const summaryOk = computed(() => props.modelValue.summary.trim().length > 0 && props.modelValue.summary.length <= 120)
const tagsOk = computed(() => props.modelValue.tagIds.length >= 1 && props.modelValue.tagIds.length <= 3)
const valid = computed(() => nameOk.value && summaryOk.value && tagsOk.value && slugState.value === 'ok')
watch(valid, v => emit('validity', v), { immediate: true })

function toggleTag(id: number) {
    const ids = props.modelValue.tagIds
    if (ids.includes(id)) patch({ tagIds: ids.filter(x => x !== id) })
    else if (ids.length < 3) patch({ tagIds: [...ids, id] })
}

async function pickIcon() {
    const path = await window.registryAPI.pickFile('image')
    if (!path) return
    try {
        const img = await creator.inspectImage(path, 'icon')
        if (img.problem) { eventBus.emit('notification', { title: t('registry.icon.title'), message: errorText(t, img.problem), type: 'error' }); return }
        emit('update:icon', img)
    } catch (err) {
        eventBus.emit('notification', { title: t('registry.icon.title'), message: errorText(t, err), type: 'error' })
    }
}

const selectedTags = computed(() => registry.tags.filter(tag => props.modelValue.tagIds.includes(tag.id)))
const previewProject = computed(() => ({
    id: props.projectId ?? 'preview', name: props.modelValue.name, summary: props.modelValue.summary,
    icon_key: props.iconKey, plugin_id: null, views: 0, downloads: 0, latest_file: null,
    owner: { username: props.ownerName, avatar_key: null }, tags: selectedTags.value,
}))
const hasIcon = computed(() => !!props.icon || !!props.iconKey)
</script>

<template>
    <div class="lf">
        <div class="lf-main">
            <HudFrame :head="BAND" :ticks="false">
                <div class="mp-band">
                    <span class="mp-band-title">{{ t('registry.wizard.step.listing') }}</span>
                    <span class="mp-band-code">{{ projectId ? `PRJ ${projectId}` : 'PRJ N3W' }}</span>
                </div>
                <div class="mp-frame-body lf-body">
                    <div class="lf-pair">
                        <div class="lf-field">
                            <div class="mp-hint-row">
                                <label class="mp-field-label">{{ t('registry.listing.name') }}<span class="req">*</span></label>
                                <span class="mp-label">{{ modelValue.name.length }} / 64</span>
                            </div>
                            <div class="lf-row">
                                <eInputField
                                    :model-value="modelValue.name"
                                    :label="t('registry.listing.name')"
                                    size="flex"
                                    :maxlength="64"
                                    :invalid="!!modelValue.name && !nameOk"
                                    @update:model-value="onName"
                                />
                            </div>
                            <span class="mp-label">{{ t('registry.listing.nameHint') }}</span>
                        </div>
                        <div class="lf-field">
                            <div class="mp-hint-row">
                                <label class="mp-field-label">{{ t('registry.listing.slug') }}<span class="req">*</span></label>
                                <span class="mp-label">{{ modelValue.slug.length }} / {{ SLUG_MAX }}</span>
                            </div>
                            <div class="lf-row">
                                <eInputField
                                    :model-value="modelValue.slug"
                                    :label="t('registry.listing.slug')"
                                    size="flex"
                                    :maxlength="SLUG_MAX"
                                    :invalid="!!modelValue.slug && slugState !== 'ok' && slugState !== 'checking'"
                                    @update:model-value="onSlug"
                                />
                            </div>
                            <div class="mp-hint-row">
                                <span class="mp-label">{{ t('registry.listing.slugHint') }}</span>
                                <span class="mp-label" :class="slugState === 'ok' ? 'mp-label--accent' : slugState === 'checking' ? '' : 'mp-label--error'">
                                    <Icons v-if="slugState === 'ok'" kind="checkmark" size="small" />
                                    {{ t(`registry.slug.${slugState}`) }}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div class="lf-field">
                        <div class="mp-hint-row">
                            <label class="mp-field-label">{{ t('registry.listing.summary') }}<span class="req">*</span></label>
                            <span class="mp-label">{{ modelValue.summary.length }} / 120</span>
                        </div>
                        <div class="lf-row">
                            <eInputField
                                :model-value="modelValue.summary"
                                :label="t('registry.listing.summary')"
                                size="flex"
                                :maxlength="120"
                                @update:model-value="patch({ summary: $event })"
                            />
                        </div>
                        <span class="mp-label">{{ t('registry.listing.summaryHint') }}</span>
                    </div>
                </div>
            </HudFrame>

            <HudFrame class="lf-grow" :head="BAND" :ticks="false" :delay="0.06">
                <div class="mp-band">
                    <span class="mp-band-title">{{ t('registry.listing.description') }}</span>
                </div>
                <div class="mp-frame-body lf-grow-body">
                    <MarkdownField :model-value="modelValue.description" :max="20000" @update:model-value="patch({ description: $event })" />
                </div>
            </HudFrame>
        </div>

        <div class="lf-side">
            <HudFrame :head="BAND" :ticks="false" :delay="0.06">
                <div class="mp-band">
                    <span class="mp-band-title">{{ t('registry.listing.previewKicker') }}</span>
                    <span class="mp-band-code">{{ t('registry.listing.previewHint') }}</span>
                </div>
                <div class="mp-frame-body">
                    <RegistryCard :project="previewProject" preview :preview-icon="icon?.preview ?? null" />
                </div>
            </HudFrame>

            <HudFrame :head="BAND" :ticks="false" :delay="0.12">
                <div class="mp-band">
                    <span class="mp-band-title">{{ t('registry.icon.title') }}</span>
                </div>
                <div class="mp-frame-body">
                    <div class="lf-icon">
                        <ProjectIcon :icon-key="iconKey" :preview="icon?.preview ?? null" :name="modelValue.name || '?'" :size="56" />
                        <div class="lf-icon-text">
                            <span class="mp-text">{{ hasIcon ? t('registry.icon.set') : t('registry.icon.none') }}</span>
                            <span class="mp-label">{{ t('registry.icon.rules') }}</span>
                            <div class="lf-icon-actions">
                                <button class="mp-link" @click="pickIcon">{{ hasIcon ? t('registry.icon.replace') : t('registry.icon.upload') }}</button>
                                <button v-if="hasIcon" class="mp-link" @click="icon ? emit('update:icon', null) : emit('remove-icon')">{{ t('registry.icon.remove') }}</button>
                            </div>
                        </div>
                    </div>
                </div>
            </HudFrame>

            <HudFrame :head="BAND" :ticks="false" :delay="0.18">
                <div class="mp-band">
                    <span class="mp-band-title">{{ t('registry.listing.tags') }}<span class="req">*</span></span>
                    <span class="mp-band-code">{{ t('registry.listing.tagsCount', { count: modelValue.tagIds.length }) }}</span>
                </div>
                <div class="mp-frame-body">
                    <div class="lf-tags">
                        <button
                            v-for="tag in registry.tags"
                            :key="tag.id"
                            class="lf-tag"
                            :class="{ on: modelValue.tagIds.includes(tag.id) }"
                            :style="modelValue.tagIds.includes(tag.id) && tag.color ? { color: tag.color, borderColor: tag.color } : undefined"
                            :disabled="!modelValue.tagIds.includes(tag.id) && modelValue.tagIds.length >= 3"
                            @click="toggleTag(tag.id)"
                        >{{ tag.label }}</button>
                    </div>
                </div>
            </HudFrame>
        </div>
    </div>
</template>

<style scoped src="./mp.css"></style>
<style scoped>
.lf {
    display: grid;
    grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr);
    gap: var(--space-5);
    min-height: 0;
    flex: 1;
}

.lf-main,
.lf-side {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    min-height: 0;
}

.lf-pair {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-3);
}

.lf-field {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
}

.lf-body {
    gap: var(--space-4);
}

.lf-grow {
    flex: 1;
    min-height: 220px;
}

.lf-grow-body {
    flex: 1;
}

.lf-row {
    display: flex;
}

.lf-icon {
    display: flex;
    gap: var(--space-3);
    align-items: flex-start;
}

.lf-icon-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.lf-icon-actions {
    display: flex;
    gap: var(--space-4);
    margin-top: var(--space-1);
}

.lf-tags {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
}

.lf-tag {
    padding: 2px 8px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.08);
    color: var(--text-muted);
    font-family: var(--font-microcopy);
    font-size: 11px;
    text-transform: uppercase;
    cursor: pointer;
}

.lf-tag.on {
    color: var(--accent-200);
    border-color: var(--accent-200);
    background: rgba(132, 255, 177, 0.08);
}

.lf-tag:disabled {
    opacity: 0.35;
    cursor: default;
}
</style>
