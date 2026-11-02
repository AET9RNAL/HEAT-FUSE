<script setup lang="ts">
import { ref, computed } from 'vue'
import { AnimatePresence, motion } from 'motion-v'
import { Dynamics } from '../../composables/useMotion'
import Icons, { type IconKind } from '../ui/Icons.vue'

export type Visibility = 'listed' | 'hidden' | 'locked'

const props = withDefaults(defineProps<{
    state: Visibility
    busy?: boolean
    /** Length of each leg of the triangle, in px. */
    size?: number
    tip?: string
}>(), { busy: false, size: 56, tip: '' })

const emit = defineEmits<{ toggle: [] }>()

const hover = ref(false)

const lit = computed(() => {
    if (props.state === 'locked') return 0
    if (props.state === 'listed') return hover.value ? 0.82 : 1
    return hover.value ? 0.42 : 0
})

const ICON: Record<Visibility, IconKind> = { listed: 'views', hidden: 'hide', locked: 'lock' }
const INK: Record<Visibility, string> = { listed: 'var(--black-1)', hidden: 'var(--base-200)', locked: 'var(--base-600)' }

const ICON_PX = 16
const iconAt = computed(() => {
    const r = props.size * (1 - Math.SQRT1_2)
    return { left: `${props.size - r - ICON_PX / 2}px`, top: `${r - ICON_PX / 2}px` }
})

const edge = computed(() => {
    const a = props.size - 0.5
    return `0.5,0.5 ${a},0.5 ${a},${a}`
})

function onClick() {
    if (props.state === 'locked' || props.busy) return
    emit('toggle')
}
</script>

<template>
    <motion.button
        v-tip="tip"
        class="vc"
        :class="[state, { busy }]"
        :style="{ width: `${size}px`, height: `${size}px` }"
        :aria-pressed="state === 'listed'"
        :aria-disabled="state === 'locked' || busy"
        :aria-label="tip"
        :while-press="state === 'locked' ? undefined : { scale: 0.94 }"
        :transition="Dynamics.quick"
        @hover-start="hover = true"
        @hover-end="hover = false"
        @click="onClick"
    >
        <span class="vc-base" />

        <motion.span
            class="vc-lit"
            :initial="false"
            :animate="{ scale: lit }"
            :transition="Dynamics.snappy"
        />

        <motion.span
            v-if="busy"
            class="vc-sweep"
            :initial="{ x: '-120%', y: '-120%' }"
            :animate="{ x: '120%', y: '120%' }"
            :transition="{ duration: 0.9, repeat: Infinity, ease: 'linear' }"
        />

        <svg class="vc-edge" :width="size" :height="size" aria-hidden="true">
            <polygon :points="edge" />
        </svg>

        <AnimatePresence :initial="false" mode="popLayout">
            <motion.span
                :key="state"
                class="vc-icon"
                :style="iconAt"
                :initial="{ scale: 0.4, opacity: 0 }"
                :animate="{ scale: 1, opacity: 1 }"
                :exit="{ scale: 0.4, opacity: 0 }"
                :transition="Dynamics.snappy"
            >
                <Icons :kind="ICON[state]" size="normal" :color="INK[state]" />
            </motion.span>
        </AnimatePresence>
    </motion.button>
</template>

<style scoped>
/* The cut-off corner of a HudFrame. Only the triangle takes clicks. */
.vc {
    position: relative;
    display: block;
    padding: 0;
    border: none;
    background: none;
    cursor: pointer;
    clip-path: polygon(0 0, 100% 0, 100% 100%);
    outline: none;
}

.vc.locked,
.vc.busy {
    cursor: default;
}

.vc-base,
.vc-lit,
.vc-sweep {
    position: absolute;
    inset: 0;
    clip-path: polygon(0 0, 100% 0, 100% 100%);
    pointer-events: none;
}

/* 45° hatch, parallel to the long edge. */
.vc-base {
    background: repeating-linear-gradient(45deg, var(--base-600) 0 1px, transparent 1px 5px);
    opacity: 0.55;
}

.vc.locked .vc-base {
    background: conic-gradient(from 270deg at 1px 1px, var(--base-600) 25%, transparent 0) 0 0 / 5px 5px;
    opacity: 0.6;
}

.vc-lit {
    background:
        conic-gradient(from 270deg at 2px 2px, rgba(0, 0, 0, 0.22) 25%, transparent 0) 3px 3px / 7px 7px,
        var(--accent-200);
    transform-origin: 100% 0;
}

.vc-sweep {
    background: linear-gradient(135deg, transparent 35%, rgba(255, 255, 255, 0.35) 50%, transparent 65%);
}

.vc-edge {
    position: absolute;
    top: 0;
    left: 0;
    overflow: visible;
    pointer-events: none;
}

.vc-edge polygon {
    fill: none;
    stroke: var(--base-600);
    stroke-width: 1;
}

.vc.listed .vc-edge polygon {
    stroke: var(--accent-200);
}

.vc.hidden:hover .vc-edge polygon,
.vc.hidden:focus-visible .vc-edge polygon {
    stroke: var(--accent-200);
}

.vc.locked .vc-edge polygon {
    stroke-dasharray: 2 3;
}

.vc-icon {
    position: absolute;
    display: flex;
    line-height: 0;
    pointer-events: none;
}
</style>
