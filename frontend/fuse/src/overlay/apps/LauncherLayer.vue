<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { AnimatePresence, motion } from "motion-v";
import StageTaskbar from "./StageTaskbar.vue";
import StageConsole from "./StageConsole.vue";
import { gameCursorHeld, hostState } from "../overlayClient";
import { mainScreen } from "../screens";
import { consoleOpen, launcher, taskbarFull, taskbarHeld, taskbarMenuOpen, taskbarSettled } from "./appsState";
import { TASKBAR_GAP, TASKBAR_SIZE } from "./windowGeometry";
import { Dynamics } from "../../composables/useMotion";

/** The cursor must stay this close to the edge or on the dim bar, this long, to reveal the taskbar. */
const REVEAL_PX = 2;
const DWELL_MS = 150;
const HIDE_MS = 600;
const DIM_OPACITY = 0.5;
const DIM_SLIDE_PX = TASKBAR_GAP;
const SLIDE_PX = 16;

const revealed = ref(false);
const calibrating = computed(() => hostState.value === "calibrate");
const full = computed(() => revealed.value || taskbarMenuOpen.value || consoleOpen.value || taskbarHeld.value);

watch(
  () => full.value && !calibrating.value,
  (f) => {
    taskbarFull.value = f;
  },
  { immediate: true },
);

const vertical = computed(() => launcher.edge === "left" || launcher.edge === "right");

const track = computed(() => {
  const a = mainScreen();
  const s = TASKBAR_SIZE;
  const g = TASKBAR_GAP;
  switch (launcher.edge) {
    case "top":
      return { x: a.x + g, y: a.y + g, w: a.w - 2 * g, h: s };
    case "left":
      return { x: a.x + g, y: a.y + g, w: s, h: a.h - 2 * g };
    case "right":
      return { x: a.x + a.w - g - s, y: a.y + g, w: s, h: a.h - 2 * g };
    default:
      return { x: a.x + g, y: a.y + a.h - g - s, w: a.w - 2 * g, h: s };
  }
});

const trackStyle = computed(() => ({
  left: `${track.value.x}px`,
  top: `${track.value.y}px`,
  width: `${track.value.w}px`,
  height: `${track.value.h}px`,
}));

const barEl = ref<HTMLElement | null>(null);

/** A move toward the taskbar's own edge. */
function towardEdge(px: number): { x: number; y: number } {
  switch (launcher.edge) {
    case "top":
      return { x: 0, y: -px };
    case "left":
      return { x: -px, y: 0 };
    case "right":
      return { x: px, y: 0 };
    default:
      return { x: 0, y: px };
  }
}

/** Calibration, and the hidden taskbar. */
const away = computed(() => ({ ...towardEdge(SLIDE_PX), opacity: 0 }));
const pose = computed(() => {
  if (full.value) return { x: 0, y: 0, opacity: 1 };
  return launcher.hidden ? away.value : { ...towardEdge(DIM_SLIDE_PX), opacity: DIM_OPACITY };
});

function onSettled(): void {
  taskbarSettled.value++;
}

let dwellTimer: number | null = null;
let hideTimer: number | null = null;

function clearDwell(): void {
  if (dwellTimer !== null) window.clearTimeout(dwellTimer);
  dwellTimer = null;
}

function clearHide(): void {
  if (hideTimer !== null) window.clearTimeout(hideTimer);
  hideTimer = null;
}

function atEdge(x: number, y: number): boolean {
  const a = mainScreen();
  if (x < a.x || x > a.x + a.w || y < a.y || y > a.y + a.h) return false;
  switch (launcher.edge) {
    case "top":
      return y <= a.y + REVEAL_PX;
    case "left":
      return x <= a.x + REVEAL_PX;
    case "right":
      return x >= a.x + a.w - REVEAL_PX;
    default:
      return y >= a.y + a.h - REVEAL_PX;
  }
}

function nearBar(x: number, y: number, m: number): boolean {
  const r = barEl.value?.getBoundingClientRect();
  if (!r) return false;
  return x >= r.left - m && x <= r.right + m && y >= r.top - m && y <= r.bottom + m;
}

/** try not to reveal when cursor is held by other process */
const hoverOff = computed(() => calibrating.value || launcher.hidden || gameCursorHeld.value);

// Forwarded mouse moves reach the page while the stage is click-through.
function onMouseMove(e: MouseEvent): void {
  if (hoverOff.value) return;
  const x = e.clientX;
  const y = e.clientY;
  if (!revealed.value) {
    const inZone = atEdge(x, y) || nearBar(x, y, 0);
    if (!inZone) {
      clearDwell();
      return;
    }
    dwellTimer ??= window.setTimeout(() => {
      dwellTimer = null;
      revealed.value = true;
    }, DWELL_MS);
    return;
  }
  // The margin covers the gap between the bar and its edge, so the bar stays out on the way between them.
  if (atEdge(x, y) || nearBar(x, y, TASKBAR_GAP * 2) || taskbarMenuOpen.value) {
    clearHide();
    return;
  }
  hideTimer ??= window.setTimeout(() => {
    hideTimer = null;
    if (!taskbarMenuOpen.value) revealed.value = false;
  }, HIDE_MS);
}

watch(hoverOff, (off) => {
  if (!off) return;
  revealed.value = false;
  clearDwell();
  clearHide();
});

onMounted(() => window.addEventListener("mousemove", onMouseMove));

onBeforeUnmount(() => {
  window.removeEventListener("mousemove", onMouseMove);
  clearDwell();
  clearHide();
  taskbarFull.value = false;
});
</script>

<template>
  <div class="launcher-layer">
    <div class="taskbar-track" :class="{ vertical }" :style="trackStyle">
      <AnimatePresence>
        <motion.div
          v-if="!calibrating"
          key="taskbar"
          class="taskbar-slot"
          :class="{ full }"
          :initial="away"
          :animate="pose"
          :exit="away"
          :transition="Dynamics.snappy"
          @animation-complete="onSettled"
        >
          <div ref="barEl" v-ftue="'stage-taskbar'" class="taskbar-box">
            <StageTaskbar :edge="launcher.edge" />
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
    <AnimatePresence>
      <StageConsole v-if="consoleOpen && !calibrating" key="console" />
    </AnimatePresence>
  </div>
</template>

<style scoped>
/* Above overlays, windows, perf bar (25), notices (30) and the tooltips are on top. */
.launcher-layer {
  position: absolute;
  inset: 0;
  z-index: 28;
  isolation: isolate;
  pointer-events: none;
}

.taskbar-track {
  position: absolute;
  display: flex;
  justify-content: center;
  align-items: stretch;
}

.taskbar-track.vertical {
  flex-direction: column;
}

/* Dim or hidden, the bar lets clicks through to the game. */
.taskbar-slot {
  display: flex;
  max-width: 100%;
  max-height: 100%;
  pointer-events: none;
  color: var(--text-main);
}

.taskbar-slot.full {
  pointer-events: auto;
}

.taskbar-box {
  flex: 1;
  display: flex;
  min-width: 0;
  min-height: 0;
}
</style>
