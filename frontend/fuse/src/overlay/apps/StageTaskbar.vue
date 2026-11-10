<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { AnimatePresence, motion } from "motion-v";
import StagePanel from "../components/StagePanel.vue";
import StageIconButton from "../inspector/controls/StageIconButton.vue";
import StageMenu, { type StageMenuItem } from "../inspector/controls/StageMenu.vue";
import StartButton from "./parts/StartButton.vue";
import TaskbarButton from "./parts/TaskbarButton.vue";
import { focusStageForClick, formatCombo, hostHotkeys, sendAppsMessage, sendWindowCommand } from "../overlayClient";
import { apps, consoleOpen, focusedWindowId, stageKeyboard, taskbarMenuOpen, visibleWindows, windows } from "./appsState";
import { closeAllWindows, focusWindow, openApp, quitApp, togglePin, topWindowOf } from "./appActions";
import type { AppEntry, TaskbarEdge } from "./types";
import { Dynamics } from "../../composables/useMotion";
import { useI18n } from "../../composables/useI18n";

const props = defineProps<{ edge: TaskbarEdge }>();

const { t } = useI18n();

const vertical = computed(() => props.edge === "left" || props.edge === "right");

const entries = computed(() => [
  ...apps.value.filter((a) => a.pinned),
  ...apps.value.filter((a) => !a.pinned && a.windows.length > 0),
]);

const startTip = computed(() => t("stageapps.taskbar.startTip", { combo: formatCombo(hostHotkeys.console) }));

function isFocused(app: AppEntry): boolean {
  const id = focusedWindowId.value;
  return !!id && stageKeyboard.value && app.windows.includes(id);
}

function onAppClick(app: AppEntry): void {
  const id = topWindowOf(app);
  const w = id ? windows.get(id) : undefined;
  if (id && w && w.focused && !w.minimized && stageKeyboard.value) {
    sendWindowCommand(id, "minimize");
    return;
  }
  if (id) focusWindow(id);
  else openApp(app);
}

function toggleConsole(): void {
  sendAppsMessage("console:toggle");
  focusStageForClick();
}

let hiddenByDesktop: string[] = [];
function showDesktop(): void {
  const shown = visibleWindows.value.map((w) => w.windowId);
  if (shown.length) {
    hiddenByDesktop = shown;
    for (const id of shown) sendWindowCommand(id, "minimize");
    return;
  }
  const back = hiddenByDesktop.filter((id) => windows.has(id));
  hiddenByDesktop = [];
  for (const id of back) sendWindowCommand(id, "restore");
}

// context menu

const menu = ref<{ appKey: string; style: Record<string, string> } | null>(null);
const menuEl = ref<HTMLElement | null>(null);
const menuApp = computed(() => (menu.value ? apps.value.find((a) => a.key === menu.value!.appKey) ?? null : null));

watch(menu, (m) => {
  taskbarMenuOpen.value = !!m;
});

/** The menu opens toward the middle of the display. */
function openMenu(app: AppEntry, e: MouseEvent): void {
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
  const gap = 8;
  const style: Record<string, string> =
    props.edge === "top"
      ? { left: `${r.left}px`, top: `${r.bottom + gap}px` }
      : props.edge === "left"
        ? { left: `${r.right + gap}px`, top: `${r.top}px` }
        : props.edge === "right"
          ? { left: `${r.left - gap}px`, top: `${r.top}px`, transform: "translateX(-100%)" }
          : { left: `${r.left}px`, top: `${r.top - gap}px`, transform: "translateY(-100%)" };
  menu.value = { appKey: app.key, style };
}

const menuItems = computed<StageMenuItem[]>(() => {
  const a = menuApp.value;
  if (!a) return [];
  const items: StageMenuItem[] = [
    { id: "open", label: a.windows.length ? t("stageapps.taskbar.show") : t("stageapps.taskbar.open"), icon: "launch" },
  ];
  if (a.instances === "multi" && a.windows.length) items.push({ id: "new", label: t("stageapps.taskbar.newWindow"), icon: "launch" });
  items.push({ id: "groups", divider: true });
  items.push({ id: "pin", label: a.pinned ? t("stageapps.taskbar.unpin") : t("stageapps.taskbar.pin"), icon: "pin" });
  if (a.windows.length) items.push({ id: "closeAll", label: t("stageapps.taskbar.closeAll"), icon: "cross" });
  if (a.running) items.push({ id: "quit", label: t("stageapps.taskbar.quit"), icon: "cross", danger: true });
  return items;
});

function onMenuSelect(id: string): void {
  const a = menuApp.value;
  menu.value = null;
  if (!a) return;
  switch (id) {
    case "open":
      openApp(a);
      return;
    case "new":
      openApp(a, true);
      return;
    case "pin":
      togglePin(a);
      return;
    case "closeAll":
      closeAllWindows(a);
      return;
    case "quit":
      quitApp(a);
      return;
  }
}

function onOutside(e: PointerEvent): void {
  if (menuEl.value && !menuEl.value.contains(e.target as Node)) menu.value = null;
}

function onKey(e: KeyboardEvent): void {
  if (e.key === "Escape") menu.value = null;
}

watch(menu, (m, prev) => {
  if (m && !prev) {
    document.addEventListener("pointerdown", onOutside, true);
    document.addEventListener("keydown", onKey, true);
  } else if (!m && prev) {
    document.removeEventListener("pointerdown", onOutside, true);
    document.removeEventListener("keydown", onKey, true);
  }
});

// A pinned or open app can leave the list while its menu shows.
watch(menuApp, (a) => {
  if (menu.value && !a) menu.value = null;
});

onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", onOutside, true);
  document.removeEventListener("keydown", onKey, true);
  taskbarMenuOpen.value = false;
});
</script>

<template>
  <StagePanel class="fuse-taskbar" :class="{ vertical }" :cut="12" blur dense>
    <div class="bar">
      <StartButton :open="consoleOpen" :tip="startTip" @click="toggleConsole" />
      <span v-if="entries.length" class="sep" />
      <TaskbarButton
        v-for="a in entries"
        :key="a.key"
        :app="a"
        :focused="isFocused(a)"
        @click="onAppClick(a)"
        @menu="openMenu(a, $event)"
      />
      <span class="sep" />
      <StageIconButton icon="monitor" :tip="t('stageapps.taskbar.showDesktop')" @click="showDesktop" />
    </div>
  </StagePanel>
  <Teleport to="body">
    <AnimatePresence>
      <motion.div
        v-if="menu && menuApp"
        key="taskbar-menu"
        class="fuse-actions taskbar-menu"
        :style="menu.style"
        :initial="{ opacity: 0 }"
        :animate="{ opacity: 1 }"
        :exit="{ opacity: 0 }"
        :transition="Dynamics.quick"
      >
        <div ref="menuEl">
          <StagePanel :cut="8" blur dense>
            <StageMenu :items="menuItems" @select="onMenuSelect" />
          </StagePanel>
        </div>
      </motion.div>
    </AnimatePresence>
  </Teleport>
</template>

<style scoped>
.fuse-taskbar {
  flex: 1;
  display: flex;
  min-width: 0;
  min-height: 0;
}

.bar {
  flex: 1;
  display: flex;
  align-items: center;
  gap: var(--space-1);
  padding: 0 6px;
  min-width: 0;
}

.vertical .bar {
  flex-direction: column;
  padding: 6px 0;
}

.sep {
  flex: none;
  width: 1px;
  height: 24px;
  background: var(--black-3);
}

.vertical .sep {
  width: 24px;
  height: 1px;
}

.taskbar-menu {
  position: fixed;
  z-index: 70;
  width: 240px;
  color: var(--text-main);
  pointer-events: auto;
}
</style>
