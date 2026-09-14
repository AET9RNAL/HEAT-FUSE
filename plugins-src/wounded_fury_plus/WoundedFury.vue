<script setup lang="ts">
import { computed, ref, watch, onUnmounted } from "vue";
import { motion, useMotionValue, useMotionTemplate, useTransform, animate } from "motion-v";
import "fuse_ui/ui/tokens.css";
import FlameWrap from "canvas_ui/ui/FlameWrap.vue";

type Phase = "charge" | "active" | "cooldown";

interface WoundedFuryData {
  progress: number;
  phase: Phase;
  inMatch: boolean;
  trigger: number;
  /** HP still to lose before the modifier triggers. */
  toTrigger: number;
  /** Whole seconds left in the active or cooldown phase. */
  remaining: number;
  /** User-picked phase colours, as CSS hex. */
  chargeColor: string;
  activeColor: string;
  cooldownColor: string;
}

const props = defineProps<{ data: Partial<WoundedFuryData> }>();

// ignition burst
const BURN_IN_MS = 220;
const BURN_HOLD_MS = 2000;
const BURN_OUT_MS = 700;

const PHASE_LABEL: Record<Phase, string> = { charge: "Charging", active: "Active", cooldown: "Cooldown" };
const MILESTONES = [1 / 3, 2 / 3];

const phase = computed<Phase>(() => props.data?.phase ?? "charge");
const inMatch = computed(() => props.data?.inMatch !== false);

const progress = computed(() => Math.max(0, Math.min(1, props.data?.progress ?? 0)));
const accent = computed(() => {
  if (phase.value === "active") return props.data?.activeColor || "var(--error-highlight)";
  return phase.value === "cooldown"
    ? props.data?.cooldownColor || "var(--text-main)"
    : props.data?.chargeColor || "var(--accent-200)";
});

const counting = computed(() => phase.value !== "charge");
const valueText = computed(() =>
  counting.value
    ? String(Math.max(0, Math.ceil(props.data?.remaining ?? 0)))
    : String(Math.max(0, Math.round(props.data?.toTrigger ?? 0))),
);
const unit = computed(() => (counting.value ? "s" : "hp"));

const fillClip = computed(() => `inset(0 ${(1 - progress.value) * 100}% 0 0)`);

// Last quarter of the buff: the bar blinks so the window closing is caught
// peripherally, without having to read the fill length.
const EXPIRY_AT = 0.25;
const BLINK_MS = 200;
const BLINK_LOW = 0.25;
const expiring = computed(() => phase.value === "active" && progress.value <= EXPIRY_AT);

const fillOpacity = useMotionValue(1);
let blink: ReturnType<typeof animate> | null = null;
watch(expiring, (on) => {
  blink?.stop();
  blink = null;
  if (!on) {
    fillOpacity.set(1);
    return;
  }
  blink = animate(fillOpacity, BLINK_LOW, {
    duration: BLINK_MS / 1000,
    ease: "easeInOut",
    repeat: Infinity,
    repeatType: "reverse",
  });
});
onUnmounted(() => blink?.stop());

const GLOW_MS = 300;
const GLOW_BRIGHT = 1.4;
const GLOW_PX = 6;
const glow = useMotionValue(0);
const fillFilter = useMotionTemplate`brightness(${useTransform(glow, [0, 1], [1, GLOW_BRIGHT])})`;
// The bar clips its content, so the halo lives on an unclipped sibling.
const glowFilter = useMotionTemplate`drop-shadow(0 0 ${useTransform(glow, [0, 1], [0, GLOW_PX])}px currentColor) drop-shadow(0 0 ${useTransform(glow, [0, 1], [0, GLOW_PX * 2])}px currentColor)`;
let glowAnim: ReturnType<typeof animate> | null = null;

function flare(): void {
  glowAnim?.stop();
  glow.set(1);
  glowAnim = animate(glow, 0, { duration: GLOW_MS / 1000, ease: "easeOut" });
}

// Phase flips move progress on their own (charge ends at 1, active starts at 1),
// so only a rise inside a steady charge phase counts as a hit landing.
let prevProgress = 0;
let prevPhase: Phase = "charge";
watch([progress, phase], ([p, ph]) => {
  if (ph === prevPhase && ph === "charge" && p > prevProgress) flare();
  prevProgress = p;
  prevPhase = ph;
});
onUnmounted(() => glowAnim?.stop());

const easeOutExpo = (t: number): number => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);

const burnLevel = ref(0);
let burnRaf = 0;

/** One in-hold-out envelope; unmounts FlameWrap at the end (frees its GL context). */
function ignite(): void {
  cancelAnimationFrame(burnRaf);
  const start = performance.now();
  const step = (now: number) => {
    const t = now - start;
    if (t < BURN_IN_MS) {
      burnLevel.value = easeOutExpo(t / BURN_IN_MS);
    } else if (t < BURN_IN_MS + BURN_HOLD_MS) {
      burnLevel.value = 1;
    } else {
      const out = (t - BURN_IN_MS - BURN_HOLD_MS) / BURN_OUT_MS;
      if (out >= 1) {
        burnLevel.value = 0;
        return;
      }
      burnLevel.value = 1 - easeOutCubic(out);
    }
    burnRaf = requestAnimationFrame(step);
  };
  burnRaf = requestAnimationFrame(step);
}

watch(
  () => props.data?.trigger,
  (n, o) => {
    if (n == null || n === o) return;
    ignite();
  },
);
onUnmounted(() => cancelAnimationFrame(burnRaf));

const burning = computed(() => burnLevel.value > 0.001);
// Fallback until the plugin's colours arrive: --woth-enemy #ff6d46.
const FLAME_COLOR: [number, number, number] = [1.0, 0.43, 0.28];

const flameColor = computed<[number, number, number]>(() => {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(props.data?.activeColor ?? "");
  if (!m) return FLAME_COLOR;
  return [
    Number.parseInt(m[1] ?? "0", 16) / 255,
    Number.parseInt(m[2] ?? "0", 16) / 255,
    Number.parseInt(m[3] ?? "0", 16) / 255,
  ];
});

// Flame shape driven by intensity - same treatment MatchProgressOverhaul uses.
const FLAME_MIN = 0.5;
const FLAME_MAX = 2;
const FLAME_SHAPE_MIN = { height: 50, sparks: 0.5, sparkDensity: 0.4 };
const FLAME_SHAPE_MAX = { height: 170, sparks: 1.8, sparkDensity: 1 };
const FLAME_SPREAD = 3;
const FLAME_TURBULENCE = 0.5;
const FLAME_SHAPE_CURVE = { height: 0.55, sparks: 1.7, sparkDensity: 1.3 };

type FlameShape = typeof FLAME_SHAPE_MAX;
const FLAME_SHAPE_KEYS = Object.keys(FLAME_SHAPE_MAX) as (keyof FlameShape)[];

const flameIntensity = computed(() => FLAME_MAX * burnLevel.value);

/** Map the lit intensity back onto 0..1 so it can drive the shape lerp. */
const flameShape = computed<FlameShape>(() => {
  const t = Math.min(Math.max((flameIntensity.value - FLAME_MIN) / (FLAME_MAX - FLAME_MIN), 0), 1);
  const out = {} as FlameShape;
  for (const k of FLAME_SHAPE_KEYS) {
    const min = FLAME_SHAPE_MIN[k];
    out[k] = min + (FLAME_SHAPE_MAX[k] - min) * Math.pow(t, FLAME_SHAPE_CURVE[k]);
  }
  return out;
});
</script>

<template>
  <div class="wf-overlay" :class="{ dim: !inMatch }">
    <div class="wf-frame" :style="{ '--wf-accent': accent }">
      <div class="wf-header">
        <div class="wf-tab">
          <span class="wf-seg wf-label">Wounded Fury</span>
          <span class="wf-seg wf-phase">{{ PHASE_LABEL[phase] }}</span>
        </div>
        <div class="wf-rail" />
      </div>

      <!-- The filter sits on the unclipped wrapper so the halo spills past the
           bar; the child is cut to the filled length. -->
      <motion.div class="wf-glow" :style="{ opacity: glow, filter: glowFilter }">
        <div class="wf-glow-shape" :style="{ clipPath: fillClip }" />
      </motion.div>

      <div class="wf-bar">
        <motion.div class="wf-fill-layer" :style="{ opacity: fillOpacity, filter: fillFilter }">
          <div class="wf-fill" :style="{ clipPath: fillClip }" />
          <div v-show="progress > 0" class="wf-edge" :style="{ left: `${progress * 100}%` }" />
        </motion.div>
        <span
          v-for="m in MILESTONES"
          :key="m"
          class="wf-milestone"
          :class="{ passed: progress >= m }"
          :style="{ '--at': m }"
        />
      </div>

      <div class="wf-value">
        <span class="wf-readout">
          <span class="wf-number">{{ valueText }}</span>
          <span class="wf-unit">{{ unit }}</span>
        </span>
      </div>

      <!-- FlameWrap burns its own root box and its root carries an inline
           position:relative, so the bar-sized box has to be this wrapper. -->
      <div v-if="burning" class="wf-flamebox">
        <FlameWrap
          class="wf-flame"
          :color="flameColor"
          :intensity="flameIntensity"
          v-bind="flameShape"
          :spread="FLAME_SPREAD"
          :turbulence="FLAME_TURBULENCE"
          :reserve-height="FLAME_SHAPE_MAX.height"
          :radius="2"
          :speed="1.2"
          :scale="0.6"
          :spark-size="0.4"
          :rim="1.2"
          :melt="4"
          :distortion="3"
          :smoke="0"
          :ember="0.8"
          :scorch="0.2"
        >
          <!-- Empty slot: the bar paints itself below, so the shader composites
               fire only (content.a = 0) and the flames overlap the bar edges. -->
        </FlameWrap>
      </div>
    </div>
  </div>
</template>

<style scoped>
.wf-overlay {
  position: relative;
  width: 100%;
  height: 100%;
  transition: opacity 0.25s;
  container-type: size;
}

.wf-overlay.dim {
  opacity: 0.4;
}

.wf-frame {
  --u: min(calc(100cqw / 225), calc(100cqh / 43.75));
  --wf-accent: var(--accent-200);
  --wf-tint: color-mix(in srgb, var(--wf-accent) 10%, transparent);
  --wf-stroke: color-mix(in srgb, var(--wf-accent) 80%, var(--black-1));
  position: relative;
  width: calc(225 * var(--u));
  height: calc(43.75 * var(--u));
}

.wf-tab,
.wf-seg,
.wf-rail,
.wf-bar,
.wf-value {
  transition: border-color 0.25s ease;
}

.wf-header {
  position: absolute;
  left: 0;
  top: 0;
  width: calc(225 * var(--u));
  height: calc(12.5 * var(--u));
  display: flex;
  align-items: flex-end;
}

.wf-tab {
  flex: none;
  box-sizing: border-box;
  height: 100%;
  display: flex;
  align-items: stretch;
  overflow: hidden;
  background: var(--black-1-a);
  border: calc(1 * var(--u)) solid var(--wf-stroke);
  corner-shape: bevel;
  border-radius: 0 calc(6.25 * var(--u)) 0 0;
}

.wf-seg {
  display: flex;
  align-items: center;
  padding: 0 calc(4 * var(--u));
  line-height: 1;
  white-space: nowrap;
  text-transform: uppercase;
}

.wf-seg + .wf-seg {
  border-left: calc(1 * var(--u)) solid var(--wf-stroke);
}

.wf-label {
  font-family: var(--font-primary);
  font-weight: var(--font-weight-2);
  font-size: calc(8 * var(--u));
  color: var(--text-muted);
}

.wf-phase {
  box-sizing: border-box;
  width: calc(52 * var(--u));
  padding-right: calc(7 * var(--u));
  font-family: var(--font-microcopy);
  font-weight: var(--font-weight-3);
  font-size: calc(8 * var(--u));
  color: var(--wf-accent);
  background: var(--wf-tint);
  transition: color 0.25s ease, background 0.25s ease, border-color 0.25s ease;
}

.wf-rail {
  flex: 1;
  box-sizing: border-box;
  height: calc(6.25 * var(--u));
  border: calc(1 * var(--u)) solid var(--wf-stroke);
  border-left: 0;
  corner-shape: bevel;
  border-radius: 0 0 calc(6.25 * var(--u)) 0;
}

.wf-glow {
  position: absolute;
  left: 0;
  top: calc(18.75 * var(--u));
  width: calc(150 * var(--u));
  height: calc(25 * var(--u));
  color: var(--wf-accent);
  pointer-events: none;
  z-index: 0;
}

.wf-glow-shape {
  width: 100%;
  height: 100%;
  background: var(--wf-accent);
  corner-shape: bevel;
  border-radius: calc(12.5 * var(--u)) 0 calc(25 * var(--u)) 0;
  transition: clip-path 0.15s ease;
}

.wf-bar {
  position: absolute;
  left: 0;
  top: calc(18.75 * var(--u));
  z-index: 1;
  box-sizing: border-box;
  width: calc(150 * var(--u));
  height: calc(25 * var(--u));
  overflow: hidden;
  background: var(--black-1-a);
  border: calc(1 * var(--u)) solid var(--wf-stroke);
  corner-shape: bevel;
  border-radius: calc(12.5 * var(--u)) 0 calc(25 * var(--u)) 0;
}

.wf-fill-layer {
  position: absolute;
  inset: 0;
}

.wf-fill {
  position: absolute;
  inset: 0;
  background: color-mix(in srgb, var(--wf-accent) 26%, transparent);
  transition: clip-path 0.15s ease, background 0.25s ease;
}

.wf-edge {
  position: absolute;
  top: 0;
  bottom: 0;
  width: calc(2 * var(--u));
  background: var(--wf-accent);
  transform: translateX(-100%);
  transition: left 0.15s ease, background 0.25s ease;
}

.wf-milestone {
  position: absolute;
  top: calc(5 * var(--u));
  bottom: calc(5 * var(--u));
  left: calc((var(--at) * 150 - 1.5) * var(--u));
  width: calc(1 * var(--u));
  background: var(--wf-stroke);
  transition: background 0.15s ease;
}

.wf-milestone.passed {
  background: var(--wf-accent);
}

.wf-value {
  position: absolute;
  left: calc(137.5 * var(--u));
  top: calc(18.75 * var(--u));
  box-sizing: border-box;
  width: calc(87.5 * var(--u));
  height: calc(25 * var(--u));
  display: flex;
  align-items: center;
  justify-content: center;
  padding-left: calc(12.5 * var(--u));
  background-color: var(--black-1-a);
  background-image: linear-gradient(var(--wf-tint), var(--wf-tint));
  border: calc(1 * var(--u)) solid var(--wf-stroke);
  corner-shape: bevel;
  border-radius: calc(25 * var(--u)) 0 calc(12.5 * var(--u)) 0;
}

.wf-readout {
  display: flex;
  align-items: baseline;
  gap: calc(2 * var(--u));
}

.wf-number {
  font-family: var(--font-microcopy);
  font-weight: var(--font-weight-3);
  font-size: calc(16 * var(--u));
  line-height: 1;
  color: var(--text-main);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.wf-unit {
  font-family: var(--font-microcopy);
  font-size: calc(8 * var(--u));
  line-height: 1;
  color: var(--text-muted);
}

.wf-flamebox {
  position: absolute;
  left: 0;
  top: calc(18.75 * var(--u));
  width: calc(150 * var(--u));
  height: calc(25 * var(--u));
  z-index: 2;
  pointer-events: none;
}

.wf-flame {
  width: 100%;
  height: 100%;
  clip-path: polygon(0% -2000%, 100% -2000%, 100% 100%, 0% 100%);
}
</style>
