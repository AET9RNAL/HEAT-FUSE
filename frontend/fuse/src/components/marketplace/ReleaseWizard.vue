<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { AnimatePresence, motion } from 'motion-v'
import { useRegistryStore } from '../../stores/registry'
import { useCreatorStore, type InspectedImage } from '../../stores/creator'
import { useI18n } from '../../composables/useI18n'
import { eventBus } from '../../events/eventBus'
import { errorText, formatBytes, type RegistryProject } from '../../utils/registry-api'
import ListingForm, { type ListingDraft } from './ListingForm.vue'
import BuildForm, { type BuildDraft } from './BuildForm.vue'
import RegistryCard from './RegistryCard.vue'
import ChannelChip from './ChannelChip.vue'
import HudFrame from './HudFrame.vue'
import HudStepper, { type HudStep } from './HudStepper.vue'
import eButton from '../inputs/eButton.vue'

// Without a project this is New plugin (Listing, Build, Review). With one it is Upload version (Build, Review).
const props = defineProps<{ projectId?: string | null }>()
const emit = defineEmits<{ done: [projectId: string | null]; profile: [] }>()

const registry = useRegistryStore()
const creator = useCreatorStore()
const { t } = useI18n()

const project = ref<RegistryProject | null>(null)
const steps = computed(() => props.projectId ? ['build', 'review'] as const : ['listing', 'build', 'review'] as const)
const stepIndex = ref(0)
const step = computed(() => steps.value[stepIndex.value])

const SERIAL = { listing: 'STG-L1ST', build: 'STG-BU1LD', review: 'STG-R3V13W' } as const
const stepItems = computed<HudStep[]>(() => steps.value.map(s => ({
    key: s,
    label: t(`registry.wizard.step.${s}`),
    hint: t(`registry.wizard.stepHint.${s}`),
    serial: SERIAL[s],
})))
const busy = ref(false)
const buildBusy = ref(false)

const listing = ref<ListingDraft>({ name: '', slug: '', slugTouched: false, summary: '', description: '', tagIds: [] })
const icon = ref<InspectedImage | null>(null)
const listingValid = ref(false)
const build = ref<BuildDraft>({
    pkg: null, file: null, channel: 'release', changelog: '',
    gameVersions: registry.playerGameVersion ? [registry.playerGameVersion] : [], deps: [],
})

onMounted(async () => {
    if (!registry.tags.length) void registry.fetchTags()
    if (!creator.profile) void creator.loadProfile()
    if (props.projectId) project.value = await creator.getProject(props.projectId)
})

const buildValid = computed(() => build.value.file?.state === 'ready' && build.value.gameVersions.length > 0)
const fileId = computed(() => build.value.file?.id ?? null)

function fail(err: unknown) {
    eventBus.emit('notification', { title: t('registry.wizard.errorTitle'), message: errorText(t, err), type: 'error' })
}

async function saveListing(): Promise<boolean> {
    try {
        const l = listing.value
        if (!project.value) {
            project.value = await creator.createProject({
                name: l.name.trim(), slug: l.slug, summary: l.summary.trim(), description: l.description, kind: 'plugin', tagIds: l.tagIds,
            })
        } else {
            await creator.updateProject(project.value.id, {
                name: l.name.trim(), slug: l.slug, summary: l.summary.trim(), description: l.description, tagIds: l.tagIds,
            })
        }
        const id = project.value.id
        if (icon.value) {
            await creator.uploadImage('icon', id, icon.value)
            icon.value = null
        }
        // The review checks read tags, summary and icon from this copy.
        project.value = (await creator.getProject(id)) ?? project.value
        return true
    } catch (err) {
        fail(err)
        return false
    }
}

async function saveBuild(): Promise<boolean> {
    if (!fileId.value) return true
    try {
        await creator.updateFile(fileId.value, {
            channel: build.value.channel, changelog: build.value.changelog, gameVersions: build.value.gameVersions,
        })
        const saved = await creator.setDependencies(fileId.value, build.value.deps)
        build.value = { ...build.value, file: saved }
        return true
    } catch (err) {
        fail(err)
        return false
    }
}

async function next() {
    busy.value = true
    try {
        if (step.value === 'listing' && !(await saveListing())) return
        if (step.value === 'build' && !(await saveBuild())) return
        stepIndex.value++
    } finally {
        busy.value = false
    }
}

async function saveDraft() {
    busy.value = true
    try {
        if (step.value === 'listing' && listingValid.value && !(await saveListing())) return
        if (step.value !== 'listing' && !(await saveBuild())) return
        eventBus.emit('notification', { message: t('registry.wizard.draftSaved') })
        emit('done', project.value?.id ?? null)
    } finally {
        busy.value = false
    }
}

async function submit() {
    if (!fileId.value) return
    busy.value = true
    try {
        await creator.submit(fileId.value)
        eventBus.emit('notification', { message: t('registry.wizard.submitted'), type: 'success' })
        emit('done', project.value?.id ?? null)
    } catch (err) {
        fail(err)
    } finally {
        busy.value = false
    }
}

// ── Review ──
const uncovered = computed(() => {
    const d = build.value.file?.manifest?.dependencies
    const ids = Array.isArray(d) ? d.map(String) : d && typeof d === 'object' ? Object.keys(d) : []
    return ids.filter(pid => !build.value.deps.some(x => x.relation === 'required' && x.plugin_id?.toLowerCase() === pid.toLowerCase()))
})
const hasUsername = computed(() => !!creator.profile?.username)
const checks = computed(() => {
    const p = project.value
    return [
        { key: 'listing', ok: !!p && !!p.summary.trim(), need: true },
        { key: 'tags', ok: (p?.tags.length ?? 0) > 0, need: true },
        { key: 'icon', ok: !!p?.icon_key, need: false },
        { key: 'package', ok: build.value.file?.state === 'ready', need: true },
        { key: 'dependencies', ok: uncovered.value.length === 0, need: false },
        { key: 'changelog', ok: build.value.changelog.trim().length > 0, need: false },
        { key: 'username', ok: hasUsername.value, need: true },
    ]
})
const ready = computed(() => checks.value.every(c => c.ok || !c.need))
const passed = computed(() => checks.value.filter(c => c.ok).length)

type Tone = 'ok' | 'fail' | 'warn'
const TOKEN: Record<Tone, string> = { ok: '[ OK ]', fail: '[FAIL]', warn: '[WARN]' }
const toneOf = (c: { ok: boolean; need: boolean }): Tone => c.ok ? 'ok' : c.need ? 'fail' : 'warn'

// Height of the header band of the review frames.
const BAND = 34

const previewProject = computed(() => project.value
    ? { ...project.value, latest_file: null }
    : { id: 'preview', name: listing.value.name, summary: listing.value.summary, icon_key: null, plugin_id: null, views: 0, downloads: 0, latest_file: null, owner: null, tags: [] })

const canNext = computed(() => step.value === 'listing' ? listingValid.value : step.value === 'build' ? buildValid.value && !buildBusy.value : false)
</script>

<template>
    <div class="wz">
        <HudStepper :steps="stepItems" :index="stepIndex" />

        <AnimatePresence mode="wait">
        <motion.div
            :key="step"
            class="wz-body mp-scroll"
            :initial="{ opacity: 0, x: 16 }"
            :animate="{ opacity: 1, x: 0 }"
            :exit="{ opacity: 0, x: -16 }"
            :transition="{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }"
        >
            <ListingForm
                v-if="step === 'listing'"
                v-model="listing"
                v-model:icon="icon"
                :project-id="project?.id ?? null"
                :icon-key="project?.icon_key ?? null"
                :owner-name="creator.profile?.username ?? null"
                @validity="listingValid = $event"
            />

            <BuildForm
                v-else-if="step === 'build' && (project || projectId)"
                v-model="build"
                :project-id="(project?.id ?? projectId)!"
                @busy="buildBusy = $event"
            />

            <div v-else-if="step === 'review'" class="wz-review">
                <div class="wz-review-main">
                    <span class="mp-label"><span class="mp-label--accent">{{ t('registry.listing.previewKicker') }}</span> · {{ t('registry.wizard.previewAfter') }}</span>
                    <RegistryCard
                        :project="previewProject"
                        preview
                        :preview-version="build.file?.version ?? null"
                        :preview-channel="build.channel"
                        :preview-game="build.gameVersions"
                        :preview-fuse="build.file?.min_fuse_version ?? null"
                    />
                    <HudFrame class="wz-version" :head="BAND" :ticks="false">
                        <div class="mp-band">
                            <span class="mp-band-title">{{ t('registry.wizard.version', { version: build.file?.version ?? '—' }) }}</span>
                            <ChannelChip :channel="build.channel" />
                            <span class="mp-band-code">{{ build.file?.id ?? '' }}</span>
                        </div>
                        <div class="wz-version-body">
                            <div class="wz-grid">
                                <span class="mp-label">{{ t('registry.wizard.file') }}</span>
                                <span class="mp-label">{{ t('registry.wizard.checksum') }}</span>
                                <span class="mp-label">{{ t('registry.col.game') }}</span>
                                <span class="mp-label">{{ t('registry.col.fuse') }}</span>
                                <span class="mp-mono wz-v">{{ build.file?.file_name }} · {{ formatBytes(build.file?.size_bytes) }}</span>
                                <span class="mp-mono wz-v">SHA-256 {{ build.file?.sha256 ? `${build.file.sha256.slice(0, 4)}…${build.file.sha256.slice(-4)}`.toUpperCase() : '—' }}</span>
                                <span class="mp-mono wz-v">{{ build.gameVersions.join(', ') || '—' }}</span>
                                <span class="mp-mono wz-v">{{ build.file?.min_fuse_version ? `≥ ${build.file.min_fuse_version}` : '—' }}</span>
                            </div>
                            <span class="mp-label">{{ t('registry.build.requires') }}</span>
                            <span class="mp-mono wz-v">{{ build.deps.filter(d => d.relation === 'required').map(d => d.name).join(' · ') || '—' }}</span>
                        </div>
                    </HudFrame>
                </div>

                <!-- A boot-log checklist: one status token per check. -->
                <HudFrame class="wz-checks" :head="BAND">
                    <div class="mp-band">
                        <span class="mp-band-title">{{ t('registry.wizard.beforeSubmit') }}</span>
                        <span class="mp-band-code">{{ passed }}/{{ checks.length }}</span>
                    </div>
                    <div class="wz-checks-body">
                        <div v-for="c in checks" :key="c.key" class="wz-check">
                            <span class="wz-token" :class="toneOf(c)">{{ TOKEN[toneOf(c)] }}</span>
                            <span class="wz-check-text">{{ t(`registry.wizard.check.${c.key}`) }}</span>
                            <button v-if="c.key === 'username' && !c.ok" class="mp-link" @click="emit('profile')">{{ t('registry.wizard.setUsername') }}</button>
                            <span v-else-if="!c.ok" class="mp-label" :class="c.need ? 'mp-label--error' : 'mp-label--warn'">
                                {{ c.need ? t('registry.wizard.required') : t('registry.wizard.optional') }}
                            </span>
                        </div>
                        <span class="mp-label wz-next-kicker">{{ t('registry.wizard.whatNext') }}</span>
                        <div v-for="n in 3" :key="n" class="wz-next">
                            <span class="mp-mono wz-next-num">0{{ n }}</span>
                            <span class="mp-text">{{ t(`registry.wizard.next${n}`) }}</span>
                        </div>
                    </div>
                </HudFrame>
            </div>
        </motion.div>
        </AnimatePresence>

        <div class="wz-foot">
            <span class="mp-label" :class="{ 'mp-label--accent': step === 'review' && ready }">
                ■ {{ step === 'review' && ready ? t('registry.wizard.ready') : t('registry.wizard.stepOf', { n: stepIndex + 1, total: steps.length }) }}
            </span>
            <div class="wz-actions">
                <eButton
                    size="half"
                    variant="tertiary"
                    :label="stepIndex === 0 ? t('common.cancel') : t('appdiscover.back')"
                    :disabled="busy || buildBusy"
                    @click="stepIndex === 0 ? emit('done', project?.id ?? null) : stepIndex--"
                />
                <eButton
                    v-if="project || step !== 'listing'"
                    size="half"
                    variant="secondary"
                    :label="t('registry.wizard.saveDraft')"
                    :disabled="busy || buildBusy"
                    @click="saveDraft"
                />
                <eButton
                    v-if="step !== 'review'"
                    size="half"
                    :label="t('registry.wizard.next', { step: t(`registry.wizard.step.${steps[stepIndex + 1]}`) })"
                    :disabled="!canNext"
                    :system-state="busy ? 'processing' : 'idle'"
                    @click="next"
                />
                <eButton
                    v-else
                    size="half"
                    :label="t('registry.wizard.submit')"
                    :disabled="!ready"
                    :system-state="busy ? 'processing' : 'idle'"
                    @click="submit"
                />
            </div>
        </div>
    </div>
</template>

<style scoped src="./mp.css"></style>
<style scoped>
.wz {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    flex: 1;
    min-height: 0;
}

.wz-body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    padding-right: var(--space-1);
}

.wz-review {
    display: grid;
    grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
    gap: var(--space-5);
    flex: 1;
    align-items: start;
}

.wz-review-main {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
}

.wz-version {
    margin-top: var(--space-2);
}

.wz-version-body {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-4);
}

.wz-grid {
    display: grid;
    grid-template-columns: repeat(4, auto);
    gap: 2px var(--space-5);
    justify-content: start;
}

.wz-v {
    font-size: var(--main-font-size-4);
    color: var(--text-main);
}

.wz-checks-body {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-4);
}

.wz-check {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-1) 0;
}

.wz-token {
    font-family: var(--font-microcopy);
    font-size: var(--main-font-size-4);
    font-weight: var(--font-weight-2);
    white-space: pre;
    user-select: none;
    -webkit-user-select: none;
}

.wz-token.ok {
    color: var(--accent-200);
}

.wz-token.fail {
    color: var(--error-highlight);
}

.wz-token.warn {
    color: var(--accent-600);
}

.wz-check-text {
    user-select: none;
    -webkit-user-select: none;
    flex: 1;
    font-family: var(--font-primary);
    font-size: var(--main-font-size-4);
    color: var(--text-main);
}

.wz-next-kicker {
    margin-top: var(--space-2);
    padding-top: var(--space-2);
    border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.wz-next {
    user-select: none;
    -webkit-user-select: none;
    display: flex;
    gap: var(--space-3);
    align-items: baseline;
}

.wz-next-num {
    color: var(--base-600);
    font-size: var(--main-font-size-4);
}

.wz-foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-top: var(--space-3);
    border-top: 1px solid var(--base-600);
    flex-shrink: 0;
}

.wz-actions {
    display: flex;
    gap: var(--space-2);
}
</style>
