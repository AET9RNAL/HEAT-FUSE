<script setup lang="ts">
import { computed } from "vue";
import { motion } from "motion-v";
import { Dynamics } from "fuse_ui/ui/dynamics.mjs";
import { useAssets } from "./assets.mjs";
import { useI18n } from "./i18n.mjs";

interface Agent {
  key: string;
  name: string;
  battles: number;
  kd: number;
  winRate: number;
}

const props = defineProps<{ agents: Agent[] | null }>();

const { t, n, fixed, percent } = useI18n();
const assets = useAssets();

const TOP = 4;

const rows = computed(() =>
  (props.agents ?? [])
    .filter((a) => a.name)
    .slice(0, TOP)
    .map((a) => ({ ...a, portrait: assets.agent(a.name) })),
);
</script>

<template>
  <section class="module">
    <div class="surface" />

    <header class="head">
      <div class="head-surface" />
      <h3 class="title">{{ t("account.topAgents") }}</h3>
    </header>

    <p v-if="!rows.length" class="empty">{{ t("account.noAgents") }}</p>

    <ol v-else class="list">
      <motion.li
        v-for="(a, i) in rows"
        :key="a.key"
        class="agent"
        :class="{ lead: i === 0 }"
        :initial="{ opacity: 0, x: -8 }"
        :animate="{ opacity: 1, x: 0 }"
        :transition="{ ...Dynamics.smooth, delay: i * 0.06 }"
      >
        <span class="portrait">
          <span class="portrait-surface" />
          <img v-if="a.portrait" class="face" :src="a.portrait" :alt="a.name" />
        </span>

        <span class="body">
          <span class="line">
            <span class="name">{{ a.name }}</span>
            <span class="battles">
              {{ n(a.battles, { maximumFractionDigits: 0 }) }}
              <span class="unit">{{ t("account.btl") }}</span>
            </span>
          </span>
          <span class="line minor">
            <span>{{ t("performance.kd") }} <b>{{ fixed(a.kd, 2) }}</b></span>
            <span>{{ t("performance.winRate") }} <b>{{ percent(a.winRate, 0) }}</b></span>
          </span>
        </span>
      </motion.li>
    </ol>
  </section>
</template>

<style scoped>
.module {
  position: relative;
  flex: 1 0 0;
  min-width: 0;
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

.title {
  position: relative;
  margin: 0;
  font-family: var(--font-primary);
  font-size: var(--main-font-size-2);
  font-weight: var(--font-weight-2);
  line-height: normal;
  color: var(--text-main);
  text-transform: uppercase;
  white-space: nowrap;
}

.empty {
  position: relative;
  margin: 0;
  font-family: var(--font-microcopy);
  font-size: var(--secondary-font-size-4);
  line-height: 1.3;
  color: var(--text-muted);
}

.list {
  position: relative;
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.agent {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2);
  box-sizing: border-box;
  background: var(--black-3-a);
  corner-shape: bevel;
  border-radius: 6px 0 6px 0;
}

/* The portraits are 50x60, so the slot is their own size and nothing is blown up. */
.portrait {
  position: relative;
  flex: none;
  width: 50px;
  height: 52px;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  overflow: hidden;
}

.portrait-surface {
  position: absolute;
  inset: 0;
  box-sizing: border-box;
  background: var(--black-1-a);
  border: 1px solid var(--base-600);
  corner-shape: bevel;
  border-radius: 6px 0 6px 0;
  pointer-events: none;
}

.face {
  position: relative;
  width: 50px;
  height: 60px;
  object-fit: contain;
  object-position: top center;
  filter: grayscale(1) contrast(1.05);
  opacity: 0.75;
  transition:
    filter 0.2s,
    opacity 0.2s;
}

.body {
  flex: 1 0 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.line {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-2);
  min-width: 0;
}

.lead .face {
  filter: none;
  opacity: 1;
}

.agent:hover .face {
  filter: none;
  opacity: 1;
}

.name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-primary);
  font-size: var(--main-font-size-3);
  font-weight: var(--font-weight-2);
  line-height: normal;
  color: var(--text-main);
  text-transform: uppercase;
}

.lead .name {
  color: var(--accent-200);
}

.battles {
  flex: none;
  font-family: var(--font-microcopy);
  font-size: var(--secondary-font-size-3);
  color: var(--text-main);
  white-space: nowrap;
}

.unit {
  font-size: var(--secondary-font-size-5);
  color: var(--text-muted);
}

.line.minor {
  font-family: var(--font-microcopy);
  font-size: var(--secondary-font-size-5);
  color: var(--text-muted);
  text-transform: uppercase;
}

.line.minor b {
  font-weight: var(--font-weight-3);
  color: var(--text-main);
}
</style>
