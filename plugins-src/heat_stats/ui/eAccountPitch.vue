<script setup lang="ts">

import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import { motion } from "motion-v";
import { Dynamics } from "fuse_ui/ui/dynamics.mjs";
import Icons from "fuse_ui/ui/Icons.vue";
import eButton from "fuse_ui/ui/eButton.vue";
import AsciiSweep from "canvas_ui/ui/AsciiSweep.vue";
import eCounter from "./eCounter.vue";
import { useAssets } from "./assets.mjs";
import { useI18n } from "./i18n.mjs";

const props = defineProps<{
  recorded: number;
  /** Of those, how many have never reached a service. */
  pending: number;
  busy: boolean;
}>();

const emit = defineEmits<{ signUp: []; logIn: [] }>();

const { t, n } = useI18n();
const assets = useAssets();

const unlocks = computed(() => [
  { id: "boards", icon: "list", name: t("account.soonBoards"), body: t("account.soonBoardsBody") },
  { id: "events", icon: "launch", name: t("account.soonEvents"), body: t("account.soonEventsBody") },
  { id: "rating", icon: "user", name: t("account.soonRating"), body: t("account.soonRatingBody") },
  { id: "loadouts", icon: "grid", name: t("account.soonLoadouts"), body: t("account.soonLoadoutsBody") },
  { id: "presence", icon: "overlay", name: t("account.soonPresence"), body: t("account.soonPresenceBody") },
]);

const today = computed(() => [
  { id: "sync", icon: "cloud", label: t("account.nowEveryPc") },
  { id: "safe", icon: "lock", label: t("account.nowHonest") },
  { id: "settings", icon: "settings", label: t("account.nowSettings") },
  { id: "api", icon: "network", label: t("account.nowApi") },
]);

const SPAN_MS = 5200;

const SWEEP = Object.freeze({
  angle: 0,
  duration: 1.6,
  band: 0.28,
  softness: 0.45,
  turbulence: 0.5,
  trail: 0.75,
  progress: -1,
  scale: 2,
  spacing: 1,
  charset: "ascii" as const,
  glyphs: Object.freeze([]) as unknown as number[],
  color: "#8FFFB8",
  tint: 0.75,
  glow: 6,
  aberration: 4,
  displace: 6,
  flicker: 0.35,
  density: 0.9,
  contrast: 1.2,
  brightness: 0,
  invert: 0,
  threshold: 0.1,
  fade: 0.75,
  blend: "auto" as const,
  background: "#191a19",
  directional: true,
  onSweepStart: () => {},
});

const front = ref<0 | 1>(0);
const step = ref(0);
const loaded = ref<[number, number]>([0, 1]);
const paused = ref(false);

const panels = computed(() => loaded.value.map((i) => unlocks.value[i % unlocks.value.length]!));
const behind = computed<0 | 1>(() => (front.value === 0 ? 1 : 0));

let timer: ReturnType<typeof setInterval> | null = null;

function queueNext(): void {
  const next = (step.value + 1) % unlocks.value.length;
  const slots: [number, number] = [...loaded.value];
  slots[behind.value] = next;
  loaded.value = slots;
}

async function goTo(target: number): Promise<void> {
  if (target === step.value) return;
  const slot = behind.value;
  if (loaded.value[slot] !== target) {
    const slots: [number, number] = [...loaded.value];
    slots[slot] = target;
    loaded.value = slots;
    await nextTick();
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
  step.value = target;
  front.value = slot;
}

function advance(): void {
  if (paused.value) return;
  void goTo((step.value + 1) % unlocks.value.length);
}

onMounted(() => {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  timer = setInterval(advance, SPAN_MS);
});

onBeforeUnmount(() => {
  if (timer) clearInterval(timer);
  timer = null;
});

const stake = computed(() => {
  if (!props.recorded) return t("account.pitchNothingYet");
  if (props.pending) return t("account.pitchPending", { count: n(props.pending, { maximumFractionDigits: 0 }) });
  return t("account.pitchRecorded");
});
</script>

<template>
  <section class="pitch">
    <div class="surface" />
    <div class="hatch" :style="{ backgroundImage: `url('${assets.logo()}')` }" />
    <div class="glow" />

    <div class="lede">
      <div class="copy">
        <h2 class="title">{{ t("account.pitchTitle") }}</h2>
        <p class="body">{{ t("account.pitchBody") }}</p>
      </div>

      <div class="stake">
        <span class="stake-value">
          <eCounter :value="recorded" :format="(v) => n(Math.round(v), { maximumFractionDigits: 0 })" />
        </span>
        <span class="stake-label">{{ t("account.pitchOnThisPc") }}</span>
        <span class="stake-note">{{ stake }}</span>
      </div>
    </div>

    <div class="columns">

      <section class="panel lead" @mouseenter="paused = true" @mouseleave="paused = false">
        <AsciiSweep class="sweep" v-bind="SWEEP" :index="front" :on-sweep-end="queueNext">
          <div class="lead-body">
            <header class="panel-head">
              <h3 class="panel-title">{{ t("account.pitchComingTitle") }}</h3>
              <span class="badge">{{ t("account.soon") }}</span>
              <div class="dots">
                <button
                  v-for="(u, i) in unlocks"
                  :key="u.id"
                  type="button"
                  class="dot"
                  :class="{ on: i === loaded[0] }"
                  :aria-label="u.name"
                  @click="goTo(i)"
                />
              </div>
            </header>

            <article class="feature">
              <Icons :kind="panels[0].icon" size="xlarge" color="var(--accent-200)" />
              <span class="feature-copy">
                <span class="feature-name">{{ panels[0].name }}</span>
                <span class="feature-body">{{ panels[0].body }}</span>
              </span>
            </article>
          </div>

          <template #alternate>
            <div class="lead-body">
              <header class="panel-head">
                <h3 class="panel-title">{{ t("account.pitchComingTitle") }}</h3>
                <span class="badge">{{ t("account.soon") }}</span>
                <div class="dots">
                  <button
                    v-for="(u, i) in unlocks"
                    :key="u.id"
                    type="button"
                    class="dot"
                    :class="{ on: i === loaded[1] }"
                    :aria-label="u.name"
                    @click="goTo(i)"
                  />
                </div>
              </header>

              <article class="feature">
                <Icons :kind="panels[1].icon" size="xlarge" color="var(--accent-200)" />
                <span class="feature-copy">
                  <span class="feature-name">{{ panels[1].name }}</span>
                  <span class="feature-body">{{ panels[1].body }}</span>
                </span>
              </article>
            </div>
          </template>
        </AsciiSweep>
      </section>

      <section class="panel">
        <header class="panel-head">
          <h3 class="panel-title">{{ t("account.pitchTodayTitle") }}</h3>
        </header>

        <ul class="today">
          <motion.li
            v-for="(o, i) in today"
            :key="o.id"
            class="item"
            :initial="{ opacity: 0, x: -6 }"
            :animate="{ opacity: 1, x: 0 }"
            :transition="{ ...Dynamics.smooth, delay: 0.1 + i * 0.05 }"
          >
            <Icons :kind="o.icon" size="normal" color="var(--text-muted)" />
            <span class="item-label">{{ o.label }}</span>
          </motion.li>
        </ul>
      </section>
    </div>

    <div class="actions">
      <eButton variant="accent" :text="t('account.pitchCta')" :disabled="busy" @click="emit('signUp')" />
      <eButton variant="ghost" :text="t('account.pitchHaveOne')" :disabled="busy" @click="emit('logIn')" />
      <span class="free">{{ t("account.pitchFree") }}</span>
    </div>
  </section>
</template>

<style scoped>
.pitch {
  container-type: inline-size;

  position: relative;
  flex: none;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
  padding: var(--space-6) var(--space-5);
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
  border: 1px solid var(--accent-200);
  corner-shape: bevel;
  border-radius: 12px 0 12px 0;
  pointer-events: none;
}

.hatch {
  position: absolute;
  inset: 0;
  background-repeat: repeat;
  background-size: 48px auto;
  opacity: 0.04;
  pointer-events: none;
}

.glow {
  position: absolute;
  inset: 0;
  background: radial-gradient(120% 100% at 100% 0%, color-mix(in srgb, var(--accent-200) 12%, transparent) 0%, transparent 60%);
  pointer-events: none;
}

.lede {
  position: relative;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-6);
}

.copy {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  min-width: 0;
  max-width: 620px;
}

.title {
  margin: 0;
  font-family: var(--font-primary);
  font-size: var(--main-font-size-1);
  font-weight: var(--font-weight-2);
  line-height: 1.1;
  color: var(--text-main);
  text-transform: uppercase;
}

.body {
  margin: 0;
  font-family: var(--font-primary);
  font-size: var(--main-font-size-3);
  font-weight: var(--font-weight-3);
  line-height: 1.6;
  color: var(--text-muted);
}

.stake {
  flex: none;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: var(--space-0);
  text-align: right;
}

.stake-value {
  font-family: var(--font-microcopy);
  font-weight: var(--font-weight-1);
  font-size: var(--secondary-font-size-1);
  line-height: 1;
  color: var(--accent-200);
}

.stake-label {
  font-family: var(--font-microcopy);
  font-size: var(--secondary-font-size-4);
  color: var(--text-muted);
  text-transform: uppercase;
}

.stake-note {
  margin-top: var(--space-2);
  max-width: 280px;
  font-family: var(--font-microcopy);
  font-size: var(--secondary-font-size-4);
  line-height: 1.5;
  color: var(--text-main);
}

.columns {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
  align-items: stretch;
  gap: var(--space-4);
}

.panel {
  position: relative;
  min-width: 0;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  background: var(--black-2);
  border: 1px solid var(--base-600);
  corner-shape: bevel;
  border-radius: 8px 0 8px 0;
  overflow: hidden;
}

.panel.lead {
  border-color: color-mix(in srgb, var(--accent-200) 45%, transparent);
}

.panel-head {
  flex: none;
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-width: 0;
  padding: var(--space-3) var(--space-4);
  box-sizing: border-box;
  background: var(--black-3);
  border-bottom: 1px solid var(--base-600);
}

.panel-title {
  margin: 0;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  font-family: var(--font-primary);
  font-size: var(--main-font-size-3);
  font-weight: var(--font-weight-2);
  line-height: normal;
  color: var(--text-muted);
  text-transform: uppercase;
  white-space: nowrap;
}

.badge {
  flex: none;
  padding: 0 var(--space-2);
  font-family: var(--font-microcopy);
  font-size: var(--secondary-font-size-5);
  line-height: 18px;
  letter-spacing: 0.08em;
  color: var(--base-1000);
  background: var(--accent-200);
  text-transform: uppercase;
  corner-shape: bevel;
  border-radius: 4px 0 4px 0;
}

.dots {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.dot {
  width: 7px;
  height: 7px;
  padding: 0;
  border: 1px solid var(--base-600);
  background: transparent;
  transform: rotate(45deg);
  cursor: pointer;
  transition:
    background 0.2s,
    border-color 0.2s;
}

.dot:hover {
  border-color: var(--accent-200);
}

.dot.on {
  background: var(--accent-200);
  border-color: var(--accent-200);
}

.sweep {
  position: relative;
  width: 100%;
  flex: 1 0 148px;
  background: var(--black-2);
}
 
.sweep {
  position: relative;
  width: 100%;
  flex: 1 0 148px;
  background: var(--black-2);
}


.sweep :deep(canvas > div),
.sweep > :deep(div) {
  overflow: hidden !important;
}

.lead-body {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-width: 0;
  box-sizing: border-box;
  overflow: hidden;
}

.feature {
  flex: 1 0 0;
  display: flex;
  align-items: center;
  gap: var(--space-4);
  min-width: 0;
  min-height: 0;
  padding: 0 var(--space-4);
  box-sizing: border-box;
}

.feature-copy {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  min-width: 0;
}

.feature-name {
  font-family: var(--font-primary);
  font-size: var(--main-font-size-2);
  font-weight: var(--font-weight-2);
  line-height: 1.2;
  color: var(--text-main);
  text-transform: uppercase;
}

.feature-body {
  font-family: var(--font-primary);
  font-size: var(--main-font-size-3);
  font-weight: var(--font-weight-3);
  line-height: 1.5;
  color: var(--text-muted);
}

.today {
  flex: 1 0 0;
  margin: 0;
  padding: var(--space-4);
  list-style: none;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: var(--space-3);
}

.item {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-width: 0;
}

.item-label {
  font-family: var(--font-primary);
  font-size: var(--main-font-size-3);
  font-weight: var(--font-weight-3);
  line-height: 1.3;
  color: var(--text-muted);
}

.actions {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--space-4);
}

.actions :deep(.stage-button) {
  width: auto;
  min-width: 200px;
  height: 32px;
}

.actions :deep(.stage-button.ghost) {
  min-width: 0;
}

.free {
  font-family: var(--font-primary);
  font-size: var(--main-font-size-4);
  line-height: 1.5;
  color: var(--text-muted);
}

@container (max-width: 900px) {
  .columns {
    grid-template-columns: minmax(0, 1fr);
  }

  .lede {
    flex-direction: column;
    gap: var(--space-4);
  }

  .stake {
    align-items: flex-start;
    text-align: left;
  }

  .actions {
    flex-wrap: wrap;
    gap: var(--space-3);
  }
}
</style>
