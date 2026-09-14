<script setup lang="ts">
import { computed } from "vue";
import { motion } from "motion-v";
import Icons from "../../components/Icons.vue";
import { Dynamics } from "../../composables/useMotion";
import { vTip } from "../inspector/tooltip";
import { calibStage, formatCombo, hostHotkeys, stagePlugins } from "../overlayClient";
import type { OverlayDescriptor } from "../types";

const props = withDefaults(defineProps<{ descriptor: OverlayDescriptor; selected?: boolean }>(), {
  selected: false,
});

const plugin = computed(() => stagePlugins.value.find((p) => p.plugin_id === props.descriptor.pluginId));

const name = computed(() => plugin.value?.name ?? props.descriptor.overlayId.split(":")[1] ?? props.descriptor.overlayId);

// The host stage is the max across plugins, so a plugin with fewer stages rests on its last one.
const stage = computed(() => {
  const p = plugin.value;
  if (!p?.requires_calibration) return null;
  const total = Math.max(1, p.calibration_stages);
  return { current: Math.min(calibStage.value, total), total };
});

const stageTip = computed(() =>
  stage.value
    ? `Calibration stage ${stage.value.current} of ${stage.value.total}. ${formatCombo(hostHotkeys.lock)} advances, then locks.`
    : undefined,
);

const interactiveTip = computed(
  () => `Takes clicks and input in FUSE interactive mode (${formatCombo(hostHotkeys.interactive)}).`,
);
</script>

<template>
  <!-- Zero-height host spanning the overlay: gives the tab a width container without containing the overlay itself -->
  <div class="info-host">
    <motion.div
      class="info-tab"
      :class="{ selected }"
      :initial="{ opacity: 0, y: 4 }"
      :animate="{ opacity: 1, y: 0 }"
      :transition="Dynamics.quick"
    >
      <span class="seg seg--name">
        <Icons kind="app-icon" size="small" color="var(--ico)" />
        <span class="name">{{ name }}</span>
      </span>

      <span v-if="stage" v-tip="stageTip" class="seg seg--calibration">
        <Icons kind="lock" size="small" color="var(--canary-yellow)" />
        <span class="seg-text">{{ stage.current }}/{{ stage.total }}</span>
      </span>

      <span
        v-if="descriptor.interactive"
        v-tip="interactiveTip"
        class="seg seg--interactive"
      >
        <Icons kind="interactive" size="small" color="var(--accent-200)" />
        <span class="seg-text">INTERACTIVE</span>
      </span>
    </motion.div>
  </div>
</template>

<style scoped>
.info-host {
  position: absolute;
  left: 0;
  bottom: 100%;
  width: 100%;
  height: 0;
  container-type: inline-size;
  pointer-events: none;
}

.info-tab {
  --ico: var(--text-muted);
  position: absolute;
  left: 0;
  bottom: 6px;
  max-width: 100%;
  height: 20px;
  box-sizing: border-box;
  display: inline-flex;
  align-items: stretch;
  overflow: hidden;
  white-space: nowrap;
  background: var(--black-1-a);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 1px solid var(--base-600);
  corner-shape: bevel;
  border-radius: 6px 0 6px 0;
  pointer-events: auto;
  user-select: none;
  transition: border-color 0.15s;
}

.info-tab.selected {
  --ico: var(--text-main);
  border-color: var(--accent-600);
}

.seg {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: 0 var(--space-2);
  min-width: 0;
}

.seg + .seg {
  border-left: 1px solid var(--base-600);
}

/* The name gives way first; the status segments never truncate. */
.seg--name {
  flex: 0 1 auto;
}

.seg--calibration,
.seg--interactive {
  flex: none;
}

.seg--calibration {
  background: rgba(255, 248, 122, 0.08);
  color: var(--canary-yellow);
}

.seg--interactive {
  background: rgba(132, 255, 177, 0.08);
  color: var(--accent-200);
}

.name {
  font-family: var(--font-primary);
  font-size: var(--main-font-size-4);
  font-weight: var(--font-weight-2);
  line-height: 1;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  transition: color 0.15s;
}

.info-tab.selected .name {
  color: var(--text-main);
}

.seg-text {
  font-family: var(--font-microcopy);
  font-size: var(--secondary-font-size-4);
  font-weight: var(--font-weight-3);
  line-height: 1;
  letter-spacing: 0.04em;
}

@container (max-width: 260px) {
  .seg--interactive .seg-text {
    display: none;
  }
}

@container (max-width: 160px) {
  .seg--name .name {
    display: none;
  }
}
</style>
