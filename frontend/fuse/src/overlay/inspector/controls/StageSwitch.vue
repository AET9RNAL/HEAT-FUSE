<script setup lang="ts">
import { motion } from "motion-v";
import { Dynamics } from "../../../composables/useMotion";

withDefaults(defineProps<{ modelValue: boolean; disabled?: boolean }>(), { disabled: false });

const emit = defineEmits<{ "update:modelValue": [value: boolean] }>();
</script>

<template>
  <motion.button
    type="button"
    class="stage-switch"
    :class="{ on: modelValue, disabled }"
    :disabled="disabled"
    :animate="{
      backgroundColor: modelValue ? 'var(--accent-200)' : 'rgba(0,0,0,0.6)',
      borderColor: modelValue ? 'var(--accent-200)' : 'var(--base-600)',
    }"
    :transition="Dynamics.quick"
    :while-press="disabled ? {} : { scale: 0.96 }"
    @click="emit('update:modelValue', !modelValue)"
  >
    <motion.span
      class="knob"
      :initial="false"
      :animate="{
        x: modelValue ? 18 : 0,
        backgroundColor: modelValue ? 'var(--base-1000)' : 'var(--base-200)',
      }"
      :transition="Dynamics.snappy"
    />
  </motion.button>
</template>

<style scoped>
.stage-switch {
  position: relative;
  flex: none;
  width: 36px;
  height: 18px;
  padding: 0;
  box-sizing: border-box;
  border: 1px solid var(--base-600);
  cursor: pointer;
  corner-shape: bevel;
  border-radius: 6px 0 6px 0;
}

.knob {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 12px;
  height: 12px;
  corner-shape: bevel;
  border-radius: 4px 0 4px 0;
}

.stage-switch.disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
