<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { motion } from "motion-v";
import { Dynamics } from "../../../composables/useMotion";

const TRACK_H = 12;
const KNOB_W = TRACK_H;

const props = withDefaults(
  defineProps<{
    modelValue: number;
    min: number;
    max: number;
    step?: number;
    unit?: string;
    /** Readout multiplier - 100 renders a 0..1 value as a percentage. */
    displayMul?: number;
    /** Double-click target. */
    default?: number;
    bipolar?: boolean;
    disabled?: boolean;
  }>(),
  { step: 1, unit: "", displayMul: 1, default: undefined, bipolar: false, disabled: false },
);

const emit = defineEmits<{
  /** Continuous while dragging. */
  live: [value: number];
  /** Pointer-up / reset - the value to persist. */
  commit: [value: number];
}>();

const track = ref<HTMLElement | null>(null);
const trackW = ref(0);
const dragging = ref(false);

const span = computed(() => props.max - props.min || 1);
const ratio = computed(() => Math.min(1, Math.max(0, (props.modelValue - props.min) / span.value)));

const readout = computed(() => {
  const v = props.modelValue * props.displayMul;
  const decimals = props.step < 1 && props.displayMul === 1 ? 2 : 0;
  return `${v.toFixed(decimals)}${props.unit}`;
});

/** Knob travel, inset by its own width so it never overhangs the track. */
const travel = computed(() => Math.max(0, trackW.value - KNOB_W));

/**
 * Linear in the value - anchoring the knob to one of its edges would make it
 * jump by its own width wherever that edge changed sides.
 */
const knobLeft = computed(() => ratio.value * travel.value);

const knobCenter = computed(() => knobLeft.value + KNOB_W / 2);

/** Where a zero value sits on the same axis. */
const zeroCenter = computed(() => {
  const zero = Math.min(1, Math.max(0, (0 - props.min) / span.value));
  return zero * travel.value + KNOB_W / 2;
});

const fillSpan = computed(() => {
  // Unipolar keeps the design's relationship: the fill ends at the knob's
  // trailing edge and runs underneath it.
  if (!props.bipolar) return { left: 0, width: knobLeft.value + KNOB_W };
  // Bipolar spans origin to knob centre, so it collapses to nothing at zero
  // and grows either way without the fill changing size as it flips sides.
  const a = zeroCenter.value;
  const b = knobCenter.value;
  return { left: Math.min(a, b), width: Math.abs(b - a) };
});

function measure(): void {
  trackW.value = track.value?.clientWidth ?? 0;
}

// Knob travel is in pixels, and the inspector panel is resizable.
let ro: ResizeObserver | null = null;
onMounted(() => {
  if (!track.value) return;
  ro = new ResizeObserver(measure);
  ro.observe(track.value);
  measure();
});
onBeforeUnmount(() => ro?.disconnect());

function quantize(raw: number): number {
  const stepped = Math.round((raw - props.min) / props.step) * props.step + props.min;
  const clamped = Math.min(props.max, Math.max(props.min, stepped));
  // Kill float drift from the step arithmetic (0.30000000000000004).
  return Math.round(clamped * 1e6) / 1e6;
}

function valueAt(clientX: number): number {
  const box = track.value?.getBoundingClientRect();
  if (!box || !box.width) return props.modelValue;
  // Measured against the knob's travel, not the raw track, so the pointer sits
  // on the knob's centre rather than drifting from it towards the ends.
  const usable = Math.max(1, box.width - KNOB_W);
  const t = (clientX - box.left - KNOB_W / 2) / usable;
  return quantize(props.min + Math.min(1, Math.max(0, t)) * span.value);
}

function onPointerDown(e: PointerEvent): void {
  if (props.disabled) return;
  measure();
  dragging.value = true;
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  emit("live", valueAt(e.clientX));
  e.preventDefault();
}

function onPointerMove(e: PointerEvent): void {
  if (!dragging.value) return;
  emit("live", valueAt(e.clientX));
}

function onPointerUp(e: PointerEvent): void {
  if (!dragging.value) return;
  dragging.value = false;
  emit("commit", valueAt(e.clientX));
}

function onDblClick(): void {
  if (props.disabled || props.default === undefined) return;
  emit("commit", quantize(props.default));
}

function onKeydown(e: KeyboardEvent): void {
  if (props.disabled) return;
  const dir = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
  if (!dir) return;
  e.preventDefault();
  emit("commit", quantize(props.modelValue + dir * props.step * (e.shiftKey ? 10 : 1)));
}
</script>

<template>
  <div class="stage-slider" :class="{ disabled }">
    <div
      ref="track"
      class="slider-track"
      tabindex="0"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
      @dblclick="onDblClick"
      @keydown="onKeydown"
    >
      <div class="slider-fill" :style="{ left: `${fillSpan.left}px`, width: `${fillSpan.width}px` }"></div>
      <motion.div
        class="slider-knob"
        :initial="false"
        :animate="{ filter: dragging ? 'brightness(1.15)' : 'brightness(1)' }"
        :transition="Dynamics.quick"
        :style="{ left: `${knobLeft}px` }"
      />
    </div>
    <span class="slider-readout">{{ readout }}</span>
  </div>
</template>

<style scoped>
.stage-slider {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}

.slider-track {
  position: relative;
  flex: 1;
  min-width: 0;
  height: 12px;
  overflow: hidden;
  cursor: ew-resize;
  touch-action: none;
  outline: none;
  background: var(--black-3);
  corner-shape: bevel;
  border-radius: 6px 0 6px 0;
}

.slider-fill {
  position: absolute;
  top: 0;
  height: 100%;
  background: var(--base-50);
  corner-shape: bevel;
  border-radius: 6px 0 6px 0;
}

.slider-knob {
  position: absolute;
  top: 0;
  width: 12px;
  height: 100%;
  background: var(--accent-200);
  corner-shape: bevel;
  border-radius: 6px 0 6px 0;
}

.slider-track:focus-visible {
  outline: 1px solid var(--accent-200);
  outline-offset: 2px;
}

.slider-readout {
  flex: none;
  min-width: 38px;
  text-align: right;
  font-family: var(--font-microcopy);
  font-size: var(--main-font-size-4);
  color: var(--text-muted);
  user-select: none;
}

.stage-slider.disabled {
  opacity: 0.4;
  pointer-events: none;
}
</style>
