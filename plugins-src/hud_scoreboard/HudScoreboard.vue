<script setup lang="ts">
import { computed, ref, watch, onBeforeUnmount } from "vue";
import "fuse_ui/ui/tokens.css";
import eCell from "./eCell.vue";

const FRAME_CUT = 8;

interface Cell {
  tank: string | null;
  agent: string | null;
  role: string;
  dead: boolean;
  respawning: boolean;
  health: number | null;
  name: string;
  isPlayer: boolean;
  hasBomb: boolean;
  isSelf: boolean;
}
interface ClassGroup {
  role: string;
  cells: Cell[];
}
interface Board {
  inMatch: boolean;
  showNames?: boolean;
  layout?: "scoreboard" | "columns";
  allies: ClassGroup[];
  enemies: ClassGroup[];
}

// `assetBase` is injected by the overlay host (VueOverlay) - absolute URL of this
// plugin's served root, e.g. "http://127.0.0.1:PORT/overlay-asset/hud_scoreboard".
const props = defineProps<{ data: Partial<{ board: Board }>; assetBase?: string }>();

const assetRoot = computed(() => `${props.assetBase ?? ""}/assets`);
const board = computed<Board>(() => props.data?.board ?? { inMatch: false, allies: [], enemies: [] });
const inMatch = computed(() => !!board.value.inMatch);
const showNames = computed(() => !!board.value.showNames);
const isColumns = computed(() => board.value.layout === "columns");

const CLASS_EXT: Record<string, string> = { assault: "svg", defender: "svg", marksman: "png" };
function classIconUrl(role: string): string | undefined {
  const ext = CLASS_EXT[role];
  return ext ? `${assetRoot.value}/icons/class/${role}.${ext}` : undefined;
}

const frameEl = ref<HTMLElement | null>(null);
const frameW = ref(0);
const frameH = ref(0);
let frameRo: ResizeObserver | null = null;
watch(frameEl, (el) => {
  frameRo?.disconnect();
  frameRo = null;
  if (el) {
    frameRo = new ResizeObserver(([entry]) => {
      const box = entry.borderBoxSize?.[0];
      frameW.value = box ? box.inlineSize : entry.contentRect.width;
      frameH.value = box ? box.blockSize : entry.contentRect.height;
    });
    frameRo.observe(el);
  }
});
onBeforeUnmount(() => frameRo?.disconnect());

const framePoints = computed(() => {
  const w = frameW.value;
  const h = frameH.value;
  if (!w || !h) return "";
  const cx = (FRAME_CUT / w) * 100;
  const cy = (FRAME_CUT / h) * 100;
  return `${cx},0 100,0 100,${100 - cy} ${100 - cx},100 0,100 0,${cy}`;
});
</script>

<template>
  <div v-if="inMatch" ref="frameEl" class="hsb" :class="isColumns ? 'hsb--columns' : 'hsb--strip'">
    <template v-if="!isColumns">
      <div class="hsb-side hsb-ally">
        <div v-for="(g, gi) in board.allies" :key="'a' + gi" class="hsb-group" :style="{ flexGrow: g.cells.length }">
          <img v-if="classIconUrl(g.role)" class="hsb-class" :src="classIconUrl(g.role)" :alt="g.role" />
          <div v-for="(c, ci) in g.cells" :key="'a' + gi + '-' + ci" class="hsb-slot">
            <eCell :cell="c" :asset-base="assetBase ?? ''" side="ally" />
            <div v-if="showNames" class="hsb-name">{{ c.name }}</div>
          </div>
        </div>
      </div>

      <div class="hsb-centre" />

      <div class="hsb-side hsb-enemy">
        <div v-for="(g, gi) in board.enemies" :key="'e' + gi" class="hsb-group hsb-group--mirror" :style="{ flexGrow: g.cells.length }">
          <div v-for="(c, ci) in g.cells" :key="'e' + gi + '-' + ci" class="hsb-slot">
            <eCell :cell="c" :asset-base="assetBase ?? ''" side="enemy" />
            <div v-if="showNames" class="hsb-name">{{ c.name }}</div>
          </div>
          <img v-if="classIconUrl(g.role)" class="hsb-class" :src="classIconUrl(g.role)" :alt="g.role" />
        </div>
      </div>
    </template>

    <template v-else>
      <div class="col-title">
        <div class="col-bar col-bar--ally">Allies</div>
        <div class="col-bar col-bar--enemy">Enemies</div>
      </div>
      <div class="col-container">
        <div class="col">
          <template v-for="(g, gi) in board.allies" :key="'a' + gi">
            <div v-for="(c, ci) in g.cells" :key="'a' + gi + '-' + ci" class="col-row">
              <eCell :cell="c" :asset-base="assetBase ?? ''" side="ally" variant="row" />
            </div>
          </template>
        </div>
        <div class="col">
          <template v-for="(g, gi) in board.enemies" :key="'e' + gi">
            <div v-for="(c, ci) in g.cells" :key="'e' + gi + '-' + ci" class="col-row">
              <eCell :cell="c" :asset-base="assetBase ?? ''" side="enemy" variant="row" />
            </div>
          </template>
        </div>
      </div>
      <svg
        v-if="framePoints"
        class="hsb-frame-stroke"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <polygon :points="framePoints" fill="none" stroke-width="0.5" vector-effect="non-scaling-stroke" />
      </svg>
    </template>
  </div>
</template>

<style scoped>
.hsb {
  width: 100%;
  height: 100%;
  display: flex;
  font-family: var(--font-primary);
  color: var(--text-main);
  container-type: size;
  user-select: none;
}

/* Strip layout */
.hsb--strip {
  align-items: stretch;
  gap: clamp(4px, 1cqw, 12px);
}
.hsb-side {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: clamp(2px, 0.5cqw, 7px);
}
.hsb-ally {
  justify-content: flex-start;
}
.hsb-enemy {
  justify-content: flex-end;
}
.hsb-centre {
  flex: 0 0 clamp(24px, 6cqw, 96px);
}

.hsb-group {
  display: flex;
  align-items: center;
  gap: clamp(2px, 0.5cqw, 6px);
  flex: 1 1 0;
  flex-basis: 0;
  min-width: 0;
}
.hsb-group--mirror {
  flex-direction: row;
}

.hsb-class {
  height: clamp(20px, 48cqh, 54px);
  width: auto;
  opacity: 0.85;
  margin: 0 clamp(2px, 0.7cqw, 7px);
  flex: none;
}

.hsb-slot {
  position: relative;
  height: 100cqh;
  flex: 1 1 0;
  min-width: clamp(14px, 2.5cqw, 34px);
  max-width: calc(100cqh * 2.1);
}

.hsb-name {
  position: absolute;
  left: 0;
  right: 0;
  bottom: clamp(3px, 6cqh, 6px);
  z-index: 5;
  text-align: center;
  font-family: var(--font-microcopy);
  font-size: clamp(6px, 9cqh, 11px);
  color: var(--text-main);
  text-shadow: 0 1px 2px var(--black-1);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding: 0 3px;
  pointer-events: none;
}

.hsb--columns {
  position: relative;
  flex-direction: column;
  gap: clamp(5px, 2cqh, 12px);
  padding: clamp(8px, 2.5cqmin, 15px);
  box-sizing: border-box;
  background: var(--black-1-a);
  clip-path: polygon(8px 0%, 100% 0%, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0% 100%, 0% 8px);
}
.hsb-frame-stroke {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  overflow: visible;
  z-index: 2;
}
.hsb-frame-stroke polygon {
  stroke: color-mix(in srgb, var(--light-green) 55%, transparent);
}

.col-title {
  position: relative;
  z-index: 1;
  flex: none;
  display: flex;
  gap: var(--space-0);
  padding: var(--space-0);
  background: var(--base-600);
  clip-path: polygon(5px 0%, 100% 0%, 100% calc(100% - 5px), calc(100% - 5px) 100%, 0% 100%, 0% 5px);
}
.col-title::before {
  content: "";
  position: absolute;
  inset: 1px;
  clip-path: polygon(5px 0%, 100% 0%, 100% calc(100% - 5px), calc(100% - 5px) 100%, 0% 100%, 0% 5px);
  background: var(--black-1-a);
  z-index: 0;
}
.col-bar {
  position: relative;
  z-index: 1;
  flex: 1 1 0;
  min-width: 0;
  height: clamp(13px, 7cqh, 20px);
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-microcopy);
  font-weight: var(--font-weight-1);
  font-size: clamp(7px, 4.2cqh, 11px);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--black-1);
  clip-path: polygon(4px 0%, 100% 0%, 100% calc(100% - 4px), calc(100% - 4px) 100%, 0% 100%, 0% 4px);
}
.col-bar--ally {
  background: var(--woth-ally);
}
.col-bar--enemy {
  background: var(--woth-enemy);
}

.col-container {
  position: relative;
  z-index: 1;
  flex: 1 1 0;
  min-height: 0;
  display: flex;
  justify-content: center;
  gap: clamp(10px, 6cqw, 64px);
  overflow: hidden;
}
.col {
  flex: 1 1 0;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: clamp(4px, 2cqh, 12px);
}

.col-row {
  flex: 0 1 auto;
  height: clamp(20px, 10.5cqh, 46px);
  min-height: 0;
}
</style>
