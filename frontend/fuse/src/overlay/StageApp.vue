<script setup lang="ts">
import { onMounted, onBeforeUnmount, watch } from "vue";
import StageCanvas from "./components/StageCanvas.vue";
import { connectOverlay, hostState, dragging, setWindowIgnore } from "./overlayClient";
import { clearSelection } from "./stageState";

let lastIgnore = true;

function onMouseMove(e: MouseEvent): void {
  // Both calibrate (drag) and interactive (click) need the hover hit-test so
  // empty transparent areas keep passing clicks through to the game.
  const active = hostState.value === "calibrate" || hostState.value === "interactive";
  if (!active || dragging.value) return;
  const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
  const ignore = !el?.closest(".overlay-wrapper, .stage-ui");
  if (ignore !== lastIgnore) {
    lastIgnore = ignore;
    setWindowIgnore(ignore);
  }
}

function onKeydown(e: KeyboardEvent): void {
  // Empty stage areas stay click-through and never receive a pointer event, so
  // Escape is the only reliable way to deselect by hand.
  if (e.key === "Escape") clearSelection();
}

onMounted(() => {
  connectOverlay();
  window.addEventListener("mousemove", onMouseMove);
  window.addEventListener("keydown", onKeydown);
});

onBeforeUnmount(() => {
  window.removeEventListener("mousemove", onMouseMove);
  window.removeEventListener("keydown", onKeydown);
});

// Restore full click-through whenever we leave calibrate/interactive.
watch(hostState, (s) => {
  if (s !== "calibrate") clearSelection();
  if (s !== "calibrate" && s !== "interactive") {
    lastIgnore = true;
    setWindowIgnore(true);
  }
});
</script>

<template>
  <StageCanvas />
</template>
