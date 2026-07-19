<script setup lang="ts">
import { computed } from "vue";
import "fuse_ui/ui/tokens.css";

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
  --win: var(--success-color);
  --loss: var(--error-base);
  --kill: var(--tea-green);
  --ch4: polygon(4px 0%, 100% 0%, 100% calc(100% - 4px), calc(100% - 4px) 100%, 0% 100%, 0% 4px);
  --ch6: polygon(6px 0%, 100% 0%, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0% 100%, 0% 6px);
  --ch8: polygon(8px 0%, 100% 0%, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0% 100%, 0% 8px);

  width: 100%;
  height: 100%;
  display: flex;
  font-family: var(--font-primary);
  color: var(--text-main);
  transition: opacity 0.2s;
  container-type: size;
}

/* .heat-stats-overlay.dim {
  opacity: 0.4;
} */

.hs-card {
  flex: 1;
  min-width: 0;
  min-height: 0;
  box-sizing: border-box;
  background: var(--black-1);
  clip-path: var(--ch8);
  padding: clamp(6px, 5cqh, 14px) clamp(8px, 5cqw, 18px);
  display: flex;
  flex-direction: column;
  gap: clamp(4px, 4cqh, 10px);
  overflow: hidden;
}

.hs-header {
  flex: none;
  font-family: var(--font-primary);
  font-size: clamp(11px, 13cqh, 22px);
  font-weight: var(--font-weight-2);
  color: var(--text-main);
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.hs-stats {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: clamp(3px, 2cqw, 8px);
}

.hs-stat {
  min-width: 0;
  background: var(--black-2);
  clip-path: var(--ch8);
  padding: clamp(3px, 3cqh, 10px) clamp(4px, 2cqw, 10px);
  display: flex;
  flex-direction: column;
  justify-content: center;
  text-align: center;
  overflow: hidden;
}

.hs-stat-label {
  font-family: var(--font-microcopy);
  font-size: clamp(6px, 5cqh, 10px);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.hs-stat-value {
  font-family: var(--font-primary);
  font-size: clamp(11px, 12cqh, 22px);
  font-weight: var(--font-weight-2);
  line-height: 1.1;
  white-space: nowrap;
}

.hs-stat-value.accent-win {
  color: var(--win);
}

.hs-stat-value.accent-kd {
  color: var(--kill);
}

.hs-stat-sub {
  font-family: var(--font-microcopy);
  font-size: clamp(6px, 5cqh, 10px);
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.hs-refresh {
  flex: none;
  font-family: var(--font-microcopy);
  font-size: clamp(7px, 6cqh, 11px);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-main);
  background: var(--black-2);
  border: 1px solid var(--light-green);
  clip-path: var(--ch6);
  padding: clamp(3px, 3cqh, 8px) clamp(6px, 3cqw, 12px);
  cursor: pointer;
  transition: background 0.12s;
}

.hs-refresh:hover {
  background: var(--black-3);
}

.hs-recent {
  flex: none;
  display: flex;
  align-items: center;
  gap: clamp(4px, 3cqw, 10px);
  min-width: 0;
}

.hs-recent-label {
  font-family: var(--font-microcopy);
  font-size: clamp(6px, 5cqh, 10px);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
  white-space: nowrap;
}

.hs-streak-bar {
  display: flex;
  gap: clamp(2px, 1cqw, 5px);
  min-width: 0;
}

.hs-streak-dot {
  height: clamp(7px, 9cqh, 16px);
  aspect-ratio: 1;
  clip-path: var(--ch4);
  background: var(--black-3);
  padding: 1px;
  box-sizing: border-box;
  flex: 0 1 auto;
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
