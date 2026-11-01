<script setup lang="ts">
import { computed } from 'vue'
import { motion } from 'motion-v'

const props = withDefaults(defineProps<{
    /** 0..1, from the auth store so the bar and the submit button never disagree. */
    strength?: number
    /** Below the hard policy but non-empty - the bar reads as a failure, not as "weak". */
    invalid?: boolean
}>(), {
    strength: 0,
    invalid: false,
})

const fillWidth = computed(() => `${Math.min(Math.max(props.strength, 0), 1) * 100}%`)

const fillColor = computed(() => {
    if (props.invalid) return 'var(--error-base)'
    if (props.strength >= 0.8) return 'var(--accent-50)'
    if (props.strength >= 0.6) return 'var(--accent-200)'
    return 'var(--base-200)'
})
</script>

<template>
    <div class="pass-strength">
        <div class="track" />
        <motion.div
            class="fill"
            :animate="{ width: props.invalid ? '100%' : fillWidth, backgroundColor: fillColor }"
            :transition="{ duration: 0.25, ease: 'easeOut' }"
        />
    </div>
</template>

<style scoped>
.pass-strength {
    position: relative;
    width: 100%;
    height: 4px;
    padding: var(--space-0);
    box-sizing: border-box;
}

.track,
.fill {
    position: absolute;
    top: 50%;
    left: var(--space-0);
    height: 1px;
}

.track {
    right: var(--space-0);
    background: var(--base-600);
}

.fill {
    width: 0;
    background: var(--base-200);
}
</style>
