<script setup lang="ts">
import { computed } from "vue";
import { motion } from "motion-v";
import StagePanel from "../components/StagePanel.vue";
import WindowView from "./parts/WindowView.vue";
import WindowStatus from "./parts/WindowStatus.vue";
import { focusStageForClick, isObsMode, sendWindowCommand } from "../overlayClient";
import { mainOverlayArea, overlayShift } from "../screens";
import { launcher, raiseWindow, stageKeyboard } from "./appsState";
import { TASKBAR_STRIP, workArea, type Rect } from "./windowGeometry";
import type { WindowDescriptor } from "./types";
import { Dynamics } from "../../composables/useMotion";

const props = defineProps<{ descriptor: WindowDescriptor; z: number }>();

/** An OBS view shows the frame and its data, and takes no input. */
const viewOnly = isObsMode();

/** The work area of the main display. The taskbar strip stays free while the taskbar is not hidden. */
const area = computed<Rect>(() => workArea(mainOverlayArea(), launcher.edge, launcher.hidden ? 0 : TASKBAR_STRIP));

const style = computed(() => {
  const r = area.value;
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

const size = computed(() => ({ w: area.value.w, h: area.value.h }));
const focused = computed(() => props.descriptor.focused && (viewOnly || stageKeyboard.value));

function command(cmd: "restart" | "close"): void {
  sendWindowCommand(props.descriptor.windowId, cmd);
}

/** The pointer reaches the frame only on a `fuse-hit` part. The frame then gets the keyboard. */
function onPointerDown(): void {
  if (viewOnly || props.descriptor.minimized) return;
  if (!props.descriptor.focused) {
    raiseWindow(props.descriptor.windowId);
    sendWindowCommand(props.descriptor.windowId, "focus");
  }
  focusStageForClick();
}
</script>

<template>
  <motion.div
    class="fuse-frame"
    :class="{ 'view-only': viewOnly }"
    :inert="descriptor.minimized"
    :style="style"
    :initial="{ opacity: 0 }"
    :animate="{ opacity: descriptor.minimized ? 0 : 1 }"
    :exit="{ opacity: 0 }"
    :transition="Dynamics.quick"
    @pointerdown.capture="onPointerDown"
  >
    <WindowView v-show="descriptor.status === 'open'" :descriptor="descriptor" :size="size" :focused="focused" />
    <StagePanel v-if="descriptor.status !== 'open'" class="frame-status fuse-hit" :cut="18" blur dense>
      <WindowStatus
        :status="descriptor.status"
        :plugin-id="descriptor.pluginId"
        closable
        @restart="command('restart')"
        @close="command('close')"
      />
    </StagePanel>
  </motion.div>
</template>

<style scoped>
/* No chrome and no fill: the view draws all of it. The clear areas pass the mouse to the game. */
.fuse-frame {
  position: absolute;
  display: flex;
  pointer-events: none;
  color: var(--text-main);
  font-family: var(--font-primary);
}

.fuse-frame :deep(.fuse-hit) {
  pointer-events: auto;
}

.fuse-frame.view-only :deep(.fuse-hit) {
  pointer-events: none;
}

.frame-status {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 320px;
  height: 160px;
  transform: translate(-50%, -50%);
}
</style>
