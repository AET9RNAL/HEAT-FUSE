<script setup lang="ts">
import { computed, onUnmounted, ref } from "vue";
import { motion } from "motion-v";
import Icons from "../../../components/Icons.vue";
import type { ButtonMode } from "../../../components/eButton.vue";
import { Dynamics } from "../../../composables/useMotion";

const props = withDefaults(
  defineProps<{
    text: string;
    variant?: "default" | "accent" | "danger" | "ghost";
    mode?: ButtonMode;
    icon?: string;
    /** confirm: label while armed. On a default button it also turns confirm on. */
    confirm?: string;
    /** hold: press duration before the click fires. */
    holdMs?: number;
    /** toggle: current state. */
    modelValue?: boolean;
    /** toggle: label while on. */
    activeText?: string;
    /** toggle: body while off */
    offTone?: "clear" | "danger";
    disabled?: boolean;
  }>(),
  {
    variant: "default",
    mode: "default",
    icon: "",
    confirm: "",
    holdMs: 600,
    modelValue: false,
    activeText: "",
    offTone: "clear",
    disabled: false,
  },
);

const emit = defineEmits<{ click: []; "update:modelValue": [value: boolean] }>();

const CONFIRM_TIMEOUT_MS = 3000;

const activeMode = computed<ButtonMode>(() => (props.mode === "default" && props.confirm ? "confirm" : props.mode));

// confirm
const armed = ref(false);
let armTimer: number | null = null;

function disarm(): void {
  armed.value = false;
  if (armTimer !== null) window.clearTimeout(armTimer);
  armTimer = null;
}

// hold
const holding = ref(false);
let holdTimer: number | null = null;

function startHold(e: PointerEvent): void {
  if (activeMode.value !== "hold" || props.disabled || e.button !== 0) return;
  holding.value = true;
  holdTimer = window.setTimeout(() => {
    holdTimer = null;
    holding.value = false;
    emit("click");
  }, props.holdMs);
}

function cancelHold(): void {
  if (holdTimer !== null) window.clearTimeout(holdTimer);
  holdTimer = null;
  holding.value = false;
}

function onLeave(): void {
  cancelHold();
  disarm();
}

function onClick(): void {
  if (props.disabled) return;
  switch (activeMode.value) {
    // Fires from the hold timer, never from the click itself.
    case "hold":
      return;
    case "confirm":
      if (!armed.value) {
        armed.value = true;
        armTimer = window.setTimeout(disarm, CONFIRM_TIMEOUT_MS);
        return;
      }
      disarm();
      emit("click");
      return;
    case "toggle":
      emit("update:modelValue", !props.modelValue);
      emit("click");
      return;
    default:
      emit("click");
  }
}

onUnmounted(() => {
  disarm();
  cancelHold();
});

const toggleOn = computed(() => activeMode.value === "toggle" && props.modelValue);
const toggleOffDanger = computed(() => activeMode.value === "toggle" && !props.modelValue && props.offTone === "danger");

const label = computed(() => {
  if (armed.value) return props.confirm || "Confirm";
  if (toggleOn.value) return props.activeText || props.text;
  return props.text;
});
</script>

<template>
  <motion.button
    type="button"
    class="stage-button"
    :class="[variant, `mode-${activeMode}`, { armed, disabled, 'toggle-on': toggleOn, 'toggle-off-danger': toggleOffDanger }]"
    :disabled="disabled"
    :aria-pressed="activeMode === 'toggle' ? modelValue : undefined"
    :while-press="disabled ? {} : { scale: 0.97 }"
    :transition="Dynamics.quick"
    @click="onClick"
    @pointerdown="startHold"
    @pointerup="cancelHold"
    @pointercancel="cancelHold"
    @pointerleave="onLeave"
  >
    <motion.span
      v-if="activeMode === 'hold'"
      class="hold-fill"
      :initial="false"
      :animate="{ scaleX: holding ? 1 : 0 }"
      :transition="holding ? { duration: holdMs / 1000, ease: 'linear' } : { duration: 0.2 }"
    />
    <Icons v-if="icon" :kind="icon as never" size="small" color="var(--ico)" />
    <span v-if="label" class="label">{{ label }}</span>
  </motion.button>
</template>

<style scoped>
.stage-button {
  --ico: var(--text-muted);
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-1);
  width: 100%;
  height: 26px;
  padding: 0 var(--space-2);
  box-sizing: border-box;
  overflow: hidden;
  background: var(--black-1-a);
  border: 1px solid var(--base-600);
  font-family: var(--font-primary);
  font-size: var(--main-font-size-4);
  font-weight: var(--font-weight-2);
  color: var(--text-muted);
  cursor: pointer;
  white-space: nowrap;
  transition: color 0.15s, background 0.15s, border-color 0.15s, filter 0.15s;
  corner-shape: bevel;
  border-radius: 8px 0 8px 0;
}

.stage-button > :not(.hold-fill) {
  position: relative;
}

.stage-button:hover:not(:disabled) {
  --ico: var(--text-main);
  color: var(--text-main);
  border-color: var(--accent-200);
}

.stage-button.accent {
  --ico: var(--base-1000);
  background: var(--accent-200);
  border-color: var(--accent-200);
  color: var(--base-1000);
}

.stage-button.accent:hover:not(:disabled) {
  --ico: var(--base-1000);
  color: var(--base-1000);
  background: var(--tea-green);
  border-color: var(--tea-green);
}

.stage-button.ghost {
  background: transparent;
  border-color: transparent;
}

.stage-button.ghost:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.06);
  border-color: transparent;
}

.stage-button.danger:hover:not(:disabled),
.stage-button.armed {
  --ico: var(--text-main);
  background: var(--error-color);
  border-color: var(--error-base);
  color: var(--text-main);
}

.stage-button.toggle-on {
  --ico: var(--base-1000);
  background: var(--accent-200);
  border-color: var(--accent-200);
  color: var(--base-1000);
}

.stage-button.toggle-on:hover:not(:disabled) {
  --ico: var(--base-1000);
  color: var(--base-1000);
  background: var(--tea-green);
  border-color: var(--tea-green);
}

.stage-button.toggle-off-danger {
  --ico: var(--base-1000);
  background: var(--error-highlight);
  border-color: var(--error-highlight);
  color: var(--base-1000);
}

.stage-button.toggle-off-danger:hover:not(:disabled) {
  --ico: var(--base-1000);
  color: var(--base-1000);
  border-color: var(--error-highlight);
  filter: brightness(1.08);
}

.hold-fill {
  position: absolute;
  inset: 0;
  transform-origin: left center;
  background: rgba(132, 255, 177, 0.25);
  pointer-events: none;
}

.label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.stage-button.disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
