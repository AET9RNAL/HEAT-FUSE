<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { AnimatePresence, motion } from "motion-v";
import { Dynamics } from "fuse_ui/ui/dynamics.mjs";
import eButton from "fuse_ui/ui/eButton.vue";
import eButtons from "fuse_ui/ui/eButtons.vue";
import eSelect from "fuse_ui/ui/eSelect.vue";
import eTextField from "fuse_ui/ui/eTextField.vue";
import eColorField from "fuse_ui/ui/eColorField.vue";
import eSlider from "fuse_ui/ui/eSlider.vue";
import Icons from "fuse_ui/ui/Icons.vue";
import OverlayShapes from "./OverlayShapes.vue";
import { fit, hitFeature, toScreen, toWorld, viewBox, zoomAt } from "./viewport.mjs";
import { useI18n } from "./i18n.mjs";

interface Feature {
  id: string;
  kind: string;
  points: [number, number][];
  tag: string;
  label: string;
  stroke: string;
  fill: string;
  width: number;
  modes: string[];
  roles: string[];
  vehicles: string[];
}
interface Preset {
  tag: string;
  label: string;
  kind: string;
  stroke: string;
  fill: string;
  icon: string;
  group: string;
}

const GROUPS = [
  { id: "general", label: "editor.general" },
  { id: "killconfirm", label: "editor.killConfirm" },
];
interface MapLayer {
  image: string;
  x0: number;
  ytop: number;
  w: number;
  h: number;
}
interface EditorData {
  map: string;
  maps: { key: string; name: string }[];
  layer: (MapLayer & { wide?: MapLayer | null }) | null;
  features: Feature[];
  presets: Preset[];
  roles: string[];
  modes: { value: string; label: string }[];
  vehicles: RosterVehicle[];
  current: { mode: string; role: string; vehicle: string };
}
interface RosterVehicle {
  slug: string;
  name: string;
  role: string;
  art: boolean;
}

const props = defineProps<{
  editor: EditorData;
  interactive: boolean;
  player?: { x: number; y: number; heading: number } | null;
  cmd?: { id: number; type: string } | null;
  assetBase?: string;
  emitAction?: (action: string, payload?: unknown) => void;
}>();

const { t } = useI18n();

const SAVE_MS = 250;
const HISTORY = 60;
const PICK_PX = 7;
const CLOSE_PX = 9;
const K_MIN = 0.02;
const K_MAX = 8;

const base = computed(() => props.assetBase ?? "");
const features = ref<Feature[]>([]);
const history: Feature[][] = [];
const canUndo = ref(false);
const selectedId = ref("");
/** "" selects and moves; a preset tag draws that preset. */
const tool = ref("");
const draft = ref<{ tag: string; kind: string; points: [number, number][] } | null>(null);
const cursor = ref<[number, number] | null>(null);
/** What the select tool points at: a shape id, or a corner of the selected shape. */
const hoverId = ref("");
const hoverVertex = ref(false);
const dragType = ref("");
/** The filters last set on each preset; a new feature of that preset starts with them. */
const lastFilters: Record<string, { modes: string[]; roles: string[]; vehicles: string[] }> = {};

const canvas = ref<HTMLElement | null>(null);
const size = reactive({ w: 0, h: 0 });
const view = ref({ cx: 0, cy: 0, k: 0.1 });

const clone = (list: Feature[]): Feature[] => JSON.parse(JSON.stringify(list)) as Feature[];
const presetOf = (tag: string) => props.editor.presets.find((p) => p.tag === tag) ?? null;
const selected = computed(() => features.value.find((f) => f.id === selectedId.value) ?? null);
const activePreset = computed(() => (tool.value ? presetOf(tool.value) : null));

// ---- Saving and undo ----

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let saveMap = "";

function flushSave(): void {
  if (!saveTimer) return;
  clearTimeout(saveTimer);
  saveTimer = null;
  props.emitAction?.("overlay.save", { map: saveMap, features: clone(features.value) });
}

function save(): void {
  saveMap = props.editor.map;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    props.emitAction?.("overlay.save", { map: saveMap, features: clone(features.value) });
  }, SAVE_MS);
}

/** Call before a change, so undo can return to this state. */
function remember(): void {
  history.push(clone(features.value));
  if (history.length > HISTORY) history.shift();
  canUndo.value = true;
}

function undo(): void {
  const prev = history.pop();
  canUndo.value = history.length > 0;
  if (!prev) return;
  features.value = prev;
  if (!features.value.some((f) => f.id === selectedId.value)) selectedId.value = "";
  save();
}

// ---- Map and view ----

function fitAll(): void {
  if (!size.w || !size.h) return;
  const l = props.editor.layer;
  view.value = fit(l ?? { x0: -1000, ytop: 1000, w: 2000, h: 2000 }, size.w, size.h);
}

function load(): void {
  features.value = clone(props.editor.features ?? []);
  history.length = 0;
  canUndo.value = false;
  selectedId.value = "";
  draft.value = null;
  fitAll();
}

watch(
  () => props.editor.map,
  () => {
    flushSave();
    load();
  },
);

let ro: ResizeObserver | null = null;
onMounted(() => {
  load();
  const el = canvas.value;
  if (!el) return;
  const measure = () => {
    const first = !size.w;
    size.w = el.clientWidth;
    size.h = el.clientHeight;
    if (first) fitAll();
  };
  measure();
  ro = new ResizeObserver(measure);
  ro.observe(el);
});

onBeforeUnmount(() => {
  ro?.disconnect();
  flushSave();
  window.removeEventListener("keydown", onKey);
});

const box = computed(() => (size.w && size.h ? viewBox(view.value, size.w, size.h) : "0 0 1 1"));
/** Icon unit in metres: 1/200 of the view, as on the minimap. */
const u = computed(() => Math.min(size.w, size.h) / 200 / view.value.k);

/** The map images are HTML images moved on the GPU, as on the minimap. */
function img(l: MapLayer | null | undefined) {
  if (!l || !size.w) return null;
  const [sx, sy] = screenOf(l.x0, l.ytop);
  return {
    src: `${base.value}/assets/${l.image}`,
    style: { width: `${l.w * view.value.k}px`, height: `${l.h * view.value.k}px`, transform: `translate(${sx}px, ${sy}px)` },
  };
}
const hdImage = computed(() => img(props.editor.layer));
const wideImage = computed(() => img(props.editor.layer?.wide));

// ---- Pointer input ----

type Drag =
  | { type: "pan"; sx: number; sy: number; cx: number; cy: number }
  | { type: "vertex"; id: string; index: number; moved: boolean }
  | { type: "move"; id: string; wx: number; wy: number; points: [number, number][]; moved: boolean };
let drag: Drag | null = null;

function local(e: { clientX: number; clientY: number }): [number, number] {
  const r = canvas.value?.getBoundingClientRect();
  return r ? [e.clientX - r.left, e.clientY - r.top] : [0, 0];
}

function world(sx: number, sy: number): [number, number] {
  return toWorld(view.value, sx, sy, size.w, size.h);
}

function screenOf(x: number, y: number): [number, number] {
  return toScreen(view.value, x, y, size.w, size.h);
}

const round1 = (v: number) => Math.round(v * 10) / 10;

function vertexAt(sx: number, sy: number): number {
  const f = selected.value;
  if (!f || f.kind === "point") return -1;
  return f.points.findIndex(([x, y]) => {
    const [px, py] = screenOf(x, y);
    return Math.hypot(px - sx, py - sy) <= PICK_PX;
  });
}

function newFeature(preset: Preset, points: [number, number][]): Feature {
  const filters = lastFilters[preset.tag] ?? { modes: [], roles: [], vehicles: [] };
  return {
    id: Math.random().toString(36).slice(2, 10),
    kind: preset.kind,
    points,
    tag: preset.tag,
    label: "",
    stroke: preset.stroke,
    fill: preset.fill,
    width: preset.kind === "path" ? 1.6 : 1,
    modes: [...filters.modes],
    roles: [...filters.roles],
    vehicles: [...filters.vehicles],
  };
}

function finishDraft(): void {
  const d = draft.value;
  const preset = d ? presetOf(d.tag) : null;
  draft.value = null;
  if (!d || !preset) return;
  // A double-click adds the last point twice.
  const pts = d.points.filter((p, i) => i === 0 || Math.hypot(p[0] - d.points[i - 1][0], p[1] - d.points[i - 1][1]) > 0.5);
  if (pts.length < (d.kind === "area" ? 3 : 2)) return;
  remember();
  const f = newFeature(preset, pts);
  features.value = [...features.value, f];
  selectedId.value = f.id;
  tool.value = "";
  save();
}

/** Token art sits above its point. Its circle counts as the token too. */
function pick(x: number, y: number): Feature | null {
  const badge = (f: Feature) => (presetOf(f.tag)?.icon ? { dy: 5.5 * u.value, r: 6.5 * u.value } : null);
  return hitFeature(features.value, x, y, PICK_PX / view.value.k, badge);
}

function setHover(sx: number, sy: number, x: number, y: number): void {
  const off = !props.interactive || !!tool.value;
  hoverVertex.value = !off && vertexAt(sx, sy) >= 0;
  hoverId.value = off || hoverVertex.value ? "" : (pick(x, y)?.id ?? "");
}

function startDrag(d: Drag): void {
  drag = d;
  dragType.value = d.type;
}

function onPointerDown(e: PointerEvent): void {
  if (!props.interactive) return;
  const [sx, sy] = local(e);
  const [x, y] = world(sx, sy);
  (e.currentTarget as Element).setPointerCapture(e.pointerId);

  if (e.button === 1 || e.button === 2) {
    if (e.button === 2 && removeVertex(sx, sy)) return;
    startDrag({ type: "pan", sx, sy, cx: view.value.cx, cy: view.value.cy });
    return;
  }
  if (e.button !== 0) return;

  const preset = activePreset.value;
  if (preset) {
    if (preset.kind === "point") {
      remember();
      const f = newFeature(preset, [[round1(x), round1(y)]]);
      features.value = [...features.value, f];
      selectedId.value = f.id;
      tool.value = "";
      setHover(sx, sy, x, y);
      save();
      return;
    }
    const d = draft.value ?? { tag: preset.tag, kind: preset.kind, points: [] };
    if (d.kind === "area" && d.points.length >= 3) {
      const [fx, fy] = screenOf(d.points[0][0], d.points[0][1]);
      if (Math.hypot(fx - sx, fy - sy) <= CLOSE_PX) {
        draft.value = d;
        finishDraft();
        setHover(sx, sy, x, y);
        return;
      }
    }
    draft.value = { ...d, points: [...d.points, [round1(x), round1(y)]] };
    return;
  }

  const vi = vertexAt(sx, sy);
  if (vi >= 0) {
    startDrag({ type: "vertex", id: selectedId.value, index: vi, moved: false });
    return;
  }
  const hit = pick(x, y);
  if (hit) {
    selectedId.value = hit.id;
    startDrag({ type: "move", id: hit.id, wx: x, wy: y, points: hit.points.map((p) => [p[0], p[1]]), moved: false });
    return;
  }
  selectedId.value = "";
  startDrag({ type: "pan", sx, sy, cx: view.value.cx, cy: view.value.cy });
}

function onPointerMove(e: PointerEvent): void {
  const [sx, sy] = local(e);
  const [x, y] = world(sx, sy);
  cursor.value = [x, y];
  if (!drag) setHover(sx, sy, x, y);
  if (!drag || !props.interactive) return;
  if (drag.type === "pan") {
    view.value = { ...view.value, cx: drag.cx - (sx - drag.sx) / view.value.k, cy: drag.cy + (sy - drag.sy) / view.value.k };
    return;
  }
  const d = drag;
  const f = features.value.find((q) => q.id === d.id);
  if (!f) return;
  if (!d.moved) {
    remember();
    d.moved = true;
  }
  if (d.type === "vertex") {
    f.points[d.index] = [round1(x), round1(y)];
  } else {
    f.points = d.points.map(([px, py]) => [round1(px + x - d.wx), round1(py + y - d.wy)]);
  }
}

function onPointerUp(e: PointerEvent): void {
  const d = drag;
  drag = null;
  dragType.value = "";
  if (d && d.type !== "pan" && d.moved) save();
  const [sx, sy] = local(e);
  const [x, y] = world(sx, sy);
  setHover(sx, sy, x, y);
}

function onPointerLeave(): void {
  cursor.value = null;
  hoverId.value = "";
  hoverVertex.value = false;
}

function onDoubleClick(e: MouseEvent): void {
  if (!props.interactive || !draft.value) return;
  finishDraft();
  const [sx, sy] = local(e);
  const [x, y] = world(sx, sy);
  setHover(sx, sy, x, y);
}

function onWheel(e: WheelEvent): void {
  if (!props.interactive) return;
  e.preventDefault();
  const [sx, sy] = local(e);
  view.value = zoomAt(view.value, sx, sy, size.w, size.h, Math.exp(-e.deltaY * 0.0015), K_MIN, K_MAX);
}

function zoomBy(factor: number): void {
  view.value = zoomAt(view.value, size.w / 2, size.h / 2, size.w, size.h, factor, K_MIN, K_MAX);
}

/** Right-click on a corner of the selected shape removes that corner. */
function removeVertex(sx: number, sy: number): boolean {
  const f = selected.value;
  const i = vertexAt(sx, sy);
  if (!f || i < 0 || f.points.length <= (f.kind === "area" ? 3 : 2)) return false;
  remember();
  f.points.splice(i, 1);
  save();
  return true;
}

// ---- Keys (the stage window takes focus in the interactive state) ----

function typing(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
}

function onKey(e: KeyboardEvent): void {
  if (!props.interactive || typing(e)) return;
  if (e.key === "Escape") {
    if (draft.value) draft.value = null;
    else if (tool.value) tool.value = "";
    else selectedId.value = "";
  } else if (e.key === "Enter") {
    finishDraft();
  } else if ((e.key === "Delete" || e.key === "Backspace") && selected.value) {
    removeSelected();
  } else if (e.key.toLowerCase() === "z" && (e.ctrlKey || e.metaKey)) {
    undo();
  } else {
    return;
  }
  e.preventDefault();
}

watch(
  () => props.interactive,
  (on) => {
    window.removeEventListener("keydown", onKey);
    if (on) window.addEventListener("keydown", onKey);
    // A draft stays: Ctrl+M adds corners while you drive, out of interactive mode.
    else {
      drag = null;
      dragType.value = "";
      hoverId.value = "";
      hoverVertex.value = false;
    }
  },
  { immediate: true },
);

// ---- Tools ----

function pickTool(tag: string): void {
  draft.value = null;
  tool.value = tool.value === tag ? "" : tag;
  if (tool.value) {
    selectedId.value = "";
    hoverId.value = "";
    hoverVertex.value = false;
  }
}

function removeSelected(): void {
  const id = selectedId.value;
  if (!id) return;
  remember();
  features.value = features.value.filter((f) => f.id !== id);
  selectedId.value = "";
  save();
}

/**
 * Uses your position. With a mark tool on, it places that mark. With an area or path tool on, it adds
 * the next corner, so you can drive a position's outline. With a point selected, it moves the point.
 */
function placeAtPlayer(): void {
  const p = props.player;
  if (!p) return;
  const at: [number, number] = [round1(p.x), round1(p.y)];
  const preset = activePreset.value;
  const sel = selected.value;
  if (preset && preset.kind !== "point") {
    const d = draft.value ?? { tag: preset.tag, kind: preset.kind, points: [] };
    draft.value = { ...d, points: [...d.points, at] };
  } else if (!preset && sel?.kind === "point") {
    remember();
    sel.points = [at];
    save();
  } else {
    const use = preset ?? presetOf("mark");
    if (!use) return;
    remember();
    const f = newFeature(use, [at]);
    features.value = [...features.value, f];
    selectedId.value = f.id;
    save();
  }
  // Keep you in view.
  const [sx, sy] = screenOf(p.x, p.y);
  if (sx < 0 || sy < 0 || sx > size.w || sy > size.h) view.value = { ...view.value, cx: p.x, cy: p.y };
}

watch(
  () => props.cmd?.id,
  (id, prev) => {
    if (id && id !== prev && props.cmd?.type === "here") placeAtPlayer();
  },
);

// ---- Properties of the selected feature ----

type Field = "label" | "stroke" | "fill" | "width" | "modes" | "roles" | "vehicles" | "tag";

/** `live` changes the drawing only; `commit` also saves it and can be undone. */
function setField(field: Field, value: unknown, commit = true): void {
  const f = selected.value;
  if (!f) return;
  if (commit) remember();
  if (field === "tag") {
    const p = presetOf(String(value));
    if (!p) return;
    Object.assign(f, { tag: p.tag, stroke: p.stroke, fill: p.fill });
  } else if (field === "modes" || field === "roles" || field === "vehicles") {
    f[field] = Array.isArray(value) ? value.map(String) : [];
    lastFilters[f.tag] = { modes: [...f.modes], roles: [...f.roles], vehicles: [...f.vehicles] };
  } else if (field === "width") {
    f.width = Number(value) || 1;
  } else {
    f[field] = String(value);
  }
  if (commit) save();
}

const tagOptions = computed(() =>
  props.editor.presets.filter((p) => p.kind === selected.value?.kind).map((p) => ({ value: p.tag, label: p.label })),
);
const modeOptions = computed(() => props.editor.modes);
const roleOptions = computed(() => props.editor.roles.map((r) => ({ value: r, label: t(`roles.${r}`) })));
/** The roster by class, in the plugin's order. A filtered vehicle missing from it still shows, so it can be removed. */
const vehicleGroups = computed(() => {
  const all = [...props.editor.vehicles];
  for (const slug of selected.value?.vehicles ?? []) {
    if (!all.some((v) => v.slug === slug)) all.push({ slug, name: slug, role: "other", art: false });
  }
  const groups: { role: string; label: string; icon: string; vehicles: RosterVehicle[] }[] = [];
  for (const v of all) {
    let g = groups.find((x) => x.role === v.role);
    if (!g) {
      const known = props.editor.roles.includes(v.role);
      const icon = known ? `url("${base.value}/assets/icons/classes/${v.role}.svg")` : "";
      groups.push((g = { role: v.role, label: known ? t(`classGroups.${v.role}`) : t("vehicle.other"), icon, vehicles: [] }));
    }
    g.vehicles.push(v);
  }
  return groups;
});

function toggleVehicle(slug: string): void {
  const f = selected.value;
  if (!f) return;
  setField("vehicles", f.vehicles.includes(slug) ? f.vehicles.filter((v) => v !== slug) : [...f.vehicles, slug]);
}
const mapOptions = computed(() => props.editor.maps.map((m) => ({ value: m.key, label: m.name })));
const toolGroups = computed(() =>
  GROUPS.map((g) => ({ ...g, label: t(g.label), presets: props.editor.presets.filter((p) => p.group === g.id) })).filter(
    (g) => g.presets.length,
  ),
);

// ---- Drawing helpers ----

const draftPath = computed(() => {
  const d = draft.value;
  if (!d || !d.points.length) return "";
  const pts = cursor.value ? [...d.points, cursor.value] : d.points;
  return pts.map(([x, y], i) => `${i ? "L" : "M"} ${x} ${-y}`).join(" ") + (d.kind === "area" && pts.length > 2 ? " Z" : "");
});
const draftStroke = computed(() => (draft.value ? (presetOf(draft.value.tag)?.stroke ?? "#F2F2F2") : "#F2F2F2"));
const handles = computed(() => (selected.value && selected.value.kind !== "point" ? selected.value.points : []));

const hint = computed(() => {
  if (!props.interactive) return props.player ? t("editor.hintDrive") : "";
  const p = activePreset.value;
  if (p?.kind === "point") return t("editor.hintPoint", { mark: p.label });
  if (p?.kind === "area") return t(draft.value ? "editor.hintAreaMore" : "editor.hintAreaStart");
  if (p?.kind === "path") return t(draft.value ? "editor.hintPathMore" : "editor.hintPathStart");
  if (selected.value) return t("editor.hintSelected");
  return t("editor.hintIdle");
});

const readout = computed(() => (cursor.value ? `X ${Math.round(cursor.value[0])}  Y ${Math.round(cursor.value[1])}` : ""));

function done(): void {
  flushSave();
  props.emitAction?.("overlay.done");
}
</script>

<template>
  <div class="ed" :class="{ live: interactive }">
    <header class="ed-head">
      <span class="ed-title">{{ t("editor.title") }}</span>
      <div class="ed-map">
        <eSelect
          :model-value="editor.map"
          :options="mapOptions"
          :disabled="!interactive"
          @update:model-value="emitAction?.('overlay.map', $event)"
        />
      </div>
      <span class="ed-gap" />
      <div class="ed-done">
        <eButton :text="t('editor.done')" variant="accent" :disabled="!interactive" @click="done" />
      </div>
    </header>

    <div class="ed-bar">
      <section v-for="g in toolGroups" :key="g.id" class="ed-group">
        <span class="ed-cap">{{ g.label }}</span>
        <div class="ed-row-tools">
          <button
            v-for="p in g.presets"
            :key="p.tag"
            type="button"
            class="ed-tool"
            :class="{ on: tool === p.tag }"
            :style="{ '--tool': p.stroke.slice(0, 7) }"
            :disabled="!interactive"
            @click="pickTool(p.tag)"
          >
            <img v-if="p.icon" class="ed-ico" :src="`${base}/assets/icons/KCIcon${p.icon}.svg`" alt="" draggable="false" />
            <svg v-else class="ed-ico" viewBox="0 0 16 16" aria-hidden="true">
              <path v-if="p.kind === 'area'" class="ico-area" d="M2.5 5 L9 2.5 L13.5 6.5 L11.5 13.5 L3.5 12 Z" />
              <path v-else-if="p.kind === 'path'" class="ico-line" d="M2 13 L6 8 L10 10 L14 3" />
              <g v-else>
                <circle class="ico-ring" cx="8" cy="8" r="5.5" />
                <circle class="ico-dot" cx="8" cy="8" r="2" />
              </g>
            </svg>
            <span class="ed-tool-label">{{ p.label }}</span>
          </button>
        </div>
      </section>
      <span class="ed-gap" />
      <section class="ed-group">
        <span class="ed-cap">{{ t("editor.tools") }}</span>
        <div class="ed-row-tools">
          <button
            type="button"
            class="ed-tool"
            :disabled="!interactive || !player"
            :title="player ? t('editor.atMeTip') : t('editor.atMeOff')"
            @click="placeAtPlayer"
          >
            <Icons kind="user" color="#F2F2F2" />
            <span class="ed-tool-label">{{ t("editor.atMe") }}</span>
          </button>
          <button
            type="button"
            class="ed-tool square"
            :disabled="!interactive || !canUndo"
            :title="t('editor.undo')"
            @click="undo"
          >
            <Icons kind="reset" color="#F2F2F2" />
          </button>
          <button type="button" class="ed-tool square" :disabled="!interactive" :title="t('editor.fit')" @click="fitAll">
            <Icons kind="maximize" color="#F2F2F2" />
          </button>
        </div>
      </section>
    </div>

    <div
      ref="canvas"
      class="ed-canvas"
      :class="{
        drawing: !!tool,
        panning: dragType === 'pan',
        'over-shape': !!hoverId && hoverId !== selectedId,
        'over-selected': hoverVertex || dragType === 'move' || dragType === 'vertex' || (!!hoverId && hoverId === selectedId),
      }"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
      @pointerleave="onPointerLeave"
      @dblclick="onDoubleClick"
      @wheel="onWheel"
      @contextmenu.prevent
    >
      <img v-if="wideImage" class="ed-map-img" :src="wideImage.src" :style="wideImage.style" alt="" draggable="false" />
      <img
        v-if="hdImage"
        class="ed-map-img"
        :class="{ feather: wideImage }"
        :src="hdImage.src"
        :style="hdImage.style"
        alt=""
        draggable="false"
      />
      <svg class="ed-svg" :viewBox="box" preserveAspectRatio="none" aria-hidden="true">
        <OverlayShapes :features="features" :u="u" :asset-base="base" :selected-id="selectedId" :hover-id="hoverId" />
        <path
          v-if="draftPath"
          :d="draftPath"
          fill="none"
          :stroke="draftStroke"
          :stroke-width="1.4 * u"
          :stroke-dasharray="`${3 * u} ${2 * u}`"
          stroke-linejoin="round"
        />
        <rect
          v-for="(p, i) in handles"
          :key="`h${i}`"
          class="ed-handle"
          :x="p[0] - 2 * u"
          :y="-p[1] - 2 * u"
          :width="4 * u"
          :height="4 * u"
          :stroke-width="0.6 * u"
        />
        <g v-if="player" :transform="`translate(${player.x} ${-player.y}) rotate(${player.heading})`">
          <path
            class="ed-you"
            :d="`M 0 ${-5 * u} L ${3.6 * u} ${4 * u} L 0 ${2 * u} L ${-3.6 * u} ${4 * u} Z`"
            :stroke-width="0.8 * u"
            stroke-linejoin="round"
          />
        </g>
      </svg>

      <span v-if="readout" class="ed-readout">{{ readout }}</span>

      <AnimatePresence>
        <motion.div
          v-if="!interactive"
          key="lock"
          class="ed-lock"
          :initial="{ opacity: 0, y: -6 }"
          :animate="{ opacity: 1, y: 0 }"
          :exit="{ opacity: 0, y: -6 }"
          :transition="Dynamics.snappy"
        >
          <Icons kind="interactive" size="small" />
          <span>{{ t("editor.locked") }}</span>
        </motion.div>
      </AnimatePresence>
      <p v-if="hint" class="ed-hint">{{ hint }}</p>
    </div>

    <AnimatePresence>
      <motion.section
        v-if="selected && interactive"
        key="panel"
        class="ed-panel"
        :initial="{ opacity: 0, y: 8 }"
        :animate="{ opacity: 1, y: 0 }"
        :exit="{ opacity: 0, y: 8 }"
        :transition="Dynamics.snappy"
      >
        <div class="ed-row">
          <span class="ed-label">{{ t("editor.type") }}</span>
          <eSelect :model-value="selected.tag" :options="tagOptions" @update:model-value="setField('tag', $event)" />
        </div>
        <div class="ed-row">
          <span class="ed-label">{{ t("editor.label") }}</span>
          <eTextField
            :model-value="selected.label"
            :max-length="40"
            :placeholder="t('editor.labelNone')"
            @commit="setField('label', $event)"
          />
        </div>
        <div class="ed-row">
          <span class="ed-label">{{ t("editor.line") }}</span>
          <eColorField
            :model-value="selected.stroke"
            with-opacity-slider
            @live="setField('stroke', $event, false)"
            @commit="setField('stroke', $event)"
          />
        </div>
        <div v-if="selected.kind !== 'path'" class="ed-row">
          <span class="ed-label">{{ t("editor.fill") }}</span>
          <eColorField
            :model-value="selected.fill"
            with-opacity-slider
            @live="setField('fill', $event, false)"
            @commit="setField('fill', $event)"
          />
        </div>
        <div class="ed-row">
          <span class="ed-label">{{ t("editor.width") }}</span>
          <eSlider
            :model-value="selected.width"
            :min="0.2"
            :max="8"
            :step="0.1"
            :default="1"
            @live="setField('width', $event, false)"
            @commit="setField('width', $event)"
          />
        </div>
        <div class="ed-stack">
          <span class="ed-label">{{ t("editor.modes") }} <i>{{ t("editor.allIfNone") }}</i></span>
          <eButtons :model-value="selected.modes" :options="modeOptions" mode="multi" @update:model-value="setField('modes', $event)" />
        </div>
        <div class="ed-stack">
          <span class="ed-label">{{ t("editor.classes") }} <i>{{ t("editor.allIfNone") }}</i></span>
          <eButtons :model-value="selected.roles" :options="roleOptions" mode="multi" @update:model-value="setField('roles', $event)" />
        </div>
        <div class="ed-stack">
          <span class="ed-label">{{ t("editor.vehicles") }} <i>{{ t("editor.allIfNone") }}</i></span>
          <div v-for="g in vehicleGroups" :key="g.role" class="ed-class">
            <span class="ed-class-cap">
              <i v-if="g.icon" class="ed-class-ico" :style="{ maskImage: g.icon }" />
              {{ g.label }}
            </span>
            <div class="ed-tanks">
              <button
                v-for="v in g.vehicles"
                :key="v.slug"
                type="button"
                class="ed-tank"
                :class="{ on: selected.vehicles.includes(v.slug) }"
                :title="v.name"
                @click="toggleVehicle(v.slug)"
              >
                <img v-if="v.art" class="ed-tank-art" :src="`${base}/assets/tanks/${v.slug}.png`" alt="" draggable="false" />
                <span v-else class="ed-tank-art" />
                <span class="ed-tank-name">{{ v.name }}</span>
                <span v-if="v.slug === editor.current.vehicle" class="ed-tank-you">{{ t("vehicle.yours") }}</span>
              </button>
            </div>
          </div>
        </div>
        <eButton :text="t('editor.delete')" variant="danger" :confirm="t('editor.deleteConfirm')" @click="removeSelected" />
      </motion.section>
    </AnimatePresence>
  </div>
</template>

<style scoped>
.ed {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  width: 100%;
  height: 100%;
  min-height: 0;
  box-sizing: border-box;
  padding: var(--space-1);
  background: var(--black-1-a);
  border: 1px solid var(--base-600);
  corner-shape: bevel;
  border-radius: 10px 0 10px 0;
  user-select: none;
  pointer-events: none;
}

/* Input only in the interactive state. In calibration the stage drags the overlay instead. */
.ed.live {
  pointer-events: auto;
}

.ed-head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.ed-title {
  font-family: var(--font-microcopy);
  font-size: var(--main-font-size-4);
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--accent-200);
  white-space: nowrap;
}

.ed-map {
  flex: 0 1 220px;
  min-width: 140px;
}

/* The button fills its parent, so the parent sets its size. */
.ed-done {
  flex: none;
  width: 84px;
}

.ed-map-img {
  position: absolute;
  left: 0;
  top: 0;
  max-width: none;
  transform-origin: 0 0;
  will-change: transform;
  pointer-events: none;
}

/* The HD edge fades into the wide image under it. */
.ed-map-img.feather {
  mask-image:
    linear-gradient(to bottom, transparent, #000 1%, #000 99%, transparent),
    linear-gradient(to right, transparent, #000 0.6%, #000 99.4%, transparent);
  mask-composite: intersect;
}

/* Groups sit side by side; each has a caption over a row of tools. */
.ed-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: var(--space-2) var(--space-4);
  padding: 2px 0;
}

.ed-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ed-cap {
  font-family: var(--font-microcopy);
  font-size: var(--main-font-size-5);
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.ed-row-tools {
  display: flex;
  gap: 4px;
}

.ed-gap {
  flex: 1;
}

.ed-tool {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 34px;
  padding: 0 14px 0 12px;
  font-family: var(--font-microcopy);
  font-size: var(--main-font-size-4);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-main);
  background: var(--black-2-a);
  border: 1px solid var(--base-600);
  corner-shape: bevel;
  border-radius: 8px 0 8px 0;
  cursor: pointer;
  transition:
    background 0.15s,
    border-color 0.15s;
}

.ed-tool.square {
  width: 34px;
  padding: 0;
  justify-content: center;
}

.ed-tool:hover:not(:disabled) {
  background: var(--black-3-a);
  border-color: var(--base-200);
}

/* The active tool: accent frame, and a bar in the mark's own colour. */
.ed-tool.on {
  background: color-mix(in srgb, var(--accent-200) 14%, var(--black-2-a));
  border-color: var(--accent-200);
}

.ed-tool.on::after {
  content: "";
  position: absolute;
  left: 10px;
  right: 10px;
  bottom: 3px;
  height: 2px;
  background: var(--tool, var(--accent-200));
}

.ed-tool:disabled {
  opacity: 0.4;
  cursor: default;
}

.ed-ico {
  flex: none;
  width: 16px;
  height: 16px;
}

.ico-area {
  fill: rgba(242, 242, 242, 0.25);
  stroke: #f2f2f2;
  stroke-width: 1.4;
  stroke-linejoin: round;
}

.ico-line {
  fill: none;
  stroke: #f2f2f2;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.ico-ring {
  fill: none;
  stroke: #f2f2f2;
  stroke-width: 1.4;
}

.ico-dot {
  fill: #f2f2f2;
}

.ed-canvas {
  position: relative;
  flex: 1;
  min-height: 80px;
  overflow: hidden;
  background: #0d1114;
  border: 1px solid var(--base-600);
  touch-action: none;
}

/* Select tool: hand on the empty map, pointer on a shape to pick, move on the selected shape. */
.ed.live .ed-canvas {
  cursor: grab;
}

.ed.live .ed-canvas.over-shape {
  cursor: pointer;
}

.ed.live .ed-canvas.over-selected {
  cursor: move;
}

.ed.live .ed-canvas.panning {
  cursor: grabbing;
}

.ed.live .ed-canvas.drawing {
  cursor: crosshair;
}

.ed-svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.ed-handle {
  fill: #f2f2f2;
  stroke: rgba(10, 14, 16, 0.9);
}

.ed-you {
  fill: var(--mm-you, #ffd85c);
  stroke: rgba(10, 14, 16, 0.85);
}

.ed-readout {
  position: absolute;
  top: 4px;
  right: 6px;
  font-family: var(--font-microcopy);
  font-size: var(--main-font-size-5);
  color: var(--text-muted);
  pointer-events: none;
}

.ed-lock {
  position: absolute;
  top: 6px;
  left: 50%;
  translate: -50% 0;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  font-family: var(--font-microcopy);
  font-size: var(--main-font-size-5);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  white-space: nowrap;
  color: var(--accent-200);
  background: rgba(10, 14, 16, 0.85);
  border: 1px solid var(--base-600);
  corner-shape: bevel;
  border-radius: 5px 0 5px 0;
  pointer-events: none;
}

.ed-hint {
  position: absolute;
  left: 6px;
  right: 6px;
  bottom: 4px;
  margin: 0;
  font-family: var(--font-microcopy);
  font-size: var(--main-font-size-5);
  color: #f2f2f2;
  text-shadow: 0 0 3px rgba(0, 0, 0, 0.9);
  pointer-events: none;
}

.ed-panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  max-height: 45%;
  overflow-y: auto;
  padding: var(--space-1);
  background: var(--black-2-a);
  border: 1px solid var(--base-600);
  corner-shape: bevel;
  border-radius: 6px 0 6px 0;
}

.ed-row {
  display: grid;
  grid-template-columns: 56px minmax(0, 1fr);
  align-items: center;
  gap: var(--space-2);
}

.ed-stack {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ed-label {
  font-family: var(--font-microcopy);
  font-size: var(--main-font-size-5);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.ed-label i {
  font-style: normal;
  opacity: 0.6;
  text-transform: none;
}

/* Vehicle filter: one tile per vehicle with its render, grouped by class. */
.ed-class {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin-top: 2px;
}

.ed-class-cap {
  display: flex;
  align-items: center;
  gap: 5px;
  font-family: var(--font-microcopy);
  font-size: var(--main-font-size-5);
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--base-200);
}

.ed-class-ico {
  flex: none;
  width: 12px;
  height: 10px;
  background: currentColor;
  mask: no-repeat center / contain;
}

.ed-tanks {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(92px, 1fr));
  gap: 4px;
}

.ed-tank {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 2px;
  padding: 4px 4px 3px;
  background: var(--black-2-a);
  border: 1px solid var(--base-600);
  corner-shape: bevel;
  border-radius: 6px 0 6px 0;
  cursor: pointer;
  transition:
    background 0.15s,
    border-color 0.15s;
}

.ed-tank:hover {
  background: var(--black-3-a);
  border-color: var(--base-200);
}

.ed-tank.on {
  background: color-mix(in srgb, var(--accent-200) 14%, var(--black-2-a));
  border-color: var(--accent-200);
}

.ed-tank-art {
  display: block;
  width: 100%;
  aspect-ratio: 2 / 1;
  object-fit: contain;
  opacity: 0.75;
}

.ed-tank.on .ed-tank-art,
.ed-tank:hover .ed-tank-art {
  opacity: 1;
}

.ed-tank-name {
  font-family: var(--font-microcopy);
  font-size: var(--main-font-size-5);
  letter-spacing: 0.04em;
  color: var(--text-main);
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ed-tank-you {
  position: absolute;
  top: 3px;
  left: 3px;
  padding: 1px 4px;
  font-family: var(--font-microcopy);
  font-size: var(--main-font-size-5);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--black-1);
  background: var(--accent-200);
  corner-shape: bevel;
  border-radius: 3px 0 3px 0;
}
</style>
