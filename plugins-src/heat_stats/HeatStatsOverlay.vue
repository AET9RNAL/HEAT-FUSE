<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { motion, AnimatePresence } from "motion-v";
import "fuse_ui/ui/tokens.css";
import eMaterialButton from "fuse_ui/ui/eMaterialButton.vue";
import eSessions from "./eSessions.vue";
import eTrend from "./eTrend.vue";
import eEfficiency from "./eEfficiency.vue";

const SCENE_COUNT = 2;

interface SessionRow {
  vehicle: string;
  map: string;
  mode: string;
  score: number;
  damage: number;
  kills: number;
  deaths: number;
  assists: number;
  outcome: string;
}
interface Series {
  kd: number[];
  wr: number[];
  dmg: number[];
}
interface Efficiency {
  dmgPerKill: number;
  killsPerMin: number;
  scorePerMin: number;
}
interface ModeRow {
  mode: string;
  winRate: number;
  count: number;
}
export interface HeatStatsData {
  playerName: string;
  battleCount: number;
  sessionStartedAt: number;
  kd: number;
  winRate: number;
  damage: number;
  series: Series;
  latest: SessionRow[];
  mode: string;
  sceneTime: number;
  graphScale: string;
  graphPoints: number;
  graphValueScale: number;
  efficiency: Efficiency;
  byMode: ModeRow[];
}

const props = defineProps<{
  data: Partial<HeatStatsData>;
  assetBase?: string;
  interactive?: boolean;
  emitAction?: (action: string, payload?: unknown) => void;
}>();

const playerName = computed(() => props.data?.playerName || "-");
const battleCount = computed(() => props.data?.battleCount ?? 0);
const latest = computed<SessionRow[]>(() => props.data?.latest ?? []);
const series = computed(() => props.data?.series);
const efficiency = computed(() => props.data?.efficiency);
const byMode = computed(() => props.data?.byMode ?? []);

/** Scene glyph, masked so the active one can fill as a progress indicator. */
const indexerUrl = computed(() => `url(${props.assetBase ?? ""}/assets/indexer.svg)`);

// Carousel 
const isCarousel = computed(() => props.data?.mode === "carousel");
const sceneTime = computed(() => Math.max(2, props.data?.sceneTime ?? 8));
const scene = ref(0);
let sceneTimer: ReturnType<typeof setInterval> | undefined;

function restartCarousel(): void {
  clearInterval(sceneTimer);
  sceneTimer = undefined;
  if (!isCarousel.value) {
    scene.value = 0;
    return;
  }
  sceneTimer = setInterval(() => {
    scene.value = (scene.value + 1) % SCENE_COUNT;
  }, sceneTime.value * 1000);
}
watch([isCarousel, sceneTime], restartCarousel, { immediate: true });

onBeforeUnmount(() => {
  clearInterval(sceneTimer);
  sceneTimer = undefined;
});
</script>

<template>
  <div class="hs">
    <div class="hs-head">
      <div class="hs-name">{{ playerName }}</div>
      <div v-if="isCarousel" class="hs-scenes" :style="{ '--indexer-url': indexerUrl }">
        <span
          v-for="i in SCENE_COUNT"
          :key="i"
          class="hs-indexer"
          :class="{ active: scene === i - 1 }"
        >
          <span
            v-if="scene === i - 1"
            :key="scene"
            class="hs-indexer-fill"
            :style="{ animationDuration: `${sceneTime}s` }"
          />
        </span>
      </div>
      <div class="hs-count">{{ battleCount }} battles</div>
      <template v-if="interactive">
        <eMaterialButton variant="tertiary" label="Refresh" @click="emitAction?.('refresh')" />
        <eMaterialButton
          label="New Session"
          color="var(--light-green)"
          @click="emitAction?.('newSession')"
        />
      </template>
    </div>

    <!-- Only this container swaps between scenes. -->
    <div class="hs-body">
      <AnimatePresence mode="wait">
        <motion.div
          :key="scene"
          class="hs-scene"
          :initial="{ opacity: 0, x: 14 }"
          :animate="{ opacity: 1, x: 0 }"
          :exit="{ opacity: 0, x: -14 }"
          :transition="{ duration: 0.3, ease: 'easeOut' }"
        >
          <eTrend class="e-trend"
            v-if="scene === 0"
            :series="series"
            :kd="data.kd"
            :win-rate="data.winRate"
            :damage="data.damage"
            :scale-mode="data.graphScale"
            :points="data.graphPoints"
            :value-scale="data.graphValueScale"
          />
          <eEfficiency v-else :efficiency="efficiency" :by-mode="byMode" :asset-base="assetBase" />
        </motion.div>
      </AnimatePresence>
    </div>

    <div class="hs-sessions">
      <eSessions class="e-sessions" v-for="(s, i) in latest" :key="i" :session="s" />
    </div>
  </div>
</template>

<style scoped>
.hs {
  --ch8: polygon(8px 0%, 100% 0%, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0% 100%, 0% 8px);

  width: 100%;
  height: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  clip-path: var(--ch8);
  padding: var(--space-3);
  font-family: var(--font-primary);
  color: var(--text-main);
  overflow: hidden;
}

.hs-head {
  flex: none;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-2);
}
.hs-name {
  flex: 1 1 auto;
  min-width: 0;
  font-size: var(--main-font-size-3);
  font-weight: var(--font-weight-2);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.hs-scenes {
  flex: none;
  display: flex;
  align-items: center;
  gap: 3px;
}
.hs-indexer {
  position: relative;
  flex: none;
  width: 9px;
  height: 9px;
  overflow: hidden;
  background: var(--base-600);
  -webkit-mask-image: var(--indexer-url);
  mask-image: var(--indexer-url);
  -webkit-mask-size: contain;
  mask-size: contain;
  -webkit-mask-repeat: no-repeat;
  mask-repeat: no-repeat;
  -webkit-mask-position: center;
  mask-position: center;
}
.hs-indexer.active {
  background: color-mix(in srgb, var(--light-green) 25%, transparent);
}
.hs-indexer-fill {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  width: 0;
  background: var(--light-green);
  animation-name: hs-indexer-fill;
  animation-timing-function: linear;
  animation-fill-mode: forwards;
}
@keyframes hs-indexer-fill {
  from {
    width: 0;
  }
  to {
    width: 100%;
  }
}

.hs-count {
  flex: none;
  font-family: var(--font-microcopy);
  font-size: var(--main-font-size-5);
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.hs-head :deep(.material-button) {
  flex: none;
  font-size: var(--main-font-size-5);
}

/* Scenes */
.hs-body {
  position: relative;
  flex: 1 1 0;
  min-height: 0;
}
.hs-scene {
  width: 100%;
  height: 100%;
}

/* Session list (persistent)  */
.hs-sessions {
  flex: none;
  margin-top: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.e-trend {
  user-select: none;
  -webkit-user-select: none;
}

.e-sessions {
  user-select: none;
  -webkit-user-select: none;
}
</style>
