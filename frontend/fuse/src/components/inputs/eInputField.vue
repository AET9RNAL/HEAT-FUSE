<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { AnimatePresence, motion } from 'motion-v'

export type FieldSize = 'full' | 'half' | 'flex'
export type FieldOrientation = 'default' | 'mirrored' | 'both'

/** One row of the optional suggestion list under the field. */
export interface FieldSuggestion {
    value: string
    label: string
    hint?: string
}

interface Props {
    label: string
    size?: FieldSize
    orientation?: FieldOrientation
    disabled?: boolean
    /** Reads as a normal filled field but refuses edits (sign-in stage 2's email). */
    locked?: boolean
    modelValue?: string
    type?: string
    autofocus?: boolean
    maxlength?: number
    /** Error stroke, e.g. a taken slug. */
    invalid?: boolean
    /** Shown under the focused field. Picking one emits `select`. */
    suggestions?: FieldSuggestion[]
}

const props = withDefaults(defineProps<Props>(), {
    label: '',
    size: 'full',
    orientation: 'default',
    disabled: false,
    locked: false,
    modelValue: '',
    type: 'text',
    autofocus: false,
    maxlength: undefined,
    invalid: false,
    suggestions: () => [],
})

const emit = defineEmits<{
    'update:modelValue': [value: string]
    'keydown': [event: KeyboardEvent]
    'select': [suggestion: FieldSuggestion]
}>()

defineSlots<{
    /** Custom content of one suggestion row. The default shows the label and the hint. */
    suggestion?: (props: { item: FieldSuggestion; active: boolean }) => unknown
}>()

const active = ref(-1)
const showSuggestions = computed(() => isFocused.value && props.suggestions.length > 0)
watch(() => props.suggestions, () => { active.value = -1 })

function pick(s: FieldSuggestion) {
    emit('select', s)
    active.value = -1
}

// Arrow keys move through the list and Enter picks. Every other key goes to the parent.
function handleKeydown(event: KeyboardEvent) {
    const n = props.suggestions.length
    if (showSuggestions.value && event.key === 'ArrowDown') {
        event.preventDefault()
        active.value = (active.value + 1) % n
        return
    }
    if (showSuggestions.value && event.key === 'ArrowUp') {
        event.preventDefault()
        active.value = (active.value - 1 + n) % n
        return
    }
    if (showSuggestions.value && event.key === 'Enter' && active.value >= 0) {
        event.preventDefault()
        pick(props.suggestions[active.value])
        return
    }
    emit('keydown', event)
}

const inputValue = ref(props.modelValue)
const isFocused = ref(false)

watch(() => props.modelValue, (v) => { inputValue.value = v })

const hasValue = computed(() => inputValue.value.length > 0)

function handleInput(event: Event) {
    const v = (event.target as HTMLInputElement).value
    inputValue.value = v
    emit('update:modelValue', v)
}

const cut = computed(() => props.orientation === 'both' ? 6 : 5)

// Which corners the bevel cuts, per orientation.
const borderRadius = computed(() => {
    const c = `${cut.value}px`
    if (props.orientation === 'mirrored') return `0 0 ${c} 0`
    if (props.orientation === 'both') return `${c} 0 ${c} 0`
    return `${c} 0 0 0`
})

const inputEl = ref<HTMLInputElement | null>(null)

onMounted(() => {
    if (props.autofocus) inputEl.value?.focus()
})
</script>

<template>
    <div
        class="input-wrap"
        :class="[`size-${props.size}`, `orientation-${props.orientation}`, { focused: isFocused, disabled: props.disabled, locked: props.locked, invalid: props.invalid }]"
        :style="{ borderRadius }"
    >
        <span v-if="!isFocused && !hasValue" class="label">{{ props.label }}</span>
        <input
            ref="inputEl"
            class="input"
            :type="props.type"
            :disabled="props.disabled"
            :readonly="props.locked"
            :tabindex="props.locked ? -1 : undefined"
            :maxlength="props.maxlength"
            :value="inputValue"
            @input="handleInput"
            @keydown="handleKeydown"
            @focus="isFocused = true"
            @blur="isFocused = false"
        />
        <AnimatePresence>
            <motion.div
                v-if="showSuggestions"
                key="suggestions"
                class="suggestions"
                :initial="{ opacity: 0, y: -4 }"
                :animate="{ opacity: 1, y: 0 }"
                :exit="{ opacity: 0, y: -4 }"
                :transition="{ duration: 0.12 }"
            >
                <!-- mousedown, not click: the input blur closes the list before a click lands -->
                <div
                    v-for="(item, i) in props.suggestions"
                    :key="item.value"
                    class="suggestion"
                    :class="{ active: i === active }"
                    @mousedown.prevent="pick(item)"
                    @mouseenter="active = i"
                >
                    <slot name="suggestion" :item="item" :active="i === active">
                        <span class="suggestion-label">{{ item.label }}</span>
                        <span v-if="item.hint" class="suggestion-hint">{{ item.hint }}</span>
                    </slot>
                </div>
            </motion.div>
        </AnimatePresence>
    </div>
</template>

<style scoped>
.input-wrap {
    position: relative;
    display: flex;
    align-items: center;
    height: 32px;
    min-height: 32px;
    padding: 0 var(--space-2);
    box-sizing: border-box;
    background: var(--black-1-a);
    border: 1px solid var(--base-600);
    corner-shape: bevel;
    cursor: text;
}

.size-full  { width: 280px; min-width: 280px; }
.size-half  { width: 140px; min-width: 140px; }
.size-flex  { flex: 1 0 0; min-width: 0; }

.orientation-both { padding: 0 var(--space-3); }
.orientation-both .label { left: var(--space-3); }

.input-wrap.disabled {
    opacity: 0.4;
    cursor: not-allowed;
}

.input-wrap.locked {
    cursor: default;
}

.input-wrap.locked .input {
    color: var(--text-muted);
    cursor: default;
}

.input-wrap.focused { border-color: var(--accent-200); }

.label {
    position: absolute;
    left: var(--space-2);
    font-family: var(--font-primary);
    font-weight: var(--font-weight-2);
    font-size: var(--main-font-size-4);
    color: var(--text-muted);
    pointer-events: none;
    user-select: none;
}

.input {
    width: 100%;
    background: transparent;
    border: none;
    outline: none;
    font-family: var(--font-primary);
    font-weight: var(--font-weight-2);
    font-size: var(--main-font-size-4);
    color: var(--text-main);
}

.input:disabled { cursor: not-allowed; }

.input-wrap.invalid {
    border-color: var(--error-highlight);
}

.suggestions {
    position: absolute;
    z-index: 20;
    top: calc(100% + 2px);
    left: -1px;
    right: -1px;
    display: flex;
    flex-direction: column;
    background: hsla(142, 10%, 6%, 0.98);
    border: 1px solid var(--base-600);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
}

.suggestion {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2);
    cursor: pointer;
}

.suggestion.active {
    background: rgba(255, 255, 255, 0.06);
}

.suggestion-label {
    flex: 1;
    min-width: 0;
    font-family: var(--font-primary);
    font-weight: var(--font-weight-2);
    font-size: var(--main-font-size-4);
    color: var(--text-main);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.suggestion-hint {
    flex-shrink: 0;
    font-family: var(--font-microcopy);
    font-size: 10px;
    text-transform: uppercase;
    color: var(--text-muted);
}

</style>
