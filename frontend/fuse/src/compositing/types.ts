export interface FilterPrimitive {
    tag: string
    attrs: Record<string, string | number>
    children?: FilterPrimitive[]

}
export interface FilterStage {
    name: string
    primitives: FilterPrimitive[]

    input?: string

    inputs?: Record<string, string>
    category: 'source' | 'processor'
}



export interface NumberParam {
    type: 'number'
    value: number
    min: number
    max: number
    step?: number
    label: string
}

export interface ColorParam {
    type: 'color'
    value: string
    label: string
}

export interface BoolParam {
    type: 'boolean'
    value: boolean
    label: string
}

export interface SelectParam {
    type: 'select'
    value: string
    options: string[]
    label: string
}

export type EffectParam = NumberParam | ColorParam | BoolParam | SelectParam

export type EffectType =
    | 'turbulenceNoise'
    | 'lensMap'
    | 'lensDisplacement'
    | 'refractionDisplacement'
    | 'chromaticAberration'
    | 'specularLight'
    | 'deepGlow'
    | 'antiAlias'
    | 'gaussianBlur'


export interface EffectDefinition {
    id: string
    type: EffectType
    label: string
    enabled: boolean
    params: Record<string, EffectParam>
}


export interface GradientConfig {
    rotation: number
    colors: [string, string] | [string, string, string, string]
}

export interface CSSLayerConfig {
    frostBlur: number
    tint: { color: string; alpha: number } | null
    gradient: GradientConfig | null
    shine: { alpha: number } | null
    depthShadow: string | null
    glow: { shadow: string } | null
}
