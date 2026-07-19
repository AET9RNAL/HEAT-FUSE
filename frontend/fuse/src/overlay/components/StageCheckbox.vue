<script setup lang="ts">
import eCheckbox from "../../components/eCheckbox.vue";

withDefaults(defineProps<{ modelValue: boolean; label?: string; disabled?: boolean }>(), {
  label: "",
  disabled: false,
});

const emit = defineEmits<{ "update:modelValue": [value: boolean] }>();
</script>

<template>
  <div class="stage-checkbox" :class="{ disabled }">
    <eCheckbox
      :model-value="modelValue"
      :is-disabled="disabled"
      :width="20"
      :height="20"
      @update:model-value="emit('update:modelValue', $event)"
    />
    <span
      class="label"
      @click="!disabled && emit('update:modelValue', !modelValue)"
    ><slot>{{ label }}</slot></span>
  </div>
</template>

<style scoped>
.stage-checkbox {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  user-select: none;
}

.stage-checkbox.disabled {
  opacity: 0.4;
}

.label {
  font-family: var(--font-primary);
  font-size: var(--main-font-size-4);
  font-weight: var(--font-weight-3);
  color: var(--text-muted);
  line-height: 1;
  cursor: pointer;
}

.stage-checkbox.disabled .label {
  cursor: not-allowed;
}

.stage-checkbox:hover:not(.disabled) .label {
  color: var(--text-main);
}
</style>
