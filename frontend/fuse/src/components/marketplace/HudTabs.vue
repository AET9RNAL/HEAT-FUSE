<script setup lang="ts" generic="K extends string">
import { motion } from 'motion-v'
import { Dynamics } from '../../composables/useMotion'

export interface HudTab<T extends string = string> {
    key: T
    label: string
    count?: number
}

defineProps<{ tabs: HudTab<K>[] }>()
const model = defineModel<K>({ required: true })

const pad = (n: number) => String(n).padStart(2, '0')

const SHOWN = 'inset(0% 0% 0% 0%)'
const GONE = 'inset(0% 100% 0% 0%)'
</script>

<template>
    <div class="tabs" role="tablist">
        <button
            v-for="(tab, i) in tabs"
            :key="tab.key"
            class="tab"
            :class="{ on: model === tab.key }"
            role="tab"
            :aria-selected="model === tab.key"
            @click="model = tab.key"
        >
            <span class="tab-face tab-base">
                <span class="tab-idx">{{ pad(i + 1) }}</span>
                <span class="tab-label">{{ tab.label }}</span>
                <span v-if="tab.count !== undefined" class="tab-count">{{ pad(tab.count) }}</span>
            </span>
            <motion.span
                class="tab-face tab-ink"
                aria-hidden="true"
                :initial="false"
                :animate="{ clipPath: model === tab.key ? SHOWN : GONE }"
                :transition="Dynamics.snappy"
            >
                <span class="tab-idx">{{ pad(i + 1) }}</span>
                <span class="tab-label">{{ tab.label }}</span>
                <span v-if="tab.count !== undefined" class="tab-count">{{ pad(tab.count) }}</span>
            </motion.span>
        </button>
        <span class="tabs-rule" aria-hidden="true" />
        <span class="tabs-aside">
            <slot name="aside" />
        </span>
    </div>
</template>

<style scoped>
.tabs {
    display: flex;
    align-items: flex-end;
    gap: 2px;
    flex-shrink: 0;
}

.tab {
    position: relative;
    height: 30px;
    padding: 0;
    border: none;
    background: none;
    cursor: pointer;
    flex-shrink: 0;
}

.tab-face {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    height: 100%;
    padding: 0 var(--space-4) 0 var(--space-3);
    box-sizing: border-box;
    border: 1px solid var(--base-600);
    border-bottom: none;
    corner-shape: bevel;
    border-radius: 0 10px 0 0;
    user-select: none;
    -webkit-user-select: none;
}

.tab:hover .tab-base {
    border-color: var(--base-200);
}

.tab-ink {
    position: absolute;
    inset: 0;
    background: var(--base-50);
    border-color: var(--base-50);
    pointer-events: none;
}

.tab-idx {
    font-family: var(--font-microcopy);
    font-size: var(--secondary-font-size-5);
    color: var(--base-600);
}

.tab-label {
    font-family: var(--font-primary);
    font-size: var(--main-font-size-3);
    font-weight: var(--font-weight-2);
    text-transform: uppercase;
    color: var(--text-muted);
    white-space: nowrap;
}

.tab:hover .tab-base .tab-label {
    color: var(--text-main);
}

.tab-count {
    font-family: var(--font-microcopy);
    font-size: var(--secondary-font-size-4);
    color: var(--text-muted);
}

.tab-ink .tab-idx,
.tab-ink .tab-label,
.tab-ink .tab-count {
    color: var(--black-1);
}

.tab-ink .tab-idx {
    color: var(--black-3);
}

.tabs-rule {
    position: relative;
    flex: 1;
    align-self: stretch;
    min-width: var(--space-4);
    border-bottom: 1px solid var(--base-600);
}

.tabs-rule::after {
    content: '';
    position: absolute;
    right: 0;
    bottom: 0;
    width: 1px;
    height: 6px;
    background: var(--base-200);
}

.tabs-aside {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: 0 0 var(--space-1) var(--space-3);
}
</style>
