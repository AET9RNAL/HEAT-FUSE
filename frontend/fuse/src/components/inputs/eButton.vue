<script lang="ts">
export type ButtonSize = 'slim' | 'half' | 'full' | 'flex'
// primary: stroke + body. secondary: body only. tertiary: label only. accent: accent body, no stroke.
export type ButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'accent'
export type SystemState = 'idle' | 'processing' | 'success' | 'error'
export type ButtonMode = 'default' | 'confirm' | 'hold' | 'toggle'
</script>

<script setup lang="ts">
import { ref, computed, onUnmounted, watch } from 'vue'
import { motion, AnimatePresence, animate } from 'motion-v'
import Icons, { type IconKind, type IconSize } from '../ui/Icons.vue'
import eThrobber from '../ui/eThrobber.vue'
import { useScrambleText } from '../../composables/useScrambleText'
import { useI18n } from '../../composables/useI18n'
const { t } = useI18n()

interface Props {
    size?: ButtonSize
    variant?: ButtonVariant
    mode?: ButtonMode
    label?: string
    icon?: IconKind
    iconSize?: IconSize
    systemState?: SystemState
    disabled?: boolean
    /** confirm: content shown while armed */
    confirmLabel?: string
    confirmIcon?: IconKind
    /** hold: press duration before the click fires */
    holdMs?: number
    /** hold: show the dot-grid throbber, filled by the hold progress */
    holdThrobber?: boolean
    /** hold: labels shown in order across the hold, in place of `label` */
    holdLabels?: string[]
    /** hold: true starts a hold from outside, e.g. a held key; false cancels it */
    holdActive?: boolean
    /** toggle: current state */
    modelValue?: boolean
    /** toggle: content shown while on */
    activeLabel?: string
    activeIcon?: IconKind
}

const props = withDefaults(defineProps<Props>(), {
    size: 'slim',
    variant: 'primary',
    mode: 'default',
    label: '',
    iconSize: 'normal',
    systemState: 'idle',
    disabled: false,
    confirmLabel: '',
    confirmIcon: 'checkmark',
    holdMs: 600,
    holdThrobber: false,
    holdLabels: undefined,
    holdActive: false,
    modelValue: false,
    activeLabel: '',
    activeIcon: undefined,
})

const emit = defineEmits<{
    click: [event: MouseEvent]
    'update:modelValue': [value: boolean]
}>()

const isInteractive = computed(() => props.systemState === 'idle' && !props.disabled)

// confirm
const CONFIRM_TIMEOUT_MS = 3000
const armed = ref(false)
let armTimer: ReturnType<typeof setTimeout> | null = null

function disarm() {
    armed.value = false
    if (armTimer) { clearTimeout(armTimer); armTimer = null }
}

function arm() {
    armed.value = true
    if (armTimer) clearTimeout(armTimer)
    armTimer = setTimeout(disarm, CONFIRM_TIMEOUT_MS)
}

// hold: one 0..1 tween drives the fill, the throbber and the labels, and fires the click at 1.
type HoldSource = 'pointer' | 'external'
const holding = ref(false)
const holdProgress = ref(0)
let holdSource: HoldSource | null = null
let holdAnim: { stop: () => void } | null = null

function startHold(source: HoldSource, event?: MouseEvent) {
    if (props.mode !== 'hold' || !isInteractive.value || holding.value) return
    holding.value = true
    holdSource = source
    holdAnim?.stop()
    // A new hold continues from the current fill, so the full hold always takes holdMs.
    holdAnim = animate(holdProgress.value, 1, {
        duration: (props.holdMs / 1000) * (1 - holdProgress.value),
        ease: 'linear',
        onUpdate: (v: number) => { holdProgress.value = v },
        onComplete: () => {
            holding.value = false
            holdSource = null
            holdProgress.value = 0
            emit('click', event ?? new MouseEvent('click'))
        },
    })
}

/** A pointer release cancels only a pointer hold, and the same is true for an outside hold. */
function cancelHold(source?: HoldSource) {
    if (!holding.value || (source && source !== holdSource)) return
    holding.value = false
    holdSource = null
    holdAnim?.stop()
    holdAnim = animate(holdProgress.value, 0, {
        duration: 0.2,
        onUpdate: (v: number) => { holdProgress.value = v },
    })
}

function onPointerDown(event: PointerEvent) {
    if (event.button === 0) startHold('pointer', event)
}

function onPointerLeave() {
    cancelHold('pointer')
    if (props.mode === 'confirm') disarm()
}

watch(() => props.holdActive, (on) => {
    if (on) startHold('external')
    else cancelHold('external')
})

const holdLabel = computed(() => {
    const labels = props.holdLabels
    if (!holding.value || !labels?.length) return ''
    return labels[Math.min(labels.length - 1, Math.floor(holdProgress.value * labels.length))]
})

// With hold labels on, every label change reveals its letters in random order.
const scrambleOn = computed(() => props.mode === 'hold' && !!props.holdLabels?.length)
const shownLabel = useScrambleText(computed(() => holdLabel.value || props.label), scrambleOn)

function handleClick(event: MouseEvent) {
    if (!isInteractive.value) return
    switch (props.mode) {
        // Fires from the hold timer, never from the click itself.
        case 'hold':
            return
        case 'confirm':
            if (!armed.value) { arm(); return }
            disarm()
            emit('click', event)
            return
        case 'toggle':
            emit('update:modelValue', !props.modelValue)
            emit('click', event)
            return
        default:
            emit('click', event)
    }
}

onUnmounted(() => {
    disarm()
    holdAnim?.stop()
})

const toggleOn = computed(() => props.mode === 'toggle' && props.modelValue)

const sizeMap: Record<Exclude<ButtonSize, 'flex'>, { width: number; height: number }> = {
    slim: { width: 48,  height: 32 },
    half: { width: 140, height: 32 },
    full: { width: 280, height: 32 },
}

const containerStyle = computed(() => {
    if (props.size === 'flex') return { width: '100%', height: '32px' }
    const { width, height } = sizeMap[props.size]
    return { width: `${width}px`, height: `${height}px` }
})

const stateContent = computed(() => {
    switch (props.systemState) {
        case 'processing': return { icon: 'reload' as IconKind, label: t('components.button.processing') }
        case 'success':    return { icon: 'checkmark' as IconKind, label: t('components.button.success') }
        case 'error':      return { icon: 'cross' as IconKind, label: t('components.button.error') }
    }
    if (props.mode === 'confirm' && armed.value) {
        return { icon: props.confirmIcon, label: props.confirmLabel || t('components.button.confirm') }
    }
    if (toggleOn.value) {
        return { icon: props.activeIcon ?? props.icon, label: props.activeLabel || props.label }
    }
    return { icon: props.icon, label: shownLabel.value }
})

const contentKey = computed(() => `${props.systemState}:${armed.value}:${toggleOn.value}`)

const borderColor = computed(() => {
    if (armed.value) return 'var(--error-base)'
    return props.variant === 'primary' ? 'var(--base-600)' : 'rgba(0, 0, 0, 0)'
})

const fillColor = computed(() => {
    if (armed.value) return 'rgba(102, 35, 43, 0.85)'
    // Toggle's wrap carries the body fill, so the inset surface is clear until active.
    if (props.mode === 'toggle') return toggleOn.value ? 'var(--accent-200)' : 'rgba(10, 10, 10, 0)'
    if (props.variant === 'accent') return 'rgb(132, 255, 177)'
    if (props.variant === 'tertiary') return 'rgba(10, 10, 10, 0)'
    return 'rgba(10, 10, 10, 0.6)'
})

const hoverFill = computed(() => {
    if (props.variant === 'accent') return 'rgb(168, 255, 200)'
    if (props.variant === 'tertiary') return 'rgba(255, 255, 255, 0.06)'
    return 'rgba(30, 30, 28, 0.75)'
})

// Only recolour the glyph in states that need it; the plain img stays untouched otherwise.
const iconColor = computed(() => (toggleOn.value ? 'var(--black-1)' : ''))
</script>

<template>
    <motion.div
        class="ebutton-wrap"
        :class="[`variant-${variant}`, `mode-${mode}`, { armed, 'toggle-on': toggleOn }]"
        :style="containerStyle"
        :initial="false"
        :animate="{ borderColor }"
        :transition="{ duration: 0.15 }"
    >
        <motion.button
            class="ebutton"
            :disabled="!isInteractive"
            :initial="false"
            :animate="{ backgroundColor: fillColor }"
            :whileHover="isInteractive && !armed && !toggleOn ? { backgroundColor: hoverFill } : {}"
            :whileTap="isInteractive ? { scale: 0.94 } : {}"
            :transition="{ duration: 0.15 }"
            @click="handleClick"
            @pointerdown="onPointerDown"
            @pointerup="cancelHold('pointer')"
            @pointercancel="cancelHold('pointer')"
            @pointerleave="onPointerLeave"
        >
            <div
                v-if="mode === 'hold'"
                class="hold-fill"
                :style="{ transform: `scaleX(${holdProgress})` }"
            />
            <AnimatePresence>
                <motion.span
                    v-if="mode === 'hold' && holdThrobber && holding"
                    key="hold-throbber"
                    class="hold-throbber"
                    :initial="{ opacity: 0, width: 0 }"
                    :animate="{ opacity: 1, width: 18 }"
                    :exit="{ opacity: 0, width: 0 }"
                    :transition="{ duration: 0.15 }"
                >
                    <eThrobber :progress="holdProgress" :active="holding" />
                </motion.span>
            </AnimatePresence>
            <AnimatePresence mode="wait">
                <motion.div
                    :key="contentKey"
                    :initial="{ opacity: 0, y: -8 }"
                    :animate="{ opacity: 1, y: 0 }"
                    :exit="{ opacity: 0, y: 8 }"
                    :transition="{ duration: 0.15 }"
                    class="button-content"
                >
                    <span v-if="stateContent.label && props.size !== 'slim'" class="label">
                        {{ stateContent.label }}
                    </span>
                    <Icons
                        v-if="stateContent.icon"
                        :kind="stateContent.icon"
                        :size="iconSize"
                        :color="iconColor"
                        :class="{ spinning: systemState === 'processing' }"
                    />
                </motion.div>
            </AnimatePresence>
        </motion.button>
    </motion.div>
</template>

<style scoped>
.ebutton-wrap {
    position: relative;
    box-sizing: border-box;
    overflow: hidden;
    border: 1px solid var(--base-600);
    corner-shape: bevel;
    border-radius: 6px 0 6px 0;
}

.variant-secondary.ebutton-wrap,
.variant-tertiary.ebutton-wrap,
.variant-accent.ebutton-wrap {
    border-color: transparent;
}

.variant-tertiary .ebutton {
    background: transparent;
}

.ebutton {
    position: relative;
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-1);
    padding: var(--space-1) var(--space-2);
    border: none;
    background: var(--black-1-a);
    color: var(--text-main);
    cursor: pointer;
    font-family: var(--font-primary);
    font-size: var(--main-font-size-3);
    font-weight: var(--font-weight-3);
    user-select: none;
    -webkit-user-select: none;
}

.variant-accent .ebutton {
    background: var(--accent-200);
    color: var(--black-1);
    font-weight: var(--font-weight-2);
}

.mode-toggle.ebutton-wrap {
    padding: var(--space-0);
    background: var(--black-1-a);
}

.mode-toggle .ebutton {
    background: transparent;
    corner-shape: bevel;
    border-radius: 4px 0 4px 0;
}

.toggle-on .ebutton {
    color: var(--black-1);
}

.hold-fill {
    position: absolute;
    inset: 0;
    z-index: 0;
    transform-origin: left center;
    background: rgba(132, 255, 177, 0.25);
    pointer-events: none;
}

/* Opens from 0 to the throbber (14px) plus the gap. The negative margin cancels the flex gap while it is closed. */
.hold-throbber {
    position: relative;
    z-index: 1;
    display: flex;
    overflow: hidden;
    margin-right: calc(-1 * var(--space-1));
}

.button-content {
    position: relative;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-1);
}

.label {
    user-select: none;
    -webkit-user-select: none;
    white-space: nowrap;
    color: inherit;
}

.ebutton:focus-visible {
    outline: 2px solid var(--accent-200);
    outline-offset: 2px;
}

.ebutton:disabled {
    opacity: 0.4;
    cursor: not-allowed;
}

.spinning {
    animation: spin 1s linear infinite;
}

@keyframes spin {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
}
</style>
