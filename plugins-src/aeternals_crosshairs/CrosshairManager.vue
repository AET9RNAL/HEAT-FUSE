<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, type Component } from "vue";
import { motion } from "motion-v";
import { Dynamics } from "fuse_ui/ui/dynamics.mjs";
import Icons from "fuse_ui/ui/Icons.vue";
import eSegmented from "fuse_ui/ui/eSegmented.vue";
import eSwitch from "fuse_ui/ui/eSwitch.vue";
import "fuse_ui/ui/tokens.css";
import Brackets from "./reticles/brackets/Brackets.vue";
import Ring from "./reticles/ring/Ring.vue";
import Triangle from "./reticles/triangle/Triangle.vue";

/**
 * Reticle renderers by id (reticles/index.mjs). Each one draws an SVG group around the aim point in game px and
 * takes the same props: scale, reloading, progress, range (colour, "" for none), cue (count) and settings.
 */
const RENDERERS: Record<string, Component> = { triangle: Triangle, brackets: Brackets, ring: Ring };
/** Size of a reticle in its frame. */
const THUMB = 0.42;

interface Style {
  reticle: string;
  /** The reticle draws in the game HUD, in place of the game's default aim. */
  inGame: boolean;
  settings: Record<string, unknown>;
  /** Every reticle's settings by id. */
  all: Record<string, Record<string, unknown>>;
  /** When the ghost plays: "dispersion" or "reload". */
  ghostOn: string;
  aimedSound: boolean;
  /** Range mark colours for stages 1 effective, 2 falloff, 3 out. */
  range: [string, string, string];
}
interface Live {
  /** A default-aim weapon, or the scripted preview: the reticle follows it. */
  active: boolean;
  /** The weapon keeps the game's own aim. */
  own: boolean;
  /** The scripted cannon of calibration and interactive mode. */
  preview: boolean;
  scale: number;
  reloading: boolean;
  progress: number;
  range: number;
  distance: number;
}
interface ReticleControl {
  type: string;
  key: string;
  label: string;
  options?: { value: string; label: string }[];
}
interface ReticleEntry {
  id: string;
  label: string;
  controls: ReticleControl[];
}

const props = defineProps<{
  data: Partial<{
    style: Style;
    live: Live;
    cue: { seq: number };
    messages: Record<string, string>;
    reticles: ReticleEntry[];
    /** The combo bound now to show and hide the manager, "" when none. */
    toggleKey: string;
  }>;
  interactive?: boolean;
  emitAction?: (action: string, payload?: unknown) => void;
}>();

/** Messages come from the plugin in the resolved locale. A missing key shows as its path. */
function t(key: string): string {
  return props.data?.messages?.[key] ?? key;
}

const style = computed<Style>(() => ({
  reticle: "triangle",
  inGame: true,
  settings: {},
  all: {},
  ghostOn: "dispersion",
  aimedSound: true,
  range: ["#71CE71", "#FFDB8C", "#FF6A62"],
  ...(props.data?.style ?? {}),
}));
const live = computed<Live>(() => ({
  active: false,
  own: false,
  preview: false,
  scale: 1,
  reloading: false,
  progress: 1,
  range: 0,
  distance: 0,
  ...(props.data?.live ?? {}),
}));
/** Idle: the reticle at rest. */
const shown = computed(() => (live.value.active ? live.value : { ...live.value, scale: 1, reloading: false, progress: 1, range: 0 }));
const status = computed(() => (live.value.preview ? "preview" : live.value.active ? "live" : live.value.own ? "gameAim" : "idle"));
// Status chip colours as values: motion tweens colours, not CSS variables (accent-200, base-600, base-200, text-main).
const STATUS_LOOK: Record<string, { borderColor: string; color: string }> = {
  live: { borderColor: "rgba(143, 255, 184, 1)", color: "rgba(143, 255, 184, 1)" },
  preview: { borderColor: "rgba(179, 179, 179, 1)", color: "rgba(242, 242, 242, 1)" },
  gameAim: { borderColor: "rgba(82, 82, 82, 1)", color: "rgba(179, 179, 179, 1)" },
  idle: { borderColor: "rgba(82, 82, 82, 1)", color: "rgba(179, 179, 179, 1)" },
};

const reticles = computed(() => props.data?.reticles ?? []);
const renderer = computed(() => RENDERERS[style.value.reticle] ?? Triangle);
// The rows show the quick settings. Colours stay in the App panel and the inspector.
const reticleControls = computed(() =>
  (reticles.value.find((r) => r.id === style.value.reticle)?.controls ?? []).filter((c) => c.type === "segmented" || c.type === "switch"),
);
/** A frame for each reticle, at rest and without its side bars, so the shapes read at a small size. */
const gallery = computed(() =>
  reticles.value.map((r) => ({
    id: r.id,
    label: r.label,
    renderer: RENDERERS[r.id] ?? Triangle,
    settings: { ...(style.value.all[r.id] ?? {}), [`${r.id}_bars`]: false },
    selected: r.id === style.value.reticle,
  })),
);
const selectedLabel = computed(() => reticles.value.find((r) => r.id === style.value.reticle)?.label ?? "");
/** The selected reticle draws in the game, unless "In game" is off. */
const selectedTag = computed(() => (style.value.inGame ? t("manager.inGame") : t("manager.previewOnly")));
// Frame and tag colours as values: motion tweens colours, not CSS variables (accent-200, base-600, base-200).
const FRAME_ON = { borderColor: "rgba(143, 255, 184, 1)", backgroundColor: "rgba(143, 255, 184, 0.08)" };
const FRAME_OFF = { borderColor: "rgba(82, 82, 82, 1)", backgroundColor: "rgba(0, 0, 0, 0)" };
const TAG_COLOR = computed(() => (style.value.inGame ? "rgba(143, 255, 184, 1)" : "rgba(179, 179, 179, 1)"));

function pick(id: string): void {
  if (id !== style.value.reticle) set("reticle", id);
}
const ghostOptions = computed(() => [
  { value: "dispersion", label: t("config.ghostDispersion") },
  { value: "reload", label: t("config.ghostReload") },
]);

const dpr = ref(window.devicePixelRatio || 1);
const onResize = () => (dpr.value = window.devicePixelRatio || 1);
onMounted(() => window.addEventListener("resize", onResize));
onBeforeUnmount(() => window.removeEventListener("resize", onResize));
const previewT = computed(() => `scale(${1 / dpr.value})`);

const STAGES = ["effective", "falloff", "out"] as const;
const stages = computed(() =>
  STAGES.map((key, i) => ({ key, label: t(`config.${key}`), color: style.value.range[i]!, on: shown.value.range === i + 1 })),
);
const rangeColor = computed(() => (shown.value.range > 0 ? style.value.range[shown.value.range - 1] ?? "" : ""));

function padded(value: number, width: number) {
  const digits = String(Math.max(0, Math.trunc(value)));
  return { dim: "0".repeat(Math.max(0, width - digits.length)), lit: digits };
}
const reloadPct = computed(() => padded(Math.round(shown.value.progress * 100), 3));
const distance = computed(() => padded(shown.value.distance, 4));

function set(key: string, value: unknown): void {
  props.emitAction?.("set", { key, value });
}

/** "ctrl+alt+x" as "Ctrl+Alt+X". */
const toggleHint = computed(() => {
  const combo = props.data?.toggleKey ?? "";
  if (!combo) return "";
  const keys = combo
    .split("+")
    .map((k) => (k.length === 1 ? k.toUpperCase() : k.charAt(0).toUpperCase() + k.slice(1)))
    .join("+");
  return t("manager.toggleHint").replace("{key}", keys);
});
</script>

<template>
  <div class="xm-overlay">
    <div class="xm">
      <header class="head">
        <span class="title">{{ t("manager.title") }}</span>
        <span class="rule" />
        <motion.span class="status" :initial="false" :animate="STATUS_LOOK[status]" :transition="Dynamics.quick">
          <span class="dot" />{{ t(`manager.${status}`) }}
        </motion.span>
        <button type="button" class="close" :aria-label="t('manager.close')" @click="emitAction?.('close')">
          <Icons kind="cross" />
        </button>
      </header>

      <div class="stage">
        <motion.div
          :key="style.reticle"
          class="preview-wrap"
          :initial="{ opacity: 0, scale: 0.92 }"
          :animate="{ opacity: 1, scale: 1 }"
          :transition="Dynamics.quick"
        >
          <svg class="preview" width="1" height="1" overflow="visible" aria-hidden="true">
            <g :transform="previewT" :opacity="live.active ? 1 : 0.45">
              <component
                :is="renderer"
                :scale="shown.scale"
                :reloading="shown.reloading"
                :progress="shown.progress"
                :range="rangeColor"
                :cue="data.cue ? data.cue.seq : 0"
                :settings="style.settings"
              />
            </g>
          </svg>
        </motion.div>
        <div class="stage-name">
          <span class="stage-title">{{ selectedLabel }}</span>
          <motion.span class="tag" :initial="false" :animate="{ color: TAG_COLOR, borderColor: TAG_COLOR }" :transition="Dynamics.quick">
            {{ selectedTag }}
          </motion.span>
        </div>
        <span class="bracket tl" aria-hidden="true" />
        <span class="bracket br" aria-hidden="true" />

        <div class="readout">
          <span class="cell">
            <span class="cell-label">{{ t("manager.reload") }}</span>
            <motion.span
              :key="shown.reloading ? 'reload' : 'ready'"
              class="cell-value"
              :class="{ ready: live.active && !shown.reloading }"
              :initial="{ opacity: 0, y: 3 }"
              :animate="{ opacity: 1, y: 0 }"
              :transition="Dynamics.quick"
            >
              <template v-if="shown.reloading"><i>{{ reloadPct.dim }}</i>{{ reloadPct.lit }}%</template>
              <template v-else>{{ t("manager.ready") }}</template>
            </motion.span>
          </span>
          <span class="cell">
            <span class="cell-label">{{ t("manager.range") }}</span>
            <span class="cell-value">
              <template v-if="shown.range > 0"><i>{{ distance.dim }}</i>{{ distance.lit }} {{ t("manager.metres") }}</template>
              <template v-else>{{ t("manager.noTarget") }}</template>
            </span>
          </span>
        </div>
      </div>

      <div class="legend">
        <motion.span
          v-for="s in stages"
          :key="s.key"
          class="chip"
          :initial="false"
          :animate="{
            borderColor: s.on ? s.color : 'rgba(82, 82, 82, 1)',
            backgroundColor: s.on ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0)',
            color: s.on ? 'rgba(242, 242, 242, 1)' : 'rgba(179, 179, 179, 1)',
          }"
          :transition="Dynamics.quick"
        >
          <span class="swatch" :style="{ background: s.color, boxShadow: s.on ? `0 0 4px ${s.color}` : 'none' }" />
          <span class="chip-label">{{ s.label }}</span>
        </motion.span>
      </div>

      <section class="gallery" :aria-label="t('manager.reticles')">
        <span class="section-label">{{ t("manager.reticles") }}</span>
        <div class="frames">
          <motion.button
            v-for="g in gallery"
            :key="g.id"
            type="button"
            class="frame"
            :class="{ on: g.selected }"
            :disabled="!interactive"
            :aria-pressed="g.selected"
            :initial="false"
            :animate="g.selected ? FRAME_ON : FRAME_OFF"
            :transition="Dynamics.quick"
            @click="pick(g.id)"
          >
            <svg class="thumb" width="1" height="1" overflow="visible" aria-hidden="true">
              <g :transform="`scale(${THUMB})`">
                <component :is="g.renderer" :scale="1" :settings="g.settings" />
              </g>
            </svg>
            <span class="frame-foot">
              <span class="frame-name">{{ g.label }}</span>
              <motion.span
                v-if="g.selected"
                class="frame-tag"
                :initial="{ opacity: 0, x: -4 }"
                :animate="{ opacity: 1, x: 0, color: TAG_COLOR }"
                :transition="Dynamics.quick"
              >
                {{ selectedTag }}
              </motion.span>
            </span>
          </motion.button>
        </div>
      </section>

      <div class="rows" :class="{ locked: !interactive }">
        <div class="row">
          <span class="row-label">{{ t("config.inGame") }}</span>
          <eSwitch :model-value="style.inGame" :disabled="!interactive" @update:model-value="set('in_game', $event)" />
        </div>
        <div v-for="c in reticleControls" :key="c.key" class="row">
          <span class="row-label">{{ c.label }}</span>
          <eSegmented
            v-if="c.type === 'segmented'"
            class="seg"
            :options="c.options || []"
            :model-value="String(style.settings[c.key])"
            @update:model-value="set(c.key, $event)"
          />
          <eSwitch
            v-else-if="c.type === 'switch'"
            :model-value="style.settings[c.key] !== false"
            :disabled="!interactive"
            @update:model-value="set(c.key, $event)"
          />
        </div>
        <div class="row">
          <span class="row-label">{{ t("config.ghost") }}</span>
          <eSegmented class="seg" :options="ghostOptions" :model-value="style.ghostOn" @update:model-value="set('ghost_on', $event)" />
        </div>
        <div class="row">
          <span class="row-label">{{ t("config.aimedSound") }}</span>
          <eSwitch :model-value="style.aimedSound" :disabled="!interactive" @update:model-value="set('aimed_sound', $event)" />
        </div>
      </div>

      <footer v-if="toggleHint || !interactive" class="foot">
        <span class="hint">{{ toggleHint }}</span>
        <span v-if="!interactive" class="hint">{{ t("manager.editHint") }}</span>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.xm-overlay {
  width: 100%;
  height: 100%;
}

.xm {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  width: 100%;
  max-height: 100%;
  padding: var(--space-2);
  box-sizing: border-box;
  overflow: hidden;
  background: var(--black-2-a);
  border: 1px solid var(--base-600);
  corner-shape: bevel;
  border-radius: 6px 0 6px 0;
}

.head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}

.title {
  flex: none;
  font-family: var(--font-primary);
  font-size: var(--main-font-size-3);
  font-weight: var(--font-weight-2);
  line-height: 1;
  letter-spacing: 0.06em;
  color: var(--text-main);
  text-transform: uppercase;
  white-space: nowrap;
}

.rule {
  flex: 1 1 auto;
  height: 1px;
  background: var(--base-600);
}

.status {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  height: 18px;
  padding: 0 var(--space-2);
  box-sizing: border-box;
  background: var(--black-1-a);
  border: 1px solid var(--base-600);
  font-family: var(--font-microcopy);
  font-size: var(--secondary-font-size-4);
  line-height: 1;
  text-transform: uppercase;
  white-space: nowrap;
  corner-shape: bevel;
  border-radius: 6px 0 6px 0;
}

.dot {
  width: 4px;
  height: 4px;
  background: currentColor;
  transform: rotate(45deg);
}

/* The reticle at its in-game size: the plate clips a wide spread. */
.stage {
  position: relative;
  flex: none;
  height: 150px;
  overflow: hidden;
  background: repeating-linear-gradient(135deg, rgba(255, 255, 255, 0.025) 0 1px, transparent 1px 7px), var(--black-1-a);
  border: 1px solid var(--base-600);
  corner-shape: bevel;
  border-radius: 0 0 6px 0;
}

/* Grows from the aim point when you pick another reticle. */
.preview-wrap {
  position: absolute;
  inset: 0;
  transform-origin: 50% 58%;
}

/* The svg origin is the aim point: room above for the reticle top and the aimed ghost. */
.preview {
  position: absolute;
  left: 50%;
  top: 58%;
  overflow: visible;
}

/* The selected reticle, and whether it draws in the game. */
.stage-name {
  position: absolute;
  top: 6px;
  left: 14px;
  display: flex;
  align-items: center;
  gap: var(--space-1);
}

.stage-title {
  font-family: var(--font-primary);
  font-size: var(--secondary-font-size-4);
  font-weight: var(--font-weight-2);
  line-height: 1;
  letter-spacing: 0.06em;
  color: var(--text-main);
  text-transform: uppercase;
  white-space: nowrap;
}

.tag {
  display: inline-flex;
  align-items: center;
  height: 14px;
  padding: 0 var(--space-1);
  box-sizing: border-box;
  border: 1px solid var(--base-600);
  font-family: var(--font-microcopy);
  font-size: 9px;
  line-height: 1;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  white-space: nowrap;
  corner-shape: bevel;
  border-radius: 4px 0 4px 0;
}

.gallery {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.section-label {
  font-family: var(--font-microcopy);
  font-size: 10px;
  line-height: 1;
  letter-spacing: 0.1em;
  color: var(--text-muted);
  text-transform: uppercase;
}

.frames {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-1);
}

.frame {
  position: relative;
  height: 70px;
  margin: 0;
  padding: 0;
  overflow: hidden;
  box-sizing: border-box;
  background: transparent;
  border: 1px solid var(--base-600);
  cursor: pointer;
  corner-shape: bevel;
  border-radius: 6px 0 6px 0;
}

.frame:disabled {
  cursor: default;
}

.frame:not(.on):not(:disabled):hover .frame-name {
  color: var(--text-main);
}

/* The reticle's centre in the frame. */
.thumb {
  position: absolute;
  left: 50%;
  top: 26px;
  overflow: visible;
  pointer-events: none;
}

.frame-foot {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-1);
  padding: 3px 6px;
}

.frame-name,
.frame-tag {
  min-width: 0;
  overflow: hidden;
  font-family: var(--font-microcopy);
  font-size: 9px;
  line-height: 1;
  letter-spacing: 0.1em;
  text-overflow: ellipsis;
  text-transform: uppercase;
  white-space: nowrap;
}

.frame-name {
  color: var(--text-muted);
}

.frame.on .frame-name {
  color: var(--text-main);
}

.bracket {
  position: absolute;
  width: 6px;
  height: 6px;
  border-color: color-mix(in srgb, var(--base-200) 40%, transparent);
  border-style: solid;
  border-width: 0;
}

.bracket.tl {
  top: 4px;
  left: 4px;
  border-top-width: 1px;
  border-left-width: 1px;
}

.bracket.br {
  right: 4px;
  bottom: 4px;
  border-right-width: 1px;
  border-bottom-width: 1px;
}

.readout {
  position: absolute;
  left: 0;
  bottom: 0;
  display: flex;
  background: var(--black-1-a);
  border-top: 1px solid var(--base-600);
  border-right: 1px solid var(--base-600);
  corner-shape: bevel;
  border-radius: 0 5px 0 0;
}

.cell {
  display: flex;
  align-items: baseline;
  gap: var(--space-1);
  padding: 3px var(--space-2);
  border-right: 1px solid var(--base-600);
}

.cell:last-child {
  border-right: none;
}

.cell-label,
.row-label,
.chip-label,
.hint {
  font-family: var(--font-microcopy);
  font-size: 10px;
  line-height: 1;
  letter-spacing: 0.1em;
  color: var(--text-muted);
  text-transform: uppercase;
  white-space: nowrap;
}

.cell-value {
  display: inline-block;
  font-family: var(--font-microcopy);
  font-size: var(--secondary-font-size-4);
  line-height: 1;
  color: var(--text-main);
  font-variant-numeric: tabular-nums;
  text-transform: uppercase;
  white-space: nowrap;
}

.cell-value i {
  font-style: normal;
  color: var(--base-600);
}

.cell-value.ready {
  color: var(--accent-200);
}

.legend {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-1);
}

.chip {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  min-width: 0;
  height: 20px;
  padding: 0 var(--space-1);
  box-sizing: border-box;
  border: 1px solid var(--base-600);
  corner-shape: bevel;
  border-radius: 4px 0 4px 0;
}

.swatch {
  flex: none;
  width: 8px;
  height: 3px;
}

.chip-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  color: inherit;
}

.rows {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.rows.locked {
  opacity: 0.6;
}

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  min-height: 26px;
  padding: 0 0 0 var(--space-2);
  border-left: 2px solid var(--base-600);
}

.seg {
  flex: 0 1 196px;
  min-width: 0;
}

.foot {
  display: flex;
  justify-content: space-between;
  gap: var(--space-2);
}

.close {
  flex: none;
  display: flex;
  margin: 0;
  padding: 0;
  border: none;
  background: none;
  color: var(--text-main);
  cursor: pointer;
}
</style>
