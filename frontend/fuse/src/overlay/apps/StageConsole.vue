<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { AnimatePresence, motion } from "motion-v";
import StagePanel from "../components/StagePanel.vue";
import StageSearchField from "../inspector/controls/StageSearchField.vue";
import ConsoleRow from "./parts/ConsoleRow.vue";
import ConsoleSection from "./parts/ConsoleSection.vue";
import ConsoleFooter from "./parts/ConsoleFooter.vue";
import StageActionPanel from "./StageActionPanel.vue";
import { hostState } from "../overlayClient";
import { mainScreen } from "../screens";
import { apps, stageKeyboard } from "./appsState";
import { closeConsole, moveFavorite, openApp, toggleFavorite } from "./appActions";
import { consoleSections, type SectionId } from "./consoleRank";
import type { ActionView, AppEntry } from "./types";
import { Dynamics } from "../../composables/useMotion";
import { useI18n } from "../../composables/useI18n";

const W = 750;
const H = 475;
const PANEL_W = 300;

const { t } = useI18n();

const query = ref("");
const now = Date.now();
const search = ref<InstanceType<typeof StageSearchField> | null>(null);
const body = ref<HTMLElement | null>(null);

const sections = computed(() => consoleSections(apps.value, query.value, now));
const flat = computed(() => sections.value.flatMap((s) => s.items));
const activeKey = ref<string | null>(null);
const activeApp = computed(() => flat.value.find((a) => a.key === activeKey.value) ?? null);

watch(
  flat,
  (list) => {
    if (!activeKey.value || !list.some((a) => a.key === activeKey.value)) activeKey.value = list[0]?.key ?? null;
  },
  { immediate: true },
);

/** Centred on the stage's main display, at one third of its height. */
const box = computed(() => {
  const a = mainScreen();
  return { x: Math.round(a.x + (a.w - W) / 2), y: Math.round(a.y + Math.max(24, (a.h - H) / 3)) };
});

const boxStyle = computed(() => ({ left: `${box.value.x}px`, top: `${box.value.y}px`, width: `${W}px`, height: `${H}px` }));

function sectionTitle(id: SectionId, n: number): string {
  if (id === "results") return t("stageapps.console.results", { n });
  return t(`stageapps.console.${id}`);
}

function aliasMatch(app: AppEntry): boolean {
  const q = query.value.trim().toLowerCase();
  return !!q && !!app.alias && app.alias.startsWith(q);
}

// action panel 

const panel = ref<{ appKey: string; view: ActionView; placement: Record<string, string> } | null>(null);
const panelApp = computed(() => (panel.value ? apps.value.find((a) => a.key === panel.value!.appKey) ?? null : null));

/** Ctrl+K: above the footer, on the right. */
function openPanel(view: ActionView): void {
  if (!activeApp.value) return;
  panel.value = { appKey: activeApp.value.key, view, placement: { right: "8px", bottom: "48px" } };
}

/** Right-click: at the cursor, inside the main display. */
function openPanelAt(app: AppEntry, e: MouseEvent): void {
  activeKey.value = app.key;
  const a = mainScreen();
  const x = Math.min(e.clientX, a.x + a.w - PANEL_W - 8) - box.value.x;
  const y = e.clientY - box.value.y;
  panel.value = { appKey: app.key, view: "actions", placement: { left: `${x}px`, top: `${y}px` } };
}

function closePanel(): void {
  panel.value = null;
  void nextTick(() => search.value?.focus());
}

// keys and actions

function launch(app: AppEntry | null): void {
  if (!app) return;
  openApp(app);
  // The new window keeps the keyboard.
  closeConsole(false);
}

function move(delta: -1 | 1): void {
  const list = flat.value;
  if (!list.length) return;
  const at = list.findIndex((a) => a.key === activeKey.value);
  const next = list[Math.min(list.length - 1, Math.max(0, at + delta))];
  if (!next) return;
  activeKey.value = next.key;
  void nextTick(() => body.value?.querySelector(`[data-key="${CSS.escape(next.key)}"]`)?.scrollIntoView({ block: "nearest" }));
}

function onSearchKey(e: KeyboardEvent): void {
  const app = activeApp.value;
  let used = true;
  if (e.ctrlKey && e.shiftKey && e.code === "Comma") openPanel("configure");
  else if (e.ctrlKey && e.shiftKey && e.code === "KeyF") {
    if (app) toggleFavorite(app);
  } else if (e.ctrlKey && e.shiftKey && e.key === "ArrowUp") {
    if (app) moveFavorite(app, -1);
  } else if (e.ctrlKey && e.shiftKey && e.key === "ArrowDown") {
    if (app) moveFavorite(app, 1);
  } else if (e.ctrlKey && e.code === "KeyK") openPanel("actions");
  else if (e.key === "ArrowDown") move(1);
  else if (e.key === "ArrowUp") move(-1);
  else if (e.key === "Enter") launch(app);
  else if (e.key === "Escape") {
    // Esc: the panel, else the search text, else the console itself.
    if (query.value) query.value = "";
    else closeConsole(true);
  } else used = false;
  if (!used) return;
  e.preventDefault();
  e.stopPropagation();
}

// The game took the keyboard back, hide console
watch(stageKeyboard, (has, had) => {
  if (had && !has) closeConsole(false);
});

watch(hostState, (s) => {
  if (s === "calibrate") closeConsole(false);
});

/** A click outside the console and its panel closes them */
function onOutside(e: PointerEvent): void {
  const target = e.target as Element | null;
  if (target?.closest(".fuse-console, .fuse-taskbar, .fuse-actions")) return;
  closeConsole(false);
}

onMounted(() => {
  void nextTick(() => search.value?.focus());
  document.addEventListener("pointerdown", onOutside, true);
});

onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", onOutside, true);
});
</script>

<template>
  <motion.div
    class="fuse-console"
    :style="boxStyle"
    :initial="{ opacity: 0, scale: 0.98 }"
    :animate="{ opacity: 1, scale: 1 }"
    :exit="{ opacity: 0, scale: 0.98 }"
    :transition="Dynamics.quick"
  >
    <StagePanel class="console-panel" :cut="12" blur dense>
      <StageSearchField
        ref="search"
        v-model="query"
        size="large"
        :placeholder="t('stageapps.console.placeholder')"
        @keydown="onSearchKey"
      />
      <div class="divider" />
      <div ref="body" class="body">
        <template v-for="s in sections" :key="s.id">
          <ConsoleSection :title="sectionTitle(s.id, s.items.length)" />
          <ConsoleRow
            v-for="app in s.items"
            :key="s.id + app.key"
            :data-key="app.key"
            :app="app"
            :selected="activeKey === app.key"
            :alias-match="aliasMatch(app)"
            :type-label="t('stageapps.console.type')"
            @open="launch(app)"
            @menu="openPanelAt(app, $event)"
            @hover="activeKey = app.key"
          />
        </template>
        <div v-if="!sections.length" class="empty">
          <template v-if="!apps.length">
            <span class="empty-title">{{ t("stageapps.console.noAppsTitle") }}</span>
            <span class="empty-note">{{ t("stageapps.console.noAppsNote") }}</span>
          </template>
          <template v-else>
            <span class="empty-title">{{ t("stageapps.console.noMatchTitle", { query: query.trim().toUpperCase() }) }}</span>
            <span class="empty-note">{{ t("stageapps.console.noMatchNote") }}</span>
          </template>
        </div>
      </div>
      <ConsoleFooter
        :hint="t('stageapps.console.hint')"
        :primary="t('stageapps.console.openApp')"
        :actions="t('stageapps.console.actions')"
        :can-act="!!activeApp"
        @primary="launch(activeApp)"
        @actions="openPanel('actions')"
      />
    </StagePanel>
    <AnimatePresence>
      <StageActionPanel
        v-if="panel && panelApp"
        key="actions"
        :app="panelApp"
        :view="panel.view"
        :placement="panel.placement"
        @close="closePanel"
        @done="closeConsole(false)"
        @view="panel.view = $event"
      />
    </AnimatePresence>
  </motion.div>
</template>

<style scoped>
.fuse-console {
  position: absolute;
  display: flex;
  pointer-events: auto;
  color: var(--text-main);
}

.console-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.divider {
  flex: none;
  height: 1px;
  background: var(--black-3);
}

.body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: var(--space-1) var(--space-2);
  scrollbar-width: thin;
  scrollbar-color: var(--black-3) transparent;
}

.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  padding-top: 120px;
  text-align: center;
}

.empty-title {
  font-family: var(--font-microcopy);
  font-size: var(--main-font-size-4);
  font-weight: var(--font-weight-2);
  letter-spacing: 0.04em;
  color: var(--text-muted);
}

.empty-note {
  font-family: var(--font-microcopy);
  font-size: var(--main-font-size-5);
  color: var(--base-600);
}
</style>
