<script setup lang="ts">
import { ref } from 'vue'
import { motion } from 'motion-v'
import { Dynamics } from '../composables/useMotion'

export interface BrowserTab {
    value: string
    label: string
}

defineProps<{
    tabs: BrowserTab[]
    modelValue: string
}>()

defineEmits<{ 'update:modelValue': [value: string] }>()

const hovered = ref<string | null>(null)
</script>

<template>
    <div class="tab-bar">
        <button
            v-for="tab in tabs"
            :key="tab.value"
            class="tab"
            :class="{ active: tab.value === modelValue }"
            type="button"
            @click="$emit('update:modelValue', tab.value)"
            @mouseenter="hovered = tab.value"
            @mouseleave="hovered = null"
        >
            <span class="tab-label">{{ tab.label }}</span>
            <motion.div
                class="tab-underline"
                :initial="{ scaleX: 0 }"
                :animate="{ scaleX: tab.value === modelValue || hovered === tab.value ? 1 : 0 }"
                :transition="Dynamics.snappy"
            />
        </button>
    </div>
</template>

<style scoped>
.tab-bar {
    display: flex;
    align-items: flex-start;
    gap: 28px;
    width: 100%;
    flex-shrink: 0;
    border-bottom: 2px solid var(--base-600);
}

.tab {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    height: 32px;
    min-width: 92px;
    padding: 0 0 var(--space-1);
    background: none;
    border: none;
    cursor: pointer;
}

.tab-underline {
    position: absolute;
    left: 0;
    right: 0;
    bottom: -2px;
    height: 4px;
    background: var(--accent-200);
    transform-origin: center;
}

.tab:hover { background: var(--black-2-a); }

.tab-label {
    user-select: none;
    -webkit-user-select: none;
    font-family: var(--font-primary);
    font-size: var(--main-font-size-2);
    font-weight: var(--font-weight-1);
    color: var(--text-muted);
    text-transform: uppercase;
    white-space: nowrap;
    transition: color 0.15s;
}

.tab:hover .tab-label,
.tab.active .tab-label { color: var(--text-main); }
</style>
