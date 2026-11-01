<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { animate } from "motion-v";
import { Dynamics } from "fuse_ui/ui/dynamics.mjs";
import { colors } from "./colors.mjs";
import { DESIGN, arcPart, bandRadii, progressSplit, ringPath, sectorPath } from "./geometry.mjs";

// The props every reticle takes (see CrosshairManager.vue).
const props = withDefaults(
  defineProps<{
    scale: number;
    reloading?: boolean;
    progress?: number;
    range?: string;
    cue?: number;
    settings?: Record<string, unknown>;
  }>(),
  { reloading: false, progress: 1, range: "", cue: 0, settings: () => ({}) },
);

/** Reload on the arcs: "clockwise", "middle_out" or "off". */
const sides = computed(() => String(props.settings.ring_sides ?? "clockwise"));
/** Reload on the side bars. Off hides them. */
const bars = computed(() => props.settings.ring_bars !== false);

const color = computed(() => colors(props.settings));
const GHOST = { grow: 0.4, from: 0.7, duration: 0.45 };

const r = computed(() => DESIGN.r * Math.max(1, props.scale));
const radii = computed(() => bandRadii(r.value) as [number, number]);
const basePath = computed(() => ringPath(radii.value[0], radii.value[1]));
const rimPath = computed(() => ringPath(radii.value[1] - DESIGN.rim, radii.value[1]));
const arcPath = (ranges: number[][]): string => ranges.map(([a0, a1]) => sectorPath(a0, a1, radii.value[0], radii.value[1])).join("");
const fullArcs = computed(() => arcPath(DESIGN.arcs.map((m: number) => [m - DESIGN.arcWidth / 2, m + DESIGN.arcWidth / 2])));

const main = computed(() => {
  if (!props.reloading || sides.value === "off") return fullArcs.value;
  const middleOut = sides.value === "middle_out";
  const split = progressSplit(props.progress);
  return arcPath([0, 1, 2].flatMap((k) => arcPart(k, middleOut ? props.progress : split[k]!, middleOut)));
});

const marks = computed(() => arcPath(DESIGN.marks.map((m: number) => [m - DESIGN.markWidth / 2, m + DESIGN.markWidth / 2])));
const markFill = computed(() => props.range || color.value.ink);
// A glow in the mark colour.
const markGlow = computed(() => (props.range ? { filter: `drop-shadow(0 0 2px ${props.range})` } : {}));

const barRects = computed(() => {
  // The same gap from the ring at any size.
  const inner = r.value + DESIGN.barGap;
  const len = DESIGN.barLen;
  const inset = DESIGN.barInset;
  const fill = (len - 2 * inset) * (props.reloading ? Math.max(0, Math.min(1, props.progress)) : 1);
  return {
    baseY: -DESIGN.barBase / 2,
    progY: -DESIGN.barProgress / 2,
    // Half the fill colour while the gun reloads.
    color: props.reloading ? color.value.barReloading : color.value.bar,
    // Both bars fill from their outer end toward the reticle, over a track of the full fill length.
    left: { base: -inner - len, work: -inner - len + inset, prog: -inner - len + inset },
    right: { base: inner, work: inner + inset, prog: inner + len - inset - fill },
    work: len - 2 * inset,
    fill,
  };
});

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
    <path class="base" :d="basePath" fill-rule="evenodd" :fill="color.base" />
    <path class="rim" :d="rimPath" fill-rule="evenodd" :fill="color.rim" />
    <path class="main" :d="main" :fill="reloading ? color.reload : color.ink" />
    <path class="range" :d="marks" :fill="markFill" :style="markGlow" />
    <path v-if="ghostOn" class="ghost" :d="fullArcs" :transform="`scale(${ghostScale})`" :opacity="ghostOpacity" :fill="color.ink" />
    <g class="center">
      <circle :r="DESIGN.backdrop / 2" :fill="color.backdrop" />
      <circle :r="DESIGN.dot / 2" :fill="color.center" />
    </g>
    <g v-if="bars" class="bars">
      <rect :x="barRects.left.base" :y="barRects.baseY" :width="DESIGN.barLen" :height="DESIGN.barBase" :fill="color.barBase" />
      <rect :x="barRects.left.work" :y="barRects.progY" :width="barRects.work" :height="DESIGN.barProgress" :fill="color.barWork" />
      <rect :x="barRects.left.prog" :y="barRects.progY" :width="barRects.fill" :height="DESIGN.barProgress" :fill="barRects.color" />
      <rect :x="barRects.right.base" :y="barRects.baseY" :width="DESIGN.barLen" :height="DESIGN.barBase" :fill="color.barBase" />
      <rect :x="barRects.right.work" :y="barRects.progY" :width="barRects.work" :height="DESIGN.barProgress" :fill="color.barWork" />
      <rect :x="barRects.right.prog" :y="barRects.progY" :width="barRects.fill" :height="DESIGN.barProgress" :fill="barRects.color" />
    </g>
  </g>
</template>
