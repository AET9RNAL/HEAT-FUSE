<script setup lang="ts">
import { computed, ref, watch } from "vue";
import ElementRenderer from "./ElementRenderer.vue";
import { hostState, sendTransform, dragging } from "../overlayClient";
import type { OverlayDescriptor, OverlayRect } from "../types";

const props = defineProps<{ descriptor: OverlayDescriptor }>();

const MIN_SIZE = 20;

const el = ref<HTMLElement | null>(null);
// Local overrides used ONLY during an active drag/resize for smooth motion.
// Any runtime-pushed rect (overlay:transform, e.g. dual-view reposition) clears
// them so the authoritative descriptor.rect takes effect.
const pos = ref<{ x: number; y: number } | null>(null);
const sizeOverride = ref<{ w: number; h: number } | null>(null);

const calibrating = computed(() => hostState.value === "calibrate");
const interactive = computed(() => hostState.value === "interactive");
// Pointer input reaches the overlay in either state; only calibrate drags.
const clickable = computed(() => calibrating.value || interactive.value);
// Resize is a Vue-overlay capability; Rive overlays size their canvas separately.
const resizable = computed(() => calibrating.value && props.descriptor.kind === "vue");

// Effective size: a live resize override, else the persisted rect's size (Vue
// overlays only), else the declared default size.
const effSize = computed(() => {
  if (sizeOverride.value) return sizeOverride.value;
  const r = props.descriptor.rect;
  if (props.descriptor.kind === "vue" && r && r.w && r.h) return { w: r.w, h: r.h };
  return props.descriptor.size;
});

watch(
  () => props.descriptor.rect,
  () => {
    if (!isDragging) pos.value = null;
    if (!isResizing) sizeOverride.value = null;
  },
  { deep: true },
);

const style = computed(() => {
  const { w, h } = effSize.value;
  const p = pos.value ?? (props.descriptor.rect ? { x: props.descriptor.rect.x, y: props.descriptor.rect.y } : null);
  const base = {
    position: "absolute" as const,
    width: `${w}px`,
    height: `${h}px`,
    display: props.descriptor.visible ? "block" : "none",
    pointerEvents: clickable.value ? ("auto" as const) : ("none" as const),
    cursor: calibrating.value ? ("move" as const) : ("default" as const),
  };
  if (p) return { ...base, left: `${p.x}px`, top: `${p.y}px` };
  // Centered default when no rect is set yet.
  return { ...base, left: "50%", top: "50%", transform: "translate(-50%, -50%)" };
});

/** Current on-screen top-left, for building a rect when none is set yet. */
function currentTopLeft(): { x: number; y: number } {
  if (pos.value) return pos.value;
  if (el.value) {
    const r = el.value.getBoundingClientRect();
    return { x: Math.round(r.left), y: Math.round(r.top) };
  }
  return { x: 0, y: 0 };
}

// --- drag (reposition) --------------------------------------------------
let isDragging = false;
let startPtr = { x: 0, y: 0 };
let startPos = { x: 0, y: 0 };

function onPointerDown(e: PointerEvent): void {
  if (!calibrating.value || !el.value) return;
  isDragging = true;
  dragging.value = true; // suppress the stage hover click-through toggle
  if (!pos.value) pos.value = currentTopLeft();
  startPtr = { x: e.clientX, y: e.clientY };
  startPos = { ...pos.value };
  el.value.setPointerCapture(e.pointerId);
  e.preventDefault();
}

function onPointerMove(e: PointerEvent): void {
  if (!isDragging) return;
  pos.value = { x: startPos.x + (e.clientX - startPtr.x), y: startPos.y + (e.clientY - startPtr.y) };
}

function onPointerUp(): void {
  if (!isDragging) return;
  isDragging = false;
  dragging.value = false;
  if (!pos.value) return;
  const { w, h } = effSize.value;
  const rect: OverlayRect = { x: pos.value.x, y: pos.value.y, w, h };
  sendTransform(props.descriptor.overlayId, rect);
}

// --- resize -------------------------------------------------------------
let isResizing = false;
let startPtrR = { x: 0, y: 0 };
let startSize = { w: 0, h: 0 };

function onResizeDown(e: PointerEvent): void {
  if (!resizable.value) return;
  e.stopPropagation(); // don't start a drag
  isResizing = true;
  dragging.value = true;
  const s = effSize.value;
  sizeOverride.value = { w: s.w, h: s.h };
  startPtrR = { x: e.clientX, y: e.clientY };
  startSize = { w: s.w, h: s.h };
  (e.target as HTMLElement).setPointerCapture(e.pointerId);
  e.preventDefault();
}

function onResizeMove(e: PointerEvent): void {
  if (!isResizing) return;
  sizeOverride.value = {
    w: Math.max(MIN_SIZE, Math.round(startSize.w + (e.clientX - startPtrR.x))),
    h: Math.max(MIN_SIZE, Math.round(startSize.h + (e.clientY - startPtrR.y))),
  };
}

function onResizeUp(): void {
  if (!isResizing) return;
  isResizing = false;
  dragging.value = false;
  const s = sizeOverride.value;
  if (!s) return;
  const p = currentTopLeft();
  sendTransform(props.descriptor.overlayId, { x: p.x, y: p.y, w: s.w, h: s.h });
}
</script>

<template>
  <div
    ref="el"
    class="overlay-wrapper"
    :class="{ calibrating }"
    :style="style"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
  >
    <ElementRenderer :descriptor="descriptor" />
    <div
      v-if="resizable"
      class="resize-handle"
      @pointerdown="onResizeDown"
      @pointermove="onResizeMove"
      @pointerup="onResizeUp"
    />
  </div>
</template>

<style scoped>
.overlay-wrapper.calibrating {
  outline: 1px dashed rgba(120, 200, 255, 0.8);
  outline-offset: 2px;
}

.resize-handle {
  position: absolute;
  right: -5px;
  bottom: -5px;
  width: 12px;
  height: 12px;
  cursor: nwse-resize;
  background: rgba(120, 200, 255, 0.9);
  border: 1px solid rgba(255, 255, 255, 0.9);
  touch-action: none;
  z-index: 2;
}
</style>
