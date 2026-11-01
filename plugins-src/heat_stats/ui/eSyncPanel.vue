<script lang="ts">
/** The store's tallies, exactly as the plugin pushes them. */
export interface SyncCounts {
  total: number;
  pending: number;
  uploaded: number;
  rejected: number;
}

/** `SyncProgress` from sync.ts; `phase` and `direction` widen crossing the bridge. */
export interface SyncProgressView {
  phase: string;
  direction: string | null;
  done: number;
  total: number | null;
  remote: number | null;
  message: string | null;
}
</script>

<script setup lang="ts">
import { computed } from "vue";
import { motion } from "motion-v";
import { Dynamics } from "fuse_ui/ui/dynamics.mjs";
import eButton from "fuse_ui/ui/eButton.vue";
import Icons from "fuse_ui/ui/Icons.vue";
import eStatColumn from "./eStatColumn.vue";
import eStatus from "./eStatus.vue";
import { useI18n } from "./i18n.mjs";

const props = defineProps<{
  cloud: number;
  counts: SyncCounts | null;
  sync: SyncProgressView | null;
  busy: boolean;
}>();

const emit = defineEmits<{ retry: [] }>();

const { t, n } = useI18n();

const phase = computed(() => props.sync?.phase ?? "idle");
const working = computed(() => phase.value === "syncing" || phase.value === "uploading");
const bad = computed(() => phase.value === "offline" || phase.value === "error");

const statusState = computed(() => {
  if (working.value || phase.value === "checking") return "syncing";
  return bad.value ? "offline" : "online";
});

const statusLabel = computed(() => {
  switch (phase.value) {
    case "syncing":
      return t("account.connSyncing");
    case "uploading":
      return t("account.connUploading");
    case "checking":
      return t("account.connChecking");
    case "offline":
    case "error":
      return t("account.connOffline");
    default:
      return t("account.connOnline");
  }
});

const count = (v: number | undefined): string => n(v ?? 0, { maximumFractionDigits: 0 });

// The service's own count once a check has run; the mirror's until then.
const columns = computed(() => [
  { id: "cloud", label: t("account.cloudBattles"), value: count(props.sync?.remote ?? props.cloud), accent: true },
  { id: "local", label: t("account.onThisPC"), value: count(props.counts?.total), accent: false },
  { id: "pending", label: t("account.syncPending"), value: count(props.counts?.pending), accent: false },
]);

/** Determinate only when the run knows its own size; otherwise the bar sweeps. */
const ratio = computed(() => {
  const s = props.sync;
  if (!s || !working.value || !s.total) return 0;
  return Math.min(Math.max(s.done / s.total, 0), 1);
});

const sweeping = computed(() => phase.value === "checking" || (working.value && !props.sync?.total));

const detail = computed(() => {
  const s = props.sync;
  if (!s) return t("account.syncUpToDate");
  const params = { done: count(s.done), total: count(s.total ?? 0) };
  if (phase.value === "syncing") return t("account.syncRunning", params);
  if (phase.value === "uploading") return t("account.uploadRunning", params);
  if (phase.value === "checking") return t("account.syncChecking");
  if (bad.value) return s.message || t("account.syncOffline");
  return t("account.syncUpToDate");
});
</script>

<template>
  <section class="module">
    <div class="surface" />

    <header class="head">
      <div class="head-surface" />
      <h3 class="title">{{ t("account.syncTitle") }}</h3>
      <eStatus :state="statusState" :label="statusLabel" />
    </header>

    <div class="body">
      <div class="strip">
        <div class="strip-surface" />
        <eStatColumn
          v-for="c in columns"
          :key="c.id"
          :label="c.label"
          :value="c.value"
          :class="{ lead: c.accent }"
        />
      </div>

      <div class="progress">
        <div class="track" :class="{ bad }">
          <motion.div
            v-if="!sweeping"
            class="fill"
            :initial="false"
            :animate="{ scaleX: ratio, opacity: working ? 1 : 0 }"
            :transition="Dynamics.quick"
          />
          <div v-else class="sweep" />
        </div>
        <div class="detail-row">
          <Icons
            v-if="sync?.direction"
            :kind="sync.direction === 'up' ? 'arrow-up' : 'arrow-down'"
            size="small"
            :color="bad ? 'var(--error-highlight)' : 'var(--accent-200)'"
          />
          <span class="detail" :class="{ bad }">{{ detail }}</span>
        </div>
      </div>

      <div v-if="counts && counts.rejected" class="refused">
        <Icons kind="warning" size="normal" color="var(--error-highlight)" />
        <span class="refused-text">{{ t("account.refusedCount", { count: count(counts.rejected) }) }}</span>
        <eButton variant="ghost" :text="t('account.retryRejected')" :disabled="busy" @click="emit('retry')" />
      </div>
    </div>
  </section>
</template>

<style scoped>
.module {
  position: relative;
  flex: none;
  width: 100%;
  display: flex;
  flex-direction: column;
  padding: 0 var(--space-3) var(--space-3);
  box-sizing: border-box;
  background: var(--black-2-a);
}

.surface {
  position: absolute;
  inset: 0;
  box-sizing: border-box;
  background: var(--black-1-a);
  border: 1px solid var(--base-600);
  corner-shape: bevel;
  border-radius: 6px 0 6px 0;
  pointer-events: none;
}

.head {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  height: 46px;
  margin-bottom: var(--space-3);
}

.head-surface {
  position: absolute;
  top: 0;
  left: calc(-1 * var(--space-3));
  right: calc(-1 * var(--space-3));
  height: 100%;
  box-sizing: border-box;
  background: var(--black-3-a);
  border: 1px solid var(--base-600);
  border-bottom: none;
  corner-shape: bevel;
  border-radius: 6px 0 0 0;
  pointer-events: none;
}

.head > * {
  position: relative;
}

.title {
  margin: 0;
  font-family: var(--font-primary);
  font-size: var(--main-font-size-2);
  font-weight: var(--font-weight-2);
  line-height: normal;
  color: var(--text-main);
  text-transform: uppercase;
  white-space: nowrap;
}

.body {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.strip {
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;
  overflow: hidden;
}

.strip-surface {
  position: absolute;
  inset: 0 0 0 1px;
  box-sizing: border-box;
  background: var(--black-1-a);
  border: 1px solid var(--base-600);
  corner-shape: bevel;
  border-radius: 6px 0 6px 0;
  pointer-events: none;
}

.strip :deep(.lead .value) {
  color: var(--accent-200);
}

.progress {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.track {
  position: relative;
  width: 100%;
  height: 4px;
  background: var(--base-600);
  overflow: hidden;
}

.track.bad {
  background: var(--error-color);
}

.fill {
  width: 100%;
  height: 100%;
  transform-origin: left center;
  background: var(--accent-200);
}

.sweep {
  position: absolute;
  inset: 0 auto 0 0;
  width: 30%;
  background: var(--accent-600);
  animation: sweep 1.1s ease-in-out infinite;
}

@keyframes sweep {
  from {
    transform: translateX(-100%);
  }
  to {
    transform: translateX(433%);
  }
}

.detail-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.detail {
  font-family: var(--font-microcopy);
  font-size: var(--secondary-font-size-4);
  line-height: 1.3;
  color: var(--text-muted);
}

.detail.bad {
  color: var(--error-highlight);
}

.refused {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-3);
  box-sizing: border-box;
  background-color: var(--error-color);
  background-image: repeating-linear-gradient(135deg, rgba(255, 255, 255, 0.035) 0 1px, transparent 1px 8px);
  corner-shape: bevel;
  border-radius: 6px 0 6px 0;
}

.refused-text {
  flex: 1 0 0;
  min-width: 0;
  font-family: var(--font-microcopy);
  font-size: var(--secondary-font-size-4);
  line-height: 1.3;
  color: var(--error-highlight);
}

.refused :deep(.stage-button) {
  flex: none;
  width: auto;
  min-width: 140px;
}

@media (prefers-reduced-motion: reduce) {
  .sweep {
    animation: none;
    width: 100%;
    opacity: 0.4;
  }
}
</style>
