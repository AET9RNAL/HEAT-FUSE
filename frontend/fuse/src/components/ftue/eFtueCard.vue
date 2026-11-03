<script setup lang="ts">
import { useId } from 'vue'
import { AnimatePresence, motion } from 'motion-v'
import eButton from '../inputs/eButton.vue'
import { Dynamics } from '../../composables/useMotion'

withDefaults(defineProps<{
    title: string
    body: string
    index: number
    total: number
    backLabel: string
    nextLabel: string
    /** Above 0, the back button fires only after a hold of this many ms. */
    backHoldMs?: number
    /** Back button labels across the hold. */
    backHoldLabels?: string[]
    /** Starts the back button hold from outside, e.g. a held Esc key. */
    backHoldActive?: boolean
    demoLabel?: string
    /** The step waits for an outside event, so Next is off. */
    nextDisabled?: boolean
    backDisabled?: boolean
    /** Vertical label on the strip. */
    tag?: string
}>(), {
    backHoldMs: 0,
    backHoldLabels: undefined,
    backHoldActive: false,
    demoLabel: '',
    nextDisabled: false,
    backDisabled: false,
    tag:'FTUE-3NG1NE',
})

const emit = defineEmits<{
    back: []
    next: []
}>()

const titleId = useId()
const bodyId = useId()

// The wipe covers the row at 40%, holds, then leaves to the right.
const WIPE = { duration: 0.6, times: [0, 0.4, 0.5, 1], ease: Dynamics.snappy.ease }
// Text shows while the wipe covers it.
const REVEAL = { duration: 0, delay: WIPE.duration * WIPE.times[1] }
</script>

<template>
    <div
        class="ftue-card"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="titleId"
        :aria-describedby="bodyId"
    >
        <div class="ftue-surface">
            <div class="ftue-inner">
                <!-- popLayout takes the old step out of the flow, so both steps slide at the same time. -->
                <AnimatePresence mode="popLayout">
                    <motion.div
                        :key="index"
                        class="ftue-content"
                        :initial="{ x: '-2%' }"
                        :animate="{ x: '0%' }"
                        :transition="Dynamics.smooth"
                    >
                        <div class="ftue-head">
                            <motion.h2
                                :id="titleId"
                                :key="`title:${title}`"
                                class="ftue-title"
                                :initial="{ opacity: 0 }"
                                :animate="{ opacity: 1 }"
                                :transition="REVEAL"
                            >{{ title }}</motion.h2>
                            <motion.span
                                class="ftue-meta"
                                :initial="{ opacity: 0 }"
                                :animate="{ opacity: 1 }"
                                :transition="REVEAL"
                            >
                                <span v-if="demoLabel" class="ftue-demo">{{ demoLabel }}</span>
                                <span class="ftue-counter">{{ index + 1 }} / {{ total }}</span>
                            </motion.span>
                            <motion.span
                                :key="`wipe:${title}`"
                                class="ftue-wipe"
                                aria-hidden="true"
                                :initial="{ x: '-101%' }"
                                :animate="{ x: ['-101%', '0%', '0%', '101%'] }"
                                :transition="WIPE"
                            />
                        </div>
                        <p :id="bodyId" class="ftue-body">{{ body }}</p>
                    </motion.div>
                </AnimatePresence>

                <div class="ftue-controls">
                    <eButton
                        size="half"
                        variant="tertiary"
                        :mode="backHoldMs > 0 ? 'hold' : 'default'"
                        :hold-ms="backHoldMs"
                        :hold-throbber="backHoldMs > 0"
                        :hold-labels="backHoldLabels"
                        :hold-active="backHoldActive"
                        :disabled="backDisabled"
                        :label="backLabel"
                        @click="emit('back')"
                    />
                    <eButton size="half" :disabled="nextDisabled" :label="nextLabel" @click="emit('next')" />
                </div>
            </div>

            <div class="ftue-strip" aria-hidden="true">
                <span class="ftue-dots" />
                <span class="ftue-tag">{{ tag }}</span>
            </div>
        </div>
    </div>
</template>

<style scoped>
/* Holds the full width. The host animates --ftue-reveal (unset = 1) to grow the surface. */
.ftue-card {
    --ftue-w: min(467px, calc(100vw - 32px));
    width: var(--ftue-w);
}

/* The surface grows from the center. Text, buttons and strip keep their size and follow its width. */
.ftue-surface {
    position: relative;
    box-sizing: border-box;
    width: calc(var(--ftue-w) * var(--ftue-reveal, 1));
    margin-inline: auto;
    background: var(--black-2-a);
    border: 1px solid var(--base-600);
    corner-shape: bevel;
    border-radius: 6px 0 6px 0;
    overflow: hidden;
}

.ftue-surface::before {
    content: '';
    position: absolute;
    inset: 0;
    backdrop-filter: blur(16px);
    pointer-events: none;
}

/* Fills the surface, so the contents lay out at the current card width. */
.ftue-inner {
    position: relative;
    z-index: 1;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: 38px;
    padding: var(--space-3) var(--space-6) var(--space-3) var(--space-5);
}

.ftue-content {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
}

.ftue-head {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    overflow: hidden;
}

.ftue-wipe {
    position: absolute;
    inset: 0;
    z-index: 1;
    background: var(--base-50);
    pointer-events: none;
}

.ftue-title {
    font-family: var(--font-primary);
    font-size: var(--main-font-size-2);
    font-weight: var(--font-weight-2);
    line-height: normal;
    color: var(--text-main);
    text-transform: uppercase;
    user-select: none;
    -webkit-user-select: none;
}

.ftue-meta {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: var(--space-2);
}

.ftue-demo {
    box-sizing: border-box;
    padding: 3px var(--space-1);
    font-family: var(--font-microcopy);
    font-size: var(--secondary-font-size-4);
    line-height: 16px;
    white-space: nowrap;
    color: var(--text-muted);
    border: 1px solid var(--base-600);
    corner-shape: bevel;
    border-radius: 6px 0 6px 0;
    user-select: none;
    -webkit-user-select: none;
}

.ftue-counter {
    flex-shrink: 0;
    box-sizing: border-box;
    min-width: 52px;
    padding: 3px var(--space-1);
    font-family: var(--font-microcopy);
    font-size: var(--secondary-font-size-4);
    line-height: 16px;
    font-variant-numeric: tabular-nums;
    text-align: center;
    white-space: nowrap;
    color: var(--black-1);
    background: var(--base-50);
    border: 1px solid var(--base-600);
    corner-shape: bevel;
    border-radius: 6px 0 6px 0;
    user-select: none;
    -webkit-user-select: none;
}

.ftue-body {
    user-select: none;
    -webkit-user-select: none;
    margin: 0;
    font-family: var(--font-microcopy);
    font-size: var(--secondary-font-size-4);
    line-height: normal;
    color: var(--text-muted);
}

.ftue-controls {
    display: flex;
    align-items: center;
    justify-content: space-between;
}

.ftue-strip {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    z-index: 2;
    width: 24px;
    background: #84ffb1;
}

.ftue-dots {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 54px;
    background: conic-gradient(from 270deg at 2px 2px, var(--black-1) 25%, transparent 0) 6px 5px / 10px 10px;
}

.ftue-tag {
    position: absolute;
    bottom: 17px;
    left: 50%;
    writing-mode: vertical-rl;
    transform: translateX(-50%) rotate(180deg);
    font-family: var(--font-microcopy);
    font-size: var(--secondary-font-size-5);
    line-height: 10px;
    color: var(--black-1);
    user-select: none;
    -webkit-user-select: none;
}
</style>
