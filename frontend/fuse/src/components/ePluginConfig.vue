<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { motion } from 'motion-v'
import Icons from './Icons.vue'
import eToggle from './eToggle.vue'
import type { PluginRecord, ConfigEntry } from '../stores/plugins'
import { eventBus } from '../events/eventBus'

const props = defineProps<{ plugin: PluginRecord }>()
const emit = defineEmits<{ close: [] }>()

type Tab = 'config' | 'keybinds'

const hasConfig   = computed(() => props.plugin.configSchema.length > 0)
const hasKeybinds = computed(() => props.plugin.hotkeys.length > 0)
const activeTab   = ref<Tab>(hasConfig.value ? 'config' : 'keybinds')

// Pending changes buffer
const pendingConfig  = ref<Record<string, unknown>>({})
const pendingHotkeys = ref<Record<string, string>>({})
const isDirty = computed(() =>
    Object.keys(pendingConfig.value).length > 0 ||
    Object.keys(pendingHotkeys.value).length > 0
)

function emitDirty() {
    if (!isDirty.value) return
    eventBus.emit('plugin-config:dirty', {
        plugin_id: props.plugin.plugin_id,
        pendingConfig:  { ...pendingConfig.value },
        pendingHotkeys: { ...pendingHotkeys.value },
    })
}

watch(pendingConfig,  emitDirty)
watch(pendingHotkeys, emitDirty)

function resetPending() {
    pendingConfig.value = {}
    pendingHotkeys.value = {}
}

function onConfigReset({ plugin_id }: { plugin_id: string }) {
    if (plugin_id === props.plugin.plugin_id) resetPending()
}
function onConfigSaved({ plugin_id }: { plugin_id: string }) {
    if (plugin_id === props.plugin.plugin_id) resetPending()
}

onMounted(() => {
    eventBus.on('plugin-config:reset', onConfigReset)
    eventBus.on('plugin-config:saved', onConfigSaved)
    document.addEventListener('keydown', onKeyDown)
    if (panelEl.value) {
        _ro = new ResizeObserver(([entry]) => {
            const box = entry.borderBoxSize?.[0]
            elW.value = box ? box.inlineSize : entry.contentRect.width
            elH.value = box ? box.blockSize  : entry.contentRect.height
        })
        _ro.observe(panelEl.value)
    }
})

onUnmounted(() => {
    eventBus.off('plugin-config:reset', onConfigReset)
    eventBus.off('plugin-config:saved', onConfigSaved)
    document.removeEventListener('keydown', onKeyDown)
    if (capturingAction.value) cancelCapture()
    _ro?.disconnect()
})

function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
        if (capturingAction.value) { cancelCapture(); return }
        emit('close')
    }
}

// Outside-click detection — panelEl is a native div, so .contains() works directly
const panelEl = ref<HTMLElement | null>(null)
function onBackdropClick(e: MouseEvent) {
    if (panelEl.value && !panelEl.value.contains(e.target as Node)) {
        emit('close')
    }
}

// SVG polygon stroke
const CUT = 8
const elW = ref(0)
const elH = ref(0)
let _ro: ResizeObserver | null = null
const svgPoints = computed(() => {
    const w = elW.value
    const h = elH.value
    if (!w || !h) return ''
    const cx = (CUT / w) * 100
    const cy = (CUT / h) * 100
    return `${cx},0 100,0 100,${100 - cy} ${100 - cx},100 0,100 0,${cy}`
})

// ── Config field helpers ───────────────────────────────────────────────

function getValue(key: string): unknown {
    return key in pendingConfig.value
        ? pendingConfig.value[key]
        : props.plugin.configValues[key]
}

function setValue(key: string, raw: unknown) {
    pendingConfig.value = { ...pendingConfig.value, [key]: raw }
}

function setNumber(entry: ConfigEntry, raw: string) {
    let n = parseFloat(raw)
    if (isNaN(n)) return
    if (entry.min !== undefined) n = Math.max(entry.min, n)
    if (entry.max !== undefined) n = Math.min(entry.max, n)
    setValue(entry.key, n)
}

// ── Keybind capture ────────────────────────────────────────────────────

const capturingAction = ref<string | null>(null)
let captureListener: ((e: KeyboardEvent) => void) | null = null

function startCapture(action: string) {
    if (capturingAction.value) cancelCapture()
    capturingAction.value = action

    captureListener = (e: KeyboardEvent) => {
        e.preventDefault()
        e.stopPropagation()

        const mods: string[] = []
        if (e.ctrlKey)  mods.push('ctrl')
        if (e.altKey)   mods.push('alt')
        if (e.shiftKey) mods.push('shift')

        const ignored = ['Control', 'Alt', 'Shift', 'Meta', 'Escape']
        if (ignored.includes(e.key)) {
            if (e.key === 'Escape') cancelCapture()
            return
        }

        const combo = [...mods, e.key.toLowerCase()].join('+')
        pendingHotkeys.value = { ...pendingHotkeys.value, [action]: combo }
        capturingAction.value = null
        document.removeEventListener('keydown', captureListener!, true)
        captureListener = null
    }

    document.addEventListener('keydown', captureListener, true)
}

function cancelCapture() {
    if (captureListener) {
        document.removeEventListener('keydown', captureListener, true)
        captureListener = null
    }
    capturingAction.value = null
}

function getCombo(action: string): string {
    if (action in pendingHotkeys.value) return pendingHotkeys.value[action]
    return props.plugin.hotkeys.find(h => h.action === action)?.combo ?? ''
}
</script>

<template>
    <div class="plugin-config-backdrop" @mousedown="onBackdropClick">
        <motion.div
            class="plugin-config-motion"
            :initial="{ opacity: 0, scale: 0.96, y: -8 }"
            :animate="{ opacity: 1, scale: 1, y: 0 }"
            :exit="{ opacity: 0, scale: 0.96, y: -8 }"
            :transition="{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }"
        >
            <div ref="panelEl" class="plugin-config-panel">
                <!-- ::before provides backdrop-filter, panel-inner sits above it -->
                <div class="panel-inner">
                    <!-- Header -->
                    <div class="panel-header">
                        <div class="panel-title-group">
                            <span class="panel-name">{{ plugin.name }}</span>
                            <span class="panel-sub">{{ plugin.version }}</span>
                        </div>
                        <button class="close-btn" @click="emit('close')">
                            <Icons kind="cross" size="small" />
                        </button>
                    </div>

                    <!-- Tabs -->
                    <div class="panel-tabs">
                        <button
                            v-if="hasConfig"
                            class="tab-btn"
                            :class="{ active: activeTab === 'config' }"
                            @click="activeTab = 'config'"
                        >Config</button>
                        <button
                            v-if="hasKeybinds"
                            class="tab-btn"
                            :class="{ active: activeTab === 'keybinds' }"
                            @click="activeTab = 'keybinds'"
                        >Keybinds</button>
                    </div>

                    <!-- Config tab -->
                    <div v-if="activeTab === 'config'" class="panel-body">
                        <template v-for="cat in plugin.configSchema" :key="cat.label">
                            <div class="config-category-label">{{ cat.label }}</div>
                            <div v-for="entry in cat.entries" :key="entry.key" class="config-row">
                                <div class="config-row-label">
                                    <span class="entry-label">{{ entry.label }}</span>
                                    <span v-if="entry.description" class="entry-desc">{{ entry.description }}</span>
                                </div>
                                <div class="config-row-control">
                                    <eToggle
                                        v-if="entry.type === 'bool'"
                                        :model-value="!!getValue(entry.key)"
                                        :width="40"
                                        :height="20"
                                        @update:model-value="setValue(entry.key, $event)"
                                    />
                                    <div v-else-if="entry.type === 'int' || entry.type === 'float'" class="field-wrap">
                                        <input
                                            class="config-input"
                                            type="number"
                                            :value="getValue(entry.key) as number"
                                            :min="entry.min"
                                            :max="entry.max"
                                            :step="entry.type === 'float' ? 0.01 : 1"
                                            @change="setNumber(entry, ($event.target as HTMLInputElement).value)"
                                        />
                                    </div>
                                    <div v-else-if="entry.type === 'string'" class="field-wrap">
                                        <input
                                            class="config-input"
                                            type="text"
                                            :value="getValue(entry.key) as string"
                                            @change="setValue(entry.key, ($event.target as HTMLInputElement).value)"
                                        />
                                    </div>
                                    <div v-else-if="entry.type === 'select'" class="field-wrap field-wrap--select">
                                        <select
                                            class="config-select"
                                            :value="getValue(entry.key) as string"
                                            @change="setValue(entry.key, ($event.target as HTMLSelectElement).value)"
                                        >
                                            <option v-for="opt in entry.choices" :key="opt" :value="opt">{{ opt }}</option>
                                        </select>
                                    </div>
                                    <span v-else-if="entry.type === 'position'" class="position-display">
                                        {{ JSON.stringify(getValue(entry.key)) }}
                                    </span>
                                </div>
                            </div>
                        </template>
                        <div v-if="plugin.configSchema.length === 0" class="empty-state">
                            No configurable settings
                        </div>
                    </div>

                    <!-- Keybinds tab -->
                    <div v-else-if="activeTab === 'keybinds'" class="panel-body">
                        <div
                            v-for="hotkey in plugin.hotkeys"
                            :key="hotkey.action"
                            class="keybind-row"
                            :class="{ capturing: capturingAction === hotkey.action }"
                            @click="startCapture(hotkey.action)"
                        >
                            <span class="keybind-label">{{ hotkey.label || hotkey.action }}</span>
                            <span class="keybind-combo">
                                {{ capturingAction === hotkey.action ? '— press keys —' : getCombo(hotkey.action) }}
                            </span>
                        </div>
                        <div v-if="plugin.hotkeys.length === 0" class="empty-state">
                            No keybindings registered
                        </div>
                    </div>
                </div>

                <!-- SVG stroke traces the clip-path boundary -->
                <svg
                    v-if="svgPoints"
                    class="panel-stroke"
                    viewBox="0 0 100 100"
                    preserveAspectRatio="none"
                    xmlns="http://www.w3.org/2000/svg"
                >
                    <polygon
                        :points="svgPoints"
                        fill="none"
                        stroke="#29302D"
                        stroke-width="0.4"
                        vector-effect="non-scaling-stroke"
                    />
                </svg>
            </div>
        </motion.div>
    </div>
</template>

<style scoped>
.plugin-config-backdrop {
    position: fixed;
    inset: 0;
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
}

.plugin-config-motion {
    width: 420px;
    max-height: 560px;
    backdrop-filter: blur(35px);
    -webkit-backdrop-filter: blur(35px);
}

.plugin-config-panel {
    position: relative;
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    background: var(--black-1-a);
    clip-path: polygon(
        8px 0%, 100% 0%,
        100% calc(100% - 8px),
        calc(100% - 8px) 100%,
        0% 100%, 0% 8px
    );
    box-shadow: 0 8px 32px rgba(0,0,0,0.5);
}

.plugin-config-panel::before {
    content: '';
    position: absolute;
    inset: 0;
    z-index: 0;
    pointer-events: none;
}

.panel-inner {
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    max-height: 560px;
}

.panel-stroke {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    overflow: visible;
    z-index: 2;
}

.panel-header {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    border-bottom: 1px solid rgba(255,255,255,0.06);
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
    flex-shrink: 0;
    background: none;
    border: none;
    padding: var(--space-1);
    cursor: pointer;
    color: var(--text-muted);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: color 0.15s;
}
.close-btn:hover { color: var(--text-main); }

.panel-tabs {
    display: flex;
    border-bottom: 1px solid rgba(255,255,255,0.06);
    flex-shrink: 0;
}

.tab-btn {
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    padding: var(--space-2) var(--space-4);
    font-family: var(--font-primary);
    font-size: var(--main-font-size-4);
    font-weight: var(--font-weight-2);
    color: var(--text-muted);
    cursor: pointer;
    transition: color 0.15s, border-color 0.15s;
    user-select: none;
    -webkit-user-select: none;
}
.tab-btn:hover { color: var(--text-main); }
.tab-btn.active {
    color: var(--light-green);
    border-bottom-color: var(--light-green);
}

.panel-body {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-3) var(--space-4);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    scrollbar-width: thin;
    scrollbar-color: var(--black-3) transparent;
}

.config-category-label {
    font-family: var(--font-microcopy);
    font-size: var(--secondary-font-size-4);
    font-weight: var(--font-weight-2);
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding-top: var(--space-3);
    margin-top: var(--space-1);
    border-top: 1px solid rgba(255,255,255,0.05);
}
.config-category-label:first-child {
    margin-top: 0;
    padding-top: 0;
    border-top: none;
}

.config-row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-4);
    min-height: 28px;
    padding: var(--space-1) 0;
}

.config-row-label {
    flex: 1;
    min-width: 0;
    max-width: 55%;
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.entry-label {
    font-family: var(--font-primary);
    font-size: var(--main-font-size-4);
    font-weight: var(--font-weight-2);
    color: var(--text-main);
    user-select: none;
    -webkit-user-select: none;
}

.entry-desc {
    font-family: var(--font-microcopy);
    font-size: var(--secondary-font-size-4);
    color: var(--text-muted);
    user-select: none;
    -webkit-user-select: none;
}

.config-row-control {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    padding-top: 2px;
}

.field-wrap {
    position: relative;
    display: inline-flex;
    clip-path: polygon(
        4px 0%, 100% 0%,
        100% calc(100% - 4px),
        calc(100% - 4px) 100%,
        0% 100%, 0% 4px
    );
}

.field-wrap::after {
    content: '';
    position: absolute;
    inset: 0;
    pointer-events: none;
    box-shadow: inset 0 0 0 1px rgba(255,255,255,0.12);
    z-index: 1;
}

.config-input {
    width: 96px;
    height: 24px;
    padding: 0 var(--space-2);
    background: var(--black-2-a);
    border: none;
    color: var(--text-main);
    font-family: var(--font-microcopy);
    font-size: var(--secondary-font-size-4);
    outline: none;
    box-sizing: border-box;
}

.config-select {
    height: 24px;
    min-width: 120px;
    padding: 0 var(--space-2);
    background: var(--black-2-a);
    border: none;
    color: var(--text-main);
    font-family: var(--font-microcopy);
    font-size: var(--secondary-font-size-4);
    outline: none;
    cursor: pointer;
}

.position-display {
    font-family: var(--font-microcopy);
    font-size: var(--secondary-font-size-4);
    color: var(--text-muted);
}

.keybind-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-2) var(--space-3);
    cursor: pointer;
    transition: background 0.12s;
    clip-path: polygon(
        4px 0%, 100% 0%,
        100% calc(100% - 4px),
        calc(100% - 4px) 100%,
        0% 100%, 0% 4px
    );
}
.keybind-row:hover { background: rgba(255,255,255,0.04); }
.keybind-row.capturing { background: rgba(132, 255, 177, 0.06); }

.keybind-label {
    font-family: var(--font-primary);
    font-size: var(--main-font-size-4);
    font-weight: var(--font-weight-2);
    color: var(--text-main);
    user-select: none;
    -webkit-user-select: none;
}

.keybind-combo {
    font-family: var(--font-microcopy);
    font-size: var(--secondary-font-size-4);
    color: var(--light-green);
    text-transform: uppercase;
    letter-spacing: 0.03em;
    user-select: none;
    -webkit-user-select: none;
}
.keybind-row.capturing .keybind-combo {
    color: var(--text-muted);
    font-style: italic;
}

.empty-state {
    font-family: var(--font-microcopy);
    font-size: var(--secondary-font-size-4);
    color: var(--text-muted);
    text-align: center;
    padding: var(--space-4);
    user-select: none;
    -webkit-user-select: none;
}
</style>
