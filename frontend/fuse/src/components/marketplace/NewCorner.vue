<script setup lang="ts">
import { computed } from 'vue'
import { motion } from 'motion-v'
import { Dynamics } from '../../composables/useMotion'

const props = withDefaults(defineProps<{
    label: string
    /** Length of each leg of the triangle, in px. */
    size?: number
}>(), { size: 48 })

// Halfway from the corner to the long edge, the triangle is wide enough for the longest locale word.
const labelAt = computed(() => {
    const d = props.size / (2 * Math.SQRT2)
    return { left: `${props.size - d}px`, top: `${d}px` }
})

const edge = computed(() => {
    const a = props.size - 0.5
    return `0.5,0.5 ${a},0.5 ${a},${a}`
})
</script>

<template>
    <span class="nc" :style="{ width: `${size}px`, height: `${size}px` }">
        <span class="nc-base" />

        <motion.span
            class="nc-lit"
            :initial="{ scale: 0 }"
            :animate="{ scale: 1 }"
            :transition="Dynamics.snappy"
        />

        <svg class="nc-edge" :width="size" :height="size" aria-hidden="true">
            <polygon :points="edge" />
        </svg>

        <span class="nc-label" :style="labelAt">
            <motion.span
                class="nc-text"
                :initial="{ scale: 0.4, opacity: 0 }"
                :animate="{ scale: 1, opacity: 1 }"
                :transition="Dynamics.snappy"
            >{{ label }}</motion.span>
        </span>
    </span>
</template>

<style scoped>
/* The VisibilityCorner look in its listed state, without the button. It sits on the top-right corner of the nearest positioned parent. */
.nc {
    position: absolute;
    top: 0;
    right: 0;
    display: block;
    pointer-events: none;
    clip-path: polygon(0 0, 100% 0, 100% 100%);
}

.nc-base,
.nc-lit {
    position: absolute;
    inset: 0;
    clip-path: polygon(0 0, 100% 0, 100% 100%);
}

.nc-base {
    background: repeating-linear-gradient(45deg, var(--base-600) 0 1px, transparent 1px 5px);
    opacity: 0.55;
}

.nc-lit {
    background:
        conic-gradient(from 270deg at 2px 2px, rgba(0, 0, 0, 0.22) 25%, transparent 0) 3px 3px / 7px 7px,
        var(--accent-200);
    transform-origin: 100% 0;
}

.nc-edge {
    position: absolute;
    top: 0;
    left: 0;
    overflow: visible;
}

.nc-edge polygon {
    fill: none;
    stroke: var(--accent-200);
    stroke-width: 1;
}

.nc-label {
    position: absolute;
    display: flex;
    transform: translate(-50%, -50%) rotate(45deg);
}

.nc-text {
    display: block;
    font-family: var(--font-microcopy);
    font-size: 8px;
    font-weight: 600;
    line-height: 1;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    white-space: nowrap;
    color: var(--black-1);
    user-select: none;
}
</style>
