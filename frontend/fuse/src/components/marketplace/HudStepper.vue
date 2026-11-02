<script setup lang="ts">
import { motion, AnimatePresence } from 'motion-v'
import { Dynamics } from '../../composables/useMotion'
import Icons from '../ui/Icons.vue'

export interface HudStep {
    key: string
    label: string
    hint: string
    /** Code name of the stage */
    serial: string
}

const props = defineProps<{ steps: HudStep[]; index: number }>()

type StepState = 'done' | 'on' | 'todo'
const stateOf = (i: number): StepState => i < props.index ? 'done' : i === props.index ? 'on' : 'todo'
const pad = (n: number) => String(n).padStart(2, '0')

const CRAWL = { duration: 0.8, repeat: Infinity, ease: 'linear' as const }
const CRAWL_X = 4 * Math.SQRT2
</script>

<template>
    <ol class="st">
        <li v-for="(s, i) in steps" :key="s.key" class="st-step" :class="stateOf(i)">
            <div class="st-head">
                <span class="st-num">
                    <AnimatePresence :initial="false" mode="popLayout">
                        <motion.span
                            :key="stateOf(i)"
                            class="st-num-face"
                            :initial="{ scale: 0.5, opacity: 0 }"
                            :animate="{ scale: 1, opacity: 1 }"
                            :exit="{ scale: 0.5, opacity: 0 }"
                            :transition="Dynamics.snappy"
                        >
                            <Icons v-if="stateOf(i) === 'done'" kind="checkmark" size="small" color="var(--black-1)" />
                            <template v-else>{{ pad(i + 1) }}</template>
                        </motion.span>
                    </AnimatePresence>
                </span>
                <span class="st-name">{{ s.label }}</span>
                <span class="st-serial">{{ s.serial }}</span>
            </div>
            <span class="st-hint">{{ s.hint }}</span>

            <div class="st-track">
                <motion.span
                    class="st-solid"
                    :initial="false"
                    :animate="{ scaleX: stateOf(i) === 'done' ? 1 : 0 }"
                    :transition="Dynamics.snappy"
                />
                <motion.span
                    class="st-open"
                    :initial="false"
                    :animate="{ opacity: stateOf(i) === 'on' ? 1 : 0 }"
                    :transition="Dynamics.quick"
                >
                    <motion.span
                        class="st-hatch"
                        :initial="{ x: 0 }"
                        :animate="{ x: CRAWL_X }"
                        :transition="CRAWL"
                    />
                </motion.span>
            </div>
        </li>
    </ol>
</template>

<style scoped>
.st {
    user-select: none;
    -webkit-user-select: none;
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: minmax(0, 1fr);
    gap: var(--space-1);
    margin: 0;
    padding: 0;
    list-style: none;
    flex-shrink: 0;
}

.st-step {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
}

.st-head {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
}

.st-num {
    position: relative;
    width: 22px;
    height: 22px;
    flex-shrink: 0;
}

.st-num-face {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    border: 1px solid var(--base-600);
    corner-shape: bevel;
    border-radius: 5px 0 5px 0;
    font-family: var(--font-microcopy);
    font-size: var(--secondary-font-size-4);
    font-weight: var(--font-weight-2);
    color: var(--text-muted);
    user-select: none;
    -webkit-user-select: none;
}

.on .st-num-face {
    background: var(--base-50);
    border-color: var(--base-50);
    color: var(--black-1);
}

.done .st-num-face {
    background: var(--accent-200);
    border-color: var(--accent-200);
}

.st-name {
    font-family: var(--font-primary);
    font-size: var(--main-font-size-3);
    font-weight: var(--font-weight-2);
    text-transform: uppercase;
    color: var(--text-muted);
    white-space: nowrap;
    user-select: none;
    -webkit-user-select: none;
}

.on .st-name,
.done .st-name {
    color: var(--text-main);
}

.st-serial {
    margin-left: auto;
    font-family: var(--font-microcopy);
    font-size: var(--secondary-font-size-5);
    letter-spacing: 0.12em;
    color: var(--base-600);
    white-space: nowrap;
    user-select: none;
    -webkit-user-select: none;
}

.st-hint {
    padding-left: 30px;
    font-family: var(--font-primary);
    font-size: var(--main-font-size-4);
    color: var(--text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.todo .st-hint {
    color: var(--base-600);
}

/* A ruler: minor ticks every 6 px on a baseline. Done fills solid, the open stage crawls. */
.st-track {
    position: relative;
    height: 8px;
    margin-top: var(--space-2);
    overflow: hidden;
    border-bottom: 1px solid var(--base-600);
    background: repeating-linear-gradient(90deg, var(--base-600) 0 1px, transparent 1px 6px) 0 100% / 100% 4px no-repeat;
}

.st-solid {
    position: absolute;
    inset: 0;
    background: var(--accent-200);
    transform-origin: 0 50%;
}

.st-open {
    position: absolute;
    inset: 0;
    overflow: hidden;
    border-left: 2px solid var(--base-50);
}

/* 45° hatch with a 4 px period, so one loop moves it 4√2 px to the right. */
.st-hatch {
    position: absolute;
    top: 0;
    bottom: 0;
    left: -6px;
    right: 0;
    background: repeating-linear-gradient(45deg, var(--base-200) 0 1.5px, transparent 1.5px 4px);
}
</style>
