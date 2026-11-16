<script setup lang="ts">
import { computed } from 'vue'
import { motion } from 'motion-v'
import Icons from '../ui/Icons.vue'
import CompatTag from '../marketplace/CompatTag.vue'
import type { PluginRecord } from '../../stores/plugins'
import type { OverrideView } from '../../utils/overrideState'
import { useI18n } from '../../composables/useI18n'
import { FEEDS, KIND_ICON, WIRED, pluginKinds } from './gameChanges'

// One override plugin on the Game Changes canvas.

const props = defineProps<{
    plugin: PluginRecord
    view: OverrideView
    mismatch: boolean
    selected: boolean
}>()

const emit = defineEmits<{
    port: [event: PointerEvent, side: 'in' | 'out']
}>()

const { t } = useI18n()

const FIELD = { rest: 'rgb(25, 26, 25)', hover: 'rgb(40, 41, 40)', press: 'rgb(52, 54, 52)' }

const kinds = computed(() => pluginKinds(props.plugin))
const presets = computed(() => props.plugin.overrides?.presets ?? [])
const wired = computed(() => WIRED.has(props.view.kind))
const linked = computed(() => FEEDS.has(props.view.kind))
const removing = computed(() => props.view.kind === 'removeWait' || props.view.kind === 'removing')

const countText = computed(() => {
    const i = presets.value.findIndex(p => p.id === props.view.presetId)
    return i >= 0
        ? t('apphome.gameChanges.presetIndex', { index: i + 1, count: presets.value.length })
        : t('apphome.gameChanges.presetCount', { count: presets.value.length })
})
</script>

<template>
    <div
        class="node"
        :class="[`tone-${view.tone}`, { off: view.kind === 'unknown', sel: selected }]"
    >
        <div class="head">
            <Icons
                v-for="k in kinds"
                :key="k"
                :kind="KIND_ICON[k]"
                size="small"
                color="var(--text-muted)"
            />
            <span class="mono muted">{{ kinds.map(k => t(`apphome.gameChanges.kind.${k}`)).join(' · ') }}</span>
            <span class="grow" />
            <span class="mono tag">{{ t(`components.plugin.overrides.short.${view.kind}`) }}</span>
        </div>
        <div class="name-row">
            <span class="name">{{ plugin.name }}</span>
            <span class="mono muted">v{{ plugin.version }}</span>
        </div>
        <motion.div
            class="field"
            :initial="{ backgroundColor: FIELD.rest }"
            :animate="{ backgroundColor: FIELD.rest }"
            :while-hover="{ backgroundColor: FIELD.hover }"
            :while-tap="{ backgroundColor: FIELD.press, scale: 0.98 }"
            :transition="{ duration: 0.15 }"
        >
            <span
                class="preset"
                :class="{ chosen: !!view.presetId, struck: removing }"
            >{{ view.presetId ? view.presetName : t('apphome.gameChanges.choosePreset') }}</span>
            <span class="mono muted">{{ countText }}</span>
            <Icons kind="chevron-down" size="small" class="open" color="var(--text-muted)" />
        </motion.div>
        <CompatTag
            class="compat"
            :game="plugin.gameVersions ?? []"
            :fuse="plugin.minHostVersion ?? null"
            :mismatch="mismatch"
        />
        <motion.span
            v-if="view.kind === 'applying' || view.kind === 'removing'"
            class="progress"
            :initial="{ backgroundPositionX: '0px' }"
            :animate="{ backgroundPositionX: '24px' }"
            :transition="{ duration: 0.6, ease: 'linear', repeat: Infinity }"
        />
        <span
            v-tip="linked ? t('apphome.gameChanges.unlinkTip') : t('apphome.gameChanges.linkSourceTip')"
            class="port in"
            :class="{ on: linked }"
            @pointerdown="emit('port', $event, 'in')"
        />
        <span
            v-tip="linked ? t('apphome.gameChanges.unlinkTip') : t('apphome.gameChanges.linkTip')"
            class="port out"
            :class="{ on: wired }"
            @pointerdown="emit('port', $event, 'out')"
        />
    </div>
</template>

<style scoped>
.node {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 6px;
    box-sizing: border-box;
    width: 280px;
    height: 136px;
    padding: 10px 12px;
    background: var(--black-1-s);
    border: 1px solid var(--base-600);
    corner-shape: bevel;
    border-radius: 6px 0 6px 0;
    user-select: none;
    -webkit-user-select: none;
}

.node.tone-bad {
    border-color: var(--error-highlight);
}

.node.sel {
    border-color: var(--text-muted);
}

.node.off .name,
.node.off .preset {
    color: var(--text-muted);
}

.head,
.name-row,
.field {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
}

.grow {
    flex: 1;
}

.mono {
    font-family: var(--font-microcopy);
    font-size: var(--secondary-font-size-4);
    line-height: 16px;
    white-space: nowrap;
}

.muted {
    color: var(--text-muted);
}

.tag {
    text-transform: uppercase;
    color: var(--text-muted);
}

.tone-ok .tag {
    color: var(--accent-200);
}

.tone-wait .tag {
    color: var(--accent-600);
}

.tone-bad .tag {
    color: var(--error-highlight);
}

.name-row {
    align-items: baseline;
    gap: var(--space-2);
}

.name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    font-family: var(--font-primary);
    font-size: var(--main-font-size-3);
    font-weight: var(--font-weight-2);
    line-height: 20px;
    color: var(--text-main);
    white-space: nowrap;
    text-overflow: ellipsis;
}

.field {
    height: 28px;
    padding: 0 6px 0 8px;
    corner-shape: bevel;
    border-radius: 4px 0 4px 0;
    cursor: pointer;
}

.preset {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    font-family: var(--font-primary);
    font-size: var(--main-font-size-4);
    color: var(--text-muted);
    white-space: nowrap;
    text-overflow: ellipsis;
}

.preset.chosen {
    color: var(--text-main);
}

.preset.struck {
    color: var(--text-muted);
    text-decoration: line-through;
}

.open {
    transform: rotate(-90deg);
}

.compat {
    align-self: flex-start;
}

.progress {
    position: absolute;
    left: 12px;
    right: 12px;
    bottom: 4px;
    height: 3px;
    background: repeating-linear-gradient(135deg, var(--accent-200) 0 3px, transparent 3px 6px);
}

.port {
    position: absolute;
    top: calc(50% - 4px);
    width: 8px;
    height: 8px;
    background: var(--base-600);
}

.port.in {
    left: -4px;
}

.port.out {
    right: -4px;
}

.port {
    cursor: crosshair;
}

.port::before {
    content: '';
    position: absolute;
    inset: -10px;
}

.port:hover {
    transform: scale(1.5);
}

.port.on {
    background: var(--accent-200);
}

.tone-wait .port.out.on {
    background: var(--accent-600);
}

.tone-bad .port.out.on {
    background: var(--error-highlight);
}
</style>
