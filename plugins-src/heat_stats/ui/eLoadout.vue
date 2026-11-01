<script lang="ts">
export interface BattleLoadoutPart {
  id: number;
  name: string | null;
  position: number | null;
}

export interface BattleCosmetic {
  id: number;
  kind: string | null;
  code: string | null;
}

/** One played loadout as the plugin's battles.ts shapes it. */
export interface BattleLoadout {
  id: string | null;
  vehicle: string;
  agent: string;
  verified: boolean;
  problem: string | null;
  modules: BattleLoadoutPart[];
  equipment: BattleLoadoutPart[];
  perks: BattleLoadoutPart[];
  cosmetics: boolean;
  talisman: BattleCosmetic | null;
  camo: BattleCosmetic | null;
  outfit: BattleCosmetic[];
}
</script>

<script setup lang="ts">
import { computed } from "vue";
import { useAssets } from "./assets.mjs";
import { useI18n } from "./i18n.mjs";
import { NAMES } from "./partIndex.mjs";

const props = defineProps<{ loadouts: BattleLoadout[] }>();

const i18n = useI18n();
const { t } = i18n;
const assets = useAssets();

type NameTable = Record<string, Record<number, string> | undefined>;
/** The game's own part names in the window's language, else English. */
const names = computed<NameTable>(() => {
  const all = NAMES as Record<string, NameTable | undefined>;
  return all[i18n.locale] ?? all.en ?? {};
});

const DASH = "—";
/** The game's fixed slot counts; modules are a set, so theirs only shapes a placeholder. */
const MODULE_SLOTS = 6;
const EQUIPMENT_SLOTS = 2;
const PERK_SLOTS = 4;

type PartKind = "module" | "equipment" | "perk" | "talisman" | "camo" | "outfit";

interface Slot {
  key: string;
  /** filled: a part. empty: nothing equipped. unknown: not recorded. */
  state: "filled" | "empty" | "unknown";
  label: string;
  art: string | null;
  title: string | null;
}

interface Group {
  id: PartKind;
  label: string;
  slots: Slot[];
}

function resolve(kind: PartKind, id: number): { label: string; art: string | null; hint: string | null } {
  const name = names.value[kind]?.[id] ?? null;
  const type = kind === "module" ? (names.value.moduleType?.[id] ?? null) : null;
  return {
    label: name ?? `#${id}`,
    art: assets.part(kind, id) || null,
    // The tooltip holds what the label has no room for: a module's type, and the id.
    hint: name ? [name, type, `#${id}`].filter(Boolean).join(" · ") : null,
  };
}

function filled(kind: PartKind, id: number, title: string | null): Slot {
  const { label, art, hint } = resolve(kind, id);
  return { key: `${kind}-${id}`, state: "filled", label, art, title: hint ?? title };
}

function blank(kind: PartKind, i: number, state: "empty" | "unknown", label?: string): Slot {
  const text = label ?? (state === "empty" ? t("battles.slotEmpty") : DASH);
  return { key: `${kind}-${state}-${i}`, state, label: text, art: null, title: null };
}

function unknown(kind: PartKind, count: number): Slot[] {
  return Array.from({ length: count }, (_, i) => blank(kind, i, "unknown"));
}

function positioned(kind: PartKind, parts: BattleLoadoutPart[], count: number): Slot[] {
  const size = Math.max(count, ...parts.map((p) => (p.position ?? -1) + 1), parts.length);
  const slots = Array.from({ length: size }, (_, i) => blank(kind, i, "empty"));
  let free = 0;
  for (const p of parts) {
    let at = p.position;
    if (at === null || slots[at]?.state === "filled") {
      while (slots[free]?.state === "filled") free++;
      at = free;
    }
    slots[at] = { ...filled(kind, p.id, p.name), key: `${kind}-${at}-${p.id}` };
  }
  return slots;
}

function cosmetic(kind: PartKind, known: boolean, c: BattleCosmetic | null): Slot[] {
  if (!known) return unknown(kind, 1);
  return [c ? filled(kind, c.id, c.code) : blank(kind, 0, "empty")];
}

function camoLabel(kind: string | null | undefined): string {
  return kind === "camouflage" || kind === "paint" || kind === "style" ? t(`battles.${kind}`) : t("battles.camo");
}

function groups(l: BattleLoadout | null): Group[] {
  // Unverified loadouts are stored with their layout withheld, so they show as unknown.
  const known = !!l?.verified;
  return [
    {
      id: "module",
      label: t("battles.modules"),
      slots: !known
        ? unknown("module", MODULE_SLOTS)
        : l!.modules.length
          ? l!.modules.map((m) => filled("module", m.id, m.name))
          : [blank("module", 0, "empty")],
    },
    {
      id: "equipment",
      label: t("battles.equipment"),
      slots: known ? positioned("equipment", l!.equipment, EQUIPMENT_SLOTS) : unknown("equipment", EQUIPMENT_SLOTS),
    },
    {
      id: "perk",
      label: t("battles.agentSkills"),
      slots: known ? positioned("perk", l!.perks, PERK_SLOTS) : unknown("perk", PERK_SLOTS),
    },
    { id: "talisman", label: t("battles.talisman"), slots: cosmetic("talisman", known && l!.cosmetics, l?.talisman ?? null) },
    { id: "camo", label: camoLabel(l?.camo?.kind), slots: cosmetic("camo", known && l!.cosmetics, l?.camo ?? null) },
    {
      id: "outfit",
      label: t("battles.outfit"),
      slots: !(known && l!.cosmetics)
        ? unknown("outfit", 1)
        : l!.outfit.length
          ? l!.outfit.map((o) => filled("outfit", o.id, o.code))
          : [blank("outfit", 0, "empty", t("battles.outfitDefault"))],
    },
  ];
}

const builds = computed(() => {
  const list = props.loadouts ?? [];
  if (!list.length) return [{ key: "none", loadout: null, groups: groups(null) }];
  return list.map((l, i) => ({ key: `${l.id ?? "loadout"}-${i}`, loadout: l, groups: groups(l) }));
});

/** A swap mid-battle plays several loadouts; only then does each need naming. */
const several = computed(() => builds.value.length > 1);
const single = computed(() => (several.value ? null : builds.value[0].loadout));
const hatch = computed(() => ({ backgroundImage: `url('${assets.logo()}')` }));
</script>

<template>
  <section class="loadout">
    <header class="head">
      <span class="seal" aria-hidden="true"><i class="wedge flip" /><i class="wedge" /></span>
      <h4 class="title">{{ t("battles.loadout") }}</h4>
      <span v-if="!loadouts?.length" class="note">{{ t("battles.loadoutMissing") }}</span>
      <template v-else-if="single">
        <span class="code">{{ single.id }}</span>
        <span v-if="!single.verified" class="chip" :title="single.problem ?? undefined">{{ t("battles.unverified") }}</span>
      </template>
    </header>

    <div v-for="build in builds" :key="build.key" class="build">
      <div class="surface" />

      <div v-if="several && build.loadout" class="meta">
        <span class="meta-name">{{ [build.loadout.vehicle, build.loadout.agent].filter(Boolean).join(" · ") || DASH }}</span>
        <span class="code">{{ build.loadout.id }}</span>
        <span v-if="!build.loadout.verified" class="chip" :title="build.loadout.problem ?? undefined">
          {{ t("battles.unverified") }}
        </span>
      </div>

      <div class="groups">
        <div v-for="group in build.groups" :key="group.id" class="group" :class="group.id">
          <span class="group-label">{{ group.label }}</span>
          <div class="slots">
            <div v-for="slot in group.slots" :key="slot.key" class="slot" :class="slot.state" :title="slot.title ?? undefined">
              <span class="pic">
                <img v-if="slot.art" class="art" :src="slot.art" alt="" />
                <span v-else-if="slot.state === 'filled'" class="hatch" :style="hatch" />
              </span>
              <span class="name">{{ slot.label }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.loadout {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
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
  margin: 0;
  margin-right: var(--space-1);
  font-family: var(--font-primary);
  font-size: var(--main-font-size-3);
  letter-spacing: 0.06em;
  font-weight: var(--font-weight-3);
  line-height: normal;
  color: var(--text-main);
  text-transform: uppercase;
}

.note,
.code {
  font-family: var(--font-microcopy);
  font-size: var(--main-font-size-4);
  line-height: normal;
  color: var(--text-muted);
  white-space: nowrap;
}

.note {
  text-transform: uppercase;
}

.chip {
  padding: 2px var(--space-2);
  font-family: var(--font-microcopy);
  font-size: var(--main-font-size-4);
  line-height: normal;
  color: var(--error-base);
  text-transform: uppercase;
  white-space: nowrap;
  border: 1px solid var(--error-base);
  corner-shape: bevel;
  border-radius: 4px 0 4px 0;
  cursor: help;
}

.build {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-3);
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

.meta {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-width: 0;
}

.meta-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-primary);
  font-size: var(--main-font-size-3);
  font-weight: var(--font-weight-3);
  line-height: normal;
  color: var(--text-main);
  text-transform: uppercase;
}

.groups {
  position: relative;
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-4) var(--space-6);
}

.group {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.group-label {
  font-family: var(--font-primary);
  font-size: var(--main-font-size-4);
  font-weight: var(--font-weight-3);
  line-height: normal;
  color: var(--text-muted);
  text-transform: uppercase;
  white-space: nowrap;
}

.slots {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.slot {
  width: 64px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-1);
}

.pic {
  position: relative;
  width: 48px;
  height: 48px;
  box-sizing: border-box;
  overflow: hidden;
  background: var(--black-3-a);
  border: 1px solid var(--base-600);
  corner-shape: bevel;
  border-radius: 6px 0 6px 0;
}

.art {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  object-fit: contain;
}

.group.equipment .art,
.group.perk .art {
  padding: var(--space-2);
}

.hatch {
  position: absolute;
  inset: 0;
  background-repeat: repeat;
  background-size: 16px auto;
  opacity: 0.14;
  pointer-events: none;
}

.slot.empty .pic {
  background: transparent;
  border-style: dashed;
}

.slot.unknown .pic {
  background: var(--black-1-a);
  opacity: 0.5;
}

.name {
  max-width: 100%;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
  overflow-wrap: break-word;
  font-family: var(--font-microcopy);
  font-size: var(--main-font-size-4);
  line-height: 1.2;
  color: var(--text-main);
  text-align: center;
  text-transform: uppercase;
}

.slot.empty .name,
.slot.unknown .name {
  color: var(--text-muted);
  text-transform: uppercase;
}
</style>
