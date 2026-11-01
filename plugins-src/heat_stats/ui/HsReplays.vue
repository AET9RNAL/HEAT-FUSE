<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { AnimatePresence, motion } from "motion-v";
import { Dynamics } from "fuse_ui/ui/dynamics.mjs";
import Icons from "fuse_ui/ui/Icons.vue";
import eSelect from "fuse_ui/ui/eSelect.vue";
import ePagination from "./ePagination.vue";
import eReplay, { type ReplayView } from "./eReplay.vue";
import { useI18n } from "./i18n.mjs";

interface ReplaysPage {
  state: "ready" | "loading" | "noAccess";
  canKeep: boolean;
  canPlay: boolean;
  notice: string | null;
  rows: ReplayView[];
}

const props = defineProps<{ replays: object | null }>();

const emit = defineEmits<{ action: [op: string, name?: string] }>();

const { t, n } = useI18n();

const page = computed(() => props.replays as ReplaysPage | null);
const rows = computed(() => page.value?.rows ?? []);
const busy = computed(() => rows.value.some((r) => r.playing));

const PAGE_SIZES = [5, 10, 20, 50];
const sizes = PAGE_SIZES.map((s) => ({ value: s, label: String(s) }));
const pageSize = ref(10);
const current = ref(0);

watch(pageSize, () => (current.value = 0));

// A removed copy can empty the last page.
const shownPage = computed(() => Math.min(current.value, Math.max(0, Math.ceil(rows.value.length / pageSize.value) - 1)));
const first = computed(() => shownPage.value * pageSize.value);
const paged = computed(() => rows.value.slice(first.value, first.value + pageSize.value));

// The game writes a replay at the end of each battle, so the list is read again each time the tab opens.
onMounted(() => emit("action", "scan"));

const message = computed(() => {
  const p = page.value;
  if (!p || p.state === "loading") return t("replays.loading");
  if (p.state === "noAccess") return t("replays.noAccess");
  return rows.value.length ? "" : t("replays.empty");
});
</script>

<template>
  <div class="replays">
    <section class="module">
      <div class="module-surface" />

      <header class="module-head">
        <div class="module-head-surface" />
        <span class="head-copy">
          <span class="seal" aria-hidden="true"><i class="wedge flip" /><i class="wedge" /></span>
          <h3 class="module-title">{{ t("replays.title") }}</h3>
        </span>
        <span class="head-aside">
          <span class="module-note">{{ t("replays.counted", { count: n(rows.length) }) }}</span>
          <span class="size">
            <eSelect :model-value="pageSize" :options="sizes" @update:model-value="pageSize = Number($event)" />
          </span>
          <button type="button" class="refresh" :aria-label="t('replays.refresh')" @click="emit('action', 'scan')">
            <Icons kind="reload" size="small" color="currentColor" />
          </button>
        </span>
      </header>

      <!-- What the tab is for, and the one limit that makes Keep worth pressing. -->
      <p class="lead">
        {{ busy ? t("replays.controls") : t("replays.lead") }}
      </p>

      <AnimatePresence :initial="false">
        <motion.p
          v-if="page?.notice"
          :key="page.notice"
          class="notice"
          :initial="{ opacity: 0, y: -4 }"
          :animate="{ opacity: 1, y: 0 }"
          :exit="{ opacity: 0 }"
          :transition="Dynamics.quick"
        >
          <Icons kind="warning" size="small" color="var(--warning-color)" />
          {{ t(page.notice) }}
        </motion.p>
      </AnimatePresence>

      <p v-if="page?.state === 'ready' && rows.length && !page.canPlay" class="hint">{{ t("replays.noPlay") }}</p>

      <p v-if="message" class="empty">{{ message }}</p>

      <div v-else class="rows">
        <AnimatePresence mode="popLayout">
          <motion.div
            v-for="(r, i) in paged"
            :key="r.name"
            class="row"
            :initial="{ opacity: 0, x: 10 }"
            :animate="{ opacity: 1, x: 0 }"
            :exit="{ opacity: 0 }"
            :transition="{ ...Dynamics.snappy, delay: i * 0.02 }"
          >
            <eReplay
              :replay="r"
              :can-keep="page?.canKeep ?? false"
              :can-play="page?.canPlay ?? false"
              :busy="busy && !r.playing"
              @action="emit('action', $event, r.name)"
            />
          </motion.div>
        </AnimatePresence>
      </div>

      <ePagination
        v-if="rows.length > pageSize"
        :page="shownPage"
        :page-size="pageSize"
        :total="rows.length"
        @page="current = $event"
      />
    </section>
  </div>
</template>

<style scoped>
.replays {
  position: relative;
  display: flex;
  width: 100%;
  padding: 0 var(--space-4);
  box-sizing: border-box;
}

.module {
  position: relative;
  width: 100%;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: 0 var(--space-3) var(--space-3);
  box-sizing: border-box;
  background: var(--black-2-a);
}

.module-surface {
  position: absolute;
  inset: 0;
  box-sizing: border-box;
  background: var(--black-1-a);
  border: 1px solid var(--base-600);
  corner-shape: bevel;
  border-radius: 6px 0 6px 0;
  pointer-events: none;
}

.module-head {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  height: 46px;
  margin-bottom: var(--space-1);
}

.module-head-surface {
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

.head-copy,
.head-aside {
  position: relative;
  display: flex;
  align-items: center;
  min-width: 0;
  gap: var(--space-2);
}

.head-aside {
  flex: none;
  gap: var(--space-3);
}

.seal {
  flex: none;
  display: flex;
  align-items: center;
  height: 10px;
}

.wedge {
  width: 10px;
  height: 10px;
  background: var(--base-600);
  clip-path: polygon(0 100%, 50% 100%, 100% 50%, 50% 50%, 50% 0, 0 50%);
}

.wedge.flip {
  transform: rotate(180deg);
}

.module-title {
  margin: 0;
  font-family: var(--font-primary);
  font-size: var(--main-font-size-2);
  font-weight: var(--font-weight-2);
  line-height: normal;
  color: var(--text-main);
  text-transform: uppercase;
  white-space: nowrap;
}

.module-note {
  font-family: var(--font-microcopy);
  font-size: var(--secondary-font-size-4);
  color: var(--text-muted);
  white-space: nowrap;
}

.size {
  width: 4.5em;
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

.lead,
.hint,
.notice {
  position: relative;
  margin: 0;
  font-family: var(--font-microcopy);
  font-size: var(--secondary-font-size-4);
  line-height: 1.4;
  color: var(--text-muted);
}

.hint {
  color: var(--warning-color);
}

.notice {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--text-main);
}

.empty {
  position: relative;
  margin: 0;
  padding: var(--space-6) 0;
  font-family: var(--font-primary);
  font-size: var(--main-font-size-3);
  color: var(--text-muted);
  text-align: center;
}

.rows {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
</style>
