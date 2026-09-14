<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from "vue";
import { motion } from "motion-v";
import { Dynamics } from "../../../composables/useMotion";

const STANDALONE = new Set<string>([
  ...Array.from({ length: 24 }, (_, i) => `f${i + 1}`),
  "home", "end", "pageup", "pagedown", "insert", "delete", "enter", "space",
]);

withDefaults(defineProps<{ modelValue: string; disabled?: boolean }>(), { disabled: false });

const emit = defineEmits<{ commit: [combo: string] }>();

const capturing = ref(false);
const held = ref<string[]>([]);

const borderColor = computed(() => (capturing.value ? "var(--accent-200)" : "var(--base-600)"));

function modsOf(e: KeyboardEvent): string[] {
  const mods: string[] = [];
  if (e.ctrlKey) mods.push("ctrl");
  if (e.altKey) mods.push("alt");
  if (e.shiftKey) mods.push("shift");
  return mods;
}

function onKeyDown(e: KeyboardEvent): void {
  e.preventDefault();
  e.stopPropagation();
  if (["Control", "Alt", "Shift", "Meta"].includes(e.key)) {
    held.value = modsOf(e);
    return;
  }
  if (e.key === "Escape") {
    stop();
    return;
  }
  const key = e.key === " " ? "space" : e.key.toLowerCase();
  if (!/^[a-z0-9]$/.test(key) && !STANDALONE.has(key)) return;
  const combo = [...modsOf(e), key].join("+");
  stop();
  emit("commit", combo);
}

function onKeyUp(e: KeyboardEvent): void {
  if (["Control", "Alt", "Shift", "Meta"].includes(e.key)) held.value = modsOf(e);
}

function start(): void {
  if (capturing.value) return;
  capturing.value = true;
  held.value = [];
  document.addEventListener("keydown", onKeyDown, true);
  document.addEventListener("keyup", onKeyUp, true);
}

function stop(): void {
  capturing.value = false;
  held.value = [];
  document.removeEventListener("keydown", onKeyDown, true);
  document.removeEventListener("keyup", onKeyUp, true);
}

onBeforeUnmount(stop);
</script>

<template>
  <motion.div
    class="stage-keybind"
    :class="{ capturing, disabled }"
    :initial="false"
    :animate="{ borderColor }"
    :transition="Dynamics.quick"
    @click="!disabled && start()"
    @blur="stop"
  >
    <span class="combo">
      {{ capturing ? (held.length ? `${held.join("+")}+…` : "press keys") : modelValue || "unbound" }}
    </span>
  </motion.div>
</template>

<style scoped>
.stage-keybind {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 26px;
  padding: 0 var(--space-2);
  box-sizing: border-box;
  background: var(--black-1-a);
  border: 1px solid var(--base-600);
  cursor: pointer;
  user-select: none;
  corner-shape: bevel;
  border-radius: 8px 0 8px 0;
}

.combo {
  font-family: var(--font-microcopy);
  font-size: var(--main-font-size-4);
  color: var(--accent-200);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.stage-keybind.capturing .combo {
  color: var(--text-muted);
  font-style: italic;
  text-transform: none;
}

.stage-keybind.disabled {
  opacity: 0.4;
  pointer-events: none;
}
</style>
