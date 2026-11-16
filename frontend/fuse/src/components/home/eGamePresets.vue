<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { motion } from 'motion-v'
import eButton from '../inputs/eButton.vue'
import Icons from '../ui/Icons.vue'
import CompatTag from '../marketplace/CompatTag.vue'
import { useAppStore } from '../../stores/app'
import type { OverridePresetKind, PluginRecord } from '../../stores/plugins'
import { useFuseConnection } from '../../composables/useFuseConnection'
import { useI18n } from '../../composables/useI18n'
import { overrideView } from '../../utils/overrideState'
import { Dynamics } from '../../composables/useMotion'
import { KIND_ICON, gameMismatch, pluginKinds } from './gameChanges'


const props = defineProps<{
    plugin: PluginRecord
    picking: string | null | undefined
    slowPick: boolean
    pickError: string
}>()

const emit = defineEmits<{
    back: []
    pick: [preset: string | null]
}>()

const { t } = useI18n()
const appStore = useAppStore()
const { connected } = useFuseConnection()

const view = computed(() => overrideView(props.plugin.overrides!, appStore.gameRunning))
const presets = computed(() => props.plugin.overrides?.presets ?? [])
const kinds = computed(() => pluginKinds(props.plugin))
const filter = ref<OverridePresetKind | null>(null)
const shown = computed(() => presets.value
    .map((p, i) => ({ p, index: i + 1 }))
    .filter(x => !filter.value || x.p.kind === filter.value))

const canPick = computed(() => connected.value && props.picking === undefined && view.value.kind !== 'unknown')
const isPicked = (id: string | null) => view.value.kind !== 'unknown' && view.value.presetId === id
const pad = (n: number) => String(n).padStart(2, '0')

function pick(id: string | null) {
    if (!canPick.value || isPicked(id)) return
    emit('pick', id)
}

const stateText = computed(() => t(`components.plugin.overrides.text.${view.value.kind}`, { preset: view.value.presetName }))
const showReason = computed(() => !!view.value.reason && (view.value.kind === 'failed' || view.value.kind === 'outdated'))
const tagText = computed(() => t(`components.plugin.overrides.short.${view.value.kind}`))

const previews = ref<Record<string, string>>({})
watch(() => [props.plugin.filePath, presets.value.map(p => p.preview).join('|')] as const, async ([file]) => {
    if (!file) return
    for (const p of presets.value) {
        if (!p.preview || previews.value[p.id]) continue
        const url = await window.pluginsAPI.readPreview(file, p.preview)
        if (url) previews.value = { ...previews.value, [p.id]: url }
    }
}, { immediate: true })

const HOVER = { borderColor: 'rgba(179, 179, 179, 1)' }

const WIPE = { duration: 0.6, times: [0, 0.4, 0.5, 1], ease: Dynamics.snappy.ease }
const REVEAL = { duration: 0, delay: WIPE.duration * WIPE.times[1] }
const WIPE_X = ['-101%', '0%', '0%', '101%']
const pickedName = computed(() => view.value.presetId ? view.value.presetName : t('apphome.gameChanges.noPreset'))
</script>

<template>
    <div class="presets">
        <div class="header">
            <eButton
                v-tip="t('apphome.gameChanges.back')"
                size="slim"
                variant="primary"
                icon="arrow-left"
                @click="emit('back')"
            />
            <span class="mono muted">{{ t('apphome.gameChanges.title') }} /</span>
            <Icons
                v-for="k in kinds"
                :key="k"
                :kind="KIND_ICON[k]"
                size="small"
                color="var(--text-muted)"
            />
            <span class="title">{{ plugin.name }}</span>
            <span class="mono muted">v{{ plugin.version }}</span>
            <span class="grow" />
            <CompatTag
                :game="plugin.gameVersions ?? []"
                :fuse="plugin.minHostVersion ?? null"
                :mismatch="gameMismatch(plugin, appStore.gameVersion)"
            />
            <span class="mono tag" :class="`tone-${view.tone}`">{{ tagText }}</span>
        </div>

        <div class="body">
            <aside class="side">
                <span class="kicker">{{ t('apphome.gameChanges.picked') }}</span>
                <span class="wipe-box">
                    <motion.span
                        :key="`picked:${pickedName}`"
                        class="picked"
                        :initial="{ opacity: 0 }"
                        :animate="{ opacity: 1 }"
                        :transition="REVEAL"
                    >{{ pickedName }}</motion.span>
                    <motion.span
                        :key="`wipe:${pickedName}`"
                        class="wipe"
                        :initial="{ x: '-101%' }"
                        :animate="{ x: WIPE_X }"
                        :transition="WIPE"
                    />
                </span>
                <p class="mono muted">{{ stateText }}</p>
                <p v-if="showReason" class="mono bad">{{ view.reason }}</p>
                <p v-if="!connected" class="mono wait">{{ t('components.plugin.overrides.startFuse') }}</p>
                <p v-else-if="slowPick" class="mono wait">{{ t('components.plugin.overrides.waitingConsent') }}</p>
                <p v-if="pickError" class="mono bad">{{ t('components.plugin.overrides.pickFailed', { reason: pickError }) }}</p>

                <span class="kicker gap">{{ t('apphome.gameChanges.plugin') }}</span>
                <p class="desc">{{ plugin.description }}</p>
                <span v-if="plugin.author" class="mono muted">{{ t('apphome.gameChanges.byAuthor', { author: plugin.author }) }}</span>

                <template v-if="kinds.length">
                    <span class="kicker gap">{{ t('apphome.gameChanges.kinds') }}</span>
                    <span v-for="k in kinds" :key="k" class="kind-row">
                        <Icons :kind="KIND_ICON[k]" size="small" color="var(--text-main)" />
                        <span class="mono">{{ t(`apphome.gameChanges.kind.${k}`) }}</span>
                        <span class="mono muted">{{ presets.filter(p => p.kind === k).length }}</span>
                    </span>
                </template>
            </aside>

            <div class="list">
                <div v-if="kinds.length > 1" class="filters">
                    <button class="chip" :class="{ on: filter === null }" @click="filter = null">{{ t('apphome.gameChanges.all') }}</button>
                    <button
                        v-for="k in kinds"
                        :key="k"
                        class="chip"
                        :class="{ on: filter === k }"
                        @click="filter = k"
                    >
                        <Icons :kind="KIND_ICON[k]" size="small" :color="filter === k ? 'var(--black-1)' : 'var(--text-muted)'" />
                        {{ t(`apphome.gameChanges.kind.${k}`) }}
                    </button>
                </div>
                <div class="grid">
                    <motion.button
                        class="card"
                        :class="{ picked: isPicked(null) }"
                        :disabled="!canPick"
                        :while-hover="isPicked(null) ? undefined : HOVER"
                        @click="pick(null)"
                    >
                        <span class="thumb">
                            <span class="hatch" />
                            <Icons kind="reset" size="large" color="var(--text-muted)" class="thumb-icon" />
                            <span class="mono muted index">00</span>
                        </span>
                        <span class="name">{{ t('apphome.gameChanges.noPreset') }}</span>
                        <span class="meta">
                            <span class="mono muted">{{ t('apphome.gameChanges.originalFiles') }}</span>
                        </span>
                    </motion.button>
                    <motion.button
                        v-for="x in shown"
                        :key="x.p.id"
                        class="card"
                        :class="[{ picked: isPicked(x.p.id), busy: picking === x.p.id }, isPicked(x.p.id) ? `tone-${view.tone}` : '']"
                        :disabled="!canPick || !!x.p.problem"
                        :while-hover="isPicked(x.p.id) ? undefined : HOVER"
                        @click="pick(x.p.id)"
                    >
                        <span class="thumb">
                            <img v-if="previews[x.p.id]" :src="previews[x.p.id]" class="img" alt="" />
                            <template v-else>
                                <span class="hatch" />
                                <Icons v-if="x.p.kind" :kind="KIND_ICON[x.p.kind]" size="large" color="var(--text-muted)" class="thumb-icon" />
                            </template>
                            <span v-if="isPicked(x.p.id)" class="mono badge">{{ tagText }}</span>
                            <span class="mono muted index">{{ pad(x.index) }}</span>
                        </span>
                        <span class="name">{{ x.p.name }}</span>
                        <span class="meta">
                            <Icons v-if="x.p.kind" :kind="KIND_ICON[x.p.kind]" size="small" color="var(--text-muted)" />
                            <span v-if="x.p.kind" class="mono muted">{{ t(`apphome.gameChanges.kind.${x.p.kind}`) }}</span>
                            <span class="grow" />
                            <span v-if="x.p.isDefault" class="mono ok">{{ t('apphome.gameChanges.default') }}</span>
                        </span>
                        <span v-if="x.p.problem" class="mono bad problem">{{ x.p.problem }}</span>
                    </motion.button>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
.presets {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    box-sizing: border-box;
    background: hsla(142, 10%, 4%, 0.92);
    border: 1px solid var(--base-600);
    corner-shape: bevel;
    border-radius: 10px 0 10px 0;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
    user-select: none;
    -webkit-user-select: none;
}

.header {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-shrink: 0;
    padding: 12px 16px;
    border-bottom: 1px solid var(--base-600);
}

.title {
    font-family: var(--font-primary);
    font-size: var(--main-font-size-3);
    font-weight: var(--font-weight-2);
    line-height: 20px;
    color: var(--text-main);
    white-space: nowrap;
}

.grow {
    flex: 1;
}

.wipe-box {
    position: relative;
    display: inline-flex;
    align-self: flex-start;
    overflow: hidden;
}

.wipe {
    position: absolute;
    inset: 0;
    z-index: 1;
    background: var(--base-50);
    pointer-events: none;
}

.mono {
    font-family: var(--font-microcopy);
    font-size: var(--secondary-font-size-4);
    line-height: 16px;
}

.muted {
    color: var(--text-muted);
}

.ok,
.tone-ok {
    color: var(--accent-200);
}

.wait,
.tone-wait {
    color: var(--accent-600);
}

.bad,
.tone-bad {
    color: var(--error-highlight);
}

.tone-muted {
    color: var(--text-muted);
}

.tag {
    text-transform: uppercase;
    white-space: nowrap;
}

.body {
    display: flex;
    flex: 1;
    min-height: 0;
}

.side {
    display: flex;
    flex-direction: column;
    gap: 6px;
    flex-shrink: 0;
    width: 248px;
    padding: 16px;
    overflow-y: auto;
}

.side p {
    margin: 0;
}

.kicker {
    font-family: var(--font-microcopy);
    font-size: var(--secondary-font-size-4);
    color: var(--text-muted);
    text-transform: uppercase;
}

.kicker.gap {
    margin-top: 14px;
}

.picked {
    font-family: var(--font-primary);
    font-size: var(--main-font-size-3);
    font-weight: var(--font-weight-2);
    color: var(--text-main);
}

.desc {
    font-family: var(--font-primary);
    font-size: var(--main-font-size-4);
    line-height: 1.35;
    color: var(--text-muted);
}

.kind-row {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--text-main);
}

.list {
    display: flex;
    flex-direction: column;
    gap: 12px;
    flex: 1;
    min-width: 0;
    padding: 16px 16px 16px 0;
}

.filters {
    display: flex;
    gap: var(--space-2);
}

.chip {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 24px;
    padding: 0 10px;
    font-family: var(--font-microcopy);
    font-size: var(--secondary-font-size-4);
    color: var(--text-muted);
    background: none;
    border: 1px solid var(--base-600);
    corner-shape: bevel;
    border-radius: 5px 0 5px 0;
    cursor: pointer;
}

.chip.on {
    color: var(--black-1);
    background: var(--text-main);
    border-color: var(--text-main);
}

.grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 12px;
    align-content: start;
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding-right: 4px;
}

/* The App scrollbar, the same as AppTab. */
.grid::-webkit-scrollbar,
.side::-webkit-scrollbar {
    width: 6px;
}

.grid::-webkit-scrollbar-track,
.side::-webkit-scrollbar-track {
    background: transparent;
}

.grid::-webkit-scrollbar-thumb,
.side::-webkit-scrollbar-thumb {
    background-color: hsla(0, 0%, 100%, 0.15);
    border-radius: 4px;
    border-left: 4px solid transparent;
    background-clip: padding-box;
}

.grid::-webkit-scrollbar-thumb:hover,
.side::-webkit-scrollbar-thumb:hover {
    background-color: rgba(255, 255, 255, 0.25);
}

.card {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 6px 6px 10px;
    text-align: left;
    color: inherit;
    background: var(--black-1-a);
    border: 1px solid rgba(82, 82, 82, 1);
    corner-shape: bevel;
    border-radius: 6px 0 6px 0;
    cursor: pointer;
}

.card:disabled {
    cursor: default;
}

.card:disabled:not(.picked) {
    opacity: 0.55;
}

.card.picked {
    border-color: var(--accent-200);
}

.card.picked.tone-wait {
    border-color: var(--accent-600);
}

.card.picked.tone-bad {
    border-color: var(--error-highlight);
}

.card.busy {
    border-style: dashed;
}

.thumb {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    aspect-ratio: 16 / 9;
    overflow: hidden;
    background: var(--black-2);
}

.hatch {
    position: absolute;
    inset: 0;
    opacity: 0.35;
    background: repeating-linear-gradient(135deg, var(--base-600) 0 1px, transparent 1px 10px);
}

.thumb-icon {
    position: relative;
    z-index: 1;
}

.img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
}

.index {
    position: absolute;
    top: 6px;
    right: 8px;
}

.badge {
    position: absolute;
    top: 0;
    left: 0;
    padding: 2px 6px;
    color: var(--black-1);
    background: var(--accent-200);
    text-transform: uppercase;
}

.tone-wait .badge {
    background: var(--accent-600);
}

.tone-bad .badge {
    background: var(--error-highlight);
}

.name {
    overflow: hidden;
    font-family: var(--font-primary);
    font-size: var(--main-font-size-4);
    font-weight: var(--font-weight-2);
    color: var(--text-main);
    white-space: nowrap;
    text-overflow: ellipsis;
}

.meta {
    display: flex;
    align-items: center;
    gap: 6px;
}

.problem {
    overflow-wrap: anywhere;
}
</style>
