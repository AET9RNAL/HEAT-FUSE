<script setup lang="ts">
import { motion } from "motion-v";
import { Dynamics } from "../../../composables/useMotion";
import type { Option } from "../types";

withDefaults(
  defineProps<{
    modelValue: unknown;
    options: (Option & { description?: string })[];
    disabled?: boolean;
  }>(),
  { disabled: false },
);

const emit = defineEmits<{ "update:modelValue": [value: unknown] }>();
</script>

<template>
  <div class="stage-radio" :class="{ disabled }">
    <button
      v-for="o in options"
      :key="String(o.value)"
      type="button"
      class="radio-row"
      :class="{ active: o.value === modelValue }"
      :disabled="disabled"
      @click="emit('update:modelValue', o.value)"
    >
      <motion.span
        class="mark"
        :initial="false"
        :animate="{ borderColor: o.value === modelValue ? 'var(--accent-200)' : 'var(--base-600)' }"
        :transition="Dynamics.quick"
      >
        <motion.span
          class="pip"
          :initial="false"
          :animate="{ scale: o.value === modelValue ? 1 : 0, opacity: o.value === modelValue ? 1 : 0 }"
          :transition="Dynamics.snappy"
        />
      </motion.span>
      <span class="body">
        <span class="label">{{ o.label }}</span>
        <span v-if="o.description" class="desc">{{ o.description }}</span>
      </span>
    </button>
  </div>
</template>

<style scoped>
.stage-radio {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.radio-row {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  padding: var(--space-1) 0;
  border: none;
  background: none;
  text-align: left;
  cursor: pointer;
}

.mark {
  position: relative;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 12px;
  height: 12px;
  margin-top: 2px;
  box-sizing: border-box;
  border: 1px solid var(--base-600);
  corner-shape: bevel;
  border-radius: 4px 0 4px 0;
}

.pip {
  width: 6px;
  height: 6px;
  background: var(--accent-200);
  corner-shape: bevel;
  border-radius: 2px 0 2px 0;
}

.body {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.label {
  font-family: var(--font-primary);
  font-size: var(--main-font-size-4);
  color: var(--text-muted);
  line-height: 1.2;
}

.radio-row.active .label,
.radio-row:hover:not(:disabled) .label {
  color: var(--text-main);
}

.desc {
  font-family: var(--font-microcopy);
  font-size: var(--main-font-size-5);
  color: var(--base-600);
  line-height: 1.3;
}

.stage-radio.disabled {
  opacity: 0.4;
  pointer-events: none;
}
</style>
