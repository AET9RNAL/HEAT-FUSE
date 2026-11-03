<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { AnimatePresence, motion } from "motion-v";
import Icons, { type IconKind } from "../../components/ui/Icons.vue";
import StagePanel from "./StagePanel.vue";
import StageButton from "../inspector/controls/StageButton.vue";
import { Dynamics } from "../../composables/useMotion";
import { vTip } from "../inspector/tooltip";
import {
  calibStage,
  formatCombo,
  hostHotkeys,
  pluginMetrics,
  sendPermissionReview,
  stageRoster,
} from "../overlayClient";
import { DEMO_OVERLAY_ID } from "../stageTour";
import type { OverlayDescriptor, StageScope } from "../types";

const props = withDefaults(defineProps<{ descriptor: OverlayDescriptor; selected?: boolean }>(), {
  selected: false,
});

const root = ref<HTMLElement | null>(null);

const plugin = computed(() => stageRoster.value.find((p) => p.plugin_id === props.descriptor.pluginId));

// The stage tour points at the DEMO frame's tab and lock.
const isDemo = computed(() => props.descriptor.overlayId === DEMO_OVERLAY_ID);

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

// Per plugin, not per overlay: a plugin's overlays share one process.
const metrics = computed(() => pluginMetrics.value[props.descriptor.pluginId]);

function formatBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return mb >= 1 ? `${Math.round(mb)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

const ramText = computed(() => (metrics.value ? formatBytes(metrics.value.ram) : ""));

const storage = computed(() => {
  const m = metrics.value;
  if (m?.storage == null) return null;
  const limit = m.storageLimit ?? 0;
  return { text: formatBytes(m.storage), share: limit ? m.storage / limit : 0, limit };
});

const storageTip = computed(() => {
  const s = storage.value;
  if (!s) return undefined;
  const of = s.limit ? ` of the ${formatBytes(s.limit)} a plugin may keep` : "";
  return `Space this plugin occupies on disk of this PC${of}. Uninstalling it removes them.`;
});

const cpuText = computed(() => {
  const cpu = metrics.value?.cpu;
  if (cpu == null) return "—";
  return `${cpu < 10 ? cpu.toFixed(1) : Math.round(cpu)}%`;
});

// The runtime couldn't measure the process, so these are the plugin's own numbers.
const selfReported = computed(() => metrics.value?.source === "plugin");

const ramTip = computed(() =>
  selfReported.value
    ? "Memory this plugin's process reports for itself. Drawing its overlays counts toward the stage instead."
    : "Private memory this plugin's process uses. Drawing its overlays counts toward the stage instead.",
);

const cpuTip = computed(() =>
  metrics.value
    ? `Share of all CPU cores this plugin's process uses${selfReported.value ? ", as it reports" : ""}. It answers FUSE in ${metrics.value.ping} ms.`
    : undefined,
);

const scopes = computed(() => plugin.value?.permissions ?? []);
const allowed = computed(() => scopes.value.filter((s) => s.state === "granted").length);
const needsAttention = computed(() => scopes.value.some((s) => s.state === "denied" || s.state === "prompt"));
const permsTip = computed(() => `${allowed.value} of ${scopes.value.length} permissions allowed.`);

const open = ref(false);

const STATE_LABEL: Record<StageScope["state"], string> = {
  granted: "Allowed",
  denied: "Denied",
  prompt: "Not answered",
  undeclared: "Undeclared",
};

function scopeIcon(scope: StageScope): IconKind {
  return (scope.icon as IconKind | undefined) || "lock";
}

function scopeTip(scope: StageScope): string {
  let hint = "";
  if (scope.level === "core") hint = "Core plugins only. Can't be changed.";
  else if (scope.editable) hint = scope.state === "granted" ? "Click to change." : "Click to allow.";
  return [scope.description, scope.reason && `“${scope.reason}”`, hint].filter(Boolean).join(" ");
}

// Only asks for the consent card; the answer comes from the card, which plugins can't reach.
function review(scope: StageScope): void {
  if (scope.editable) sendPermissionReview(props.descriptor.pluginId, scope.id);
}

function onWindowPointerDown(e: PointerEvent): void {
  if (!root.value?.contains(e.target as Node)) open.value = false;
}

watch(open, (isOpen) => {
  if (isOpen) window.addEventListener("pointerdown", onWindowPointerDown, true);
  else window.removeEventListener("pointerdown", onWindowPointerDown, true);
});

watch(scopes, (list) => {
  if (!list.length) open.value = false;
});

onBeforeUnmount(() => window.removeEventListener("pointerdown", onWindowPointerDown, true));
</script>

<template>
  <!-- Zero-height host spanning the overlay: gives the tab a width container without containing the overlay itself -->
  <div ref="root" class="info-host">
    <motion.div
      v-ftue="isDemo ? 'stage-overlay-info' : undefined"
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

      <template v-if="metrics">
        <span v-tip="ramTip" class="seg seg--metric">
          <Icons kind="memory" size="small" color="var(--ico)" />
          <span class="seg-text">{{ ramText }}</span>
        </span>
        <span v-tip="cpuTip" class="seg seg--metric">
          <Icons kind="cpu" size="small" color="var(--ico)" />
          <span class="seg-text">{{ cpuText }}</span>
        </span>
        <span
          v-if="storage"
          v-tip="storageTip"
          class="seg seg--metric seg--storage"
          :class="{ full: storage.share >= 0.9 }"
        >
          <Icons kind="database" size="small" color="var(--ico)" />
          <span class="seg-text">{{ storage.text }}</span>
        </span>
      </template>

      <button
        v-if="scopes.length"
        v-ftue="isDemo ? 'stage-perms' : undefined"
        v-tip="permsTip"
        type="button"
        class="seg seg--perms"
        :class="{ open, attention: needsAttention }"
        :aria-expanded="open"
        @pointerdown.stop
        @click="open = !open"
      >
        <Icons kind="lock" size="small" color="var(--perm-ico)" />
        <span class="seg-text">{{ allowed }}/{{ scopes.length }}</span>
        <motion.span
          class="caret"
          :initial="false"
          :animate="{ rotate: open ? 180 : 0 }"
          :transition="Dynamics.snappy"
        >
          <Icons kind="chevron-down" size="small" color="var(--perm-ico)" />
        </motion.span>
      </button>
    </motion.div>

    <AnimatePresence>
      <motion.div
        v-if="open && scopes.length"
        class="perm-menu stage-ui"
        :initial="{ opacity: 0, y: -4 }"
        :animate="{ opacity: 1, y: 0 }"
        :exit="{ opacity: 0, y: -4 }"
        :transition="Dynamics.quick"
        @pointerdown.stop
      >
        <StagePanel class="perm-panel" :cut="6" blur>
          <div v-for="scope in scopes" :key="scope.id" v-tip="scopeTip(scope)" class="perm-row">
            <Icons class="perm-icon" :kind="scopeIcon(scope)" size="small" color="var(--ico)" />
            <span class="perm-label">{{ scope.label }}</span>
            <!-- Controlled: shows the stored decision and only asks for the card. -->
            <StageButton
              class="perm-toggle"
              mode="toggle"
              off-tone="danger"
              :model-value="scope.state === 'granted'"
              :text="STATE_LABEL[scope.state]"
              :disabled="!scope.editable"
              @click="review(scope)"
            />
          </div>
        </StagePanel>
      </motion.div>
    </AnimatePresence>
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
.seg--interactive,
.seg--metric,
.seg--perms {
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

.seg--metric .seg-text {
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}

.seg--storage.full {
  --ico: var(--warning-color);
  background: rgba(255, 219, 140, 0.08);
}

.seg--storage.full .seg-text {
  color: var(--warning-color);
}

.seg--perms {
  --perm-ico: var(--text-muted);
  margin: 0;
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.seg--perms:hover,
.seg--perms.open {
  --perm-ico: var(--text-main);
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-main);
}

.seg--perms.attention {
  --perm-ico: var(--warning-color);
  color: var(--warning-color);
}

.caret {
  display: flex;
  line-height: 0;
}

/* Drops over the overlay's own top edge, so it stays on screen for HUD overlays at the top. */
.perm-menu {
  position: absolute;
  left: 0;
  top: 4px;
  z-index: 3;
  width: 240px;
  pointer-events: auto;
  cursor: default;
  user-select: none;
}

.perm-panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-1);
}

.perm-row {
  --ico: var(--text-muted);
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding-left: var(--space-2);
}

.perm-label {
  flex: 1;
  min-width: 0;
  font-family: var(--font-primary);
  font-size: var(--main-font-size-4);
  color: var(--text-main);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Through the row, so it outranks StageButton's own full width. */
.perm-row > :deep(.perm-toggle) {
  flex: none;
  width: auto;
  min-width: 64px;
}

.perm-row > :deep(.perm-icon) {
  flex: none;
}

@container (max-width: 360px) {
  .seg--interactive .seg-text {
    display: none;
  }
}

@container (max-width: 240px) {
  .seg--metric {
    display: none;
  }
}

@container (max-width: 160px) {
  .seg--name .name {
    display: none;
  }
}
</style>
