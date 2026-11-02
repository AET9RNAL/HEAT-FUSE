<script setup lang="ts">
import { ref, computed } from 'vue'
import { useCreatorStore, type InspectedPackage, type DependencyDraft } from '../../stores/creator'
import { useI18n } from '../../composables/useI18n'
import { errorText, formatBytes, duplicateOf, CHANNELS, CHANNEL_COLORS, type Channel, type RegistryFile } from '../../utils/registry-api'
import HudFrame from './HudFrame.vue'
import GameVersionPicker from './GameVersionPicker.vue'
import MarkdownField from './MarkdownField.vue'
import DependencyEditor from './DependencyEditor.vue'
import ChannelChip from './ChannelChip.vue'
import eCheckbox from '../inputs/eCheckbox.vue'
import eProgressBar from '../ui/eProgressBar.vue'
import Icons from '../ui/Icons.vue'

export interface BuildDraft {
    pkg: InspectedPackage | null
    file: RegistryFile | null
    channel: Channel
    changelog: string
    gameVersions: string[]
    deps: DependencyDraft[]
}

const props = withDefaults(defineProps<{
    modelValue: BuildDraft
    projectId: string
    /** Edit mode: the file exists, so the package cannot change. */
    locked?: boolean
}>(), { locked: false })
const emit = defineEmits<{ 'update:modelValue': [value: BuildDraft]; busy: [value: boolean] }>()

const creator = useCreatorStore()
const { t } = useI18n()

// Height of the header band of each frame.
const BAND = 34

type Phase = 'empty' | 'inspecting' | 'uploading' | 'checking' | 'verified' | 'invalid' | 'error'
const phase = ref<Phase>(props.modelValue.file
    ? (props.modelValue.file.state === 'ready' ? 'verified' : props.modelValue.file.state === 'invalid' ? 'invalid' : 'checking')
    : 'empty')
const share = ref(0)
// An error code, or the error itself when its detail adds to the text.
const problem = ref<unknown>(props.modelValue.file?.invalid_reason ?? null)
const dragging = ref(false)

function patch(p: Partial<BuildDraft>) { emit('update:modelValue', { ...props.modelValue, ...p }) }

const checkEls = new Map<Channel, Element>()
function setCheckEl(c: Channel, el: unknown) {
    if (el instanceof Element) checkEls.set(c, el)
    else checkEls.delete(c)
}

function onChannelRow(event: MouseEvent, c: Channel) {
    if (checkEls.get(c)?.contains(event.target as Node)) return
    patch({ channel: c })
}

const manifest = computed(() => props.modelValue.file?.manifest ?? props.modelValue.pkg?.manifest ?? null)
const manifestRequires = computed<string[]>(() => {
    const d = manifest.value?.dependencies
    if (Array.isArray(d)) return d.map(String)
    if (d && typeof d === 'object') return Object.keys(d)
    return []
})
const manifestReqText = computed(() => {
    const d = manifest.value?.dependencies
    if (d && typeof d === 'object' && !Array.isArray(d)) return Object.entries(d).map(([k, v]) => `${k} ${v}`).join(' · ')
    return manifestRequires.value.join(' · ')
})
const fileName = computed(() => props.modelValue.file?.file_name ?? props.modelValue.pkg?.fileName ?? '')
const size = computed(() => props.modelValue.file?.size_bytes ?? props.modelValue.pkg?.size ?? 0)
const sha = computed(() => props.modelValue.file?.sha256 ?? props.modelValue.pkg?.sha256 ?? '')

async function choose(path: string | null) {
    if (!path || props.locked) return
    phase.value = 'inspecting'
    problem.value = null
    emit('busy', true)
    let pkg: InspectedPackage | null = null
    try {
        pkg = await creator.inspectPackage(path)
        if (pkg.problem) { problem.value = pkg.problem; phase.value = 'invalid'; patch({ pkg, file: null }); return }
        const old = props.modelValue.file
        if (old && (old.status === 'draft' || old.status === 'rejected')) await creator.deleteDraft('file', old.id).catch(() => {})
        patch({ pkg, file: null })
        phase.value = 'uploading'
        share.value = 0
        const fileId = await creator.uploadPackage(props.projectId, pkg, {
            channel: props.modelValue.channel, changelog: props.modelValue.changelog, gameVersions: props.modelValue.gameVersions,
        }, s => { share.value = s })
        phase.value = 'checking'
        const file = await creator.waitForFile(fileId)
        patch({ pkg, file })
        if (file?.state === 'ready') phase.value = 'verified'
        else { phase.value = 'invalid'; problem.value = file?.invalid_reason ?? 'processing_timeout' }
    } catch (err) {
        // The same bytes are already a verified draft of this project, so the form uses that file.
        const dup = duplicateOf(err)
        if (dup && dup.project_id === props.projectId && dup.state === 'ready' && (dup.status === 'draft' || dup.status === 'rejected')) {
            const file = await creator.getFile(dup.file_id).catch(() => null)
            if (file) {
                patch({ pkg, file })
                phase.value = 'verified'
                return
            }
        }
        phase.value = 'error'
        problem.value = err
    } finally {
        emit('busy', false)
    }
}

async function pick() { await choose(await window.registryAPI.pickFile('package')) }

function onDrop(e: DragEvent) {
    dragging.value = false
    const f = e.dataTransfer?.files?.[0]
    if (f) void choose(window.registryAPI.pathForFile(f))
}

const chipText = computed(() => ({
    empty: '', inspecting: t('registry.build.inspecting'), uploading: `${t('registry.build.uploading')} ${Math.round(share.value * 100)}%`,
    checking: t('registry.build.checking'), verified: t('registry.build.verified'),
    invalid: t('registry.build.invalid'), error: t('registry.build.failed'),
}[phase.value]))
</script>

<template>
    <div class="bf">
        <div class="bf-main">
            <!-- The package. The whole frame takes a dropped file. -->
            <HudFrame
                class="bf-package"
                :class="{ over: dragging, bad: phase === 'invalid' || phase === 'error' }"
                :head="BAND"
                :ticks="false"
                @dragover.prevent="!locked && (dragging = true)"
                @dragleave="dragging = false"
                @drop.prevent="onDrop"
            >
                <div class="mp-band">
                    <span class="mp-band-title">{{ t('registry.build.package') }}<span class="req">*</span></span>
                    <span v-if="phase !== 'empty'" class="mp-chip bf-chip" :class="phase === 'verified' ? 'mp-chip--live' : phase === 'invalid' || phase === 'error' ? 'mp-chip--error' : 'mp-chip--review'">{{ chipText }}</span>
                    <button v-if="phase !== 'empty' && !locked && phase !== 'uploading' && phase !== 'checking' && phase !== 'inspecting'" class="mp-link" @click="pick">{{ t('registry.build.replace') }}</button>
                </div>

                <div class="mp-frame-body">
                    <button v-if="phase === 'empty'" class="bf-drop" @click="pick">
                        <Icons kind="file" size="large" />
                        <span class="mp-text">{{ t('registry.build.drop') }}</span>
                        <span class="mp-label">{{ t('registry.build.dropRules') }}</span>
                    </button>

                    <template v-else>
                        <div class="bf-card-head">
                            <Icons kind="file" size="large" class="bf-file-icon" />
                            <div class="bf-file">
                                <span class="bf-file-name">{{ fileName }}</span>
                                <span class="mp-label">{{ formatBytes(size) }} · SHA-256 {{ sha ? `${sha.slice(0, 4)}…${sha.slice(-4)}`.toUpperCase() : '—' }}</span>
                            </div>
                        </div>
                        <eProgressBar v-if="phase === 'uploading'" :value="share" />
                        <p v-if="problem" class="bf-problem">{{ errorText(t, problem) }}</p>
                        <div v-if="manifest && phase !== 'invalid'" class="bf-manifest mp-divider">
                            <span class="mp-label mp-label--accent"><Icons kind="checkmark" size="small" /> {{ t('registry.build.fromManifest') }}</span>
                            <div class="bf-grid">
                                <span class="mp-label">{{ t('registry.pluginId') }}</span>
                                <span class="mp-label">{{ t('registry.col.version') }}</span>
                                <span class="mp-label">{{ t('registry.col.fuse') }}</span>
                                <span class="mp-label">{{ t('registry.build.requires') }}</span>
                                <span class="mp-mono bf-v">{{ manifest.plugin_id }}</span>
                                <span class="mp-mono bf-v">{{ manifest.version }}</span>
                                <span class="mp-mono bf-v">{{ manifest.min_host_version ? `≥ ${manifest.min_host_version}` : '—' }}</span>
                                <span class="mp-mono bf-v">{{ manifestReqText || '—' }}</span>
                            </div>
                        </div>
                    </template>
                </div>
            </HudFrame>

            <HudFrame :head="BAND" :ticks="false" :delay="0.06">
                <div class="mp-band">
                    <span class="mp-band-title">{{ t('registry.build.gameVersions') }}<span class="req">*</span></span>
                    <span class="mp-band-code">{{ String(modelValue.gameVersions.length).padStart(2, '0') }}</span>
                </div>
                <div class="mp-frame-body">
                    <GameVersionPicker :model-value="modelValue.gameVersions" @update:model-value="patch({ gameVersions: $event })" />
                </div>
            </HudFrame>

            <HudFrame class="bf-grow" :head="BAND" :ticks="false" :delay="0.12">
                <div class="mp-band">
                    <span class="mp-band-title">{{ t('registry.build.changelog') }}</span>
                </div>
                <div class="mp-frame-body bf-grow-body">
                    <MarkdownField :model-value="modelValue.changelog" :max="20000" :rows="5" @update:model-value="patch({ changelog: $event })" />
                </div>
            </HudFrame>
        </div>

        <div class="bf-side">
            <!-- One row per channel. The picked row carries a bar in its channel colour. -->
            <HudFrame :head="BAND" :ticks="false" :delay="0.06">
                <div class="mp-band">
                    <span class="mp-band-title">{{ t('registry.build.channel') }}<span class="req">*</span></span>
                    <span class="mp-band-code">CH-{{ modelValue.channel.toUpperCase() }}</span>
                </div>
                <div class="bf-channels">
                    <div
                        v-for="c in CHANNELS"
                        :key="c"
                        class="bf-channel"
                        :class="{ on: modelValue.channel === c }"
                        :style="{ '--ch': CHANNEL_COLORS[c] }"
                        @click="onChannelRow($event, c)"
                    >
                        <div :ref="el => setCheckEl(c, el)" class="bf-check" :class="{ picked: modelValue.channel === c }">
                            <eCheckbox
                                :model-value="modelValue.channel === c"
                                :width="24"
                                :height="24"
                                @update:model-value="$event && patch({ channel: c })"
                            />
                        </div>
                        <span class="bf-ch-text">
                            <span class="bf-ch-name">{{ t(`registry.channel.${c}`) }}</span>
                            <span class="mp-text">{{ t(`registry.channelHint.${c}`) }}</span>
                        </span>
                        <ChannelChip :channel="c" />
                    </div>
                </div>
            </HudFrame>

            <DependencyEditor
                :model-value="modelValue.deps"
                :self-project-id="projectId"
                :manifest-requires="manifestRequires"
                @update:model-value="patch({ deps: $event })"
            />
        </div>
    </div>
</template>

<style scoped src="./mp.css"></style>
<style scoped>
.bf {
    display: grid;
    grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr);
    gap: var(--space-5);
    flex: 1;
    min-height: 0;
}

.bf-main,
.bf-side {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    min-height: 0;
}

.bf-grow {
    flex: 1;
    min-height: 200px;
}

.bf-grow-body {
    flex: 1;
}

/* Dragged file check semantics */
.bf-package.over {
    --hf-stroke: var(--accent-200);
}

.bf-package.bad {
    --hf-stroke: var(--error-highlight);
}

.bf-chip {
    margin-left: auto;
}

.bf-drop {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-1);
    min-height: 120px;
    padding: var(--space-3);
    box-sizing: border-box;
    background: none;
    border: 1px dashed var(--base-600);
    corner-shape: bevel;
    border-radius: 8px 0 8px 0;
    color: var(--text-muted);
    cursor: pointer;
}

.bf-drop:hover,
.bf-package.over .bf-drop {
    border-color: var(--accent-200);
    color: var(--accent-200);
}

.bf-card-head {
    display: flex;
    align-items: center;
    gap: var(--space-3);
}

.bf-file-icon {
    color: var(--accent-200);
}

.bf-file {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
}

.bf-file-name {
    font-family: var(--font-microcopy);
    font-size: var(--main-font-size-3);
    color: var(--text-main);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.bf-problem {
    margin: 0;
    font-family: var(--font-microcopy);
    font-size: 11px;
    text-transform: uppercase;
    color: var(--error-highlight);
}

.bf-manifest {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    padding-top: var(--space-2);
}

.bf-grid {
    display: grid;
    grid-template-columns: auto auto auto 1fr;
    gap: 2px var(--space-5);
}

.bf-v {
    font-size: var(--main-font-size-4);
    color: var(--text-main);
}

.bf-channels {
    display: flex;
    flex-direction: column;
    padding: var(--space-1) 0 var(--space-2);
}

.bf-channel {
    position: relative;
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-2) var(--space-4);
    cursor: pointer;
}

.bf-channel + .bf-channel {
    border-top: 1px dashed rgba(255, 255, 255, 0.08);
}

.bf-channel:hover {
    background: rgba(255, 255, 255, 0.03);
}

.bf-channel.on {
    background: color-mix(in srgb, var(--ch) 7%, transparent);
}

.bf-channel.on::before {
    content: '';
    position: absolute;
    top: var(--space-1);
    bottom: var(--space-1);
    left: 0;
    width: 2px;
    background: var(--ch);
}

.bf-check {
    display: flex;
    flex-shrink: 0;
}

/* One channel is always picked: the picked box lets clicks through to its row, so it cannot clear itself. */
.bf-check.picked {
    pointer-events: none;
}

.bf-ch-text {
    flex: 1;
    display: flex;
    flex-direction: column;
}

.bf-ch-name {
    font-family: var(--font-primary);
    font-size: var(--main-font-size-3);
    color: var(--text-main);
}
</style>
