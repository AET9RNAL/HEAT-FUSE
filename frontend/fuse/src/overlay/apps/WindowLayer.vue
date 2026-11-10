<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from "vue";
import { AnimatePresence, motion } from "motion-v";
import StageWindow from "./StageWindow.vue";
import { hostState, isObsMode, setWindowFocusable } from "../overlayClient";
import { overlayShift } from "../screens";
import { snapPreview, stageKeyboard, windowOrder, windows } from "./appsState";
import { Dynamics } from "../../composables/useMotion";

// Creation order keeps each window's DOM node in place: a z-order change moves no node,
// so an iframe or a canvas in a view does not reload. The stacking comes from z-index.
const list = computed(() => [...windows.values()]);
const zOf = (id: string): number => Math.max(0, windowOrder.value.indexOf(id));
const cascadeOf = (id: string): number => Math.max(0, list.value.findIndex((w) => w.windowId === id));

const previewStyle = computed(() => {
  const p = snapPreview.value;
  if (!p) return undefined;
  const off = overlayShift();
  return { left: `${p.rect.x - off.x}px`, top: `${p.rect.y - off.y}px`, width: `${p.rect.w}px`, height: `${p.rect.h}px` };
});

function onFocus(): void {
  stageKeyboard.value = true;
}

// The game took the keyboard back. In locked state the stage goes back to non-focusable.
function onBlur(): void {
  stageKeyboard.value = false;
  if (hostState.value === "locked") setWindowFocusable(false);
}

onMounted(() => {
  // An OBS view has no keyboard to track.
  if (isObsMode()) return;
  window.addEventListener("focus", onFocus);
  window.addEventListener("blur", onBlur);
});

onBeforeUnmount(() => {
  window.removeEventListener("focus", onFocus);
  window.removeEventListener("blur", onBlur);
});
</script>

<template>
  <div class="window-layer">
    <AnimatePresence>
      <motion.div
        v-if="previewStyle"
        key="snap-preview"
        class="snap-preview"
        :style="previewStyle"
        :initial="{ opacity: 0 }"
        :animate="{ opacity: 1 }"
        :exit="{ opacity: 0 }"
        :transition="Dynamics.quick"
      />
    </AnimatePresence>
    <AnimatePresence>
      <StageWindow
        v-for="w in list"
        :key="w.windowId"
        :descriptor="w"
        :z="zOf(w.windowId)"
        :cascade="cascadeOf(w.windowId)"
      />
    </AnimatePresence>
  </div>
</template>

<style scoped>
.window-layer {
  position: absolute;
  inset: 0;
  isolation: isolate;
  pointer-events: none;
}

.snap-preview {
  position: absolute;
  z-index: 1000;
  box-sizing: border-box;
  background: var(--accent-200-a);
  border: 1px dashed var(--accent-200);
  pointer-events: none;
  corner-shape: bevel;
  border-radius: 18px 0 18px 0;
}
</style>
