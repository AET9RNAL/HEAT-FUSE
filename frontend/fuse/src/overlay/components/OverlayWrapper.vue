<script setup lang="ts">
import { computed, ref, watch } from "vue";
import ElementRenderer from "./ElementRenderer.vue";
import { hostState, sendTransform, dragging } from "../overlayClient";
import type { OverlayDescriptor, OverlayRect } from "../types";

const props = defineProps<{ descriptor: OverlayDescriptor }>();

const el = ref<HTMLElement | null>(null);
// Local position override, used ONLY during an active drag for smooth motion.
// Any runtime-pushed rect (overlay:transform, e.g. dual-view reposition) clears
// it so the authoritative descriptor.rect takes effect.
const pos = ref<{ x: number; y: number } | null>(null);

const calibrating = computed(() => hostState.value === "calibrate");
const interactive = computed(() => hostState.value === "interactive");
// Pointer input reaches the overlay in either state; only calibrate drags.
const clickable = computed(() => calibrating.value || interactive.value);

watch(
  () => props.descriptor.rect,
  () => { if (!isDragging) pos.value = null; },
  { deep: true },
);

const style = computed(() => {
  const { w, h } = props.descriptor.size;
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

let isDragging = false;
let startPtr = { x: 0, y: 0 };
let startPos = { x: 0, y: 0 };

function onPointerDown(e: PointerEvent): void {
  if (!calibrating.value || !el.value) return;
  isDragging = true;
  dragging.value = true; // suppress the stage hover click-through toggle
  // Seed from current on-screen position (handles the centered-default case).
  if (!pos.value) {
    const r = el.value.getBoundingClientRect();
    pos.value = { x: Math.round(r.left), y: Math.round(r.top) };
  }
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
  const { w, h } = props.descriptor.size;
  const rect: OverlayRect = { x: pos.value.x, y: pos.value.y, w, h };
  sendTransform(props.descriptor.overlayId, rect);
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
  </div>
</template>

<style scoped>
.overlay-wrapper.calibrating {
  outline: 1px dashed rgba(120, 200, 255, 0.8);
  outline-offset: 2px;
}
</style>
