<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { motion } from "motion-v";
import eKey from "../../../components/ui/eKey.vue";
import { Dynamics } from "../../../composables/useMotion";

const STANDALONE = new Set<string>([
  ...Array.from({ length: 24 }, (_, i) => `f${i + 1}`),
  "home", "end", "pageup", "pagedown", "insert", "delete", "enter", "space",
]);
const MODIFIER_KEYS = ["Control", "Alt", "Shift", "Meta"];
// Modifiers a hold bind may use alone. Meta opens the Start menu, so it is left out.
const BARE_MODIFIER: Record<string, string> = { Control: "ctrl", Alt: "alt", Shift: "shift" };
const MODIFIERS = new Set(["ctrl", "alt", "shift", "meta"]);
const REJECT_MS = 1600;

const props = withDefaults(
  defineProps<{
    modelValue: string;
    disabled?: boolean;
    hold?: boolean;
    /** Starts to capture at once, with no click. */
    autostart?: boolean;
    /** Backspace commits an empty combo: no binding. */
    clearable?: boolean;
  }>(),
  {
    disabled: false,
    hold: false,
    autostart: false,
    clearable: false,
  },
);

/** `capture`: true while the field listens for a combo, so the host can pause its hotkeys. */
const emit = defineEmits<{ commit: [combo: string]; capture: [on: boolean] }>();

const el = ref<HTMLElement | null>(null);
const capturing = ref(false);
const hovered = ref(false);
const held = ref<string[]>([]);
const rejected = ref("");
let rejectTimer: ReturnType<typeof setTimeout> | null = null;
// The last modifier pressed and every modifier down at that moment.
let lastMod = "";
let modsAtLast: string[] = [];

const borderColor = computed(() => (capturing.value ? "var(--accent-200)" : "var(--base-600)"));

type Part = { label: string; variant: "functional" | "standalone" | "error" };

function toPart(p: string): Part {
  return { label: p.toUpperCase(), variant: MODIFIERS.has(p) ? "functional" : "standalone" };
}

// Capture shows what is down so far. A refused key stays on screen in red.
const parts = computed<Part[]>(() => {
  if (rejected.value) return [...held.value.map(toPart), { label: rejected.value.toUpperCase(), variant: "error" }];
  if (capturing.value) return held.value.map(toPart);
  if (!props.modelValue) return [];
  const all = props.modelValue.split("+");
  // A bare modifier is the bound key itself, so it renders as the main key.
  return all.map((p, i) => (i === all.length - 1 ? { label: p.toUpperCase(), variant: "standalone" } : toPart(p)));
});

function modsOf(e: KeyboardEvent): string[] {
  const mods: string[] = [];
  if (e.ctrlKey) mods.push("ctrl");
  if (e.altKey) mods.push("alt");
  if (e.shiftKey) mods.push("shift");
  return mods;
}

function reject(key: string): void {
  stop();
  rejected.value = key;
  if (rejectTimer) clearTimeout(rejectTimer);
  rejectTimer = setTimeout(() => {
    rejected.value = "";
    held.value = [];
    rejectTimer = null;
  }, REJECT_MS);
}

function finish(combo: string): void {
  stop();
  held.value = [];
  emit("commit", combo);
}

function onKeyDown(e: KeyboardEvent): void {
  e.preventDefault();
  e.stopPropagation();
  if (MODIFIER_KEYS.includes(e.key)) {
    if (!e.repeat) {
      lastMod = BARE_MODIFIER[e.key] ?? "";
      modsAtLast = modsOf(e);
    }
    held.value = modsOf(e);
    return;
  }
  if (e.key === "Escape") {
    stop();
    held.value = [];
    return;
  }
  if (e.key === "Backspace" && props.clearable && !modsOf(e).length) {
    finish("");
    return;
  }
  const key = e.key === " " ? "space" : e.key.toLowerCase();
  if (!/^[a-z0-9]$/.test(key) && !STANDALONE.has(key)) {
    reject(key);
    return;
  }
  finish([...modsOf(e), key].join("+"));
}

function onKeyUp(e: KeyboardEvent): void {
  if (!MODIFIER_KEYS.includes(e.key)) return;
  if (props.hold && lastMod) {
    finish([...modsAtLast.filter((m) => m !== lastMod), lastMod].join("+"));
    return;
  }
  held.value = modsOf(e);
}

function onOutsidePointerDown(e: PointerEvent): void {
  if (el.value?.contains(e.target as Node)) return;
  stop();
  held.value = [];
}

function start(): void {
  if (rejectTimer) {
    clearTimeout(rejectTimer);
    rejectTimer = null;
  }
  rejected.value = "";
  held.value = [];
  lastMod = "";
  modsAtLast = [];
  capturing.value = true;
  emit("capture", true);
  document.addEventListener("keydown", onKeyDown, true);
  document.addEventListener("keyup", onKeyUp, true);
  document.addEventListener("pointerdown", onOutsidePointerDown, true);
}

function stop(): void {
  if (capturing.value) emit("capture", false);
  capturing.value = false;
  document.removeEventListener("keydown", onKeyDown, true);
  document.removeEventListener("keyup", onKeyUp, true);
  document.removeEventListener("pointerdown", onOutsidePointerDown, true);
}

function onClick(): void {
  if (props.disabled) return;
  if (capturing.value) {
    stop();
    held.value = [];
    return;
  }
  start();
}

onMounted(() => {
  if (props.autostart && !props.disabled) start();
});

onBeforeUnmount(() => {
  stop();
  if (rejectTimer) clearTimeout(rejectTimer);
});
</script>

<template>
  <div ref="el" class="stage-keybind-wrap">
    <motion.div
      class="stage-keybind"
      :class="{ capturing, hovered: hovered || capturing, disabled }"
      :initial="false"
      :animate="{ borderColor }"
      :transition="Dynamics.quick"
      @mouseenter="hovered = true"
      @mouseleave="hovered = false"
      @click="onClick"
    >
      <span v-if="!parts.length && !capturing" class="unbound">Unbound</span>
      <template v-for="(part, i) in parts" :key="part.label + i">
        <span v-if="i > 0" class="plus">+</span>
        <eKey :label="part.label" :variant="part.variant" size="mini" />
      </template>
      <!-- The idle key waits for the next keystroke. -->
      <template v-if="capturing">
        <span v-if="parts.length" class="plus">+</span>
        <eKey size="mini" />
      </template>
    </motion.div>
  </div>
</template>

<style scoped>
.stage-keybind {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 2px;
  height: 26px;
  padding: 0 var(--space-1);
  box-sizing: border-box;
  background: var(--black-1-a);
  border: 1px solid var(--base-600);
  cursor: pointer;
  user-select: none;
  corner-shape: bevel;
  border-radius: 6px 0 6px 0;
  transition: background 0.15s;
}

.stage-keybind.hovered {
  background: var(--black-3-a);
}

.plus {
  font-family: var(--font-primary);
  font-size: var(--main-font-size-4);
  font-weight: var(--font-weight-2);
  color: var(--text-main);
  line-height: 1;
}

.unbound {
  padding-right: var(--space-1);
  font-family: var(--font-microcopy);
  font-size: var(--main-font-size-4);
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.stage-keybind.disabled {
  opacity: 0.4;
  pointer-events: none;
}
</style>
