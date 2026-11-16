import type { IconKind } from '../ui/Icons.vue'
import type { OverridePresetKind, PluginRecord } from '../../stores/plugins'
import type { OverrideKind } from '../../utils/overrideState'

/** Canvas sizes in graph units. The node and terminal CSS uses the same numbers. */
export const GC = {
    nodeW: 280,
    nodeH: 136,
    step: 152,
    termW: 256,
    /** A terminal port sits this far below the terminal top. */
    portY: 56,
    colX: 400,
    outX: 880,
} as const

export interface Pt {
    x: number
    y: number
}

export const KINDS: readonly OverridePresetKind[] = ['hangar', 'world', 'prefab']
export const KIND_ICON: Record<OverridePresetKind, IconKind> = { hangar: 'hangar', world: 'world', prefab: 'prefab' }

/** States with a link from Plugins: a preset is picked and the plugin is on. */
export const FEEDS: ReadonlySet<OverrideKind> = new Set(['waitGame', 'applying', 'applied', 'inGame', 'outdated', 'failed'])
/** States with a link to HEAT: the game files hold the preset, or FUSE works on them. */
export const WIRED: ReadonlySet<OverrideKind> = new Set([...FEEDS, 'removeWait', 'removing'])

/**
 * A wire on the pointer. toOutput / toSource: from a free node's port. fromSource / fromOutput: from a terminal port.
 * move: the node end of a link, held at a terminal. detach: the terminal end of a link, held at the node.
 */
export type WireOp =
    | { t: 'toOutput' | 'toSource'; key: string }
    | { t: 'fromSource' | 'fromOutput' }
    | { t: 'move'; key: string; fixed: 'source' | 'output' }
    | { t: 'detach'; key: string; end: 'source' | 'output' }

/** What is under the pointer at the drop. `nodeLinked`: that node already has a link. */
export interface DropHit {
    node: string | null
    nodeLinked: boolean
    output: boolean
    source: boolean
}

export type DropAction = ['link' | 'unlink', string]

/** The link changes of a wire drop. A link end dropped on empty canvas unlinks. */
export function wireDrop(op: WireOp, hit: DropHit): DropAction[] {
    const free = hit.node && !hit.nodeLinked ? hit.node : null
    switch (op.t) {
        case 'toOutput':
            return hit.output ? [['link', op.key]] : []
        case 'toSource':
            return hit.source ? [['link', op.key]] : []
        case 'fromSource':
        case 'fromOutput':
            return free ? [['link', free]] : []
        case 'move':
            if (free && free !== op.key) return [['unlink', op.key], ['link', free]]
            if (hit.node || hit.output || hit.source) return []
            return [['unlink', op.key]]
        case 'detach':
            return hit.node || hit.output || hit.source ? [] : [['unlink', op.key]]
    }
}

/** The kinds of a plugin's presets, in KINDS order. */
export function pluginKinds(p: PluginRecord): OverridePresetKind[] {
    const have = new Set(p.overrides?.presets.map(x => x.kind) ?? [])
    return KINDS.filter(k => have.has(k))
}

/** True when the player's game version is known and not in the plugin's list. */
export function gameMismatch(p: PluginRecord, gameVersion: string): boolean {
    const list = p.gameVersions ?? []
    return !!gameVersion && list.length > 0 && !list.includes(gameVersion)
}

export interface CanvasLayout {
    view: { x: number; y: number; k: number } | null
    nodes: Record<string, Pt>
    source: Pt | null
    output: Pt | null
    /** The user moved a terminal: auto placing leaves the terminals where they are. */
    termsMoved: boolean
}

const KEY = 'fuse:game-changes:canvas'

export function loadLayout(): CanvasLayout {
    const empty: CanvasLayout = { view: null, nodes: {}, source: null, output: null, termsMoved: false }
    try {
        const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<CanvasLayout> | null
        if (!raw || typeof raw !== 'object') return empty
        return { ...empty, ...raw, nodes: { ...(raw.nodes ?? {}) } }
    } catch {
        return empty
    }
}

export function saveLayout(layout: CanvasLayout): void {
    try {
        localStorage.setItem(KEY, JSON.stringify(layout))
    } catch {
        /* the canvas still works, it only forgets the places */
    }
}
