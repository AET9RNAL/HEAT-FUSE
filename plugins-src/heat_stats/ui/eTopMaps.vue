<script setup lang="ts">
import { computed } from "vue";
import { motion } from "motion-v";
import { Dynamics } from "fuse_ui/ui/dynamics.mjs";
import { useAssets } from "./assets.mjs";
import { useI18n } from "./i18n.mjs";

interface MapRow {
  key: string;
  name: string;
  battles: number;
  kd: number;
  winRate: number;
}

const props = defineProps<{ maps: MapRow[] | null }>();

const { t, n, fixed, percent } = useI18n();
const assets = useAssets();

const TOP = 3;

const rows = computed(() => (props.maps ?? []).slice(0, TOP).map((m) => ({ ...m, art: assets.map(m.key) })));
</script>

<template>
  <section class="module">
    <div class="surface" />

    <header class="head">
      <div class="head-surface" />
      <h3 class="title">{{ t("account.topMaps") }}</h3>
    </header>

    <p v-if="!rows.length" class="empty">{{ t("account.noMaps") }}</p>

    <ol v-else class="list">
      <motion.li
        v-for="(m, i) in rows"
        :key="m.key"
        class="map"
        :class="{ lead: i === 0 }"
        :initial="{ opacity: 0, x: -8 }"
        :animate="{ opacity: 1, x: 0 }"
        :transition="{ ...Dynamics.smooth, delay: i * 0.06 }"
      >
        <span
          class="art"
          :class="{ photo: m.art }"
          :style="{ backgroundImage: `url('${m.art || assets.logo()}')` }"
        />
        <span class="scrim" />

        <span class="body">
          <span class="line">
            <span class="name">{{ m.name || "—" }}</span>
            <span v-if="i === 0" class="badge">{{ t("account.bestMap") }}</span>
          </span>

          <span class="line minor">
            <span>
              {{ n(m.battles, { maximumFractionDigits: 0 }) }}
              <span class="unit">{{ t("account.btl") }}</span>
            </span>
            <span>{{ t("performance.winRate") }} <b>{{ percent(m.winRate, 0) }}</b></span>
            <span>{{ t("performance.kd") }} <b>{{ fixed(m.kd, 2) }}</b></span>
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

/* A banner: the picture's place, whatever ends up in it. */
.map {
  position: relative;
  display: flex;
  align-items: flex-end;
  min-height: 68px;
  padding: var(--space-2);
  box-sizing: border-box;
  background: var(--black-3-a);
  border: 1px solid var(--base-600);
  corner-shape: bevel;
  border-radius: 6px 0 6px 0;
  overflow: hidden;
}

.art {
  position: absolute;
  inset: 0;
  background-repeat: repeat;
  background-size: 32px auto;
  opacity: 0.06;
  pointer-events: none;
}

.art.photo {
  background-repeat: no-repeat;
  background-size: cover;
  background-position: center 40%;
  opacity: 0.5;
}

.lead .art.photo {
  opacity: 0.75;
}

.scrim {
  position: absolute;
  inset: 0;
  background: linear-gradient(to top, var(--black-1) 0%, rgba(0, 0, 0, 0.35) 55%, transparent 100%);
  pointer-events: none;
}

.body {
  position: relative;
  flex: 1 0 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.line {
  display: flex;
  align-items: center;
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

.lead .name {
  color: var(--accent-200);
}

.badge {
  flex: none;
  padding: 0 var(--space-1);
  font-family: var(--font-microcopy);
  font-size: var(--secondary-font-size-5);
  font-weight: var(--font-weight-3);
  line-height: 16px;
  letter-spacing: 0.08em;
  color: var(--base-1000);
  background: var(--accent-200);
  text-transform: uppercase;
  white-space: nowrap;
  corner-shape: bevel;
  border-radius: 4px 0 4px 0;
}

.line.minor {
  justify-content: space-between;
  font-family: var(--font-microcopy);
  font-size: var(--secondary-font-size-5);
  color: var(--text-muted);
  text-transform: uppercase;
}

.line.minor b {
  font-weight: var(--font-weight-3);
  color: var(--text-main);
}

.unit {
  color: var(--text-muted);
}

.line.minor > span:first-child {
  color: var(--text-main);
  font-size: var(--secondary-font-size-4);
}
</style>
