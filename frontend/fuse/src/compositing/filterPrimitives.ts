import type { FilterStage, FilterPrimitive } from './types'

// ─── SOURCES ─────────────────────────────────────────────────────────────────
// Sources produce named results without reading from the chain.

/**
 * Fractal noise texture for refraction displacement + specular lighting bump map.
 *
 * Pipeline: feTurbulence → feComponentTransfer → feGaussianBlur → result="softMap"
 */
export function createTurbulenceNoise(params: {
    baseFrequency: string
    octaves?: number
    seed?: number
    blur?: number
}): FilterStage[] {
    const { baseFrequency, octaves = 1, seed = 5, blur = 3 } = params
    return [{
        name: 'softMap',
        category: 'source',
        primitives: [
            {
                tag: 'feTurbulence',
                attrs: {
                    type: 'fractalNoise',
                    baseFrequency,
                    numOctaves: octaves,
                    seed,
                    result: 'turbulence',
                },
            },
            {
                tag: 'feComponentTransfer',
                attrs: { in: 'turbulence', result: 'mapped' },
                children: [
                    { tag: 'feFuncR', attrs: { type: 'gamma', amplitude: 1, exponent: 10, offset: 0.5 } },
                    { tag: 'feFuncG', attrs: { type: 'gamma', amplitude: 0, exponent: 1, offset: 0 } },
                    { tag: 'feFuncB', attrs: { type: 'gamma', amplitude: 0, exponent: 1, offset: 0.5 } },
                ],
            },
            {
                tag: 'feGaussianBlur',
                attrs: { in: 'turbulence', stdDeviation: blur, result: 'softMap' },
            },
        ],
    }]
}

/**
 * Gradient-based lens displacement map (CC Lens convergence).
 *
 * Red gradient (left→right) for X displacement, Green gradient (top→bottom) for Y.
 * Center = neutral (0.5, 0.5) = no displacement; edges = max displacement toward center.
 */
export function createLensMap(params: { mapUri: string }): FilterStage[] {
    return [{
        name: 'lensMap',
        category: 'source',
        primitives: [{
            tag: 'feImage',
            attrs: {
                href: params.mapUri,
                x: '0', y: '0', width: '100%', height: '100%',
                result: 'lensMap',
            },
        }],
    }]
}

/**
 * Red channel = X displacement, Green channel = Y displacement.
 */
export function buildLensMapUri(): string {
    const svg = [
        '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">',
        '<defs>',
        '<linearGradient id="x" x1="0%" x2="100%">',
        '<stop offset="0%" stop-color="red"/><stop offset="100%" stop-color="#000"/>',
        '</linearGradient>',
        '<linearGradient id="y" x1="0%" y1="0%" x2="0%" y2="100%">',
        '<stop offset="0%" stop-color="#0f0"/><stop offset="100%" stop-color="#000"/>',
        '</linearGradient>',
        '</defs>',
        '<rect width="100" height="100" fill="url(#x)"/>',
        '<rect width="100" height="100" fill="url(#y)" style="mix-blend-mode:screen"/>',
        '</svg>',
    ].join('')
    return `data:image/svg+xml,${encodeURIComponent(svg)}`
}


// ─── PROCESSORS ──────────────────────────────────────────────────────────────
// Processors read from the chain (or a specific input) and produce output.

export function createLensDisplacement(params: {
    scale: number
    mapRef?: string
}): FilterStage[] {
    return [{
        name: 'lensed',
        category: 'processor',
        inputs: { in2: params.mapRef ?? 'lensMap' },
        primitives: [{
            tag: 'feDisplacementMap',
            attrs: {
                scale: params.scale,
                xChannelSelector: 'R',
                yChannelSelector: 'G',
            },
        }],
    }]
}


export function createSpecularLight(params: {
    surfaceScale: number
    exponent: number
    x: number
    y: number
    z?: number
    bumpRef?: string
}): FilterStage[] {
    const { surfaceScale, exponent, x, y, z = 300, bumpRef = 'softMap' } = params
    return [{
        name: 'litImage',
        category: 'source', // Source-like: reads bumpRef, produces independent result
        primitives: [
            {
                tag: 'feSpecularLighting',
                attrs: {
                    in: bumpRef,
                    surfaceScale,
                    specularConstant: 1,
                    specularExponent: exponent,
                    'lighting-color': 'white',
                    result: 'specLight',
                },
                children: [{
                    tag: 'fePointLight',
                    attrs: { x, y, z },
                }],
            },
            {
                tag: 'feComposite',
                attrs: {
                    in: 'specLight',
                    operator: 'arithmetic',
                    k1: 0, k2: 1, k3: 1, k4: 0,
                    result: 'litImage',
                },
            },
        ],
    }]
}


export function createRefractionDisplacement(params: {
    scale: number
    noiseRef?: string
}): FilterStage[] {
    return [{
        name: 'refracted',
        category: 'processor',
        inputs: { in2: params.noiseRef ?? 'softMap' },
        primitives: [{
            tag: 'feDisplacementMap',
            attrs: {
                scale: params.scale,
                xChannelSelector: 'R',
                yChannelSelector: 'G',
            },
        }],
    }]
}


export function createChromaticAberration(params: {
    scaleR: number
    scaleG: number
    scaleB: number
    noiseRef?: string
}): FilterStage[] {
    const noiseRef = params.noiseRef ?? 'softMap'

    // Helper to build one channel's displacement + extraction
    function channelPass(
        scale: number,
        matrixValues: string,
        dispResult: string,
        colorResult: string,
    ): FilterPrimitive[] {
        return [
            {
                tag: 'feDisplacementMap',
                attrs: {
                    in2: noiseRef,
                    scale,
                    xChannelSelector: 'R',
                    yChannelSelector: 'G',
                    result: dispResult,
                },
            },
            {
                tag: 'feColorMatrix',
                attrs: {
                    in: dispResult,
                    type: 'matrix',
                    values: matrixValues,
                    result: colorResult,
                },
            },
        ]
    }

    return [{
        name: 'chromaOut',
        category: 'processor',
        primitives: [
            // Red channel
            ...channelPass(params.scaleR,
                '1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0',
                'dispR', 'red'),
            // Green channel
            ...channelPass(params.scaleG,
                '0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0',
                'dispG', 'green'),
            // Blue channel
            ...channelPass(params.scaleB,
                '0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0',
                'dispB', 'blue'),
            // Recombine
            {
                tag: 'feBlend',
                attrs: { in: 'red', in2: 'green', mode: 'screen', result: 'rg' },
            },
            {
                tag: 'feBlend',
                attrs: { in: 'rg', in2: 'blue', mode: 'screen', result: 'chromaOut' },
            },
        ],
    }]
}

/**
 * Anti-aliasing: smooth jagged displacement edges.
 */
export function createAntiAlias(params: { stdDeviation: number }): FilterStage[] {
    return [{
        name: 'antiAliased',
        category: 'processor',
        primitives: [{
            tag: 'feGaussianBlur',
            attrs: { stdDeviation: params.stdDeviation },
        }],
    }]
}

/**
 * Simple Gaussian blur processor.
 */
export function createGaussianBlur(params: { stdDeviation: number }): FilterStage[] {
    return [{
        name: 'blurred',
        category: 'processor',
        primitives: [{
            tag: 'feGaussianBlur',
            attrs: { stdDeviation: params.stdDeviation },
        }],
    }]
}


export function createDeepGlow(params: {
    intensity: number
    color?: string
    passes?: number
}): FilterStage[] {
    const { intensity, color = 'white', passes = 4 } = params

    // Exponentially increasing radii, decreasing opacity
    const config = [
        { radiusMul: 0.05, opacity: 1.0 },
        { radiusMul: 0.15, opacity: 0.6 },
        { radiusMul: 0.4, opacity: 0.3 },
        { radiusMul: 1.0, opacity: 0.15 },
    ].slice(0, passes)

    const primitives: FilterPrimitive[] = []

    config.forEach((pass, i) => {
        const radius = intensity * pass.radiusMul
        const passName = `glowPass${i}`

        primitives.push(
            {
                tag: 'feGaussianBlur',
                attrs: { stdDeviation: radius, result: `${passName}Blur` },
            },
            {
                tag: 'feFlood',
                attrs: { 'flood-color': color, 'flood-opacity': pass.opacity, result: `${passName}Color` },
            },
            {
                tag: 'feComposite',
                attrs: { in: `${passName}Color`, in2: `${passName}Blur`, operator: 'in', result: passName },
            },
        )
    })

    const mergeChildren: FilterPrimitive[] = config.map((_, i) => ({
        tag: 'feMergeNode',
        attrs: { in: `glowPass${i}` },
    }))

    primitives.push({
        tag: 'feMerge',
        attrs: { result: 'glowMerged' },
        children: mergeChildren,
    })

    primitives.push({
        tag: 'feBlend',
        attrs: { in2: 'glowMerged', mode: 'screen', result: 'deepGlow' },
    })

    return [{
        name: 'deepGlow',
        category: 'processor',
        primitives,
    }]
}
