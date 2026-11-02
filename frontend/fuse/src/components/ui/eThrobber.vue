<script setup lang="ts">
import { computed } from 'vue'
import { motion } from 'motion-v'

const props = withDefaults(defineProps<{
    progress?: number
    active?: boolean
    /** danger semantics */
    tone?: 'accent' | 'danger'
}>(), {
    progress: 0,
    active: false,
    tone: 'accent',
})

const GRID = 4
const DOT = 2
const PITCH = 4
const SIZE = DOT + PITCH * (GRID - 1)
const FRONTS = GRID * 2 - 1

const dots = Array.from({ length: GRID * GRID }, (_, i) => {
    const col = i % GRID
    const row = Math.floor(i / GRID)
    return { key: i, x: col * PITCH, y: row * PITCH, front: col + row }
})

const litFronts = computed(() => Math.min(FRONTS, Math.floor(props.progress * FRONTS)))
</script>

<template>
    <svg
        class="e-throbber"
        :class="`tone-${tone}`"
        :width="SIZE"
        :height="SIZE"
        :viewBox="`0 0 ${SIZE} ${SIZE}`"
        aria-hidden="true"
    >
        <template v-for="d in dots" :key="d.key">
            <rect
                :x="d.x"
                :y="d.y"
                :width="DOT"
                :height="DOT"
                :class="d.front < litFronts ? 'dot-lit' : 'dot-off'"
            />
            <motion.rect
                v-if="active && d.front === litFronts"
                class="dot-lit"
                :x="d.x"
                :y="d.y"
                :width="DOT"
                :height="DOT"
                :initial="{ opacity: 0 }"
                :animate="{ opacity: [0, 1, 0] }"
                :transition="{ duration: 0.6, repeat: Infinity, ease: 'easeInOut' }"
            />
        </template>
    </svg>
</template>

<style scoped>
.e-throbber {
    flex-shrink: 0;
    display: block;
}

.dot-off {
    fill: var(--base-600);
}

.dot-lit {
    fill: #84ffb1;
}

.tone-danger .dot-lit {
    fill: var(--error-highlight);
}
</style>
