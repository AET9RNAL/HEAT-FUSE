<script setup lang="ts">
import { computed } from "vue";
import { grid } from "../stageState";

const style = computed(() => {
  const s = `${grid.size}px`;
  const major = `${grid.size * 8}px`;
  return {
    backgroundSize: `${s} ${s}, ${s} ${s}, ${major} ${major}, ${major} ${major}`,
  };
});
</script>

<template>
  <div v-if="grid.visible" class="stage-grid" :style="style" />
</template>

<style scoped>
.stage-grid {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 0;
  background-image:
    linear-gradient(to right, rgba(255, 255, 255, 0.06) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(255, 255, 255, 0.06) 1px, transparent 1px),
    linear-gradient(to right, rgba(255, 255, 255, 0.12) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(255, 255, 255, 0.12) 1px, transparent 1px);
}
</style>
