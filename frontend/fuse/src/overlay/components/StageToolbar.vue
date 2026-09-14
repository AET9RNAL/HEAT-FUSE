<script setup lang="ts">
import { computed, ref } from "vue";
import { AnimatePresence, motion } from "motion-v";
import StagePanel from "./StagePanel.vue";
import StageNumberField from "./StageNumberField.vue";
import Icons from "../../components/Icons.vue";
import { Dynamics } from "../../composables/useMotion";
import StageSlider from "../inspector/controls/StageSlider.vue";
import { vTip } from "../inspector/tooltip";
import { canRedo, canUndo, redo, undo } from "../history";
import { calibStage, formatCombo, hostHotkeys, overlays, sendHostRequest, stagePlugins, viewport } from "../overlayClient";
import { dim, grid, pluginListOpen, selectedId, type SnapMode } from "../stageState";

const SNAP_MODES: { value: SnapMode; label: string; tip: string }[] = [
  { value: "smart", label: "Smart", tip: "Snap to other overlays' edges and centres" },
  { value: "grid", label: "Grid", tip: "Snap to the grid step" },
  { value: "off", label: "Off", tip: "No snapping (hold Alt to bypass temporarily)" },
];

const snapOpen = ref(false);

const canvas = computed(() => {
  const v = viewport.value;
  return v ? `${v.w}×${v.h}` : `${window.innerWidth}×${window.innerHeight}`;
});

const count = computed(() => overlays.size);
const selCount = computed(() => (selectedId.value ? 1 : 0));

const snapLabel = computed(() => SNAP_MODES.find((m) => m.value === grid.mode)?.label ?? "Smart");

// Ctrl+L walks every active plugin's stages before it locks, so the button says
// which of the two the next press does.
// Mirrors FuseHost.toggleLock: every active plugin counts, calibrating or not.
const maxStages = computed(() =>
  Math.max(
    1,
    ...stagePlugins.value.filter((p) => p.status === "active").map((p) => p.calibration_stages || 1),
  ),
);

const hasNextStage = computed(() => calibStage.value < maxStages.value);
const doneLabel = computed(() =>
  hasNextStage.value ? `Next · ${calibStage.value}/${maxStages.value}` : "Done",
);
const doneTip = computed(() => {
  const combo = formatCombo(hostHotkeys.lock);
  return hasNextStage.value
    ? `Advance to the next calibration stage (${combo})`
    : `Lock the overlays and leave calibration (${combo})`;
});
</script>

<template>
  <div class="stage-toolbar stage-ui">
    <StagePanel class="bar" :cut="12" blur>
      <div class="bar-inner">
        <motion.button
          v-tip="'Show the alignment grid'"
          type="button"
          class="bar-btn"
          :class="{ active: grid.visible }"
          :initial="false"
          :animate="{
            backgroundColor: grid.visible ? 'var(--accent-200)' : 'rgba(255,255,255,0)',
          }"
          :transition="Dynamics.quick"
          :while-press="{ scale: 0.95 }"
          @click="grid.visible = !grid.visible"
        >
          <Icons kind="grid" size="normal" color="var(--ico)" />
        </motion.button>

        <StageNumberField
          class="grid-size"
          label=""
          :model-value="grid.size"
          :min="2"
          :max="512"
          suffix="px"
          title="Grid step"
          @update:model-value="grid.size = $event"
        />

        <div class="snap-wrap">
          <motion.button
            v-tip="'Snap mode'"
            type="button"
            class="bar-btn wide"
            :while-press="{ scale: 0.95 }"
            :transition="Dynamics.quick"
            @click="snapOpen = !snapOpen"
          >
            <span class="bar-text" :class="{ on: grid.mode !== 'off' }">Snap: {{ snapLabel }}</span>
          </motion.button>
          <AnimatePresence>
            <motion.div
              v-if="snapOpen"
              class="snap-menu"
              :initial="{ opacity: 0, y: 4 }"
              :animate="{ opacity: 1, y: 0 }"
              :exit="{ opacity: 0, y: 4 }"
              :transition="Dynamics.quick"
            >
              <button
                v-for="m in SNAP_MODES"
                :key="m.value"
                v-tip="m.tip"
                type="button"
                class="snap-item"
                :class="{ active: grid.mode === m.value }"
                @click="grid.mode = m.value; snapOpen = false"
              >{{ m.label }}</button>
            </motion.div>
          </AnimatePresence>
        </div>

        <span class="sep"></span>

        <motion.button
          v-tip="'Undo the last transform (Ctrl+Z)'"
          type="button"
          class="bar-btn"
          :disabled="!canUndo"
          :while-press="canUndo ? { scale: 0.95 } : {}"
          :transition="Dynamics.quick"
          @click="undo"
        >
          <Icons kind="arrow-left" size="small" color="var(--ico)" />
        </motion.button>
        <motion.button
          v-tip="'Redo (Ctrl+Y)'"
          type="button"
          class="bar-btn mirror"
          :disabled="!canRedo"
          :while-press="canRedo ? { scale: 0.95 } : {}"
          :transition="Dynamics.quick"
          @click="redo"
        >
          <Icons kind="arrow-left" size="small" color="var(--ico)" />
        </motion.button>

        <span class="sep"></span>

        <div v-tip="'Dim the game behind the overlays while calibrating'" class="dim-wrap">
          <Icons kind="transparency" size="normal" color="var(--text-muted)" />
          <StageSlider
            class="dim-slider"
            :model-value="Math.round(dim * 100)"
            :min="0"
            :max="100"
            :step="1"
            unit="%"
            :default="0"
            @live="dim = $event / 100"
            @commit="dim = $event / 100"
          />
        </div>

        <span class="readout">{{ canvas }} · {{ count }} el · {{ selCount }} sel</span>

        <span class="sep"></span>

        <motion.button
          v-tip="'Plugins on this stage'"
          type="button"
          class="bar-btn wide"
          :class="{ active: pluginListOpen }"
          :initial="false"
          :animate="{ backgroundColor: pluginListOpen ? 'var(--accent-200)' : 'rgba(255,255,255,0)' }"
          :transition="Dynamics.quick"
          :while-press="{ scale: 0.95 }"
          @click="pluginListOpen = !pluginListOpen"
        >
          <Icons kind="plugin" size="normal" color="var(--ico)" />
          <span class="bar-text">Plugins</span>
        </motion.button>

        <motion.button
          v-tip="doneTip"
          type="button"
          class="bar-btn wide done"
          :class="{ mirror: hasNextStage }"
          :while-press="{ scale: 0.95 }"
          :transition="Dynamics.quick"
          @click="sendHostRequest('toggle')"
        >
          <Icons :kind="hasNextStage ? 'arrow-left' : 'checkmark'" size="small" color="var(--ico)" />
          <span class="bar-text">{{ doneLabel }}</span>
        </motion.button>
      </div>
    </StagePanel>
  </div>
</template>

<style scoped>
.stage-toolbar {
  user-select: none;
  -webkit-user-select: none;
  position: fixed;
  left: 50%;
  bottom: 24px;
  transform: translateX(-50%);
  z-index: 20;
  color: var(--text-main);
  font-family: var(--font-primary);
}

.bar-inner {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-2);
}

.bar-btn {
  --ico: var(--text-muted);
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-1);
  height: 28px;
  min-width: 28px;
  padding: 0 var(--space-1);
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  corner-shape: bevel;
  border-radius: 8px 0 8px 0;
}

.bar-btn.wide { padding: 0 var(--space-2); }

.bar-btn.mirror :deep(.icon) { transform: scaleX(-1); }

.bar-btn:hover:not(:disabled) {
  --ico: var(--text-main);
  color: var(--text-main);
  background: rgba(255, 255, 255, 0.06);
}

.bar-btn.active {
  --ico: var(--base-1000);
  color: var(--base-1000);
}

.bar-btn.active:hover {
  --ico: var(--base-1000);
  color: var(--base-1000);
}

.bar-btn.done {
  --ico: var(--accent-200);
  color: var(--accent-200);
}

.bar-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.bar-text {
  font-size: var(--main-font-size-4);
  font-weight: var(--font-weight-2);
  white-space: nowrap;
}

.bar-text.on { color: var(--accent-200); }

.grid-size {
  width: 68px;
  flex: none;
}

.snap-wrap { position: relative; }

.snap-menu {
  position: absolute;
  left: 0;
  bottom: calc(100% + var(--space-2));
  display: flex;
  flex-direction: column;
  min-width: 96px;
  padding: var(--space-0);
  box-sizing: border-box;
  background: hsla(142, 1%, 6%, 0.97);
  border: 1px solid var(--base-600);
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.6);
  corner-shape: bevel;
  border-radius: 8px 0 8px 0;
}

.snap-item {
  height: 24px;
  padding: 0 var(--space-2);
  border: none;
  background: transparent;
  text-align: left;
  font-family: var(--font-primary);
  font-size: var(--main-font-size-4);
  color: var(--text-muted);
  cursor: pointer;
  corner-shape: bevel;
  border-radius: 6px 0 6px 0;
}

.snap-item:hover { background: rgba(255, 255, 255, 0.06); color: var(--text-main); }
.snap-item.active { color: var(--accent-200); }

.dim-wrap {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 130px;
}

.dim-slider { flex: 1; min-width: 0; }

.readout {
  padding: 0 var(--space-2);
  font-family: var(--font-microcopy);
  font-size: var(--main-font-size-4);
  color: var(--base-600);
  white-space: nowrap;
  user-select: none;
}

.sep {
  width: 1px;
  height: 18px;
  background: var(--black-3);
  margin: 0 var(--space-1);
}
</style>
