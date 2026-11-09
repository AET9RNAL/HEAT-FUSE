<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, provide } from 'vue'
import { motion } from 'motion-v'
import Icons from '../ui/Icons.vue'
import eThrobber from '../ui/eThrobber.vue'
import eToggle from '../inputs/eToggle.vue'
// The stage inspector renders the same ControlInput, so both config surfaces
// get identical inputs. Toggles stay the app's Rive eToggle.
import ControlInput from '../../overlay/inspector/ControlInput.vue'
import { TIP_DIRECTIVE } from '../../overlay/inspector/tooltip'
import { evalWhen, type InspectorControl } from '../../overlay/inspector/types'
import { vTip } from '../../directives/vTip'
import type { PluginRecord, ConfigControl, ConfigSection } from '../../stores/plugins'
import { usePluginsStore } from '../../stores/plugins'
import { useAppStore } from '../../stores/app'
import { useFuseConnection } from '../../composables/useFuseConnection'
import { useI18n } from '../../composables/useI18n'
import { eventBus } from '../../events/eventBus'
import { useKeybindCapture } from '../../composables/useKeybindCapture'
import { overrideView, TONE_COLOR } from '../../utils/overrideState'

const store = usePluginsStore()
const appStore = useAppStore()
const { connected } = useFuseConnection()
const { t } = useI18n()

// Shared controls show the app's tooltip, not the stage's.
provide(TIP_DIRECTIVE, vTip)

type Tab = 'config' | 'keybinds' | 'overrides'

const props = defineProps<{ plugin: PluginRecord; initialTab?: Tab | null }>()
const emit = defineEmits<{ close: [] }>()

const hasConfig    = computed(() => props.plugin.configSchema.length > 0)
const hasKeybinds  = computed(() => props.plugin.hotkeys.length > 0)
const hasOverrides = computed(() => !!props.plugin.overrides)

function firstTab(): Tab {
    const wanted = props.initialTab
    if (wanted === 'overrides' && hasOverrides.value) return 'overrides'
    if (wanted === 'keybinds' && hasKeybinds.value) return 'keybinds'
    if (hasConfig.value) return 'config'
    if (hasOverrides.value) return 'overrides'
    return 'keybinds'
}

const activeTab = ref<Tab>(firstTab())

// Pending changes buffer
const pendingConfig  = ref<Record<string, unknown>>({})
const pendingHotkeys = ref<Record<string, string>>({})
const isDirty = computed(() =>
    Object.keys(pendingConfig.value).length > 0 ||
    Object.keys(pendingHotkeys.value).length > 0
)

function resetPending() {
    pendingConfig.value  = {}
    pendingHotkeys.value = {}
}

watch(isDirty, (dirty) => {
    if (dirty) {
        const plugin_id = props.plugin.plugin_id
        eventBus.emit('modal:pending', {
            label:       'You have unsaved changes',
            saveLabel:   'Save Changes',
            cancelLabel: 'Reset',
            onConfirm: async () => {
                const pc = { ...pendingConfig.value }
                const ph = { ...pendingHotkeys.value }
                await Promise.all([
                    ...Object.entries(pc).map(([key, value]) => store.setPluginConfig(plugin_id, key, value)),
                    ...Object.entries(ph).map(([action, combo]) => store.rebindHotkey(plugin_id, action, combo)),
                ])
                resetPending()
                eventBus.emit('plugin-config:saved', { plugin_id })
            },
            onCancel: () => {
                resetPending()
                eventBus.emit('plugin-config:reset', { plugin_id })
            },
        })
    } else {
        eventBus.emit('modal:dismiss')
    }
})

onMounted(() => {
    document.addEventListener('keydown', onKeyDown)
})

onUnmounted(() => {
    if (isDirty.value) eventBus.emit('modal:dismiss')
    document.removeEventListener('keydown', onKeyDown)
    if (capturingAction.value) cancelCapture()
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

// ── Config values ──────────────────────────────────────────────────────

function getValue(key: string): unknown {
    return key in pendingConfig.value
        ? pendingConfig.value[key]
        : props.plugin.configValues[key]
}

function setValue(key: string, raw: unknown) {
    pendingConfig.value = { ...pendingConfig.value, [key]: raw }
}

/** A vec2 may span two keys; controls with no key hold nothing here. */
function valueOf(c: ConfigControl): unknown {
    if (c.type === 'vec2' && c.keys) return { x: getValue(c.keys[0]), y: getValue(c.keys[1]) }
    return 'key' in c && c.key ? getValue(c.key) : undefined
}

function onSet(c: ConfigControl, v: unknown) {
    if (c.type === 'vec2' && c.keys) {
        const pair = v as { x: number; y: number }
        setValue(c.keys[0], pair.x)
        setValue(c.keys[1], pair.y)
        return
    }
    if ('key' in c && c.key) setValue(c.key, v)
}

/** Same id and payload the stage sends, so one plugin handler serves both. */
function onAction(c: ConfigControl, payload?: unknown) {
    if (c.type === 'divider' || !c.id) return
    void store.configAction(props.plugin.plugin_id, c.id, payload)
}

// ── Sections ───────────────────────────────────────────────────────────

/** Predicates read values by control id, as they do on the stage. */
const valuesById = computed(() => {
    const out: Record<string, unknown> = {}
    for (const s of props.plugin.configSchema) {
        for (const c of s.controls) {
            if (c.type !== 'divider' && c.id) out[c.id] = valueOf(c)
        }
    }
    return out
})

/** Unbound value controls are stage-only previews: they have nothing to save here. */
function renderable(c: ConfigControl): boolean {
    if (c.type === 'divider' || c.type === 'note' || c.type === 'button' || c.type === 'buttonRow') return true
    if (c.type === 'vec2') return !!c.keys || !!c.key
    return !!c.key
}

const sections = computed<ConfigSection[]>(() =>
    [...props.plugin.configSchema]
        .sort((a, b) => (a.order ?? 100) - (b.order ?? 100))
        .filter(s => evalWhen(s.when, valuesById.value))
        .map(s => ({
            ...s,
            controls: s.controls.filter(c =>
                renderable(c) && (c.type === 'divider' || evalWhen(c.when, valuesById.value))),
        }))
        .filter(s => s.controls.some(c => c.type !== 'divider'))
)

const collapsed = ref(new Set<string>())
const seenSections = new Set<string>()

// Defaults apply once per section, so a schema refresh doesn't re-collapse what the user opened.
watch(() => props.plugin.configSchema, (list) => {
    const next = new Set(collapsed.value)
    for (const s of list) {
        if (seenSections.has(s.id)) continue
        seenSections.add(s.id)
        if (s.collapsible && s.defaultCollapsed) next.add(s.id)
    }
    collapsed.value = next
}, { immediate: true })

function toggleSection(s: ConfigSection) {
    if (!s.collapsible) return
    const next = new Set(collapsed.value)
    if (next.has(s.id)) next.delete(s.id)
    else next.add(s.id)
    collapsed.value = next
}

function isDisabled(c: ConfigControl): boolean {
    if (c.type === 'divider') return false
    // Buttons reach the running plugin; offline there is nothing to press.
    if ((c.type === 'button' || c.type === 'buttonRow') && !connected.value) return true
    return c.disabledWhen ? evalWhen(c.disabledWhen, valuesById.value) : false
}

// ── Layout ─────────────────────────────────────────────────────────────

/** Controls that take the row's full width under their label, as on the stage. */
const FULL_ROW = new Set(['radio', 'button', 'buttonRow', 'note', 'segmented', 'buttons', 'vec2'])

function isStacked(c: ConfigControl): boolean {
    if (c.type === 'divider') return false
    if (c.type === 'text' && c.multiline) return true
    return c.width === 'full' || !c.label || FULL_ROW.has(c.type)
}

function widthClass(c: ConfigControl): string {
    if (isStacked(c)) return 'ctl-full'
    if (c.type === 'number') return 'ctl-narrow'
    if (c.type === 'slider' || c.type === 'select' || c.type === 'text' || c.type === 'keybind') return 'ctl-wide'
    return ''
}

function labelOf(c: ConfigControl): string | undefined {
    return c.type === 'divider' ? undefined : c.label
}

function hintOf(c: ConfigControl): string | undefined {
    return c.type === 'divider' ? undefined : c.hint
}

function tipOf(c: ConfigControl): string | undefined {
    return c.type === 'divider' ? undefined : c.tooltip
}

function rowKey(c: ConfigControl, i: number): string {
    return c.type === 'divider' || !c.id ? `row-${i}` : c.id
}

/** Positions are app-only; everything else is an inspector control. */
function asInspector(c: ConfigControl): InspectorControl {
    return c as InspectorControl
}

// ── Keybind capture ────────────────────────────────────────────────────

const { capturingAction, startCapture, cancelCapture } = useKeybindCapture((action, combo) => {
    pendingHotkeys.value = { ...pendingHotkeys.value, [action]: combo }
})

function getCombo(action: string): string {
    if (action in pendingHotkeys.value) return pendingHotkeys.value[action]
    return props.plugin.hotkeys.find(h => h.action === action)?.combo ?? ''
}

// ── Game changes ───────────────────────────────────────────────────────
// A pick goes to the runtime at once: it asks for consent, checks the game files, and main writes them.

const overrides = computed(() => props.plugin.overrides
    ? overrideView(props.plugin.overrides, appStore.gameRunning)
    : null)
const presets = computed(() => props.plugin.overrides?.presets ?? [])

/** The preset id in flight, null for "None". Undefined while no pick runs. */
const picking = ref<string | null | undefined>(undefined)
/** The pick takes long: the consent card is up on the stage. */
const slowPick = ref(false)
const pickError = ref('')
const canPick = computed(() => connected.value && picking.value === undefined)

function isPicked(id: string | null): boolean {
    const v = overrides.value
    return !!v && v.kind !== 'unknown' && v.presetId === id
}

async function pick(id: string | null) {
    if (!canPick.value || isPicked(id)) return
    picking.value = id
    pickError.value = ''
    const slow = setTimeout(() => { slowPick.value = true }, 700)
    try {
        const result = await store.selectOverride(props.plugin.plugin_id, id)
        if (!result.ok) pickError.value = result.error ?? ''
    } catch (e) {
        pickError.value = e instanceof Error ? e.message : String(e)
    } finally {
        clearTimeout(slow)
        slowPick.value = false
        picking.value = undefined
    }
}

const previews = ref<Record<string, string>>({})

// Previews load when the tab opens, one package read for each image.
watch(() => [activeTab.value, props.plugin.filePath, presets.value.map(p => p.preview).join('|')] as const, async ([tab, file]) => {
    if (tab !== 'overrides' || !file) return
    for (const p of presets.value) {
        if (!p.preview || previews.value[p.id]) continue
        const url = await window.pluginsAPI.readPreview(file, p.preview)
        if (url) previews.value = { ...previews.value, [p.id]: url }
    }
}, { immediate: true })

const overrideText = computed(() => {
    const v = overrides.value
    return v ? t(`components.plugin.overrides.text.${v.kind}`, { preset: v.presetName }) : ''
})
const showReason = computed(() => {
    const v = overrides.value
    return !!v?.reason && (v.kind === 'failed' || v.kind === 'outdated')
})
</script>

<template>
    <div class="plugin-config-backdrop" @mousedown="onBackdropClick">
        <motion.div
            class="plugin-config-motion"
            :initial="{ opacity: 0 }"
            :animate="{ opacity: 1 }"
            :exit="{ opacity: 0 }"
            :transition="{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }"
        >
            <div class="panel-blur"></div>
            <div ref="panelEl" class="plugin-config-panel">
                <motion.div
                    class="panel-scale"
                    :initial="{ scale: 0.96, y: -8 }"
                    :animate="{ scale: 1, y: 0 }"
                    :exit="{ scale: 0.96, y: -8 }"
                    :transition="{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }"
                >
                <div class="panel-inner">
                    <!-- Header -->
                    <div class="panel-header">
                        <div class="panel-title-group">
                            <span class="panel-name">{{ plugin.name }}</span>
                            <span class="panel-sub">{{ plugin.version }}</span>
                        </div>
                        <button v-tip="'Close'" class="close-btn" @click="emit('close')">
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
                        <button
                            v-if="hasOverrides"
                            class="tab-btn"
                            :class="{ active: activeTab === 'overrides' }"
                            @click="activeTab = 'overrides'"
                        >{{ t('components.plugin.overrides.tab') }}</button>
                    </div>

                    <!-- Config tab -->
                    <div v-if="activeTab === 'config'" class="panel-body">
                        <template v-for="section in sections" :key="section.id">
                            <div
                                class="config-category-label"
                                :class="{ collapsible: section.collapsible }"
                                @click="toggleSection(section)"
                            >
                                <span>{{ section.label }}</span>
                                <Icons
                                    v-if="section.collapsible"
                                    kind="chevron-down"
                                    size="small"
                                    class="section-chevron"
                                    :class="{ collapsed: collapsed.has(section.id) }"
                                />
                            </div>

                            <template v-if="!collapsed.has(section.id)">
                                <p v-if="section.description" class="section-desc">{{ section.description }}</p>

                                <template v-for="(control, i) in section.controls" :key="rowKey(control, i)">
                                    <div v-if="control.type === 'divider'" class="config-divider"></div>
                                    <div
                                        v-else
                                        class="config-row"
                                        :class="{ stacked: isStacked(control), disabled: isDisabled(control) }"
                                    >
                                        <div v-if="labelOf(control) || hintOf(control)" class="config-row-label">
                                            <span v-if="labelOf(control)" v-tip="tipOf(control)" class="entry-label">{{ labelOf(control) }}</span>
                                            <span v-if="hintOf(control)" class="entry-desc">{{ hintOf(control) }}</span>
                                        </div>
                                        <div
                                            class="config-row-control"
                                            v-tip="labelOf(control) ? undefined : tipOf(control)"
                                        >
                                            <eToggle
                                                v-if="control.type === 'toggle' || control.type === 'switch'"
                                                :model-value="!!valueOf(control)"
                                                :width="40"
                                                :height="20"
                                                @update:model-value="onSet(control, $event)"
                                            />
                                            <span v-else-if="control.type === 'position'" class="position-display">
                                                {{ JSON.stringify(valueOf(control)) }}
                                            </span>
                                            <ControlInput
                                                v-else
                                                :class="widthClass(control)"
                                                :control="asInspector(control)"
                                                :value="valueOf(control)"
                                                :disabled="isDisabled(control)"
                                                @set="(v) => onSet(control, v)"
                                                @action="(p) => onAction(control, p)"
                                            />
                                        </div>
                                    </div>
                                </template>
                            </template>
                        </template>
                        <div v-if="sections.length === 0" class="empty-state">
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
                            @click="startCapture(hotkey.action, { allowModifier: hotkey.hold })"
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

                    <!-- Game changes tab -->
                    <div v-else-if="activeTab === 'overrides' && overrides" class="panel-body">
                        <p class="section-desc">{{ t('components.plugin.overrides.intro') }}</p>

                        <motion.div
                            :key="overrides.kind"
                            class="override-state"
                            :initial="{ opacity: 0, y: -2 }"
                            :animate="{ opacity: 1, y: 0 }"
                            :transition="{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }"
                        >
                            <span class="state-mark" :style="{ background: TONE_COLOR[overrides.tone] }" />
                            <div class="state-body">
                                <span class="entry-label">{{ t(`components.plugin.overrides.title.${overrides.kind}`) }}</span>
                                <span class="entry-desc">{{ overrideText }}</span>
                                <span v-if="showReason" class="entry-desc state-reason">{{ overrides.reason }}</span>
                            </div>
                        </motion.div>

                        <div class="config-category-label">{{ t('components.plugin.overrides.presets') }}</div>

                        <button
                            class="preset-row"
                            :class="{ picked: isPicked(null) }"
                            :disabled="!canPick"
                            @click="pick(null)"
                        >
                            <span class="preset-thumb"><Icons kind="reset" size="normal" /></span>
                            <span class="preset-body">
                                <span class="entry-label">{{ t('components.plugin.overrides.none') }}</span>
                                <span class="entry-desc">{{ t('components.plugin.overrides.noneDesc') }}</span>
                            </span>
                            <eThrobber v-if="picking === null" active />
                            <Icons v-else-if="isPicked(null)" kind="checkmark" size="small" class="preset-check" />
                        </button>

                        <button
                            v-for="p in presets"
                            :key="p.id"
                            class="preset-row"
                            :class="{ picked: isPicked(p.id) }"
                            :disabled="!canPick || !!p.problem"
                            @click="pick(p.id)"
                        >
                            <span class="preset-thumb">
                                <img v-if="previews[p.id]" :src="previews[p.id]" class="preset-img" alt="" />
                                <Icons v-else kind="missingImage" size="normal" />
                            </span>
                            <span class="preset-body">
                                <span class="entry-label">{{ p.name }}</span>
                                <span v-if="p.problem" class="entry-desc state-reason">{{ p.problem }}</span>
                            </span>
                            <eThrobber v-if="picking === p.id" active />
                            <Icons v-else-if="isPicked(p.id)" kind="checkmark" size="small" class="preset-check" />
                        </button>

                        <p v-if="!connected" class="section-desc">{{ t('components.plugin.overrides.startFuse') }}</p>
                        <p v-else-if="slowPick" class="section-desc">{{ t('components.plugin.overrides.waitingConsent') }}</p>
                        <p v-if="pickError" class="section-desc state-reason">{{ t('components.plugin.overrides.pickFailed', { reason: pickError }) }}</p>
                    </div>
                </div>

                </motion.div>
            </div>
        </motion.div>

    </div>
</template>

<style scoped>
.plugin-config-backdrop {
    position: fixed;
    top: 48px;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-5);
}

.plugin-config-motion {
    position: relative;
    width: 100%;
    max-width: 420px;
    height: 100%;
    max-height: 560px;
}

.plugin-config-panel {
    position: relative;
    z-index: 1;
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    background: hsla(142, 10%, 4%, 0.92); /* crank up transparency cuz for some unbeknownst fucking reason blur refuses to render in prod ffs. */
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
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-family: var(--font-microcopy);
    font-size: var(--secondary-font-size-4);
    font-weight: var(--font-weight-2);
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding-top: var(--space-3);
    margin-top: var(--space-1);
    border-top: 1px solid rgba(255,255,255,0.05);
    user-select: none;
    -webkit-user-select: none;
}
.config-category-label:first-child {
    margin-top: 0;
    padding-top: 0;
    border-top: none;
}
.config-category-label.collapsible {
    cursor: pointer;
}
.config-category-label.collapsible:hover {
    color: var(--text-main);
}

.section-chevron {
    transition: transform 0.15s;
}
.section-chevron.collapsed {
    transform: rotate(-90deg);
}

.section-desc {
    flex-shrink: 0;
    margin: 0;
    font-family: var(--font-microcopy);
    font-size: var(--secondary-font-size-4);
    color: var(--text-muted);
    line-height: 1.35;
    user-select: none;
    -webkit-user-select: none;
}

.config-row {
    flex-shrink: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: start;
    column-gap: var(--space-4);
    min-height: 28px;
    padding: var(--space-2) 0;
}

.config-row.stacked {
    grid-template-columns: minmax(0, 1fr);
    row-gap: var(--space-2);
}

.config-row-label {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.entry-label {
    font-family: var(--font-primary);
    font-size: var(--main-font-size-4);
    font-weight: var(--font-weight-2);
    color: var(--text-main);
    line-height: 1.3;
    user-select: none;
    -webkit-user-select: none;
}

.entry-desc {
    font-family: var(--font-microcopy);
    font-size: var(--secondary-font-size-4);
    color: var(--text-muted);
    line-height: 1.35;
    overflow-wrap: anywhere;
    user-select: none;
    -webkit-user-select: none;
}

.config-row-control {
    justify-self: end;
    align-self: start;
    display: flex;
    align-items: center;
    padding-top: 2px;
}

.config-row.stacked .config-row-control {
    justify-self: stretch;
    padding-top: 0;
}

.config-row.disabled .config-row-label {
    opacity: 0.5;
}

.config-divider {
    flex-shrink: 0;
    height: 1px;
    background: rgba(255,255,255,0.05);
}

/* Sliders and text fields want the room; the scrub field is fine compact. */
.ctl-wide {
    width: 160px;
}

.ctl-narrow {
    width: 96px;
}

.ctl-full {
    width: 100%;
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
    corner-shape: bevel;
    border-radius: 4px 0 4px 0;
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

/* Game changes */

.override-state {
    flex-shrink: 0;
    display: flex;
    align-items: flex-start;
    gap: var(--space-3);
    padding: var(--space-3);
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.06);
    corner-shape: bevel;
    border-radius: 4px 0 4px 0;
}

.state-mark {
    flex-shrink: 0;
    width: 6px;
    height: 6px;
    margin-top: 5px;
    transform: rotate(45deg);
}

.state-body {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.state-reason {
    color: var(--error-highlight);
}

.preset-row {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: var(--space-3);
    width: 100%;
    padding: var(--space-2);
    background: none;
    border: 1px solid transparent;
    corner-shape: bevel;
    border-radius: 4px 0 4px 0;
    text-align: left;
    cursor: pointer;
}
.preset-row:hover:not(:disabled) {
    background: rgba(255,255,255,0.04);
}
.preset-row.picked {
    border-color: rgba(132, 255, 177, 0.35);
    background: rgba(132, 255, 177, 0.05);
}
.preset-row:disabled {
    cursor: default;
}
.preset-row:disabled:not(.picked) .preset-body {
    opacity: 0.5;
}

.preset-thumb {
    flex-shrink: 0;
    width: 64px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    background: #1c1c1c;
    color: var(--text-muted);
}

.preset-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    user-select: none;
    -webkit-user-select: none;
}

.preset-body {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.preset-check {
    flex-shrink: 0;
    color: var(--light-green);
}
</style>
