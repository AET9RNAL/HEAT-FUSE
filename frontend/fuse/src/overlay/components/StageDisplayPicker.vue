<script setup lang="ts">
import { computed, ref } from "vue";
import { AnimatePresence, motion } from "motion-v";
import Icons from "../../components/ui/Icons.vue";
import { Dynamics } from "../../composables/useMotion";
import { vTip } from "../inspector/tooltip";
import { selectStageDisplays } from "../overlayClient";
import { hiddenOverlays } from "../hiddenOverlays";
import { displays, type DisplayArea } from "../screens";

const MAP_W = 240;
const MAP_H = 120;

type TileState = "picked" | "covered" | "partial" | "off";

interface Tile {
  d: DisplayArea;
  state: TileState;
  style: Record<string, string>;
  hidden: number;
  locked: boolean;
}

const open = ref(false);

const picked = computed(() => displays.value.filter((d) => d.selected));

const hiddenByDisplay = computed(() => {
  const m = new Map<string, number>();
  for (const h of hiddenOverlays.value) {
    if (h.display) m.set(h.display.id, (m.get(h.display.id) ?? 0) + 1);
  }
  return m;
});

const map = computed(() => {
  const list = displays.value;
  if (!list.length) return null;
  const minX = Math.min(...list.map((d) => d.x));
  const minY = Math.min(...list.map((d) => d.y));
  const maxX = Math.max(...list.map((d) => d.x + d.w));
  const maxY = Math.max(...list.map((d) => d.y + d.h));
  const scale = Math.min(MAP_W / (maxX - minX), MAP_H / (maxY - minY));
  const place = (x: number, y: number, w: number, h: number): Record<string, string> => ({
    left: `${Math.round((x - minX) * scale)}px`,
    top: `${Math.round((y - minY) * scale)}px`,
    width: `${Math.round(w * scale)}px`,
    height: `${Math.round(h * scale)}px`,
  });
  // The stage window is the page itself.
  const pageW = window.innerWidth;
  const pageH = window.innerHeight;
  const tiles: Tile[] = list.map((d) => {
    const touches = d.x < pageW && d.x + d.w > 0 && d.y < pageH && d.y + d.h > 0;
    const state: TileState = d.selected ? "picked" : d.inStage ? "covered" : touches ? "partial" : "off";
    return {
      d,
      state,
      style: place(d.x, d.y, d.w, d.h),
      hidden: hiddenByDisplay.value.get(d.id) ?? 0,
      locked: d.selected && picked.value.length === 1,
    };
  });
  return {
    size: { width: `${Math.round((maxX - minX) * scale)}px`, height: `${Math.round((maxY - minY) * scale)}px` },
    frame: place(0, 0, pageW, pageH),
    tiles,
  };
});

function joinNumbers(n: number[]): string {
  return n.length > 1 ? `${n.slice(0, -1).join(", ")} and ${n[n.length - 1]}` : String(n[0]);
}

const notes = computed(() => {
  const out: string[] = [];
  const extra = (map.value?.tiles ?? []).filter((t) => t.state === "covered" || t.state === "partial").map((t) => t.d.index);
  if (extra.length) {
    out.push(`The stage is one rectangle, so it also covers ${extra.length > 1 ? "displays" : "display"} ${joinNumbers(extra)}.`);
  }
  const n = hiddenOverlays.value.length;
  if (n) out.push(`${n} ${n > 1 ? "overlays are" : "overlay is"} on a display outside the stage.`);
  out.push("Each extra display can lower the stage FPS. Max stage FPS = primary display refresh rate. Selection must not include displays that are rendered by different GPUs. This will lead to unpredictable behavior and most likely performance issues.");
  return out;
});

function tipFor(t: Tile): string {
  const name = t.d.name ? `${t.d.index} · ${t.d.name}` : `Display ${t.d.index}`;
  if (t.locked) return `${name}. The stage needs at least one display.`;
  if (t.state === "picked") return `${name}. On the stage. Click to remove it.`;
  if (t.state === "covered") return `${name}. Covered, because the stage is one rectangle. Click to add it.`;
  return `${name}. Click to add it to the stage.`;
}

function toggle(t: Tile): void {
  if (t.locked) return;
  const ids = new Set(picked.value.map((d) => d.id));
  if (ids.has(t.d.id)) ids.delete(t.d.id);
  else ids.add(t.d.id);
  selectStageDisplays([...ids]);
}
</script>

<template>
  <div v-if="displays.length > 1" class="display-pick">
    <motion.button
      v-tip="'Displays the stage covers'"
      type="button"
      class="pick-btn"
      :class="{ active: open }"
      :initial="false"
      :animate="{ backgroundColor: open ? 'var(--accent-200)' : 'rgba(255,255,255,0)' }"
      :transition="Dynamics.quick"
      :while-press="{ scale: 0.95 }"
      @click="open = !open"
    >
      <Icons kind="monitor" size="normal" color="var(--ico)" />
      <span class="pick-text">{{ picked.length }}/{{ displays.length }}</span>
      <span v-if="hiddenOverlays.length" class="pick-badge">{{ hiddenOverlays.length }}</span>
    </motion.button>

    <AnimatePresence>
      <motion.div
        v-if="open && map"
        class="pick-menu"
        :initial="{ opacity: 0, y: 4 }"
        :animate="{ opacity: 1, y: 0 }"
        :exit="{ opacity: 0, y: 4 }"
        :transition="Dynamics.quick"
      >
        <div class="pick-head">
          <span class="pick-title">Stage displays</span>
          <span class="pick-sub">Click a display to add or remove it</span>
        </div>

        <div class="pick-map" :style="map.size">
          <motion.button
            v-for="t in map.tiles"
            :key="t.d.id"
            v-tip="tipFor(t)"
            type="button"
            class="tile"
            :class="[t.state, { locked: t.locked }]"
            :style="t.style"
            :while-press="t.locked ? {} : { scale: 0.96 }"
            :transition="Dynamics.quick"
            @click="toggle(t)"
          >
            <span class="tile-num">{{ t.d.index }}</span>
            <span v-if="t.d.primary" class="tile-main">Main</span>
            <span v-if="t.hidden" class="tile-hidden">{{ t.hidden }}</span>
          </motion.button>
          <div class="pick-frame" :style="map.frame"></div>
        </div>

        <p v-for="(n, i) in notes" :key="i" class="pick-note">{{ n }}</p>
      </motion.div>
    </AnimatePresence>
  </div>
</template>

<style scoped>
.display-pick {
  position: relative;
}

.pick-btn {
  --ico: var(--text-muted);
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-1);
  height: 28px;
  min-width: 28px;
  padding: 0 var(--space-2);
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  corner-shape: bevel;
  border-radius: 8px 0 8px 0;
}

.pick-btn:hover {
  --ico: var(--text-main);
  color: var(--text-main);
}

.pick-btn.active,
.pick-btn.active:hover {
  --ico: var(--base-1000);
  color: var(--base-1000);
}

.pick-text {
  font-size: var(--main-font-size-4);
  font-weight: var(--font-weight-2);
  white-space: nowrap;
}

.pick-badge {
  min-width: 14px;
  height: 14px;
  padding: 0 3px;
  box-sizing: border-box;
  font-family: var(--font-microcopy);
  font-size: var(--secondary-font-size-4);
  line-height: 14px;
  text-align: center;
  color: var(--base-1000);
  background: var(--accent-200);
  corner-shape: bevel;
  border-radius: 4px 0 4px 0;
}

.pick-menu {
  position: absolute;
  right: 0;
  bottom: calc(100% + var(--space-2));
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  width: 264px;
  padding: var(--space-3);
  box-sizing: border-box;
  background: hsla(142, 1%, 6%, 0.97);
  border: 1px solid var(--base-600);
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.6);
  corner-shape: bevel;
  border-radius: 8px 0 8px 0;
}

.pick-head {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.pick-title {
  font-size: var(--main-font-size-4);
  font-weight: var(--font-weight-2);
  color: var(--text-main);
}

.pick-sub {
  font-family: var(--font-microcopy);
  font-size: var(--secondary-font-size-4);
  color: var(--text-muted);
}

.pick-map {
  position: relative;
  align-self: center;
  margin: var(--space-1) 0;
}

.tile {
  position: absolute;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 2px;
  padding: 2px 4px;
  box-sizing: border-box;
  border: 1px solid var(--base-600);
  background: rgba(255, 255, 255, 0.03);
  color: var(--text-muted);
  font-family: var(--font-microcopy);
  font-size: var(--secondary-font-size-4);
  cursor: pointer;
  overflow: hidden;
  corner-shape: bevel;
  border-radius: 4px 0 4px 0;
}

.tile:hover {
  border-color: var(--text-muted);
  color: var(--text-main);
}

.tile.picked {
  border-color: var(--accent-200);
  background: color-mix(in srgb, var(--accent-200) 22%, transparent);
  color: var(--text-main);
}

.tile.covered {
  border-style: dashed;
  border-color: var(--accent-200);
  background: repeating-linear-gradient(45deg, color-mix(in srgb, var(--accent-200) 35%, transparent) 0 1px, transparent 1px 6px);
}

.tile.partial {
  border-style: dashed;
  background: repeating-linear-gradient(45deg, rgba(255, 255, 255, 0.08) 0 1px, transparent 1px 6px);
}

.tile.locked {
  cursor: not-allowed;
}

.tile-num {
  font-weight: var(--font-weight-2);
}

.tile-main {
  margin-right: auto;
  color: var(--accent-200);
}

.tile.picked .tile-main {
  color: var(--text-main);
}

.tile-hidden {
  min-width: 12px;
  height: 12px;
  padding: 0 2px;
  box-sizing: border-box;
  line-height: 12px;
  text-align: center;
  color: var(--base-1000);
  background: var(--accent-200);
}

.pick-frame {
  position: absolute;
  box-sizing: border-box;
  border: 1px dashed var(--text-main);
  pointer-events: none;
}

.pick-note {
  margin: 0;
  font-family: var(--font-microcopy);
  font-size: var(--secondary-font-size-4);
  line-height: 1.4;
  color: var(--text-muted);
}
</style>
