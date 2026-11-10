<script setup lang="ts">
import type { ResizeDir } from "../windowGeometry";

const emit = defineEmits<{ start: [dir: ResizeDir, e: PointerEvent] }>();

const DIRS: ResizeDir[] = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];

function onDown(dir: ResizeDir, e: PointerEvent): void {
  if (e.button !== 0) return;
  e.stopPropagation();
  emit("start", dir, e);
}
</script>

<template>
  <div v-for="dir in DIRS" :key="dir" class="edge" :class="dir" @pointerdown="onDown(dir, $event)" />
</template>

<style scoped>
.edge {
  position: absolute;
  z-index: 3;
  touch-action: none;
}

.n,
.s {
  left: 6px;
  right: 6px;
  height: 6px;
  cursor: ns-resize;
}

.n {
  top: -3px;
}

.s {
  bottom: -3px;
}

.e,
.w {
  top: 6px;
  bottom: 6px;
  width: 6px;
  cursor: ew-resize;
}

.e {
  right: -3px;
}

.w {
  left: -3px;
}

.ne,
.nw,
.se,
.sw {
  width: 10px;
  height: 10px;
}

.nw {
  left: -3px;
  top: -3px;
  cursor: nwse-resize;
}

.se {
  right: -3px;
  bottom: -3px;
  cursor: nwse-resize;
}

.ne {
  right: -3px;
  top: -3px;
  cursor: nesw-resize;
}

.sw {
  left: -3px;
  bottom: -3px;
  cursor: nesw-resize;
}
</style>
