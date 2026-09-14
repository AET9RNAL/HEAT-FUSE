/**
 * Plugin config schema as the App panel renders it: inspector sections, the
 * same shape the stage inspector gets. Legacy categories (older plugins, and a
 * manifest's `config_schema` read while the runtime is offline) are mapped onto
 * the matching controls here, so the panel only ever handles one shape.
 */
import type { InspectorControl, InspectorSection, When } from '../overlay/inspector/types'

/** App-only: a saved overlay position, shown read-only. Only legacy entries produce it. */
export interface PositionControl {
    type: 'position'
    id: string
    key: string
    label?: string
    tooltip?: string
    hint?: string
    when?: When
    disabledWhen?: When
    width?: 'full' | 'half'
}

export type ConfigControl = InspectorControl | PositionControl

export interface ConfigSection extends Omit<InspectorSection, 'controls'> {
    controls: ConfigControl[]
}

interface LegacyEntry {
    key: string
    label?: string
    type?: string
    min?: number
    max?: number
    choices?: string[]
    description?: string
    alpha?: boolean
}

/** Numbers map to the number field: a slider is only right when a plugin asks for one. */
function legacyControl(e: LegacyEntry): ConfigControl | null {
    if (!e || typeof e.key !== 'string') return null
    const base = { id: e.key, key: e.key, label: e.label ?? e.key, hint: e.description || undefined }
    switch (e.type) {
        case 'bool':
            return { ...base, type: 'toggle' }
        case 'int':
        case 'float':
            return { ...base, type: 'number', min: e.min, max: e.max, step: e.type === 'float' ? 0.01 : 1 }
        case 'select':
            return {
                ...base,
                type: 'select',
                options: (e.choices ?? []).map(c => ({ value: c, label: c })),
                searchable: (e.choices?.length ?? 0) > 8,
            }
        case 'color':
            return { ...base, type: 'color', alpha: e.alpha !== false }
        case 'position':
            return { ...base, type: 'position' }
        default:
            return { ...base, type: 'text' }
    }
}

export function normalizeConfigSchema(raw: unknown): ConfigSection[] {
    if (!Array.isArray(raw)) return []
    const out: ConfigSection[] = []
    raw.forEach((item, i) => {
        if (!item || typeof item !== 'object') return
        const s = item as Record<string, unknown>
        const label = typeof s.label === 'string' ? s.label : ''
        if (Array.isArray(s.controls)) {
            out.push({ ...(s as unknown as ConfigSection), id: typeof s.id === 'string' ? s.id : `section-${i}`, label })
        } else if (Array.isArray(s.entries)) {
            const controls = (s.entries as LegacyEntry[])
                .map(legacyControl)
                .filter((c): c is ConfigControl => c !== null)
            out.push({ id: `category-${i}`, label, controls })
        }
    })
    return out
}
