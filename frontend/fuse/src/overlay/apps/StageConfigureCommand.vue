<script setup lang="ts">
import { computed, ref, watch } from "vue";
import StageMenu, { type StageMenuItem } from "../inspector/controls/StageMenu.vue";
import StageKeybindField from "../inspector/controls/StageKeybindField.vue";
import StageSearchField from "../inspector/controls/StageSearchField.vue";
import { sendAppsMessage } from "../overlayClient";
import { configureResult } from "./appsState";
import { openCommandSettings } from "./appActions";
import type { AppEntry } from "./types";
import { useI18n } from "../../composables/useI18n";

const props = defineProps<{ app: AppEntry; filter: string }>();
const emit = defineEmits<{ done: [] }>();

const { t } = useI18n();

const ALIAS_RE = /^[a-z0-9-]{0,24}$/;

type Mode = "menu" | "hotkey" | "alias";
const mode = ref<Mode>("menu");
const activeId = ref<string | null>("settings");
const aliasDraft = ref("");
const error = ref("");
/** A change sent, waiting for the runtime's answer. */
let pending = false;

const items = computed<StageMenuItem[]>(() => {
  const all: StageMenuItem[] = [
    { id: "settings", label: t("stageapps.configure.settings"), icon: "settings" },
    { id: "groups", divider: true },
    { id: "hotkey", label: t("stageapps.configure.setHotkey"), icon: "console", keys: props.app.hotkey ? props.app.hotkey.split("+") : undefined },
    { id: "alias", label: t("stageapps.configure.setAlias"), icon: "tags" },
  ];
  const q = props.filter.trim().toLowerCase();
  return q ? all.filter((i) => !i.divider && i.label!.toLowerCase().includes(q)) : all;
});

const selectable = computed(() => items.value.filter((i) => !i.divider && !i.disabled).map((i) => i.id));

function select(id: string): void {
  error.value = "";
  switch (id) {
    case "settings":
      openCommandSettings(props.app);
      emit("done");
      return;
    case "hotkey":
      mode.value = "hotkey";
      return;
    case "alias":
      aliasDraft.value = props.app.alias ?? "";
      mode.value = "alias";
      return;
  }
}

function send(fields: Record<string, unknown>): void {
  pending = true;
  error.value = "";
  sendAppsMessage("app:configure", { appKey: props.app.key, ...fields });
}

function saveHotkey(combo: string): void {
  send({ hotkey: combo || null });
}

/** The runtime pauses every hotkey while the field listens, so the combo does not fire. */
function onCapture(on: boolean): void {
  sendAppsMessage("hotkeys:capture", { on });
}

function saveAlias(): void {
  const alias = aliasDraft.value.trim().toLowerCase();
  if (!ALIAS_RE.test(alias)) {
    error.value = t("stageapps.configure.aliasInvalid");
    return;
  }
  send({ alias: alias || null });
}

function onAliasKey(e: KeyboardEvent): void {
  if (e.key === "Enter") {
    e.preventDefault();
    e.stopPropagation();
    saveAlias();
  }
}

watch(configureResult, (r) => {
  if (!r || !pending || r.appKey !== props.app.key) return;
  pending = false;
  if (r.ok) {
    mode.value = "menu";
    error.value = "";
    return;
  }
  const owner = r.owner ?? "";
  error.value =
    r.error === "hotkey_taken"
      ? t("stageapps.configure.hotkeyTaken", { owner: owner.toUpperCase() })
      : r.error === "alias_taken"
        ? t("stageapps.configure.aliasTaken", { owner: owner.toUpperCase() })
        : r.error === "alias_invalid"
          ? t("stageapps.configure.aliasInvalid")
          : t("stageapps.configure.hotkeyInvalid");
});

watch(selectable, (ids) => {
  if (!activeId.value || !ids.includes(activeId.value)) activeId.value = ids[0] ?? null;
});

/** Keys from the action panel. True when this view used the key. */
function onKey(e: KeyboardEvent): boolean {
  if (mode.value !== "menu") {
    if (e.key !== "Escape") return false;
    mode.value = "menu";
    error.value = "";
    return true;
  }
  const ids = selectable.value;
  const at = activeId.value ? ids.indexOf(activeId.value) : -1;
  if (e.key === "ArrowDown") activeId.value = ids[Math.min(ids.length - 1, at + 1)] ?? null;
  else if (e.key === "ArrowUp") activeId.value = ids[Math.max(0, at - 1)] ?? null;
  else if (e.key === "Enter" && activeId.value) select(activeId.value);
  else return false;
  return true;
}

defineExpose({ onKey });
</script>

<template>
  <div class="configure">
    <StageMenu :items="items" :active-id="mode === 'menu' ? activeId : mode" @select="select" @hover="activeId = $event" />
    <div v-if="mode === 'hotkey'" class="editor">
      <span class="editor-title">{{ t("stageapps.configure.record") }}</span>
      <StageKeybindField :model-value="app.hotkey ?? ''" autostart clearable @commit="saveHotkey" @capture="onCapture" />
      <span v-if="error" class="error">{{ error }}</span>
      <span class="hint">{{ t("stageapps.configure.recordHint") }}</span>
    </div>
    <div v-else-if="mode === 'alias'" class="editor">
      <StageSearchField
        v-model="aliasDraft"
        :icon="false"
        :placeholder="t('stageapps.configure.aliasPlaceholder')"
        :max-length="24"
        autofocus
        @keydown="onAliasKey"
      />
      <span v-if="error" class="error">{{ error }}</span>
      <span class="hint">{{ t("stageapps.configure.aliasHint") }}</span>
    </div>
  </div>
</template>

<style scoped>
.editor {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  padding: var(--space-1) var(--space-2) var(--space-2) 30px;
}

.editor > :deep(.stage-search) {
  align-self: stretch;
}

.editor-title {
  font-family: var(--font-microcopy);
  font-size: var(--main-font-size-4);
  letter-spacing: 0.04em;
  color: var(--accent-200);
}

.error {
  font-family: var(--font-microcopy);
  font-size: var(--main-font-size-5);
  font-weight: var(--font-weight-2);
  letter-spacing: 0.04em;
  color: var(--error-highlight);
}

.hint {
  font-family: var(--font-microcopy);
  font-size: var(--main-font-size-5);
  letter-spacing: 0.04em;
  color: var(--base-600);
}
</style>
