<script setup lang="ts">
import { computed, ref } from "vue";
import { motion } from "motion-v";
import { Dynamics } from "../../../composables/useMotion";
import { vTip } from "../../inspector/tooltip";

const props = defineProps<{ open: boolean; tip: string }>();
defineEmits<{ click: [] }>();

const hovered = ref(false);

const fill = computed(() => {
  if (props.open) return "var(--accent-200-a)";
  return hovered.value ? "rgba(255, 255, 255, 0.06)" : "rgba(255, 255, 255, 0)";
});
</script>

<template>
  <motion.button
    v-tip="tip"
    type="button"
    class="start-button"
    :initial="false"
    :animate="{ backgroundColor: fill }"
    :while-press="{ scale: 0.94 }"
    :transition="Dynamics.quick"
    @mouseenter="hovered = true"
    @mouseleave="hovered = false"
    @click="$emit('click')"
  >
    <span class="grid">
      <span class="dot accent" />
      <span class="dot" />
      <span class="dot" />
      <span class="dot" />
    </span>
  </motion.button>
</template>

<style scoped>
.start-button {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 0;
  border: none;
  cursor: pointer;
  corner-shape: bevel;
  border-radius: 6px 0 6px 0;
}

.grid {
  display: grid;
  grid-template-columns: 6px 6px;
  grid-template-rows: 6px 6px;
  gap: 2px;
}

.dot {
  background: var(--text-main);
}

.dot.accent {
  background: var(--accent-200);
}
</style>
