<script setup lang="ts">
import { computed } from "vue";
import { useTipDirective } from "fuse_ui/ui/tooltip.mjs";
import { useI18n } from "./i18n.mjs";

const props = defineProps<{ activity: Record<string, number> | null }>();

const { t, n, fixed, date, plural } = useI18n();
const vTip = useTipDirective();

const WEEKS = 53;
const LEVELS = [0, 1, 2, 3, 4];
const LABELLED_ROWS = [1, 3, 5];
const MONTH_ROOM = 3;

/** Local calendar day, as the plugin keys `activity`. */
function dayKey(day: Date): string {
  const pad = (v: number) => String(v).padStart(2, "0");
  return `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;
}

function count(value: number): string {
  return n(value, { maximumFractionDigits: 0 });
}

function tipFor(battles: number, day: Date): string {
  const when = date(day, { year: "numeric", month: "short", day: "numeric" });
  if (!battles) return t("activity.none", { date: when });
  const form: string = plural(battles);
  const key = `activity.day${form.charAt(0).toUpperCase()}${form.slice(1)}`;
  const params = { count: count(battles), date: when };
  const text = t(key, params);
  return text === key ? t("activity.dayOther", params) : text;
}

const grid = computed(() => {
  const days = props.activity ?? {};
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const first = today.getDate() - today.getDay() - (WEEKS - 1) * 7;
  const cells: { key: string; col: number; row: number; battles: number; day: Date }[] = [];
  const months: { col: number; label: string }[] = [];
  let month = -1;
  let max = 0;
  let total = 0;
  for (let col = 0; col < WEEKS; col++) {
    for (let row = 0; row < 7; row++) {
      const day = new Date(today.getFullYear(), today.getMonth(), first + col * 7 + row);
      if (day > today) break;
      if (row === 0 && day.getMonth() !== month) {
        month = day.getMonth();
        months.push({ col, label: date(day, { month: "short" }) });
      }
      const key = dayKey(day);
      const battles = days[key] ?? 0;
      max = Math.max(max, battles);
      total += battles;
      cells.push({ key, col, row, battles, day });
    }
  }
  if (months.length > 1 && months[1]!.col - months[0]!.col < MONTH_ROOM) months.shift();

  let played = 0;
  let run = 0;
  let longest = 0;
  for (const c of cells) {
    if (c.battles > 0) {
      played += 1;
      run += 1;
      longest = Math.max(longest, run);
    } else {
      run = 0;
    }
  }

  return {
    months,
    total,
    played,
    busiest: max,
    longest,
    perDay: played ? total / played : 0,
    cells: cells.map((c) => ({
      ...c,
      level: c.battles ? Math.min(4, Math.ceil((c.battles / max) * 4)) : 0,
      tip: tipFor(c.battles, c.day),
    })),
  };
});

const readout = computed(() => [
  { id: "played", label: t("activity.days"), value: count(grid.value.played) },
  { id: "perDay", label: t("activity.perDay"), value: fixed(grid.value.perDay, 1) },
  { id: "busiest", label: t("activity.busiest"), value: count(grid.value.busiest) },
  { id: "run", label: t("activity.run"), value: t("activity.runDays", { count: count(grid.value.longest) }) },
]);

const weekdays = computed(() =>
  LABELLED_ROWS.map((row) => ({ row, label: date(new Date(2023, 0, 1 + row), { weekday: "short" }) })),
);
</script>

<template>
  <section class="activity">
    <div class="surface" />

    <header class="head">
      <span class="seal" aria-hidden="true"><i class="wedge flip" /><i class="wedge" /></span>
      <h3 class="title">{{ t("activity.heading") }}</h3>
      <span class="total">{{ activity ? count(grid.total) : n(null) }}</span>
    </header>

    <!-- What the squares cannot say: how often, how hard, how long a run. -->
    <div class="readout">
      <span v-for="r in readout" :key="r.id" class="cellread">
        <span class="read-label">{{ r.label }}</span>
        <span class="read-value">{{ r.value }}</span>
      </span>
    </div>

    <div class="grid">
      <span v-for="m in grid.months" :key="`m${m.col}`" class="month" :style="{ gridColumn: m.col + 2 }">
        {{ m.label }}
      </span>
      <span v-for="w in weekdays" :key="`w${w.row}`" class="weekday" :style="{ gridRow: w.row + 2 }">
        {{ w.label }}
      </span>
      <div
        v-for="c in grid.cells"
        :key="c.key"
        v-tip="c.tip"
        class="cell"
        :class="`level-${c.level}`"
        :style="{ gridColumn: c.col + 2, gridRow: c.row + 2 }"
      />
    </div>
    <div class="legend">
      <span class="legend-label">{{ t("activity.less") }}</span>
      <div v-for="level in LEVELS" :key="level" class="cell swatch" :class="`level-${level}`" />
      <span class="legend-label">{{ t("activity.more") }}</span>
    </div>
  </section>
</template>

<style scoped>
.activity {
  position: relative;
  flex: none;
  width: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
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

.head {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}

.seal {
  flex: none;
  display: flex;
  align-items: center;
  height: 9px;
}

.wedge {
  width: 9px;
  height: 9px;
  background: var(--base-600);
  clip-path: polygon(0 100%, 50% 100%, 100% 50%, 50% 50%, 50% 0, 0 50%);
}

.wedge.flip {
  transform: rotate(180deg);
}

.title {
  position: relative;
  margin: 0;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  font-family: var(--font-primary);
  font-size: var(--main-font-size-2);
  font-weight: var(--font-weight-2);
  line-height: normal;
  color: var(--text-main);
  text-transform: uppercase;
  white-space: nowrap;
}

/* The year's one anchor datum. */
.total {
  margin-left: auto;
  font-family: var(--font-microcopy);
  font-size: var(--main-font-size-2);
  line-height: 1;
  color: var(--text-main);
  font-variant-numeric: tabular-nums;
}

.readout {
  position: relative;
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1) var(--space-5);
  padding-bottom: var(--space-1);
}

.cellread {
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
  min-width: 0;
}

.read-label {
  font-family: var(--font-microcopy);
  font-size: var(--secondary-font-size-5);
  line-height: 1;
  letter-spacing: 0.1em;
  color: var(--text-muted);
  text-transform: uppercase;
  white-space: nowrap;
}

.read-value {
  font-family: var(--font-microcopy);
  font-size: var(--main-font-size-4);
  line-height: 1;
  color: var(--text-main);
  font-variant-numeric: tabular-nums;
}
.grid {
  position: relative;
  display: grid;
  grid-template-columns: auto repeat(53, minmax(0, 1fr));
  gap: 3px;
}

.month,
.weekday,
.legend-label {
  font-family: var(--font-microcopy);
  font-size: var(--secondary-font-size-5);
  line-height: 1;
  letter-spacing: 0.1em;
  color: var(--text-muted);
  text-transform: uppercase;
  white-space: nowrap;
}

/* A tick under the label, so a month reads as a mark on a scale. */
.month {
  grid-row: 1;
  min-width: 0;
  overflow: visible;
  padding-bottom: var(--space-1);
  border-bottom: 1px solid var(--base-600);
}

.weekday {
  grid-column: 1;
  align-self: center;
  padding-right: var(--space-2);
}

.cell {
  position: relative;
  aspect-ratio: 1;
  background: var(--accent-200);
  corner-shape: bevel;
  border-radius: 2px 0 2px 0;
}

.cell.level-0 {
  background: none;
}

.cell.level-0::after {
  content: "";
  position: absolute;
  top: 50%;
  left: 50%;
  width: 2px;
  height: 2px;
  margin: -1px 0 0 -1px;
  background: var(--base-600);
}

.level-1 {
  background: color-mix(in srgb, var(--accent-200) 25%, transparent);
}

.level-2 {
  background: color-mix(in srgb, var(--accent-200) 50%, transparent);
}

.level-3 {
  background: color-mix(in srgb, var(--accent-200) 75%, transparent);
}

.level-4 {
  background: var(--accent-200);
}

.legend {
  position: relative;
  align-self: flex-end;
  display: flex;
  align-items: center;
  gap: 3px;
}

.legend-label {
  padding: 0 var(--space-1);
}

.swatch {
  width: 10px;
  aspect-ratio: 1;
}
</style>
