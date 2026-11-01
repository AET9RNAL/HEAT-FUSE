<script setup lang="ts">
import { computed, ref } from "vue";
import { motion } from "motion-v";
import { Dynamics } from "fuse_ui/ui/dynamics.mjs";
import eActivity from "./eActivity.vue";
import eBrandMark from "./eBrandMark.vue";
import eCounter from "./eCounter.vue";
import eMatchStreak from "./eMatchStreak.vue";
import eStatStrip from "./eStatStrip.vue";
import ePerformanceModule from "./ePerformanceModule.vue";
import { useI18n } from "./i18n.mjs";

interface PerformanceRow {
  key: string;
  name: string;
  battles: number;
  kd: number;
  damage: number;
  score: number;
  winRate: number;
}

interface OverviewData {
  battles: number;
  wins: number;
  losses: number;
  winRate: number;
  kd: number;
  avgPlacement: number | null;
  avgKills: number;
  avgDamage: number;
  streak: string[];
  longestWinStreak: number | null;
  activity: Record<string, number> | null;
  vehicles: PerformanceRow[];
  agents: PerformanceRow[];
  maps: PerformanceRow[];
  modes: PerformanceRow[];
}

const props = defineProps<{ overview: object | null; streakLength: number }>();

const { t, n, fixed, percent, compact } = useI18n();

const data = computed(() => props.overview as OverviewData | null);

const count = (v: number | null | undefined): string => n(v, { maximumFractionDigits: 0 });

const table = ref("");

const anchor = computed(() => {
  const o = data.value;
  if (!o) return null;
  return {
    rate: o.winRate,
    battles: count(o.battles),
    wins: t("overview.wins", { count: count(o.wins) }),
    losses: t("overview.losses", { count: count(o.losses) }),
  };
});

const columns = computed(() => [
  t("performance.battles"),
  t("performance.kd"),
  t("performance.damage"),
  t("performance.score"),
  t("performance.winRate"),
]);

const formats: ((v: number) => string)[] = [
  (v) => n(Math.round(v), { maximumFractionDigits: 0 }),
  (v) => fixed(v, 2),
  (v) => compact(v),
  (v) => compact(v),
  (v) => percent(v, 1),
];

function modeName(key: string): string {
  const path = `modes.${key.toLowerCase().replace(/[\s_-]/g, "")}`;
  const label = t(path);
  return label === path ? key : label;
}

const modules = computed(() => {
  const o = data.value;
  const rows = (list: PerformanceRow[] | undefined, name: (r: PerformanceRow) => string) =>
    (list ?? []).map((r) => ({
      key: r.key,
      name: name(r),
      values: [r.battles, r.kd, r.damage, r.score, r.winRate],
    }));
  return [
    {
      id: "vehicle",
      title: t("performance.vehicle"),
      nameLabel: t("performance.vehicleColumn"),
      rows: rows(o?.vehicles, (r) => r.name),
    },
    {
      id: "agent",
      title: t("performance.agent"),
      nameLabel: t("performance.agentColumn"),
      rows: rows(o?.agents, (r) => r.name || t("performance.agentName", { id: r.key })),
    },
    {
      id: "map",
      title: t("performance.map"),
      nameLabel: t("performance.mapColumn"),
      rows: rows(o?.maps, (r) => r.name),
    },
    {
      id: "mode",
      title: t("performance.mode"),
      nameLabel: t("performance.modeColumn"),
      rows: rows(o?.modes, (r) => modeName(r.key)),
    },
  ];
});
</script>

<template>
  <div class="overview">
    <motion.section
      class="hero"
      :initial="{ opacity: 0, y: 12 }"
      :animate="{ opacity: 1, y: 0 }"
      :transition="Dynamics.snappy"
    >
      <span class="hero-surface" />
      <eBrandMark class="hero-mark" />

      <div class="hero-copy">
        <span class="hero-label">{{ t("overview.winRate") }}</span>

        <span class="hero-value">
          <eCounter v-if="anchor" class="hero-roll" :value="anchor.rate" :format="(v) => percent(v, 1)" />
          <span v-else class="hero-roll">{{ t("overview.noReading") }}</span>
        </span>

        <span v-if="anchor" class="hero-note">
          <span class="won">{{ anchor.wins }}</span>
          <i class="sep" />
          <span class="lost">{{ anchor.losses }}</span>
          <i class="sep" />
          <span>{{ t("overview.onRecord", { count: anchor.battles }) }}</span>
        </span>
      </div>

      <eMatchStreak
        class="hero-streak"
        :outcomes="data?.streak ?? []"
        :longest="data?.longestWinStreak ?? null"
        :length="streakLength"
      />
    </motion.section>

    <eStatStrip :totals="data" />

    <motion.div
      class="band"
      :initial="{ opacity: 0, y: 10 }"
      :animate="{ opacity: 1, y: 0 }"
      :transition="{ ...Dynamics.snappy, delay: 0.12 }"
    >
      <eActivity :activity="data?.activity ?? null" />
    </motion.div>

    <!-- Reading one table means the other three dim -->
    <motion.div
      v-for="(pair, i) in [modules.slice(0, 2), modules.slice(2)]"
      :key="pair[0]?.id"
      class="modules"
      :initial="{ opacity: 0, y: 10 }"
      :animate="{ opacity: 1, y: 0 }"
      :transition="{ ...Dynamics.snappy, delay: 0.16 + i * 0.05 }"
    >
      <ePerformanceModule
        v-for="m in pair"
        :key="m.id"
        :title="m.title"
        :name-label="m.nameLabel"
        :columns="columns"
        :rows="m.rows"
        :formats="formats"
        :average="data?.winRate ?? null"
        :dimmed="!!table && table !== m.id"
        @pointerenter="table = m.id"
        @pointerleave="table = table === m.id ? '' : table"
      />
    </motion.div>
  </div>
</template>

<style scoped>
.overview {
  container-type: inline-size;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  width: 100%;
  padding: 0 var(--space-4);
  box-sizing: border-box;
}

.hero {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-4);
  padding: 112px var(--space-4) var(--space-4);
  box-sizing: border-box;
  overflow: hidden;
}

.hero-surface {
  position: absolute;
  inset: 0;
  box-sizing: border-box;
  background: var(--black-2-a);
  border: 1px solid var(--base-600);
  corner-shape: bevel;
  border-radius: 8px 0 8px 0;
  pointer-events: none;
}

.hero-mark {
  position: absolute;
  top: -18px;
  left: 50%;
  width: 400px;
  transform: translateX(-50%);
  pointer-events: none;
}

.hero-copy {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  text-align: center;
}

.hero-label {
  font-family: var(--font-primary);
  font-size: var(--main-font-size-4);
  font-weight: var(--font-weight-2);
  line-height: 1;
  letter-spacing: 0.22em;
  color: var(--text-muted);
  text-transform: uppercase;
}

.hero-value {
  display: block;
  height: 60px;
  overflow: hidden;
  font-family: var(--font-microcopy);
  font-size: 58px;
  line-height: 1;
  color: var(--text-main);
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.03em;
}

.hero-roll {
  display: block;
}

.hero-note {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-family: var(--font-microcopy);
  font-size: var(--secondary-font-size-4);
  line-height: 1;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}

.won {
  color: var(--accent-200);
}

.lost {
  color: var(--error-base);
}

.sep {
  width: 6px;
  height: 6px;
  background: var(--base-600);
  clip-path: polygon(0 100%, 50% 100%, 100% 50%, 50% 50%, 50% 0, 0 50%);
}

.hero-streak {
  position: relative;
  width: 100%;
}

.band {
  flex: none;
  width: 100%;
}

.modules {
  flex: none;
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  width: 100%;
}

@container (max-width: 680px) {
  .modules {
    flex-direction: column;
  }

  .hero-mark {
    width: 280px;
  }
}
</style>
