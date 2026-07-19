<script setup lang="ts">
import { computed, ref, watch } from "vue";
import ElementRenderer from "./ElementRenderer.vue";
import { hostState, sendTransform, dragging } from "../overlayClient";
import { activeGuides, grid, lockAspect, selectOverlay, selectedId } from "../stageState";
import { peerBoxes, snapEdge, snapMove, type Box } from "../composables/useSnapping";
import type { OverlayDescriptor, OverlayRect } from "../types";

const props = defineProps<{ descriptor: OverlayDescriptor }>();

const MIN_SIZE = 20;

/** Corner id -> which side of the local x/y axes it sits on. */
const CORNERS = {
  nw: { sx: -1, sy: -1 },
  ne: { sx: 1, sy: -1 },
  sw: { sx: -1, sy: 1 },
  se: { sx: 1, sy: 1 },
} as const;
type Corner = keyof typeof CORNERS;
const CORNER_IDS = ["nw", "ne", "sw", "se"] as const;

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
const selected = computed(() => calibrating.value && selectedId.value === props.descriptor.overlayId);
// Resize is a Vue-overlay capability; Rive overlays size their canvas separately.
const resizable = computed(() => calibrating.value && props.descriptor.kind === "vue");

const rot = computed(() => props.descriptor.rect?.rot ?? 0);
const opacity = computed(() => props.descriptor.rect?.opacity ?? 1);

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
  const spin = rot.value ? ` rotate(${rot.value}deg)` : "";
  const base = {
    position: "absolute" as const,
    width: `${w}px`,
    height: `${h}px`,
    display: props.descriptor.visible ? "block" : "none",
    opacity: String(opacity.value),
    transformOrigin: "center" as const,
    pointerEvents: clickable.value ? ("auto" as const) : ("none" as const),
    cursor: calibrating.value ? ("move" as const) : ("default" as const),
  };
  if (p) return { ...base, left: `${p.x}px`, top: `${p.y}px`, transform: spin.trim() };
  // Centered default when no rect is set yet.
  return { ...base, left: "50%", top: "50%", transform: `translate(-50%, -50%)${spin}` };
});

/** Current on-screen top-left, for building a rect when none is set yet. */
function currentTopLeft(): { x: number; y: number } {
  if (pos.value) return pos.value;
  const r = props.descriptor.rect;
  if (r) return { x: r.x, y: r.y };
  if (el.value) {
    const b = el.value.getBoundingClientRect();
    return { x: Math.round(b.left), y: Math.round(b.top) };
  }
  return { x: 0, y: 0 };
}

/** Commit the current geometry, carrying rot/opacity through unchanged. */
function commit(x: number, y: number, w: number, h: number): void {
  const rect: OverlayRect = { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
  if (rot.value) rect.rot = rot.value;
  if (opacity.value !== 1) rect.opacity = opacity.value;
  sendTransform(props.descriptor.overlayId, rect);
}

// --- drag (reposition) --------------------------------------------------
let isDragging = false;
let startPtr = { x: 0, y: 0 };
let startPos = { x: 0, y: 0 };
let peers: Box[] = [];

function onPointerDown(e: PointerEvent): void {
  if (!calibrating.value || !el.value) return;
  selectOverlay(props.descriptor.overlayId);
  isDragging = true;
  dragging.value = true; // suppress the stage hover click-through toggle
  if (!pos.value) pos.value = currentTopLeft();
  startPtr = { x: e.clientX, y: e.clientY };
  startPos = { ...pos.value };
  peers = peerBoxes(props.descriptor.overlayId);
  el.value.setPointerCapture(e.pointerId);
  e.preventDefault();
}

function onPointerMove(e: PointerEvent): void {
  if (!isDragging) return;
  const { w, h } = effSize.value;
  const raw = {
    x: startPos.x + (e.clientX - startPtr.x),
    y: startPos.y + (e.clientY - startPtr.y),
    w,
    h,
    rot: rot.value,
  };
  const snapped = snapMove(raw, peers, grid.mode, grid.size, e.altKey);
  pos.value = { x: snapped.x, y: snapped.y };
  activeGuides.value = snapped.guides;
}

function onPointerUp(): void {
  if (!isDragging) return;
  isDragging = false;
  dragging.value = false;
  activeGuides.value = [];
  if (!pos.value) return;
  const { w, h } = effSize.value;
  commit(pos.value.x, pos.value.y, w, h);
}

// --- resize -------------------------------------------------------------
let isResizing = false;
let activeCorner: Corner = "se";
let startPtrR = { x: 0, y: 0 };
let startSize = { w: 0, h: 0 };
let startOrigin = { x: 0, y: 0 };

function onResizeDown(e: PointerEvent, corner: Corner): void {
  if (!resizable.value) return;
  e.stopPropagation(); // don't start a drag
  selectOverlay(props.descriptor.overlayId);
  isResizing = true;
  activeCorner = corner;
  dragging.value = true;
  const s = effSize.value;
  sizeOverride.value = { w: s.w, h: s.h };
  startSize = { w: s.w, h: s.h };
  startOrigin = currentTopLeft();
  if (!pos.value) pos.value = { ...startOrigin };
  startPtrR = { x: e.clientX, y: e.clientY };
  peers = peerBoxes(props.descriptor.overlayId);
  (e.target as HTMLElement).setPointerCapture(e.pointerId);
  e.preventDefault();
}

function onResizeMove(e: PointerEvent): void {
  if (!isResizing) return;
  const { sx, sy } = CORNERS[activeCorner];
  const dx = e.clientX - startPtrR.x;
  const dy = e.clientY - startPtrR.y;

  // Work in the object's local frame so a rotated box resizes along its own
  // axes rather than the screen's.
  const rad = (-rot.value * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const localDx = rot.value ? dx * cos - dy * sin : dx;
  const localDy = rot.value ? dx * sin + dy * cos : dy;

  const keepAspect = lockAspect.value || e.shiftKey;
  let w = Math.max(MIN_SIZE, startSize.w + sx * localDx);
  let h = Math.max(MIN_SIZE, startSize.h + sy * localDy);
  if (keepAspect && startSize.w > 0) h = Math.max(MIN_SIZE, (w * startSize.h) / startSize.w);

  if (!rot.value) {
    const anchorX = sx > 0 ? startOrigin.x : startOrigin.x + startSize.w;
    const anchorY = sy > 0 ? startOrigin.y : startOrigin.y + startSize.h;
    const moving: Box = {
      left: Math.min(anchorX, anchorX + sx * w),
      top: Math.min(anchorY, anchorY + sy * h),
      right: Math.max(anchorX, anchorX + sx * w),
      bottom: Math.max(anchorY, anchorY + sy * h),
    };

    const bypass = e.altKey || keepAspect;
    const ex = snapEdge(anchorX + sx * w, "x", moving, peers, grid.mode, grid.size, bypass);
    const ey = snapEdge(anchorY + sy * h, "y", moving, peers, grid.mode, grid.size, bypass);
    w = Math.max(MIN_SIZE, Math.abs(ex.value - anchorX));
    h = Math.max(MIN_SIZE, Math.abs(ey.value - anchorY));

    const guides = [];
    if (ex.guide) guides.push(ex.guide);
    if (ey.guide) guides.push(ey.guide);
    activeGuides.value = guides;

    sizeOverride.value = { w, h };
    pos.value = { x: Math.min(anchorX, anchorX + sx * w), y: Math.min(anchorY, anchorY + sy * h) };
    return;
  }
  const fwd = (rot.value * Math.PI) / 180;
  const fc = Math.cos(fwd);
  const fs = Math.sin(fwd);
  const offX = (sx * (w - startSize.w)) / 2;
  const offY = (sy * (h - startSize.h)) / 2;
  const cx = startOrigin.x + startSize.w / 2 + (offX * fc - offY * fs);
  const cy = startOrigin.y + startSize.h / 2 + (offX * fs + offY * fc);

  sizeOverride.value = { w, h };
  pos.value = { x: cx - w / 2, y: cy - h / 2 };
}

function onResizeUp(): void {
  if (!isResizing) return;
  isResizing = false;
  dragging.value = false;
  activeGuides.value = [];
  const s = sizeOverride.value;
  const p = pos.value;
  if (!s || !p) return;
  commit(p.x, p.y, s.w, s.h);
}
</script>

<template>
  <div
    ref="el"
    class="overlay-wrapper"
    :class="{ calibrating, selected }"
    :style="style"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
  >
    <ElementRenderer :descriptor="descriptor" />
    <template v-if="selected">
      <div
        v-for="corner in CORNER_IDS"
        :key="corner"
        class="handle"
        :class="[corner, { inert: !resizable }]"
        @pointerdown="onResizeDown($event, corner)"
        @pointermove="onResizeMove"
        @pointerup="onResizeUp"
      />
    </template>
  </div>
</template>

<style scoped>
.overlay-wrapper.calibrating:hover {
  outline: 1px dashed rgba(255, 255, 255, 0.35);
  outline-offset: 2px;
}

.overlay-wrapper.selected,
.overlay-wrapper.calibrating.selected:hover {
  outline: 1px solid var(--accent-600);
  outline-offset: 0;
}

.handle {
  position: absolute;
  width: 7px;
  height: 7px;
  background: var(--base-1000);
  border: 1px solid var(--accent-600);
  touch-action: none;
  z-index: 2;
}

.handle.inert {
  pointer-events: none;
}

.handle.nw { left: -4px; top: -4px; cursor: nwse-resize; }
.handle.ne { right: -4px; top: -4px; cursor: nesw-resize; }
.handle.sw { left: -4px; bottom: -4px; cursor: nesw-resize; }
.handle.se { right: -4px; bottom: -4px; cursor: nwse-resize; }
</style>
