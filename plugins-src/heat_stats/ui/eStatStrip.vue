<script setup lang="ts">
import { computed, ref } from "vue";
import { motion } from "motion-v";
import { Dynamics } from "fuse_ui/ui/dynamics.mjs";
import eCounter from "./eCounter.vue";
import { useI18n } from "./i18n.mjs";

interface Totals {
  battles: number;
  wins: number;
  losses: number;
  winRate: number;
  kd: number;
  avgPlacement: number | null;
  avgKills: number;
  avgDamage: number;
}

const props = defineProps<{ totals: Totals | null }>();

const { t, n, fixed } = useI18n();

const hovered = ref("");

const tiles = computed(() => {
  const o = props.totals;
  const rows: { id: string; label: string; value: number | null; format: (v: number) => string }[] = [
    { id: "kd", label: t("overview.kd"), value: o?.kd ?? null, format: (v) => fixed(v, 2) },
    { id: "avgKills", label: t("overview.avgKills"), value: o?.avgKills ?? null, format: (v) => fixed(v, 1) },
    {
      id: "avgDamage",
      label: t("overview.avgDamage"),
      value: o?.avgDamage ?? null,
      format: (v) => n(Math.round(v), { maximumFractionDigits: 0 }),
    },
    {
      id: "avgPlacement",
      label: t("overview.avgPlacement"),
      value: o?.avgPlacement ?? null,
      format: (v) => fixed(v, 1),
    },
  ];
  return rows.map((r, i) => ({ ...r, index: String(i + 1).padStart(2, "0") }));
});
</script>

<template>
  <div class="strip">
    <motion.div
      v-for="(tile, i) in tiles"
      :key="tile.id"
      class="tile"
      :class="{ blank: tile.value == null }"
      :initial="{ opacity: 0, y: 8 }"
      :animate="{ opacity: 1, y: 0 }"
      :transition="{ ...Dynamics.snappy, delay: i * 0.04 }"
      @pointerenter="hovered = tile.id"
      @pointerleave="hovered = ''"
    >
      <span class="tile-face" />
      <span class="tile-tab"><i>{{ tile.index }}</i></span>

      <motion.span
        class="tile-body"
        :initial="false"
        :animate="{ x: hovered === tile.id ? 2 : 0 }"
        :transition="Dynamics.spring"
      >
        <span class="tile-label">{{ tile.label }}</span>
        <eCounter
          v-if="tile.value != null"
          class="tile-value"
          :value="tile.value"
          :format="tile.format"
          :delay="i * 0.06"
        />
        <span v-else class="tile-value">{{ t("overview.noReading") }}</span>
      </motion.span>
    </motion.div>
  </div>
</template>

<style scoped>
.strip {
  flex: none;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: var(--space-2);
  width: 100%;
}

.tile {
  position: relative;
  display: flex;
  align-items: stretch;
  height: 72px;
  box-sizing: border-box;
  background: var(--base-600);
}

.tile-face {
  position: absolute;
  inset: 0;
  box-sizing: border-box;
  background: var(--black-2);
  border: 1px solid var(--base-600);
  corner-shape: bevel;
  border-radius: 8px 0 8px 0;
  pointer-events: none;
  transition: background 0.15s, border-color 0.15s;
}

.tile:hover .tile-face {
  background: var(--black-3);
  border-color: var(--base-200);
}

.tile-tab {
  position: relative;
  flex: none;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  width: 18px;
  padding-top: var(--space-2);
}

.tile-tab i {
  writing-mode: vertical-rl;
  transform: rotate(180deg);
  font-family: var(--font-microcopy);
  font-size: var(--secondary-font-size-5);
  line-height: 1;
  letter-spacing: 0.12em;
  color: var(--base-600);
  font-variant-numeric: tabular-nums;
  font-style: normal;
  transition: color 0.15s;
}

.tile:hover .tile-tab i {
  color: var(--text-muted);
}

.tile-body {
  position: relative;
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: var(--space-1);
  padding: 0 var(--space-3) 0 var(--space-1);
}

.tile-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-primary);
  font-size: var(--main-font-size-4);
  font-weight: var(--font-weight-2);
  line-height: 1;
  letter-spacing: 0.04em;
  color: var(--text-muted);
  text-transform: uppercase;
}

.tile-value {
  font-family: var(--font-microcopy);
  font-size: 28px;
  line-height: 1;
  color: var(--text-main);
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
}

.tile.blank .tile-face {
  background: repeating-linear-gradient(135deg, rgba(255, 255, 255, 0.03) 0 1px, transparent 1px 7px),
    var(--black-2);
}

.tile.blank .tile-value {
  font-size: var(--main-font-size-3);
  color: var(--base-600);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
</style>
