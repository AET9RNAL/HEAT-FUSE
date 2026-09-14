<script setup lang="ts">
import { computed } from "vue";
import OverlayWrapper from "./OverlayWrapper.vue";
import OverlayInspector from "./OverlayInspector.vue";
import StageToolbar from "./StageToolbar.vue";
import StagePluginList from "./StagePluginList.vue";
import SnapGuides from "./SnapGuides.vue";
import StageGrid from "./StageGrid.vue";
import StageTooltip from "../inspector/StageTooltip.vue";
import StageNotices from "./StageNotices.vue";
import { hostState, overlays, viewport } from "../overlayClient";
import { dim } from "../stageState";

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

// Sits under the overlays and stays click-through, so the stage's hover
// hit-test (which looks for .overlay-wrapper / .stage-ui) is unaffected.
const dimStyle = computed(() => ({ background: `rgba(0, 0, 0, ${dim.value})` }));
</script>

<template>
  <div class="stage">
    <div v-if="calibrating && dim > 0" class="stage-dim" :style="dimStyle"></div>
    <StageGrid v-if="calibrating" />
    <div class="stage-view" :style="viewStyle">
      <OverlayWrapper v-for="d in list" :key="d.overlayId" :descriptor="d" />
    </div>
    <SnapGuides v-if="calibrating" />
    <OverlayInspector v-if="calibrating" />
    <StagePluginList v-if="calibrating" />
    <StageToolbar v-if="calibrating" />
    <StageNotices />
    <StageTooltip />
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

.stage-dim {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
</style>
