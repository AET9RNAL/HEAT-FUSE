<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'

export type FieldSize = 'full' | 'half' | 'flex'
export type FieldOrientation = 'default' | 'mirrored' | 'both'

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
})

const emit = defineEmits<{
    'update:modelValue': [value: string]
    'keydown': [event: KeyboardEvent]
}>()

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
        :class="[`size-${props.size}`, `orientation-${props.orientation}`, { focused: isFocused, disabled: props.disabled, locked: props.locked }]"
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
            :value="inputValue"
            @input="handleInput"
            @keydown="$emit('keydown', $event)"
            @focus="isFocused = true"
            @blur="isFocused = false"
        />
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

</style>
