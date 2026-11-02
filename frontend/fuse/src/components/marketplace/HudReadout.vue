<script setup lang="ts">
import { AnimatePresence, motion } from 'motion-v'
import { Dynamics } from '../../composables/useMotion'

export interface ReadoutCell {
    label: string
    value: string
    /** warn: the value needs the creator, for example files that wait for an action. */
    tone?: 'warn'
}

defineProps<{ cells: ReadoutCell[] }>()
</script>

<template>
    <div class="ro">
        <div v-for="c in cells" :key="c.label" class="ro-cell">
            <span class="ro-label">{{ c.label }}</span>
            <span class="ro-value" :class="c.tone">
                <!-- A new value rolls in from the top. -->
                <AnimatePresence :initial="false" mode="wait">
                    <motion.span
                        :key="c.value"
                        class="ro-roll"
                        :initial="{ opacity: 0, y: -10 }"
                        :animate="{ opacity: 1, y: 0 }"
                        :exit="{ opacity: 0, y: 10 }"
                        :transition="Dynamics.quick"
                    >{{ c.value }}</motion.span>
                </AnimatePresence>
            </span>
        </div>
    </div>
</template>

<style scoped>
.ro {
    display: flex;
    align-items: center;
    min-width: 0;
}

.ro-cell {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    padding: 0 var(--space-5);
    border-left: 1px solid var(--base-600);
}

.ro-cell:first-child {
    padding-left: 0;
    border-left: none;
}

.ro-label {
    font-family: var(--font-microcopy);
    font-size: var(--secondary-font-size-5);
    font-weight: var(--font-weight-2);
    line-height: 10px;
    color: var(--text-muted);
    text-transform: uppercase;
    white-space: nowrap;
    user-select: none;
    -webkit-user-select: none;
}

.ro-value {
    display: block;
    height: 31px;
    overflow: hidden;
    font-family: var(--font-microcopy);
    font-size: 24px;
    font-weight: var(--font-weight-2);
    line-height: 31px;
    color: var(--text-main);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
}

.ro-value.warn {
    color: var(--accent-600);
}

.ro-roll {
    display: block;
}
</style>
