<script setup lang="ts">
import { computed, useId } from 'vue'
import type { FilterStage, CSSLayerConfig } from '../../compositing/types'
import { buildFilterChain, buildFilterAttrs } from '../../compositing/buildFilterChain'

interface Props {
    /** Array of FilterStage objects defining the SVG filter pipeline */
    effects: FilterStage[]
    /** CSS layer config for non-filter visual layers (tint, shine, shadow, glow) */
    layers?: Partial<CSSLayerConfig>
    /** HTML tag for the wrapper element */
    tag?: string
}

const props = withDefaults(defineProps<Props>(), {
    tag: 'div',
})

const filterId = `comp-${useId()}`

// Whether we need the SVG filter at all
const needsSvgFilter = computed(() => props.effects.length > 0)

// Build the SVG filter markup from the effect stages
const filterMarkup = computed(() => buildFilterChain(props.effects))
const filterAttrsObj = computed(() => buildFilterAttrs({}))

// Filter attributes as a string for the <filter> element
const filterAttrStr = computed(() =>
    Object.entries(filterAttrsObj.value)
        .map(([k, v]) => `${k}="${v}"`)
        .join(' '),
)

// Full SVG filter element markup (id + attrs + inner primitives)
const fullFilterMarkup = computed(() =>
    `<filter id="${filterId}" ${filterAttrStr.value}>\n${filterMarkup.value}\n</filter>`,
)

// --- CSS Layers ---

const frostBlur = computed(() => props.layers?.frostBlur ?? 0)

const tintStyle = computed(() => {
    const t = props.layers?.tint
    if (!t) return null
    return { background: t.color, opacity: t.alpha }
})

const shineShadow = computed(() => {
    const s = props.layers?.shine
    if (!s) return null
    return `inset 2px 2px 1px 0 rgba(255,255,255,${s.alpha}), inset -1px -1px 1px 1px rgba(255,255,255,${s.alpha})`
})

const depthShadow = computed(() => props.layers?.depthShadow ?? null)

const glowShadow = computed(() => props.layers?.glow?.shadow ?? null)

const gradientBg = computed(() => {
    const g = props.layers?.gradient
    if (!g) return null
    const stops = g.colors.length === 2
        ? `${g.colors[0]}, ${g.colors[1]}`
        : `${g.colors[0]} 0%, ${g.colors[1]} 33%, ${g.colors[2]} 67%, ${g.colors[3]} 100%`
    return `linear-gradient(${g.rotation}deg, ${stops})`
})
</script>

<template>
    <component :is="tag" class="compositor">
        <!-- SVG filter definition (hidden) -->
        <svg v-if="needsSvgFilter" style="display: none" aria-hidden="true" v-html="fullFilterMarkup"></svg>

        <!-- EFFECT: backdrop blur + SVG distortion -->
        <div
            class="compositor-effect"
            :style="{
                backdropFilter: frostBlur > 0 ? `blur(${frostBlur}px)` : undefined,
                WebkitBackdropFilter: frostBlur > 0 ? `blur(${frostBlur}px)` : undefined,
                filter: needsSvgFilter ? `url(#${filterId})` : 'none',
            }"
        ></div>

        <!-- TINT: semi-transparent overlay -->
        <div
            v-if="tintStyle"
            class="compositor-tint"
            :style="tintStyle"
        ></div>

        <!-- GRADIENT: color gradient overlay -->
        <div
            v-if="gradientBg"
            class="compositor-gradient"
            :style="{ background: gradientBg }"
        ></div>

        <!-- SHINE: inner edge highlights -->
        <div
            v-if="shineShadow"
            class="compositor-shine"
            :style="{ boxShadow: shineShadow }"
        ></div>

        <!-- DEPTH: outer shadow -->
        <div
            v-if="depthShadow"
            class="compositor-depth"
            :style="{ boxShadow: depthShadow }"
        ></div>

        <!-- GLOW: deep luminous glow -->
        <div
            v-if="glowShadow"
            class="compositor-glow"
            :style="{ boxShadow: glowShadow }"
        ></div>

        <!-- CONTENT -->
        <div class="compositor-content">
            <slot />
        </div>
    </component>
</template>

<style scoped>
.compositor {
    position: relative;
}

.compositor-effect {
    position: absolute;
    z-index: 0;
    inset: 0;
    border-radius: inherit;
    clip-path: inherit;
    overflow: hidden;
    isolation: isolate;
}

.compositor-tint {
    z-index: 1;
    position: absolute;
    inset: 0;
    border-radius: inherit;
    clip-path: inherit;
    pointer-events: none;
}

.compositor-gradient {
    z-index: 1;
    position: absolute;
    inset: 0;
    border-radius: inherit;
    clip-path: inherit;
    pointer-events: none;
}

.compositor-shine {
    position: absolute;
    inset: 0;
    z-index: 2;
    border-radius: inherit;
    clip-path: inherit;
    overflow: hidden;
    pointer-events: none;
}

.compositor-depth {
    position: absolute;
    inset: 0;
    z-index: -1;
    border-radius: inherit;
    clip-path: inherit;
    pointer-events: none;
}

.compositor-glow {
    position: absolute;
    inset: 0;
    z-index: -2;
    border-radius: inherit;
    clip-path: inherit;
    pointer-events: none;
}

.compositor-content {
    position: relative;
    z-index: 3;
}
</style>
