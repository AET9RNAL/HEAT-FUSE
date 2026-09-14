<script setup lang="ts">
/**
 * One stage notification card. From eNotification: the countdown bar, auto-
 * dismiss and the click-to-expand body. Added: a segmented icon + title + close
 * header, and the countdown pauses while hovered.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { motion } from "motion-v";
import Icons, { type IconKind } from "../../components/Icons.vue";
import { vTip } from "../inspector/tooltip";
import type { StageNotification, StageNotificationType } from "../notifications";

const props = defineProps<{ notification: StageNotification }>();
const emit = defineEmits<{ close: [] }>();

const ACCENT: Record<StageNotificationType, string> = {
  info: "var(--text-main)",
  success: "var(--light-green)",
  warning: "var(--canary-yellow)",
  error: "var(--error-highlight)",
};

const DEFAULT_ICON: Record<StageNotificationType, IconKind> = {
  info: "about",
  success: "checkmark",
  warning: "warning",
  error: "warning",
};

const accent = computed(() => ACCENT[props.notification.type] ?? ACCENT.info);
const icon = computed<IconKind>(
  () => (props.notification.icon as IconKind | undefined) ?? DEFAULT_ICON[props.notification.type] ?? "about",
);
const timed = computed(() => props.notification.duration > 0);

const TICK = 50;
const progress = ref(1);
const hovered = ref(false);
const expanded = ref(false);
let timer: ReturnType<typeof setInterval> | null = null;

function stopTimer(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

// Resumes from wherever it paused, so hovering never costs the reader time.
function startTimer(): void {
  stopTimer();
  if (!timed.value || hovered.value || expanded.value) return;
  const step = TICK / props.notification.duration;
  timer = setInterval(() => {
    progress.value = Math.max(0, progress.value - step);
    if (progress.value <= 0) {
      stopTimer();
      emit("close");
    }
  }, TICK);
}

function onEnter(): void {
  hovered.value = true;
  stopTimer();
}

function onLeave(): void {
  hovered.value = false;
  startTimer();
}

function toggleExpand(): void {
  if (!props.notification.message) return;
  expanded.value = !expanded.value;
  if (expanded.value) stopTimer();
  else startTimer();
}

// The same id sent again: fresh content, fresh countdown.
watch(
  () => props.notification.rev,
  () => {
    progress.value = 1;
    startTimer();
  },
);

onMounted(startTimer);
onBeforeUnmount(stopTimer);
</script>

<template>
  <div
    class="notice stage-notice"
    :style="{ '--accent': accent }"
    @pointerenter="onEnter"
    @pointerleave="onLeave"
  >
    <svg v-if="timed" class="notice-timer" viewBox="0 0 100 2" preserveAspectRatio="none">
      <line x1="0" y1="1" :x2="progress * 100" y2="1" :stroke="accent" stroke-width="2" />
    </svg>

    <div class="notice-header" :class="{ divided: !!notification.message }">
      <div class="notice-heading">
        <Icons :kind="icon" size="small" color="var(--accent)" />
        <span class="notice-title">{{ notification.title }}</span>
      </div>
      <motion.button
        v-tip="'Dismiss'"
        type="button"
        class="notice-close"
        :while-press="{ scale: 0.88 }"
        @click.stop="emit('close')"
      >
        <Icons kind="cross" size="small" color="var(--ico)" />
      </motion.button>
    </div>

    <div v-if="notification.message" class="notice-body" @click="toggleExpand">
      <span class="notice-message" :class="{ expanded }">{{ notification.message }}</span>
    </div>
  </div>
</template>

<style scoped>
.notice {
  --accent: var(--text-main);
  position: relative;
  width: 320px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--black-1-a);
  border: 1px solid var(--base-600);
  corner-shape: bevel;
  border-radius: 8px 0 8px 0;
  pointer-events: auto;
  user-select: none;
}

.notice::before {
  content: "";
  position: absolute;
  inset: 0;
  z-index: 0;
  backdrop-filter: blur(35px);
  -webkit-backdrop-filter: blur(35px);
  pointer-events: none;
}

.notice-timer {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 2px;
  display: block;
  z-index: 2;
}

/* Segmented like the overlay info tab: tinted heading, divided close action. */
.notice-header {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: stretch;
  min-height: 32px;
  background: color-mix(in srgb, var(--accent) 8%, transparent);
}

.notice-header.divided {
  border-bottom: 1px solid var(--base-600);
}

.notice-heading {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: calc(var(--space-2) + 2px) var(--space-3) var(--space-2);
}

.notice-title {
  flex: 1;
  min-width: 0;
  font-family: var(--font-primary);
  font-size: var(--main-font-size-4);
  font-weight: var(--font-weight-2);
  line-height: 1.2;
  color: var(--accent);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.notice-close {
  --ico: var(--text-muted);
  flex: none;
  width: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: none;
  border-left: 1px solid var(--base-600);
  background: var(--black-2-a);
  cursor: pointer;
  transition: background 0.15s;
}

.notice-close:hover {
  --ico: var(--text-main);
  background: var(--black-3-a);
}

.notice-body {
  position: relative;
  z-index: 1;
  padding: var(--space-2) var(--space-3) var(--space-3);
  cursor: pointer;
}

.notice-message {
  display: block;
  font-family: var(--font-microcopy);
  font-size: var(--secondary-font-size-4);
  font-weight: var(--font-weight-3);
  line-height: 1.4;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.notice-message.expanded {
  white-space: normal;
  overflow: visible;
  text-overflow: clip;
  overflow-wrap: anywhere;
}
</style>
