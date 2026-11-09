import type { PluginOverrides } from '../stores/plugins'

/**
 * What the App says about a plugin's game changes. The runtime gives the state. The App adds the game process,
 * because a pick waits for the game to close.
 */
export type OverrideKind =
    | 'unknown'
    | 'none'
    | 'pluginOff'
    | 'waitGame'
    | 'applying'
    | 'applied'
    | 'inGame'
    | 'removeWait'
    | 'removing'
    | 'outdated'
    | 'failed'

/** The kinds that need a game restart before the user sees the change. */
export const RESTART_KINDS: readonly OverrideKind[] = ['waitGame', 'removeWait']

/** ok: in the game files. wait: FUSE still has work. bad: FUSE cannot apply it. muted: nothing to do. */
export type OverrideTone = 'ok' | 'wait' | 'bad' | 'muted'

export interface OverrideView {
    kind: OverrideKind
    tone: OverrideTone
    presetId: string | null
    presetName: string
    /** The runtime's reason, as it gives it. */
    reason: string
}

const TONE: Record<OverrideKind, OverrideTone> = {
    unknown: 'muted',
    none: 'muted',
    pluginOff: 'muted',
    waitGame: 'wait',
    applying: 'wait',
    applied: 'ok',
    inGame: 'ok',
    removeWait: 'wait',
    removing: 'wait',
    outdated: 'bad',
    failed: 'bad',
}

export const TONE_COLOR: Record<OverrideTone, string> = {
    ok: '#84ffb1',
    wait: '#feff7b',
    bad: '#c84554',
    muted: '#525252',
}

export function overrideView(overrides: PluginOverrides, gameRunning: boolean): OverrideView {
    const active = overrides.active
    const presetId = active?.preset ?? null
    const presetName = overrides.presets.find(p => p.id === presetId)?.name ?? presetId ?? ''
    let kind: OverrideKind
    if (!active) kind = 'unknown'
    else if (active.state === 'off') kind = presetId ? 'pluginOff' : 'none'
    else if (active.state === 'pending' && active.removing) kind = gameRunning ? 'removeWait' : 'removing'
    else if (active.state === 'pending') kind = gameRunning ? 'waitGame' : 'applying'
    else if (active.state === 'applied') kind = gameRunning ? 'inGame' : 'applied'
    else kind = active.state
    return { kind, tone: TONE[kind], presetId, presetName, reason: active?.reason ?? '' }
}
