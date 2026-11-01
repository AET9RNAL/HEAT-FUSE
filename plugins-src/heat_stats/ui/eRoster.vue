<script setup lang="ts">
import { computed, reactive } from "vue";
import Icons from "../Icons.vue";
import eFit from "./eFit.vue";
import eTeamBar from "./eTeamBar.vue";
import { useAssets } from "./assets.mjs";
import { platformIcon } from "./platforms.mjs";
import { MARK_SLOTS, useTags } from "./tags.mjs";
import { useI18n } from "./i18n.mjs";

interface RosterEntry {
  pid: string | null;
  bot: number | null;
  name: string | null;
  agent: string | null;
  tank: string | null;
  role: string | null;
  /** The game's numeric Platform enum; platforms.mjs resolves it for display. */
  platform: number | null;
  /** Rank counted from 0, and the game's `level` field, which is not the vehicle's. */
  place: number | null;
  level: number | null;
  score: number | null;
  damage: number | null;
  kills: number | null;
  deaths: number | null;
  assists: number | null;
  confirms: number | null;
  denies: number | null;
}

interface RosterTeams {
  ally: RosterEntry[];
  enemy: RosterEntry[];
}

const props = defineProps<{ roster: RosterTeams | null; ally: number; enemy: number }>();

const { t, n, compact } = useI18n();
const assets = useAssets();
const tags = useTags();

const missing = reactive(new Set<string>());
const shown = (url: string) => !!url && !missing.has(url);

const DASH = "—";
const PLACEHOLDER_SLOTS = 4;

interface Figure {
  full: string;
  short: string;
}

interface Card {
  key: string;
  place: string;
  name: string;
  platform: string | null;
  portrait: string;
  role: string;
  marks: Array<{ url: string; color: string }>;
  agent: string;
  tank: string;
  score: Figure;
  damage: Figure;
  kda: string;
}

function fmtNum(v: number | null): string {
  return v != null ? String(v) : DASH;
}

function fig(v: number | null): Figure {
  return { full: n(v, { maximumFractionDigits: 0 }), short: v != null ? compact(v) : DASH };
}

const EMPTY: Figure = { full: DASH, short: DASH };

function cards(side: "ally" | "enemy"): Card[] {
  const players = [...(props.roster?.[side] ?? [])].sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  if (!players.length) {
    return Array.from({ length: PLACEHOLDER_SLOTS }, (_, i) => ({
      key: `${side}-empty-${i}`,
      place: DASH,
      name: DASH,
      platform: null,
      portrait: "",
      role: "",
      marks: [],
      agent: DASH,
      tank: "",
      score: EMPTY,
      damage: EMPTY,
      kda: DASH,
    }));
  }
  return players.map((p, i) => ({
    key: `${side}-${p.name ?? i}-${i}`,
    place: String((p.place ?? i) + 1),
    name: p.name || DASH,
    // A bot's platform is the game's own filler (2), so it is never drawn.
    platform: p.bot ? null : platformIcon(p.platform),
    portrait: assets.agent(p.agent),
    role: roleIcon(p.role),
    marks: tags
      .marks(p.pid)
      .slice(0, MARK_SLOTS)
      .map((id: string) => ({ url: assets.tag(id), color: tags.color(id) })),
    agent: p.agent || p.tank || DASH,
    tank: p.tank || "",
    score: fig(p.score),
    damage: fig(p.damage),
    kda: `${fmtNum(p.kills)} / ${fmtNum(p.deaths)} / ${fmtNum(p.assists)}`,
  }));
}

const CLASSES = ["assault", "defender", "marksman"];

/** Only the three classes have an icon; a mask that 404s would paint a solid block. */
function roleIcon(role: string | null): string {
  const raw = String(role ?? "").toLowerCase();
  const key = CLASSES.find((c) => raw.includes(c));
  return key ? assets.role(key) : "";
}

function maskOf(url: string) {
  return { maskImage: `url("${url}")`, WebkitMaskImage: `url("${url}")` };
}

const sides = computed(() => [
  { id: "ally", head: t("battles.allies"), cards: cards("ally") },
  { id: "enemy", head: t("battles.enemies"), cards: cards("enemy") },
]);
</script>

<template>
  <section class="roster">
    <header class="head">
      <span class="seal" aria-hidden="true"><i class="wedge flip" /><i class="wedge" /></span>
      <h4 class="title">{{ t("battles.roster") }}</h4>
      <span class="rule" />
    </header>

    <eTeamBar class="teambar" :ally="ally" :enemy="enemy" />

    <div class="drop">
        <div class="teams">
          <div v-for="side in sides" :key="side.id" class="team" :class="side.id">
            <div class="row labels">
              <span />
              <span class="head">{{ side.head }}</span>
              <span />
              <span class="label">{{ t("battles.score") }}</span>
              <span class="label">{{ t("battles.damage") }}</span>
              <span class="label">{{ t("battles.kda") }}</span>
            </div>

            <div v-for="card in side.cards" :key="card.key" class="row player" :title="card.tank">
              <span class="place num">{{ card.place }}</span>
              <span class="who">
                <span class="name">{{ card.name }}</span>
                <Icons v-if="card.platform" :kind="card.platform" size="small" color="var(--base-200)" />
                <span
                  v-for="(mark, i) in card.marks"
                  :key="i"
                  class="mark"
                  :style="{ ...maskOf(mark.url), background: mark.color }"
                />
              </span>
              <span class="agent">
                <span class="pic">
                  <img
                    v-if="shown(card.portrait)"
                    class="face"
                    :src="card.portrait"
                    :alt="card.agent"
                    @error="missing.add(card.portrait)"
                  />
                </span>
                <span v-if="card.role" class="cls" :style="maskOf(card.role)" />
                <span class="who-agent">{{ card.agent }}</span>
              </span>
              <eFit class="num" :full="card.score.full" :short="card.score.short" />
              <eFit class="num" :full="card.damage.full" :short="card.damage.short" />
              <span class="num kda">{{ card.kda }}</span>
            </div>
          </div>
        </div>
    </div>
  </section>
</template>

<style scoped>
.roster {
  position: relative;
  width: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--black-1-a);
  border: 1px solid var(--base-600);
  corner-shape: bevel;
  border-radius: 6px 0 6px 0;
}

.head {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-3) 0;
  box-sizing: border-box;
}

.seal {
  flex: none;
  display: flex;
  align-items: center;
  height: 8px;
}

.wedge {
  width: 8px;
  height: 8px;
  background: var(--base-600);
  clip-path: polygon(0 100%, 50% 100%, 100% 50%, 50% 50%, 50% 0, 0 50%);
}

.wedge.flip {
  transform: rotate(180deg);
}

.title {
  flex: none;
  margin: 0;
  font-family: var(--font-primary);
  font-size: var(--main-font-size-3);
  font-weight: var(--font-weight-2);
  line-height: 1;
  letter-spacing: 0.06em;
  color: var(--text-main);
  text-transform: uppercase;
  white-space: nowrap;
}

.rule {
  flex: 1 1 auto;
  height: 1px;
  background: var(--base-600);
}

.teambar {
  width: 100%;
  min-width: 0;
}

.teams {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-3);
  padding: var(--space-3);
}

.team {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.row {
  display: grid;
  grid-template-columns: 16px minmax(0, 1.8fr) auto minmax(0, 1fr) minmax(0, 1.1fr) auto;
  align-items: center;
  gap: var(--space-2);
  box-sizing: border-box;
  min-width: 0;
  padding: 0 var(--space-2);
  border: 1px solid transparent;
}

.player {
  height: 44px;
  background: var(--black-3-a);
  border-color: var(--base-600);
  corner-shape: bevel;
  border-radius: 6px 0 6px 0;
}

.head,
.label,
.name,
.who-agent,
.num {
  font-weight: var(--font-weight-3);
  line-height: normal;
  white-space: nowrap;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.head,
.label {
  font-family: var(--font-primary);
  font-size: var(--main-font-size-4);
  color: var(--text-muted);
  text-transform: uppercase;
}

.label {
  text-align: right;
}

.name {
  font-family: var(--font-primary);
  font-size: var(--main-font-size-3);
  color: var(--text-main);
}

.who-agent {
  display: none;
}

.num {
  font-family: var(--font-microcopy);
  font-size: var(--main-font-size-3);
  color: var(--text-main);
  text-align: right;
}

.place {
  font-size: var(--main-font-size-4);
  text-align: center;
}

.who,
.agent {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  min-width: 0;
}

.agent {
  gap: var(--space-2);
}

.pic {
  flex: none;
  box-sizing: border-box;
  width: 24px;
  height: 24px;
  overflow: hidden;
  background: var(--black-1-a);
  border: 1px solid var(--base-600);
}

.face {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: top center;
}

.mark {
  flex: none;
  width: 12px;
  height: 12px;
  mask-size: contain;
  mask-repeat: no-repeat;
  mask-position: center;
  -webkit-mask-size: contain;
  -webkit-mask-repeat: no-repeat;
  -webkit-mask-position: center;
}

.cls {
  flex: none;
  width: 14px;
  height: 14px;
  mask-size: contain;
  mask-repeat: no-repeat;
  mask-position: center;
  -webkit-mask-size: contain;
  -webkit-mask-repeat: no-repeat;
  -webkit-mask-position: center;
}

.ally .place {
  color: var(--accent-200);
}

.ally .cls {
  background: var(--accent-200);
}

.enemy .place {
  color: var(--error-base);
}

.enemy .cls {
  background: var(--error-base);
}
</style>
