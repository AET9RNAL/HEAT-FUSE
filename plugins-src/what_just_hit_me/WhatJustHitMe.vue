<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { AnimatePresence, motion } from "motion-v";
import { Dynamics } from "fuse_ui/ui/dynamics.mjs";
import Icons from "fuse_ui/ui/Icons.vue";
import "fuse_ui/ui/tokens.css";

interface Row {
  id: number;
  attacker: string;
  vehicle: string;
  source: string;
  effect: string;
  value: number;
  relation: string;
  fatal: boolean;
  updates: number;
  lastMs: number;
}
interface View {
  alive: boolean;
  total: number;
  rows: Row[];
  hidden: number;
  missed: number;
  killer: { name: string; vehicle: string } | null;
}

const props = defineProps<{
  data: Partial<{ log: View; locale: string; messages: Record<string, string> }>;
  assetBase?: string;
}>();

/** Messages come from the plugin in the resolved locale; a missing key shows as its path. */
function t(key: string): string {
  return props.data?.messages?.[key] ?? key;
}

const SOURCES = new Set(["shell", "ramming", "falling", "indirect", "periodic"]);
const SOURCE_ICON: Record<string, { file?: string; kind?: string }> = {
  shell: { file: "damage_indication/ammo.png" },
  ramming: { file: "damage_indication/ram.png" },
  indirect: { file: "damage_indication/explosion.png" },
  falling: { kind: "arrow-down" },
  periodic: { kind: "reload" },
};
// Icons and colours the game's damage log uses for effectKind.
const EFFECT_ICON: Record<string, { file: string; color: string }> = {
  fire: { file: "taken_hit_indicator/ico_fire_dmg.png", color: "#C00000" },
  radiation: { file: "taken_hit_indicator/ico_radiation_dmg.png", color: "#00C000" },
  shock: { file: "taken_hit_indicator/ico_shocked_dmg.png", color: "#87CEEB" },
  blast: { file: "taken_hit_indicator/ico_explosion.png", color: "#A9A9A9" },
};

const INK = "#F2F2F2";
const FLASH = "#FFF87A";
const ERROR = "#FF6A62";
const MUTED = "var(--text-muted)";
const FADE_AFTER_MS = 8000;

const log = computed<View | null>(() => props.data?.log ?? null);
const rows = computed<Row[]>(() => log.value?.rows ?? []);
const dead = computed(() => log.value?.alive === false);
const killer = computed(() => (dead.value ? log.value?.killer ?? null : null));

const now = ref(Date.now());
let clock: ReturnType<typeof setInterval> | undefined;
onMounted(() => {
  clock = setInterval(() => (now.value = Date.now()), 500);
});
onUnmounted(() => clearInterval(clock));

function mask(file: string) {
  const url = `url("${props.assetBase ?? ""}/assets/${file}")`;
  return { maskImage: url, WebkitMaskImage: url };
}

function cause(r: Row): { file?: string; kind?: string; color: string } {
  const fx = EFFECT_ICON[r.effect];
  if (fx) return fx;
  return { ...(SOURCE_ICON[r.source] ?? { kind: "warning" }), color: MUTED };
}

function causeStyle(r: Row) {
  const c = cause(r);
  return c.file ? { ...mask(c.file), background: c.color } : {};
}

function padded(value: number) {
  const digits = String(Math.max(0, Math.trunc(value)));
  return { dim: "0".repeat(Math.max(0, 4 - digits.length)), lit: digits };
}

const total = computed(() => padded(log.value?.total ?? 0));

function who(r: Row): string {
  if (r.relation === "self") return t("overlay.you");
  return r.attacker || t("overlay.unknown");
}

function sourceLabel(r: Row): string {
  return t(SOURCES.has(r.source) ? `source.${r.source}` : "source.hit");
}
</script>

<template>
  <div class="wj-overlay">
    <div class="wj" :class="{ dead, idle: !log }">
      <header class="head">
        <span class="head-copy">
          <AnimatePresence :initial="false" mode="wait">
            <motion.span
              :key="dead ? 'dead' : 'live'"
              class="title"
              :initial="{ opacity: 0, x: -6 }"
              :animate="{ opacity: 1, x: 0 }"
              :exit="{ opacity: 0, x: 6 }"
              :transition="Dynamics.quick"
            >
              {{ dead ? t("overlay.destroyed") : t("overlay.damageLog") }}
            </motion.span>
          </AnimatePresence>
        </span>
        <span class="total">
          <span class="total-label">{{ t("overlay.life") }}</span>
          <motion.span
            :key="log?.total ?? 0"
            class="total-value"
            :initial="{ color: FLASH }"
            :animate="{ color: INK }"
            :transition="Dynamics.smooth"
          >
            <i>{{ total.dim }}</i>{{ total.lit }}
          </motion.span>
        </span>
      </header>

      <AnimatePresence :initial="false">
        <motion.div
          v-if="killer"
          key="killer"
          class="killer"
          :initial="{ opacity: 0, y: -8 }"
          :animate="{ opacity: 1, y: 0 }"
          :exit="{ opacity: 0, y: -8 }"
          :transition="Dynamics.snappy"
        >
          <span class="killer-tab"><i>{{ t("overlay.kia") }}</i></span>
          <span class="killer-plinth">
            <Icons kind="cross" size="normal" color="var(--error-highlight)" />
          </span>
          <span class="killer-copy">
            <span class="killer-label">{{ t("overlay.destroyedBy") }}</span>
            <span class="killer-name">{{ killer.name }}</span>
          </span>
          <span v-if="killer.vehicle" class="killer-vehicle">{{ killer.vehicle }}</span>
        </motion.div>
      </AnimatePresence>

      <div class="rows">
        <AnimatePresence :initial="false" mode="popLayout">
          <motion.div
            v-for="r in rows"
            :key="r.id"
            layout
            class="row"
            :class="[`rel-${r.relation}`, { fatal: r.fatal }]"
            :initial="{ opacity: 0, x: -12 }"
            :animate="{ opacity: now - r.lastMs > FADE_AFTER_MS && !r.fatal ? 0.5 : 1, x: 0 }"
            :exit="{ opacity: 0 }"
            :transition="Dynamics.snappy"
          >
            <span class="row-tab" />

            <span class="dmg">
              <span class="dmg-label">{{ sourceLabel(r) }}</span>
              <motion.span
                :key="r.value"
                class="dmg-value"
                :initial="{ scale: 1.15, color: FLASH }"
                :animate="{ scale: 1, color: r.fatal ? ERROR : INK }"
                :transition="Dynamics.snappy"
              >
                <i>{{ padded(r.value).dim }}</i>{{ padded(r.value).lit }}
              </motion.span>
            </span>

            <span class="cause">
              <span v-if="cause(r).file" class="cause-icon" :style="causeStyle(r)" />
              <Icons v-else :kind="cause(r).kind" size="normal" :color="cause(r).color" />
            </span>

            <span class="vehicle">{{ r.vehicle || "—" }}</span>
            <span class="actor">{{ who(r) }}</span>
            <span class="bracket" aria-hidden="true" />
          </motion.div>
        </AnimatePresence>
      </div>

      <p v-if="log && !rows.length" class="empty">{{ t("overlay.noHits") }}</p>

      <div v-if="log && (log.hidden || log.missed)" class="readout">
        <span v-if="log.hidden" class="cell">
          <span class="cell-label">{{ t("overlay.older") }}</span>
          <span class="cell-value">+{{ log.hidden }}</span>
        </span>
        <span v-if="log.missed" class="cell warn">
          <span class="cell-label">{{ t("overlay.missed") }}</span>
          <span class="cell-value">{{ log.missed }}</span>
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.wj-overlay {
  width: 100%;
  height: 100%;
  container-type: inline-size;
  pointer-events: none;
}

.wj {
  --u: calc(100cqw / 320);
  display: flex;
  flex-direction: column;
  gap: calc(3 * var(--u));
  width: 100%;
  max-height: 100%;
  overflow: hidden;
}

.wj.idle {
  opacity: 0.4;
}

.head {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: calc(8 * var(--u));
  height: calc(26 * var(--u));
  padding: 0 calc(8 * var(--u));
  box-sizing: border-box;
  background: var(--black-3-a);
  border: calc(1 * var(--u)) solid var(--base-600);
  corner-shape: bevel;
  border-radius: calc(6 * var(--u)) 0 0 0;
}

.head-copy {
  display: flex;
  align-items: center;
  gap: calc(6 * var(--u));
  min-width: 0;
}

.seal {
  --ico: var(--base-600);
  flex: none;
  display: flex;
  align-items: center;
}

.wj.dead .seal {
  --ico: var(--error-highlight);
}

/* .wedge {
  width: calc(7 * var(--u));
  height: calc(7 * var(--u));
  background: var(--ico);
  clip-path: polygon(0 100%, 50% 100%, 100% 50%, 50% 50%, 50% 0, 0 50%);
}

.wedge.flip {
  transform: rotate(180deg);
} */

.title {
  font-family: var(--font-primary);
  font-size: calc(11 * var(--u));
  font-weight: var(--font-weight-2);
  line-height: 1;
  color: var(--text-main);
  text-transform: uppercase;
  white-space: nowrap;
}

.wj.dead .title {
  color: var(--error-highlight);
}

.total {
  display: flex;
  align-items: baseline;
  gap: calc(5 * var(--u));
}

.total-label,
.dmg-label,
.killer-label,
.cell-label {
  font-family: var(--font-microcopy);
  font-size: calc(6.5 * var(--u));
  line-height: 1;
  letter-spacing: 0.1em;
  color: var(--text-muted);
  text-transform: uppercase;
  white-space: nowrap;
}

.dmg-label {
  overflow: hidden;
  text-overflow: ellipsis;
}

.total-value {
  font-family: var(--font-microcopy);
  font-size: calc(14 * var(--u));
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.total-value i,
.dmg-value i {
  font-style: normal;
  color: var(--base-600);
}

.killer {
  position: relative;
  display: grid;
  grid-template-columns: calc(14 * var(--u)) calc(24 * var(--u)) minmax(0, 1fr) auto;
  align-items: center;
  column-gap: calc(7 * var(--u));
  height: calc(34 * var(--u));
  padding-right: calc(8 * var(--u));
  box-sizing: border-box;
  overflow: hidden;
  background: repeating-linear-gradient(135deg, color-mix(in srgb, var(--error-highlight) 12%, transparent) 0 1px, transparent 1px 7px),
    color-mix(in srgb, var(--error-base) 28%, var(--black-2));
  border: calc(1 * var(--u)) solid var(--error-highlight);
  corner-shape: bevel;
  border-radius: calc(6 * var(--u)) 0 calc(6 * var(--u)) 0;
}

.killer-tab {
  align-self: stretch;
  display: flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--error-highlight) 30%, transparent);
  border-right: calc(1 * var(--u)) solid color-mix(in srgb, var(--error-highlight) 55%, transparent);
}

.killer-tab i {
  writing-mode: vertical-rl;
  transform: rotate(180deg);
  font-family: var(--font-microcopy);
  font-size: calc(6 * var(--u));
  font-style: normal;
  line-height: 1;
  letter-spacing: 0.12em;
  color: var(--error-highlight);
}

.killer-plinth {
  display: flex;
  align-items: center;
  justify-content: center;
  width: calc(24 * var(--u));
  height: calc(24 * var(--u));
  background: color-mix(in srgb, var(--error-highlight) 14%, transparent);
  corner-shape: bevel;
  border-radius: calc(7 * var(--u)) 0 calc(7 * var(--u)) 0;
}

.killer-copy {
  display: flex;
  flex-direction: column;
  gap: calc(2 * var(--u));
  min-width: 0;
}

.killer-label {
  color: var(--error-highlight);
}

.killer-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-primary);
  font-size: calc(12 * var(--u));
  font-weight: var(--font-weight-2);
  line-height: 1;
  color: var(--text-main);
}

.killer-vehicle,
.vehicle {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-microcopy);
  font-size: calc(8 * var(--u));
  line-height: 1;
  color: var(--text-muted);
  text-transform: uppercase;
}

.rows {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: calc(2 * var(--u));
}

.row {
  --tone: var(--base-600);
  position: relative;
  display: grid;
  grid-template-columns: calc(3 * var(--u)) calc(38 * var(--u)) calc(22 * var(--u)) minmax(0, 0.8fr) minmax(0, 1.2fr);
  align-items: center;
  column-gap: calc(7 * var(--u));
  height: calc(28 * var(--u));
  padding-right: calc(10 * var(--u));
  box-sizing: border-box;
  background: color-mix(in srgb, var(--black-2) 85%, transparent);
  border: calc(1 * var(--u)) solid var(--base-600);
  corner-shape: bevel;
  border-radius: 0 0 calc(6 * var(--u)) 0;
}

.rel-enemy {
  --tone: var(--woth-enemy);
}
.rel-ally {
  --tone: var(--woth-ally);
}
.rel-self {
  --tone: var(--text-muted);
}

.row.fatal {
  --tone: var(--error-highlight);
  background: repeating-linear-gradient(135deg, color-mix(in srgb, var(--error-highlight) 12%, transparent) 0 1px, transparent 1px 7px),
    color-mix(in srgb, var(--error-base) 24%, var(--black-2));
  border-color: var(--error-highlight);
}

.row-tab {
  align-self: stretch;
  margin: calc(4 * var(--u)) 0;
  background: var(--tone);
  clip-path: polygon(0 calc(3 * var(--u)), 100% 0, 100% calc(100% - 3 * var(--u)), 0 100%);
}

.dmg {
  display: flex;
  flex-direction: column;
  gap: calc(2 * var(--u));
  min-width: 0;
}

.dmg-value {
  display: block;
  transform-origin: left center;
  font-family: var(--font-microcopy);
  font-size: calc(13 * var(--u));
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.cause {
  display: flex;
  align-items: center;
  justify-content: center;
  width: calc(22 * var(--u));
  height: calc(22 * var(--u));
  background: color-mix(in srgb, var(--base-200) 8%, transparent);
  corner-shape: bevel;
  border-radius: calc(6 * var(--u)) 0 calc(6 * var(--u)) 0;
}

.cause-icon {
  width: calc(14 * var(--u));
  height: calc(14 * var(--u));
  mask-size: contain;
  mask-repeat: no-repeat;
  mask-position: center;
  -webkit-mask-size: contain;
  -webkit-mask-repeat: no-repeat;
  -webkit-mask-position: center;
}

.actor {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-primary);
  font-size: calc(11 * var(--u));
  font-weight: var(--font-weight-2);
  line-height: 1;
  color: var(--text-main);
}

.rel-self .actor {
  color: var(--text-muted);
}

.bracket {
  position: absolute;
  top: calc(3 * var(--u));
  right: calc(3 * var(--u));
  width: calc(5 * var(--u));
  height: calc(5 * var(--u));
  border-top: calc(1 * var(--u)) solid color-mix(in srgb, var(--base-200) 40%, transparent);
  border-right: calc(1 * var(--u)) solid color-mix(in srgb, var(--base-200) 40%, transparent);
}

.row.fatal .bracket {
  border-color: var(--error-highlight);
}

.empty {
  margin: 0;
  padding: calc(8 * var(--u));
  font-family: var(--font-microcopy);
  font-size: calc(8 * var(--u));
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.readout {
  display: flex;
  align-self: flex-start;
  background: var(--black-1-a);
  border: calc(1 * var(--u)) solid var(--base-600);
  corner-shape: bevel;
  border-radius: 0 0 calc(5 * var(--u)) 0;
}

.cell {
  display: flex;
  align-items: baseline;
  gap: calc(4 * var(--u));
  padding: calc(3 * var(--u)) calc(6 * var(--u));
  border-right: calc(1 * var(--u)) solid var(--base-600);
}

.cell:last-child {
  border-right: none;
}

.cell-value {
  font-family: var(--font-microcopy);
  font-size: calc(9 * var(--u));
  line-height: 1;
  color: var(--text-main);
  font-variant-numeric: tabular-nums;
}

.cell.warn .cell-label,
.cell.warn .cell-value {
  color: var(--warning-color);
}
</style>
