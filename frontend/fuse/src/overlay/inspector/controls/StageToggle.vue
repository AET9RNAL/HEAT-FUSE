<script setup lang="ts">
// had to drop Rive cuz every instance consumes WebGL context
import { motion } from "motion-v";
import Icons from "../../../components/Icons.vue";
import { Dynamics } from "../../../composables/useMotion";

withDefaults(defineProps<{ modelValue: boolean; label?: string; disabled?: boolean }>(), {
  label: "",
  disabled: false,
});

const emit = defineEmits<{ "update:modelValue": [value: boolean] }>();
</script>

<template>
  <button
    type="button"
    class="stage-toggle"
    :class="{ on: modelValue, disabled }"
    :disabled="disabled"
    @click="emit('update:modelValue', !modelValue)"
  >
    <motion.span
      class="box"
      :animate="{
        backgroundColor: modelValue ? 'var(--accent-200)' : 'rgba(0,0,0,0.6)',
        borderColor: modelValue ? 'var(--accent-200)' : 'var(--base-600)',
      }"
      :transition="Dynamics.quick"
    >
      <motion.span
        class="check"
        :initial="false"
        :animate="{ opacity: modelValue ? 1 : 0, scale: modelValue ? 1 : 0.5 }"
        :transition="Dynamics.snappy"
      >
        <Icons kind="checkmark" size="small" color="var(--base-1000)" />
      </motion.span>
    </motion.span>
    <span v-if="label" class="label">{{ label }}</span>
  </button>
</template>

<style scoped>
.stage-toggle {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: 0;
  border: none;
  background: none;
  cursor: pointer;
  user-select: none;
}

.box {
  position: relative;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  box-sizing: border-box;
  border: 1px solid var(--base-600);
  corner-shape: bevel;
  border-radius: 5px 0 5px 0;
}

.check {
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 0;
}

.stage-toggle:hover:not(.disabled) .box {
  border-color: var(--base-200);
}

.stage-toggle.on:hover:not(.disabled) .box {
  border-color: var(--accent-200);
}

.label {
  font-family: var(--font-primary);
  font-size: var(--main-font-size-4);
  font-weight: var(--font-weight-3);
  color: var(--text-muted);
  line-height: 1;
}

.stage-toggle:hover:not(.disabled) .label {
  color: var(--text-main);
}

.stage-toggle.disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
