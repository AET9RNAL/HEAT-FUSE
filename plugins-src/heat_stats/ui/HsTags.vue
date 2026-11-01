<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { AnimatePresence, motion } from "motion-v";
import { Dynamics } from "fuse_ui/ui/dynamics.mjs";
import Icons from "fuse_ui/ui/Icons.vue";
import eSelect from "fuse_ui/ui/eSelect.vue";
import ePagination from "./ePagination.vue";
import { GROUPS, MARK_SLOTS, cleanTags, tagIcon, useTags } from "./tags.mjs";
import { useAssets } from "./assets.mjs";
import { useI18n } from "./i18n.mjs";

export interface TaggedPlayer {
  /** The game's player id; the only identity that survives a rename. */
  pid: string;
  name: string | null;
  /** Slot order. The first three are the ones the game draws. */
  tags: string[];
  battles: number | null;
}

const props = defineProps<{ tags: object | null }>();

const emit = defineEmits<{ action: [name: string, payload?: unknown] }>();

const { t, n, percent } = useI18n();
const assets = useAssets();
const marks = useTags();

const filter = ref("");
const hovered = ref("");

const dealt = ref(false);
onMounted(() => window.setTimeout(() => (dealt.value = true), 500));

const data = computed(() => (props.tags ?? {}) as { players?: unknown });

/** The plugin's shape, rebuilt: a group this build doesn't know would draw nothing. */
const players = computed<TaggedPlayer[]>(() =>
  (Array.isArray(data.value.players) ? data.value.players : []).flatMap((raw) => {
    const p = (raw ?? {}) as Record<string, unknown>;
    const pid = p.pid == null ? "" : String(p.pid);
    const tags = cleanTags(p.tags);
    if (!pid || !tags.length) return [];
    return [{
      pid,
      // Stored as `name#1234`, because that is what an in-battle scoreboard can
      // match on; the discriminator is not what anyone calls them.
      name: p.name == null ? null : String(p.name).split("#")[0] || null,
      tags,
      battles: typeof p.battles === "number" && Number.isFinite(p.battles) ? p.battles : null,
    }];
  }),
);

/** Groups whose feature is still in testing. */
const BETA = new Set(["blocked"]);

function padded(value: number) {
  const digits = String(Math.max(0, Math.trunc(value)));
  return { dim: "0".repeat(Math.max(0, 3 - digits.length)), lit: digits };
}

const groups = computed(() => {
  const all = players.value;
  return GROUPS.map((id, i) => {
    const held = all.filter((p) => p.tags.includes(id));
    return {
      id,
      channel: String(i + 1).padStart(2, "0"),
      label: t(`tags.${id}`),
      icon: assets.tag(tagIcon(id)),
      solid: assets.tag(tagIcon(id, true)),
      color: marks.color(id),
      count: held.length,
      pad: padded(held.length),
      /** Of those, the ones carrying this mark early enough for the game to draw it. */
      drawn: held.filter((p) => p.tags.indexOf(id) < MARK_SLOTS).length,
      share: all.length ? held.length / all.length : 0,
      beta: BETA.has(id),
    };
  });
});

const shown = computed(() =>
  filter.value ? players.value.filter((p) => p.tags.includes(filter.value)) : players.value,
);

const PAGE_SIZES = [5, 10, 20, 50, 75];
const sizes = PAGE_SIZES.map((s) => ({ value: s, label: String(s) }));
const pageSize = ref(10);
const page = ref(0);

watch([filter, pageSize], () => (page.value = 0));

// An untag can empty the last page.
const current = computed(() => Math.min(page.value, Math.max(0, Math.ceil(shown.value.length / pageSize.value) - 1)));
const first = computed(() => current.value * pageSize.value);
const paged = computed(() => shown.value.slice(first.value, first.value + pageSize.value));

const count = (v: number) => n(v, { maximumFractionDigits: 0 });

const readout = computed(() => {
  const list = shown.value;
  if (filter.value) {
    const drawn = list.filter((p) => p.tags.indexOf(filter.value) < MARK_SLOTS).length;
    const share = players.value.length ? list.length / players.value.length : 0;
    return [
      { id: "held", label: t("tags.readHeld"), value: count(list.length), lit: false },
      { id: "drawn", label: t("tags.readDrawn"), value: count(drawn), lit: true },
      { id: "benched", label: t("tags.readBenched"), value: count(list.length - drawn), lit: false },
      { id: "share", label: t("tags.readShare"), value: percent(share * 100, 0), lit: false },
    ];
  }
  let total = 0;
  let drawn = 0;
  for (const p of list) {
    total += p.tags.length;
    drawn += Math.min(p.tags.length, MARK_SLOTS);
  }
  return [
    { id: "tagged", label: t("tags.readTagged"), value: count(list.length), lit: false },
    { id: "marks", label: t("tags.readMarks"), value: count(total), lit: false },
    { id: "drawn", label: t("tags.readDrawn"), value: count(drawn), lit: true },
    { id: "benched", label: t("tags.readBenched"), value: count(total - drawn), lit: false },
  ];
});

function mask(url: string) {
  return { maskImage: `url("${url}")`, WebkitMaskImage: `url("${url}")` };
}

/** Reordering a player's own marks decides which of them the game draws. */
function move(player: TaggedPlayer, index: number, by: number): void {
  const next = [...player.tags];
  const to = index + by;
  if (to < 0 || to >= next.length) return;
  [next[index], next[to]] = [next[to], next[index]];
  emit("action", "tags", { op: "set", pid: player.pid, tags: next });
}

function untag(player: TaggedPlayer, id: string): void {
  const next = player.tags.filter((tag) => tag !== id);
  emit("action", "tags", next.length ? { op: "set", pid: player.pid, tags: next } : { op: "clear", pid: player.pid });
}

/** The slot whose group strip is open. An index past the last mark adds a mark. */
const editing = ref<{ pid: string; index: number } | null>(null);

watch([filter, page, pageSize], () => (editing.value = null));

function onKey(e: KeyboardEvent): void {
  if (e.key === "Escape") editing.value = null;
}
onMounted(() => window.addEventListener("keydown", onKey));
onBeforeUnmount(() => window.removeEventListener("keydown", onKey));

function isEditing(player: TaggedPlayer): boolean {
  return editing.value?.pid === player.pid;
}

function isEditingSlot(player: TaggedPlayer, index: number): boolean {
  return isEditing(player) && editing.value?.index === index;
}

function edit(player: TaggedPlayer, index: number): void {
  editing.value = isEditingSlot(player, index) ? null : { pid: player.pid, index };
}

function slotLabel(player: TaggedPlayer): string {
  const index = editing.value?.index ?? player.tags.length;
  return t(index < player.tags.length ? "tags.slot" : "tags.newSlot", { n: index + 1 });
}

/** held: in another slot, so a pick swaps. taken: a new mark cannot repeat a group the player has. */
function optionState(player: TaggedPlayer, id: string): "current" | "held" | "taken" | "free" {
  const index = editing.value?.index ?? -1;
  if (player.tags[index] === id) return "current";
  if (!player.tags.includes(id)) return "free";
  return index < player.tags.length ? "held" : "taken";
}

function optionTip(player: TaggedPlayer, id: string): string {
  const state = optionState(player, id);
  if (state === "current") return t("tags.current");
  if (state === "held") return t("tags.swaps", { slot: player.tags.indexOf(id) + 1 });
  if (state === "taken") return t("tags.taken");
  return t(`tags.${id}`);
}

/** Puts a group in the open slot. A group the player already carries swaps places, so no mark is lost. */
function pick(player: TaggedPlayer, id: string): void {
  const at = editing.value?.index ?? player.tags.length;
  editing.value = null;
  const next = [...player.tags];
  const held = next.indexOf(id);
  if (held === at) return;
  if (at >= next.length) {
    if (held >= 0 || next.length >= MARK_SLOTS) return;
    next.push(id);
  } else if (held >= 0) {
    [next[at], next[held]] = [next[held], next[at]];
  } else {
    next[at] = id;
  }
  emit("action", "tags", { op: "set", pid: player.pid, tags: next });
}
</script>

<template>
  <div class="tags">
    <div class="page">
      <section class="module">
        <div class="module-surface" />

        <header class="module-head">
          <div class="module-head-surface" />
          <span class="head-copy">
            <span class="seal" aria-hidden="true"><i class="wedge flip" /><i class="wedge" /></span>
            <h3 class="module-title">{{ t("tags.groups") }}</h3>
          </span>
          <span class="module-note rule">{{ t("tags.drawnNote", { count: MARK_SLOTS }) }}</span>
        </header>

        <div class="rack">
          <motion.button
            v-for="(g, i) in groups"
            :key="g.id"
            type="button"
            class="channel"
            :class="{ picked: filter === g.id, none: !g.count }"
            :style="{ '--ico': g.color }"
            :aria-pressed="filter === g.id"
            :initial="{ opacity: 0, y: 10 }"
            :animate="{ opacity: filter && filter !== g.id ? 0.4 : 1, y: 0 }"
            :while-hover="{ opacity: 1 }"
            :while-press="{ scale: 0.985 }"
            :transition="{ ...Dynamics.snappy, delay: dealt ? 0 : i * 0.05 }"
            @pointerenter="hovered = g.id"
            @pointerleave="hovered = ''"
            @click="filter = filter === g.id ? '' : g.id"
          >
            <span class="channel-face" />
            <span class="channel-tab"><i>{{ g.channel }}</i></span>

            <span class="channel-body">
              <span class="channel-main">
                <motion.span
                  class="channel-glyph"
                  :initial="false"
                  :animate="{ scale: filter === g.id ? 1.1 : hovered === g.id ? 1.06 : 1 }"
                  :transition="Dynamics.spring"
                >
                  <span class="glyph line" :style="mask(g.icon)" />
                  <span class="glyph solid" :style="mask(g.solid)" />
                </motion.span>

                <span class="channel-stack">
                  <span class="channel-label">{{ g.label }}</span>
                  <span class="channel-count">
                    <AnimatePresence :initial="false" mode="wait">
                      <motion.span
                        :key="g.count"
                        class="count-roll"
                        :initial="{ opacity: 0, y: -14 }"
                        :animate="{ opacity: 1, y: 0 }"
                        :exit="{ opacity: 0, y: 14 }"
                        :transition="Dynamics.quick"
                      >
                        <i>{{ g.pad.dim }}</i>{{ g.pad.lit }}
                      </motion.span>
                    </AnimatePresence>
                  </span>
                  <span class="channel-drawn">{{ t("tags.drawnOf", { count: count(g.drawn) }) }}</span>
                </span>
              </span>

              <span class="channel-bar">
                <motion.span
                  class="channel-fill"
                  :initial="{ width: '0%' }"
                  :animate="{ width: `${Math.round(g.share * 100)}%` }"
                  :transition="{ ...Dynamics.smooth, delay: dealt ? 0 : 0.1 + i * 0.05 }"
                />
              </span>
            </span>

            <span v-if="g.beta" class="channel-beta" :title="t(`tags.${g.id}Beta`)">{{ t("tags.beta") }}</span>
            <span v-else class="channel-bracket" aria-hidden="true" />
          </motion.button>
        </div>

        <div class="readout">
          <span class="readout-mark" aria-hidden="true"><i class="wedge flip" /><i class="wedge" /></span>
          <AnimatePresence :initial="false" mode="wait">
            <motion.span
              :key="filter || 'all'"
              class="cells"
              :initial="{ opacity: 0, y: 8 }"
              :animate="{ opacity: 1, y: 0 }"
              :exit="{ opacity: 0, y: -8 }"
              :transition="Dynamics.quick"
            >
              <span v-for="c in readout" :key="c.id" class="cell">
                <span class="cell-label">{{ c.label }}</span>
                <span class="cell-value" :class="{ lit: c.lit }">{{ c.value }}</span>
              </span>
            </motion.span>
          </AnimatePresence>
        </div>
      </section>

      <section class="module">
        <div class="module-surface" />

        <header class="module-head">
          <div class="module-head-surface" />
          <span class="head-copy">
            <span class="seal" :style="{ '--ico': filter ? marks.color(filter) : 'var(--base-600)' }" aria-hidden="true">
              <i class="wedge flip" /><i class="wedge" />
            </span>
            <AnimatePresence :initial="false" mode="wait">
              <motion.h3
                :key="filter || 'all'"
                class="module-title"
                :initial="{ opacity: 0, x: -6 }"
                :animate="{ opacity: 1, x: 0 }"
                :exit="{ opacity: 0, x: 6 }"
                :transition="Dynamics.quick"
              >
                {{ filter ? t(`tags.${filter}`) : t("tags.everyone") }}
              </motion.h3>
            </AnimatePresence>
          </span>
          <span class="head-aside">
            <span class="module-note">{{ t("tags.counted", { count: count(shown.length) }) }}</span>
            <button v-if="filter" type="button" class="module-link" @click="filter = ''">
              {{ t("tags.showAll") }}
            </button>
            <span class="size">
              <eSelect :model-value="pageSize" :options="sizes" @update:model-value="pageSize = Number($event)" />
            </span>
          </span>
        </header>

        <motion.p
          v-if="!shown.length"
          class="empty"
          :initial="{ opacity: 0, scale: 0.96 }"
          :animate="{ opacity: 1, scale: 1 }"
          :transition="Dynamics.snappy"
        >
          <span class="empty-plinth">
            <span class="empty-icon" :style="mask(assets.tag(filter || 'friend'))" />
          </span>
          <span>{{ filter ? t("tags.emptyGroup") : t("tags.empty") }}</span>
        </motion.p>

        <div v-else class="rows">
          <!-- popLayout takes a leaving row out of flow, so a page change does not stack both pages. -->
          <AnimatePresence mode="popLayout">
            <motion.div
              v-for="(p, rank) in paged"
              :key="p.pid"
              class="row"
              :class="{ editing: isEditing(p) }"
              :style="{ '--ico': marks.color(p.tags[0]) }"
              :initial="{ opacity: 0, x: 10 }"
              :animate="{ opacity: 1, x: 0 }"
              :exit="{ opacity: 0 }"
              :transition="{ ...Dynamics.snappy, delay: Math.min(rank, 12) * 0.02 }"
            >
              <span class="row-index">{{ String(first + rank + 1).padStart(3, "0") }}</span>

              <span class="row-copy">
                <span class="row-name">{{ p.name || t("tags.unknown") }}</span>
                <span v-if="p.battles != null" class="hint">
                  {{ t("tags.battles", { count: count(p.battles) }) }}
                </span>
              </span>

              <span class="marks">
                <span
                  v-for="(id, i) in p.tags"
                  :key="id"
                  class="mark"
                  :class="{ cut: i >= MARK_SLOTS, open: isEditingSlot(p, i) }"
                  :title="t(`tags.${id}`)"
                >
                  <span class="slot">{{ i < MARK_SLOTS ? i + 1 : "—" }}</span>
                  <button
                    type="button"
                    class="nudge"
                    :disabled="i === 0"
                    :aria-label="t('tags.moveUp')"
                    @click="move(p, i, -1)"
                  >
                    <Icons kind="arrow-left" size="small" color="var(--ico)" />
                  </button>
                  <button type="button" class="swap" :aria-label="t('tags.change')" :title="t('tags.change')" @click="edit(p, i)">
                    <span
                      class="mark-icon"
                      :style="{ ...mask(assets.tag(tagIcon(id, i < MARK_SLOTS))), '--ico': marks.color(id) }"
                    />
                  </button>
                  <button
                    type="button"
                    class="nudge back"
                    :disabled="i === p.tags.length - 1"
                    :aria-label="t('tags.moveDown')"
                    @click="move(p, i, 1)"
                  >
                    <Icons kind="arrow-left" size="small" color="var(--ico)" />
                  </button>
                  <button type="button" class="drop" :aria-label="t('tags.remove')" @click="untag(p, id)">
                    <Icons kind="cross" size="small" color="var(--ico)" />
                  </button>
                </span>
                <button
                  v-if="p.tags.length < MARK_SLOTS"
                  type="button"
                  class="mark add"
                  :class="{ open: isEditingSlot(p, p.tags.length) }"
                  :aria-label="t('tags.add')"
                  :title="t('tags.add')"
                  @click="edit(p, p.tags.length)"
                >
                  <span class="slot">{{ p.tags.length + 1 }}</span>
                  <span class="plus"><Icons kind="cross" size="small" color="var(--ico)" /></span>
                </button>
              </span>

              <AnimatePresence :initial="false">
                <motion.div
                  v-if="isEditing(p)"
                  key="picker"
                  class="picker"
                  :initial="{ height: 0, opacity: 0 }"
                  :animate="{ height: 'auto', opacity: 1 }"
                  :exit="{ height: 0, opacity: 0 }"
                  :transition="Dynamics.snappy"
                >
                  <span class="picker-inner">
                    <span class="picker-head">
                      <span class="seal" aria-hidden="true"><i class="wedge flip" /><i class="wedge" /></span>
                      <span class="picker-slot">{{ slotLabel(p) }}</span>
                    </span>
                    <span class="options">
                      <button
                        v-for="id in GROUPS"
                        :key="id"
                        type="button"
                        class="option"
                        :class="optionState(p, id)"
                        :style="{ '--ico': marks.color(id) }"
                        :title="optionTip(p, id)"
                        @click="pick(p, id)"
                      >
                        <span v-if="p.tags.includes(id) && optionState(p, id) !== 'current'" class="option-slot">
                          {{ p.tags.indexOf(id) + 1 }}
                        </span>
                        <span class="option-icon" :style="mask(assets.tag(tagIcon(id, true)))" />
                        <span class="option-label">{{ t(`tags.${id}`) }}</span>
                      </button>
                    </span>
                  </span>
                </motion.div>
              </AnimatePresence>
            </motion.div>
          </AnimatePresence>
        </div>

        <ePagination
          v-if="shown.length"
          :page="current"
          :page-size="pageSize"
          :total="shown.length"
          @page="page = $event"
        />
      </section>
    </div>
  </div>
</template>

<style scoped>
.tags {
  position: relative;
  display: flex;
  width: 100%;
  padding: var(--space-4);
  box-sizing: border-box;
}

.page {
  container-type: inline-size;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  width: 100%;
  min-width: 0;
}

.module {
  position: relative;
  width: 100%;
  min-width: 0;
  display: flex;
  flex-direction: column;
  padding: 0 var(--space-3) var(--space-3);
  box-sizing: border-box;
  background: var(--black-2-a);
}

.module-surface {
  position: absolute;
  inset: 0;
  box-sizing: border-box;
  background: var(--black-1-a);
  border: 1px solid var(--base-600);
  corner-shape: bevel;
  border-radius: 6px 0 6px 0;
  pointer-events: none;
}

.module-head {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  height: 46px;
  margin-bottom: var(--space-3);
}

.module-head-surface {
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

.head-copy,
.head-aside {
  position: relative;
  display: flex;
  align-items: center;
  min-width: 0;
  gap: var(--space-2);
}

.head-aside {
  flex: none;
  gap: var(--space-3);
}

.seal {
  --ico: var(--base-600);
  flex: none;
  display: flex;
  align-items: center;
  height: 10px;
}

.wedge {
  width: 10px;
  height: 10px;
  background: var(--ico);
  clip-path: polygon(0 100%, 50% 100%, 100% 50%, 50% 50%, 50% 0, 0 50%);
  transition: background 0.25s;
}

.wedge.flip {
  transform: rotate(180deg);
}

.module-title {
  position: relative;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  margin: 0;
  font-family: var(--font-primary);
  font-size: var(--main-font-size-2);
  font-weight: var(--font-weight-2);
  line-height: normal;
  color: var(--text-main);
  text-transform: uppercase;
  white-space: nowrap;
}

.module-note {
  position: relative;
  font-family: var(--font-microcopy);
  font-size: var(--secondary-font-size-4);
  color: var(--text-muted);
  white-space: nowrap;
}

.module-link {
  position: relative;
  padding: 0;
  border: none;
  background: none;
  font-family: var(--font-microcopy);
  font-size: var(--secondary-font-size-5);
  color: var(--text-main);
  text-decoration: underline;
  text-decoration-thickness: 1px;
  text-underline-offset: 2px;
  cursor: pointer;
  transition: color 0.15s;
}

.module-link:hover {
  color: var(--accent-200);
}

.size {
  position: relative;
  width: 4.5em;
}

.rack {
  position: relative;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: var(--space-2);
}

.channel {
  --cut: 8px;
  --ico: var(--accent-200);
  --ink: color-mix(in srgb, var(--ico) 12%, #000);
  position: relative;
  display: flex;
  align-items: stretch;
  height: 96px;
  padding: 0;
  margin: 0;
  border: none;
  box-sizing: border-box;
  background: color-mix(in srgb, var(--ico) 70%, transparent);
  text-align: left;
  cursor: pointer;
  transition: opacity 0.15s;
}

.channel-face {
  position: absolute;
  inset: 0;
  box-sizing: border-box;
  background: var(--black-2);
  border: 1px solid var(--base-600);
  corner-shape: bevel;
  border-radius: var(--cut) 0 var(--cut) 0;
  pointer-events: none;
  transition: background 0.15s, border-color 0.15s, border-radius 0.15s;
}

.channel:hover .channel-face {
  background: var(--black-3);
  border-color: var(--base-200);
}

.channel.picked {
  --cut: 18px;
  background: var(--black-1);
}

.channel.picked .channel-face {
  background: repeating-linear-gradient(135deg, color-mix(in srgb, var(--ink) 22%, transparent) 0 1px, transparent 1px 9px),
    var(--ico);
  border-color: var(--ico);
}

.channel-tab {
  position: relative;
  flex: none;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  width: 20px;
  margin: 1px 0 1px 1px;
  padding-top: var(--space-2);
  background: var(--ico);
  corner-shape: bevel;
  border-radius: calc(var(--cut) - 1px) 0 0 0;
  transition: background 0.15s, border-radius 0.15s;
}

.channel-tab i {
  writing-mode: vertical-rl;
  transform: rotate(180deg);
  font-family: var(--font-microcopy);
  font-size: var(--secondary-font-size-5);
  line-height: 1;
  letter-spacing: 0.12em;
  color: var(--ink);
  font-variant-numeric: tabular-nums;
  font-style: normal;
}

.channel.none .channel-tab {
  background: color-mix(in srgb, var(--ico) 45%, var(--black-2));
}

.channel.picked .channel-tab {
  background: var(--black-1);
}

.channel.picked .channel-tab i {
  color: var(--ico);
}

.channel-body {
  position: relative;
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding: var(--space-2);
}

.channel-main {
  flex: 1 1 auto;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}

.channel-stack {
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.mark-icon,
.option-icon,
.empty-icon,
.glyph {
  flex: none;
  background: var(--ico);
  mask-size: contain;
  mask-repeat: no-repeat;
  mask-position: center;
  -webkit-mask-size: contain;
  -webkit-mask-repeat: no-repeat;
  -webkit-mask-position: center;
}

.channel-glyph {
  position: relative;
  flex: none;
  width: 48px;
  height: 48px;
  background: color-mix(in srgb, var(--ico) 10%, transparent);
  corner-shape: bevel;
  border-radius: 12px 0 12px 0;
  transition: background 0.18s;
}

.glyph {
  position: absolute;
  inset: 8px;
}

.glyph.solid {
  opacity: 0;
  transition: opacity 0.18s;
}

.channel:hover .channel-glyph {
  background: color-mix(in srgb, var(--ico) 20%, transparent);
}

.channel:hover .glyph.solid,
.channel.picked .glyph.solid {
  opacity: 1;
}

.channel.none .channel-glyph {
  opacity: 0.4;
}

.channel.picked .channel-glyph {
  background: color-mix(in srgb, var(--ink) 15%, transparent);
}

.channel.picked .glyph {
  background: var(--ink);
}

.channel-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-primary);
  font-size: var(--main-font-size-4);
  font-weight: var(--font-weight-2);
  line-height: normal;
  letter-spacing: 0.04em;
  color: var(--text-main);
  text-transform: uppercase;
}

.channel.picked .channel-label {
  color: var(--ink);
}

.channel-count {
  display: block;
  height: 30px;
  overflow: hidden;
  font-family: var(--font-microcopy);
  font-size: 30px;
  line-height: 1;
  color: var(--text-main);
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
}

.count-roll {
  display: block;
}

.channel-count i {
  font-style: normal;
  color: var(--base-600);
}

.channel.picked .channel-count {
  color: var(--ink);
}

.channel.picked .channel-count i {
  color: color-mix(in srgb, var(--ink) 35%, transparent);
}

/* How many of them a battle would actually show. */
.channel-drawn {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  font-family: var(--font-microcopy);
  font-size: var(--secondary-font-size-5);
  line-height: 1;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.channel.picked .channel-drawn {
  color: color-mix(in srgb, var(--ink) 85%, transparent);
}

.channel-bar {
  position: relative;
  height: 6px;
  background: color-mix(in srgb, var(--base-600) 55%, transparent);
}

.channel.picked .channel-bar {
  background: color-mix(in srgb, var(--ink) 20%, transparent);
}

.channel-fill {
  display: block;
  height: 100%;
  min-width: 2px;
  background: repeating-linear-gradient(135deg, var(--ico) 0 2px, transparent 2px 5px),
    color-mix(in srgb, var(--ico) 22%, transparent);
}

.channel.picked .channel-fill {
  background: repeating-linear-gradient(135deg, var(--ink) 0 2px, transparent 2px 5px),
    color-mix(in srgb, var(--ink) 25%, transparent);
}

/* A registration bracket in the one corner the cuts leave square. */
.channel-bracket {
  position: absolute;
  top: 5px;
  right: 5px;
  width: 9px;
  height: 9px;
  border-top: 1px solid color-mix(in srgb, var(--base-200) 45%, transparent);
  border-right: 1px solid color-mix(in srgb, var(--base-200) 45%, transparent);
  pointer-events: none;
  transition: border-color 0.15s;
}

.channel:hover .channel-bracket {
  border-color: var(--text-muted);
}

.channel.picked .channel-bracket {
  border-color: color-mix(in srgb, var(--ink) 45%, transparent);
}

/* A beta group's badge sits in the corner the bracket holds on the other cards. */
.channel-beta {
  position: absolute;
  top: 5px;
  right: 5px;
  padding: 2px 4px;
  border: 1px solid var(--ico);
  background: repeating-linear-gradient(135deg, color-mix(in srgb, var(--ico) 22%, transparent) 0 1px, transparent 1px 4px);
  corner-shape: bevel;
  border-radius: 3px 0 3px 0;
  font-family: var(--font-microcopy);
  font-size: var(--secondary-font-size-5);
  line-height: 1;
  letter-spacing: 0.12em;
  color: var(--ico);
  text-transform: uppercase;
  transition: color 0.15s, border-color 0.15s;
}

.channel.picked .channel-beta {
  border-color: var(--ink);
  background: repeating-linear-gradient(135deg, color-mix(in srgb, var(--ink) 30%, transparent) 0 1px, transparent 1px 4px);
  color: var(--ink);
}

.readout {
  position: relative;
  display: flex;
  align-items: stretch;
  flex-wrap: wrap;
  margin-top: var(--space-2);
  box-sizing: border-box;
  background: var(--black-1-a);
  border: 1px solid var(--base-600);
  corner-shape: bevel;
  border-radius: 6px 0 6px 0;
}

.readout-mark {
  flex: none;
  display: flex;
  align-items: center;
  gap: 0;
  padding: 0 var(--space-3);
  background: repeating-linear-gradient(135deg, rgba(255, 255, 255, 0.045) 0 1px, transparent 1px 6px);
  border-right: 1px solid var(--base-600);
}

.readout-mark .wedge {
  width: 9px;
  height: 9px;
  background: var(--base-200);
}

.cells {
  flex: 1 1 auto;
  display: flex;
  flex-wrap: wrap;
  min-width: 0;
}

.cell {
  flex: 1 1 110px;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-0);
  padding: var(--space-2) var(--space-3);
  border-right: 1px solid var(--base-600);
}

.cell:last-child {
  border-right: none;
}

.cell-label {
  font-family: var(--font-microcopy);
  font-size: var(--secondary-font-size-5);
  line-height: 1;
  letter-spacing: 0.1em;
  color: var(--text-muted);
  text-transform: uppercase;
  white-space: nowrap;
}

.cell-value {
  font-family: var(--font-microcopy);
  font-size: var(--main-font-size-3);
  line-height: 1.1;
  color: var(--text-main);
  font-variant-numeric: tabular-nums;
}

.cell-value.lit {
  color: var(--accent-200);
}

@container (max-width: 520px) {
  .module-note.rule {
    display: none;
  }
}

.rows {
  position: relative;
  display: flex;
  flex-direction: column;
}

.row {
  --ico: var(--accent-200);
  position: relative;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  column-gap: var(--space-3);
  row-gap: 0;
  padding: var(--space-2) 0 var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--base-600);
}

.row.editing {
  background: linear-gradient(90deg, color-mix(in srgb, var(--ico) 6%, transparent), transparent 60%);
}

.row::before {
  content: "";
  position: absolute;
  left: 0;
  top: var(--space-2);
  bottom: var(--space-2);
  width: 3px;
  background: var(--ico);
  clip-path: polygon(0 4px, 100% 0, 100% calc(100% - 4px), 0 100%);
  transition: width 0.15s;
}

.row:hover::before {
  width: 5px;
}

.row:last-child {
  border-bottom: none;
}

.row-index {
  flex: none;
  font-family: var(--font-microcopy);
  font-size: var(--secondary-font-size-5);
  line-height: 1;
  letter-spacing: 0.08em;
  color: var(--base-600);
  font-variant-numeric: tabular-nums;
}

.row:hover .row-index {
  color: var(--text-muted);
}

.row-copy {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-0);
}

.row-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-primary);
  font-size: var(--main-font-size-3);
  font-weight: var(--font-weight-2);
  line-height: normal;
  color: var(--text-main);
}

.hint {
  font-family: var(--font-microcopy);
  font-size: var(--secondary-font-size-5);
  line-height: 1.3;
  color: var(--text-muted);
}

.marks {
  flex: none;
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.mark {
  --ico: var(--accent-200);
  display: inline-flex;
  align-items: center;
  height: 27px;
  box-sizing: border-box;
  background: var(--black-1-a);
  border: 1px solid var(--base-600);
  corner-shape: bevel;
  border-radius: 6px 0 6px 0;
  overflow: hidden;
}

.slot {
  display: flex;
  align-items: center;
  align-self: stretch;
  padding: 0 var(--space-1);
  background: color-mix(in srgb, var(--ico) 18%, transparent);
  font-family: var(--font-microcopy);
  font-size: var(--secondary-font-size-5);
  line-height: 1;
  color: var(--ico);
  font-variant-numeric: tabular-nums;
}

.mark.cut {
  --ico: var(--text-muted);
  opacity: 0.55;
}

.mark.cut .slot {
  background: repeating-linear-gradient(135deg, rgba(255, 255, 255, 0.08) 0 1px, transparent 1px 4px);
}

.mark.open {
  border-color: var(--ico);
}

.mark-icon {
  width: 17px;
  height: 17px;
}

/* The icon is the handle that opens the group strip for its slot. */
.swap {
  display: flex;
  align-items: center;
  align-self: stretch;
  padding: 0 var(--space-1);
  border: none;
  background: none;
  cursor: pointer;
  transition: background 0.15s;
}

.swap:hover,
.mark.open .swap {
  background: color-mix(in srgb, var(--ico) 14%, transparent);
}

/* The next free slot: the same plate, dashed, with a plus. */
.mark.add {
  --ico: var(--text-muted);
  padding: 0;
  border-style: dashed;
  background: none;
  cursor: pointer;
  transition: border-color 0.15s;
}

.mark.add:hover,
.mark.add.open {
  --ico: var(--accent-200);
  border-color: var(--ico);
}

.plus {
  display: flex;
  align-items: center;
  padding: 0 var(--space-1);
  transform: rotate(45deg);
}

.picker {
  flex: 0 0 100%;
  overflow: hidden;
}

.picker-inner {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-2) var(--space-3);
  padding: var(--space-2) 0 var(--space-1);
}

.picker-head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-right: auto;
}

.picker-head .seal {
  --ico: var(--text-muted);
}

.picker-slot {
  font-family: var(--font-microcopy);
  font-size: var(--secondary-font-size-5);
  line-height: 1;
  letter-spacing: 0.1em;
  color: var(--text-muted);
  text-transform: uppercase;
  white-space: nowrap;
}

.options {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--space-1);
}

.option {
  --ico: var(--accent-200);
  --ink: color-mix(in srgb, var(--ico) 12%, #000);
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  height: 27px;
  padding: 0 var(--space-2);
  box-sizing: border-box;
  border: 1px solid var(--base-600);
  background: var(--black-1-a);
  corner-shape: bevel;
  border-radius: 6px 0 6px 0;
  font-family: var(--font-microcopy);
  font-size: var(--secondary-font-size-5);
  line-height: 1;
  letter-spacing: 0.08em;
  color: var(--text-muted);
  text-transform: uppercase;
  white-space: nowrap;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
}

.option:hover {
  border-color: var(--ico);
  color: var(--text-main);
  background: color-mix(in srgb, var(--ico) 12%, transparent);
}

/* The group already in this slot inverts, like a picked channel. */
.option.current {
  border-color: var(--ico);
  background: var(--ico);
  color: var(--ink);
  cursor: default;
}

.option.current .option-icon {
  background: var(--ink);
}

.option.taken {
  opacity: 0.35;
  cursor: default;
}

.option.taken:hover {
  border-color: var(--base-600);
  color: var(--text-muted);
  background: var(--black-1-a);
}

.option-icon {
  width: 14px;
  height: 14px;
}

/* The slot a held group sits in now: picking it swaps the two. */
.option-slot {
  padding-right: var(--space-1);
  border-right: 1px solid var(--base-600);
  color: var(--ico);
  font-variant-numeric: tabular-nums;
}

.nudge,
.drop {
  display: flex;
  align-items: center;
  justify-content: center;
  align-self: stretch;
  padding: 0 2px;
  border: none;
  background: none;
  cursor: pointer;
  transition: background 0.15s;
}

.nudge {
  --ico: var(--text-muted);
}

.nudge:hover:not(:disabled),
.drop:hover {
  --ico: var(--text-main);
  background: rgba(255, 255, 255, 0.06);
}

.nudge:disabled {
  opacity: 0.25;
  cursor: default;
}

.nudge.back {
  transform: rotate(180deg);
}

.drop {
  --ico: var(--text-muted);
  border-left: 1px solid var(--base-600);
}

.drop:hover {
  --ico: var(--error-highlight);
  background: var(--error-color);
}

.empty {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  margin: 0;
  padding: var(--space-6) 0;
  font-family: var(--font-microcopy);
  font-size: var(--secondary-font-size-4);
  color: var(--text-muted);
  text-align: center;
}

/* The same cut plate the groups are built from, at rest. */
.empty-plinth {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  box-sizing: border-box;
  background: repeating-linear-gradient(135deg, rgba(255, 255, 255, 0.035) 0 1px, transparent 1px 8px),
    var(--black-2-a);
  border: 1px solid var(--base-600);
  corner-shape: bevel;
  border-radius: 14px 0 14px 0;
}

.empty-icon {
  --ico: var(--base-600);
  width: 24px;
  height: 24px;
}
</style>
