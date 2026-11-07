<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { AnimatePresence, animate, motion } from 'motion-v'
import Icons from '../ui/Icons.vue'
import eProgressBar from '../ui/eProgressBar.vue'
import { Dynamics } from '../../composables/useMotion'
import { useI18n } from '../../composables/useI18n'

const { t } = useI18n()

const props = withDefaults(defineProps<{
    active: boolean
    /** Share from 0 to 1. */
    value: number
    /** Plugin files in the download. 0 = the App update. */
    files?: number
}>(), {
    files: 0,
})

const label = computed(() => {
    if (props.files === 0) return t('components.updateProgress.updating')
    if (props.files === 1) return t('components.updateProgress.installing')
    return t('components.updateProgress.installingMany', { count: props.files })
})

const displayPct = computed(() => `${(Math.min(1, Math.max(0, props.value)) * 100).toFixed(1)}%`)

const SPIN = { duration: 1, ease: 'linear' as const, repeat: Infinity }

const REVEAL_FROM = 0.97
const REVEAL_DELAY = 0.2
const surface = ref<HTMLElement | null>(null)
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
        el.style.setProperty('--reveal', String(v))
    }
    // Set the first frame now, so the surface does not paint one frame at full width.
    set(from)
    revealAnim = animate(from, to, { ...transition, delay, onUpdate: set })
}

watch([surface, () => props.active], ([el, on]) => {
    if (el && on) {
        revealEl = el
        tweenReveal(el, REVEAL_FROM, 1, Dynamics.snappy, REVEAL_DELAY)
    } else if (!on && revealEl) {
        tweenReveal(revealEl, reveal, REVEAL_FROM, Dynamics.default)
        revealEl = null
    }
}, { flush: 'post' })

onUnmounted(() => revealAnim?.stop())
</script>

<template>
    <AnimatePresence>
        <motion.div
            v-if="active"
            key="update-progress"
            class="update-progress"
            :initial="{ opacity: 0 }"
            :animate="{ opacity: 1 }"
            :exit="{ opacity: 0 }"
            :transition="Dynamics.smooth"
        >
            <span ref="surface" class="surface" aria-hidden="true" />
            <motion.div
                class="content"
                :initial="{ opacity: 0, x: 10 }"
                :animate="{ opacity: 1, x: 0 }"
                :transition="{ ...Dynamics.smooth, delay: REVEAL_DELAY }"
            >
                <div class="info-row">
                    <motion.span
                        class="spin-icon"
                        :initial="{ rotate: 0 }"
                        :animate="{ rotate: 360 }"
                        :transition="SPIN"
                    >
                        <Icons kind="reload" size="small" />
                    </motion.span>
                    <span class="label">{{ label }}</span>
                    <span class="pct">{{ displayPct }}</span>
                </div>
                <eProgressBar :value="value" />
            </motion.div>
        </motion.div>
    </AnimatePresence>
</template>

<style scoped>
.update-progress {
    -webkit-app-region: no-drag;
    position: relative;
    display: inline-flex;
    user-select: none;
}

/* Width follows --reveal (unset = 1). The contents keep their place. */
.surface {
    position: absolute;
    inset-block: 0;
    inset-inline: calc(50% * (1 - var(--reveal, 1)));
    box-sizing: border-box;
    background-color: var(--black-1-a);
    border: 1px solid var(--base-600);
    corner-shape: bevel;
    border-radius: 8px 0 8px 0;
}

.content {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    min-width: 176px;
    padding: var(--space-1) var(--space-3);
}

.info-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
}

.spin-icon {
    display: inline-flex;
    flex-shrink: 0;
    opacity: 0.7;
}

.label {
    font-family: var(--font-primary);
    font-size: var(--main-font-size-4);
    font-weight: var(--font-weight-3);
    color: var(--base-200);
    white-space: nowrap;
    line-height: 1;
}

.pct {
    font-family: var(--font-microcopy);
    font-size: var(--main-font-size-4);
    font-weight: var(--font-weight-2);
    font-variant-numeric: tabular-nums;
    color: var(--accent-50);
    white-space: nowrap;
    line-height: 1;
    margin-left: auto;
    padding-left: var(--space-3);
}
</style>
