<script setup lang="ts">
import { computed } from "vue";
import OverlayWrapper from "./OverlayWrapper.vue";
import OverlayInspector from "./OverlayInspector.vue";
import SnapGuides from "./SnapGuides.vue";
import StageGrid from "./StageGrid.vue";
import { hostState, overlays, viewport } from "../overlayClient";

const list = computed(() => [...overlays.values()]);
const calibrating = computed(() => hostState.value === "calibrate");

// Shift the overlay layer so the broadcast display's region fills the frame.
// Only the overlays move: the stage itself stays the clip box, and the editor
// UI (grid/guides/inspector) belongs to the viewport, not the desktop.
const viewStyle = computed(() => {
  const v = viewport.value;
  if (!v || (v.x === 0 && v.y === 0)) return undefined;
  return { transform: `translate(${-v.x}px, ${-v.y}px)` };
});
</script>

<template>
  <div class="stage">
    <StageGrid v-if="calibrating" />
    <div class="stage-view" :style="viewStyle">
      <OverlayWrapper v-for="d in list" :key="d.overlayId" :descriptor="d" />
    </div>
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

/* Same box as .stage when untranslated, so overlay coordinates are unchanged
   in the Electron stage window. */
.stage-view {
  position: absolute;
  inset: 0;
}
</style>
