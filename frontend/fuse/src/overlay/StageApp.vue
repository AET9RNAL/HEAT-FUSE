<script setup lang="ts">
import { onMounted, onBeforeUnmount, watch } from "vue";
import StageCanvas from "./components/StageCanvas.vue";
import { connectOverlay, hostState, dragging, setWindowIgnore } from "./overlayClient";
import { clearSelection } from "./stageState";
import { clearHistory, redo, undo } from "./history";
import { hideTip } from "./inspector/tooltip";
import { visibleNotifications } from "./notifications";
import { initStageTour } from "./stageTour";
import { initHiddenOverlayNotice } from "./hiddenOverlays";
import { appsUiShown, taskbarFull, taskbarSettled } from "./apps/appsState";

initStageTour();
initHiddenOverlayNotice();

// A frame takes the mouse only on its `fuse-hit` parts. Its clear areas stay click-through.
const APPS_UI = ".fuse-window, .fuse-frame .fuse-hit, .fuse-taskbar, .fuse-console, .fuse-actions";

let lastIgnore = true;
let lastPointer: { x: number; y: number } | null = null;

function appsUiLive(): boolean {
  return hostState.value !== "calibrate" && appsUiShown.value;
}

function onMouseMove(e: MouseEvent): void {
  lastPointer = { x: e.clientX, y: e.clientY };
  updateIgnore(e.clientX, e.clientY);
}

function updateIgnore(x: number, y: number): void {
  if (dragging.value) return;
  // Calibrate (drag) and interactive (click) open the whole editor surface;
  // notifications stay hoverable and closable in every state, locked included.
  const editing = hostState.value === "calibrate" || hostState.value === "interactive";
  const apps = appsUiLive();
  if (!editing && !apps && visibleNotifications.value.length === 0) return;
  const el = document.elementFromPoint(x, y) as HTMLElement | null;
  const targets = [editing ? ".overlay-wrapper, .stage-ui" : "", ".stage-notice", apps ? APPS_UI : ""].filter(Boolean).join(", ");
  const ignore = !el?.closest(targets);
  if (ignore !== lastIgnore) {
    lastIgnore = ignore;
    setWindowIgnore(ignore);
  }
}

watch(
  () => [visibleNotifications.value.length, appsUiLive()] as const,
  ([count, apps]) => {
    const editing = hostState.value === "calibrate" || hostState.value === "interactive";
    if (count === 0 && !apps && !editing && !lastIgnore) {
      lastIgnore = true;
      setWindowIgnore(true);
    }
  },
);

// The taskbar can come up under a still cursor. A click there must reach the bar, not the game.
// After the render: the hit test reads the new pointer-events of the bar.
watch(
  [taskbarFull, taskbarSettled],
  () => {
    if (lastPointer) updateIgnore(lastPointer.x, lastPointer.y);
  },
  { flush: "post" },
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
