<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { Chart } from "chart.js/auto";
import "fuse_ui/ui/tokens.css";
import eStat from "./eStat.vue";

export interface Series {
  kd: number[];
  wr: number[];
  dmg: number[];
}

const props = defineProps<{
  series?: Series;
  kd?: number;
  winRate?: number;
  damage?: number;
}>();

const series = computed<Series>(() => props.series ?? { kd: [], wr: [], dmg: [] });
const hasData = computed(() => (series.value.kd?.length ?? 0) > 0);

const kdStr = computed(() => (props.kd ?? 0).toFixed(2));
const wrStr = computed(() => `${(props.winRate ?? 0).toFixed(1)}%`);
const dmgStr = computed(() => {
  const d = props.damage ?? 0;
  return d >= 1000 ? `${(d / 1000).toFixed(1)}k` : String(Math.round(d));
});

// Canvas can't read CSS custom properties - resolve the tokens to real colours.
function cssVar(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}
const MONO = "'Geist Mono', 'Courier New', monospace";

/** Dashed vertical rule on the latest sample - the call-out for the eStats. */
const cutLinePlugin = {
  id: "hsCutLine",
  afterDatasetsDraw(c: Chart) {
    const meta = c.getDatasetMeta(0);
    const pt = meta?.data?.[meta.data.length - 1] as { x: number } | undefined;
    if (!pt) return;
    const { ctx, chartArea } = c;
    ctx.save();
    ctx.strokeStyle = cssVar("--base-200", "#b3b3b3");
    ctx.globalAlpha = 0.7;
    ctx.setLineDash([3, 2]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pt.x, chartArea.top);
    ctx.lineTo(pt.x, chartArea.bottom);
    ctx.stroke();
    ctx.restore();
  },
};

/**
 * Progressive line draw: each point's x (and y) eases in on a per-index delay,
 * so the series appears to be drawn from left to right on entry.
 */
function drawInAnimation(pointCount: number) {
  const total = 700;
  const step = pointCount > 1 ? total / pointCount : total;
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const started = (key: string) => (ctx: any) => {
    if (ctx.type !== "data" || ctx[key]) return 0;
    ctx[key] = true;
    return ctx.index * step;
  };
  return {
    x: { type: "number", easing: "linear", duration: step, from: NaN, delay: started("xStarted") },
    y: {
      type: "number",
      easing: "linear",
      duration: step,
      from: (ctx: any) =>
        ctx.index === 0
          ? ctx.chart.scales[ctx.chart.getDatasetMeta(ctx.datasetIndex).yAxisID]?.getBasePixel()
          : ctx.chart.getDatasetMeta(ctx.datasetIndex).data[ctx.index - 1]?.getProps(["y"], true).y,
      delay: started("yStarted"),
    },
  } as any;
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

const canvasEl = ref<HTMLCanvasElement | null>(null);
let chart: Chart | null = null;

function chartData() {
  const s = series.value;
  const n = s.kd?.length ?? 0;
  return {
    labels: Array.from({ length: n }, (_, i) => `S${i + 1}`),
    datasets: [
      {
        label: "Rolling K/D",
        data: s.kd ?? [],
        borderColor: cssVar("--tea-green", "#a9ffc9"),
        yAxisID: "yKd",
      },
      {
        label: "Rolling WR",
        data: s.wr ?? [],
        borderColor: cssVar("--success-color", "#71ce71"),
        yAxisID: "yWr",
      },
      {
        label: "Rolling Dmg",
        data: s.dmg ?? [],
        borderColor: cssVar("--error-highlight", "#ff6a62"),
        yAxisID: "yDmg",
      },
    ].map((d) => ({ ...d, borderWidth: 2, pointRadius: 0, tension: 0.4, fill: false })),
  };
}

function build(): void {
  if (!canvasEl.value || chart || !hasData.value) return;
  const muted = cssVar("--base-200", "#b3b3b3");
  const grid = "rgba(255,255,255,0.06)";
  const tick = { color: muted, font: { family: MONO, size: 9 } };

  chart = new Chart(canvasEl.value, {
    type: "line",
    data: chartData(),
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: drawInAnimation(series.value.kd?.length ?? 0),
      interaction: { mode: "index", intersect: false },
      layout: { padding: { top: 2, right: 2, bottom: 0, left: 2 } },
      plugins: {
        tooltip: { enabled: false },
        legend: {
          display: true,
          position: "top",
          labels: {
            color: muted,
            boxWidth: 10,
            boxHeight: 2,
            padding: 8,
            font: { family: MONO, size: 9 },
          },
        },
      },
      scales: {
        x: { ticks: tick, grid: { color: grid } },
        yKd: {
          position: "left",
          ticks: { ...tick, color: cssVar("--tea-green", "#a9ffc9") },
          grid: { color: grid },
        },
        yDmg: {
          position: "right",
          ticks: {
            ...tick,
            color: cssVar("--error-highlight", "#ff6a62"),
            callback: (v) => Number(v).toLocaleString(),
          },
          grid: { display: false },
        },
        // Win-rate shares the plot but keeps its own 0-100 range off-axis.
        yWr: { display: false, min: 0, max: 100 },
      },
    },
    plugins: [cutLinePlugin],
  });
}

onMounted(build);
watch(series, () => {
  if (!chart) {
    build();
    return;
  }
  chart.data = chartData();
  chart.update("none");
});
onBeforeUnmount(() => {
  chart?.destroy();
  chart = null;
});
</script>

<template>
  <div class="trend">
    <div class="trend-canvas-wrap">
      <canvas v-show="hasData" ref="canvasEl" />
      <div v-if="!hasData" class="trend-empty">No matches this session</div>
    </div>

    <div class="trend-callout">
      <eStat label="K/D" :value="kdStr" accent="var(--tea-green)" />
      <eStat label="Win Rate" :value="wrStr" accent="var(--success-color)" />
      <eStat label="Damage" :value="dmgStr" accent="var(--error-highlight)" />
    </div>
  </div>
</template>

<style scoped>
.trend {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  display: flex;
  align-items: stretch;
  gap: var(--space-2);
}
.trend-canvas-wrap {
  position: relative;
  flex: 1 1 0;
  min-width: 0;
  background: var(--black-1-a);
  clip-path: polygon(6px 0%, 100% 0%, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0% 100%, 0% 6px);
  padding: var(--space-1);
  box-sizing: border-box;
}
.trend-empty {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-microcopy);
  font-size: var(--main-font-size-4);
  color: var(--text-muted);
}
.trend-callout {
  flex: 0 0 auto;
  width: 30%;
  max-width: 128px;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}
.trend-callout > * {
  flex: 1 1 0;
}
</style>
