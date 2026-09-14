<script setup lang="ts">
/**
 * Read-only roster of everything loaded on this stage
 */
import { computed, ref } from "vue";
import StagePanel from "./StagePanel.vue";
import Icons from "../../components/Icons.vue";
import { motion } from "motion-v";
import { Dynamics } from "../../composables/useMotion";
import { vTip } from "../inspector/tooltip";
import { overlays, stagePlugins } from "../overlayClient";
import { pluginListOpen, pluginListPos, selectOverlay, selectedId } from "../stageState";

const PANEL_W = 300;

const root = ref<HTMLElement | null>(null);
const query = ref("");
const expanded = ref(new Set<string>());

const rows = computed(() => {
  const q = query.value.trim().toLowerCase();
  const list = q
    ? stagePlugins.value.filter((p) => p.name.toLowerCase().includes(q) || p.plugin_id.includes(q))
    : stagePlugins.value;
  // Loaded plugins first, then alphabetical - the roster includes disabled ones.
  return [...list].sort((a, b) => {
    const rank = (s: string): number => (s === "active" ? 0 : s === "error" ? 1 : 2);
    return rank(a.status) - rank(b.status) || a.name.localeCompare(b.name);
  });
});

function toggle(id: string): void {
  if (expanded.value.has(id)) expanded.value.delete(id);
  else expanded.value.add(id);
  expanded.value = new Set(expanded.value);
}

function stageLabel(p: (typeof stagePlugins.value)[number]): string {
  if (!p.requires_calibration) return "—";
  if (!p.current_stage) return `${p.calibration_stages} stage${p.calibration_stages > 1 ? "s" : ""}`;
  return `${p.current_stage}/${p.calibration_stages}`;
}

function overlayLabel(overlayId: string): string {
  return overlayId.split(":")[1] ?? overlayId;
}

function overlayKnown(overlayId: string): boolean {
  return overlays.has(overlayId);
}

const panelStyle = computed(() => {
  const p = pluginListPos.value;
  if (p) return { left: `${p.x}px`, top: `${p.y}px` };
  return { left: `${MARGIN}px`, top: `${MARGIN}px` };
});

const MARGIN = 24;

let isDragging = false;
let startPtr = { x: 0, y: 0 };
let startPos = { x: 0, y: 0 };

function clampToViewport(x: number, y: number): { x: number; y: number } {
  const h = root.value?.offsetHeight ?? 0;
  return {
    x: Math.min(Math.max(0, x), Math.max(0, window.innerWidth - PANEL_W)),
    y: Math.min(Math.max(0, y), Math.max(0, window.innerHeight - h)),
  };
}

function onHeaderDown(e: PointerEvent): void {
  if ((e.target as HTMLElement).closest("button")) return;
  const box = root.value?.getBoundingClientRect();
  if (!box) return;
  isDragging = true;
  startPtr = { x: e.clientX, y: e.clientY };
  startPos = { x: box.left, y: box.top };
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  e.preventDefault();
}

function onHeaderMove(e: PointerEvent): void {
  if (!isDragging) return;
  pluginListPos.value = clampToViewport(
    startPos.x + (e.clientX - startPtr.x),
    startPos.y + (e.clientY - startPtr.y),
  );
}

function onHeaderUp(): void {
  isDragging = false;
}
</script>

<template>
  <aside v-if="pluginListOpen" ref="root" class="plugin-list stage-ui" :style="panelStyle">
    <StagePanel class="pl-panel" :cut="8" blur>
      <header
        class="pl-header"
        @pointerdown="onHeaderDown"
        @pointermove="onHeaderMove"
        @pointerup="onHeaderUp"
      >
        <span class="pl-title">Plugins</span>
        <span class="pl-count">{{ rows.length }}</span>
        <button type="button" class="pl-close" title="Close" @click="pluginListOpen = false">
          <Icons kind="cross" size="small" color="var(--ico)" />
        </button>
      </header>

      <input v-model="query" class="pl-search" type="text" placeholder="Filter" />

      <div class="pl-body">
        <div v-for="p in rows" :key="p.plugin_id" class="pl-group">
          <button type="button" class="pl-row" @click="toggle(p.plugin_id)">
            <motion.span
              class="row-caret"
              :class="{ empty: !p.overlay_ids.length }"
              :initial="false"
              :animate="{ rotate: expanded.has(p.plugin_id) ? 0 : -90 }"
              :transition="Dynamics.snappy"
            >
              <Icons kind="chevron-down" size="small" color="var(--text-muted)" />
            </motion.span>
            <span class="dot" :class="p.status"></span>
            <span class="row-name">{{ p.name }}</span>
            <span class="row-ver">{{ p.version }}</span>
            <span
              v-tip="p.requires_calibration ? 'Calibration stage' : 'No calibration'"
              class="row-stage"
            >{{ stageLabel(p) }}</span>
            <span class="row-state" :class="p.state">{{ p.in_setup ? "setup" : p.state }}</span>
          </button>

          <div v-if="expanded.has(p.plugin_id)" class="pl-children">
            <button
              v-for="oid in p.overlay_ids"
              :key="oid"
              type="button"
              class="pl-child"
              :class="{ active: selectedId === oid, missing: !overlayKnown(oid) }"
              :disabled="!overlayKnown(oid)"
              @click="selectOverlay(oid)"
            >
              <Icons kind="overlay" size="small" color="var(--ico)" />
              <span class="child-name">{{ overlayLabel(oid) }}</span>
            </button>
            <p v-if="!p.overlay_ids.length" class="pl-empty">No overlays</p>
          </div>
        </div>
        <p v-if="!rows.length" class="pl-empty">Nothing loaded</p>
      </div>
    </StagePanel>
  </aside>
</template>

<style scoped>
.plugin-list {
  user-select: none;
  -webkit-user-select: none;
  position: fixed;
  width: 300px;
  max-height: calc(100vh - 140px);
  display: flex;
  z-index: 15;
  color: var(--text-main);
  font-family: var(--font-primary);
}

.pl-panel {
  width: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.pl-header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-3);
  border-bottom: 1px solid var(--black-3);
  cursor: move;
  touch-action: none;
  user-select: none;
}

.pl-title {
  flex: 1;
  font-size: var(--main-font-size-3);
  font-weight: var(--font-weight-2);
}

.pl-count {
  font-family: var(--font-microcopy);
  font-size: var(--main-font-size-4);
  color: var(--text-muted);
}

.pl-close {
  --ico: var(--text-muted);
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
  corner-shape: bevel;
  border-radius: 6px 0 6px 0;
}

.pl-close:hover {
  --ico: var(--text-main);
  background: rgba(255, 255, 255, 0.06);
}

.pl-search {
  flex: none;
  height: 26px;
  margin: var(--space-2) var(--space-3);
  padding: 0 var(--space-2);
  border: none;
  outline: none;
  background: var(--black-2-a);
  font-family: var(--font-microcopy);
  font-size: var(--main-font-size-4);
  color: var(--text-main);
  corner-shape: bevel;
  border-radius: 8px 0 8px 0;
}

.pl-search::placeholder { color: var(--base-600); }

.pl-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0 var(--space-2) var(--space-2);
  scrollbar-width: thin;
  scrollbar-color: var(--black-3) transparent;
}

.pl-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  height: 28px;
  padding: 0 var(--space-1);
  border: none;
  background: transparent;
  cursor: pointer;
  text-align: left;
}

.pl-row:hover { background: rgba(255, 255, 255, 0.04); }

.row-caret {
  flex: none;
  display: flex;
  line-height: 0;
}

.row-caret.empty { opacity: 0.25; }

.dot {
  flex: none;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--base-600);
}

.dot.active { background: var(--accent-200); }
.dot.error { background: var(--error-highlight); }
.dot.loading, .dot.pending { background: var(--warning-color); }

.row-name {
  flex: 1;
  min-width: 0;
  font-size: var(--main-font-size-4);
  color: var(--text-main);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.row-ver,
.row-stage {
  flex: none;
  font-family: var(--font-microcopy);
  font-size: var(--main-font-size-5);
  color: var(--base-600);
}

.row-state {
  flex: none;
  padding: 1px var(--space-1);
  font-family: var(--font-microcopy);
  font-size: var(--main-font-size-5);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-muted);
  background: var(--black-2-a);
}

.row-state.calibrate { color: var(--accent-200); }
.row-state.interactive { color: var(--accent-150); }
.row-state.error { color: var(--error-highlight); }

.pl-children {
  display: flex;
  flex-direction: column;
  padding-left: var(--space-4);
}

.pl-child {
  --ico: var(--text-muted);
  display: flex;
  align-items: center;
  gap: var(--space-2);
  height: 24px;
  padding: 0 var(--space-1);
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  text-align: left;
  corner-shape: bevel;
  border-radius: 6px 0 6px 0;
}

.pl-child:hover:not(:disabled) {
  --ico: var(--text-main);
  background: rgba(255, 255, 255, 0.04);
  color: var(--text-main);
}

.pl-child.active { --ico: var(--accent-200); color: var(--accent-200); }
.pl-child.missing { opacity: 0.4; cursor: not-allowed; }

.child-name {
  flex: 1;
  min-width: 0;
  font-size: var(--main-font-size-4);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.child-kind {
  font-family: var(--font-microcopy);
  font-size: var(--main-font-size-5);
  color: var(--base-600);
}

.pl-empty {
  margin: 0;
  padding: var(--space-2);
  font-family: var(--font-microcopy);
  font-size: var(--main-font-size-4);
  color: var(--base-600);
}
</style>
