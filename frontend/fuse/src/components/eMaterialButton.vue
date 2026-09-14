<script setup lang="ts">
import { computed } from 'vue'
import Icons, { type IconKind, type IconSize } from './Icons.vue'

interface Props {
    label?: string
    variant?: 'primary' | 'secondary' | 'tertiary'
    fill?: string
    color?: string
    icon?: IconKind
    iconSize?: IconSize
    iconColor?: string
    disabled?: boolean
}

const props = withDefaults(defineProps<Props>(), {
    label: '',
    variant: 'primary',
    fill: '',
    color: '',
    iconSize: 'small',
    iconColor: '',
    disabled: false,
})

const buttonStyle = computed(() => {
    const vars: Record<string, string> = {}
    if (props.fill) vars['--btn-fill'] = props.fill
    if (props.color) vars['--btn-color'] = props.color
    return vars
})

</script>

<template>
    <button
        class="material-button"
        :class="variant"
        :style="buttonStyle"
        :disabled="disabled"
    >
        <span v-if="label" class="label" v-truncate-title>{{ label }}</span>
        <Icons v-if="icon" :kind="icon" :size="iconSize" :color="iconColor" />
    </button>
</template>

<style scoped>
.material-button {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-1);
    padding: var(--space-1) var(--space-2);
    border: none;
    background: var(--btn-fill, var(--black-1-a));
    color: var(--btn-color, var(--text-main));
    cursor: pointer;
    box-sizing: border-box;
    border: 1px solid var(--base-600);
    corner-shape: bevel;
    border-radius: 6px 0 6px 0;
    transition: filter 0.15s ease;
    font-family: var(--font-primary);
    font-size: var(--main-font-size-4);
    font-weight: var(--font-weight-2);
    user-select: none;
    -webkit-user-select: none;
}

.material-button:hover {
    filter: brightness(1.25);
}

.material-button:active {
    filter: brightness(0.85);
}

.material-button.tertiary {
    background: transparent;
}

.material-button.tertiary:hover {
    background: rgba(255, 255, 255, 0.06);
    filter: none;
}

.material-button.tertiary:active {
    background: rgba(255, 255, 255, 0.03);
    filter: none;
}

.label {
    position: relative;
    z-index: 1;
    white-space: nowrap;
    color: inherit;
    line-height: 1;
}


.material-button:focus-visible {
    outline: 2px solid var(--accent-200);
    outline-offset: 2px;
}

.material-button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
    filter: none;
}
</style>
