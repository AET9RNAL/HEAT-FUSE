<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import Icons, { type IconKind } from "../../components/ui/Icons.vue";
import { vTip } from "../inspector/tooltip";
import { calibStage, formatCombo, hostHotkeys, hostState, primaryDisplay, stageMetrics } from "../overlayClient";

const MARGIN = 16;

//Stage state
const STATE_ICON: Record<string, IconKind> = {
  locked: "lock",
  calibrate: "calibration",
  interactive: "interactive",
};

const stateIcon = computed(() => STATE_ICON[hostState.value] ?? "lock");

const stateLabel = computed(() => {
  if (hostState.value === "calibrate") return `CALIBRATE ${calibStage.value}`;
  return hostState.value === "interactive" ? "INTERACTIVE" : "LOCKED";
});

const stateTip = computed(() => {
  const lock = formatCombo(hostHotkeys.lock);
  const inter = formatCombo(hostHotkeys.interactive);
  if (hostState.value === "calibrate") {
    return `Calibration stage ${calibStage.value}. Move and resize the overlays. ${lock} advances, then locks.`;
  }
  if (hostState.value === "interactive") {
    return `The overlays take clicks and input. ${inter} returns to locked.`;
  }
  return `The overlays are locked and pass clicks to the game. ${lock} calibrates, ${inter} makes them interactive.`;
});

const fps = ref<number | null>(null);
let frames = 0;
let windowStart = 0;
let raf = 0;

function countFrame(now: number): void {
  if (!windowStart) windowStart = now;
  frames++;
  if (now - windowStart >= 1000) {
    fps.value = Math.round((frames * 1000) / (now - windowStart));
    frames = 0;
    windowStart = now;
  }
  raf = requestAnimationFrame(countFrame);
}

onMounted(() => {
  raf = requestAnimationFrame(countFrame);
});

onBeforeUnmount(() => cancelAnimationFrame(raf));

function formatBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`;
}

function formatPercent(value: number | null | undefined): string {
  if (value == null) return "—";
  return `${value < 10 ? value.toFixed(1) : Math.round(value)}%`;
}

const renderer = computed(() => stageMetrics.value?.renderer ?? null);
const gpuProcess = computed(() => stageMetrics.value?.gpuProcess ?? null);

const cpuTotal = computed(() => {
  const parts = [renderer.value?.cpu, gpuProcess.value?.cpu].filter((v): v is number => typeof v === "number");
  return parts.length ? parts.reduce((sum, v) => sum + v, 0) : null;
});

const ramText = computed(() =>
  renderer.value || gpuProcess.value ? formatBytes((renderer.value?.ram ?? 0) + (gpuProcess.value?.ram ?? 0)) : "—",
);

const cpuTip = computed(
  () =>
    `Share of all CPU cores. Stage renderer ${formatPercent(renderer.value?.cpu)}, GPU process ${formatPercent(gpuProcess.value?.cpu)}.`,
);

const ramTip = computed(() => {
  const r = renderer.value ? formatBytes(renderer.value.ram) : "—";
  const g = gpuProcess.value ? formatBytes(gpuProcess.value.ram) : "—";
  return `Private memory. Stage renderer ${r}, GPU process ${g}. The App window shares the GPU process.`;
});

const gpuTip = computed(() =>
  gpuProcess.value?.gpu == null
    ? "GPU load isn't available on this system."
    : `GPU process, busiest engine (${gpuProcess.value.engine ?? "3D"}), as Task Manager counts it. The App window shares it.`,
);

const fpsTip = "Frames the stage draws each second, capped at your display's refresh rate. A drop means the stage stutters, not the game.";

const style = computed(() => {
  const d = primaryDisplay.value;
  return d
    ? { left: `${d.x + MARGIN}px`, top: `${d.y + d.h - MARGIN}px` }
    : { left: `${MARGIN}px`, top: `calc(100% - ${MARGIN}px)` };
});
</script>

<template>
  <div class="perf-host stage-ui" :style="style">
    <div class="info-tab">
      <span class="seg seg--name">
        <Icons kind="app-icon" size="small" color="var(--ico)" />
        <span class="name">Stage</span>
      </span>
      <span v-tip="cpuTip" class="seg seg--metric">
        <Icons kind="cpu" size="small" color="var(--ico)" />
        <span class="seg-text">{{ formatPercent(cpuTotal) }}</span>
      </span>
      <span v-tip="ramTip" class="seg seg--metric">
        <Icons kind="memory" size="small" color="var(--ico)" />
        <span class="seg-text">{{ ramText }}</span>
      </span>
      <span v-tip="gpuTip" class="seg seg--metric">
        <Icons kind="monitor" size="small" color="var(--ico)" />
        <span class="seg-text">{{ formatPercent(gpuProcess?.gpu) }}</span>
      </span>
      <span v-tip="fpsTip" class="seg seg--metric">
        <span class="seg-text">{{ fps ?? "—" }} FPS</span>
      </span>
      <span v-tip="stateTip" class="seg seg--state" :class="`is-${hostState}`">
        <Icons :kind="stateIcon" size="small" color="var(--state-ico)" />
        <span class="seg-text">{{ stateLabel }}</span>
      </span>
    </div>
  </div>
</template>

<style scoped>
.perf-host {
  position: absolute;
  z-index: 25;
  transform: translateY(-100%);
  user-select: none;
}
.info-tab {
  --ico: var(--text-muted);
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

.name {
  font-family: var(--font-primary);
  font-size: var(--main-font-size-4);
  font-weight: var(--font-weight-2);
  line-height: 1;
  color: var(--text-muted);
}

/* Same tints the overlay info bar uses for these states. */
.seg--state {
  --state-ico: var(--text-muted);
  flex: none;
}

.seg--state .seg-text {
  color: inherit;
}

.seg--state.is-locked {
  color: var(--text-muted);
}

.seg--state.is-calibrate {
  --state-ico: var(--canary-yellow);
  background: rgba(255, 248, 122, 0.08);
  color: var(--canary-yellow);
}

.seg--state.is-interactive {
  --state-ico: var(--accent-200);
  background: rgba(132, 255, 177, 0.08);
  color: var(--accent-200);
}

.seg-text {
  font-family: var(--font-microcopy);
  font-size: var(--secondary-font-size-4);
  font-weight: var(--font-weight-3);
  line-height: 1;
  letter-spacing: 0.04em;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}
</style>
