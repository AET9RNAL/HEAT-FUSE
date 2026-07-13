<script lang="ts">
export type ButtonSize = 'slim' | 'half' | 'full' | 'flex'
export type SystemState = 'idle' | 'processing' | 'success' | 'error'
</script>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { motion, AnimatePresence } from 'motion-v'

interface Props {
    size?: ButtonSize
    label?: string
    systemState?: SystemState
    disabled?: boolean
    // State labels are props (no i18n in the overlay scope). Defaults are English.
    processingLabel?: string
    successLabel?: string
    errorLabel?: string
}

const props = withDefaults(defineProps<Props>(), {
    size: 'slim',
    label: '',
    systemState: 'idle',
    disabled: false,
    processingLabel: 'Working…',
    successLabel: 'Done',
    errorLabel: 'Error',
})

const emit = defineEmits<{ click: [event: MouseEvent] }>()

function handleClick(event: MouseEvent) {
    if (props.systemState === 'idle' && !props.disabled) {
        emit('click', event)
    }
}

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

const isInteractive = computed(() => props.systemState === 'idle' && !props.disabled)

const stateLabel = computed(() => {
    switch (props.systemState) {
        case 'processing': return props.processingLabel
        case 'success':    return props.successLabel
        case 'error':      return props.errorLabel
        default:           return props.label
    }
})

// Polygon stroke
const CUT = 6
const containerEl = ref<HTMLElement | null>(null)
const elW = ref(0)
const elH = ref(0)

const svgPoints = computed(() => {
    const w = elW.value
    const h = elH.value
    if (!w || !h) return ''
    const cx = (CUT / w) * 100
    const cy = (CUT / h) * 100
    return `${cx},0 100,0 100,${100 - cy} ${100 - cx},100 0,100 0,${cy}`
})

let ro: ResizeObserver | null = null
onMounted(() => {
    if (!containerEl.value) return
    ro = new ResizeObserver(([entry]) => {
        const box = entry.borderBoxSize?.[0]
        elW.value = box ? box.inlineSize : entry.contentRect.width
        elH.value = box ? box.blockSize  : entry.contentRect.height
    })
    ro.observe(containerEl.value)
})
onUnmounted(() => ro?.disconnect())
</script>

<template>
    <div ref="containerEl" class="ebutton-wrap" :style="containerStyle">
        <motion.button
            class="ebutton"
            :disabled="!isInteractive"
            :whileHover="isInteractive ? { backgroundColor: 'rgba(30, 30, 28, 0.75)' } : {}"
            :whileTap="isInteractive ? { scale: 0.94, backgroundColor: 'rgba(8, 8, 8, 0.8)' } : {}"
            :transition="{ duration: 0.15 }"
            @click="handleClick"
        >
            <AnimatePresence mode="wait">
                <motion.div
                    :key="systemState"
                    :initial="{ opacity: 0, y: -8 }"
                    :animate="{ opacity: 1, y: 0 }"
                    :exit="{ opacity: 0, y: 8 }"
                    :transition="{ duration: 0.15 }"
                    class="button-content"
                >
                    <span v-if="systemState === 'processing'" class="spinner" />
                    <span v-if="stateLabel && props.size !== 'slim'" class="label">
                        {{ stateLabel }}
                    </span>
                </motion.div>
            </AnimatePresence>
        </motion.button>

        <svg
            v-if="svgPoints"
            class="btn-stroke"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            xmlns="http://www.w3.org/2000/svg"
        >
            <polygon
                :points="svgPoints"
                fill="none"
                stroke="#525252"
                stroke-width="0.4"
                vector-effect="non-scaling-stroke"
            />
        </svg>
    </div>
</template>

<style scoped>
.ebutton-wrap {
    position: relative;
    clip-path: polygon(
        6px 0%,
        100% 0%,
        100% calc(100% - 6px),
        calc(100% - 6px) 100%,
        0% 100%,
        0% 6px
    );
}

.ebutton {
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

.btn-stroke {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    overflow: visible;
    z-index: 1;
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

.spinner {
    width: 12px;
    height: 12px;
    border: 2px solid rgba(255, 255, 255, 0.25);
    border-top-color: var(--accent-200);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
}

.ebutton:focus-visible {
    outline: 2px solid var(--accent-200);
    outline-offset: 2px;
}

.ebutton:disabled {
    opacity: 0.4;
    cursor: not-allowed;
}

@keyframes spin {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
}
</style>
