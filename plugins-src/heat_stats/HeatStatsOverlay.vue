<script setup lang="ts">
import { computed } from "vue";

export interface HeatStatsData {
  playerName: string;
  winRate: number;
  kd: number;
  totalKills: number;
  battleCount: number;
  recentBattles: string[];
  setupComplete: boolean;
}

const props = defineProps<{
  data: Partial<HeatStatsData>;
  // Injected by the overlay stage (VueOverlay). Present in the interactive host
  // state so the overlay can expose clickable controls.
  interactive?: boolean;
  emitAction?: (action: string, payload?: unknown) => void;
}>();

const displayName = computed(() => props.data?.playerName || "-");
const winRateStr = computed(() => `${(props.data?.winRate ?? 0).toFixed(1)}%`);
const kdStr = computed(() => (props.data?.kd ?? 0).toFixed(2));
const killsStr = computed(() => (props.data?.totalKills ?? 0).toLocaleString());
const battleCountStr = computed(() => `${props.data?.battleCount ?? 0} battles`);

const battles = computed(() => {
  const arr = (props.data?.recentBattles ?? []).slice(0, 5);
  while (arr.length < 5) arr.push("");
  return arr;
});
</script>

<template>
  <div class="heat-stats-overlay" :class="{ dim: !data.setupComplete }">
    <div class="hs-card">
      <div class="hs-header">{{ displayName }}</div>
      <div class="hs-stats">
        <div class="hs-stat">
          <div class="hs-stat-label">Win Rate</div>
          <div class="hs-stat-value accent-win">{{ winRateStr }}</div>
          <div class="hs-stat-sub">{{ battleCountStr }}</div>
        </div>
        <div class="hs-stat">
          <div class="hs-stat-label">K/D</div>
          <div class="hs-stat-value accent-kd">{{ kdStr }}</div>
        </div>
        <div class="hs-stat">
          <div class="hs-stat-label">Total Kills</div>
          <div class="hs-stat-value accent-kd">{{ killsStr }}</div>
        </div>
      </div>
      <button
        v-if="interactive"
        class="hs-refresh"
        @click="emitAction?.('refresh')"
      >
        Refresh stats
      </button>
      <div class="hs-recent">
        <div class="hs-recent-label">Recent</div>
        <div class="hs-streak-bar">
          <div
            v-for="(b, i) in battles"
            :key="i"
            class="hs-streak-dot"
            :class="{ empty: !b }"
          >
            <span :class="b" v-if="b"></span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.heat-stats-overlay {
  --tea-green: hsl(142, 100%, 89%);
  --light-green: hsl(142, 100%, 78%);
  --black-1-a: hsla(142, 10%, 4%, 0.6);
  --black-2-a: hsla(142, 10%, 10%, 0.6);
  --base-50: rgba(242, 242, 242, 1);
  --base-200: rgba(179, 179, 179, 1);
  --success-color: rgba(113, 206, 113, 1);
  --error-base: rgba(200, 69, 84, 1);
  --warning-color: rgba(255, 219, 140, 1);
  --win: var(--success-color);
  --loss: var(--error-base);
  --kill: var(--tea-green);
  --font-primary: system-ui, sans-serif;
  --font-microcopy: 'Courier New', monospace;
  --ch4: polygon(4px 0%, 100% 0%, 100% calc(100% - 4px), calc(100% - 4px) 100%, 0% 100%, 0% 4px);
  --ch6: polygon(6px 0%, 100% 0%, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0% 100%, 0% 6px);
  --ch8: polygon(8px 0%, 100% 0%, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0% 100%, 0% 8px);

  width: 100%;
  height: 100%;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  font-family: var(--font-primary);
  color: var(--base-50);
  transition: opacity 0.2s;
}

.heat-stats-overlay.dim {
  opacity: 0.4;
}

.hs-card {
  background: hsla(142, 10%, 4%, 0.92);
  clip-path: var(--ch8);
  padding: 12px 16px;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.hs-header {
  font-family: var(--font-primary);
  font-size: 20px;
  font-weight: 500;
  color: var(--base-50);
  line-height: 1.2;
}

.hs-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
}

.hs-stat {
  background: var(--black-1-a);
  clip-path: var(--ch8);
  padding: 8px 10px;
  text-align: center;
}

.hs-stat-label {
  font-family: var(--font-microcopy);
  font-size: 8px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--base-200);
  margin-bottom: 2px;
}

.hs-stat-value {
  font-family: var(--font-primary);
  font-size: 20px;
  font-weight: 500;
  line-height: 1;
}

.hs-stat-value.accent-win {
  color: var(--win);
}

.hs-stat-value.accent-kd {
  color: var(--kill);
}

.hs-stat-sub {
  font-family: var(--font-microcopy);
  font-size: 8px;
  color: var(--base-200);
  margin-top: 2px;
}

.hs-refresh {
  font-family: var(--font-microcopy);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--base-50);
  background: var(--black-2-a);
  border: 1px solid var(--light-green);
  clip-path: var(--ch6);
  padding: 6px 10px;
  cursor: pointer;
  transition: background 0.12s;
}

.hs-refresh:hover {
  background: hsla(142, 100%, 78%, 0.18);
}

.hs-recent {
  display: flex;
  align-items: center;
  gap: 8px;
}

.hs-recent-label {
  font-family: var(--font-microcopy);
  font-size: 8px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--base-200);
}

.hs-streak-bar {
  display: flex;
  gap: 4px;
}

.hs-streak-dot {
  width: 14px;
  height: 14px;
  clip-path: var(--ch4);
  background: rgba(255, 255, 255, 0.10);
  padding: 1px;
  flex-shrink: 0;
}

.hs-streak-dot.empty {
  opacity: 0.3;
}

.hs-streak-dot > span {
  display: block;
  width: 100%;
  height: 100%;
  clip-path: polygon(3px 0%, 100% 0%, 100% calc(100% - 3px), calc(100% - 3px) 100%, 0% 100%, 0% 3px);
}

.hs-streak-dot > span.win {
  background: var(--win);
}

.hs-streak-dot > span.loss {
  background: var(--loss);
}

.hs-streak-dot > span.draw {
  background: var(--base-200);
}

.hs-streak-dot > span.abandoned {
  background: var(--warning-color);
}
</style>
