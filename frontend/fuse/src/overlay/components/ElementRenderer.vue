<script setup lang="ts">
import RiveOverlay from "./RiveOverlay.vue";
import VueOverlay from "./VueOverlay.vue";
import type { OverlayDescriptor } from "../types";

defineProps<{ descriptor: OverlayDescriptor }>();
</script>

<template>
  <RiveOverlay v-if="descriptor.kind === 'rive'" :descriptor="descriptor" />
  <VueOverlay v-else-if="descriptor.kind === 'vue'" :descriptor="descriptor" />
  <div v-else class="unsupported">unsupported overlay kind: {{ descriptor.kind }}</div>
</template>

<style scoped>
.unsupported {
  color: #ff6b6b;
  font: 12px monospace;
}
</style>
