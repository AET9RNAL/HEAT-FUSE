<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { animate } from "motion-v";
import { Dynamics } from "fuse_ui/ui/dynamics.mjs";
import { colors } from "./colors.mjs";
import { DESIGN, bracketHalves, bracketLength, bracketPath, outline, progressSplit, rect, stroke, strokePart } from "./geometry.mjs";

const props = withDefaults(
  defineProps<{
    /** Dispersion over the game's smallest circle: 1 is the smallest size. */
    scale: number;
    reloading?: boolean;
    /** 0..1 */
    progress?: number;
    range?: string;
    cue?: number;
    settings?: Record<string, unknown>;
  }>(),
  { reloading: false, progress: 1, range: "", cue: 0, settings: () => ({}) },
);

const sides = computed(() => String(props.settings.brackets_sides ?? "clockwise"));
const bars = computed(() => props.settings.brackets_bars !== false);

const color = computed(() => colors(props.settings));
const GHOST = { grow: 0.4, from: 0.7, duration: 0.45 };
const K = [0, 1, 2, 3];

type Pt = [number, number];
const pathD = (polys: Pt[][]): string =>
  polys.map((p) => `M${p.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join("L")}Z`).join("");

const half = computed(() => DESIGN.half * Math.max(1, props.scale));
const fullBrackets = computed(() => pathD(K.map((k) => outline(bracketPath(k, half.value), DESIGN.band))));
const track = computed(() => pathD(K.map((k) => outline(bracketPath(k, half.value, DESIGN.trackArm), DESIGN.track))));

const main = computed(() => {
  if (!props.reloading || sides.value === "off") return fullBrackets.value;
  const h = half.value;
  if (sides.value === "middle_out") {
    const s = props.progress * (bracketLength() / 2);
    return pathD(K.flatMap((k) => bracketHalves(k, h).flatMap((p) => strokePart(stroke(p, DESIGN.band), s))));
  }
  const split = progressSplit(props.progress);
  return pathD(K.flatMap((k) => strokePart(stroke(bracketPath(k, h), DESIGN.band), split[k]! * bracketLength())));
});

const markFill = computed(() => props.range || color.value.ink);
const markGlow = computed(() => (props.range ? { filter: `drop-shadow(0 0 ${DESIGN.markGlow}px ${props.range})` } : {}));
const marks = pathD(
  [-1, 1].map((s) => rect(s * DESIGN.markInner, -DESIGN.markHeight / 2, s * DESIGN.markOuter, DESIGN.markHeight / 2) as Pt[]),
);
const markBases = pathD(
  [-1, 1].map((s) => rect(s * DESIGN.markBaseInner, -DESIGN.markBaseHeight / 2, s * DESIGN.markBaseOuter, DESIGN.markBaseHeight / 2) as Pt[]),
);

const barRects = computed(() => {
  const inner = half.value + DESIGN.barGap;
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
    <g v-if="bars" class="bars">
      <rect :x="barRects.left.base" :y="barRects.baseY" :width="DESIGN.barLen" :height="DESIGN.barBase" :fill="color.barBase" />
      <rect :x="barRects.left.work" :y="barRects.progY" :width="barRects.work" :height="DESIGN.barProgress" :fill="color.barWork" />
      <rect :x="barRects.left.prog" :y="barRects.progY" :width="barRects.fill" :height="DESIGN.barProgress" :fill="barRects.color" />
      <rect :x="barRects.right.base" :y="barRects.baseY" :width="DESIGN.barLen" :height="DESIGN.barBase" :fill="color.barBase" />
      <rect :x="barRects.right.work" :y="barRects.progY" :width="barRects.work" :height="DESIGN.barProgress" :fill="color.barWork" />
      <rect :x="barRects.right.prog" :y="barRects.progY" :width="barRects.fill" :height="DESIGN.barProgress" :fill="barRects.color" />
    </g>
    <path class="base" :d="track" :fill="color.track" />
    <path class="main" :d="main" :fill="reloading ? color.reload : color.ink" />
    <path v-if="ghostOn" class="ghost" :d="fullBrackets" :transform="`scale(${ghostScale})`" :opacity="ghostOpacity" :fill="color.ink" />
    <g class="center">
      <rect :x="-DESIGN.backdrop / 2" :y="-DESIGN.backdrop / 2" :width="DESIGN.backdrop" :height="DESIGN.backdrop" :fill="color.backdrop" />
      <rect :x="-DESIGN.dot / 2" :y="-DESIGN.dot / 2" :width="DESIGN.dot" :height="DESIGN.dot" :fill="color.center" />
    </g>
    <g class="range">
      <path :d="markBases" :fill="markFill" fill-opacity="0.5" />
      <path :d="marks" :fill="markFill" :style="markGlow" />
    </g>
  </g>
</template>
