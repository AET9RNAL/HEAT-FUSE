<script lang="ts">
export type ButtonSize = 'slim' | 'half' | 'full' | 'flex'
export type ButtonVariant = 'default' | 'accent'
export type SystemState = 'idle' | 'processing' | 'success' | 'error'
export type ButtonMode = 'default' | 'confirm' | 'hold' | 'toggle'
</script>

<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue'
import { motion, AnimatePresence } from 'motion-v'
import Icons, { type IconKind, type IconSize } from './Icons.vue'
import { useI18n } from '../composables/useI18n'
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
    /** toggle: current state */
    modelValue?: boolean
    /** toggle: content shown while on */
    activeLabel?: string
    activeIcon?: IconKind
}

const props = withDefaults(defineProps<Props>(), {
    size: 'slim',
    variant: 'default',
    mode: 'default',
    label: '',
    iconSize: 'normal',
    systemState: 'idle',
    disabled: false,
    confirmLabel: '',
    confirmIcon: 'checkmark',
    holdMs: 600,
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

// hold
const holding = ref(false)
let holdTimer: ReturnType<typeof setTimeout> | null = null

function startHold(event: PointerEvent) {
    if (props.mode !== 'hold' || !isInteractive.value || event.button !== 0) return
    holding.value = true
    holdTimer = setTimeout(() => {
        holdTimer = null
        holding.value = false
        emit('click', event)
    }, props.holdMs)
}

function cancelHold() {
    if (holdTimer) { clearTimeout(holdTimer); holdTimer = null }
    holding.value = false
}

function onPointerLeave() {
    cancelHold()
    if (props.mode === 'confirm') disarm()
}

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
    cancelHold()
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
    return { icon: props.icon, label: props.label }
})

const contentKey = computed(() => `${props.systemState}:${armed.value}:${toggleOn.value}`)

const borderColor = computed(() => {
    if (armed.value) return 'var(--error-base)'
    if (props.variant === 'accent') return 'rgba(0, 0, 0, 0)'
    return 'var(--base-600)'
})

const fillColor = computed(() => {
    if (armed.value) return 'rgba(102, 35, 43, 0.85)'
    // Toggle's wrap carries the body fill, so the inset surface is clear until active.
    if (props.mode === 'toggle') return toggleOn.value ? 'var(--accent-200)' : 'rgba(10, 10, 10, 0)'
    if (props.variant === 'accent') return 'rgb(132, 255, 177)'
    return 'rgba(10, 10, 10, 0.6)'
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
            :whileHover="isInteractive && !armed && !toggleOn ? { backgroundColor: variant === 'accent' ? 'rgb(168, 255, 200)' : 'rgba(30, 30, 28, 0.75)' } : {}"
            :whileTap="isInteractive ? { scale: 0.94 } : {}"
            :transition="{ duration: 0.15 }"
            @click="handleClick"
            @pointerdown="startHold"
            @pointerup="cancelHold"
            @pointercancel="cancelHold"
            @pointerleave="onPointerLeave"
        >
            <motion.div
                v-if="mode === 'hold'"
                class="hold-fill"
                :initial="false"
                :animate="{ scaleX: holding ? 1 : 0 }"
                :transition="holding ? { duration: holdMs / 1000, ease: 'linear' } : { duration: 0.2 }"
            />
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

.variant-accent.ebutton-wrap {
    border-color: transparent;
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
