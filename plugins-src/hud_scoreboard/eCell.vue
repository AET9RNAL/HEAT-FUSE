<script setup lang="ts">
import { computed, reactive, ref, watch, onBeforeUnmount } from "vue";
import "fuse_ui/ui/tokens.css";
import eSquadCell from "./eSquadCell.vue";
import eHP from "./eHP.vue";
import Glitch from "canvas_ui/ui/Glitch.vue";
import FlameWrap from "canvas_ui/ui/FlameWrap.vue";

export interface Cell {
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
  /** Squad group ID within the team; 0 = solo (no squad). */
  squad: number;
  /** Top scorer on this cell's team. */
  leader: boolean;
}

const props = withDefaults(
  defineProps<{ cell: Cell; assetBase: string; side: "ally" | "enemy"; variant?: "tile" | "row" }>(),
  { variant: "tile" },
);

const assetRoot = computed(() => `${props.assetBase ?? ""}/assets`);
const CLASS_ROLES = new Set(["assault", "defender", "marksman"]);

function classIconUrl(role: string): string | undefined {
  return CLASS_ROLES.has(role) ? `${assetRoot.value}/icons/class/${role}.svg` : undefined;
}

const brokenImgs = reactive(new Set<string>());
function onImgError(url: string | undefined): void {
  if (url) brokenImgs.add(url);
}

// Cell art priority: tank photo -> agent portrait -> (template) class silhouette.
const imgUrl = computed<string | undefined>(() => {
  const c = props.cell;
  const t = c.tank ? `${assetRoot.value}/tanks/${c.tank}.png` : undefined;
  if (t && !brokenImgs.has(t)) return t;
  const a = c.agent ? `${assetRoot.value}/agents/${c.agent}.png` : undefined;
  if (a && !brokenImgs.has(a)) return a;
  return undefined;
});
const isAgent = computed(() => !!imgUrl.value && imgUrl.value.includes("/agents/"));
const fallbackUrl = computed(() => classIconUrl(props.cell.role));

// Mid-match vehicle swap: tear the portrait for a moment as the art changes.
// Glitch runs in continuous mode (interval 0) and is unmounted when it decays,
// so no WebGL context is held by idle cells.
const SWAP_MS = 500;
const swapFx = ref(0);
let swapRaf = 0;

const swapFxOpts = computed(() =>
  swapFx.value > 0
    ? { 
        interval: 0, 
        intensity: 1.4 * swapFx.value, 
        slices: 15, 
        shift: 18, 
        rgbShift: 2.5, 
        blocks: 0.7, 
        noise: 1.5 
      }
    : {},
);

function playSwapFx(): void {
  cancelAnimationFrame(swapRaf);
  const start = performance.now();
  const step = (now: number) => {
    const t = Math.min((now - start) / SWAP_MS, 1);
    swapFx.value = 1 - t * t;
    if (t < 1) swapRaf = requestAnimationFrame(step);
    else swapFx.value = 0;
  };
  swapRaf = requestAnimationFrame(step);
}

// Cells are keyed by index while rows are sorted by `place`, so a leaderboard
// re-order hands this component a different player. Only treat tank changes as a
// swap when the slot still holds the same player.
watch(
  () => ({ name: props.cell.name, tank: props.cell.tank }),
  (next, prev) => {
    if (!prev || prev.name !== next.name) return;
    if (prev.tank && next.tank && prev.tank !== next.tank) playSwapFx();
  },
);

// Team leader flame. FlameWrap is mounted only while the fade is non-zero, and a
// 0..1 level drives intensity so the crown eases in/out instead of popping —
// same in/out treatment MatchProgressOverhaul uses on the leading team's bar.
const FLAME_IN_MS = 220;
const FLAME_OUT_MS = 420;
const easeOutExpo = (t: number): number => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);

const flameLevel = ref(0);
let flameRaf = 0;

function fadeFlame(to: number): void {
  cancelAnimationFrame(flameRaf);
  const from = flameLevel.value;
  if (from === to) return;
  const up = to > from;
  const dur = up ? FLAME_IN_MS : FLAME_OUT_MS;
  const start = performance.now();
  const step = (now: number) => {
    const t = Math.min((now - start) / dur, 1);
    const e = up ? easeOutExpo(t) : easeOutCubic(t);
    flameLevel.value = from + (to - from) * e;
    if (t < 1) flameRaf = requestAnimationFrame(step);
    else flameLevel.value = to;
  };
  flameRaf = requestAnimationFrame(step);
}

watch(() => props.cell.leader, (on) => fadeFlame(on ? 1 : 0), { immediate: true });

const flameOn = computed(() => flameLevel.value > 0.001);
const flameIntensity = computed(() => 1.15 * flameLevel.value);

// FlameWrap's reach/spread/turbulence props are CSS pixels, so they must track
// the measured cell or the fire body outgrows the rect and reads as a blob.
const cellEl = ref<HTMLElement | null>(null);
const cellH = ref(0);
let cellRo: ResizeObserver | null = null;
watch(cellEl, (el) => {
  cellRo?.disconnect();
  cellRo = null;
  if (el) {
    cellRo = new ResizeObserver(([entry]) => {
      const box = entry.borderBoxSize?.[0];
      cellH.value = box ? box.blockSize : entry.contentRect.height;
    });
    cellRo.observe(el);
  }
});

const flameGeom = computed(() => {
  const h = cellH.value || 46;
  return {
    height: h * 1.55,
    spread: h * 0.1,
    turbulenceReach: h * 0.18,
  };
});
const ALLY_FLAME: [number, number, number] = [0.48, 0.74, 0.86]; // --woth-ally #7abfdf
const ENEMY_FLAME: [number, number, number] = [1.0, 0.43, 0.28]; // --woth-enemy #ff6d46
const flameColor = computed(() => (props.side === "enemy" ? ENEMY_FLAME : ALLY_FLAME));

onBeforeUnmount(() => {
  cancelAnimationFrame(swapRaf);
  cancelAnimationFrame(flameRaf);
  cellRo?.disconnect();
});
</script>

<template>
  <div
    ref="cellEl"
    class="ecell"
    :class="[side, variant, { dead: cell.dead, self: cell.isSelf, glitching: swapFx > 0 }]"
  >
    <div class="ecell-fxbox">
      <!-- FlameWrap burns its own root box, and its root carries an inline
           position:relative — so the cell-sized box has to be this wrapper. -->
      <div v-if="flameOn" class="ecell-flamebox">
        <FlameWrap
          class="ecell-flame"
          :color="flameColor"
          :intensity="flameIntensity"
          v-bind="flameGeom"
          :radius="5"
          :speed="0.7"
          :scale="0.8"
          :turbulence="0.7"
          :turbulence-scale="3"
          :sparks="3"
          :spark-size="0.35"
          :spark-density="1"
          :spark-speed="0.5"
          :rim="1.2"
          :smoke="2"
          :scorch="2"
        >
          <!-- Empty slot: the cell paints itself below, so the shader composites
               fire only (content.a = 0) and the flames overlap the cell edges. -->
        </FlameWrap>
      </div>
      <component :is="swapFx > 0 ? Glitch : 'div'" class="ecell-fx" v-bind="swapFxOpts">
        <!-- Glitch wraps its slot in its own div, so the cell layout lives one level deeper. -->
        <div class="ecell-body">
          <div class="ecell-media">
            <img
              v-if="imgUrl"
              class="ecell-img"
              :class="{ 'ecell-img--agent': isAgent }"
              :src="imgUrl"
              :alt="cell.role"
              @error="onImgError(imgUrl)"
            />
            <img v-else-if="fallbackUrl" class="ecell-img ecell-img--fallback" :src="fallbackUrl" :alt="cell.role" />
          </div>
          <span v-if="variant === 'row'" class="ecell-name">{{ cell.name }}</span>
          <div class="ecell-veil" />
          <div v-if="cell.squad > 0" class="ecell-squad"><eSquadCell :squad="cell.squad" /></div>
          <span v-if="cell.hasBomb" class="ecell-bomb" />
          <div v-if="cell.health != null" class="ecell-hp">
            <eHP :health="cell.health" :side="side" :dead="cell.dead" />
          </div>
        </div>
      </component>
    </div>
  </div>
</template>

<style scoped>
.ecell {
  position: relative;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  container-type: size;
  --self: var(--canary-yellow);
  --cut: polygon(5px 0%, 100% 0%, 100% calc(100% - 5px), calc(100% - 5px) 100%, 0% 100%, 0% 5px);
  --bw: 1.5px;
  --accent: color-mix(in srgb, var(--woth-ally) 60%, transparent);
  /* Headroom around the cell for glitch tears to spill into. The cell skin
     (cut, border, clip) lives on .ecell-body so this box never masks them. */
  --fx-pad: 30px;
}
.ecell.glitching {
  z-index: 5;
}
.ecell.enemy {
  --accent: color-mix(in srgb, var(--woth-enemy) 60%, transparent);
}
.ecell.self {
  --accent: var(--self);
  --bw: 2px;
}
.ecell-body::before {
  content: "";
  position: absolute;
  inset: var(--bw);
  clip-path: var(--cut);
  background: var(--black-1-a);
  z-index: 0;
}

/* Portrait */
.ecell-media {
  position: relative;
  z-index: 1;
  overflow: hidden;
}
.ecell.tile .ecell-media {
  position: absolute;
  top: var(--bw);
  left: var(--bw);
  width: calc(100% - 2 * var(--bw));
  height: calc(100% - 2 * var(--bw));
  clip-path: var(--cut);
}
.ecell-fxbox {
  position: absolute;
  inset: calc(-1 * var(--fx-pad));
}
.ecell-fx {
  position: relative;
  z-index: 1;
  width: 100%;
  height: 100%;
}
/* FlameWrap burns its own root box (and extends its canvas past it on its own),
   so the root must be the cell rect — not the padded fx box. */
/* Cell-sized box: FlameWrap derives its burning rect from its root's bounding
   box, so this must match .ecell-body exactly. FlameWrap's own root sets
   position inline, hence the wrapper. */
.ecell-flamebox {
  position: absolute;
  inset: var(--fx-pad);
  z-index: 2;
  pointer-events: none;
}
.ecell-flame {
  width: 100%;
  height: 100%;
}
.ecell-body {
  position: absolute;
  inset: var(--fx-pad);
  box-sizing: border-box;
  background: var(--accent);
  clip-path: var(--cut);
  overflow: hidden;
}
.ecell-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center;
}
.ecell-img--agent {
  object-position: center top;
}
.ecell-img--fallback {
  object-fit: contain;
  padding: 12%;
  box-sizing: border-box;
  opacity: 0.5;
}

/* Row variant: [portrait][name] */
.ecell.row .ecell-body {
  display: flex;
  align-items: center;
  gap: clamp(4px, 4cqw, 9px);
  padding: var(--bw);
  padding-right: clamp(4px, 6cqw, 10px);
}
.ecell.row .ecell-media {
  flex: none;
  height: 100%;
  aspect-ratio: 4 / 3;
  clip-path: var(--cut);
}
.ecell-name {
  position: relative;
  z-index: 1;
  flex: 1 1 0;
  min-width: 0;
  font-family: var(--font-microcopy);
  font-size: clamp(8px, 42cqh, 15px);
  color: var(--text-main);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Overlays */
.ecell-veil {
  position: absolute;
  inset: var(--bw);
  clip-path: var(--cut);
  background: hsla(142, 1%, 20%, 0.62);
  opacity: 0;
  transition: opacity 0.15s;
  pointer-events: none;
  z-index: 2;
}
.ecell.dead .ecell-veil {
  opacity: 1;
}
.ecell.dead .ecell-img {
  filter: grayscale(1) brightness(0.7);
}
.ecell.dead .ecell-name {
  color: var(--text-muted);
}

.ecell-hp {
  position: absolute;
  left: var(--bw);
  right: var(--bw);
  bottom: var(--bw);
  height: clamp(2px, 4cqh, 4px);
  z-index: 3;
}

.ecell-squad {
  position: absolute;
  top: var(--bw);
  right: var(--bw);
  z-index: 4;
  width: clamp(15px, 24cqh, 20px);
  height: clamp(15px, 24cqh, 20px);
}

.ecell-bomb {
  position: absolute;
  top: clamp(2px, 4cqh, 5px);
  right: clamp(2px, 4cqh, 5px);
  width: clamp(6px, 10cqh, 11px);
  height: clamp(6px, 10cqh, 11px);
  border-radius: 50%;
  background: var(--warning-color);
  box-shadow: 0 0 4px var(--warning-color);
  z-index: 4;
}
</style>
