<script setup lang="ts" generic="T extends string">
import { motion } from "motion-v";
import { Dynamics } from "../../composables/useMotion";

defineProps<{
  options: { value: T; label: string }[];
  modelValue: T;
}>();

const emit = defineEmits<{ "update:modelValue": [value: T] }>();
</script>

<template>
  <div class="stage-segmented">
    <motion.button
      v-for="o in options"
      :key="o.value"
      type="button"
      class="seg-btn"
      :class="{ active: o.value === modelValue }"
      :initial="false"
      :animate="{
        backgroundColor: o.value === modelValue ? 'var(--accent-200)' : 'rgba(255,255,255,0)',
        color: o.value === modelValue ? 'var(--base-1000)' : 'var(--text-muted)',
      }"
      :transition="Dynamics.quick"
      :while-press="{ scale: 0.96 }"
      @click="emit('update:modelValue', o.value)"
    >{{ o.label }}</motion.button>
  </div>
</template>

<style scoped>
.stage-segmented {
  position: relative;
  display: flex;
  gap: var(--space-0);
  padding: var(--space-0);
  box-sizing: border-box;
  background: var(--black-1-a);
  border: 1px solid var(--base-600);
  corner-shape: bevel;
  border-radius: 8px 0 8px 0;
}

.seg-btn {
  flex: 1;
  height: 22px;
  border: none;
  padding: 0 var(--space-2);
  font-family: var(--font-primary);
  font-weight: var(--font-weight-2);
  font-size: var(--main-font-size-4);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  cursor: pointer;
  corner-shape: bevel;
  border-radius: 6px 0 6px 0;
}

.seg-btn:hover:not(.active) {
  color: var(--text-main);
}
</style>
