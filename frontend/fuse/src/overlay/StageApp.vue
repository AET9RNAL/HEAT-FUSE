<script setup lang="ts">
import { onMounted, onBeforeUnmount, watch } from "vue";
import StageCanvas from "./components/StageCanvas.vue";
import { connectOverlay, hostState, dragging, setWindowIgnore } from "./overlayClient";

let lastIgnore = true;

function onMouseMove(e: MouseEvent): void {
  // Both calibrate (drag) and interactive (click) need the hover hit-test so
  // empty transparent areas keep passing clicks through to the game.
  const active = hostState.value === "calibrate" || hostState.value === "interactive";
  if (!active || dragging.value) return;
  const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
  const ignore = !el?.closest(".overlay-wrapper");
  if (ignore !== lastIgnore) {
    lastIgnore = ignore;
    setWindowIgnore(ignore);
  }
}

onMounted(() => {
  connectOverlay();
  window.addEventListener("mousemove", onMouseMove);
});

onBeforeUnmount(() => window.removeEventListener("mousemove", onMouseMove));

// Restore full click-through whenever we leave calibrate/interactive.
watch(hostState, (s) => {
  if (s !== "calibrate" && s !== "interactive") {
    lastIgnore = true;
    setWindowIgnore(true);
  }
});
</script>

<template>
  <StageCanvas />
</template>
