<script setup lang="ts">
import { computed } from 'vue'
import { motion } from 'motion-v'
import { Dynamics } from '../composables/useMotion'

export type KeyVariant = 'functional' | 'standalone' | 'error'

const props = withDefaults(defineProps<{
    label?: string
    variant?: KeyVariant
}>(), {
    label: '',
    variant: 'functional',
})

// No label yet = idle: the frame is up in anticipation of the keystroke
const isIdle = computed(() => props.label.length === 0)
const isError = computed(() => props.variant === 'error')

const SWEEP = { duration: 1.1, repeat: Infinity, ease: 'linear' as const }
// Impact: the outline throws off a wave that scales out and fades
const IMPACT = { duration: 0.3, ease: 'easeOut' as const, repeat:3 }

</script>

<template>
    <div class="e-key" :class="[variant, { idle: isIdle }]">
        <div class="key-surface">
            <motion.div
                v-if="isIdle"
                class="key-sweep"
                :initial="{ x: '-160%' }"
                :animate="{ x: '160%' }"
                :transition="SWEEP"
            />
        </div>

        <motion.div
            v-if="isError"
            class="key-impact"
            :initial="{ scale: 1, opacity: 0.9 }"
            :animate="{ scale: 1.9, opacity: 0 }"
            :transition="IMPACT"
        />
        <motion.span
            v-if="!isIdle"
            class="key-label"
            :initial="{ scale: 0.6, opacity: 0 }"
            :animate="{ scale: 1, opacity: 1 }"
            :transition="Dynamics.snappy"
        >{{ label }}</motion.span>

    </div>
</template>

<style scoped>
.e-key {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 32px;
    min-height: 28px;
    padding: var(--space-0);
    box-sizing: border-box;
    user-select: none;
    -webkit-user-select: none;
}

/* Carries the fill and the chamfer; clipped so the sweep stays inside */
.key-surface {
    position: absolute;
    inset: 0;
    overflow: hidden;
    box-sizing: border-box;
    background: var(--black-1-a);
    border: 1px solid var(--base-600);
    corner-shape: bevel;
    border-radius: 6px 0 6px 0;
}

/* The bound key itself, as opposed to its modifiers */
.e-key.standalone .key-surface {
    background: var(--accent-200, #84ffb1);
}

.e-key.error .key-surface {
    background: var(--error-base);
}

.key-label {
    position: relative;
    z-index: 1;
    font-family: var(--font-primary);
    font-size: var(--main-font-size-2);
    font-weight: var(--font-weight-2);
    color: var(--text-main);
    line-height: 1;
    white-space: nowrap;
}

.e-key.standalone .key-label {
    color: var(--black-1);
}

.e-key.error .key-label {
    color: var(--text-main);
}

.key-impact {
    position: absolute;
    inset: 0;
    box-sizing: border-box;
    pointer-events: none;
    z-index: 2;
    border: 1px solid var(--error-base);
    corner-shape: bevel;
    border-radius: 6px 0 6px 0;
    filter:
        drop-shadow(0 0 2px var(--error-highlight))
        drop-shadow(0 0 6px var(--error-base));
}

.key-sweep {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    width: 60%;
    pointer-events: none;
    background: linear-gradient(
        90deg,
        transparent,
        rgba(197, 255, 218, 0.22),
        transparent
    );
}

</style>
