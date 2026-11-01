<script setup lang="ts">
import { computed } from "vue";
import { motion } from "motion-v";
import { Dynamics } from "fuse_ui/ui/dynamics.mjs";
import { useAssets } from "./assets.mjs";
import { useI18n } from "./i18n.mjs";

interface Vehicle {
  key: string;
  name: string;
  battles: number;
  kd: number;
  damage: number;
}

const props = defineProps<{ vehicles: Vehicle[] | null }>();

const { t, n, fixed, compact } = useI18n();
const assets = useAssets();

const TOP = 3;

const rows = computed(() => (props.vehicles ?? []).slice(0, TOP));

const most = computed(() => Math.max(1, ...rows.value.map((r) => r.battles)));
</script>

<template>
  <section class="module">
    <div class="surface" />

    <header class="head">
      <div class="head-surface" />
      <h3 class="title">{{ t("account.topVehicles") }}</h3>
    </header>

    <p v-if="!rows.length" class="empty">{{ t("account.noVehicles") }}</p>

    <ol v-else class="list">
      <motion.li
        v-for="(v, i) in rows"
        :key="v.key"
        class="row"
        :initial="{ opacity: 0, x: -8 }"
        :animate="{ opacity: 1, x: 0 }"
        :transition="{ ...Dynamics.smooth, delay: i * 0.06 }"
      >
        <span class="rank">{{ i + 1 }}</span>

        <span class="art">
          <span class="art-surface" />
          <img v-if="assets.tank(v.key)" class="render" :src="assets.tank(v.key)" :alt="v.name" />
        </span>

        <span class="body">
          <span class="line">
            <span class="name">{{ v.name || "—" }}</span>
            <span class="battles">
              {{ n(v.battles, { maximumFractionDigits: 0 }) }}
              <span class="unit">{{ t("account.btl") }}</span>
            </span>
          </span>

          <span class="bar">
            <motion.span
              class="bar-fill"
              :initial="{ scaleX: 0 }"
              :animate="{ scaleX: v.battles / most }"
              :transition="{ ...Dynamics.smooth, delay: 0.1 + i * 0.06 }"
            />
          </span>

          <span class="line minor">
            <span>{{ t("performance.kd") }} <b>{{ fixed(v.kd, 2) }}</b></span>
            <span>{{ t("performance.damage") }} <b>{{ compact(v.damage) }}</b></span>
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

.row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2);
  box-sizing: border-box;
  background: var(--black-3-a);
  corner-shape: bevel;
  border-radius: 6px 0 6px 0;
}

.rank {
  flex: none;
  width: 16px;
  text-align: center;
  font-family: var(--font-microcopy);
  font-size: var(--main-font-size-2);
  font-weight: var(--font-weight-1);
  line-height: 1;
  color: var(--base-600);
}

.art {
  position: relative;
  flex: none;
  width: 104px;
  height: 52px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.art-surface {
  position: absolute;
  inset: 0;
  box-sizing: border-box;
  background: var(--black-1-a);
  border: 1px solid var(--base-600);
  corner-shape: bevel;
  border-radius: 6px 0 6px 0;
  pointer-events: none;
}

.render {
  position: relative;
  max-width: 96%;
  max-height: 96%;
  object-fit: contain;
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

.bar {
  display: block;
  width: 100%;
  height: 3px;
  background: var(--base-600);
  overflow: hidden;
}

.bar-fill {
  display: block;
  width: 100%;
  height: 100%;
  transform-origin: left center;
  background: var(--accent-200);
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
