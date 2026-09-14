<script setup lang="ts">
import { computed, ref, watch, onUnmounted } from "vue";
import { motion, useMotionValue, useMotionTemplate, useTransform, animate } from "motion-v";
import "fuse_ui/ui/tokens.css";

type Phase = "charge" | "cooldown";

interface CombatRebootData {
  progress: number;
  phase: Phase;
  inMatch: boolean;
  trigger: number;
  /** Damage still to deal inside the window before the module fires. */
  toTrigger: number;
  /** Whole seconds of cooldown left. */
  remaining: number;
  /** User-picked phase colours, as CSS hex. */
  chargeColor: string;
  cooldownColor: string;
}

const props = defineProps<{ data: Partial<CombatRebootData> }>();

// The module firing: the bar holds full and strobes before the cooldown takes over.
const FLASHES = 5;
const FLASH_MS = 70;

const PHASE_LABEL: Record<Phase, string> = { charge: "Charging", cooldown: "Cooldown" };
const MILESTONES = [1 / 3, 2 / 3];

const strobing = ref(false);
const phase = computed<Phase>(() => (props.data?.phase === "cooldown" && !strobing.value ? "cooldown" : "charge"));
const inMatch = computed(() => props.data?.inMatch !== false);

const progress = computed(() =>
  strobing.value ? 1 : Math.max(0, Math.min(1, props.data?.progress ?? 0)),
);
// Every accent-derived colour (fill, edge, tints, strokes, strobe glow) follows the config picks.
const accent = computed(() =>
  phase.value === "cooldown"
    ? props.data?.cooldownColor || "var(--text-main)"
    : props.data?.chargeColor || "var(--accent-200)",
);

// Every phase counts down: damage left to deal before the trigger, then cooldown seconds.
const counting = computed(() => phase.value === "cooldown");
const valueText = computed(() => {
  if (strobing.value) return "0";
  return counting.value
    ? String(Math.max(0, Math.ceil(props.data?.remaining ?? 0)))
    : String(Math.max(0, Math.round(props.data?.toTrigger ?? 0)));
});
const unit = computed(() => (counting.value ? "s" : "dmg"));

const fillClip = computed(() => `inset(0 ${(1 - progress.value) * 100}% 0 0)`);

// Every damage hit nudges the fill up; a short flare on each step makes the
// charge read as a series of hits rather than a bar that drifts.
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

// Phase flips move progress on their own (charge ends at 1, cooldown starts at 1),
// so only a rise inside a steady charge phase counts as a hit landing.
let prevProgress = 0;
let prevPhase: Phase = "charge";
watch([progress, phase], ([p, ph]) => {
  if (ph === prevPhase && ph === "charge" && p > prevProgress && !strobing.value) flare();
  prevProgress = p;
  prevPhase = ph;
});
onUnmounted(() => glowAnim?.stop());

/** The hit halo, pulsed once per flash so the strobe glows in step with the CSS flashes. */
function strobeGlow(): void {
  glowAnim?.stop();
  glow.set(0);
  glowAnim = animate(glow, [0, 1, 0], {
    duration: FLASH_MS / 1000,
    ease: "easeInOut",
    repeat: FLASHES - 1,
  });
}

// Restarted by dropping the class for a frame, so back-to-back triggers each strobe in full.
let strobeTimer: ReturnType<typeof setTimeout> | undefined;
watch(
  () => props.data?.trigger,
  (n, o) => {
    if (n == null || n === o) return;
    strobing.value = false;
    requestAnimationFrame(() => {
      strobing.value = true;
      strobeGlow();
      clearTimeout(strobeTimer);
      strobeTimer = setTimeout(() => (strobing.value = false), FLASHES * FLASH_MS);
    });
  },
);
onUnmounted(() => clearTimeout(strobeTimer));
</script>

<template>
  <div class="crb-overlay" :class="{ dim: !inMatch }">
    <div
      class="crb-frame"
      :class="{ strobe: strobing }"
      :style="{ '--crb-accent': accent, '--crb-flash': `${FLASH_MS}ms`, '--crb-flashes': FLASHES }"
    >
      <div class="crb-header">
        <div class="crb-tab">
          <span class="crb-seg crb-label">Combat Reboot</span>
          <span class="crb-seg crb-phase">{{ PHASE_LABEL[phase] }}</span>
        </div>
        <div class="crb-rail" />
      </div>

      <!-- The filter sits on the unclipped wrapper so the halo spills past the
           bar; the child is cut to the filled length. -->
      <motion.div class="crb-glow" :style="{ opacity: glow, filter: glowFilter }">
        <div class="crb-glow-shape" :style="{ clipPath: fillClip }" />
      </motion.div>

      <div class="crb-bar">
        <motion.div class="crb-fill-layer" :style="{ filter: fillFilter }">
          <div class="crb-fill" :style="{ clipPath: fillClip }" />
          <div v-show="progress > 0" class="crb-edge" :style="{ left: `${progress * 100}%` }" />
        </motion.div>
        <span
          v-for="m in MILESTONES"
          :key="m"
          class="crb-milestone"
          :class="{ passed: progress >= m }"
          :style="{ '--at': m }"
        />
      </div>

      <div class="crb-value">
        <span class="crb-readout">
          <span class="crb-number">{{ valueText }}</span>
          <span class="crb-unit">{{ unit }}</span>
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.crb-overlay {
  position: relative;
  width: 100%;
  height: 100%;
  transition: opacity 0.25s;
  container-type: size;
}

.crb-overlay.dim {
  opacity: 0.4;
}

/* Figma frame 591:6633 is 225 x 43.75; --u is one design pixel, fitted to the
   overlay box without distorting the art. */
.crb-frame {
  --u: min(calc(100cqw / 225), calc(100cqh / 43.75));
  --crb-accent: var(--accent-200);
  --crb-tint: color-mix(in srgb, var(--crb-accent) 10%, transparent);
  /* Solid, a step under the accent, so the fill's leading edge stays the brightest line. */
  --crb-stroke: color-mix(in srgb, var(--crb-accent) 80%, var(--black-1));
  --crb-flash-glow: drop-shadow(0 0 calc(6 * var(--u)) var(--crb-accent));
  position: relative;
  width: calc(225 * var(--u));
  height: calc(43.75 * var(--u));
}

.crb-tab,
.crb-seg,
.crb-rail,
.crb-bar,
.crb-value {
  transition: border-color 0.25s ease;
}

/* Header: a segmented chip like the stage's overlay info tab, then a hairline
   rail that keeps the stepped silhouette without adding weight. */
.crb-header {
  position: absolute;
  left: 0;
  top: 0;
  width: calc(225 * var(--u));
  height: calc(12.5 * var(--u));
  display: flex;
  align-items: flex-end;
}

.crb-tab {
  flex: none;
  box-sizing: border-box;
  height: 100%;
  display: flex;
  align-items: stretch;
  overflow: hidden;
  background: var(--black-1-a);
  border: calc(1 * var(--u)) solid var(--crb-stroke);
  corner-shape: bevel;
  border-radius: 0 calc(6.25 * var(--u)) 0 0;
}

.crb-seg {
  display: flex;
  align-items: center;
  padding: 0 calc(4 * var(--u));
  line-height: 1;
  white-space: nowrap;
  text-transform: uppercase;
}

.crb-seg + .crb-seg {
  border-left: calc(1 * var(--u)) solid var(--crb-stroke);
}

.crb-label {
  font-family: var(--font-primary);
  font-weight: var(--font-weight-2);
  font-size: calc(8 * var(--u));
  color: var(--text-muted);
}

/* Fixed width so the rail doesn't shift when the phase word changes; the right
   padding clears the bevel. */
.crb-phase {
  box-sizing: border-box;
  width: calc(52 * var(--u));
  padding-right: calc(7 * var(--u));
  font-family: var(--font-microcopy);
  font-weight: var(--font-weight-3);
  font-size: calc(8 * var(--u));
  color: var(--crb-accent);
  background: var(--crb-tint);
  transition: color 0.25s ease, background 0.25s ease, border-color 0.25s ease;
}

.crb-rail {
  flex: 1;
  box-sizing: border-box;
  height: calc(6.25 * var(--u));
  border: calc(1 * var(--u)) solid var(--crb-stroke);
  border-left: 0;
  corner-shape: bevel;
  border-radius: 0 0 calc(6.25 * var(--u)) 0;
}

.crb-glow {
  position: absolute;
  left: 0;
  top: calc(18.75 * var(--u));
  width: calc(150 * var(--u));
  height: calc(25 * var(--u));
  color: var(--crb-accent);
  pointer-events: none;
  z-index: 0;
}

.crb-glow-shape {
  width: 100%;
  height: 100%;
  background: var(--crb-accent);
  corner-shape: bevel;
  border-radius: calc(12.5 * var(--u)) 0 calc(25 * var(--u)) 0;
  transition: clip-path 0.15s ease;
}

.crb-bar {
  position: absolute;
  left: 0;
  top: calc(18.75 * var(--u));
  z-index: 1;
  box-sizing: border-box;
  width: calc(150 * var(--u));
  height: calc(25 * var(--u));
  overflow: hidden;
  background: var(--black-1-a);
  border: calc(1 * var(--u)) solid var(--crb-stroke);
  corner-shape: bevel;
  border-radius: calc(12.5 * var(--u)) 0 calc(25 * var(--u)) 0;
}

.crb-fill-layer {
  position: absolute;
  inset: 0;
}

.crb-fill {
  position: absolute;
  inset: 0;
  background: color-mix(in srgb, var(--crb-accent) 26%, transparent);
  transition: clip-path 0.15s ease, background 0.25s ease;
}

/* Solid leading edge: the level reads from the line, not the tint. */
.crb-edge {
  position: absolute;
  top: 0;
  bottom: 0;
  width: calc(2 * var(--u));
  background: var(--crb-accent);
  transform: translateX(-100%);
  transition: left 0.15s ease, background 0.25s ease;
}

/* Hairline ticks at thirds of the bar, lit once the fill covers them. */
.crb-milestone {
  position: absolute;
  top: calc(5 * var(--u));
  bottom: calc(5 * var(--u));
  left: calc((var(--at) * 150 - 1.5) * var(--u));
  width: calc(1 * var(--u));
  background: var(--crb-stroke);
  transition: background 0.15s ease;
}

.crb-milestone.passed {
  background: var(--crb-accent);
}

.crb-value {
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
  background-image: linear-gradient(var(--crb-tint), var(--crb-tint));
  border: calc(1 * var(--u)) solid var(--crb-stroke);
  corner-shape: bevel;
  border-radius: calc(25 * var(--u)) 0 calc(12.5 * var(--u)) 0;
}

.crb-readout {
  display: flex;
  align-items: baseline;
  gap: calc(2 * var(--u));
}

.crb-number {
  font-family: var(--font-microcopy);
  font-weight: var(--font-weight-3);
  font-size: calc(16 * var(--u));
  line-height: 1;
  color: var(--text-main);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.crb-unit {
  font-family: var(--font-microcopy);
  font-size: calc(8 * var(--u));
  line-height: 1;
  color: var(--text-muted);
}

/* The module firing: one flash per FLASH_MS, FLASHES times, in step with the halo. */
.crb-frame.strobe .crb-bar,
.crb-frame.strobe .crb-value {
  animation: crb-strobe var(--crb-flash) ease-in-out var(--crb-flashes);
}

@keyframes crb-strobe {
  0%   { filter: brightness(1); }
  50%  { filter: brightness(2.4) var(--crb-flash-glow); }
  100% { filter: brightness(1); }
}
</style>
