import type { FilterPrimitive, FilterStage } from './types'


function serializePrimitive(prim: FilterPrimitive): string {
    const attrs = Object.entries(prim.attrs)
        .map(([k, v]) => `${k}="${v}"`)
        .join(' ')

    if (prim.children && prim.children.length > 0) {
        const inner = prim.children.map(serializePrimitive).join('')
        return `<${prim.tag} ${attrs}>${inner}</${prim.tag}>`
    }

    return `<${prim.tag} ${attrs}/>`
}

/**
 * Build an SVG filter markup string from a pipeline of FilterStages.
 *
 * Handles:
 * 1. Sources are emitted first (top of filter) — they produce named results independently.
 * 2. Processors are emitted in order — auto-wired so each reads from the previous processor's output.
 * 3. Multi-input processors have their `inputs` map spread as additional attributes (e.g., `in2`).
 * 4. The last processor's output (with its `result` attribute) becomes the filter output.
 *
 * For chromatic aberration and other multi-primitive stages, the stage's primitives
 * are emitted as-is (they handle their own internal in/result wiring).
 */
export function buildFilterChain(stages: FilterStage[]): string {
    // Separate sources and processors
    const sources = stages.filter(s => s.category === 'source')
    const processors = stages.filter(s => s.category === 'processor')

    const parts: string[] = []

    // 1. Emit all sources first
    for (const stage of sources) {
        for (const prim of stage.primitives) {
            parts.push(serializePrimitive(prim))
        }
    }

    // 2. Emit processors in order, auto-wiring `in` to previous output
    let prevOutput = 'SourceGraphic'

    for (const stage of processors) {
        // Determine what this stage reads from
        const stageInput = stage.input ?? prevOutput

        // For each primitive in this stage, we need to wire the first one's `in`
        // to stageInput. Multi-primitive stages (like chromatic aberration) handle
        // their own internal wiring, so we only inject `in` on the first primitive
        // if it doesn't already have one.
        for (let i = 0; i < stage.primitives.length; i++) {
            const prim = stage.primitives[i]
            const injectedAttrs = { ...prim.attrs }

            // Inject chain input on ANY primitive that doesn't specify `in`.
            // This ensures multi-primitive stages (e.g., chromatic aberration)
            // where several primitives read the same source all get wired correctly.
            if (!('in' in injectedAttrs)) {
                injectedAttrs.in = stageInput
            }

            // Inject additional named inputs from stage.inputs (first primitive only)
            if (i === 0 && stage.inputs) {
                for (const [attr, ref] of Object.entries(stage.inputs)) {
                    if (!(attr in injectedAttrs)) {
                        injectedAttrs[attr] = ref
                    }
                }
            }

            // Last primitive: ensure result is set to stage name so later stages can reference it
            if (i === stage.primitives.length - 1 && !('result' in injectedAttrs)) {
                injectedAttrs.result = stage.name
            }

            parts.push(serializePrimitive({
                tag: prim.tag,
                attrs: injectedAttrs,
                children: prim.children,
            }))
        }

        prevOutput = stage.name
    }

    return parts.join('\n')
}

/**
 * Build filter chain as an object with attrs for the <filter> element.
 * Convenience for use with Vue's v-html or render functions.
 */
export function buildFilterAttrs(params: {
    x?: string
    y?: string
    width?: string
    height?: string
    filterUnits?: string
    colorInterpolationFilters?: string
}): Record<string, string> {
    return {
        x: params.x ?? '-50%',
        y: params.y ?? '-50%',
        width: params.width ?? '200%',
        height: params.height ?? '200%',
        filterUnits: params.filterUnits ?? 'objectBoundingBox',
        ...(params.colorInterpolationFilters
            ? { 'color-interpolation-filters': params.colorInterpolationFilters }
            : {}),
    }
}
