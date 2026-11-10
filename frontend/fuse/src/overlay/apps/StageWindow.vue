<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { motion } from "motion-v";
import StagePanel from "../components/StagePanel.vue";
import StageButton from "../inspector/controls/StageButton.vue";
import WindowTitleBar from "./parts/WindowTitleBar.vue";
import WindowResizeEdges from "./parts/WindowResizeEdges.vue";
import WindowView from "./parts/WindowView.vue";
import { focusStageForClick, isObsMode, sendWindowCommand, sendWindowRect } from "../overlayClient";
import { mainOverlayArea, overlayAreas, overlayShift } from "../screens";
import { useWindowDrag } from "../composables/useWindowDrag";
import { useWindowResize } from "../composables/useWindowResize";
import type { Box } from "../composables/useSnapping";
import { launcher, orderedWindows, raiseWindow, snapPreview, stageKeyboard, windows } from "./appsState";
import {
  TASKBAR_STRIP,
  TITLE_H,
  areaOfRect,
  keepReachable,
  placeNew,
  workArea,
  type Rect,
} from "./windowGeometry";
import type { WindowDescriptor } from "./types";
import { Dynamics } from "../../composables/useMotion";
import { useI18n } from "../../composables/useI18n";

const props = defineProps<{ descriptor: WindowDescriptor; z: number; cascade: number }>();

const { t } = useI18n();

/** An OBS view shows the window and its data, and takes no input. */
const viewOnly = isObsMode();

/** The rect during a drag or a resize. */
const live = ref<Rect | null>(null);

function sameArea(a: Rect, b: Rect): boolean {
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}

/** The display minus the taskbar strip. The taskbar sits on the main display only, and takes room only when it stays. */
function workAreaFor(display: Rect): Rect {
  const reserve = !launcher.autoHide && sameArea(display, mainOverlayArea()) ? TASKBAR_STRIP : 0;
  return workArea(display, launcher.edge, reserve);
}

/** The restore rect: the runtime's, else a new place on the main display. */
const baseRect = computed<Rect>(
  () => props.descriptor.rect ?? placeNew(workAreaFor(mainOverlayArea()), props.descriptor.size, props.cascade),
);

const display = computed<Rect>(() => areaOfRect(overlayAreas(), baseRect.value) ?? mainOverlayArea());
const maxRect = computed<Rect | null>(() => (props.descriptor.maximized ? workAreaFor(display.value) : null));
const shown = computed<Rect>(() => live.value ?? maxRect.value ?? baseRect.value);

// OBS has no keyboard: it shows the window the runtime has as active.
const focused = computed(() => props.descriptor.focused && (viewOnly || stageKeyboard.value));
const bodySize = computed(() => ({ w: shown.value.w, h: Math.max(0, shown.value.h - TITLE_H) }));

const style = computed(() => {
  const r = shown.value;
  // The stage window offset, or the OBS viewport.
  const off = overlayShift();
  return {
    left: `${r.x - off.x}px`,
    top: `${r.y - off.y}px`,
    width: `${r.w}px`,
    height: `${r.h}px`,
    zIndex: String(props.z + 1),
  };
});

function commit(rect: Rect): void {
  const w = windows.get(props.descriptor.windowId);
  if (w) w.rect = rect;
  sendWindowRect(props.descriptor.windowId, rect);
}

function command(cmd: "minimize" | "maximize" | "restore" | "close" | "restart"): void {
  sendWindowCommand(props.descriptor.windowId, cmd);
}

function toggleMax(): void {
  command(props.descriptor.maximized ? "restore" : "maximize");
}

/** The other windows on show, as snap targets. */
function peers(): Box[] {
  return orderedWindows.value
    .filter((w) => w.windowId !== props.descriptor.windowId && !w.minimized && !w.maximized && w.rect)
    .map((w) => ({ left: w.rect!.x, top: w.rect!.y, right: w.rect!.x + w.rect!.w, bottom: w.rect!.y + w.rect!.h }));
}

const drag = useWindowDrag({
  rect: () => baseRect.value,
  maximizedRect: () => maxRect.value,
  peers,
  workAreaFor,
  onMove(rect, preview) {
    live.value = rect;
    snapPreview.value = preview;
  },
  onEnd(rect, zone, preview, fromMax) {
    live.value = null;
    snapPreview.value = null;
    if (zone === "maximize") {
      if (!fromMax) command("maximize");
      return;
    }
    commit(preview ? preview.rect : keepReachable(rect, overlayAreas()));
    if (fromMax) command("restore");
  },
});

const resize = useWindowResize({
  rect: () => baseRect.value,
  min: () => props.descriptor.minSize,
  max: () => props.descriptor.maxSize,
  onMove(rect) {
    live.value = rect;
  },
  onEnd(rect) {
    live.value = null;
    commit(keepReachable(rect, overlayAreas()));
  },
});

/** A click anywhere in the window: it comes to the top and gets the keyboard. */
function onPointerDown(): void {
  if (viewOnly || props.descriptor.minimized) return;
  if (!props.descriptor.focused) {
    raiseWindow(props.descriptor.windowId);
    sendWindowCommand(props.descriptor.windowId, "focus");
  }
  focusStageForClick();
}

onMounted(() => {
  if (!viewOnly && !props.descriptor.rect) commit(keepReachable(baseRect.value, overlayAreas()));
});
</script>

<template>
  <motion.div
    class="fuse-window"
    :class="{ minimized: descriptor.minimized, 'view-only': viewOnly }"
    :inert="descriptor.minimized"
    :style="style"
    :initial="{ opacity: 0, scale: 0.98 }"
    :animate="{ opacity: descriptor.minimized ? 0 : 1, scale: descriptor.minimized ? 0.96 : 1 }"
    :exit="{ opacity: 0, scale: 0.98 }"
    :transition="Dynamics.quick"
    @pointerdown.capture="onPointerDown"
  >
    <StagePanel class="window-panel" :class="{ focused }" :cut="18" blur dense>
      <WindowTitleBar
        :title="descriptor.title"
        :plugin-id="descriptor.pluginId"
        :focused="focused"
        :maximized="descriptor.maximized"
        :resizable="descriptor.resizable"
        @grab="drag.start"
        @toggle-max="toggleMax"
        @minimize="command('minimize')"
        @close="command('close')"
      />
      <div class="body">
        <WindowView v-show="descriptor.status === 'open'" :descriptor="descriptor" :size="bodySize" :focused="focused" />
        <div v-if="descriptor.status === 'waiting'" class="status">
          <span class="status-title">{{ t("stageapps.window.starting") }}</span>
        </div>
        <div v-else-if="descriptor.status === 'crashed'" class="status">
          <span class="status-title crashed">{{ t("stageapps.window.stoppedTitle") }}</span>
          <span class="status-note">{{ t("stageapps.window.stoppedNote", { plugin: descriptor.pluginId }) }}</span>
          <div class="status-action">
            <StageButton :text="t('stageapps.window.restart')" variant="accent" @click="command('restart')" />
          </div>
        </div>
      </div>
    </StagePanel>
    <WindowResizeEdges v-if="!viewOnly && descriptor.resizable && !descriptor.maximized" @start="resize.start" />
  </motion.div>
</template>

<style scoped>
.fuse-window {
  position: absolute;
  display: flex;
  pointer-events: auto;
  color: var(--text-main);
  font-family: var(--font-primary);
}

/* A view can set pointer-events: auto on its own parts. A minimized window is also inert */
.fuse-window.minimized,
.fuse-window.view-only {
  pointer-events: none;
}

.window-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.fuse-window .window-panel {
  border-color: var(--black-3);
}

.fuse-window .window-panel.focused {
  border-color: var(--base-600);
}

.body {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--black-3) transparent;
}

.status {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  padding: var(--space-4);
  text-align: center;
}

.status-title {
  font-family: var(--font-microcopy);
  font-size: var(--main-font-size-4);
  font-weight: var(--font-weight-2);
  letter-spacing: 0.04em;
  color: var(--text-muted);
}

.status-title.crashed {
  color: var(--error-highlight);
}

.status-note {
  font-family: var(--font-microcopy);
  font-size: var(--main-font-size-5);
  color: var(--text-muted);
}

.status-action {
  width: 120px;
  margin-top: var(--space-1);
}
</style>
