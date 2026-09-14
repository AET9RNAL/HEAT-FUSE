<script setup lang="ts">
import { onMounted, onBeforeUnmount, watch } from "vue";
import StageCanvas from "./components/StageCanvas.vue";
import { connectOverlay, hostState, dragging, setWindowIgnore } from "./overlayClient";
import { clearSelection } from "./stageState";
import { clearHistory, redo, undo } from "./history";
import { hideTip } from "./inspector/tooltip";
import { visibleNotifications } from "./notifications";

let lastIgnore = true;

function onMouseMove(e: MouseEvent): void {
  if (dragging.value) return;
  // Calibrate (drag) and interactive (click) open the whole editor surface;
  // notifications stay hoverable and closable in every state, locked included.
  const editing = hostState.value === "calibrate" || hostState.value === "interactive";
  if (!editing && visibleNotifications.value.length === 0) return;
  const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
  const ignore = !el?.closest(editing ? ".overlay-wrapper, .stage-ui, .stage-notice" : ".stage-notice");
  if (ignore !== lastIgnore) {
    lastIgnore = ignore;
    setWindowIgnore(ignore);
  }
}

// The last card can vanish under a still cursor; without this the window would
// keep swallowing game clicks until the mouse next moved.
watch(
  () => visibleNotifications.value.length,
  (count) => {
    const editing = hostState.value === "calibrate" || hostState.value === "interactive";
    if (count === 0 && !editing && !lastIgnore) {
      lastIgnore = true;
      setWindowIgnore(true);
    }
  },
);

function onKeydown(e: KeyboardEvent): void {
  // Empty stage areas stay click-through and never receive a pointer event, so
  // Escape is the only reliable way to deselect by hand.
  if (e.key === "Escape") {
    clearSelection();
    return;
  }
  if (hostState.value !== "calibrate" || !e.ctrlKey) return;
  const key = e.key.toLowerCase();
  if (key === "z" && !e.shiftKey) {
    e.preventDefault();
    undo();
  } else if (key === "y" || (key === "z" && e.shiftKey)) {
    e.preventDefault();
    redo();
  }
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
  if (s !== "calibrate") {
    clearSelection();
    // The stack is per calibration session; overlays may be re-declared between.
    clearHistory();
    hideTip();
  }
  if (s !== "calibrate" && s !== "interactive") {
    lastIgnore = true;
    setWindowIgnore(true);
  }
});
</script>

<template>
  <StageCanvas />
</template>
