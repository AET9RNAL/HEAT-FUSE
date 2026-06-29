<script setup lang="ts">
import { ref, computed, watch } from 'vue'

export type FieldSize = 'full' | 'half'
export type FieldOrientation = 'default' | 'mirrored'

interface Props {
    label: string
    size?: FieldSize
    orientation?: FieldOrientation
    disabled?: boolean
    modelValue?: string
    type?: string
}

const props = withDefaults(defineProps<Props>(), {
    label: '',
    size: 'full',
    orientation: 'default',
    disabled: false,
    modelValue: '',
    type: 'text',
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
</script>

<template>
    <div
        class="input-wrap"
        :class="[`size-${props.size}`, `orientation-${props.orientation}`, { focused: isFocused, disabled: props.disabled }]"
    >
        <span v-if="!isFocused && !hasValue" class="label">{{ props.label }}</span>
        <input
            class="input"
            :type="props.type"
            :disabled="props.disabled"
            :value="inputValue"
            @input="handleInput"
            @keydown="$emit('keydown', $event)"
            @focus="isFocused = true"
            @blur="isFocused = false"
        />
        <svg class="field-stroke" viewBox="0 0 100 100" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
            <polygon
                v-if="props.orientation === 'default'"
                points="3,0 100,0 100,100 0,100 0,3"
                fill="none" stroke="#525252" stroke-width="0.4" vector-effect="non-scaling-stroke"
            />
            <polygon
                v-else
                points="0,0 100,0 100,97 97,100 0,100"
                fill="none" stroke="#525252" stroke-width="0.4" vector-effect="non-scaling-stroke"
            />
        </svg>
    </div>
</template>

<style scoped>
.input-wrap {
    position: relative;
    display: flex;
    align-items: center;
    height: 32px;
    padding: 0 var(--space-2);
    box-sizing: border-box;
    background: var(--black-1-a);
    cursor: text;
}

.input-wrap.orientation-default {
    clip-path: polygon(5px 0%, 100% 0%, 100% 100%, 0% 100%, 0% 5px);
}

.input-wrap.orientation-mirrored {
    clip-path: polygon(0% 0%, 100% 0%, 100% calc(100% - 5px), calc(100% - 5px) 100%, 0% 100%);
}

.size-full  { width: 280px; min-width: 280px; }
.size-half  { width: 140px; min-width: 140px; }

.input-wrap.disabled {
    opacity: 0.4;
    cursor: not-allowed;
}

.input-wrap.focused .field-stroke polygon { stroke: var(--accent-200); }

.label {
    position: absolute;
    left: var(--space-2);
    font-family: var(--font-primary);
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
    font-size: var(--main-font-size-4);
    color: var(--text-main);
}

.input:disabled { cursor: not-allowed; }

.field-stroke {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
}
</style>
