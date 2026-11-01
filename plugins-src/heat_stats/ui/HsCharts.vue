<script setup lang="ts">
import { computed, ref } from "vue";
import eSegmented from "fuse_ui/ui/eSegmented.vue";
import eChart, { type Paint } from "./eChart.vue";
import eChartCard, { type Reading } from "./eChartCard.vue";
import eWinGrid from "./eWinGrid.vue";
import { CATEGORICAL, NEGATIVE, NEUTRAL, POSITIVE, alpha } from "./palette.mjs";
import { useI18n } from "./i18n.mjs";

interface StrengthRow {
  key: string;
  name: string;
  battles: number;
  winRate: number;
  delta: number;
}

interface GridCell {
  map: string;
  mode: string;
  battles: number;
  winRate: number | null;
}

interface ChartsData {
  battles: number;
  average: number;
  form: { window: number; points: (number | null)[] };
  strengths: Record<string, StrengthRow[]>;
  grid: { maps: string[]; modes: string[]; cells: GridCell[] };
  conversion: { win: { x: number; y: number }[]; loss: { x: number; y: number }[] };
  damage: { bins: { from: number; to: number; count: number }[]; median: number; mean: number };
  clock: { hour: number; battles: number; winRate: number | null }[];
  sessions: { index: number; battles: number; winRate: number | null }[];
}

const props = defineProps<{ charts: object | null }>();

const { t, n, fixed, percent, compact } = useI18n();

const data = computed(() => props.charts as ChartsData | null);
const ready = computed(() => Boolean(data.value?.battles));

/** Everything the template reads, already unwrapped: templates hold no `!`. */
const average = computed(() => data.value?.average ?? 0);
const formWindow = computed(() => data.value?.form.window ?? 0);
const grid = computed(() => data.value?.grid ?? { maps: [], modes: [], cells: [] });
const spread = computed(() => data.value?.damage ?? { bins: [], median: 0, mean: 0 });

const DIMENSIONS = ["vehicle", "agent", "map", "mode", "role"];
const dimension = ref("vehicle");

const dimensionOptions = computed(() =>
  DIMENSIONS.map((value) => ({ value, label: t(`charts.by.${value}`) })),
);

const rows = computed<StrengthRow[]>(() => data.value?.strengths?.[dimension.value] ?? []);

const count = (v: number): string => n(v, { maximumFractionDigits: 0 });
const signed = (v: number): string => `${v >= 0 ? "+" : ""}${fixed(v, 1)}`;

const focus = ref("");

function rest(id: string): void {
  if (focus.value === id) focus.value = "";
}

const dirOf = (delta: number): number => (Math.abs(delta) < 0.5 ? 0 : delta > 0 ? 1 : -1);

const PRIOR = 20;

const credible = (delta: number, battles: number): number =>
  battles > 0 ? (delta * battles) / (battles + PRIOR) : 0;

const points = (delta: number): string => t("charts.readPoints", { delta: signed(delta) });

function modeName(key: string): string {
  const path = `modes.${key.toLowerCase().replace(/[\s_-]/g, "")}`;
  const label = t(path);
  return label === path ? key : label;
}

const formReading = computed<Reading[]>(() => {
  const series = data.value?.form.points ?? [];
  let last: number | null = null;
  for (let i = series.length - 1; i >= 0 && last == null; i -= 1) last = series[i] ?? null;
  if (last == null) return [];
  const delta = last - average.value;
  return [
    { label: t("charts.readNow"), value: percent(last, 0) },
    { label: t("charts.readVsAverage"), value: points(delta), dir: dirOf(delta) },
  ];
});

const strengthReading = computed<Reading[]>(() => {
  const list = rows.value;
  const first = list[0];
  if (!first) return [];
  let best = first;
  let worst = first;
  for (const r of list) {
    if (credible(r.delta, r.battles) > credible(best.delta, best.battles)) best = r;
    if (credible(r.delta, r.battles) < credible(worst.delta, worst.battles)) worst = r;
  }
  const out: Reading[] = [
    { label: t("charts.readBest"), value: `${best.name} ${signed(best.delta)}`, dir: dirOf(best.delta) },
  ];
  if (worst !== best) {
    out.push({ label: t("charts.readWorst"), value: `${worst.name} ${signed(worst.delta)}`, dir: dirOf(worst.delta) });
  }
  return out;
});

const gridReading = computed<Reading[]>(() => {
  const cells = grid.value.cells.filter((c) => c.winRate != null);
  const first = cells[0];
  if (!first) return [];
  const worth = (c: GridCell): number => credible((c.winRate ?? 0) - average.value, c.battles);
  let best = first;
  for (const c of cells) if (worth(c) > worth(best)) best = c;
  const rate = best.winRate ?? 0;
  return [
    {
      label: t("charts.readPairing"),
      value: `${best.map} · ${modeName(best.mode)} ${percent(rate, 0)}`,
      dir: dirOf(rate - average.value),
    },
    { label: t("charts.readBattles"), value: count(best.battles) },
  ];
});

const conversionReading = computed<Reading[]>(() => {
  const c = data.value?.conversion;
  if (!c?.win.length || !c.loss.length) return [];
  const mean = (list: { x: number }[]): number => list.reduce((sum, p) => sum + p.x, 0) / list.length;
  const won = mean(c.win);
  const lost = mean(c.loss);
  return [
    { label: t("charts.readInWins"), value: compact(won) },
    { label: t("charts.readGap"), value: compact(won - lost), dir: dirOf(won - lost) },
  ];
});

const damageReading = computed<Reading[]>(() => {
  const bins = spread.value.bins;
  const first = bins[0];
  if (!first) return [];
  let top = first;
  for (const b of bins) if (b.count > top.count) top = b;
  return [
    { label: t("charts.readMedian"), value: compact(spread.value.median) },
    { label: t("charts.readTypical"), value: `${compact(top.from)} - ${compact(top.to)}` },
  ];
});

const clockReading = computed<Reading[]>(() => {
  const hours = (data.value?.clock ?? []).filter((h) => h.winRate != null);
  const first = hours[0];
  if (!first) return [];
  const worth = (h: { winRate: number | null; battles: number }): number =>
    credible((h.winRate ?? 0) - average.value, h.battles);
  let best = first;
  let worst = first;
  for (const h of hours) {
    if (worth(h) > worth(best)) best = h;
    if (worth(h) < worth(worst)) worst = h;
  }
  const hour = (h: { hour: number }): string => `${String(h.hour).padStart(2, "0")}:00`;
  const out: Reading[] = [
    {
      label: t("charts.readBestHour"),
      value: `${hour(best)} ${signed((best.winRate ?? 0) - average.value)}`,
      dir: dirOf((best.winRate ?? 0) - average.value),
    },
  ];
  if (worst !== best) {
    out.push({
      label: t("charts.readWorstHour"),
      value: `${hour(worst)} ${signed((worst.winRate ?? 0) - average.value)}`,
      dir: dirOf((worst.winRate ?? 0) - average.value),
    });
  }
  return out;
});

const sessionReading = computed<Reading[]>(() => {
  const slots = (data.value?.sessions ?? []).filter((s) => s.winRate != null);
  const first = slots[0];
  if (!first) return [];
  const worth = (s: { winRate: number | null; battles: number }): number =>
    credible((s.winRate ?? 0) - average.value, s.battles);
  let peak = first;
  for (const s of slots) if (worth(s) > worth(peak)) peak = s;
  const tail = slots[slots.length - 1] ?? peak;
  return [
    {
      label: t("charts.readPeak"),
      value: `${t("charts.readBattle", { n: peak.index + 1 })} ${percent(peak.winRate ?? 0, 0)}`,
      dir: dirOf((peak.winRate ?? 0) - average.value),
    },
    {
      label: t("charts.readLate"),
      value: percent(tail.winRate ?? 0, 0),
      dir: dirOf((tail.winRate ?? 0) - average.value),
    },
  ];
});

/* ── Chart.js scaffolding, shared by every plot here ─────────────── */

function plugins(paint: Paint, font: string, legend: boolean, callbacks: object = {}): object {
  return {
    legend: {
      display: legend,
      labels: { color: paint("--text-muted"), font: { family: font, size: 11 }, boxWidth: 12, usePointStyle: true },
    },
    tooltip: {
      backgroundColor: paint("--base-900", 0.95),
      borderColor: paint("--base-600"),
      borderWidth: 1,
      titleColor: paint("--text-main"),
      bodyColor: paint("--text-muted"),
      titleFont: { family: font },
      bodyFont: { family: font },
      callbacks,
    },
  };
}

function axis(paint: Paint, font: string, extra: object = {}, ticks: object = {}): object {
  return {
    grid: { color: paint("--base-600", 0.16) },
    border: { color: paint("--base-600", 0.4) },
    ticks: { color: paint("--text-muted", 0.65), font: { family: font, size: 10 }, ...ticks },
    ...extra,
  };
}

function title(paint: Paint, font: string, text: string): object {
  return { display: true, text, color: paint("--text-muted", 0.7), font: { family: font, size: 9 } };
}

/** The career average, as a dataset: there is no annotation plugin in this build. */
function baseline(paint: Paint, value: number, length: number, label: string): object {
  return {
    label,
    data: Array.from({ length }, () => value),
    borderColor: paint("--text-muted", 0.7),
    borderWidth: 1,
    borderDash: [4, 4],
    pointRadius: 0,
    pointHitRadius: 0,
    fill: false,
    tension: 0,
    order: 0,
  };
}

/* ── 1. Form ──────────────────────────────────────────────────────── */

const formChart = computed(() => {
  const d = data.value;
  if (!d?.form.points.some((p) => p != null)) return null;
  const points = d.form.points;
  const mean = d.average;
  return (paint: Paint, font: string) => ({
    type: "line",
    data: {
      labels: points.map((_, i) => i + 1),
      datasets: [
        baseline(paint, mean, points.length, t("charts.averageLabel")),
        {
          label: t("charts.formSeries", { window: d.form.window }),
          data: points,
          borderWidth: 2,
          pointRadius: 0,
          pointHitRadius: 6,
          tension: 0.25,
          spanGaps: false,
          borderColor: POSITIVE,
          // Above the average reads positive, below reads negative - the split
          // is the whole point of the chart, so the fill carries it.
          fill: { target: { value: mean }, above: alpha(POSITIVE, 0.2), below: alpha(NEGATIVE, 0.2) },
          segment: {
            borderColor: (ctx: { p0: { parsed: { y: number } } }) =>
              ctx.p0.parsed.y >= mean ? POSITIVE : NEGATIVE,
          },
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 400 },
      interaction: { mode: "index", intersect: false },
      plugins: plugins(paint, font, false, {
        label: (ctx: { datasetIndex: number; parsed: { y: number } }) =>
          ctx.datasetIndex === 0
            ? `${t("charts.averageLabel")} ${percent(mean, 0)}`
            : `${percent(ctx.parsed.y, 0)}`,
      }),
      scales: {
        x: axis(paint, font, { grid: { display: false }, title: title(paint, font, t("charts.battleAxis")) }, { maxTicksLimit: 12 }),
        y: axis(paint, font, { min: 0, max: 100 }, { stepSize: 25, callback: (v: number) => `${v}%` }),
      },
    },
  });
});

/* ── 2. Strengths ─────────────────────────────────────────────────── */

const strengthChart = computed(() => {
  const list = rows.value;
  if (!list.length) return null;
  return (paint: Paint, font: string) => ({
    type: "bar",
    data: {
      labels: list.map((r) => r.name),
      datasets: [
        {
          label: t("charts.strengthSeries"),
          data: list.map((r) => r.delta),
          backgroundColor: list.map((r) => (r.delta >= 0 ? POSITIVE : NEGATIVE)),
          borderRadius: 4,
          borderSkipped: false,
          barPercentage: 0.7,
        },
      ],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 400 },
      interaction: { mode: "nearest", intersect: true },
      plugins: plugins(paint, font, false, {
        label: (ctx: { dataIndex: number }) => {
          const r = list[ctx.dataIndex];
          if (!r) return "";
          return t("charts.strengthTip", {
            rate: percent(r.winRate, 0),
            delta: signed(r.delta),
            count: count(r.battles),
          });
        },
      }),
      scales: {
        x: axis(paint, font, { title: title(paint, font, t("charts.deltaAxis")) }, { callback: (v: number) => `${v > 0 ? "+" : ""}${v}` }),
        y: axis(paint, font, { grid: { display: false } }, { autoSkip: false }),
      },
    },
  });
});

/* ── 4. Conversion ────────────────────────────────────────────────── */

const conversionChart = computed(() => {
  const d = data.value;
  if (!d || (!d.conversion.win.length && !d.conversion.loss.length)) return null;
  return (paint: Paint, font: string) => ({
    type: "scatter",
    data: {
      datasets: [
        {
          label: t("charts.wins"),
          data: d.conversion.win,
          backgroundColor: alpha(POSITIVE, 0.5),
          borderColor: POSITIVE,
          borderWidth: 1,
          pointRadius: 3,
          pointStyle: "circle",
        },
        {
          label: t("charts.losses"),
          data: d.conversion.loss,
          backgroundColor: alpha(NEGATIVE, 0.4),
          borderColor: NEGATIVE,
          borderWidth: 1,
          pointRadius: 3,
          pointStyle: "triangle",
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 400 },
      interaction: { mode: "nearest", intersect: true },
      plugins: plugins(paint, font, true, {
        label: (ctx: { dataset: { label: string }; parsed: { x: number; y: number } }) =>
          t("charts.conversionTip", {
            outcome: ctx.dataset.label,
            damage: compact(ctx.parsed.x),
            kills: count(ctx.parsed.y),
          }),
      }),
      scales: {
        x: axis(paint, font, { title: title(paint, font, t("charts.damageAxis")) }, { callback: (v: number) => compact(v) }),
        y: axis(paint, font, { beginAtZero: true, title: title(paint, font, t("charts.killsAxis")) }),
      },
    },
  });
});

/* ── 5. Consistency ───────────────────────────────────────────────── */

const damageChart = computed(() => {
  const d = data.value;
  if (!d?.damage.bins.length) return null;
  const bins = d.damage.bins;
  return (paint: Paint, font: string) => ({
    type: "bar",
    data: {
      labels: bins.map((b) => compact(b.to)),
      datasets: [
        {
          label: t("charts.damageSeries"),
          data: bins.map((b) => b.count),
          backgroundColor: alpha(POSITIVE, 0.75),
          borderRadius: 4,
          borderSkipped: false,
          categoryPercentage: 0.96,
          barPercentage: 0.9,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 400 },
      interaction: { mode: "index", intersect: false },
      plugins: plugins(paint, font, false, {
        title: (items: { dataIndex: number }[]) => {
          const b = bins[items[0]?.dataIndex ?? 0];
          return b ? `${compact(b.from)} - ${compact(b.to)}` : "";
        },
        label: (ctx: { parsed: { y: number } }) => t("charts.damageTip", { count: count(ctx.parsed.y) }),
      }),
      scales: {
        x: axis(paint, font, { grid: { display: false }, title: title(paint, font, t("charts.damageAxis")) }, { maxTicksLimit: 12 }),
        y: axis(paint, font, { beginAtZero: true, title: title(paint, font, t("charts.battlesAxis")) }),
      },
    },
  });
});

/* ── 6. Clock ─────────────────────────────────────────────────────── */

const clockChart = computed(() => {
  const d = data.value;
  if (!d?.clock.some((h) => h.winRate != null)) return null;
  const hours = d.clock;
  const mean = d.average;
  return (paint: Paint, font: string) => ({
    type: "bar",
    data: {
      labels: hours.map((h) => String(h.hour).padStart(2, "0")),
      datasets: [
        {
          label: t("charts.clockSeries"),
          data: hours.map((h) => (h.winRate == null ? null : h.winRate - mean)),
          backgroundColor: hours.map((h) =>
            h.winRate == null ? NEUTRAL : h.winRate >= mean ? POSITIVE : NEGATIVE,
          ),
          borderRadius: 4,
          borderSkipped: false,
          categoryPercentage: 0.9,
          barPercentage: 0.85,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 400 },
      interaction: { mode: "index", intersect: false },
      plugins: plugins(paint, font, false, {
        label: (ctx: { dataIndex: number }) => {
          const h = hours[ctx.dataIndex];
          if (!h) return "";
          if (h.winRate == null) return t("charts.tooThin", { count: count(h.battles) });
          return t("charts.clockTip", { rate: percent(h.winRate, 0), count: count(h.battles) });
        },
      }),
      scales: {
        x: axis(paint, font, { grid: { display: false }, title: title(paint, font, t("charts.hourAxis")) }, { maxRotation: 0, autoSkip: true, maxTicksLimit: 8 }),
        y: axis(paint, font, { title: title(paint, font, t("charts.deltaAxis")) }, { maxTicksLimit: 6, callback: (v: number) => `${v > 0 ? "+" : ""}${v}` }),
      },
    },
  });
});

/* ── 7. Session shape ─────────────────────────────────────────────── */

const sessionChart = computed(() => {
  const d = data.value;
  if (!d?.sessions.some((s) => s.winRate != null)) return null;
  const slots = d.sessions;
  const mean = d.average;
  const last = slots.length - 1;
  return (paint: Paint, font: string) => ({
    type: "line",
    data: {
      labels: slots.map((s) => (s.index === last ? `${s.index + 1}+` : String(s.index + 1))),
      datasets: [
        baseline(paint, mean, slots.length, t("charts.averageLabel")),
        {
          label: t("charts.sessionSeries"),
          data: slots.map((s) => s.winRate),
          borderColor: CATEGORICAL[2],
          backgroundColor: alpha(String(CATEGORICAL[2]), 0.15),
          borderWidth: 2,
          pointRadius: 4,
          pointBackgroundColor: CATEGORICAL[2],
          tension: 0.25,
          spanGaps: false,
          fill: true,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 400 },
      interaction: { mode: "index", intersect: false },
      plugins: plugins(paint, font, false, {
        label: (ctx: { datasetIndex: number; dataIndex: number; parsed: { y: number } }) => {
          if (ctx.datasetIndex === 0) return `${t("charts.averageLabel")} ${percent(mean, 0)}`;
          const s = slots[ctx.dataIndex];
          return s ? t("charts.sessionTip", { rate: percent(ctx.parsed.y, 0), count: count(s.battles) }) : "";
        },
      }),
      scales: {
        x: axis(paint, font, { grid: { display: false }, title: title(paint, font, t("charts.sessionAxis")) }),
        y: axis(paint, font, {}, { maxTicksLimit: 5, callback: (v: number) => `${v}%` }),
      },
    },
  });
});
</script>

<template>
  <p v-if="!ready" class="notice">{{ t("charts.empty") }}</p>

  <!-- One focus for the whole page: whatever the pointer is on, everything else stands down. -->
  <div v-else class="charts" :class="{ focusing: !!focus }">
    <header class="rail">
      <span class="seal" aria-hidden="true"><i class="wedge flip" /><i class="wedge" /></span>
      <h2 class="rail-title">{{ t("charts.railTitle") }}</h2>
      <span class="rail-lead">{{ t("charts.railLead") }}</span>
      <span class="rail-hint">{{ t("charts.railHint") }}</span>
    </header>

    <eChartCard
      v-slot="{ visible }"
      class="wide"
      index="01"
      :order="0"
      :title="t('charts.formTitle')"
      :caption="t('charts.formCaption', { window: formWindow, rate: percent(average, 0) })"
      :readings="formReading"
      :focused="focus === 'form'"
      :dimmed="!!focus && focus !== 'form'"
      tall
      @enter="focus = 'form'"
      @leave="rest('form')"
    >
      <eChart v-if="formChart" :build="formChart" :active="visible" />
      <p v-else class="thin">{{ t("charts.formThin", { window: formWindow }) }}</p>
    </eChartCard>

    <eChartCard
      class="wide"
      index="02"
      :order="1"
      :title="t('charts.strengthTitle')"
      :caption="t('charts.strengthCaption', { rate: percent(average, 0) })"
      :readings="strengthReading"
      :focused="focus === 'strength'"
      :dimmed="!!focus && focus !== 'strength'"
      tall
      @enter="focus = 'strength'"
      @leave="rest('strength')"
    >
      <template #controls>
        <eSegmented
          class="dimension"
          :model-value="dimension"
          :options="dimensionOptions"
          @update:model-value="dimension = $event"
        />
      </template>
      <template #default="{ visible }">
        <eChart v-if="strengthChart" :build="strengthChart" :active="visible" />
        <p v-else class="thin">{{ t("charts.strengthThin") }}</p>
      </template>
    </eChartCard>

    <eChartCard
      class="wide"
      index="03"
      :order="2"
      :title="t('charts.gridTitle')"
      :caption="t('charts.gridCaption')"
      :readings="gridReading"
      :focused="focus === 'grid'"
      :dimmed="!!focus && focus !== 'grid'"
      @enter="focus = 'grid'"
      @leave="rest('grid')"
    >
      <eWinGrid :maps="grid.maps" :modes="grid.modes" :cells="grid.cells" :average="average" />
    </eChartCard>

    <div class="pair">
      <eChartCard
        v-slot="{ visible }"
        index="04"
        :order="3"
        :title="t('charts.conversionTitle')"
        :caption="t('charts.conversionCaption')"
        :readings="conversionReading"
        :focused="focus === 'conversion'"
        :dimmed="!!focus && focus !== 'conversion'"
        @enter="focus = 'conversion'"
        @leave="rest('conversion')"
      >
        <eChart v-if="conversionChart" :build="conversionChart" :active="visible" />
      </eChartCard>

      <eChartCard
        v-slot="{ visible }"
        index="05"
        :order="4"
        :title="t('charts.damageTitle')"
        :caption="t('charts.damageCaption', { median: compact(spread.median), mean: compact(spread.mean) })"
        :readings="damageReading"
        :focused="focus === 'damage'"
        :dimmed="!!focus && focus !== 'damage'"
        @enter="focus = 'damage'"
        @leave="rest('damage')"
      >
        <eChart v-if="damageChart" :build="damageChart" :active="visible" />
      </eChartCard>
    </div>

    <div class="pair">
      <eChartCard
        v-slot="{ visible }"
        index="06"
        :order="5"
        :title="t('charts.clockTitle')"
        :caption="t('charts.clockCaption')"
        :readings="clockReading"
        :focused="focus === 'clock'"
        :dimmed="!!focus && focus !== 'clock'"
        @enter="focus = 'clock'"
        @leave="rest('clock')"
      >
        <eChart v-if="clockChart" :build="clockChart" :active="visible" />
        <p v-else class="thin">{{ t("charts.clockThin") }}</p>
      </eChartCard>

      <eChartCard
        v-slot="{ visible }"
        index="07"
        :order="6"
        :title="t('charts.sessionTitle')"
        :caption="t('charts.sessionCaption')"
        :readings="sessionReading"
        :focused="focus === 'session'"
        :dimmed="!!focus && focus !== 'session'"
        @enter="focus = 'session'"
        @leave="rest('session')"
      >
        <eChart v-if="sessionChart" :build="sessionChart" :active="visible" />
        <p v-else class="thin">{{ t("charts.sessionThin") }}</p>
      </eChartCard>
    </div>
  </div>
</template>

<style scoped>
.charts {
  container-type: inline-size;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  width: 100%;
  padding: 0 var(--space-4);
  box-sizing: border-box;
}

.rail {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-width: 0;
  padding-bottom: var(--space-1);
}

.seal {
  flex: none;
  display: flex;
  align-items: center;
  height: 10px;
}

.wedge {
  width: 10px;
  height: 10px;
  background: var(--base-600);
  clip-path: polygon(0 100%, 50% 100%, 100% 50%, 50% 50%, 50% 0, 0 50%);
}

.wedge.flip {
  transform: rotate(180deg);
}

.rail-title {
  flex: none;
  margin: 0;
  font-family: var(--font-primary);
  font-size: var(--main-font-size-3);
  font-weight: var(--font-weight-2);
  line-height: normal;
  color: var(--text-main);
  text-transform: uppercase;
}

.rail-lead,
.rail-hint {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-microcopy);
  font-size: var(--secondary-font-size-4);
  line-height: normal;
  color: var(--text-muted);
}

.rail-hint {
  flex: none;
  margin-left: auto;
  font-size: var(--secondary-font-size-5);
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--base-600);
  transition: color 0.2s;
}

/* Once the page is being read, the instruction has done its job. */
.charts.focusing .rail-hint {
  color: transparent;
}

.wide,
.pair {
  flex: none;
  width: 100%;
}

.pair {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(380px, 1fr));
  align-items: stretch;
  gap: var(--space-3);
}

.notice,
.thin {
  margin: 0;
  font-family: var(--font-microcopy);
  font-size: var(--secondary-font-size-4);
  line-height: 1.4;
  color: var(--text-muted);
}

.notice {
  padding: var(--space-5);
  text-align: center;
}

.dimension {
  margin-left: auto;
}

/* Too narrow for the premise; the hint and the cards still carry the page. */
@container (max-width: 660px) {
  .rail-lead {
    display: none;
  }
}
</style>
