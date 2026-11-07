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
import StagePerfBar from "./StagePerfBar.vue";
import eFtue, { type FtueLabels } from "../../components/ftue/eFtue.vue";
import { useI18n } from "../../composables/useI18n";
import { hostState, overlays, primaryDisplay, stageSettings, viewport } from "../overlayClient";
import { mainScreen } from "../screens";
import { dim } from "../stageState";
import { DEMO_OVERLAY_ID } from "../stageTour";

const { t } = useI18n();

const ftueLabels = computed<FtueLabels>(() => ({
  skip: t("ftue.skip"),
  start: t("ftue.start"),
  back: t("ftue.back"),
  next: t("ftue.next"),
  done: t("ftue.done"),
  skipHold: [t("ftue.skipHold1"), t("ftue.skipHold2"), t("ftue.skipHold3")],
  sample: t("ftue.sample"),
}));

// The stage covers every display. The tour stays on the primary one.
const ftueBounds = computed(() => {
  const d = primaryDisplay.value;
  return d ? { x: d.x, y: d.y, width: d.w, height: d.h } : null;
});

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

// The toolbar and the notices sit on the primary display, never in a gap between displays.
const mainStyle = computed(() => {
  const a = mainScreen();
  return { left: `${a.x}px`, top: `${a.y}px`, width: `${a.w}px`, height: `${a.h}px` };
});
</script>

<template>
  <div class="stage">
    <div v-if="calibrating && dim > 0" class="stage-dim" :style="dimStyle"></div>
    <StageGrid v-if="calibrating" />
    <div class="stage-view" :style="viewStyle">
      <OverlayWrapper
        v-for="d in list"
        :key="d.overlayId"
        v-ftue="d.overlayId === DEMO_OVERLAY_ID ? 'stage-overlay' : undefined"
        :descriptor="d"
      />
    </div>
    <SnapGuides v-if="calibrating" />
    <OverlayInspector v-if="calibrating" />
    <StagePluginList v-if="calibrating" />
    <div class="stage-main" :style="mainStyle">
      <StageToolbar v-if="calibrating" />
      <StageNotices />
    </div>
    <StagePerfBar v-if="stageSettings.perfWidget" />
    <StageTooltip />
    <eFtue :labels="ftueLabels" :bounds="ftueBounds" layer-class="stage-ui" />
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

.stage-main {
  position: absolute;
  pointer-events: none;
}
</style>
