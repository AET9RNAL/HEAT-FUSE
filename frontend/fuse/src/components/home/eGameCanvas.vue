<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import eGameNode from './eGameNode.vue'
import eButton, { type SystemState } from '../inputs/eButton.vue'
import eMaterialButton from '../inputs/eMaterialButton.vue'
import Icons from '../ui/Icons.vue'
import { useAppStore } from '../../stores/app'
import { usePluginsStore, type PluginRecord } from '../../stores/plugins'
import { useGameChanges } from '../../composables/useGameChanges'
import { useFuseConnection } from '../../composables/useFuseConnection'
import { useGamePresets } from '../../composables/useGamePresets'
import { useI18n } from '../../composables/useI18n'
import { eventBus } from '../../events/eventBus'
import { overrideView, type OverrideView } from '../../utils/overrideState'
import { FEEDS, GC, WIRED, gameMismatch, loadLayout, saveLayout, wireDrop, type Pt, type WireOp } from './gameChanges'

const { t } = useI18n()
const { openPresets, pick } = useGamePresets()
const appStore = useAppStore()
const pluginsStore = usePluginsStore()
const { held, heldAny } = useGameChanges()
const { connected } = useFuseConnection()

interface Row {
    p: PluginRecord
    v: OverrideView
}

const rows = computed<Row[]>(() => pluginsStore.plugins
    .filter(p => p.overrides)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(p => ({ p, v: overrideView(p.overrides!, appStore.gameRunning) })))
const rowOf = (id: string) => rows.value.find(r => r.p.plugin_id === id)

const layout = reactive(loadLayout())
const view = reactive({ x: 0, y: 0, k: 1, ...(layout.view ?? {}) })
let saveTimer: ReturnType<typeof setTimeout> | null = null
function save() {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
        layout.view = { x: view.x, y: view.y, k: view.k }
        saveLayout(layout)
    }, 300)
}

function slotFree(y: number): boolean {
    return !rows.value.some(r => {
        const n = layout.nodes[r.p.plugin_id]
        return !!n && Math.abs(n.x - GC.colX) < GC.nodeW && n.y < y + GC.nodeH && n.y + GC.nodeH > y
    })
}

function terminalsHome() {
    const mid = Math.max(GC.nodeH, rows.value.length * GC.step - (GC.step - GC.nodeH)) / 2
    layout.source = { x: 0, y: Math.round(mid - GC.portY) }
    layout.output = { x: GC.outX, y: Math.round(mid - GC.portY) }
}

function place() {
    let added = false
    for (const r of rows.value) {
        if (layout.nodes[r.p.plugin_id]) continue
        let i = 0
        while (!slotFree(i * GC.step)) i++
        layout.nodes[r.p.plugin_id] = { x: GC.colX, y: i * GC.step }
        added = true
    }
    if (!layout.source || !layout.output || (added && !layout.termsMoved)) terminalsHome()
    if (!added) return
    save()
    // A new plugin shows at once, also when it lands outside the view.
    void nextTick(fit)
}
watch(() => rows.value.map(r => r.p.plugin_id).join('|'), place, { immediate: true })

function arrange() {
    rows.value.forEach((r, i) => { layout.nodes[r.p.plugin_id] = { x: GC.colX, y: i * GC.step } })
    layout.termsMoved = false
    terminalsHome()
    fit()
}

// --- geometry ---

const dragAt = reactive<Record<string, Pt>>({})
const nodeAt = (id: string): Pt => dragAt[id] ?? layout.nodes[id] ?? { x: GC.colX, y: 0 }
const sourceAt = (): Pt => dragAt['@source'] ?? layout.source ?? { x: 0, y: 0 }
const outputAt = (): Pt => dragAt['@output'] ?? layout.output ?? { x: GC.outX, y: 0 }
const srcPort = (): Pt => ({ x: sourceAt().x + GC.termW, y: sourceAt().y + GC.portY })
const outPort = (): Pt => ({ x: outputAt().x, y: outputAt().y + GC.portY })
const nodeIn = (id: string): Pt => ({ x: nodeAt(id).x, y: nodeAt(id).y + GC.nodeH / 2 })
const nodeOut = (id: string): Pt => ({ x: nodeAt(id).x + GC.nodeW, y: nodeAt(id).y + GC.nodeH / 2 })

const host = ref<HTMLElement | null>(null)
const outputEl = ref<HTMLElement | null>(null)
const sourceEl = ref<HTMLElement | null>(null)
const nodeEls = new Map<string, HTMLElement>()
function setNodeEl(id: string, el: unknown) {
    if (el instanceof HTMLElement) nodeEls.set(id, el)
    else nodeEls.delete(id)
}

function toGraph(e: { clientX: number; clientY: number }): Pt {
    const r = host.value?.getBoundingClientRect()
    return { x: (e.clientX - (r?.left ?? 0) - view.x) / view.k, y: (e.clientY - (r?.top ?? 0) - view.y) / view.k }
}

function inBox(p: Pt, at: Pt, el: HTMLElement | null | undefined, pad = 16): boolean {
    const w = (el?.offsetWidth ?? GC.termW) + pad * 2
    const h = (el?.offsetHeight ?? GC.nodeH) + pad * 2
    return p.x >= at.x - pad && p.x <= at.x - pad + w && p.y >= at.y - pad && p.y <= at.y - pad + h
}
const onOutput = (p: Pt) => inBox(p, outputAt(), outputEl.value)
const onSource = (p: Pt) => inBox(p, sourceAt(), sourceEl.value)
const nodeUnder = (p: Pt) => rows.value.find(r => inBox(p, nodeAt(r.p.plugin_id), nodeEls.get(r.p.plugin_id), 12)) ?? null

function fit() {
    const r = host.value?.getBoundingClientRect()
    if (!r || !r.width) return
    const boxes = [
        { ...sourceAt(), w: GC.termW, h: sourceEl.value?.offsetHeight ?? 120 },
        { ...outputAt(), w: GC.termW, h: outputEl.value?.offsetHeight ?? 200 },
        ...rows.value.map(x => ({ ...nodeAt(x.p.plugin_id), w: GC.nodeW, h: GC.nodeH })),
    ]
    const minX = Math.min(...boxes.map(b => b.x))
    const minY = Math.min(...boxes.map(b => b.y))
    const w = Math.max(...boxes.map(b => b.x + b.w)) - minX
    const h = Math.max(...boxes.map(b => b.y + b.h)) - minY
    view.k = Math.max(0.5, Math.min(1.25, Math.min((r.width - 64) / w, (r.height - 120) / h)))
    view.x = (r.width - w * view.k) / 2 - minX * view.k
    view.y = (r.height - h * view.k) / 2 - minY * view.k + 16
    save()
}

// --- links ---

const wireTone = (v: OverrideView) => v.tone === 'bad' ? 'bad' : v.tone === 'wait' ? 'wait' : 'ok'

function curve(a: Pt, b: Pt): string {
    const dx = Math.max(32, Math.abs(b.x - a.x) / 2)
    return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`
}

interface Edge {
    id: string
    key: string
    a: Pt
    b: Pt
    tone: string
    side: 'source' | 'output'
    /** A link the user can pick up. A removal that waits for the game is not. */
    live: boolean
}

const edgeSel = ref<string | null>(null)
const wire = ref<{ a: Pt; b: Pt; hide: string | null } | null>(null)
const hoverTarget = ref<string | null>(null)

const linked = (r: Row | null | undefined) => !!r && FEEDS.has(r.v.kind)

const edges = computed<Edge[]>(() => {
    const list: Edge[] = []
    for (const r of rows.value) {
        const id = r.p.plugin_id
        if (id === wire.value?.hide) continue
        if (linked(r)) list.push({ id: `in:${id}`, key: id, a: srcPort(), b: nodeIn(id), tone: 'ok', side: 'source', live: true })
        if (WIRED.has(r.v.kind)) list.push({ id: `out:${id}`, key: id, a: nodeOut(id), b: outPort(), tone: wireTone(r.v), side: 'output', live: linked(r) })
    }
    return list
})

function notifyOff() {
    eventBus.emit('notification', { message: t('components.plugin.overrides.startFuse'), type: 'warning' })
}

/** Link: the last pick, else the manifest default, else the preset screen opens. */
function link(r: Row) {
    if (linked(r)) return
    if (!connected.value) return notifyOff()
    const ok = (id: string | null | undefined) => !!id && r.p.overrides!.presets.some(x => x.id === id && !x.problem)
    const target = ok(r.v.presetId) ? r.v.presetId : r.p.overrides!.presets.find(x => x.isDefault && !x.problem)?.id ?? null
    if (target) void pick(r.p.plugin_id, target)
    else open(r.p.plugin_id)
}

function unlink(r: Row) {
    if (!linked(r)) return
    if (!connected.value) return notifyOff()
    void pick(r.p.plugin_id, null)
}

function anchor(op: WireOp): { p: Pt; right: boolean; hide: string | null } {
    switch (op.t) {
        case 'toOutput':
            return { p: nodeOut(op.key), right: false, hide: null }
        case 'toSource':
            return { p: nodeIn(op.key), right: true, hide: null }
        case 'fromSource':
            return { p: srcPort(), right: false, hide: null }
        case 'fromOutput':
            return { p: outPort(), right: true, hide: null }
        case 'move':
            return op.fixed === 'source' ? { p: srcPort(), right: false, hide: op.key } : { p: outPort(), right: true, hide: op.key }
        case 'detach':
            return op.end === 'source' ? { p: nodeIn(op.key), right: true, hide: op.key } : { p: nodeOut(op.key), right: false, hide: op.key }
    }
}

function hitAt(p: Pt) {
    const r = nodeUnder(p)
    return { node: r?.p.plugin_id ?? null, nodeLinked: linked(r), output: onOutput(p), source: onSource(p) }
}

function targetOf(op: WireOp, p: Pt): string | null {
    const h = hitAt(p)
    const free = h.node && !h.nodeLinked ? h.node : null
    switch (op.t) {
        case 'toOutput':
            return h.output ? '@output' : null
        case 'toSource':
            return h.source ? '@source' : null
        case 'fromSource':
        case 'fromOutput':
            return free
        case 'move':
            return free && free !== op.key ? free : null
        case 'detach':
            return h[op.end] ? `@${op.end}` : null
    }
}

function drop(op: WireOp, p: Pt) {
    for (const [what, id] of wireDrop(op, hitAt(p))) {
        const r = rowOf(id)
        if (!r) continue
        if (what === 'link') link(r)
        else unlink(r)
    }
}

function open(id: string) {
    openPresets(id)
}

// --- pointer: pan, drag, wires ---

/** Screen px that a press must move before it is a drag: less is a click. */
const DRAG_PX = 4
type Mode =
    | { kind: 'pan'; sx: number; sy: number; vx: number; vy: number; moved: boolean }
    | { kind: 'move'; id: string; dx: number; dy: number; sx: number; sy: number; moved: boolean }
    | { kind: 'wire'; op: WireOp; sx: number; sy: number; moved: boolean; click: string | null }
let mode: Mode | null = null

const far = (m: { sx: number; sy: number }, e: PointerEvent) => Math.hypot(e.clientX - m.sx, e.clientY - m.sy) > DRAG_PX

function capture(e: PointerEvent): boolean {
    if (e.button !== 0) return false
    e.stopPropagation()
    host.value?.setPointerCapture(e.pointerId)
    return true
}

function onBackDown(e: PointerEvent) {
    if (e.button !== 0) return
    host.value?.focus()
    host.value?.setPointerCapture(e.pointerId)
    mode = { kind: 'pan', sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y, moved: false }
}

function onMoveDown(e: PointerEvent, id: string, at: Pt) {
    if (!capture(e)) return
    host.value?.focus()
    const p = toGraph(e)
    mode = { kind: 'move', id, dx: p.x - at.x, dy: p.y - at.y, sx: e.clientX, sy: e.clientY, moved: false }
}

function startWire(e: PointerEvent, op: WireOp, click: string | null) {
    if (!capture(e)) return
    host.value?.focus()
    mode = { kind: 'wire', op, sx: e.clientX, sy: e.clientY, moved: false, click }
}

function onNodePort(e: PointerEvent, r: Row, side: 'in' | 'out') {
    const key = r.p.plugin_id
    const op: WireOp = linked(r)
        ? { t: 'move', key, fixed: side === 'in' ? 'source' : 'output' }
        : { t: side === 'in' ? 'toSource' : 'toOutput', key }
    startWire(e, op, null)
}

/** A link line: the end nearer the pointer comes off. A press with no drag selects the link. */
function onEdgeDown(e: PointerEvent, ed: Edge) {
    const p = toGraph(e)
    const nearB = Math.hypot(p.x - ed.b.x, p.y - ed.b.y) < Math.hypot(p.x - ed.a.x, p.y - ed.a.y)
    // The node end is `b` on a link from Plugins and `a` on a link to HEAT.
    const nodeEnd = ed.side === 'source' ? nearB : !nearB
    const op: WireOp = nodeEnd ? { t: 'move', key: ed.key, fixed: ed.side } : { t: 'detach', key: ed.key, end: ed.side }
    startWire(e, op, ed.key)
}

function onMove(e: PointerEvent) {
    const m = mode
    if (!m || (!m.moved && !far(m, e))) return
    m.moved = true
    if (m.kind === 'pan') {
        view.x = m.vx + e.clientX - m.sx
        view.y = m.vy + e.clientY - m.sy
    } else if (m.kind === 'move') {
        const p = toGraph(e)
        dragAt[m.id] = { x: Math.round(p.x - m.dx), y: Math.round(p.y - m.dy) }
    } else {
        const p = toGraph(e)
        const a = anchor(m.op)
        wire.value = a.right ? { a: p, b: a.p, hide: a.hide } : { a: a.p, b: p, hide: a.hide }
        hoverTarget.value = targetOf(m.op, p)
    }
}

function onUp(e: PointerEvent) {
    const m = mode
    mode = null
    if (!m) return
    if (m.kind === 'pan') {
        if (m.moved) save()
        else edgeSel.value = null
    } else if (m.kind === 'move') {
        const p = dragAt[m.id]
        if (m.moved && p) {
            if (m.id === '@source' || m.id === '@output') {
                layout[m.id === '@source' ? 'source' : 'output'] = p
                layout.termsMoved = true
            } else {
                layout.nodes[m.id] = p
            }
            delete dragAt[m.id]
            save()
        } else if (!m.id.startsWith('@')) {
            open(m.id)
        }
    } else {
        wire.value = null
        hoverTarget.value = null
        if (m.moved) drop(m.op, toGraph(e))
        else if (m.click) edgeSel.value = m.click
    }
}

function onWheel(e: WheelEvent) {
    const r = host.value?.getBoundingClientRect()
    if (!r) return
    const k = Math.max(0.5, Math.min(1.5, view.k * (e.deltaY < 0 ? 1.1 : 1 / 1.1)))
    const px = e.clientX - r.left
    const py = e.clientY - r.top
    view.x = px - ((px - view.x) / view.k) * k
    view.y = py - ((py - view.y) / view.k) * k
    view.k = k
    save()
}

function onKey(e: KeyboardEvent) {
    if ((e.key === 'Delete' || e.key === 'Backspace') && edgeSel.value) {
        const r = rowOf(edgeSel.value)
        if (r) unlink(r)
        edgeSel.value = null
    } else if (e.key.toLowerCase() === 'f' && !e.ctrlKey && !e.altKey) {
        fit()
    }
}

// --- terminals ---

const baseName = (p: string) => p.split(/[\\/]/).pop() ?? p
const inUse = computed(() => rows.value.filter(r => FEEDS.has(r.v.kind)).length)

const fileState = computed<'error' | 'waits' | 'changed' | 'original'>(() => {
    const h = held.value
    if (h?.error) return 'error'
    if (h?.waiting) return 'waits'
    return heldAny.value ? 'changed' : 'original'
})
const FILE_TONE = { error: 'bad', waits: 'wait', changed: 'ok', original: 'muted' } as const

const heldLines = computed<string[]>(() => {
    const h = held.value
    if (!h) return []
    const lines: string[] = []
    if (h.pack) lines.push(t('apphome.gameChanges.packLine', { file: baseName(h.pack.file), count: h.pack.presets.length }))
    for (const f of h.files.slice(0, 2)) lines.push(t('apphome.gameChanges.editsLine', { file: baseName(f.file), count: f.edits }))
    if (h.files.length > 2) lines.push(t('apphome.gameChanges.moreFiles', { count: h.files.length - 2 }))
    return lines
})

const canRemoveAll = computed(() => heldAny.value || rows.value.some(r => r.v.presetId !== null))
const removeState = ref<SystemState>('idle')

async function removeAll() {
    if (removeState.value !== 'idle') return
    removeState.value = 'processing'
    let result: { ok: boolean; error?: string }
    try {
        result = await pluginsStore.removeAllOverrides()
    } catch (e) {
        result = { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
    removeState.value = result.ok ? 'success' : 'error'
    eventBus.emit('notification', result.ok
        ? {
            title: t('apphome.gameChanges.removedTitle'),
            message: t(appStore.gameRunning ? 'apphome.gameChanges.removedWaitMessage' : 'apphome.gameChanges.removedMessage'),
            type: 'success',
        }
        : { title: t('apphome.gameChanges.removeFailedTitle'), message: result.error ?? '', type: 'error' })
    setTimeout(() => { removeState.value = 'idle' }, 2000)
}

onMounted(() => {
    if (!layout.view) void nextTick(fit)
})
onBeforeUnmount(() => {
    if (saveTimer) {
        clearTimeout(saveTimer)
        layout.view = { x: view.x, y: view.y, k: view.k }
        saveLayout(layout)
    }
})
</script>

<template>
    <div
        ref="host"
        class="canvas"
        tabindex="0"
        :style="{ backgroundPosition: `${view.x}px ${view.y}px`, backgroundSize: `${24 * view.k}px ${24 * view.k}px` }"
        @pointerdown="onBackDown"
        @pointermove="onMove"
        @pointerup="onUp"
        @pointercancel="onUp"
        @wheel.prevent="onWheel"
        @keydown="onKey"
    >
        <div class="world" :style="{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }">
            <svg class="wires" width="1" height="1">
                <g v-for="ed in edges" :key="ed.id">
                    <path :d="curve(ed.a, ed.b)" class="wire" :class="[ed.tone, { on: edgeSel === ed.key && ed.live }]" />
                    <path
                        v-if="ed.live"
                        :d="curve(ed.a, ed.b)"
                        class="hit"
                        @pointerdown="onEdgeDown($event, ed)"
                    />
                </g>
                <path v-if="wire" :d="curve(wire.a, wire.b)" class="wire live" />
            </svg>

            <div
                ref="sourceEl"
                class="term"
                :class="{ target: hoverTarget === '@source' }"
                :style="{ left: `${sourceAt().x}px`, top: `${sourceAt().y}px` }"
                @pointerdown="onMoveDown($event, '@source', sourceAt())"
            >
                <div class="band">
                    <span class="dots" />
                    <span class="grow" />
                    <Icons kind="plugin" size="small" color="var(--black-1)" />
                    <span class="kicker">{{ t('apphome.gameChanges.source') }}</span>
                </div>
                <div class="tbody">
                    <span class="title">{{ t('apphome.gameChanges.plugins') }}</span>
                    <span class="mono muted">{{ t('apphome.gameChanges.withPresets', { count: rows.length }) }}</span>
                    <span class="mono muted">{{ t('apphome.gameChanges.inUse', { count: inUse }) }}</span>
                </div>
                <span
                    v-tip="t('apphome.gameChanges.sourcePortTip')"
                    class="port out on"
                    @pointerdown="startWire($event, { t: 'fromSource' }, null)"
                />
            </div>

            <div
                ref="outputEl"
                class="term"
                :class="{ target: hoverTarget === '@output', bad: fileState === 'error' }"
                :style="{ left: `${outputAt().x}px`, top: `${outputAt().y}px` }"
                @pointerdown="onMoveDown($event, '@output', outputAt())"
            >
                <div class="band">
                    <span class="dots" />
                    <span class="grow" />
                    <Icons kind="heatLogo" size="small" color="var(--black-1)" />
                    <span class="kicker">{{ t('apphome.gameChanges.gameFiles') }}</span>
                </div>
                <div class="tbody">
                    <span class="title-row">
                        <span class="title">HEAT</span>
                        <span class="mono tag" :class="FILE_TONE[fileState]">{{ t(`apphome.gameChanges.fileState.${fileState}`) }}</span>
                    </span>
                    <span v-for="(line, i) in heldLines" :key="i" class="mono muted">{{ line }}</span>
                    <span v-if="held?.error" class="mono bad wrap">{{ held.error }}</span>
                    <span v-if="held?.waiting" class="mono wait">{{ t('apphome.gameChanges.writesOnClose') }}</span>
                    <span v-else class="mono muted">{{ t(appStore.gameRunning ? 'apphome.gameChanges.gameRunning' : 'apphome.gameChanges.gameClosed') }}</span>
                    <div class="actions" @pointerdown.stop>
                        <eButton
                            size="flex"
                            mode="confirm"
                            tone="danger"
                            variant="secondary"
                            :label="t('apphome.gameChanges.removeAll')"
                            :system-state="removeState"
                            :disabled="!canRemoveAll"
                            @click="removeAll"
                        />
                    </div>
                </div>
                <span
                    v-tip="t('apphome.gameChanges.outputPortTip')"
                    class="port in on"
                    @pointerdown="startWire($event, { t: 'fromOutput' }, null)"
                />
            </div>

            <div
                v-for="r in rows"
                :key="r.p.plugin_id"
                :ref="el => setNodeEl(r.p.plugin_id, el)"
                class="node-at"
                :class="{ target: hoverTarget === r.p.plugin_id }"
                :style="{ left: `${nodeAt(r.p.plugin_id).x}px`, top: `${nodeAt(r.p.plugin_id).y}px` }"
                @pointerdown="onMoveDown($event, r.p.plugin_id, nodeAt(r.p.plugin_id))"
            >
                <eGameNode
                    :plugin="r.p"
                    :view="r.v"
                    :mismatch="gameMismatch(r.p, appStore.gameVersion)"
                    :selected="edgeSel === r.p.plugin_id"
                    @port="(ev, side) => onNodePort(ev, r, side)"
                />
            </div>
        </div>

        <div class="head">
            <span class="head-title">{{ t('apphome.gameChanges.title') }}</span>
            <span class="mono muted head-desc">{{ t('apphome.gameChanges.desc') }}</span>
        </div>
        <div class="summary mono">
            <span class="muted">{{ t('apphome.gameChanges.summary', { used: inUse, total: rows.length }) }} ·</span>
            <span :class="appStore.gameRunning ? 'wait' : 'muted'">
                {{ t(appStore.gameRunning ? 'apphome.gameChanges.gameRunning' : 'apphome.gameChanges.gameClosed') }}
            </span>
        </div>
        <span v-if="!rows.length" class="empty mono muted">{{ t('apphome.gameChanges.empty') }}</span>
        <div class="controls" @pointerdown.stop>
            <eMaterialButton :label="t('apphome.gameChanges.arrange')" icon="grid" @click="arrange" />
            <eMaterialButton :label="t('apphome.gameChanges.fit')" icon="views" @click="fit" />
            <span class="mono muted zoom">{{ Math.round(view.k * 100) }} %</span>
        </div>
    </div>
</template>

<style scoped>
.canvas {
    position: relative;
    flex: 1;
    min-height: 0;
    overflow: hidden;
    outline: none;
    cursor: grab;
    touch-action: none;
    background-color: var(--black-1-a);
    background-image: conic-gradient(from 270deg at 1px 1px, rgba(242, 242, 242, 0.12) 25%, transparent 0);
    border: 1px solid var(--base-600);
    corner-shape: bevel;
    border-radius: 10px 0 10px 0;
    user-select: none;
    -webkit-user-select: none;
}

.world {
    position: absolute;
    left: 0;
    top: 0;
    transform-origin: 0 0;
}

.wires {
    position: absolute;
    left: 0;
    top: 0;
    overflow: visible;
}

.wire {
    fill: none;
    stroke: var(--accent-200);
    stroke-width: 1.5;
    pointer-events: none;
}

.wire.wait {
    stroke: var(--accent-600);
    stroke-dasharray: 4 3;
}

.wire.bad {
    stroke: var(--error-highlight);
    stroke-dasharray: 4 3;
}

.wire.on {
    stroke: var(--text-main);
    stroke-width: 2.5;
}

.wire.live {
    stroke-dasharray: 4 3;
}

.hit {
    fill: none;
    stroke: transparent;
    stroke-width: 12;
    pointer-events: stroke;
    cursor: pointer;
}

.term,
.node-at {
    position: absolute;
    cursor: move;
}

.term {
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
    width: 256px;
    background: var(--black-1-s);
    border: 1px solid var(--base-600);
    corner-shape: bevel;
    border-radius: 8px 0 8px 0;
}

.term.bad {
    border-color: var(--error-highlight);
}

.term.target,
.node-at.target :deep(.node) {
    border-color: var(--accent-200);
    box-shadow: 0 0 0 1px var(--accent-200);
}

.band {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 24px;
    padding: 0 10px 0 8px;
    color: var(--black-1);
    background: var(--accent-200);
    corner-shape: bevel;
    border-radius: 7px 0 0 0;
}

.dots {
    width: 44px;
    height: 12px;
    background: conic-gradient(from 270deg at 2px 2px, var(--black-1) 25%, transparent 0) 0 0 / 10px 10px;
}

.grow {
    flex: 1;
}

.kicker {
    font-family: var(--font-microcopy);
    font-size: var(--secondary-font-size-4);
    text-transform: uppercase;
}

.tbody {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px 14px 14px;
    min-width: 0;
}

.title-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
}

.title {
    flex: 1;
    font-family: var(--font-primary);
    font-size: var(--main-font-size-3);
    font-weight: var(--font-weight-2);
    color: var(--text-main);
}

.mono {
    font-family: var(--font-microcopy);
    font-size: var(--secondary-font-size-4);
    line-height: 16px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.mono.wrap {
    white-space: normal;
    overflow-wrap: anywhere;
}

.tag {
    text-transform: uppercase;
}

.muted {
    color: var(--text-muted);
}

.ok {
    color: var(--accent-200);
}

.wait {
    color: var(--accent-600);
}

.bad {
    color: var(--error-highlight);
}

.actions {
    padding-top: 6px;
    cursor: default;
}

.port {
    position: absolute;
    top: 52px;
    width: 8px;
    height: 8px;
    background: var(--base-600);
}

.port.on {
    background: var(--accent-200);
}

.port.in {
    left: -4px;
}

.port.out {
    right: -4px;
}

.port {
    cursor: crosshair;
}

.port::before {
    content: '';
    position: absolute;
    inset: -10px;
}

.port:hover {
    transform: scale(1.5);
}

.head {
    position: absolute;
    left: 16px;
    top: 14px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    max-width: 420px;
    pointer-events: none;
}

.head-title {
    font-family: var(--font-primary);
    font-size: var(--main-font-size-3);
    font-weight: var(--font-weight-2);
    color: var(--text-main);
}

.head-desc {
    white-space: normal;
}

.summary {
    position: absolute;
    right: 16px;
    top: 16px;
    display: flex;
    gap: 6px;
    pointer-events: none;
}

.empty {
    position: absolute;
    left: 16px;
    bottom: 16px;
    pointer-events: none;
}

.controls {
    position: absolute;
    right: 12px;
    bottom: 12px;
    display: flex;
    align-items: center;
    gap: var(--space-2);
    cursor: default;
}

.controls :deep(.material-button) {
    height: 24px;
}

.zoom {
    min-width: 44px;
    text-align: right;
}
</style>
