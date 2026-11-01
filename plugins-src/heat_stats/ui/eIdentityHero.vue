<script setup lang="ts">
import { computed } from "vue";
import { motion } from "motion-v";
import { Dynamics } from "fuse_ui/ui/dynamics.mjs";
import Icons from "fuse_ui/ui/Icons.vue";
import eCounter from "./eCounter.vue";
import { useAssets } from "./assets.mjs";
import { useI18n } from "./i18n.mjs";

interface Totals {
  battles: number;
  winRate: number;
  kd: number;
}

const props = defineProps<{
  username: string | null;
  email: string | null;
  totals: Totals | null;
  vehicleKey: string | null;
  guest?: boolean;
}>();

const { t, n, fixed, percent } = useI18n();
const assets = useAssets();

/** Five, so the shape of a 1-5 rating is visible before there is one. */
const RATING_SLOTS = 5;

const displayName = computed(() => {
  if (props.guest) return t("account.thisPc");
  return props.username || (props.email ?? "").split("@")[0] || "—";
});
const backdrop = computed(() => assets.tank(props.vehicleKey));

const headline = computed(() => [
  {
    id: "battles",
    label: t("overview.battles"),
    value: props.totals?.battles ?? 0,
    format: (v: number) => n(Math.round(v), { maximumFractionDigits: 0 }),
  },
  {
    id: "winRate",
    label: t("overview.winRate"),
    value: props.totals?.winRate ?? 0,
    format: (v: number) => percent(v, 1),
  },
  {
    id: "kd",
    label: t("overview.kd"),
    value: props.totals?.kd ?? 0,
    format: (v: number) => fixed(v, 2),
  },
]);
</script>

<template>
  <section class="hero">
    <div class="surface" />
    <img v-if="backdrop" class="media" :src="backdrop" alt="" />
    <div class="hatch" :style="{ backgroundImage: `url('${assets.logo()}')` }" />

    <div class="identity">
      <div class="avatar">
        <div class="avatar-surface" />
        <Icons kind="user" size="xlarge" color="var(--base-600)" />
        <span v-if="!guest" class="soon">{{ t("account.soon") }}</span>
      </div>

      <div class="who">
        <div class="line">
          <h2 class="name">{{ displayName }}</h2>
          <div v-if="!guest" class="rating">
            <span v-for="i in RATING_SLOTS" :key="i" class="pip" />
            <span class="soon inline">{{ t("account.soon") }}</span>
          </div>
        </div>

        <span v-if="guest" class="email muted">{{ t("account.thisPcBody") }}</span>
        <template v-else>
          <span class="email">{{ email }}</span>
          <div class="bio">
            <span class="bio-text">{{ t("account.bioEmpty") }}</span>
            <span class="soon inline">{{ t("account.soon") }}</span>
          </div>
        </template>
      </div>
    </div>

    <dl class="headline">
      <motion.div
        v-for="(stat, i) in headline"
        :key="stat.id"
        class="stat"
        :initial="{ opacity: 0, y: 8 }"
        :animate="{ opacity: 1, y: 0 }"
        :transition="{ ...Dynamics.smooth, delay: i * 0.06 }"
      >
        <dt class="stat-value"><eCounter :value="stat.value" :format="stat.format" :delay="i * 0.06" /></dt>
        <dd class="stat-label">{{ stat.label }}</dd>
      </motion.div>
    </dl>
  </section>
</template>

<style scoped>
.hero {
  position: relative;
  flex: none;
  width: 100%;
  min-height: 168px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-5);
  padding: var(--space-4);
  box-sizing: border-box;
  background: var(--black-2-a);
  overflow: hidden;
  corner-shape: bevel;
  border-radius: 12px 0 12px 0;
}

.surface {
  position: absolute;
  inset: 0;
  box-sizing: border-box;
  background: var(--black-1-a);
  border: 1px solid var(--base-600);
  corner-shape: bevel;
  border-radius: 12px 0 12px 0;
  pointer-events: none;
}

.media {
  position: absolute;
  top: 50%;
  right: -4%;
  height: 150%;
  width: auto;
  transform: translateY(-50%);
  object-fit: contain;
  opacity: 0.22;
  mask-image: linear-gradient(to left, rgb(0 0 0) 0%, rgb(0 0 0) 30%, transparent 78%);
  pointer-events: none;
  user-select: none;
}

.hatch {
  position: absolute;
  inset: 0;
  background-repeat: repeat;
  background-size: 48px auto;
  opacity: 0.03;
  pointer-events: none;
}

.identity {
  position: relative;
  flex: 1 0 0;
  min-width: 0;
  display: flex;
  align-items: flex-start;
  gap: var(--space-4);
}

.avatar {
  position: relative;
  flex: none;
  width: 96px;
  height: 96px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.avatar-surface {
  position: absolute;
  inset: 0;
  box-sizing: border-box;
  background: var(--black-3-a);
  border: 1px dashed var(--base-600);
  corner-shape: bevel;
  border-radius: 8px 0 8px 0;
  pointer-events: none;
}

.who {
  flex: 1 0 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.line {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-width: 0;
}

.name {
  margin: 0;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-primary);
  font-size: var(--main-font-size-1);
  font-weight: var(--font-weight-2);
  line-height: 1;
  color: var(--text-main);
  text-transform: uppercase;
}

.rating {
  flex: none;
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.pip {
  width: 8px;
  height: 8px;
  background: transparent;
  border: 1px solid var(--base-600);
  transform: rotate(45deg);
}

.email {
  font-family: var(--font-microcopy);
  font-size: var(--secondary-font-size-4);
  line-height: normal;
  color: var(--accent-200);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.email.muted {
  color: var(--text-muted);
  white-space: normal;
  max-width: 420px;
  line-height: 1.4;
}

.bio {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  max-width: 480px;
  min-height: 32px;
  padding: var(--space-2);
  box-sizing: border-box;
  background: var(--black-3-a);
  border: 1px dashed var(--base-600);
  corner-shape: bevel;
  border-radius: 6px 0 6px 0;
}

.bio-text {
  flex: 1 0 0;
  min-width: 0;
  font-family: var(--font-microcopy);
  font-size: var(--secondary-font-size-4);
  line-height: 1.3;
  color: var(--text-muted);
}

.soon {
  font-family: var(--font-microcopy);
  font-size: var(--secondary-font-size-5);
  line-height: 1;
  letter-spacing: 0.08em;
  color: var(--base-600);
  white-space: nowrap;
}

.avatar .soon {
  position: absolute;
  bottom: var(--space-1);
}

.soon.inline {
  flex: none;
}

.headline {
  position: relative;
  flex: none;
  display: flex;
  align-items: flex-start;
  gap: var(--space-7);
  margin: 0;
  padding-right: var(--space-3);
}

.stat {
  display: flex;
  flex-direction: column;
  gap: var(--space-0);
  min-width: 0;
}

.stat-value {
  margin: 0;
  font-family: var(--font-microcopy);
  font-weight: var(--font-weight-1);
  font-size: var(--secondary-font-size-1);
  line-height: 1;
  color: var(--accent-200);
}

.stat-label {
  margin: 0;
  font-family: var(--font-microcopy);
  font-size: var(--secondary-font-size-4);
  color: var(--text-muted);
  text-transform: uppercase;
}

@container (max-width: 860px) {
  .hero {
    flex-direction: column;
    align-items: flex-start;
  }

  .headline {
    gap: var(--space-5);
  }
}
</style>
