<script lang="ts">
export interface FtueLabels {
    skip: string
    start: string
    back: string
    next: string
    done: string
    /** Skip button labels, in order, across the hold. */
    skipHold: string[]
    /** Chip text for steps that show sample data. */
    sample: string
}
</script>

<script setup lang="ts">
import { computed, onUnmounted, ref, shallowRef, watch } from 'vue'
import { AnimatePresence, animate, motion } from 'motion-v'
import eFtueCard from './eFtueCard.vue'
import { Dynamics } from '../../composables/useMotion'
import {
    ftue,
    ftueStep,
    ftueSample,
    ftueWaiting,
    ftueAnchor,
    placeFtue,
    nextFtue,
    backFtue,
    skipFtue,
    type FtueRect,
    type FtueSize,
} from '../../directives/vFtue'

const props = withDefaults(defineProps<{
    labels: FtueLabels
    /** The area the tour uses, in window px. Unset = the whole window. */
    bounds?: FtueRect | null
    /** Extra class on the parts that take clicks, e.g. a surface's hit-test class. */
    layerClass?: string
}>(), {
    bounds: null,
    layerClass: '',
})

// Stroke sits this far outside the target.
const PAD = 4
// Matches Dynamics.smooth, so a glide ends before tracking snaps again.
const GLIDE_MS = 350
// Skip ends the whole tour, so it needs a long hold.
const SKIP_HOLD_MS = 4000

const active = computed(() => !!ftue.tour && !!ftueStep.value)
const total = computed(() => ftue.tour?.steps.length ?? 0)
const isFirst = computed(() => ftue.index === 0)
const isLast = computed(() => ftue.index === total.value - 1)

// A held Esc turns the back button into Skip on any step, with the same hold rule.
const escHeld = ref(false)
const skipMode = computed(() => isFirst.value || escHeld.value)

const backLabel = computed(() => (skipMode.value ? props.labels.skip : props.labels.back))
const nextLabel = computed(() => {
    if (isLast.value) return props.labels.done
    return isFirst.value ? props.labels.start : props.labels.next
})
const backDisabled = computed(() => !skipMode.value && !!ftueStep.value?.noBack)

function onBack(): void {
    if (skipMode.value) skipFtue()
    else backFtue()
}

const rect = shallowRef<FtueRect | null>(null)
const view = shallowRef<FtueSize>({ width: window.innerWidth, height: window.innerHeight })
const cardSize = shallowRef<FtueSize>({ width: 467, height: 240 })
const cardBox = ref<HTMLElement | null>(null)

const area = computed<FtueRect>(() => props.bounds ?? { x: 0, y: 0, width: view.value.width, height: view.value.height })

function measure(): void {
    const vw = window.innerWidth
    const vh = window.innerHeight
    if (vw !== view.value.width || vh !== view.value.height) view.value = { width: vw, height: vh }
    const el = ftueAnchor(ftueStep.value?.target)
    const box = el?.getBoundingClientRect()
    const next = box && (box.width || box.height)
        ? {
            x: Math.round(box.left) - PAD,
            y: Math.round(box.top) - PAD,
            width: Math.round(box.width) + PAD * 2,
            height: Math.round(box.height) + PAD * 2,
        }
        : null
    const prev = rect.value
    if (next && prev && next.x === prev.x && next.y === prev.y && next.width === prev.width && next.height === prev.height) return
    if (next || prev) rect.value = next
}

// rAF tracking also follows motion-v transforms and scroll, which ResizeObserver misses.
let raf = 0
function track(): void {
    measure()
    raf = requestAnimationFrame(track)
}

const gliding = ref(false)
let glideTimer = 0

watch(ftueStep, (step) => {
    if (!step) return
    ftueAnchor(step.target)?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    measure()
    gliding.value = true
    window.clearTimeout(glideTimer)
    glideTimer = window.setTimeout(() => { gliding.value = false }, GLIDE_MS)
})

const motionTransition = computed(() => (gliding.value ? Dynamics.smooth : { duration: 0 }))

watch(cardBox, (el, _prev, onCleanup) => {
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
        const box = entry.borderBoxSize?.[0]
        cardSize.value = box
            ? { width: box.inlineSize, height: box.blockSize }
            : { width: entry.contentRect.width, height: entry.contentRect.height }
    })
    ro.observe(el)
    onCleanup(() => ro.disconnect())
})

const REVEAL_FROM = 0.97
// At each step, the surface holds at 80% for this many seconds, then grows.
const REVEAL_DELAY = 0.2
let revealAnim: { stop: () => void } | null = null
let revealEl: HTMLElement | null = null
let reveal = 1

function tweenReveal(
    el: HTMLElement,
    from: number,
    to: number,
    transition: typeof Dynamics.snappy | typeof Dynamics.default,
    delay = 0,
): void {
    revealAnim?.stop()
    const set = (v: number): void => {
        reveal = v
        el.style.setProperty('--ftue-reveal', String(v))
    }
    // Set the first frame now, so the card does not paint one frame at full width.
    set(from)
    revealAnim = animate(from, to, { ...transition, delay, onUpdate: set })
}

watch([cardBox, ftueStep], ([el, step]) => {
    if (el && step) {
        revealEl = el
        tweenReveal(el, REVEAL_FROM, 1, Dynamics.snappy, REVEAL_DELAY)
    } else if (!step && revealEl) {
        tweenReveal(revealEl, reveal, REVEAL_FROM, Dynamics.default)
        revealEl = null
    }
}, { flush: 'post' })

// Placement works inside the area, then goes back to window px.
const placement = computed(() => {
    const step = ftueStep.value
    const a = area.value
    const r = rect.value
    const local = r ? { ...r, x: r.x - a.x, y: r.y - a.y } : null
    const p = placeFtue(local, cardSize.value, step?.side ?? 'bottom', step?.align ?? 'center', a)
    return { ...p, x: p.x + a.x, y: p.y + a.y }
})

// The undimmed hole, in area px. A step with no target closes it to a point, so the whole area dims.
const hole = computed<FtueRect>(() => {
    const a = area.value
    const r = rect.value
    if (!r) return { x: Math.round(a.width / 2), y: Math.round(a.height / 2), width: 0, height: 0 }
    return { ...r, x: r.x - a.x, y: r.y - a.y }
})

const areaStyle = computed(() => boxStyle(area.value.x, area.value.y, area.value.width, area.value.height))

function boxStyle(x: number, y: number, width: number, height: number): Record<string, string> {
    return { left: `${x}px`, top: `${y}px`, width: `${Math.max(0, width)}px`, height: `${Math.max(0, height)}px` }
}

// An interactive step leaves the highlight open: four blockers frame it, so only the target takes clicks.
const blockers = computed(() => {
    const a = area.value
    const r = rect.value
    if (!ftueStep.value?.interactive || !r) return [areaStyle.value]
    const right = r.x + r.width
    const bottom = r.y + r.height
    return [
        boxStyle(a.x, a.y, a.width, r.y - a.y),
        boxStyle(a.x, bottom, a.width, a.y + a.height - bottom),
        boxStyle(a.x, r.y, r.x - a.x, r.height),
        boxStyle(right, r.y, a.x + a.width - right, r.height),
    ]
})

// Echo strokes loop out anim
const ECHOES = 2
const ECHO_S = 1.2
const ECHO_GROW = 10
// -1 sits each echo on the stroke's own border.
const ECHO_EDGE = [-1, -1 - ECHO_GROW]
// Opacity starts and ends at 0. Motion restarts opacity and the edges on separate timers
const echoAnimate = { opacity: [0, 1, 0], top: ECHO_EDGE, right: ECHO_EDGE, bottom: ECHO_EDGE, left: ECHO_EDGE }

function echoTransition(n: number) {
    const loop = { duration: ECHO_S, repeat: Infinity, delay: ((n - 1) * ECHO_S) / ECHOES }
    // On the stroke the echo adds to its brightness, so it stays dim until it is clear of the stroke, then fades.
    const opacity = { ...loop, times: [0, 0.25, 1], ease: ['easeIn', 'easeOut'] as const }
    return { ...loop, ease: 'easeOut' as const, opacity }
}

function onKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') escHeld.value = true
    else if (event.key === 'ArrowRight' || event.key === 'Enter') nextFtue()
    else if (event.key === 'ArrowLeft') backFtue()
    else return
    event.preventDefault()
    event.stopPropagation()
}

function onKeyUp(event: KeyboardEvent): void {
    if (event.key === 'Escape') escHeld.value = false
}

function releaseEsc(): void {
    escHeld.value = false
}

function stopListening(): void {
    cancelAnimationFrame(raf)
    window.removeEventListener('keydown', onKey, true)
    window.removeEventListener('keyup', onKeyUp, true)
    window.removeEventListener('blur', releaseEsc)
    escHeld.value = false
}

watch(active, (on) => {
    stopListening()
    if (!on) {
        rect.value = null
        return
    }
    // Focus left on an app control would take Enter and Space from the tour.
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('keyup', onKeyUp, true)
    window.addEventListener('blur', releaseEsc)
    track()
}, { immediate: true })

onUnmounted(() => {
    stopListening()
    revealAnim?.stop()
    window.clearTimeout(glideTimer)
})
</script>

<template>
    <Teleport to="body">
        <template v-if="active">
            <div
                v-for="(b, i) in blockers"
                :key="i"
                class="ftue-blocker"
                :class="layerClass"
                :style="b"
            />
        </template>

        <div class="ftue-dim-clip" :style="areaStyle">
            <AnimatePresence>
                <motion.div
                    v-if="active"
                    key="ftue-dim"
                    class="ftue-dim"
                    :initial="{ opacity: 0, ...hole }"
                    :animate="{ opacity: ftueStep?.dim === false ? 0 : 1, ...hole }"
                    :exit="{ opacity: 0 }"
                    :transition="{ ...motionTransition, opacity: Dynamics.default }"
                >
                    <motion.div
                        class="ftue-stroke"
                        :initial="{ opacity: 0 }"
                        :animate="{ opacity: rect ? 1 : 0 }"
                        :transition="Dynamics.default"
                    >
                        <motion.span
                            v-for="n in ECHOES"
                            :key="n"
                            class="ftue-echo"
                            :initial="{ opacity: 0 }"
                            :animate="echoAnimate"
                            :transition="echoTransition(n)"
                        />
                    </motion.div>
                </motion.div>
            </AnimatePresence>
        </div>

        <AnimatePresence>
            <motion.div
                v-if="active && ftueStep"
                key="ftue-card"
                class="ftue-place"
                :class="layerClass"
                :initial="{ opacity: 0, x: placement.x, y: placement.y }"
                :animate="{ opacity: 1, x: placement.x, y: placement.y }"
                :exit="{ opacity: 0 }"
                :transition="{ ...motionTransition, opacity: Dynamics.smooth }"
            >
                <div ref="cardBox">
                    <eFtueCard
                        :title="ftueStep.title"
                        :body="ftueStep.body"
                        :index="ftue.index"
                        :total="total"
                        :back-label="backLabel"
                        :back-hold-ms="skipMode ? SKIP_HOLD_MS : 0"
                        :back-hold-labels="labels.skipHold"
                        :back-hold-active="escHeld"
                        :back-disabled="backDisabled"
                        :demo-label="ftueSample ? labels.sample : ''"
                        :next-label="nextLabel"
                        :next-disabled="ftueWaiting"
                        @back="onBack"
                        @next="nextFtue"
                    />
                </div>
            </motion.div>
        </AnimatePresence>
    </Teleport>
</template>

<style scoped>
/* In the App this is under the Titlebar (9999), so window buttons and drag keep working. */
.ftue-blocker {
    position: fixed;
    z-index: 9990;
}

/* Dim and card sit above modals (10000), under the tooltip (100000). */
.ftue-dim-clip {
    position: fixed;
    z-index: 10400;
    overflow: hidden;
    pointer-events: none;
}

/* The box is the hole. Its spread shadow dims the rest of the area and takes no clicks. */
.ftue-dim {
    position: absolute;
    top: 0;
    left: 0;
    box-sizing: border-box;
    corner-shape: bevel;
    border-radius: 6px 0 6px 0;
    box-shadow: 0 0 0 200vmax var(--black-1-a);
}

.ftue-stroke {
    position: absolute;
    inset: 0;
    border: 1px solid #84ffb1;
    corner-shape: bevel;
    border-radius: 6px 0 6px 0;
    filter:
        drop-shadow(0 0 3.1px #84ffb1)
        drop-shadow(0 0 1px #84ffb1);
}

.ftue-echo {
    position: absolute;
    box-sizing: border-box;
    pointer-events: none;
    border: 1px solid #84ffb1;
    corner-shape: bevel;
    border-radius: 6px 0 6px 0;
}

.ftue-place {
    position: fixed;
    top: 0;
    left: 0;
    z-index: 10500;
}
</style>
