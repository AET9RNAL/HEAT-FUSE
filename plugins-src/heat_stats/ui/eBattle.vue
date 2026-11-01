<script lang="ts">
import type { BattleLoadout } from "./eLoadout.vue";

type Num = number | null;

export interface RosterEntry {
  pid: string | null;
  bot: Num;
  name: string | null;
  agent: string | null;
  tank: string | null;
  role: string | null;
  platform: Num;
  place: Num;
  level: Num;
  score: Num;
  damage: Num;
  kills: Num;
  deaths: Num;
  assists: Num;
  confirms: Num;
  denies: Num;
}

export interface RosterTeams {
  ally: RosterEntry[];
  enemy: RosterEntry[];
}

/** What the player usually does, so one battle can be read against the rest of them. */
export interface BattleNorms {
  dpm: number;
  spm: number;
  damageShare: number;
  battles: number;
}

/** One battle as the plugin's battles.ts shapes it. */
export interface BattleRow {
  id: string;
  startedAt: string | null;
  outcome: string;
  agentId: string;
  agent: string;
  vehicle: string;
  role: string;
  durationS: number;
  map: string;
  mode: string;
  /** The queue it came from; empty for battles recorded before it was captured. */
  playMode: string;
  score: number;
  kills: number;
  deaths: number;
  assists: Num;
  damage: number;
  confirms: Num;
  denies: Num;
  allyScore: number;
  enemyScore: number;
  place: Num;
  vehicleLevel: Num;
  xpVehicle: Num;
  xpAgent: Num;
  hits: Num;
  shots: Num;
  critHits: Num;
  shellDamage: Num;
  abilityDamage: Num;
  blockedDamage: Num;
  rammingDamage: Num;
  damageTaken: Num;
  heal: Num;
  allyKills: Num;
  allyDeaths: Num;
  allyDamage: Num;
  enemyKills: Num;
  enemyDeaths: Num;
  enemyDamage: Num;
  credits: Num;
  tech: Num;
  intel: Num;
  roster: RosterTeams | null;
  loadouts: BattleLoadout[];
}
</script>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { AnimatePresence, motion } from "motion-v";
import { Dynamics } from "fuse_ui/ui/dynamics.mjs";
import eBattleCharts, { type SamplesEntry } from "./eBattleCharts.vue";
import eBattleSection from "./eBattleSection.vue";
import eExpandToggle from "./eExpandToggle.vue";
import eLoadout from "./eLoadout.vue";
import eRoster from "./eRoster.vue";
import { useAssets } from "./assets.mjs";
import { NEGATIVE, NEUTRAL, POSITIVE } from "./palette.mjs";
import { useI18n } from "./i18n.mjs";

const props = defineProps<{
  row: BattleRow;
  open: boolean;
  samples: SamplesEntry | null;
  /** Null until the history has loaded; the rates then have nothing to be read against. */
  norms: BattleNorms | null;
}>();

const emit = defineEmits<{ toggle: [] }>();

const EXPAND = Dynamics.smooth;

/** On once the details have finished opening; building charts mid-animation stalls it. */
const settled = ref(props.open);
let settleTimer: number | null = null;

watch(
  () => props.open,
  (open) => {
    if (settleTimer !== null) window.clearTimeout(settleTimer);
    settleTimer = null;
    settled.value = false;
    if (open) settleTimer = window.setTimeout(() => (settled.value = true), EXPAND.duration * 1000);
  },
);

onBeforeUnmount(() => {
  if (settleTimer !== null) window.clearTimeout(settleTimer);
});

const { t, n, fixed, percent, compact } = useI18n();
const assets = useAssets();

function mask(url: string) {
  return { maskImage: `url("${url}")`, WebkitMaskImage: `url("${url}")` };
}

const pad = (v: number) => String(v).padStart(2, "0");

function count(v: Num): string {
  return n(v, { maximumFractionDigits: 0 });
}

function kdOf(kills: Num, deaths: Num): Num {
  if (kills == null) return null;
  return deaths ? kills / deaths : kills;
}

function share(part: Num, whole: Num): string {
  return part != null && whole ? percent((part / whole) * 100, 1) : n(null);
}

function perMin(value: number): string {
  const minutes = props.row.durationS / 60;
  return minutes > 0 ? t("battles.perMin", { value: count(value / minutes) }) : "";
}

function modeName(key: string): string {
  if (!key) return n(null);
  const path = `modes.${key.toLowerCase().replace(/[\s_-]/g, "")}`;
  const label = t(path);
  return label === path ? key : label;
}

const played = computed(() => {
  const at = props.row.startedAt ? new Date(props.row.startedAt) : null;
  if (!at || Number.isNaN(at.getTime())) return { day: n(null), time: n(null) };
  return {
    day: `${pad(at.getMonth() + 1)}-${pad(at.getDate())}`,
    time: `${pad(at.getHours())}:${pad(at.getMinutes())}`,
  };
});

const duration = computed(() => {
  const s = Math.max(0, Math.round(props.row.durationS));
  return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
});

const agent = computed(() => {
  const r = props.row;
  if (r.agent) return r.agent;
  return r.agentId ? t("performance.agentName", { id: r.agentId }) : n(null);
});

const tone = computed(() => (props.row.outcome === "win" || props.row.outcome === "loss" ? props.row.outcome : "even"));

/** The game counts place from 0; people count from 1. */
const place = computed(() => (props.row.place != null ? props.row.place + 1 : null));

const ROLES = ["assault", "defender", "marksman"];

const roleIcon = computed(() => {
  const key = props.row.role.toLowerCase();
  return ROLES.includes(key) ? { line: assets.role(key, true), solid: assets.role(key) } : null;
});

const minutes = computed(() => Math.max(0, props.row.durationS) / 60);

const dpm = computed(() => (minutes.value > 0 ? props.row.damage / minutes.value : null));
const spm = computed(() => (minutes.value > 0 ? props.row.score / minutes.value : null));

function against(value: number | null, mean: number | undefined): number | null {
  if (value == null || !mean) return null;
  return ((value - mean) / mean) * 100;
}

const dpmDelta = computed(() => against(dpm.value, props.norms?.dpm));
const spmDelta = computed(() => against(spm.value, props.norms?.spm));

const dirOf = (delta: number | null): number => (delta == null || Math.abs(delta) < 2 ? 0 : delta > 0 ? 1 : -1);

function deltaTint(delta: number | null) {
  const dir = dirOf(delta);
  return dir ? { color: dir > 0 ? POSITIVE : NEGATIVE } : undefined;
}

function signedPercent(delta: number | null): string {
  if (delta == null) return n(null);
  return `${delta >= 0 ? "+" : ""}${fixed(delta, 0)}%`;
}

/** The player's cut of what their team dealt, against the cut an even split would have given. */
const damageShare = computed(() => {
  const team = props.row.allyDamage;
  return team && team > 0 ? props.row.damage / team : null;
});

/** An even split of the team's damage, or failing a roster, the cut this player usually takes. */
const evenShare = computed(() => {
  const size = props.row.roster?.ally.length ?? 0;
  if (size > 0) return 1 / size;
  return props.norms?.damageShare || null;
});

const shareTint = computed(() => {
  const mark = evenShare.value;
  const mine = damageShare.value;
  if (mark == null || mine == null) return NEUTRAL;
  return mine >= mark ? POSITIVE : NEGATIVE;
});

const teamTint = computed(() => {
  const split = teamShare.value;
  if (split == null || Math.abs(split - 0.5) < 0.02) return NEUTRAL;
  return split > 0.5 ? POSITIVE : NEGATIVE;
});

/** Which way the damage went between the teams; 0.5 is level. */
const teamShare = computed(() => {
  const ally = props.row.allyDamage ?? 0;
  const enemy = props.row.enemyDamage ?? 0;
  return ally + enemy > 0 ? ally / (ally + enemy) : null;
});

const sections = computed(() => {
  const r = props.row;
  return [
    {
      id: "essentials",
      title: t("battles.essentials"),
      metrics: [
        { key: "kda", label: t("battles.kda"), value: `${count(r.kills)} / ${count(r.deaths)} / ${count(r.assists)}` },
        { key: "damage", label: t("battles.damage"), value: compact(r.damage), sub: perMin(r.damage) },
        { key: "score", label: t("battles.score"), value: count(r.score), sub: perMin(r.score) },
        { key: "confirms", label: t("battles.confirmsDenies"), value: `${count(r.confirms)} / ${count(r.denies)}` },
        { key: "allyScore", label: t("battles.allyScore"), value: count(r.allyScore), sub: perMin(r.allyScore) },
        { key: "enemyScore", label: t("battles.enemyScore"), value: count(r.enemyScore), sub: perMin(r.enemyScore) },
      ],
    },
    {
      id: "breakdown",
      title: t("battles.breakdown"),
      metrics: [
        {
          key: "accuracy",
          label: t("battles.accuracy"),
          value: `${count(r.hits)}/${count(r.shots)}`,
          sub: t("battles.hitRate", { value: share(r.hits, r.shots) }),
        },
        {
          key: "crit",
          label: t("battles.critRate"),
          value: `${count(r.critHits)}/${count(r.hits)}`,
          sub: t("battles.ofHits", { value: share(r.critHits, r.hits) }),
        },
        {
          key: "shell",
          label: t("battles.shellDamage"),
          value: compact(r.shellDamage),
          sub: t("battles.ofTotal", { value: share(r.shellDamage, r.damage) }),
        },
        {
          key: "ability",
          label: t("battles.abilityDamage"),
          value: compact(r.abilityDamage),
          sub: t("battles.ofTotal", { value: share(r.abilityDamage, r.damage) }),
        },
        {
          key: "blocked",
          label: t("battles.blockedDamage"),
          value: compact(r.blockedDamage),
          sub: t("battles.ofDealt", { value: share(r.blockedDamage, r.damage) }),
        },
        {
          key: "ramming",
          label: t("battles.rammingDamage"),
          value: compact(r.rammingDamage),
          sub: t("battles.ofTotal", { value: share(r.rammingDamage, r.damage) }),
        },
        {
          key: "taken",
          label: t("battles.damageTaken"),
          value: compact(r.damageTaken),
          sub: t("battles.ofDealt", { value: share(r.damageTaken, r.damage) }),
        },
        { key: "heal", label: t("battles.heal"), value: compact(r.heal), sub: t("battles.selfAlly") },
      ],
    },
    {
      id: "detail",
      title: t("battles.detail"),
      metrics: [
        {
          key: "mapMode",
          label: t("battles.mapMode"),
          value: `${r.map || n(null)} / ${modeName(r.mode).toLocaleUpperCase()}`,
        },
        { key: "scores", label: t("battles.scores"), value: `${count(r.allyScore)} : ${count(r.enemyScore)}` },
        { key: "credits", label: t("battles.creditsTech"), value: `${count(r.credits)} / ${count(r.tech)}` },
        {
          key: "xp",
          label: t("battles.xp"),
          value: `${count(r.xpVehicle)} / ${count(r.xpAgent)}`,
          sub: t("battles.xpVehicleAgent"),
        },
        {
          key: "vehicleLevel",
          label: t("battles.vehicleLevel"),
          value: count(r.vehicleLevel),
          sub: r.vehicle,
        },
      ],
    },
    {
      id: "teams",
      title: t("battles.teams"),
      metrics: [
        {
          key: "kills",
          label: t("battles.allyKills"),
          value: count(r.allyKills),
          sub: t("battles.enemy", { value: count(r.enemyKills) }),
        },
        {
          key: "deaths",
          label: t("battles.allyDeaths"),
          value: count(r.allyDeaths),
          sub: t("battles.enemy", { value: count(r.enemyDeaths) }),
        },
        {
          key: "kd",
          label: t("battles.allyKd"),
          value: fixed(kdOf(r.allyKills, r.allyDeaths), 2),
          sub: t("battles.enemy", { value: fixed(kdOf(r.enemyKills, r.enemyDeaths), 2) }),
        },
        {
          key: "damage",
          label: t("battles.allyDamage"),
          value: compact(r.allyDamage),
          sub: t("battles.enemy", { value: compact(r.enemyDamage) }),
        },
        {
          key: "damageShare",
          label: t("battles.damageShare"),
          value: share(r.damage, r.allyDamage),
          sub: `${compact(r.damage)} / ${compact(r.allyDamage)}`,
        },
        {
          key: "killShare",
          label: t("battles.killShare"),
          value: share(r.kills, r.allyKills),
          sub: `${count(r.kills)} / ${count(r.allyKills)}`,
        },
      ],
    },
  ];
});
</script>

<template>
  <article class="battle">
    <div
      class="entry"
      :class="tone"
      role="button"
      tabindex="0"
      :aria-expanded="open"
      :aria-label="t('battles.details')"
      @click="emit('toggle')"
      @keydown.enter.prevent="emit('toggle')"
    >
      <div class="surface" />

      <span class="chip" :class="tone">{{ t(`battles.${row.outcome || "draw"}`) }}</span>

      <span class="tab" :class="tone"><i>{{ played.day }} {{ played.time }}</i></span>

      <span class="glyph-plinth">
        <template v-if="roleIcon">
          <span class="glyph line" :style="mask(roleIcon.line)" />
          <span class="glyph solid" :style="mask(roleIcon.solid)" />
        </template>
      </span>

      <span class="ident">
        <span class="ident-agent">{{ agent }}</span>
        <span class="ident-vehicle">{{ row.vehicle || n(null) }}</span>
        <span class="ident-where">
          {{ row.map || n(null) }}
          <i class="dot" />
          {{ modeName(row.mode) }}
          <i class="dot" />
          {{ duration }}
          <!-- Only when the opposition was not people: a quick match needs no saying. -->
          <span v-if="row.playMode === 'versus_ai'" class="ai">{{ t("battles.versusAi") }}</span>
        </span>
      </span>

      <!-- Rate, not total: what the battle was worth a minute, against what this player usually manages. -->
      <span class="rates">
        <span class="rate">
          <span class="rate-label">{{ t("battles.dpm") }}</span>
          <span class="rate-value">{{ dpm == null ? n(null) : count(dpm) }}</span>
          <span class="rate-delta" :class="{ down: dirOf(dpmDelta) < 0 }" :style="deltaTint(dpmDelta)">
            <i v-if="dirOf(dpmDelta)" class="trend" />{{ signedPercent(dpmDelta) }}
          </span>
        </span>
        <span class="rate">
          <span class="rate-label">{{ t("battles.spm") }}</span>
          <span class="rate-value">{{ spm == null ? n(null) : count(spm) }}</span>
          <span class="rate-delta" :class="{ down: dirOf(spmDelta) < 0 }" :style="deltaTint(spmDelta)">
            <i v-if="dirOf(spmDelta)" class="trend" />{{ signedPercent(spmDelta) }}
          </span>
        </span>
      </span>

      <span class="figures">
        <span class="figure">
          <span class="figure-label">{{ t("battles.damage") }}</span>
          <span class="figure-value">{{ compact(row.damage) }}</span>
        </span>
        <span class="figure">
          <span class="figure-label">{{ t("battles.score") }}</span>
          <span class="figure-value">{{ compact(row.score) }}</span>
        </span>
        <span class="figure">
          <span class="figure-label">{{ t("battles.sortKd") }}</span>
          <span class="figure-value">{{ fixed(kdOf(row.kills, row.deaths), 2) }}</span>
        </span>
        <span class="figure">
          <span class="figure-label">{{ t("battles.sortPlace") }}</span>
          <span class="figure-value">#{{ count(place) }}</span>
        </span>
      </span>

      <!-- Here we ask: did I pull my weight, and did the team pull theirs. ofc it's always the fucking team... -->
      <span class="meters">
        <span class="meter">
          <span class="meter-label">{{ t("battles.yourShare") }}</span>
          <span class="meter-track">
            <motion.span
              class="meter-fill mine"
              :style="{ '--tint': shareTint }"
              :initial="{ width: '0%' }"
              :animate="{ width: `${Math.round((damageShare ?? 0) * 100)}%` }"
              :transition="Dynamics.smooth"
            />
            <!-- Where an even split would have put it: past this mark is a carry. -->
            <i v-if="evenShare" class="meter-even" :style="{ left: `${evenShare * 100}%` }" />
          </span>
          <span class="meter-read">{{ damageShare == null ? n(null) : percent(damageShare * 100, 0) }}</span>
        </span>

        <span class="meter">
          <span class="meter-label">{{ t("battles.teamDamage") }}</span>
          <span class="meter-track">
            <motion.span
              class="meter-fill team"
              :style="{ '--tint': teamTint }"
              :initial="{ width: '0%' }"
              :animate="{ width: `${Math.round((teamShare ?? 0.5) * 100)}%` }"
              :transition="Dynamics.smooth"
            />
            <!-- Level pegging: past it the team out-damaged the other one. -->
            <i class="meter-even" style="left: 50%" />
          </span>
          <span class="meter-read">{{ compact(row.allyDamage) }} : {{ compact(row.enemyDamage) }}</span>
        </span>
      </span>

      <eExpandToggle :open="open" anchor="right" />
    </div>
    <AnimatePresence :initial="false">
      <motion.div
        v-if="open"
        class="details"
        :initial="{ height: 0, opacity: 0 }"
        :animate="{ height: 'auto', opacity: 1 }"
        :exit="{ height: 0, opacity: 0 }"
        :transition="EXPAND"
      >
        <div class="details-body">
          <eBattleSection v-for="s in sections" :key="s.id" :title="s.title" :metrics="s.metrics" />
          <eRoster :roster="row.roster" :ally="row.allyScore" :enemy="row.enemyScore" />
          <eLoadout :loadouts="row.loadouts" />
          <eBattleCharts :entry="samples" :ready="settled" />
        </div>
      </motion.div>
    </AnimatePresence>
  </article>
</template>

<style scoped>
.battle {
  width: 100%;
  display: flex;
  flex-direction: column;
}

.entry {
  --tone: var(--base-600);
  --ink: color-mix(in srgb, var(--tone) 10%, #000);

  position: relative;
  min-height: 100px;
  box-sizing: border-box;
  display: grid;
  grid-template-columns: 26px 76px minmax(0, 1.6fr) minmax(0, 1.5fr) minmax(0, 1.5fr) auto;
  grid-template-rows: 1fr auto;
  grid-template-areas:
    "tab glyph ident rates figures toggle"
    "tab glyph meters meters meters toggle";
  align-items: center;
  column-gap: var(--space-3);
  padding: var(--space-5) 0 var(--space-2);
  overflow: hidden;
  background: var(--black-2);
  border: 1px solid var(--base-600);
  corner-shape: bevel;
  border-radius: 6px 0 6px 0;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}

.entry:hover {
  background: var(--black-3);
  border-color: var(--base-200);
}

.entry.win {
  --tone: var(--accent-200);
}

.entry.loss {
  --tone: var(--error-base);
}

.surface {
  position: absolute;
  inset: 0;
  background: var(--black-1-a);
  pointer-events: none;
}

.chip {
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  min-width: 96px;
  padding: 2px var(--space-4) 3px;
  box-sizing: border-box;
  background: var(--tone);
  clip-path: polygon(10px 0, calc(100% - 10px) 0, 100% 100%, 0 100%);
  font-family: var(--font-primary);
  font-size: var(--main-font-size-4);
  font-weight: var(--font-weight-1);
  line-height: 1.2;
  letter-spacing: 0.12em;
  color: var(--ink);
  text-transform: uppercase;
  text-align: center;
}

.tab {
  grid-area: tab;
  align-self: stretch;
  display: flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--tone) 22%, transparent);
  border-right: 1px solid color-mix(in srgb, var(--tone) 45%, transparent);
}

.tab i {
  writing-mode: vertical-rl;
  transform: rotate(180deg);
  font-family: var(--font-microcopy);
  font-size: var(--secondary-font-size-5);
  line-height: 1;
  letter-spacing: 0.12em;
  color: var(--tone);
  font-variant-numeric: tabular-nums;
  font-style: normal;
  white-space: nowrap;
}

.glyph-plinth {
  position: relative;
  grid-area: glyph;
  justify-self: center;
  width: 54px;
  height: 54px;
  background: color-mix(in srgb, var(--base-200) 7%, transparent);
  corner-shape: bevel;
  border-radius: 12px 0 12px 0;
  transition: background 0.18s;
}

.entry:hover .glyph-plinth {
  background: color-mix(in srgb, var(--base-200) 14%, transparent);
}

.glyph {
  position: absolute;
  inset: 9px;
  background: var(--text-muted);
  mask-size: contain;
  mask-repeat: no-repeat;
  mask-position: center;
  -webkit-mask-size: contain;
  -webkit-mask-repeat: no-repeat;
  -webkit-mask-position: center;
}

.glyph.solid {
  opacity: 0;
  transition: opacity 0.18s;
}

.entry:hover .glyph.solid {
  opacity: 1;
}

.ident {
  grid-area: ident;
  position: relative;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ident-agent,
.ident-vehicle,
.ident-where {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ident-agent {
  font-family: var(--font-primary);
  font-size: var(--main-font-size-3);
  font-weight: var(--font-weight-2);
  line-height: 1.1;
  color: var(--text-main);
  text-transform: uppercase;
}

.ident-vehicle {
  font-family: var(--font-microcopy);
  font-size: var(--main-font-size-4);
  line-height: 1.1;
  color: var(--text-muted);
}

.ident-where {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  font-family: var(--font-microcopy);
  font-size: var(--secondary-font-size-5);
  line-height: 1.1;
  letter-spacing: 0.06em;
  color: var(--base-600);
  text-transform: uppercase;
}

/* Not the outcome's colour: this is what the battle was, not how it went. */
.ai {
  flex: none;
  padding: 1px var(--space-1);
  background: color-mix(in srgb, var(--warning-color) 18%, transparent);
  color: var(--warning-color);
  letter-spacing: 0.1em;
}

.dot {
  flex: none;
  width: 5px;
  height: 5px;
  background: var(--base-600);
  clip-path: polygon(0 100%, 50% 100%, 100% 50%, 50% 50%, 50% 0, 0 50%);
}

.rates {
  grid-area: rates;
  position: relative;
  min-width: 0;
  display: flex;
  gap: var(--space-4);
}

.rate {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.rate-label {
  font-family: var(--font-microcopy);
  font-size: var(--secondary-font-size-5);
  line-height: 1;
  letter-spacing: 0.1em;
  color: var(--text-muted);
  text-transform: uppercase;
}

.rate-value {
  font-family: var(--font-microcopy);
  font-size: var(--main-font-size-2);
  line-height: 1.1;
  color: var(--text-main);
  font-variant-numeric: tabular-nums;
}

.rate-delta {
  display: flex;
  align-items: center;
  gap: 3px;
  font-family: var(--font-microcopy);
  font-size: var(--secondary-font-size-5);
  line-height: 1;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}

.trend {
  width: 7px;
  height: 7px;
  background: currentColor;
  clip-path: polygon(0 100%, 50% 100%, 100% 50%, 50% 50%, 50% 0, 0 50%);
}

.rate-delta.down .trend {
  transform: rotate(180deg);
}

.figures {
  grid-area: figures;
  position: relative;
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 2px var(--space-3);
}

.figure {
  min-width: 0;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-2);
}

.figure-label {
  font-family: var(--font-microcopy);
  font-size: var(--secondary-font-size-5);
  line-height: 1.2;
  letter-spacing: 0.08em;
  color: var(--text-muted);
  text-transform: uppercase;
  white-space: nowrap;
}

.figure-value {
  font-family: var(--font-microcopy);
  font-size: var(--main-font-size-4);
  line-height: 1.2;
  color: var(--text-main);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.meters {
  grid-area: meters;
  position: relative;
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-1) var(--space-5);
  padding-top: var(--space-2);
}

.meter {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.meter-label {
  flex: none;
  font-family: var(--font-microcopy);
  font-size: var(--secondary-font-size-5);
  line-height: 1;
  letter-spacing: 0.08em;
  color: var(--text-muted);
  text-transform: uppercase;
}

.meter-track {
  position: relative;
  flex: 1 1 auto;
  min-width: 0;
  height: 5px;
  background: color-mix(in srgb, var(--base-600) 50%, transparent);
}

.meter-fill {
  display: block;
  height: 100%;
}

.meter-fill.mine {
  background: repeating-linear-gradient(135deg, var(--tint) 0 2px, transparent 2px 5px),
    color-mix(in srgb, var(--tint) 28%, transparent);
}

.meter-fill.team {
  background: color-mix(in srgb, var(--tint) 60%, transparent);
}

/* An even split, marked: past it the player did more than their share. */
.meter-even {
  position: absolute;
  top: -2px;
  bottom: -2px;
  width: 1px;
  background: var(--base-200);
}

.meter-read {
  flex: none;
  font-family: var(--font-microcopy);
  font-size: var(--secondary-font-size-5);
  line-height: 1;
  color: var(--text-main);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.entry > .expand {
  grid-area: toggle;
}

.details {
  overflow: hidden;
}

.details-body {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: 10px;
  background: var(--black-1-a);
}
</style>
