<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from "vue";
import StagePanel from "./StagePanel.vue";
import ControlRenderer from "../inspector/ControlRenderer.vue";
import Icons from "../../components/Icons.vue";
import { motion } from "motion-v";
import { Dynamics } from "../../composables/useMotion";
import { useInspectorModel, type BuiltinSource } from "../inspector/useInspectorModel";
import { evalWhen, type InputPhase, type InspectorSection } from "../inspector/types";
import { overlays } from "../overlayClient";
import { commitTransform } from "../history";
import { clearSelection, inspectorPos, lockAspect, selectedId } from "../stageState";
import type { OverlayRect } from "../types";

const PANEL_W = 264;
const MARGIN = 24;

const root = ref<HTMLElement | null>(null);

const descriptor = computed(() => (selectedId.value ? overlays.get(selectedId.value) : undefined));
const isRive = computed(() => descriptor.value?.kind === "rive");
const overlayId = computed(() => selectedId.value);

/** The selected overlay's rect, materialising the centered default if unset. */
const rect = computed<OverlayRect>(() => {
  const d = descriptor.value;
  if (!d) return { x: 0, y: 0, w: 0, h: 0 };
  if (d.rect) return d.rect;
  const { w, h } = d.size;
  return { x: Math.round((window.innerWidth - w) / 2), y: Math.round((window.innerHeight - h) / 2), w, h };
});

function apply(patch: Partial<OverlayRect>): void {
  const d = descriptor.value;
  if (!d) return;
  commitTransform(d.overlayId, { ...rect.value, ...patch });
}

function setRot(deg: number): void {
  apply({ rot: ((deg % 360) + 360) % 360 });
}

function setSize(w: number, h: number): void {
  if (!lockAspect.value) {
    apply({ w, h });
    return;
  }
  const r = rect.value;
  // Whichever component moved drives the other through the original ratio.
  if (w !== r.w && r.w > 0) apply({ w, h: Math.round((w * r.h) / r.w) });
  else if (h !== r.h && r.h > 0) apply({ h, w: Math.round((h * r.w) / r.h) });
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

// --- FUSE's own sections -------------------------------------------------
// Declared in the same shape plugins use, so one renderer covers both. Their
// values come from the overlay rect rather than the socket.
const builtinSections = computed<InspectorSection[]>(() => [
  {
    id: "fuse.position",
    label: "Position",
    order: 0,
    builtin: true,
    controls: [
      {
        type: "buttonRow",
        id: "align",
        builtin: true,
        buttons: [
          { id: "left", text: "", icon: "alignLeft", variant: "ghost", tooltip: "Align left" },
          { id: "center-h", text: "", icon: "alignHorizontalCenter", variant: "ghost", tooltip: "Align horizontal centre" },
          { id: "right", text: "", icon: "alignRight", variant: "ghost", tooltip: "Align right" },
          { id: "top", text: "", icon: "alignTop", variant: "ghost", tooltip: "Align top" },
          { id: "center-v", text: "", icon: "alignVerticalCenter", variant: "ghost", tooltip: "Align vertical centre" },
          { id: "bottom", text: "", icon: "alignBottom", variant: "ghost", tooltip: "Align bottom" },
        ],
      },
      { type: "vec2", id: "pos", label: "X / Y", builtin: true, labels: ["X", "Y"], step: 1 },
      {
        type: "number",
        id: "rot",
        label: "Rotation",
        builtin: true,
        min: -360,
        max: 360,
        unit: "°",
        tooltip: "Clockwise degrees about the overlay's centre",
      },
      {
        type: "buttonRow",
        id: "rot-ops",
        builtin: true,
        buttons: [
          // No rotate glyph in Icons.vue yet - `reload` is the closest circular arrow.
          { id: "rot90", text: "", icon: "reload", variant: "ghost", tooltip: "Rotate 90° clockwise" },
          { id: "flip-h", text: "", icon: "flipHorizontal", variant: "ghost", tooltip: "Flip horizontal" },
          { id: "flip-v", text: "", icon: "flipVertical", variant: "ghost", tooltip: "Flip vertical" },
        ],
      },
    ],
  },
  {
    id: "fuse.layout",
    label: "Layout",
    order: 1,
    builtin: true,
    controls: [
      {
        type: "vec2",
        id: "size",
        label: "W / H",
        builtin: true,
        labels: ["W", "H"],
        min: 1,
        disabledWhen: { key: "__rive", truthy: true },
        tooltip: isRive.value ? "Rive overlays size their own canvas" : undefined,
      },
      {
        type: "toggle",
        id: "lockAspect",
        label: "Lock aspect",
        builtin: true,
        disabledWhen: { key: "__rive", truthy: true },
      },
    ],
  },
  {
    id: "fuse.appearance",
    label: "Appearance",
    order: 2,
    builtin: true,
    controls: [
      {
        type: "slider",
        id: "opacity",
        label: "Opacity",
        builtin: true,
        min: 0,
        max: 100,
        step: 1,
        unit: "%",
        default: 100,
        tooltip: "Double-click the track to reset to 100%",
      },
    ],
  },
]);

const builtin = computed<BuiltinSource>(() => ({
  sections: builtinSections.value,
  // Rive overlays size their own canvas, so the size controls read this.
  feed: { __rive: isRive.value },
  get(controlId: string): unknown {
    const r = rect.value;
    switch (controlId) {
      case "pos": return { x: r.x, y: r.y };
      case "size": return { x: r.w, y: r.h };
      case "rot": return r.rot ?? 0;
      case "opacity": return Math.round((r.opacity ?? 1) * 100);
      case "lockAspect": return lockAspect.value;
      default: return undefined;
    }
  },
  set(controlId: string, value: unknown, _phase: InputPhase): void {
    switch (controlId) {
      case "pos": {
        const v = value as { x: number; y: number };
        apply({ x: v.x, y: v.y });
        return;
      }
      case "size": {
        const v = value as { x: number; y: number };
        setSize(v.x, v.y);
        return;
      }
      case "rot":
        setRot(Number(value));
        return;
      case "opacity":
        apply({ opacity: Number(value) / 100 });
        return;
      case "lockAspect":
        lockAspect.value = Boolean(value);
        return;
    }
  },
  action(controlId: string, payload?: unknown): void {
    if (controlId === "align") {
      align(String(payload) as Align);
      return;
    }
    if (controlId !== "rot-ops") return;
    const r = rect.value.rot ?? 0;
    // A flip is expressed as the equivalent box rotation - the persisted model
    // has no scale, so this mirrors the frame, not the overlay's own content.
    if (payload === "rot90") setRot(r + 90);
    else if (payload === "flip-h") setRot(180 - r);
    else if (payload === "flip-v") setRot(360 - r);
  },
}));

const model = useInspectorModel(overlayId, computed(() => builtin.value));

// `__rive` is a predicate feed, not a row of its own.
const HIDDEN_IDS = new Set(["__rive"]);

const collapsed = reactive(new Set<string>());
function toggleSection(s: InspectorSection): void {
  if (s.collapsible === false) return;
  if (collapsed.has(s.id)) collapsed.delete(s.id);
  else collapsed.add(s.id);
}

const visibleSections = computed(() =>
  model.sections.value.filter((s) => evalWhen(s.when, model.values.value)),
);

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
        <button type="button" class="ins-close" title="Deselect (Esc)" @click="clearSelection">
          <Icons kind="cross" size="small" color="var(--ico)" />
        </button>
      </header>

      <div class="ins-body">
        <section v-for="s in visibleSections" :key="s.id" class="ins-section">
          <button
            type="button"
            class="ins-section-head"
            :class="{ static: s.collapsible === false }"
            @click="toggleSection(s)"
          >
            <motion.span
              v-if="s.collapsible !== false"
              class="sec-caret"
              :initial="false"
              :animate="{ rotate: collapsed.has(s.id) ? -90 : 0 }"
              :transition="Dynamics.snappy"
            >
              <Icons kind="chevron-down" size="small" color="var(--text-muted)" />
            </motion.span>
            <span class="ins-section-label">{{ s.label }}</span>
          </button>
          <template v-if="!collapsed.has(s.id)">
            <p v-if="s.description" class="ins-section-desc">{{ s.description }}</p>
            <template v-for="(c, i) in s.controls" :key="c.id ?? `${s.id}-${i}`">
              <ControlRenderer
                v-if="!(c.id && HIDDEN_IDS.has(c.id)) && model.visible(c)"
                :control="c"
                :value="model.valueOf(c)"
                :disabled="model.disabled(c)"
                @set="(v, phase) => model.set(c, v, phase)"
                @action="(p) => model.action(c, p)"
              />
            </template>
          </template>
        </section>
      </div>
    </StagePanel>
  </aside>
</template>

<style scoped>
.inspector {
  user-select: none;
  -webkit-user-select: none;
  position: fixed;
  width: 264px;
  max-height: calc(100vh - 120px);
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

.ins-close {
  --ico: var(--text-muted);
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
  corner-shape: bevel;
  border-radius: 6px 0 6px 0;
}

.ins-close:hover {
  --ico: var(--text-main);
  background: rgba(255, 255, 255, 0.06);
}

.ins-title-group { display: flex; flex-direction: column; min-width: 0; }

.ins-title {
  font-size: var(--main-font-size-2);
  font-weight: var(--font-weight-2);
}

.ins-sub {
  font-family: var(--font-microcopy);
  font-size: var(--main-font-size-4);
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ins-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--black-3) transparent;
}

.ins-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-3);
  border-bottom: 1px solid var(--black-3);
}

.ins-section:last-child { border-bottom: none; }

.ins-section-head {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  padding: 0;
  border: none;
  background: none;
  cursor: pointer;
  text-align: left;
}

.ins-section-head.static { cursor: default; }

.sec-caret {
  display: flex;
  line-height: 0;
}

.ins-section-label {
  font-family: var(--font-microcopy);
  font-size: var(--main-font-size-4);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted);
  user-select: none;
}

.ins-section-desc {
  margin: 0;
  font-family: var(--font-microcopy);
  font-size: 10px;
  line-height: 1.4;
  color: var(--base-600);
}
</style>
