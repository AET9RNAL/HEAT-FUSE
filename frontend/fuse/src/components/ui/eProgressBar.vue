<script setup lang="ts">
import { computed } from 'vue'
import { motion } from 'motion-v'
import { Dynamics } from '../../composables/useMotion'

const props = withDefaults(defineProps<{
    /** Share from 0 to 1. */
    value: number
    color?: string
    /** Entry delay in seconds, to stagger bars in a list. */
    delay?: number
}>(), {
    color: 'var(--accent-200)',
    delay: 0,
})

const width = computed(() => `${Math.round(Math.min(1, Math.max(0, props.value)) * 100)}%`)
</script>

<template>
    <span
        class="e-progress-bar"
        role="progressbar"
        aria-valuemin="0"
        aria-valuemax="100"
        :aria-valuenow="Math.round(value * 100)"
        :style="{ '--ico': color }"
    >
        <motion.span
            class="fill"
            :initial="{ width: '0%' }"
            :animate="{ width }"
            :transition="{ ...Dynamics.smooth, delay }"
        />
    </span>
</template>

<style scoped>
.e-progress-bar {
    position: relative;
    display: block;
    height: 6px;
    background: color-mix(in srgb, var(--base-600) 55%, transparent);
}

.fill {
    display: block;
    height: 100%;
    min-width: 2px;
    background:
        repeating-linear-gradient(135deg, var(--ico) 0 2px, transparent 2px 5px),
        color-mix(in srgb, var(--ico) 22%, transparent);
}
</style>
