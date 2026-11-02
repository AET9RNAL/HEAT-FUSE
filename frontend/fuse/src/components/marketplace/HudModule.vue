<script setup lang="ts">
import { motion } from 'motion-v'
import { Dynamics } from '../../composables/useMotion'

const props = withDefaults(defineProps<{
    title: string
    /** Code name of the module*/
    serial?: string
    note?: string
    /** Entry order on the page. Each step delays the entry a little. */
    index?: number
    strip?: 'none' | 'neutral' | 'accent'
}>(), { serial: '', note: '', index: 0, strip: 'none' })

const STAGGER = 0.06
const delay = props.index * STAGGER

const WIPE = { duration: 0.6, times: [0, 0.4, 0.5, 1], ease: Dynamics.snappy.ease, delay }
const REVEAL = { duration: 0, delay: delay + 0.24 }
</script>

<template>
    <motion.section
        class="hud"
        :class="`strip-${strip}`"
        :initial="{ opacity: 0, y: 10 }"
        :animate="{ opacity: 1, y: 0 }"
        :transition="{ ...Dynamics.snappy, delay }"
    >
        <div class="hud-surface" />

        <header class="hud-head">
            <div class="hud-head-surface" />
            <span class="hud-title-box">
                <motion.h3
                    :key="title"
                    class="hud-title"
                    :initial="{ opacity: 0 }"
                    :animate="{ opacity: 1 }"
                    :transition="REVEAL"
                >{{ title }}</motion.h3>
                <motion.span
                    :key="`wipe:${title}`"
                    class="hud-wipe"
                    aria-hidden="true"
                    :initial="{ x: '-101%' }"
                    :animate="{ x: ['-101%', '0%', '0%', '101%'] }"
                    :transition="WIPE"
                />
            </span>
            <span v-if="note" class="hud-note">{{ note }}</span>
            <span class="hud-aside">
                <slot name="aside" />
                <span v-if="serial && strip === 'none'" class="hud-code">{{ serial }}</span>
            </span>
        </header>

        <div class="hud-body">
            <slot />
        </div>

        <div v-if="strip !== 'none'" class="hud-strip" aria-hidden="true">
            <span class="hud-dots" />
            <span class="hud-serial">{{ serial }}</span>
        </div>
        <span v-else class="hud-bracket" aria-hidden="true" />
    </motion.section>
</template>

<style scoped>
.hud {
    --strip-w: 0px;
    position: relative;
    display: flex;
    flex-direction: column;
    min-width: 0;
    padding: 0 calc(var(--space-3) + var(--strip-w)) var(--space-3) var(--space-3);
    box-sizing: border-box;
}

.hud.strip-neutral,
.hud.strip-accent {
    --strip-w: 24px;
}

.hud-surface {
    position: absolute;
    inset: 0;
    box-sizing: border-box;
    background: var(--black-1-a);
    border: 1px solid var(--base-600);
    corner-shape: bevel;
    border-radius: 6px 0 6px 0;
    pointer-events: none;
}

.hud-head {
    position: relative;
    display: flex;
    align-items: center;
    gap: var(--space-3);
    height: 46px;
    margin-bottom: var(--space-3);
    flex-shrink: 0;
}

.hud-head-surface {
    position: absolute;
    top: 0;
    left: calc(-1 * var(--space-3));
    right: calc(-1 * (var(--space-3) + var(--strip-w)));
    height: 100%;
    box-sizing: border-box;
    background: var(--black-3-a);
    border: 1px solid var(--base-600);
    border-bottom: none;
    corner-shape: bevel;
    border-radius: 6px 0 0 0;
    pointer-events: none;
}

.hud-title-box {
    position: relative;
    min-width: 0;
    overflow: hidden;
}

.hud-title {
    margin: 0;
    font-family: var(--font-primary);
    font-size: var(--main-font-size-2);
    font-weight: var(--font-weight-2);
    line-height: normal;
    color: var(--text-main);
    text-transform: uppercase;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    user-select: none;
    -webkit-user-select: none;
}

.hud-wipe {
    position: absolute;
    inset: 0;
    background: var(--base-50);
    pointer-events: none;
}

.hud-note {
    position: relative;
    font-family: var(--font-microcopy);
    font-size: var(--secondary-font-size-4);
    color: var(--text-muted);
    white-space: nowrap;
    user-select: none;
    -webkit-user-select: none;
}

.hud-aside {
    position: relative;
    display: flex;
    align-items: center;
    gap: var(--space-3);
    margin-left: auto;
    flex-shrink: 0;
}

.hud-code {
    font-family: var(--font-microcopy);
    font-size: var(--secondary-font-size-5);
    letter-spacing: 0.12em;
    color: var(--base-600);
    user-select: none;
    -webkit-user-select: none;
}

.hud-body {
    position: relative;
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
}

.hud-strip {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    z-index: 1;
    width: var(--strip-w);
    corner-shape: bevel;
    border-radius: 0 0 6px 0;
}

.strip-accent .hud-strip {
    --strip-ink: var(--black-1);
    background: var(--accent-200);
}

.strip-neutral .hud-strip {
    --strip-ink: var(--text-muted);
    background: var(--black-3);
    border-left: 1px solid var(--base-600);
}

.hud-dots {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 54px;
    background: conic-gradient(from 270deg at 2px 2px, var(--strip-ink) 25%, transparent 0) 6px 5px / 10px 10px;
}

.hud-serial {
    position: absolute;
    bottom: 17px;
    left: 50%;
    writing-mode: vertical-rl;
    transform: translateX(-50%) rotate(180deg);
    font-family: var(--font-microcopy);
    font-size: var(--secondary-font-size-5);
    line-height: 10px;
    letter-spacing: 0.08em;
    color: var(--strip-ink);
    white-space: nowrap;
    user-select: none;
    -webkit-user-select: none;
}

.hud-bracket {
    position: absolute;
    top: 5px;
    right: 5px;
    width: 9px;
    height: 9px;
    border-top: 1px solid color-mix(in srgb, var(--base-200) 45%, transparent);
    border-right: 1px solid color-mix(in srgb, var(--base-200) 45%, transparent);
    pointer-events: none;
}
</style>
