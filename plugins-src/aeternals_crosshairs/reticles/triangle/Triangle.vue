<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { animate } from "motion-v";
import { Dynamics } from "fuse_ui/ui/dynamics.mjs";
import { colors } from "./colors.mjs";
import { DESIGN, bars as bands, barPart, barSlab, halfWidth, notchedSide, outset, progressSplit, pts, solid } from "./geometry.mjs";

// The props every reticle takes (see CrosshairManager.vue).
const props = withDefaults(
  defineProps<{
    /** Dispersion over the game's smallest circle: 1 is the smallest size. */
    scale: number;
    reloading?: boolean;
    /** 0..1 */
    progress?: number;
    /** Colour of the range marks, "" with no target. */
    range?: string;
    /** Cue count: each change plays the ghost. */
    cue?: number;
    /** This reticle's settings by config key. */
    settings?: Record<string, unknown>;
  }>(),
  { reloading: false, progress: 1, range: "", cue: 0, settings: () => ({}) },
);

/** Reload on the sides: "clockwise", "middle_out" or "off". */
const sides = computed(() => String(props.settings.triangle_sides ?? "clockwise"));
/** Reload on the side bars. Off hides them. */
const bars = computed(() => props.settings.triangle_bars !== false);

const color = computed(() => colors(props.settings));
const GHOST = { grow: 0.4, from: 0.7, duration: 0.45 };
/** The reload bars sit 0.23 px above the triangle centre. */
const BAR_Y = -0.23;

const r = computed(() => DESIGN.r * Math.max(1, props.scale));
const sideShapes = computed(() => [0, 1, 2].map((k) => notchedSide(k, r.value, DESIGN.band, DESIGN.gap)));
const track = computed(() => bands(r.value, DESIGN.track, DESIGN.gap).map((p) => pts(p)));
const fullSides = computed(() => sideShapes.value.map((s) => pts(s.side)));

const main = computed(() => {
  if (!props.reloading || sides.value === "off") return fullSides.value;
  if (sides.value === "middle_out") return sideShapes.value.map((s, k) => pts(barSlab(s.side, k, r.value, props.progress)));
  const split = progressSplit(props.progress);
  return sideShapes.value.map((s, k) => pts(barPart(s.side, k, r.value, split[k]!)));
});

const marks = computed(() => sideShapes.value.map((s) => pts(s.range)));
const markFill = computed(() => props.range || color.value.ink);
// A glow in the mark colour.
const markGlow = computed(() => (props.range ? { filter: `drop-shadow(0 0 2px ${props.range})` } : {}));

const barRects = computed(() => {
  // The same gap from the triangle at any size.
  const inner = halfWidth(r.value) + DESIGN.barGap;
  const len = DESIGN.barLen;
  const inset = DESIGN.barInset;
  const fill = (len - 2 * inset) * (props.reloading ? Math.max(0, Math.min(1, props.progress)) : 1);
  const y = BAR_Y;
  return {
    baseY: y - DESIGN.barBase / 2,
    progY: y - DESIGN.barProgress / 2,
    // Half the fill colour while the gun reloads.
    color: props.reloading ? color.value.barReloading : color.value.bar,
    // Both bars fill from their outer end toward the reticle, over a track of the full fill length.
    left: { base: -inner - len, work: -inner - len + inset, prog: -inner - len + inset },
    right: { base: inner, work: inner + inset, prog: inner + len - inset - fill },
    work: len - 2 * inset,
    fill,
  };
});

const centerPoly = pts(solid(DESIGN.center));
const centerStroke = pts(outset(DESIGN.center, DESIGN.centerStroke));

// The ghost
const ghostOn = ref(false);
const ghostScale = ref(1);
const ghostOpacity = ref(0);
let ghostAnim: { stop: () => void } | null = null;
watch(
  () => props.cue,
  (now, before) => {
    if (!now || now === before) return;
    ghostAnim?.stop();
    ghostOn.value = true;
    ghostAnim = animate(0, 1, {
      duration: GHOST.duration,
      ease: Dynamics.circOut.ease,
      onUpdate: (v: number) => {
        ghostScale.value = 1 + GHOST.grow * v;
        ghostOpacity.value = GHOST.from * (1 - v);
      },
      onComplete: () => (ghostOn.value = false),
    });
  },
);
onBeforeUnmount(() => ghostAnim?.stop());
</script>

<template>
  <g class="reticle">
    <g class="base" :fill="color.track">
      <polygon v-for="(p, i) in track" :key="`b${i}`" :points="p" />
    </g>
    <g class="main" :fill="reloading ? color.reload : color.ink">
      <polygon v-for="(p, i) in main" :key="`m${i}`" :points="p" />
    </g>
    <g class="range" :style="markGlow">
      <polygon v-for="(p, i) in marks" :key="`r${i}`" :points="p" :fill="markFill" />
    </g>
    <g v-if="ghostOn" class="ghost" :transform="`scale(${ghostScale})`" :opacity="ghostOpacity" :fill="color.ink">
      <polygon v-for="(p, i) in fullSides" :key="`g${i}`" :points="p" />
    </g>
    <g v-if="bars" class="bars">
      <rect :x="barRects.left.base" :y="barRects.baseY" :width="DESIGN.barLen" :height="DESIGN.barBase" :fill="color.barBase" />
      <rect :x="barRects.left.work" :y="barRects.progY" :width="barRects.work" :height="DESIGN.barProgress" :fill="color.barWork" />
      <rect :x="barRects.left.prog" :y="barRects.progY" :width="barRects.fill" :height="DESIGN.barProgress" :fill="barRects.color" />
      <rect :x="barRects.right.base" :y="barRects.baseY" :width="DESIGN.barLen" :height="DESIGN.barBase" :fill="color.barBase" />
      <rect :x="barRects.right.work" :y="barRects.progY" :width="barRects.work" :height="DESIGN.barProgress" :fill="color.barWork" />
      <rect :x="barRects.right.prog" :y="barRects.progY" :width="barRects.fill" :height="DESIGN.barProgress" :fill="barRects.color" />
    </g>
    <g class="center">
      <polygon :points="centerStroke" :fill="color.centerStroke" />
      <polygon :points="centerPoly" :fill="color.center" />
    </g>
  </g>
</template>
