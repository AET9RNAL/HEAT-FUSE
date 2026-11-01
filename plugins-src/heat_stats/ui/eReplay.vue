<script lang="ts">
/** One replay as the plugin's replays.ts shapes it. */
export interface ReplayView {
  name: string;
  mapSlug: string;
  map: string;
  mode: string;
  startedAt: number | null;
  durationS: number | null;
  size: number;
  branch: string | null;
  build: "ready" | "old" | "unknown";
  install: string | null;
  inGame: boolean;
  kept: boolean;
  writing: boolean;
  playing: boolean;
  result: { outcome: string; vehicle: string; score: number; kills: number; deaths: number; damage: number } | null;
}
</script>

<script setup lang="ts">
import { computed } from "vue";
import eButton from "fuse_ui/ui/eButton.vue";
import { useAssets } from "./assets.mjs";
import { useI18n } from "./i18n.mjs";

const props = defineProps<{
  replay: ReplayView;
  canKeep: boolean;
  canPlay: boolean;
  /** Another replay is on screen. */
  busy: boolean;
}>();

const emit = defineEmits<{ action: [op: string] }>();

const { t, n, fixed, compact } = useI18n();
const assets = useAssets();

const pad = (v: number) => String(v).padStart(2, "0");

const played = computed(() => {
  const at = props.replay.startedAt != null ? new Date(props.replay.startedAt) : null;
  if (!at || Number.isNaN(at.getTime())) return n(null);
  return `${pad(at.getMonth() + 1)}-${pad(at.getDate())} ${pad(at.getHours())}:${pad(at.getMinutes())}`;
});

const duration = computed(() => {
  const s = props.replay.durationS;
  return s == null ? n(null) : `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
});

const size = computed(() => t("replays.size", { value: fixed(props.replay.size / 1024 ** 2, 1) }));

function modeName(key: string): string {
  if (!key) return n(null);
  const path = `modes.${key.toLowerCase().replace(/[\s_-]/g, "")}`;
  const label = t(path);
  return label === path ? key.replace(/_/g, " ") : label;
}

const art = computed(() => assets.map(props.replay.mapSlug));

const tone = computed(() => {
  const o = props.replay.result?.outcome;
  return o === "win" || o === "loss" ? o : "even";
});

const build = computed(() => {
  const r = props.replay;
  if (r.writing) return { key: "writing", label: t("replays.writing"), tip: t("replays.writingTip") };
  if (r.build === "ready") {
    return { key: "ready", label: t("replays.ready", { install: t(`replays.platform.${r.install ?? "wgc"}`) }), tip: "" };
  }
  if (r.build === "old") {
    return { key: "old", label: t("replays.old"), tip: t("replays.oldTip", { branch: r.branch ?? n(null) }) };
  }
  return { key: "unknown", label: t("replays.unknown"), tip: t("replays.unknownTip") };
});

const playText = computed(() => (props.replay.playing ? t("replays.playing") : t("replays.play")));
const canStart = computed(
  () =>
    props.canPlay && !props.busy && !props.replay.playing && !props.replay.writing && props.replay.build !== "old",
);
</script>

<template>
  <article class="replay" :class="[tone, { playing: replay.playing }]">
    <span class="tab"><i>{{ played }}</i></span>

    <span class="art" :class="{ blank: !art }">
      <img v-if="art" :src="art" alt="" draggable="false" />
    </span>

    <span class="ident">
      <span class="ident-map">{{ replay.map }}</span>
      <span class="ident-where">
        {{ modeName(replay.mode) }}
        <i class="dot" />
        {{ duration }}
        <i class="dot" />
        {{ size }}
      </span>
    </span>

    <span class="result">
      <template v-if="replay.result">
        <span class="result-head">
          <span class="chip">{{ t(`battles.${replay.result.outcome || "draw"}`) }}</span>
          <span class="result-vehicle">{{ replay.result.vehicle || n(null) }}</span>
        </span>
        <span class="result-figures">
          {{ t("replays.figures", {
            score: compact(replay.result.score),
            kills: n(replay.result.kills),
            deaths: n(replay.result.deaths),
            damage: compact(replay.result.damage),
          }) }}
        </span>
      </template>
      <span v-else class="result-none">{{ t("replays.noResult") }}</span>
    </span>

    <span class="tags">
      <span class="tag" :class="build.key" :title="build.tip || undefined">{{ build.label }}</span>
      <span v-if="replay.kept" class="tag kept" :title="replay.inGame ? undefined : t('replays.keptOnlyTip')">
        {{ replay.inGame ? t("replays.kept") : t("replays.keptOnly") }}
      </span>
    </span>

    <span class="actions">
      <span v-if="canKeep && replay.inGame && !replay.kept" class="action">
        <eButton
          variant="ghost"
          icon="download"
          :text="t('replays.keep')"
          :disabled="replay.writing"
          @click="emit('action', 'keep')"
        />
      </span>
      <span v-else-if="replay.kept" class="action">
        <eButton
          :variant="replay.inGame ? 'ghost' : 'danger'"
          icon="delete"
          :text="replay.inGame ? t('replays.unkeep') : t('replays.delete')"
          :confirm="replay.inGame ? '' : t('replays.confirmDelete')"
          :disabled="replay.playing"
          @click="emit('action', 'unkeep')"
        />
      </span>
      <span class="action">
        <eButton
          variant="accent"
          icon="play"
          :text="playText"
          :disabled="!canStart"
          @click="emit('action', 'play')"
        />
      </span>
    </span>
  </article>
</template>

<style scoped>
.replay {
  --tone: var(--base-600);

  position: relative;
  min-height: 72px;
  box-sizing: border-box;
  display: grid;
  grid-template-columns: 26px 120px minmax(0, 1.3fr) minmax(0, 1.3fr) auto auto;
  align-items: center;
  column-gap: var(--space-3);
  padding-right: var(--space-3);
  overflow: hidden;
  background: var(--black-2);
  border: 1px solid var(--base-600);
  corner-shape: bevel;
  border-radius: 6px 0 6px 0;
  transition: border-color 0.15s, background 0.15s;
}

.replay:hover {
  background: var(--black-3);
  border-color: var(--base-200);
}

.replay.win {
  --tone: var(--accent-200);
}

.replay.loss {
  --tone: var(--error-base);
}

.replay.playing {
  border-color: var(--accent-200);
}

.tab {
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

.art {
  position: relative;
  height: 54px;
  overflow: hidden;
  background: var(--black-1);
  corner-shape: bevel;
  border-radius: 10px 0 10px 0;
}

.art img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0.8;
  transition: opacity 0.15s;
}

.replay:hover .art img {
  opacity: 1;
}

.art.blank {
  background: repeating-linear-gradient(135deg, rgba(255, 255, 255, 0.04) 0 1px, transparent 1px 7px), var(--black-1);
}

.ident,
.result {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.ident-map,
.ident-where,
.result-vehicle,
.result-figures,
.result-none {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ident-map {
  font-family: var(--font-primary);
  font-size: var(--main-font-size-3);
  font-weight: var(--font-weight-2);
  line-height: 1.1;
  color: var(--text-main);
  text-transform: uppercase;
}

.ident-where {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  font-family: var(--font-microcopy);
  font-size: var(--secondary-font-size-5);
  line-height: 1.1;
  letter-spacing: 0.06em;
  color: var(--text-muted);
  text-transform: uppercase;
}

.dot {
  flex: none;
  width: 5px;
  height: 5px;
  background: var(--base-600);
  clip-path: polygon(0 100%, 50% 100%, 100% 50%, 50% 50%, 50% 0, 0 50%);
}

.result-head {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.chip {
  flex: none;
  padding: 1px var(--space-2);
  background: var(--tone);
  font-family: var(--font-primary);
  font-size: var(--secondary-font-size-5);
  font-weight: var(--font-weight-1);
  line-height: 1.2;
  letter-spacing: 0.12em;
  color: color-mix(in srgb, var(--tone) 10%, #000);
  text-transform: uppercase;
}

.result-vehicle {
  font-family: var(--font-microcopy);
  font-size: var(--main-font-size-4);
  line-height: 1.1;
  color: var(--text-main);
}

.result-figures,
.result-none {
  font-family: var(--font-microcopy);
  font-size: var(--secondary-font-size-5);
  line-height: 1.1;
  letter-spacing: 0.06em;
  color: var(--text-muted);
  text-transform: uppercase;
  font-variant-numeric: tabular-nums;
}

.result-none {
  color: var(--base-600);
}

/* No `min-width: 0`: the column never gets narrower than its longest tag, so a tag cannot run under the buttons. */
.tags {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--space-1);
}

.tag {
  padding: 2px var(--space-2);
  font-family: var(--font-microcopy);
  font-size: var(--secondary-font-size-5);
  line-height: 1.2;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  white-space: nowrap;
  color: var(--text-muted);
  background: color-mix(in srgb, var(--base-200) 8%, transparent);
}

.tag.ready {
  color: var(--accent-200);
  background: color-mix(in srgb, var(--accent-200) 12%, transparent);
}

.tag.old {
  color: var(--warning-color);
  background: color-mix(in srgb, var(--warning-color) 14%, transparent);
}

.tag.writing {
  color: var(--text-main);
  background: repeating-linear-gradient(135deg, rgba(255, 255, 255, 0.08) 0 1px, transparent 1px 5px);
}

.tag.kept {
  color: var(--text-main);
  border: 1px solid var(--base-600);
  background: none;
}

.actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.action {
  width: 8.5em;
}
</style>
