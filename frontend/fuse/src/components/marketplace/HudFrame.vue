<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { motion } from 'motion-v'
import { Dynamics } from '../../composables/useMotion'

const props = withDefaults(defineProps<{
    /** The bevel at the top-left and bottom-right corners, in px. */
    cut?: number
    /** Size of the top-right corner segment, in px. 0 keeps the corner square. */
    corner?: number
    /** Space between the frame chamfer and the corner segment, in px. */
    gap?: number
    /** Short bars at the middle of each edge. */
    ticks?: boolean
    /** Height of the header band, in px. 0 draws no band. */
    head?: number
    /** Entry delay in seconds, to stagger frames on one screen. */
    delay?: number
    /** A dashed outline, for a drop target. */
    dashed?: boolean
}>(), { cut: 10, corner: 0, gap: 4, ticks: true, head: 0, delay: 0, dashed: false })

// Entry: the outline draws itself, then the fill, band and ticks fade in behind it.
const DRAW = { duration: 0.55, ease: Dynamics.snappy.ease, delay: props.delay }
const FADE = { ...Dynamics.default, delay: props.delay + 0.2 }

// The frame is drawn in real pixels, so cuts and ticks keep their size at any width.
const el = ref<HTMLElement | null>(null)
const w = ref(0)
const h = ref(0)
let ro: ResizeObserver | null = null

onMounted(() => {
    if (!el.value) return
    ro = new ResizeObserver(() => {
        w.value = el.value?.offsetWidth ?? 0
        h.value = el.value?.offsetHeight ?? 0
    })
    ro.observe(el.value)
})
onBeforeUnmount(() => ro?.disconnect())

// The chamfer runs parallel to the hypotenuse of the corner segment, one gap away from it.
const chamfer = computed(() => props.corner > 0 ? props.corner + props.gap * Math.SQRT2 : 0)

const outline = computed(() => {
    const W = w.value - 0.5
    const H = h.value - 0.5
    const c = props.cut
    const k = chamfer.value
    const pts = [[c, 0.5]]
    if (k) pts.push([W - k, 0.5], [W, k])
    else pts.push([W, 0.5])
    pts.push([W, H - c], [W - c, H], [0.5, H], [0.5, c])
    return pts.map(p => p.join(',')).join(' ')
})

// The header band ends where it meets the chamfer.
const band = computed(() => {
    if (!props.head) return ''
    const W = w.value - 0.5
    const c = props.cut
    const k = chamfer.value
    const y = props.head
    const pts = [[c, 0.5]]
    if (k && y <= k) pts.push([W - k, 0.5], [W - k + y, y])
    else if (k) pts.push([W - k, 0.5], [W, k], [W, y])
    else pts.push([W, 0.5], [W, y])
    pts.push([0.5, y], [0.5, c])
    return pts.map(p => p.join(',')).join(' ')
})

const TICK = 14
const ticks = computed(() => {
    if (!props.ticks || !w.value) return []
    const W = w.value
    const H = h.value
    const out = [
        { x1: W / 2 - TICK, y1: 0, x2: W / 2 + TICK, y2: 0 },
        { x1: W / 2 - TICK, y1: H, x2: W / 2 + TICK, y2: H },
        { x1: 0, y1: H / 2 - 6, x2: 0, y2: H / 2 + 6 },
    ]
    if (H / 2 - 6 > chamfer.value) out.push({ x1: W, y1: H / 2 - 6, x2: W, y2: H / 2 + 6 })
    return out
})
</script>

<template>
    <div ref="el" class="hf">
        <svg v-if="w" class="hf-svg" :width="w" :height="h" :viewBox="`0 0 ${w} ${h}`" aria-hidden="true">
            <motion.g :initial="{ opacity: 0 }" :animate="{ opacity: 1 }" :transition="FADE">
                <polygon class="hf-fill" :points="outline" />
                <polygon v-if="head" class="hf-band" :points="band" />
            </motion.g>
            <polygon v-if="dashed" class="hf-line hf-dash" :points="outline" />
            <motion.polygon
                v-else
                class="hf-line"
                :points="outline"
                :initial="{ pathLength: 0 }"
                :animate="{ pathLength: 1 }"
                :transition="DRAW"
            />
            <motion.g :initial="{ opacity: 0 }" :animate="{ opacity: 1 }" :transition="FADE">
                <line v-for="(t, i) in ticks" :key="i" class="hf-tick" v-bind="t" />
            </motion.g>
        </svg>
        <div class="hf-body">
            <slot />
        </div>
        <div v-if="corner" class="hf-corner" :style="{ width: `${corner}px`, height: `${corner}px` }">
            <slot name="corner" />
        </div>
    </div>
</template>

<style scoped>
.hf {
    position: relative;
    display: flex;
    flex-direction: column;
    min-width: 0;
}

.hf-svg {
    position: absolute;
    top: 0;
    left: 0;
    overflow: visible;
    pointer-events: none;
}

.hf-fill {
    fill: var(--black-1-a);
}

.hf-band {
    fill: var(--black-3-a);
}

/* A parent sets --hf-stroke for a state, e.g. a drop target under a dragged file. */
.hf-line {
    fill: none;
    stroke: var(--hf-stroke, var(--base-600));
    stroke-width: 1;
}

.hf-dash {
    stroke-dasharray: 4 3;
}

.hf-tick {
    stroke: var(--base-200);
    stroke-width: 3;
}

.hf-body {
    position: relative;
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
}

.hf-corner {
    position: absolute;
    top: 0;
    right: 0;
    z-index: 1;
}
</style>
