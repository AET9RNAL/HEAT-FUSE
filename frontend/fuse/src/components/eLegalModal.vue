<script setup lang="ts">
import { motion } from 'motion-v'
import Icons from './Icons.vue'

defineProps<{
    title: string
    subtitle?: string
}>()

const emit = defineEmits<{ close: [] }>()


function close() { emit('close') }
</script>

<template>
    <Teleport to="body">
    <div class="legal-backdrop" @mousedown.self="close">
        <motion.div
            class="legal-motion"
            :initial="{ opacity: 0, scale: 0.96 }"
            :animate="{ opacity: 1, scale: 1 }"
            :exit="{ opacity: 0, scale: 0.96 }"
            :transition="{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }"
        >
            <div class="legal-panel">
                <div class="panel-blur" />
                <div class="panel-scale">
                    <div class="panel-inner">
                        <div class="panel-header">
                            <Icons kind="fuse-logo-full" size="xlarge" class="panel-logo" />
                            <div class="panel-title-group">
                                <span class="panel-name">{{ title }}</span>
                                <span v-if="subtitle" class="panel-sub">{{ subtitle }}</span>
                            </div>
                            <button v-tip="'Close'" class="close-btn" @click="close">
                                <Icons kind="cross" size="normal" />
                            </button>
                        </div>

                        <div class="panel-body">
                            <slot />
                        </div>
                    </div>
                </div>
            </div>
        </motion.div>
    </div>
    </Teleport>
</template>

<style scoped>
.legal-backdrop {
    position: fixed;
    top: 48px;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 10001;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-5);
    background: rgba(0, 0, 0, 0.6);
}

.legal-motion {
    position: relative;
    width: 100%;
    max-width: 560px;
    height: 100%;
    max-height: 640px;
}

.legal-panel {
    position: relative;
    z-index: 1;
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    background: hsla(142, 10%, 4%, 0.92);
    box-sizing: border-box;
    border: 1px solid var(--base-600);
    corner-shape: bevel;
    border-radius: 8px 0 8px 0;
    box-shadow: 0 8px 32px rgba(0,0,0,0.5);
}

.panel-blur {
    position: absolute;
    inset: 0;
    z-index: 0;
    backdrop-filter: blur(35px);
    -webkit-backdrop-filter: blur(35px);
    corner-shape: bevel;
    border-radius: 8px 0 8px 0;
    pointer-events: none;
}

.panel-scale {
    position: relative;
    z-index: 1;
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
}

.panel-inner {
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
}

.panel-header {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    border-bottom: 1px solid rgba(255,255,255,0.06);
    flex-shrink: 0;
}

.panel-logo {
    width: 100px;
    height: auto;
    flex-shrink: 0;
}

.panel-title-group {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
}

.panel-name {
    font-family: var(--font-primary);
    font-size: var(--main-font-size-3);
    font-weight: var(--font-weight-2);
    color: var(--text-main);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    user-select: none;
    -webkit-user-select: none;
}

.panel-sub {
    font-family: var(--font-microcopy);
    font-size: var(--secondary-font-size-4);
    color: var(--text-muted);
    white-space: nowrap;
    user-select: none;
    -webkit-user-select: none;
}

.close-btn {
    background: none;
    border: none;
    padding: var(--space-1);
    cursor: pointer;
    color: var(--text-muted);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: color 0.15s;
    flex-shrink: 0;
}

.close-btn:hover {
    color: var(--text-main);
}

.panel-body {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-4) var(--space-5);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    scrollbar-width: thin;
    scrollbar-color: var(--black-3) transparent;
    user-select: text;
    -webkit-user-select: text;
}

.panel-body::-webkit-scrollbar { width: 6px; }
.panel-body::-webkit-scrollbar-track { background: transparent; }
.panel-body::-webkit-scrollbar-thumb {
    background: var(--black-3);
    border-radius: 3px;
}

:slotted(.intro),
:slotted(.outro) {
    font-family: var(--font-primary);
    font-size: var(--main-font-size-3);
    font-weight: var(--font-weight-3);
    color: var(--text-main);
    line-height: 1.6;
    margin: 0 0 var(--space-3) 0;
}

:slotted(.outro) { margin: 0; }

:slotted(.section-title) {
    font-family: var(--font-primary);
    font-size: var(--main-font-size-3);
    font-weight: var(--font-weight-1);
    color: var(--light-green);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin: var(--space-4) 0 var(--space-2) 0;
    padding-top: var(--space-3);
    border-top: 1px solid rgba(255,255,255,0.05);
}
:slotted(.section-title:first-of-type) {
    margin-top: 0;
    padding-top: 0;
    border-top: none;
}

:slotted(.term-intro) {
    font-family: var(--font-primary);
    font-size: var(--main-font-size-3);
    font-weight: var(--font-weight-3);
    color: var(--text-muted);
    line-height: 1.5;
    margin: 0 0 var(--space-2) 0;
}

:slotted(.term-list) {
    margin: 0;
    padding-left: var(--space-4);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    list-style: disc;
}

:slotted(.term-list.numbered) { list-style: decimal; }

:slotted(.term-list li) {
    font-family: var(--font-primary);
    font-size: var(--main-font-size-4);
    font-weight: var(--font-weight-3);
    color: var(--text-main);
    line-height: 1.5;
}

:slotted(.term-list strong) {
    font-weight: var(--font-weight-1);
    color: var(--text-main);
}
</style>
