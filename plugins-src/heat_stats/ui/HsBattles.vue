<script setup lang="ts">
import { computed, onBeforeUnmount, reactive } from "vue";
import eBattle, { type BattleNorms, type BattleRow } from "./eBattle.vue";
import type { SamplesEntry } from "./eBattleCharts.vue";
import eBattleToolbar from "./eBattleToolbar.vue";
import ePagination from "./ePagination.vue";
import { useI18n } from "./i18n.mjs";

interface Option {
  value: string;
  label: string;
}

interface BattlesPage {
  state: "ready" | "noKey" | "loading";
  query: Record<string, unknown> & { page: number; pageSize: number };
  total: number;
  rows: BattleRow[];
  /** Over the whole history, so a filter cannot move what a battle is measured against. */
  norms: BattleNorms | null;
  options: { roles: Option[]; agents: Option[]; maps: Option[]; modes: string[] };
}

const props = defineProps<{ battles: object | null; samples: object | null }>();

const emit = defineEmits<{ query: [query: Record<string, unknown>]; refresh: []; samples: [ids: string[]] }>();

const { t } = useI18n();

const NO_OPTIONS = { roles: [], agents: [], maps: [], modes: [] };

const page = computed(() => props.battles as BattlesPage | null);

/** Several battles can be open at once. */
const open = reactive(new Set<string>());

/** The plugin fetches samples for whichever battles are open. */
function toggle(id: string): void {
  if (open.has(id)) open.delete(id);
  else open.add(id);
  emit("samples", [...open]);
}

function samplesFor(id: string): SamplesEntry | null {
  return (props.samples as Record<string, SamplesEntry> | null)?.[id] ?? null;
}

onBeforeUnmount(() => emit("samples", []));

/** The plugin filters and pages; the window only sends what changed on top of the current query. */
function change(patch: Record<string, unknown>): void {
  emit("query", { ...(page.value?.query ?? {}), ...patch });
}

const notice = computed(() => {
  const p = page.value;
  if (!p || p.state === "loading") return t("battles.loading");
  if (p.state === "noKey") return t("battles.needsKey");
  return p.rows.length ? "" : t("battles.empty");
});
</script>

<template>
  <div class="battles">
    <eBattleToolbar
      :query="page?.query ?? {}"
      :options="page?.options ?? NO_OPTIONS"
      @change="change"
      @refresh="emit('refresh')"
    />
    <div class="list">
      <p v-if="notice" class="notice">{{ notice }}</p>
      <eBattle
        v-for="row in page?.rows ?? []"
        :key="row.id"
        :row="row"
        :open="open.has(row.id)"
        :samples="samplesFor(row.id)"
        :norms="page?.norms ?? null"
        @toggle="toggle(row.id)"
      />
    </div>
    <ePagination
      v-if="page?.state === 'ready'"
      :page="page.query.page"
      :page-size="page.query.pageSize"
      :total="page.total"
      @page="change({ page: $event })"
    />
  </div>
</template>

<style scoped>
.battles {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.list {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.notice {
  margin: 0;
  padding: var(--space-4) var(--space-3);
  font-family: var(--font-primary);
  font-size: var(--main-font-size-3);
  line-height: normal;
  color: var(--text-muted);
  text-align: center;
}
</style>
