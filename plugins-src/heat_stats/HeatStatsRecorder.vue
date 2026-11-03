<script setup lang="ts">
import { computed, onBeforeUnmount, provide, ref, watch } from "vue";
import { AnimatePresence, motion } from "motion-v";
import { Dynamics } from "fuse_ui/ui/dynamics.mjs";
import "fuse_ui/ui/tokens.css";
import eStatus from "./ui/eStatus.vue";
import { I18N, createI18n } from "./ui/i18n.mjs";

const props = defineProps<{
  data: Record<string, unknown>;
  assetBase?: string;
}>();

const str = (key: string, fallback: string): string => {
  const v = props.data?.[key];
  return typeof v === "string" && v ? v : fallback;
};

const locale = computed(() => str("locale", "en"));

// Built once and used here as well as handed down: a component cannot inject what it provides.
const i18n = createI18n({
  get locale() {
    return locale.value;
  },
  get messages() {
    return (props.data?.messages as Record<string, string> | undefined) ?? {};
  },
});

provide(I18N, i18n);

const { t } = i18n;

const phase = computed(() => str("phase", "idle"));

const placing = computed(() => props.data?.isSetupComplete === false);

const state = computed(() => {
  if (placing.value) return "submitting";
  if (phase.value === "recording") return "recording";
  return phase.value === "summarizing" || phase.value === "finalizing" ? "submitting" : "idle";
});

const label = computed(() => (placing.value ? t("recorder.placing") : t(`recorder.${phase.value}`)));

const since = ref(0);
const now = ref(Date.now());
let ticker: number | null = null;

function stopTicker(): void {
  if (ticker !== null) window.clearInterval(ticker);
  ticker = null;
}

watch(
  () => phase.value === "recording",
  (live) => {
    stopTicker();
    if (!live) return;
    since.value = Date.now();
    now.value = since.value;
    ticker = window.setInterval(() => (now.value = Date.now()), 1000);
  },
  { immediate: true },
);

onBeforeUnmount(stopTicker);

const elapsed = computed(() => {
  if (phase.value !== "recording" || !since.value) return "";
  const s = Math.max(0, Math.floor((now.value - since.value) / 1000));
  const pad = (v: number) => String(v).padStart(2, "0");
  return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
});
</script>

<template>
  <motion.div
    class="recorder"
    :initial="{ opacity: 0, y: 4 }"
    :animate="{ opacity: 1, y: 0 }"
    :transition="Dynamics.quick"
  >
    <span class="seg seg-mark" aria-hidden="true">
      <i class="wedge flip" />
      <i class="wedge" />
    </span>

    <span class="seg seg-status">
      <eStatus :state="state" :label="label" />
    </span>

    <AnimatePresence :initial="false">
      <motion.span
        v-if="elapsed"
        key="elapsed"
        class="seg seg-elapsed"
        :initial="{ opacity: 0, width: 0 }"
        :animate="{ opacity: 1, width: 'auto' }"
        :exit="{ opacity: 0, width: 0 }"
        :transition="Dynamics.snappy"
      >
        {{ elapsed }}
      </motion.span>
    </AnimatePresence>
  </motion.div>
</template>

<style scoped>
.recorder {
  display: inline-flex;
  align-items: stretch;
  max-width: 100%;
  height: 28px;
  box-sizing: border-box;
  overflow: hidden;
  white-space: nowrap;
  background: var(--black-1-a);
  backdrop-filter: blur(10px);
  border: 1px solid var(--base-600);
  corner-shape: bevel;
  border-radius: 6px 0 6px 0;
  user-select: none;
  -webkit-user-select: none;
}

.seg {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: 0 var(--space-2);
  min-width: 0;
}

.seg + .seg {
  border-left: 1px solid var(--base-600);
}

.seg-mark {
  flex: none;
  gap: 0;
}

.wedge {
  width: 9px;
  height: 9px;
  background: var(--accent-200);
  clip-path: polygon(0 100%, 50% 100%, 100% 50%, 50% 50%, 50% 0, 0 50%);
}

.wedge.flip {
  transform: rotate(180deg);
}

.seg-status {
  flex: 1 1 auto;
  min-width: 0;
  padding: 0 var(--space-1);
}

.seg-elapsed {
  flex: none;
  overflow: hidden;
  font-family: var(--font-microcopy);
  font-size: var(--secondary-font-size-4);
  line-height: 1;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}
</style>
