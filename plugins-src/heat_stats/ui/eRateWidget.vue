<script setup lang="ts">
import { computed } from "vue";
import { AnimatePresence, motion } from "motion-v";
import { Dynamics } from "fuse_ui/ui/dynamics.mjs";
import Icons from "fuse_ui/ui/Icons.vue";
import eCounter from "./eCounter.vue";
import eRateBars from "./eRateBars.vue";
import { useI18n } from "./i18n.mjs";

interface View {
  phase: "waiting" | "live" | "final";
  rate: number | null;
  recent: number | null;
  total: number;
  elapsed: number;
  bars: (number | null)[];
}

const props = defineProps<{
  widget: { id: string; digits: number; pad: number };
  view: Record<string, unknown> | null;
}>();

const { t, fixed } = useI18n();

/** The recent rate this far from the reading's rate shows as a trend */
const TREND = 0.05;
const TWEEN_S = 0.6;

const reading = computed(() => props.view as View | null);
const phase = computed(() => reading.value?.phase ?? "waiting");
const final = computed(() => phase.value === "final");
const waiting = computed(() => phase.value === "waiting");

function padded(text: string, width: number) {
  return { dim: "0".repeat(Math.max(0, width - text.length)), lit: text };
}

function rateText(value: number) {
  const { digits, pad } = props.widget;
  return padded(digits ? fixed(value, digits) : String(Math.max(0, Math.round(value))), pad);
}

const placeholder = computed(() => {
  const { digits, pad } = props.widget;
  return "-".repeat(pad + (digits ? digits + 1 : 0));
});

const totalText = computed(() => padded(String(Math.max(0, Math.round(reading.value?.total ?? 0))), props.widget.pad + 1));

const time = computed(() => {
  const s = Math.max(0, reading.value?.elapsed ?? 0);
  const pad = (v: number) => String(v).padStart(2, "0");
  return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
});

const trend = computed(() => {
  const v = reading.value;
  if (!v || v.rate == null || v.recent == null || v.phase !== "live") return "flat";
  if (v.recent > v.rate * (1 + TREND)) return "up";
  if (v.recent < v.rate * (1 - TREND)) return "down";
  return "flat";
});
</script>

<template>
  <div class="rate-overlay">
    <div class="rate" :class="{ final, waiting }">
      <div class="main">
        <span class="tab"><i>{{ t(`widgets.${widget.id}.tab`) }}</i></span>

        <span class="read">
          <AnimatePresence :initial="false" mode="wait">
            <motion.span
              :key="waiting ? 'waiting' : 'rate'"
              class="label"
              :initial="{ opacity: 0, x: -6 }"
              :animate="{ opacity: 1, x: 0 }"
              :exit="{ opacity: 0, x: 6 }"
              :transition="Dynamics.quick"
            >
              {{ waiting ? t("widgets.waiting") : t(`widgets.${widget.id}.label`) }}
            </motion.span>
          </AnimatePresence>
          <eCounter
            v-if="reading && reading.rate != null"
            v-slot="{ value }"
            class="value"
            :value="reading.rate"
            :duration="TWEEN_S"
          >
            <i>{{ rateText(value).dim }}</i>{{ rateText(value).lit }}
          </eCounter>
          <span v-else class="value"><i>{{ placeholder }}</i></span>
        </span>

        <span class="side">
          <span class="label">{{ t("widgets.recent") }}</span>
          <span class="recent">
            <eCounter
              v-if="reading && reading.recent != null"
              v-slot="{ value }"
              class="recent-value"
              :value="reading.recent"
              :duration="TWEEN_S"
            >
              <i>{{ rateText(value).dim }}</i>{{ rateText(value).lit }}
            </eCounter>
            <span v-else class="recent-value"><i>{{ placeholder }}</i></span>
            <span class="trend" :class="`trend-${trend}`">
              <AnimatePresence :initial="false" mode="wait">
                <motion.span
                  :key="trend"
                  class="trend-icon"
                  :initial="{ opacity: 0, y: trend === 'down' ? -4 : 4 }"
                  :animate="{ opacity: 1, y: 0 }"
                  :exit="{ opacity: 0 }"
                  :transition="Dynamics.snappy"
                >
                  <Icons v-if="trend === 'up'" kind="arrow-up" size="small" color="var(--accent-200)" />
                  <Icons v-else-if="trend === 'down'" kind="arrow-down" size="small" color="var(--error-highlight)" />
                  <i v-else class="dash" />
                </motion.span>
              </AnimatePresence>
            </span>
          </span>
        </span>
        <span class="bracket" aria-hidden="true" />
      </div>

      <eRateBars :bars="reading ? reading.bars : []" :live="phase === 'live'" />

      <div class="readout">
        <span class="cell">
          <span class="cell-label">{{ t(`widgets.${widget.id}.total`) }}</span>
          <span class="cell-value"><i>{{ totalText.dim }}</i>{{ totalText.lit }}</span>
        </span>
        <span class="cell">
          <span class="cell-label">{{ t("widgets.time") }}</span>
          <span class="cell-value">{{ time }}</span>
        </span>
        <AnimatePresence :initial="false">
          <motion.span
            v-if="final"
            key="final"
            class="cell cell-final"
            :initial="{ opacity: 0, x: -6 }"
            :animate="{ opacity: 1, x: 0 }"
            :exit="{ opacity: 0 }"
            :transition="Dynamics.snappy"
          >
            {{ t("widgets.final") }}
          </motion.span>
        </AnimatePresence>
      </div>
    </div>
  </div>
</template>

<style scoped>
.rate-overlay {
  width: 100%;
  height: 100%;
  container-type: inline-size;
  pointer-events: none;
  user-select: none;
  -webkit-user-select: none;
}

.rate {
  --u: calc(100cqw / 240);
  --tone: var(--accent-200);
  display: flex;
  flex-direction: column;
  gap: calc(3 * var(--u));
  width: 100%;
  max-height: 100%;
  overflow: hidden;
  transition: opacity 0.25s;
}

.rate.final {
  --tone: var(--accent-600);
}

.rate.waiting {
  --tone: var(--base-600);
  opacity: 0.5;
}

.main {
  position: relative;
  display: grid;
  grid-template-columns: calc(16 * var(--u)) minmax(0, 1fr) auto;
  align-items: stretch;
  column-gap: calc(8 * var(--u));
  height: calc(46 * var(--u));
  padding-right: calc(12 * var(--u));
  box-sizing: border-box;
  background: color-mix(in srgb, var(--black-2) 85%, transparent);
  border: calc(1 * var(--u)) solid var(--base-600);
  corner-shape: bevel;
  border-radius: calc(6 * var(--u)) 0 calc(6 * var(--u)) 0;
}

.tab {
  display: flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--tone) 18%, transparent);
  border-right: calc(1 * var(--u)) solid color-mix(in srgb, var(--tone) 45%, transparent);
  transition: background 0.25s, border-color 0.25s;
}

.tab i {
  writing-mode: vertical-rl;
  transform: rotate(180deg);
  font-family: var(--font-microcopy);
  font-size: calc(7 * var(--u));
  font-style: normal;
  line-height: 1;
  letter-spacing: 0.14em;
  color: var(--tone);
  transition: color 0.25s;
}

.read,
.side {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: calc(4 * var(--u));
  min-width: 0;
}

.side {
  align-items: flex-end;
}

.label,
.cell-label {
  font-family: var(--font-microcopy);
  font-size: calc(6.5 * var(--u));
  line-height: 1;
  letter-spacing: 0.1em;
  color: var(--text-muted);
  text-transform: uppercase;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.value {
  font-family: var(--font-microcopy);
  font-size: calc(26 * var(--u));
  line-height: 1;
  letter-spacing: -0.02em;
  color: var(--text-main);
  font-variant-numeric: tabular-nums;
}

.value i,
.recent-value i,
.cell-value i {
  font-style: normal;
  color: var(--base-600);
}

.recent {
  display: flex;
  align-items: center;
  gap: calc(5 * var(--u));
}

.recent-value {
  font-family: var(--font-microcopy);
  font-size: calc(14 * var(--u));
  line-height: 1;
  color: var(--text-main);
  font-variant-numeric: tabular-nums;
}

.trend {
  display: flex;
  align-items: center;
  justify-content: center;
  width: calc(14 * var(--u));
  height: calc(14 * var(--u));
  background: color-mix(in srgb, var(--base-200) 8%, transparent);
  corner-shape: bevel;
  border-radius: calc(4 * var(--u)) 0 calc(4 * var(--u)) 0;
  transition: background 0.25s;
}

.trend-up {
  background: color-mix(in srgb, var(--accent-200) 16%, transparent);
}

.trend-down {
  background: color-mix(in srgb, var(--error-highlight) 16%, transparent);
}

.trend-icon {
  display: flex;
  align-items: center;
  justify-content: center;
}

.dash {
  display: block;
  width: calc(6 * var(--u));
  height: calc(1 * var(--u));
  background: var(--base-600);
}

.bracket {
  position: absolute;
  top: calc(3 * var(--u));
  right: calc(3 * var(--u));
  width: calc(5 * var(--u));
  height: calc(5 * var(--u));
  border-top: calc(1 * var(--u)) solid color-mix(in srgb, var(--base-200) 40%, transparent);
  border-right: calc(1 * var(--u)) solid color-mix(in srgb, var(--base-200) 40%, transparent);
}

.readout {
  display: flex;
  align-self: flex-start;
  background: var(--black-1-a);
  border: calc(1 * var(--u)) solid var(--base-600);
  corner-shape: bevel;
  border-radius: 0 0 calc(5 * var(--u)) 0;
}

.cell {
  display: flex;
  align-items: baseline;
  gap: calc(4 * var(--u));
  padding: calc(3 * var(--u)) calc(6 * var(--u));
  border-right: calc(1 * var(--u)) solid var(--base-600);
}

.cell:last-child {
  border-right: none;
}

.cell-value {
  font-family: var(--font-microcopy);
  font-size: calc(9 * var(--u));
  line-height: 1;
  color: var(--text-main);
  font-variant-numeric: tabular-nums;
}

.cell-final {
  align-items: center;
  font-family: var(--font-microcopy);
  font-size: calc(6.5 * var(--u));
  line-height: 1;
  letter-spacing: 0.1em;
  color: var(--accent-600);
  text-transform: uppercase;
  background: color-mix(in srgb, var(--accent-600) 12%, transparent);
}
</style>
