<script setup lang="ts">
import { computed, reactive } from "vue";
import "fuse_ui/ui/tokens.css";

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
}

const props = withDefaults(
  defineProps<{ cell: Cell; assetBase: string; side: "ally" | "enemy"; variant?: "tile" | "row" }>(),
  { variant: "tile" },
);

const assetRoot = computed(() => `${props.assetBase ?? ""}/assets`);
const CLASS_EXT: Record<string, string> = { assault: "svg", defender: "svg", marksman: "png" };

function classIconUrl(role: string): string | undefined {
  const ext = CLASS_EXT[role];
  return ext ? `${assetRoot.value}/icons/class/${role}.${ext}` : undefined;
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
</script>

<template>
  <div class="ecell" :class="[side, variant, { dead: cell.dead, self: cell.isSelf }]">
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
    <span v-if="cell.hasBomb" class="ecell-bomb" />
    <div class="ecell-hp"><span :style="{ width: (cell.health ?? 0) + '%' }" /></div>
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
  background: var(--accent);
  clip-path: var(--cut);
  overflow: hidden;
}
.ecell.enemy {
  --accent: color-mix(in srgb, var(--woth-enemy) 60%, transparent);
}
.ecell.self {
  --accent: var(--self);
  --bw: 2px;
}
.ecell::before {
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
.ecell.row {
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
  background: var(--black-3-a);
}
.ecell-hp > span {
  display: block;
  height: 100%;
  background: var(--woth-ally);
  transition: width 0.2s;
}
.ecell.enemy .ecell-hp > span {
  background: var(--woth-enemy);
}
.ecell.dead .ecell-hp > span {
  width: 0 !important;
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
