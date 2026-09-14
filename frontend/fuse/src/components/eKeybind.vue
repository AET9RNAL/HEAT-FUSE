<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import { motion, AnimatePresence } from 'motion-v'
import Icons from './Icons.vue'
import eKey from './eKey.vue'
import { Dynamics } from '../composables/useMotion'
import { useKeybindCapture } from '../composables/useKeybindCapture'

const props = withDefaults(defineProps<{
    label: string
    description?: string
    modelValue?: string
    resetValue?: string
}>(), {
    description: '',
    modelValue: '',
    resetValue: '',
})

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const ACTION = 'keybind'

// Modifiers pressed so far in the capture in progress
const pendingMods = ref<string[]>([])

// a refused key is shown in place of the combo, not silently reverting
const rejectedKey = ref('')
const REJECT_MS = 1600
let rejectTimer: ReturnType<typeof setTimeout> | null = null

const { capturingAction, startCapture, cancelCapture } = useKeybindCapture(
    (_action, combo) => {
        pendingMods.value = []
        emit('update:modelValue', combo)
    },
    {
        onProgress: (_action, mods) => { pendingMods.value = mods },
        onReject: (_action, key) => {
            rejectedKey.value = key
            if (rejectTimer) clearTimeout(rejectTimer)
            rejectTimer = setTimeout(() => {
                rejectedKey.value = ''
                pendingMods.value = []
                rejectTimer = null
            }, REJECT_MS)
        },
    },
)

const isCapturing = computed(() => capturingAction.value === ACTION)
const infoHovered = ref(false)
const keysHovered = ref(false)

const MODIFIERS = new Set(['ctrl', 'alt', 'shift', 'meta'])

function toPart(p: string) {
    return {
        label: p.toUpperCase(),
        variant: MODIFIERS.has(p) ? 'functional' as const : 'standalone' as const,
    }
}

// While capturing, the row shows only what has been pressed so far, followed by
// an idle key anticipating the next one. Otherwise it renders the bound combo.
const parts = computed(() => {
    // A rejection holds the offending key on screen instead of restoring the combo
    if (rejectedKey.value) {
        return [
            ...pendingMods.value.map(toPart),
            { label: rejectedKey.value.toUpperCase(), variant: 'error' as const },
        ]
    }
    if (isCapturing.value) return pendingMods.value.map(toPart)
    if (!props.modelValue) return []
    return props.modelValue.split('+').map(toPart)
})

const resetSpin = ref(0)
const resetHovered = ref(false)
const spinning = ref(false)
let spinTimer: ReturnType<typeof setTimeout> | null = null

const SPIN_MS = 600
const SPIN_STEP = -360
// Anticipation on Hover
const ANTICIPATE = SPIN_STEP > 0 ? -20 : 20

const resetRotation = computed(() => resetSpin.value + (resetHovered.value ? ANTICIPATE : 0))

const resetTransition = computed(() => spinning.value
    ? { duration: SPIN_MS / 1000, ease: [0.40, 0.50, 0.40, 1.00] }
    : Dynamics.bouncy)

function onKeysClick() {
    if (isCapturing.value) { cancelCapture(); return }
    pendingMods.value = []   // clear the shown combo before anticipating the new one
    clearRejected()
    startCapture(ACTION)
}

function clearRejected() {
    if (rejectTimer) { clearTimeout(rejectTimer); rejectTimer = null }
    rejectedKey.value = ''
    pendingMods.value = []
}

// A press anywhere outside the keys half aborts the capture. Another eKeybind
// starting its own capture cancels this one through the composable.
const keysEl = ref<HTMLElement | null>(null)

function onOutsidePointerDown(event: PointerEvent) {
    if (keysEl.value?.contains(event.target as Node)) return
    cancelCapture()
}

watch(isCapturing, (capturing) => {
    if (capturing) {
        document.addEventListener('pointerdown', onOutsidePointerDown, true)
    } else {
        document.removeEventListener('pointerdown', onOutsidePointerDown, true)
        // A rejection keeps its modifier chain on screen alongside the refused key
        if (!rejectedKey.value) pendingMods.value = []
    }
})

function onReset() {
    if (isCapturing.value) cancelCapture()
    spinning.value = true
    resetSpin.value += SPIN_STEP
    if (spinTimer) clearTimeout(spinTimer)
    spinTimer = setTimeout(() => { spinning.value = false; spinTimer = null }, SPIN_MS)
    emit('update:modelValue', props.resetValue)
}

onUnmounted(() => {
    cancelCapture()
    if (spinTimer) clearTimeout(spinTimer)
    if (rejectTimer) clearTimeout(rejectTimer)
    document.removeEventListener('pointerdown', onOutsidePointerDown, true)
})
</script>

<template>
    <div class="e-keybind">
        <div
            class="kb-info"
            @mouseenter="infoHovered = true"
            @mouseleave="infoHovered = false"
        >
            <div class="kb-body">
                <span class="kb-label">{{ label }}</span>
                <span v-if="description" class="kb-description">{{ description }}</span>
            </div>

            <AnimatePresence>
                <motion.button
                    v-if="infoHovered"
                    key="reset"
                    v-tip="'Reset to default'"
                    class="kb-reset"
                    type="button"
                    :initial="{ opacity: 0 }"
                    :animate="{ opacity: 1 }"
                    :exit="{ opacity: 0 }"
                    :transition="Dynamics.quick"
                    :whileTap="{ scale: 0.88 }"
                    @mouseenter="resetHovered = true"
                    @mouseleave="resetHovered = false"
                    @click.stop="onReset"
                >
                    <motion.div
                        class="kb-reset-icon"
                        :initial="{ rotate: resetSpin }"
                        :animate="{ rotate: resetRotation }"
                        :transition="resetTransition"
                    >
                        <Icons kind="reset" size="large" />
                    </motion.div>
                </motion.button>
            </AnimatePresence>
        </div>

        <!-- Right half: the keystroke, click to capture -->
        <div
            ref="keysEl"
            class="kb-keys"
            :class="{ hovered: keysHovered || isCapturing }"
            @mouseenter="keysHovered = true"
            @mouseleave="keysHovered = false"
            @click="onKeysClick"
        >
            <template v-for="(part, i) in parts" :key="part.label + i">
                <span v-if="i > 0" class="kb-plus">+</span>
                <eKey :label="part.label" :variant="part.variant" />
            </template>

            <!-- Anticipation: idle frame prompting the next keystroke -->
            <template v-if="isCapturing">
                <span v-if="parts.length > 0" class="kb-plus">+</span>
                <eKey />
            </template>
        </div>

    </div>
</template>

<style scoped>
.e-keybind {
    position: relative;
    display: flex;
    align-items: center;
    min-height: 64px;
    width: 100%;
    box-sizing: border-box;
    background: var(--black-2-a);
    user-select: none;
    -webkit-user-select: none;
    border: 1px solid var(--base-600);
    corner-shape: bevel;
    border-radius: 6px 0 6px 0;
}

.kb-info {
    display: flex;
    flex: 1;
    min-width: 0;
    align-self: stretch;
    align-items: center;
    justify-content: space-between;
    padding-left: var(--space-4);
}

.kb-body {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: var(--space-1);
    min-width: 0;
}

.kb-label {
    font-family: var(--font-primary);
    font-size: var(--main-font-size-3);
    font-weight: var(--font-weight-2);
    color: var(--text-muted);
    line-height: 1;
    white-space: nowrap;
}

.kb-description {
    font-family: var(--font-microcopy);
    font-size: var(--secondary-font-size-4);
    font-weight: var(--font-weight-3);
    color: var(--text-muted);
    line-height: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.kb-reset-icon {
    display: flex;
    align-items: center;
    justify-content: center;
}

.kb-reset {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 64px;
    align-self: stretch;
    border: none;
    cursor: pointer;
    background: var(--black-3-a);
}

.kb-keys {
    display: flex;
    flex: 1;
    min-width: 0;
    align-self: stretch;
    align-items: center;
    justify-content: flex-end;
    gap: var(--space-1);
    padding-right: var(--space-4);
    cursor: pointer;
    background: var(--black-1-a);
    transition: background 0.15s;
}

.kb-keys.hovered {
    background: var(--black-3-a);
}

.kb-plus {
    font-family: var(--font-primary);
    font-size: var(--main-font-size-2);
    font-weight: var(--font-weight-2);
    color: var(--text-main);
    line-height: 1;
}

</style>
