<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import StagePanel from "./StagePanel.vue";
import StageIconButton from "./StageIconButton.vue";
import StageCheckbox from "./StageCheckbox.vue";
import StageSegmented from "./StageSegmented.vue";
import StageNumberField from "./StageNumberField.vue";
import { overlays, sendTransform } from "../overlayClient";
import { clearSelection, grid, inspectorPos, lockAspect, selectedId, type SnapMode } from "../stageState";
import type { OverlayRect } from "../types";

const PANEL_W = 264;
const MARGIN = 24;

const root = ref<HTMLElement | null>(null);

const descriptor = computed(() => (selectedId.value ? overlays.get(selectedId.value) : undefined));
const isRive = computed(() => descriptor.value?.kind === "rive");

/** The selected overlay's rect, materialising the centered default if unset. */
const rect = computed<OverlayRect>(() => {
  const d = descriptor.value;
  if (!d) return { x: 0, y: 0, w: 0, h: 0 };
  if (d.rect) return d.rect;
  const { w, h } = d.size;
  return { x: Math.round((window.innerWidth - w) / 2), y: Math.round((window.innerHeight - h) / 2), w, h };
});

const rot = computed(() => rect.value.rot ?? 0);
const opacityPct = computed(() => Math.round((rect.value.opacity ?? 1) * 100));

function apply(patch: Partial<OverlayRect>): void {
  const d = descriptor.value;
  if (!d) return;
  const next: OverlayRect = { ...rect.value, ...patch };
  sendTransform(d.overlayId, next);
}

function setWidth(w: number): void {
  if (lockAspect.value && rect.value.w > 0) {
    apply({ w, h: Math.round((w * rect.value.h) / rect.value.w) });
    return;
  }
  apply({ w });
}

function setHeight(h: number): void {
  if (lockAspect.value && rect.value.h > 0) {
    apply({ h, w: Math.round((h * rect.value.w) / rect.value.h) });
    return;
  }
  apply({ h });
}

function setRot(deg: number): void {
  apply({ rot: ((deg % 360) + 360) % 360 });
}

function rotate90(): void {
  setRot(rot.value + 90);
}

// The persisted model has no scale, so a flip is expressed as the equivalent
// rotation of the box. This mirrors the frame, not the overlay's own content
// (a Rive artboard or Vue tree is not itself mirrored).
function flipH(): void {
  setRot(180 - rot.value);
}

function flipV(): void {
  setRot(360 - rot.value);
}

type Align = "left" | "center-h" | "right" | "top" | "center-v" | "bottom";

function align(mode: Align): void {
  const r = rect.value;
  switch (mode) {
    case "left": return apply({ x: 0 });
    case "center-h": return apply({ x: Math.round((window.innerWidth - r.w) / 2) });
    case "right": return apply({ x: Math.round(window.innerWidth - r.w) });
    case "top": return apply({ y: 0 });
    case "center-v": return apply({ y: Math.round((window.innerHeight - r.h) / 2) });
    case "bottom": return apply({ y: Math.round(window.innerHeight - r.h) });
  }
}

// --- floating placement + header drag ------------------------------------
function clampToViewport(x: number, y: number): { x: number; y: number } {
  const h = root.value?.offsetHeight ?? 0;
  return {
    x: Math.min(Math.max(0, x), Math.max(0, window.innerWidth - PANEL_W)),
    y: Math.min(Math.max(0, y), Math.max(0, window.innerHeight - h)),
  };
}

const panelStyle = computed(() => {
  const p = inspectorPos.value;
  if (p) return { left: `${p.x}px`, top: `${p.y}px` };
  return { left: `${Math.max(0, window.innerWidth - PANEL_W - MARGIN)}px`, top: `${MARGIN}px` };
});

let isDragging = false;
let startPtr = { x: 0, y: 0 };
let startPos = { x: 0, y: 0 };

function onHeaderDown(e: PointerEvent): void {
  if ((e.target as HTMLElement).closest("button")) return;
  const box = root.value?.getBoundingClientRect();
  if (!box) return;
  isDragging = true;
  startPtr = { x: e.clientX, y: e.clientY };
  startPos = { x: box.left, y: box.top };
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  e.preventDefault();
}

function onHeaderMove(e: PointerEvent): void {
  if (!isDragging) return;
  inspectorPos.value = clampToViewport(
    startPos.x + (e.clientX - startPtr.x),
    startPos.y + (e.clientY - startPtr.y),
  );
}

function onHeaderUp(): void {
  isDragging = false;
}

// A saved position can land off-screen if the stage resolution changed since.
function onResize(): void {
  const p = inspectorPos.value;
  if (p) inspectorPos.value = clampToViewport(p.x, p.y);
}

onMounted(() => window.addEventListener("resize", onResize));
onBeforeUnmount(() => window.removeEventListener("resize", onResize));

const SNAP_MODES: { value: SnapMode; label: string }[] = [
  { value: "smart", label: "Smart" },
  { value: "grid", label: "Grid" },
  { value: "off", label: "Off" },
];
</script>

<template>
  <aside v-if="descriptor" ref="root" class="inspector stage-ui" :style="panelStyle">
    <StagePanel class="inspector-panel" :cut="8" blur>
      <header
        class="ins-header"
        @pointerdown="onHeaderDown"
        @pointermove="onHeaderMove"
        @pointerup="onHeaderUp"
      >
        <div class="ins-title-group">
          <span class="ins-title">{{ descriptor.kind === "rive" ? "Rive" : "Frame" }}</span>
          <span class="ins-sub">{{ descriptor.overlayId }}</span>
        </div>
        <StageIconButton variant="ghost" title="Deselect (Esc)" @click="clearSelection">
          <svg viewBox="0 0 16 16"><path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" stroke-width="1.4" /></svg>
        </StageIconButton>
      </header>

      <div class="ins-body">
        <section class="ins-section">
          <div class="ins-section-label">Position</div>
          <div class="btn-row">
            <StageIconButton title="Align left" @click="align('left')"><svg viewBox="0 0 16 16"><path d="M2 2v12M5 5h8v2H5zM5 9h5v2H5z" /></svg></StageIconButton>
            <StageIconButton title="Align horizontal center" @click="align('center-h')"><svg viewBox="0 0 16 16"><path d="M8 2v12M4 5h8v2H4zM5.5 9h5v2h-5z" /></svg></StageIconButton>
            <StageIconButton title="Align right" @click="align('right')"><svg viewBox="0 0 16 16"><path d="M14 2v12M3 5h8v2H3zM6 9h5v2H6z" /></svg></StageIconButton>
            <StageIconButton title="Align top" @click="align('top')"><svg viewBox="0 0 16 16"><path d="M2 2h12M5 5h2v8H5zM9 5h2v5H9z" /></svg></StageIconButton>
            <StageIconButton title="Align vertical center" @click="align('center-v')"><svg viewBox="0 0 16 16"><path d="M2 8h12M5 4h2v8H5zM9 5.5h2v5H9z" /></svg></StageIconButton>
            <StageIconButton title="Align bottom" @click="align('bottom')"><svg viewBox="0 0 16 16"><path d="M2 14h12M5 3h2v8H5zM9 6h2v5H9z" /></svg></StageIconButton>
          </div>
          <div class="ins-row">
            <StageNumberField label="X" :model-value="rect.x" @update:model-value="apply({ x: $event })" />
            <StageNumberField label="Y" :model-value="rect.y" @update:model-value="apply({ y: $event })" />
          </div>
          <div class="ins-row">
            <StageNumberField
              label="&#8735;" title="Rotation" suffix="&#176;"
              :model-value="rot" :min="-360" :max="360"
              @update:model-value="setRot"
            />
            <div class="btn-row">
              <StageIconButton title="Rotate 90&#176; clockwise" @click="rotate90"><svg viewBox="0 0 16 16"><path d="M8 3a5 5 0 1 0 5 5" fill="none" stroke="currentColor" stroke-width="1.6" /><path d="M8 0.5 11 3 8 5.5z" /></svg></StageIconButton>
              <StageIconButton title="Flip horizontal" @click="flipH"><svg viewBox="0 0 16 16"><path d="M8 1v14" fill="none" stroke="currentColor" stroke-width="1.2" /><path d="M6.5 4 2 8l4.5 4zM9.5 4 14 8l-4.5 4z" /></svg></StageIconButton>
              <StageIconButton title="Flip vertical" @click="flipV"><svg viewBox="0 0 16 16"><path d="M1 8h14" fill="none" stroke="currentColor" stroke-width="1.2" /><path d="M4 6.5 8 2l4 4.5zM4 9.5 8 14l4-4.5z" /></svg></StageIconButton>
            </div>
          </div>
        </section>

        <section class="ins-section">
          <div class="ins-section-label">Layout</div>
          <div class="ins-row">
            <StageNumberField
              label="W" :model-value="rect.w" :min="1" :disabled="isRive"
              :title="isRive ? 'Rive overlays size their own canvas' : ''"
              @update:model-value="setWidth"
            />
            <StageNumberField
              label="H" :model-value="rect.h" :min="1" :disabled="isRive"
              :title="isRive ? 'Rive overlays size their own canvas' : ''"
              @update:model-value="setHeight"
            />
          </div>
          <StageCheckbox v-model="lockAspect" :disabled="isRive" label="Lock aspect ratio" />
        </section>

        <section class="ins-section">
          <div class="ins-section-label">Appearance</div>
          <div class="ins-row">
            <StageNumberField
              label="Opacity" suffix="%" :model-value="opacityPct" :min="0" :max="100"
              @update:model-value="apply({ opacity: $event / 100 })"
            />
          </div>
        </section>
      </div>

      <footer class="ins-footer">
        <div class="ins-section-label">Grid</div>
        <StageCheckbox v-model="grid.visible" label="Show grid" />
        <div class="ins-row">
          <StageNumberField label="Size" :model-value="grid.size" :min="2" :max="512" @update:model-value="grid.size = $event" />
        </div>
        <StageSegmented v-model="grid.mode" :options="SNAP_MODES" />
      </footer>
    </StagePanel>
  </aside>
</template>

<style scoped>
.inspector {
  position: fixed;
  width: 264px;
  max-height: calc(100vh - 48px);
  display: flex;
  color: var(--text-main);
  font-family: var(--font-primary);
  z-index: 10;
}

.inspector-panel {
  width: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.ins-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-2);
  padding: var(--space-3);
  border-bottom: 1px solid var(--black-3);
  cursor: move;
  touch-action: none;
  user-select: none;
}

.ins-header > .stage-icon-btn {
  flex: none;
  width: 24px;
  height: 24px;
}

.ins-title-group { display: flex; flex-direction: column; min-width: 0; }

.ins-title {
  font-size: var(--main-font-size-3);
  font-weight: var(--font-weight-2);
}

.ins-sub {
  font-family: var(--font-microcopy);
  font-size: var(--main-font-size-5);
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ins-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  scrollbar-color: var(--black-3) transparent;
}

.ins-section, .ins-footer {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-3);
  border-bottom: 1px solid var(--black-3);
}

.ins-footer { border-bottom: none; border-top: 1px solid var(--black-3); }

.ins-section-label {
  font-family: var(--font-microcopy);
  font-size: var(--main-font-size-5);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted);
}

.ins-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-2);
}

.btn-row {
  display: flex;
  gap: var(--space-0);
}

.btn-row > .stage-icon-btn {
  flex: 1;
}
</style>
