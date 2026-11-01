<script lang="ts">
export interface SamplesEntry {
  state: "loading" | "ready" | "missing" | "error";
  samples?: Record<string, number | string | null>[];
}
</script>

<script setup lang="ts">
import { computed, shallowRef, watch } from "vue";
import eChart, { type Paint } from "./eChart.vue";
import { useI18n } from "./i18n.mjs";

type Sample = Record<string, number | string | null>;
type Series = (number | null)[];

interface ChartCard {
  id: string;
  title: string;
  build: (paint: Paint, font: string) => object;
}

const props = defineProps<{
  entry: SamplesEntry | null;
  ready: boolean;
}>();

const { t } = useI18n();

// The plugin re-sends every open battle's samples when any of them changes; only rebuild when this one's did.
const samples = shallowRef<Sample[]>([]);
watch(
  () => props.entry,
  (entry) => {
    const next = entry?.state === "ready" ? (entry.samples ?? []) : [];
    const cur = samples.value;
    const same = next.length === cur.length && next[next.length - 1]?.t === cur[cur.length - 1]?.t;
    if (!same) samples.value = next;
  },
  { immediate: true },
);

const notice = computed(() => {
  const state = props.entry?.state ?? "loading";
  if (state === "loading") return t("battles.samplesLoading");
  if (state === "error") return t("battles.samplesError");
  return samples.value.length ? "" : t("battles.samplesMissing");
});

function clock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function series(list: Sample[], key: string): Series {
  return list.map((s) => (typeof s[key] === "number" ? (s[key] as number) : null));
}

function hasData(...all: Series[]): boolean {
  return all.some((values) => values.some((v) => v != null));
}

function options(paint: Paint, font: string, scales: Record<string, object>, legend = true): object {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 400 },
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: {
        display: legend,
        labels: { color: paint("--text-muted"), font: { family: font, size: 11 }, boxWidth: 12 },
      },
      tooltip: {
        backgroundColor: paint("--base-900", 0.95),
        borderColor: paint("--base-600"),
        borderWidth: 1,
        titleColor: paint("--text-main"),
        bodyColor: paint("--text-muted"),
        titleFont: { family: font },
        bodyFont: { family: font },
      },
    },
    scales,
  };
}

function axis(paint: Paint, font: string, extra: object = {}, ticks: object = {}, color = "--text-muted"): object {
  return {
    grid: { color: paint("--base-600", 0.25) },
    ticks: { color: paint(color), font: { family: font, size: 10 }, ...ticks },
    ...extra,
  };
}

function line(paint: Paint, label: string, data: Series, color: string, extra: object = {}): object {
  return {
    label,
    data,
    borderColor: paint(color),
    backgroundColor: paint(color, 0.1),
    borderWidth: 2,
    // One point a second is too dense to draw. Hover still marks the point.
    pointRadius: 0,
    tension: 0.3,
    fill: true,
    spanGaps: false,
    ...extra,
  };
}

const charts = computed<ChartCard[]>(() => {
  const list = samples.value;
  if (!list.length) return [];
  const labels = list.map((s) => clock(Number(s.t) || 0));
  const x = (paint: Paint, font: string) => axis(paint, font, {}, { maxTicksLimit: 10 });
  const cards: ChartCard[] = [];

  const ally = series(list, "al");
  const enemy = series(list, "es");
  if (hasData(ally, enemy)) {
    cards.push({
      id: "scores",
      title: t("battles.chartScores"),
      build: (paint, font) => ({
        type: "line",
        data: {
          labels,
          datasets: [
            line(paint, t("battles.ally"), ally, "--accent-200"),
            line(paint, t("battles.enemyTeam"), enemy, "--error-base"),
          ],
        },
        options: options(paint, font, { x: x(paint, font), y: axis(paint, font, { beginAtZero: true }) }),
      }),
    });
  }

  const kills = series(list, "ki");
  const damage = series(list, "da");
  if (hasData(kills, damage)) {
    cards.push({
      id: "killsDamage",
      title: t("battles.chartKillsDamage"),
      build: (paint, font) => ({
        type: "line",
        data: {
          labels,
          datasets: [
            line(paint, t("battles.kills"), kills, "--accent-200", {
              fill: false,
              stepped: "before",
              tension: 0,
              yAxisID: "yK",
            }),
            line(paint, t("battles.damageSeries"), damage, "--accent-600", { yAxisID: "yD" }),
          ],
        },
        options: options(paint, font, {
          x: x(paint, font),
          yK: axis(paint, font, { position: "left", beginAtZero: true }, { stepSize: 1 }, "--accent-200"),
          yD: axis(paint, font, { position: "right", beginAtZero: true, grid: { drawOnChartArea: false } }, {}, "--accent-600"),
        }),
      }),
    });
  }

  const gauge = (id: string, titleKey: string, key: string, color: string, max?: number): void => {
    const data = series(list, key);
    if (!hasData(data)) return;
    cards.push({
      id,
      title: t(titleKey),
      build: (paint, font) => ({
        type: "line",
        data: { labels, datasets: [line(paint, t(titleKey), data, color)] },
        options: options(
          paint,
          font,
          { x: x(paint, font), y: axis(paint, font, max ? { min: 0, max } : { min: 0 }, {}, color) },
          false,
        ),
      }),
    });
  };
  gauge("health", "battles.chartHealth", "hp", "--error-base");
  gauge("energy", "battles.chartEnergy", "en", "--accent-150", 100);
  gauge("boost", "battles.chartBoost", "bo", "--accent-200", 100);

  const ping = series(list, "pi");
  const fps = series(list, "fp");
  if (hasData(ping, fps)) {
    cards.push({
      id: "pingFps",
      title: t("battles.chartPingFps"),
      build: (paint, font) => ({
        type: "line",
        data: {
          labels,
          datasets: [
            line(paint, t("battles.ping"), ping, "--accent-150", { fill: false, yAxisID: "yP" }),
            line(paint, t("battles.fps"), fps, "--accent-200", { yAxisID: "yF" }),
          ],
        },
        options: options(paint, font, {
          x: x(paint, font),
          yP: axis(paint, font, { position: "left", beginAtZero: true }, {}, "--accent-150"),
          yF: axis(paint, font, { position: "right", beginAtZero: true, grid: { drawOnChartArea: false } }, {}, "--accent-200"),
        }),
      }),
    });
  }

  return cards;
});
</script>

<template>
  <section class="dynamics">
    <header class="head">
      <span class="seal" aria-hidden="true"><i class="wedge flip" /><i class="wedge" /></span>
      <h4 class="title">{{ t("battles.dynamics") }}</h4>
      <span class="rule" />
    </header>
    <p v-if="notice" class="notice">{{ notice }}</p>
    <div v-else class="grid">
      <div v-for="c in charts" :key="c.id" class="card">
        <div class="surface" />
        <span class="card-title">{{ c.title }}</span>
        <eChart class="plot" :build="c.build" :active="ready" />
      </div>
    </div>
  </section>
</template>

<style scoped>
.dynamics {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.title,
.card-title,
.notice {
  margin: 0;
  font-family: var(--font-primary);
  line-height: normal;
  color: var(--text-muted);
}

.head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}

.seal {
  flex: none;
  display: flex;
  align-items: center;
  height: 8px;
}

.wedge {
  width: 8px;
  height: 8px;
  background: var(--base-600);
  clip-path: polygon(0 100%, 50% 100%, 100% 50%, 50% 50%, 50% 0, 0 50%);
}

.wedge.flip {
  transform: rotate(180deg);
}

.rule {
  flex: 1 1 auto;
  height: 1px;
  background: var(--base-600);
}

.title {
  flex: none;
  font-size: var(--main-font-size-3);
  font-weight: var(--font-weight-2);
  letter-spacing: 0.06em;
  color: var(--text-main);
  text-transform: uppercase;
  white-space: nowrap;
}

.notice {
  font-size: var(--main-font-size-3);
}

.grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-2);
}

.card {
  position: relative;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
}

.surface {
  position: absolute;
  inset: 0;
  box-sizing: border-box;
  background: var(--black-1-a);
  border: 1px solid var(--base-600);
  corner-shape: bevel;
  border-radius: 6px 0 6px 0;
  pointer-events: none;
}

.card-title {
  position: relative;
  font-size: var(--main-font-size-3);
  text-transform: uppercase;
  white-space: nowrap;
}

.plot {
  position: relative;
}
</style>
