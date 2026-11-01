<script setup lang="ts">
import { computed, provide, ref, watch } from "vue";
import "fuse_ui/ui/tokens.css";
import eTooltip from "fuse_ui/ui/eTooltip.vue";
import eTitlebar from "./ui/eTitlebar.vue";
import eComingSoon from "./ui/eComingSoon.vue";
import eSubNav, { TABS } from "./ui/eSubNav.vue";
import HsAccount from "./ui/HsAccount.vue";
import HsBattles from "./ui/HsBattles.vue";
import HsCharts from "./ui/HsCharts.vue";
import HsLabs from "./ui/HsLabs.vue";
import HsOverview from "./ui/HsOverview.vue";
import HsReplays from "./ui/HsReplays.vue";
import HsTags from "./ui/HsTags.vue";
import { ASSETS, createAssets } from "./ui/assets.mjs";
import { I18N, createI18n } from "./ui/i18n.mjs";
import { TAGS, tagIndex } from "./ui/tags.mjs";

const props = defineProps<{
  data: Record<string, unknown>;
  assetBase?: string;
  interactive?: boolean;
  emitAction?: (action: string, payload?: unknown) => void;
}>();

const str = (key: string, fallback: string): string => {
  const v = props.data?.[key];
  return typeof v === "string" && v ? v : fallback;
};

const locale = computed(() => str("locale", "en"));
const version = computed(() => str("version", ""));
const status = computed(() => str("status", "idle"));
const connection = computed(() => str("connection", "local"));
const locales = computed(() => (Array.isArray(props.data?.locales) ? props.data.locales.map(String) : [locale.value]));
const streakLength = computed(() => {
  const v = Number(props.data?.streakLength);
  return Number.isFinite(v) && v > 0 ? v : 75;
});
const overview = computed(() => {
  const v = props.data?.overview;
  return v && typeof v === "object" ? v : null;
});
const battles = computed(() => {
  const v = props.data?.battles;
  return v && typeof v === "object" ? v : null;
});
const samples = computed(() => {
  const v = props.data?.samples;
  return v && typeof v === "object" ? v : null;
});
const account = computed(() => {
  const v = props.data?.account;
  return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
});
const charts = computed(() => {
  const v = props.data?.charts;
  return v && typeof v === "object" ? v : null;
});
const tags = computed(() => {
  const v = props.data?.tags;
  return v && typeof v === "object" ? v : null;
});
const replays = computed(() => {
  const v = props.data?.replays;
  return v && typeof v === "object" ? v : null;
});

// The overlay host hands down where this plugin's files are served from; every
// component that draws a tank, an agent or the mark reads it from here.
provide(
  ASSETS,
  createAssets({
    get base() {
      return props.assetBase ?? "";
    },
  }),
);

provide(
  I18N,
  createI18n({
    get locale() {
      return locale.value;
    },
    get messages() {
      return (props.data?.messages as Record<string, string> | undefined) ?? {};
    },
  }),
);

// Marks follow a player everywhere they appear, so the index is provided once
// here rather than threaded through every roster and list that draws one.
const marks = computed(() => tagIndex((tags.value as { players?: unknown } | null)?.players));
const tagColors = computed(
  () => ((tags.value as { colors?: Record<string, string> } | null)?.colors ?? {}) as Record<string, string>,
);

provide(TAGS, {
  marks: (pid: string | null | undefined) => (pid ? (marks.value.get(String(pid)) ?? []) : []),
  /** The group's configured colour; the brand's green until one is picked. */
  color: (id: string) => tagColors.value[id] || "var(--accent-200)",
});

const NAV_KEY = "heat_stats:nav";
const SECTIONS = ["home", "account"];

function remembered(): { section: string; tab: string } {
  const fallback = { section: "home", tab: "overview" };
  try {
    const raw = sessionStorage.getItem(NAV_KEY);
    if (!raw) return fallback;
    const saved = JSON.parse(raw) as { section?: unknown; tab?: unknown };
    return {
      section: SECTIONS.includes(String(saved.section)) ? String(saved.section) : fallback.section,
      tab: TABS.includes(String(saved.tab)) ? String(saved.tab) : fallback.tab,
    };
  } catch {
    return fallback;
  }
}

const start = remembered();
const section = ref(start.section);
const tab = ref(start.tab);

watch([section, tab], ([s, t]: [string, string]) => {
  try {
    sessionStorage.setItem(NAV_KEY, JSON.stringify({ section: s, tab: t }));
  } catch {
    // A stage without storage keeps working; it just forgets where it was.
  }
});
</script>

<template>
  <div class="hs-window">
    <eTitlebar
      :section="section"
      :version="version"
      :status="status"
      :connection="connection"
      :locale="locale"
      :locales="locales"
      @section="section = $event"
      @locale="emitAction?.('setLocale', $event)"
      @close="emitAction?.('close')"
    />
    <template v-if="section === 'home'">
      <eSubNav v-model="tab" />
      <div class="hs-body">
        <HsOverview v-if="tab === 'overview'" :overview="overview" :streak-length="streakLength" />
        <HsBattles
          v-else-if="tab === 'battles'"
          :battles="battles"
          :samples="samples"
          @query="emitAction?.('battles', $event)"
          @refresh="emitAction?.('refresh')"
          @samples="emitAction?.('samples', $event)"
        />
        <HsReplays
          v-else-if="tab === 'replays'"
          :replays="replays"
          @action="(op, name) => emitAction?.('replays', { op, name })"
        />
        <HsCharts v-else-if="tab === 'charts'" :charts="charts" />
        <!-- Mounted only while open: the site runs in its own process. -->
        <HsLabs v-else-if="tab === 'labs'" />
        <HsTags
          v-else-if="tab === 'tags'"
          :tags="tags"
          @action="(name, payload) => emitAction?.(name, payload)"
        />
        <!-- Tabs the nav already offers and the plugin does not fill yet. -->
        <eComingSoon v-else :key="tab" :tab="tab" />
      </div>
    </template>
    <div v-else-if="section === 'account'" class="hs-body">
      <HsAccount
        :account="account"
        :overview="overview"
        @action="(name, payload) => emitAction?.(name, payload)"
      />
    </div>
    <eTooltip />
  </div>
</template>

<style scoped>
.hs-window {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  user-select: none;
  -webkit-user-select: none;
  backdrop-filter: blur(35px);
  -webkit-backdrop-filter: blur(35px);
}

.hs-body {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-5);
  padding: var(--space-4) 0;
  box-sizing: border-box;
  overflow-y: auto;
  background: var(--black-1-a);
}

.hs-window :deep(*)::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

.hs-window :deep(*)::-webkit-scrollbar-track {
  background: transparent;
}

.hs-window :deep(*)::-webkit-scrollbar-thumb {
  background-color: hsla(0, 0%, 100%, 0.15);
  border-radius: 4px;
  border-left: 4px solid transparent;
  background-clip: padding-box;
}

.hs-window :deep(*)::-webkit-scrollbar-thumb:hover {
  background-color: hsla(0, 0%, 100%, 0.25);
}
</style>
