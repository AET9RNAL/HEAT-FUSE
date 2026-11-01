<script setup lang="ts">
import { computed, onBeforeUnmount } from "vue";
import Icons from "fuse_ui/ui/Icons.vue";
import eSelect from "fuse_ui/ui/eSelect.vue";
import eTextField from "fuse_ui/ui/eTextField.vue";
import eScrollRail from "./eScrollRail.vue";
import { useI18n } from "./i18n.mjs";

interface Option {
  value: string;
  label: string;
}

const props = defineProps<{
  query: Record<string, unknown>;
  options: { roles: Option[]; agents: Option[]; maps: Option[]; modes: string[] };
}>();

const emit = defineEmits<{ change: [patch: Record<string, unknown>]; refresh: [] }>();

const { t } = useI18n();

const PAGE_SIZES = [5, 10, 20, 50, 75];
const SORTS = ["played", "score", "kd", "damage", "place"];
const OUTCOMES = ["win", "loss", "draw"];
const SEARCH_DELAY_MS = 250;

function modeName(key: string): string {
  const path = `modes.${key.toLowerCase().replace(/[\s_-]/g, "")}`;
  const label = t(path);
  return label === path ? key : label;
}

const all = computed(() => ({ value: "", label: t("battles.all") }));

const filters = computed(() => [
  { key: "outcome", options: [all.value, ...OUTCOMES.map((o) => ({ value: o, label: t(`battles.${o}`) }))] },
  { key: "role", options: [all.value, ...props.options.roles] },
  {
    key: "agent",
    options: [
      all.value,
      ...props.options.agents.map((o) => ({ value: o.value, label: o.label || t("performance.agentName", { id: o.value }) })),
    ],
  },
  { key: "map", options: [all.value, ...props.options.maps] },
  { key: "mode", options: [all.value, ...props.options.modes.map((m) => ({ value: m, label: modeName(m) }))] },
]);

const sizes = PAGE_SIZES.map((s) => ({ value: s, label: String(s) }));

const sorts = computed(() =>
  SORTS.map((s) => ({ value: s, label: t(`battles.sort${s.charAt(0).toUpperCase()}${s.slice(1)}`) })),
);

function set(key: string, value: unknown): void {
  emit("change", { [key]: value, page: 0 });
}

let searchTimer: number | null = null;

function search(value: string, now = false): void {
  if (searchTimer !== null) window.clearTimeout(searchTimer);
  searchTimer = null;
  if (now) set("search", value);
  else searchTimer = window.setTimeout(() => set("search", value), SEARCH_DELAY_MS);
}

onBeforeUnmount(() => {
  if (searchTimer !== null) window.clearTimeout(searchTimer);
});
</script>

<template>
  <eScrollRail class="toolbar" gutter="var(--space-3)">
    <div class="track">
      <div class="group">
        <div class="search">
          <eTextField
            :model-value="String(query.search ?? '')"
            :placeholder="t('battles.search')"
            :max-length="100"
            @live="search($event)"
            @commit="search($event, true)"
          />
        </div>
        <div v-for="f in filters" :key="f.key" class="filter">
          <eSelect
            :model-value="query[f.key] ?? ''"
            :options="f.options"
            searchable
            @update:model-value="set(f.key, $event)"
          />
        </div>
      </div>
      <div class="group">
        <div class="size">
          <eSelect :model-value="query.pageSize" :options="sizes" @update:model-value="set('pageSize', $event)" />
        </div>
        <div class="sort">
          <eSelect :model-value="query.sort" :options="sorts" @update:model-value="set('sort', $event)" />
        </div>
        <button type="button" class="refresh" :aria-label="t('battles.refresh')" @click="emit('refresh')">
          <Icons kind="reload" size="small" color="currentColor" />
        </button>
      </div>
    </div>
  </eScrollRail>
</template>

<style scoped>
.toolbar {
  width: 100%;
}

.track {
  min-width: 100%;
  width: max-content;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-2) 0;
}

.group {
  flex: none;
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.search {
  width: 10em;
}

.filter {
  width: 8em;
}

.size {
  width: 4.5em;
}

.sort {
  width: 9em;
}

.refresh {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  margin: 0;
  padding: 0;
  box-sizing: border-box;
  border: 1px solid var(--base-600);
  background: var(--black-1-a);
  color: var(--text-muted);
  cursor: pointer;
  corner-shape: bevel;
  border-radius: 8px 0 8px 0;
}

.refresh:hover {
  color: var(--text-main);
}
</style>
