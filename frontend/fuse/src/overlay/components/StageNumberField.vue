<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { cutClipPath, useClipStroke } from "../composables/useClipStroke";

const CUT = 6;

interface Props {
  label: string;
  modelValue: number;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  disabled?: boolean;
  title?: string;
}

const props = withDefaults(defineProps<Props>(), {
  min: -100000,
  max: 100000,
  step: 1,
  suffix: "",
  disabled: false,
  title: "",
});

const emit = defineEmits<{ "update:modelValue": [value: number] }>();

const el = ref<HTMLElement | null>(null);
const points = useClipStroke(el, CUT);

const draft = ref(String(props.modelValue));
const focused = ref(false);

watch(
  () => props.modelValue,
  (v) => {
    if (!focused.value) draft.value = String(v);
  },
);

const display = computed(() => (focused.value ? draft.value : `${props.modelValue}${props.suffix}`));

function clamp(v: number): number {
  return Math.min(props.max, Math.max(props.min, v));
}

function push(v: number): void {
  if (!Number.isFinite(v)) return;
  const next = clamp(Math.round(v * 100) / 100);
  if (next !== props.modelValue) emit("update:modelValue", next);
}

function onInput(e: Event): void {
  draft.value = (e.target as HTMLInputElement).value;
}

function commit(): void {
  focused.value = false;
  const parsed = Number.parseFloat(draft.value.replace(props.suffix, ""));
  if (Number.isFinite(parsed)) push(parsed);
  draft.value = String(props.modelValue);
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === "Enter") {
    (e.target as HTMLInputElement).blur();
    return;
  }
  if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
  e.preventDefault();
  const mult = e.shiftKey ? 10 : 1;
  push(props.modelValue + (e.key === "ArrowUp" ? 1 : -1) * props.step * mult);
}

// --- scrub-drag on the label --------------------------------------------
let scrubbing = false;
let scrubStartX = 0;
let scrubStartValue = 0;

function onScrubDown(e: PointerEvent): void {
  if (props.disabled) return;
  scrubbing = true;
  scrubStartX = e.clientX;
  scrubStartValue = props.modelValue;
  (e.target as HTMLElement).setPointerCapture(e.pointerId);
  e.preventDefault();
}

function onScrubMove(e: PointerEvent): void {
  if (!scrubbing) return;
  const mult = e.shiftKey ? 10 : 1;
  push(scrubStartValue + (e.clientX - scrubStartX) * props.step * mult);
}

function onScrubUp(): void {
  scrubbing = false;
}
</script>

<template>
  <div
    ref="el"
    class="num-field"
    :class="{ focused, disabled }"
    :style="{ clipPath: cutClipPath(CUT) }"
    :title="title"
  >
    <span
      class="num-label"
      @pointerdown="onScrubDown"
      @pointermove="onScrubMove"
      @pointerup="onScrubUp"
    >{{ label }}</span>
    <input
      class="num-input"
      type="text"
      inputmode="decimal"
      :disabled="disabled"
      :value="display"
      @input="onInput"
      @focus="focused = true; draft = String(modelValue)"
      @blur="commit"
      @keydown="onKeydown"
    />
    <svg
      v-if="points"
      class="field-stroke"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <polygon
        :points="points"
        fill="none" stroke="#525252" stroke-width="0.4" vector-effect="non-scaling-stroke"
      />
    </svg>
  </div>
</template>

<style scoped>
.num-field {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--space-1);
  height: 32px;
  padding: 0 var(--space-2);
  box-sizing: border-box;
  background: var(--black-1-a);
  cursor: text;
}

.num-field.disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.num-field.focused .field-stroke polygon { stroke: var(--accent-200); }

.num-label {
  font-family: var(--font-microcopy);
  font-size: var(--main-font-size-5);
  color: var(--text-muted);
  cursor: ew-resize;
  user-select: none;
  touch-action: none;
}

.num-input {
  width: 100%;
  min-width: 0;
  background: transparent;
  border: none;
  outline: none;
  font-family: var(--font-primary);
  font-size: var(--main-font-size-4);
  color: var(--text-main);
}

.num-input:disabled { cursor: not-allowed; }

.field-stroke {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
</style>
