<script setup lang="ts">
import { ref } from "vue";
import { motion } from "motion-v";
import Icons from "../../../components/Icons.vue";
import { Dynamics } from "../../../composables/useMotion";

const props = withDefaults(
  defineProps<{
    text: string;
    variant?: "default" | "accent" | "danger" | "ghost";
    icon?: string;
    /** Second-click confirmation label; omit for a plain button. */
    confirm?: string;
    disabled?: boolean;
  }>(),
  { variant: "default", icon: "", confirm: "", disabled: false },
);

const emit = defineEmits<{ click: [] }>();

const armed = ref(false);
let armTimer: number | null = null;

function disarm(): void {
  armed.value = false;
  if (armTimer !== null) window.clearTimeout(armTimer);
  armTimer = null;
}

function onClick(): void {
  if (!props.confirm) {
    emit("click");
    return;
  }
  if (armed.value) {
    disarm();
    emit("click");
    return;
  }
  armed.value = true;
  armTimer = window.setTimeout(disarm, 3000);
}
</script>

<template>
  <motion.button
    type="button"
    class="stage-button"
    :class="[variant, { armed, disabled }]"
    :disabled="disabled"
    :while-press="disabled ? {} : { scale: 0.97 }"
    :transition="Dynamics.quick"
    @click="onClick"
    @pointerleave="disarm"
  >
    <Icons v-if="icon" :kind="icon as never" size="small" color="var(--ico)" />
    <span v-if="text || armed">{{ armed ? confirm : text }}</span>
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
  background: var(--black-1-a);
  border: 1px solid var(--base-600);
  font-family: var(--font-primary);
  font-size: var(--main-font-size-4);
  font-weight: var(--font-weight-2);
  color: var(--text-muted);
  cursor: pointer;
  white-space: nowrap;
  transition: color 0.15s, background 0.15s, border-color 0.15s;
  corner-shape: bevel;
  border-radius: 8px 0 8px 0;
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

.stage-button.disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
