<script setup lang="ts">
/**
 * eEfficiency - carousel scene 2. "Efficiency" header with the per-minute stat
 * row, then two bar charts side by side (--space-1 gap): win rate by game mode
 * and session distribution, both grouped by game mode.
 *
 * Owns its two Chart instances; the scene stays mounted (the carousel animates
 * opacity, not v-if) so the canvases always have a real size to render into.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { Chart } from "chart.js/auto";
import "fuse_ui/ui/tokens.css";
import eStat from "./eStat.vue";

export interface Efficiency {
  dmgPerKill: number;
  killsPerMin: number;
  scorePerMin: number;
}
export interface ModeRow {
  mode: string;
  winRate: number;
  count: number;
}

const props = defineProps<{ efficiency?: Efficiency; byMode?: ModeRow[]; assetBase?: string }>();

/** Game mode -> splash icon. Keys are matched case/space-insensitively. */
const MODE_ICONS: Record<string, string> = {
  killconfirm: "ico_splash_screen_kc",
  control: "ico_splash_screen_control",
  domination: "ico_splash_screen_po",
  conquest: "ico_splash_screen_conquest",
};
/** Icons are drawn at 90% of their bar's width, capped so they can't eat the plot. */
const ICON_MAX = 30;
const ICON_SCALE = 0.9;

function iconFile(mode: string): string | undefined {
  return MODE_ICONS[String(mode).toLowerCase().replace(/[\s_-]/g, "")];
}

// Icons are drawn onto the canvas, so they have to be preloaded as images.
const iconCache = new Map<string, HTMLImageElement>();
function preloadIcons(modes: string[]): void {
  for (const m of modes) {
    if (iconCache.has(m)) continue;
    const file = iconFile(m);
    if (!file) continue;
    const img = new Image();
    img.onload = () => {
      wrChart?.draw();
      distChart?.draw();
    };
    img.src = `${props.assetBase ?? ""}/assets/${file}.png`;
    iconCache.set(m, img);
  }
}

/** Draws the mode icon under each tick (text ticks are disabled below). */
const iconTicksPlugin = {
  id: "hsModeIcons",
  afterDraw(c: Chart) {
    const xScale = c.scales.x;
    if (!xScale) return;
    const { ctx, chartArea } = c;
    const bars = c.getDatasetMeta(0)?.data ?? [];
    (c.data.labels ?? []).forEach((label, i) => {
      const key = String(label);
      const x = xScale.getPixelForTick(i);
      const top = chartArea.bottom + 4;
      // Match the bar it labels: 90% of that bar's width.
      const barW = (bars[i] as { width?: number } | undefined)?.width ?? ICON_MAX;
      const size = Math.max(10, Math.min(barW * ICON_SCALE, ICON_MAX));
      const img = iconCache.get(key);
      if (img?.complete && img.naturalWidth) {
        ctx.drawImage(img, x - size / 2, top, size, size);
        return;
      }
      // No art for this mode - fall back to a short text label.
      ctx.save();
      ctx.fillStyle = cssVar("--base-200", "#b3b3b3");
      ctx.font = `9px ${MONO}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(key.slice(0, 8), x, top + 4);
      ctx.restore();
    });
  },
};

const eff = computed<Efficiency>(
  () => props.efficiency ?? { dmgPerKill: 0, killsPerMin: 0, scorePerMin: 0 },
);
const rows = computed<ModeRow[]>(() => props.byMode ?? []);
const labels = computed(() => rows.value.map((r) => r.mode));

const dmgPerKillStr = computed(() => eff.value.dmgPerKill.toLocaleString());
const killsPerMinStr = computed(() => eff.value.killsPerMin.toFixed(2));
const scorePerMinStr = computed(() => eff.value.scorePerMin.toFixed(1));

function cssVar(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}
const MONO = "'Geist Mono', 'Courier New', monospace";

const wrEl = ref<HTMLCanvasElement | null>(null);
const distEl = ref<HTMLCanvasElement | null>(null);
let wrChart: Chart | null = null;
let distChart: Chart | null = null;

function barOptions(maxIsPercent: boolean) {
  const muted = cssVar("--base-200", "#b3b3b3");
  const tick = { color: muted, font: { family: MONO, size: 9 } };
  return {
    responsive: true,
    maintainAspectRatio: false,
    // Grow up from the baseline on entry, staggered left-to-right.
    animation: {
      duration: 650,
      easing: "easeOutQuart" as const,
      delay: (ctx: { type: string; dataIndex: number }) =>
        ctx.type === "data" ? ctx.dataIndex * 60 : 0,
    },
    animations: { y: { from: (ctx: { chart: Chart }) => ctx.chart.scales.y?.getBasePixel() } },
    plugins: { legend: { display: false }, tooltip: { enabled: false } },
    // Reserve room under the plot for the mode icons drawn by hsModeIcons.
    layout: { padding: { bottom: ICON_MAX + 6 } },
    scales: {
      // Text ticks off - the icon plugin labels the axis instead.
      x: { grid: { display: false }, ticks: { ...tick, display: false } },
      y: {
        beginAtZero: true,
        ...(maxIsPercent ? { max: 100 } : {}),
        grid: { color: "rgba(255,255,255,0.04)" },
        ticks: maxIsPercent ? { ...tick, callback: (v: unknown) => `${v}%` } : tick,
      },
    },
  };
}

function build(): void {
  if (wrEl.value && !wrChart) {
    wrChart = new Chart(wrEl.value, {
      type: "bar",
      data: {
        labels: labels.value,
        datasets: [
          {
            data: rows.value.map((r) => r.winRate),
            backgroundColor: "rgba(113,206,113,0.35)",
            borderColor: cssVar("--success-color", "#71ce71"),
            borderWidth: 1,
            borderRadius: 2,
          },
        ],
      },
      options: barOptions(true),
      plugins: [iconTicksPlugin],
    });
  }
  if (distEl.value && !distChart) {
    distChart = new Chart(distEl.value, {
      type: "bar",
      data: {
        labels: labels.value,
        datasets: [
          {
            data: rows.value.map((r) => r.count),
            backgroundColor: "rgba(207,255,220,0.35)",
            borderColor: cssVar("--tea-green", "#cfffdc"),
            borderWidth: 1,
            borderRadius: 2,
          },
        ],
      },
      options: barOptions(false),
      plugins: [iconTicksPlugin],
    });
  }
}

function sync(): void {
  if (!wrChart || !distChart) {
    build();
    return;
  }
  wrChart.data.labels = labels.value;
  wrChart.data.datasets[0]!.data = rows.value.map((r) => r.winRate);
  wrChart.update("none");
  distChart.data.labels = labels.value;
  distChart.data.datasets[0]!.data = rows.value.map((r) => r.count);
  distChart.update("none");
}

onMounted(() => {
  preloadIcons(labels.value);
  build();
});
watch(rows, () => {
  preloadIcons(labels.value);
  sync();
});
onBeforeUnmount(() => {
  wrChart?.destroy();
  distChart?.destroy();
  wrChart = null;
  distChart = null;
});
</script>

<template>
  <div class="eff">
    <div class="eff-head">Efficiency</div>

    <div class="eff-stats">
      <eStat label="Damage / Kill" :value="dmgPerKillStr" accent="var(--error-highlight)" />
      <eStat label="Kills / Min" :value="killsPerMinStr" accent="var(--tea-green)" />
      <eStat label="Score / Min" :value="scorePerMinStr" accent="var(--success-color)" />
    </div>

    <div class="eff-charts">
      <div class="eff-chart">
        <div class="eff-chart-title">Win Rate by Game Mode</div>
        <div class="eff-chart-body"><canvas ref="wrEl" /></div>
      </div>
      <div class="eff-chart">
        <div class="eff-chart-title">Session Distribution</div>
        <div class="eff-chart-body"><canvas ref="distEl" /></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.eff {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  overflow: hidden;
}

.eff-head {
  flex: none;
  font-family: var(--font-primary);
  font-size: var(--main-font-size-3);
  font-weight: var(--font-weight-1);
  color: var(--text-main);
}

.eff-stats {
  flex: none;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-1);
}

/* Two bar charts as a row, --space-1 between. */
.eff-charts {
  flex: 1 1 0;
  min-height: 0;
  display: flex;
  flex-direction: row;
  gap: var(--space-1);
}
.eff-chart {
  flex: 1 1 0;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--black-1-a);
  clip-path: polygon(6px 0%, 100% 0%, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0% 100%, 0% 6px);
  padding: var(--space-1);
  box-sizing: border-box;
}
.eff-chart-title {
  flex: none;
  font-family: var(--font-microcopy);
  font-size: var(--main-font-size-5);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-bottom: var(--space-1);
}
.eff-chart-body {
  position: relative;
  flex: 1 1 0;
  min-height: 0;
}
</style>
