<script setup lang="ts">
import { computed } from "vue";
import OverlayWrapper from "./OverlayWrapper.vue";
import OverlayInspector from "./OverlayInspector.vue";
import SnapGuides from "./SnapGuides.vue";
import StageGrid from "./StageGrid.vue";
import { hostState, overlays } from "../overlayClient";

const list = computed(() => [...overlays.values()]);
const calibrating = computed(() => hostState.value === "calibrate");
</script>

<template>
  <div class="stage">
    <StageGrid v-if="calibrating" />
    <OverlayWrapper v-for="d in list" :key="d.overlayId" :descriptor="d" />
    <SnapGuides v-if="calibrating" />
    <OverlayInspector v-if="calibrating" />
  </div>
</template>

<style scoped>
.stage {
  position: fixed;
  inset: 0;
  overflow: hidden;
  background: transparent;
}
</style>
