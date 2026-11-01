<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { animate, motion, useMotionValue, useMotionValueEvent, useSpring, useVelocity } from "motion-v";
import { Dynamics } from "fuse_ui/ui/dynamics.mjs";

const props = defineProps<{
  sign: string;
  status: number;
  progress: number;
  w: number;
  colors?: { ally?: string; enemy?: string; contested?: string; neutral?: string };
  /** The game's label icon path, for example during a bomb event. */
  icon?: string;
  iconBlink?: boolean;
  assetBase?: string;
}>();

const LABEL = "#F8F7F6";

const CONFLICT = 16;
const SCORING = 4096;
const MASKED = 16 | 2048 | 4096 | 8192;
const FRAME: Record<number, "ally" | "enemy"> = { 64: "ally", 32: "ally", 128: "ally", 512: "enemy", 256: "enemy", 1024: "enemy" };
const FILL: Record<number, "ally" | "enemy"> = { ...FRAME, 128: "enemy", 1024: "ally" };

const palette = computed(() => ({
  ally: props.colors?.ally ?? "#7ABFDF",
  enemy: props.colors?.enemy ?? "#FF6D46",
  contested: props.colors?.contested ?? "#FFD85C",
  neutral: props.colors?.neutral ?? "#D0CBC4",
}));

const HEX = "M1 12 L25 1 L49 12 L49 64 L25 75 L1 64 Z";
const clipId = `mm-cp-${Math.random().toString(36).slice(2, 9)}`;
const maskId = `${clipId}-icon`;
const fillClipId = `${clipId}-fill`;
const sweepGradId = `${clipId}-sweep`;

const ACTIVATING = 4;
const CLEARING = 8;
const BOMB_EVENT = 2048;
const RADIATED = 8192;
/** The game radar's lock colour. */
const LOCK = "#172026";

const badge = computed(() => {
  const s = props.status;
  const c = palette.value;
  const icon = props.icon ?? "";
  if (s & RADIATED) return { file: "radiated", color: c.enemy, blink: false };
  // Clearing is the HUD's "bombing" status.
  if (s & CLEARING) return { file: "clearing", color: c.enemy, blink: false };
  if (/bomb/i.test(icon) || s & BOMB_EVENT) {
    const color = /ally/i.test(icon) ? c.ally : /enemy/i.test(icon) ? c.enemy : LABEL;
    return { file: "bomb", color, blink: icon ? Boolean(props.iconBlink) : true };
  }
  if (s === ACTIVATING) return { file: "lock", color: LOCK, blink: false };
  return null;
});
const badgeUrl = computed(() => (badge.value ? `${props.assetBase ?? ""}/assets/icons/base/${badge.value.file}.png` : ""));
const BADGE_BLINK = { opacity: [1, 0.25, 1] };

const look = computed(() => {
  const s = props.status;
  const c = palette.value;
  const side = s & ~MASKED;
  const frameSide = FRAME[side];
  const fillSide = FILL[side];
  if (s & CONFLICT) {
    const frame = s & SCORING ? (frameSide ? c[frameSide] : LABEL) : c.contested;
    return { frame, fill: c.contested, conflict: true };
  }
  return { frame: frameSide ? c[frameSide] : c.neutral, fill: fillSide ? c[fillSide] : null, conflict: false };
});

const p = computed(() => Math.max(0, Math.min(1, props.progress)));
const transform = computed(() => `scale(${(props.w / 50).toFixed(4)}) translate(-25 -38)`);
const BLINK = { filter: ["brightness(1)", "brightness(1.7)", "brightness(1)"] };
const STILL = { filter: "brightness(1)" };

// ---- Fill and sweep: the Match Progress Overhaul pattern, turned vertical ----

/** Same spring as MPH's bars: progress arrives at about 10 Hz, the spring fills the frames between. */
const target = useMotionValue(p.value);
const fill = useSpring(target, { stiffness: 140, damping: 24, mass: 0.6 });
const fillY = ref(76 * (1 - p.value));
const bright = ref(1);
useMotionValueEvent(fill, "change", (v: number) => (fillY.value = 76 * (1 - Math.max(0, Math.min(1, v)))));
// A fast change glows brighter, as in MPH.
useMotionValueEvent(useVelocity(fill), "change", (v: number) => (bright.value = 1 + Math.min(Math.abs(v) * 0.45, 0.45)));

/** Band centre in % of the hex height (0 top, 100 bottom), and its opacity. */
const sweepPos = useMotionValue(130);
const sweepOpacity = useMotionValue(0);
const sweepY = ref(0);
const sweepAlpha = ref(0);
const SWEEP_H = 0.26 * 76;
useMotionValueEvent(sweepPos, "change", (v: number) => (sweepY.value = (76 * v) / 100 - SWEEP_H / 2));
useMotionValueEvent(sweepOpacity, "change", (v: number) => (sweepAlpha.value = v));

/** A jump this big is an owner change or a reset, not capture or decay. */
const SWEEP_MAX_STEP = 0.35;
const SWEEP_S = 0.65;
let sweepUntil = 0;
/** One band through the fill: upward while capturing, downward while it decays. */
function sweep(dir: "up" | "down"): void {
  const now = performance.now();
  if (now < sweepUntil) return;
  sweepUntil = now + SWEEP_S * 1000;
  const [from, to] = dir === "up" ? [130, -30] : [-30, 130];
  sweepPos.set(from);
  sweepOpacity.set(0.55);
  animate(sweepPos, to, { duration: SWEEP_S, ease: "easeOut" });
  animate(sweepOpacity, 0, { duration: SWEEP_S, ease: "easeIn" });
}

watch(p, (now, before) => {
  const d = now - before;
  if (Math.abs(d) > SWEEP_MAX_STEP) {
    target.jump(now);
    fill.jump(now);
    return;
  }
  target.set(now);
  if (Math.abs(d) >= 0.002) sweep(d > 0 ? "up" : "down");
});
</script>

<template>
  <g :transform="transform">
    <defs>
      <clipPath :id="clipId">
        <path :d="HEX" />
      </clipPath>
      <clipPath :id="fillClipId">
        <rect x="0" :y="fillY" width="50" height="76" />
      </clipPath>
      <linearGradient :id="sweepGradId" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#FFFFFF" stop-opacity="0" />
        <stop offset="0.5" stop-color="#FFFFFF" stop-opacity="0.6" />
        <stop offset="1" stop-color="#FFFFFF" stop-opacity="0" />
      </linearGradient>
    </defs>
    <motion.g
      :animate="look.conflict ? BLINK : STILL"
      :transition="look.conflict ? { duration: 1.5, repeat: Infinity, ease: 'easeInOut' } : Dynamics.quick"
    >
      <g :clip-path="`url(#${clipId})`">
        <rect x="0" y="0" width="50" height="76" fill="rgb(83, 83, 83)" fill-opacity="0.6" />
        <g v-if="look.fill" :clip-path="`url(#${fillClipId})`" :style="{ filter: `brightness(${bright})` }">
          <rect x="0" y="0" width="50" height="76" :fill="look.fill" fill-opacity="0.6" />
          <rect
            x="0"
            :y="sweepY"
            width="50"
            :height="SWEEP_H"
            :fill="`url(#${sweepGradId})`"
            :opacity="sweepAlpha"
            class="cp-sweep"
          />
        </g>
      </g>
      <path :d="HEX" fill="none" :stroke="look.frame" stroke-width="3" stroke-linejoin="round" />
    </motion.g>
    <template v-if="badge">
      <mask :id="maskId" style="mask-type: alpha" maskUnits="userSpaceOnUse" x="10" y="23" width="30" height="30">
        <image :href="badgeUrl" x="10" y="23" width="30" height="30" preserveAspectRatio="xMidYMid meet" />
      </mask>
      <motion.rect
        x="10"
        y="23"
        width="30"
        height="30"
        :fill="badge.color"
        :mask="`url(#${maskId})`"
        :animate="badge.blink ? BADGE_BLINK : { opacity: 1 }"
        :transition="badge.blink ? { duration: 1, repeat: Infinity, ease: 'easeInOut' } : Dynamics.quick"
      />
    </template>
    <text
      v-else
      class="cp-sign"
      x="25"
      y="38"
      dy="0.36em"
      :fill="LABEL"
      stroke="#252525"
      stroke-width="4"
      paint-order="stroke"
      font-size="30"
    >{{ sign }}</text>
  </g>
</template>

<style scoped>
.cp-sign {
  font-family: var(--font-microcopy);
  font-weight: 700;
  text-anchor: middle;
}

.cp-sweep {
  mix-blend-mode: screen;
  pointer-events: none;
}
</style>
