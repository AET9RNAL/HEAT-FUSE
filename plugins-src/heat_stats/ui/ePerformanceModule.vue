<script setup lang="ts">
import { computed, ref } from "vue";
import { motion } from "motion-v";
import { Dynamics } from "fuse_ui/ui/dynamics.mjs";
import Icons from "fuse_ui/ui/Icons.vue";
import ePerformanceEntry from "./ePerformanceEntry.vue";
import { useI18n } from "./i18n.mjs";

const props = defineProps<{
  title: string;
  nameLabel: string;
  columns: string[];
  rows: { key: string; name: string; values: number[] }[];
  formats: ((v: number) => string)[];
  average?: number | null;
  dimmed?: boolean;
}>();

const { t, n } = useI18n();

const totalBattles = computed(() => props.rows.reduce((sum, r) => sum + (r.values[0] ?? 0), 0));

const sort = ref<{ column: number; dir: "desc" | "asc" } | null>(null);

function toggle(column: number): void {
  const s = sort.value;
  sort.value = { column, dir: s?.column === column && s.dir === "desc" ? "asc" : "desc" };
}

const sorted = computed(() => {
  const s = sort.value;
  if (!s) return props.rows;
  const sign = s.dir === "desc" ? -1 : 1;
  return [...props.rows].sort((a, b) => sign * ((a.values[s.column] ?? 0) - (b.values[s.column] ?? 0)));
});
</script>

<template>
  <section class="module" :class="{ dimmed }">
    <div class="surface" />
    <header class="header">
      <div class="header-surface" />
      <h3 class="title">
        <span class="seal" aria-hidden="true"><i class="wedge flip" /><i class="wedge" /></span>
        {{ title }}
        <span class="tracked">{{ t("performance.tracked", { count: n(rows.length, { maximumFractionDigits: 0 }) }) }}</span>
      </h3>
    </header>
    <div class="definer">
      <span class="heading rank-head" aria-hidden="true" />
      <span class="heading">{{ nameLabel }}</span>
      <button
        v-for="(column, i) in columns"
        :key="column"
        type="button"
        class="heading metric"
        :class="{ active: sort?.column === i }"
        @click="toggle(i)"
      >
        <motion.span
          class="metric-body"
          :initial="false"
          :animate="{ y: sort?.column === i ? -4 : 0 }"
          :transition="Dynamics.circOut"
        >
          <span class="label">{{ column }}</span>
          <Icons
            v-if="sort?.column === i"
            :kind="sort?.dir === 'desc' ? 'arrow-down' : 'arrow-up'"
            size="small"
            color="var(--text-main)"
          />
        </motion.span>
      </button>
    </div>
    <div class="entries">
      <ePerformanceEntry
        v-for="(row, i) in sorted"
        :key="row.key"
        :rank="String(i + 1).padStart(2, '0')"
        :name="row.name"
        :values="row.values"
        :formats="formats"
        :share="totalBattles ? (row.values[0] ?? 0) / totalBattles : 0"
        :delta="average == null ? null : (row.values[4] ?? 0) - average"
        :sorted="sort?.column ?? -1"
      />
    </div>
  </section>
</template>

<style scoped>
.module {
  --perf-columns: 18px minmax(0, 4.5fr) repeat(5, minmax(0, 1fr));

  position: relative;
  flex: 1 0 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
  padding: 0 var(--space-2) var(--space-1);
  box-sizing: border-box;
  background: var(--black-2-a);
  transition: opacity 0.2s;
}

.module.dimmed {
  opacity: 0.45;
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

.header {
  position: relative;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px 0;
  box-sizing: border-box;
}

.header-surface {
  position: absolute;
  top: 0;
  left: calc(-1 * var(--space-2));
  right: calc(-1 * var(--space-2));
  height: 46px;
  box-sizing: border-box;
  background: var(--black-3-a);
  border: 1px solid var(--base-600);
  border-bottom: none;
  corner-shape: bevel;
  border-radius: 6px 0 0 0;
  pointer-events: none;
}

.title {
  position: relative;
  margin: 0;
  height: 26px;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
  font-family: var(--font-primary);
  font-size: var(--main-font-size-2);
  font-weight: var(--font-weight-2);
  line-height: normal;
  color: var(--text-main);
  text-transform: uppercase;
  white-space: nowrap;
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

.tracked {
  margin-left: auto;
  padding-left: var(--space-2);
  font-family: var(--font-microcopy);
  font-size: var(--secondary-font-size-5);
  letter-spacing: 0.08em;
  color: var(--text-muted);
  text-transform: uppercase;
}

.rank-head {
  min-width: 0;
}

.definer,
.entries {
  scrollbar-gutter: stable;
}

.definer {
  position: relative;
  width: 100%;
  display: grid;
  grid-template-columns: var(--perf-columns);
  align-items: start;
  overflow: hidden;
  padding-top: var(--space-2);
  margin-top: calc(var(--space-2) * -1);
}

.entries {
  position: relative;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-top: 1px;
  font-family: var(--font-primary);
  font-size: var(--main-font-size-3);
  line-height: normal;
  max-height: calc(4 * (1lh + 2 * var(--space-1) + 2px) + 3 * 10px);
  overflow-y: auto;
}

.heading {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  font-family: var(--font-primary);
  font-size: var(--main-font-size-3);
  font-weight: var(--font-weight-2);
  line-height: normal;
  color: var(--text-muted);
  text-transform: uppercase;
  white-space: nowrap;
}

.metric {
  display: flex;
  overflow: visible;
  margin: 0;
  padding: 0;
  border: none;
  background: none;
  text-align: left;
  cursor: pointer;
}

.metric:hover,
.metric.active {
  color: var(--text-main);
}

.metric-body {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--space-1);
}

.label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
