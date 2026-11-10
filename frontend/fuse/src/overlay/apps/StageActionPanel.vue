<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { motion } from "motion-v";
import StagePanel from "../components/StagePanel.vue";
import StageMenu, { type StageMenuItem } from "../inspector/controls/StageMenu.vue";
import StageSearchField from "../inspector/controls/StageSearchField.vue";
import StageConfigureCommand from "./StageConfigureCommand.vue";
import { closeAllWindows, moveFavorite, openApp, quitApp, toggleFavorite, togglePin } from "./appActions";
import type { ActionView, AppEntry } from "./types";
import { Dynamics } from "../../composables/useMotion";
import { useI18n } from "../../composables/useI18n";

const props = defineProps<{ app: AppEntry; view: ActionView; placement: Record<string, string> }>();
const emit = defineEmits<{ close: []; done: []; view: [view: ActionView] }>();

const { t } = useI18n();

const filter = ref("");
const activeId = ref<string | null>("open");
const configure = ref<InstanceType<typeof StageConfigureCommand> | null>(null);

const items = computed<StageMenuItem[]>(() => {
  const a = props.app;
  const list: StageMenuItem[] = [{ id: "open", label: t("stageapps.actions.open"), icon: "launch", keys: ["↵"] }];
  if (a.instances === "multi" && a.windows.length) list.push({ id: "new", label: t("stageapps.actions.newWindow"), icon: "launch" });
  const fav = a.favorite >= 0;
  list.push({
    id: "favorite",
    label: fav ? t("stageapps.actions.removeFavorite") : t("stageapps.actions.addFavorite"),
    icon: "favorite",
    keys: ["ctrl", "shift", "f"],
  });
  if (fav) {
    list.push({ id: "up", label: t("stageapps.actions.moveUp"), icon: "arrowUp", keys: ["ctrl", "shift", "↑"] });
    list.push({ id: "down", label: t("stageapps.actions.moveDown"), icon: "arrowDown", keys: ["ctrl", "shift", "↓"] });
  }
  list.push({ id: "pin", label: a.pinned ? t("stageapps.actions.unpin") : t("stageapps.actions.pin"), icon: "pin" });
  if (a.windows.length) list.push({ id: "closeAll", label: t("stageapps.actions.closeAll"), icon: "cross" });
  if (a.running) list.push({ id: "quit", label: t("stageapps.actions.quit"), icon: "cross", danger: true });
  list.push({ id: "groups", divider: true });
  list.push({ id: "configure", label: t("stageapps.actions.configure"), icon: "settings", keys: ["ctrl", "shift", ","], submenu: true });
  return list;
});

const shown = computed(() => {
  const q = filter.value.trim().toLowerCase();
  return q ? items.value.filter((i) => !i.divider && i.label!.toLowerCase().includes(q)) : items.value;
});

const selectable = computed(() => shown.value.filter((i) => !i.divider && !i.disabled).map((i) => i.id));

watch(selectable, (ids) => {
  if (!activeId.value || !ids.includes(activeId.value)) activeId.value = ids[0] ?? null;
});

watch(
  () => props.view,
  () => {
    filter.value = "";
  },
);

function select(id: string): void {
  const a = props.app;
  switch (id) {
    case "open":
      openApp(a);
      emit("done");
      return;
    case "new":
      openApp(a, true);
      emit("done");
      return;
    case "favorite":
      toggleFavorite(a);
      return;
    case "up":
      moveFavorite(a, -1);
      return;
    case "down":
      moveFavorite(a, 1);
      return;
    case "pin":
      togglePin(a);
      return;
    case "closeAll":
      closeAllWindows(a);
      emit("close");
      return;
    case "quit":
      quitApp(a);
      emit("close");
      return;
    case "configure":
      emit("view", "configure");
      return;
  }
}

function onKey(e: KeyboardEvent): void {
  if (props.view === "configure") {
    if (configure.value?.onKey(e)) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      emit("view", "actions");
    }
    return;
  }
  const ids = selectable.value;
  const at = activeId.value ? ids.indexOf(activeId.value) : -1;
  let used = true;
  if (e.key === "ArrowDown") activeId.value = ids[Math.min(ids.length - 1, at + 1)] ?? null;
  else if (e.key === "ArrowUp") activeId.value = ids[Math.max(0, at - 1)] ?? null;
  else if (e.key === "Enter" && activeId.value) select(activeId.value);
  else if (e.key === "Escape") emit("close");
  else if (e.ctrlKey && e.shiftKey && e.code === "Comma") emit("view", "configure");
  else used = false;
  if (!used) return;
  e.preventDefault();
  e.stopPropagation();
}
</script>

<template>
  <motion.div
    class="fuse-actions action-panel"
    :style="placement"
    :initial="{ opacity: 0, y: 4 }"
    :animate="{ opacity: 1, y: 0 }"
    :exit="{ opacity: 0, y: 4 }"
    :transition="Dynamics.quick"
    @keydown="onKey"
    @pointerdown.stop
  >
    <StagePanel :cut="8" blur dense>
      <header class="head">{{ view === "actions" ? app.name.toUpperCase() : t("stageapps.configure.title") }}</header>
      <StageMenu v-if="view === 'actions'" :items="shown" :active-id="activeId" @select="select" @hover="activeId = $event" />
      <StageConfigureCommand v-else ref="configure" :app="app" :filter="filter" @done="emit('done')" />
      <div class="filter">
        <StageSearchField v-model="filter" :placeholder="t('stageapps.actions.filter')" autofocus />
      </div>
    </StagePanel>
  </motion.div>
</template>

<style scoped>
.action-panel {
  position: absolute;
  z-index: 5;
  width: 300px;
  color: var(--text-main);
  pointer-events: auto;
}

.head {
  padding: 10px var(--space-3) 6px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-microcopy);
  font-size: var(--main-font-size-4);
  letter-spacing: 0.04em;
  color: var(--text-muted);
}

.filter {
  padding: var(--space-2);
  border-top: 1px solid var(--black-3);
}
</style>
