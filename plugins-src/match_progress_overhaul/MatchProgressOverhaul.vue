<script setup lang="ts">
import { computed, watch, onMounted } from "vue";
import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  useMotionTemplate,
  useVelocity,
  animate,
} from "motion-v";
import "fuse_ui/ui/tokens.css";

interface Overtime {
  progress: number;
  total: number;
  frac: number;
}
interface Board {
  inMatch: boolean;
  isControl?: boolean;
  enhanced?: boolean;
  ally?: string;
  enemy?: string;
  allyFill?: number;
  enemyFill?: number;
  allyTeamScore?: number | null;
  enemyTeamScore?: number | null;
  lead?: number;
  leader?: "ally" | "enemy" | "tie";
  allyNear?: boolean;
  enemyNear?: boolean;
  allyProj?: number;
  enemyProj?: number;
  projWinner?: "ally" | "enemy" | "tie";
  allyEta?: number;
  enemyEta?: number;
  time?: string;
  leads?: number;
  overtime?: Overtime | null;
}

const props = defineProps<{ data: Partial<{ board: Board }> }>();

const board = computed<Board>(() => props.data?.board ?? { inMatch: false });
const inMatch = computed(() => !!board.value.inMatch);

const ALLY_PATH =
  "M270.875 4.04199V15.0977L266.937 19.0352L218.634 19.0439L205.984 11.373L205.955 11.3555H205.92L21.4902 11.3447L0.499023 0.133789L266.958 0.125L270.875 4.04199Z";
const ENEMY_PATH =
  "M270.5 0.133789L249.509 11.3447L65.0801 11.3555H65.0449L65.0156 11.373L52.3652 19.0439L4.0625 19.0352L0.125 15.0977V4.04199L4.04102 0.125L270.5 0.133789Z";
const ALLY_INNER =
  "M198.49 7.48L13.97 7.47L0 0.01L258.19 0L261.01 2.82V12.32L258.17 15.16L211.17 15.17L198.49 7.48Z";
const ENEMY_INNER =
  "M2.84 15.16L0 12.32V2.82L2.82 0L261.01 0.01L247.04 7.47L62.52 7.48L49.84 15.17L2.84 15.16Z";

const clamp01 = (n: number | undefined): number => Math.max(0, Math.min(1, n ?? 0));


function makeBar(side: "ally" | "enemy") {
  const target = useMotionValue(0);
  const fill = useSpring(target, { stiffness: 140, damping: 24, mass: 0.6 });

  const hiddenPct = useTransform(fill, (v: number) => (1 - clamp01(v)) * 100);
  const clip =
    side === "ally"
      ? useMotionTemplate`inset(0 ${hiddenPct}% 0 0)`
      : useMotionTemplate`inset(0 0 0 ${hiddenPct}%)`;

  const bright = useTransform(useVelocity(fill), (v: number) => 1 + Math.min(Math.abs(v) * 0.45, 0.45));
  const filter = useMotionTemplate`brightness(${bright})`;

  const outStart = side === "ally" ? -30 : 130;
  const outEnd = side === "ally" ? 130 : -30;
  const sweepPos = useMotionValue(outStart);
  const sweepOpacity = useMotionValue(0);
  const sweepLeft = useMotionTemplate`${sweepPos}%`;
  function sweep(): void {
    sweepPos.set(outStart);
    sweepOpacity.set(0.55);
    animate(sweepPos, outEnd, { duration: 0.65, ease: "easeOut" });
    animate(sweepOpacity, 0, { duration: 0.65, ease: "easeIn" });
  }

  // Pace ghost: projected fill a few seconds out, revealed the same way as fill.
  const projTarget = useMotionValue(0);
  const projSpring = useSpring(projTarget, { stiffness: 90, damping: 20, mass: 0.6 });
  const projHidden = useTransform(projSpring, (v: number) => (1 - clamp01(v)) * 100);
  const projClip =
    side === "ally"
      ? useMotionTemplate`inset(0 ${projHidden}% 0 0)`
      : useMotionTemplate`inset(0 0 0 ${projHidden}%)`;

  return { target, clip, filter, sweepLeft, sweepOpacity, sweep, projTarget, projClip };
}

const ally = makeBar("ally");
const enemy = makeBar("enemy");

// ── P1 decision cues ──
const enhanced = computed(() => board.value.enhanced !== false);
const leader = computed(() => board.value.leader ?? "tie");
const leadTarget = useMotionValue(0);
const leadSpring = useSpring(leadTarget, { stiffness: 120, damping: 22, mass: 0.6 });
watch(() => board.value.lead, (v) => leadTarget.set(typeof v === "number" ? v : 0));
const leadLeft = useTransform(leadSpring, (v: number) => `${v > 0 ? 50 - v * 50 : 50}%`);
const leadWidth = useTransform(leadSpring, (v: number) => `${Math.abs(v) * 50}%`);

function drive(bar: ReturnType<typeof makeBar>, next: number | undefined): void {
  const v = clamp01(next);
  if (v > bar.target.get() + 0.001) bar.sweep();
  bar.target.set(v);
}
watch(() => board.value.allyFill, (v) => drive(ally, v));
watch(() => board.value.enemyFill, (v) => drive(enemy, v));
watch(() => board.value.allyProj, (v) => ally.projTarget.set(clamp01(v)));
watch(() => board.value.enemyProj, (v) => enemy.projTarget.set(clamp01(v)));
onMounted(() => {
  ally.target.set(clamp01(board.value.allyFill));
  enemy.target.set(clamp01(board.value.enemyFill));
  ally.projTarget.set(clamp01(board.value.allyProj));
  enemy.projTarget.set(clamp01(board.value.enemyProj));
  leadTarget.set(typeof board.value.lead === "number" ? board.value.lead : 0);
});

// Projected-winner ETA
function fmtEta(s: number): string {
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}
const projEtaStr = computed(() => {
  const w = board.value.projWinner;
  const e = w === "ally" ? board.value.allyEta : w === "enemy" ? board.value.enemyEta : -1;
  return typeof e === "number" && e >= 0 ? fmtEta(e) : "";
});

const overtime = computed(() => board.value.overtime ?? null);
</script>

<template>
  <div v-if="inMatch" class="mph">
    <svg width="0" height="0" class="mph-defs" aria-hidden="true">
      <defs>
        <filter
          id="mphInnerGlow"
          x="0"
          y="0"
          width="261.01"
          height="15.17"
          filterUnits="userSpaceOnUse"
          color-interpolation-filters="sRGB"
        >
          <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha" />
          <feOffset />
          <feGaussianBlur stdDeviation="1" />
          <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1" />
          <feColorMatrix type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 1 0" />
          <feBlend mode="normal" in2="SourceGraphic" />
        </filter>
      </defs>
    </svg>

    <div class="mph-row">
      <span v-if="board.allyTeamScore != null" class="mph-teamscore mph-teamscore--ally">{{ board.allyTeamScore }}</span>

      <div
        class="mph-bar mph-bar--ally"
        :class="{ trailing: enhanced && leader === 'enemy', near: enhanced && board.allyNear }"
      >
        <svg class="mph-svg" viewBox="0 0 271 20" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
          <path :d="ALLY_PATH" fill="#0b0b0b" fill-opacity="0.5" stroke="#8abddc" stroke-width="0.25" />
        </svg>
        <motion.div v-if="enhanced" class="mph-ghost" :style="{ clipPath: ally.projClip }">
          <svg class="mph-svg" viewBox="0 0 271 20" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
            <path :d="ALLY_PATH" fill="var(--woth-ally)" />
          </svg>
        </motion.div>
        <motion.div class="mph-fill" :style="{ clipPath: ally.clip, filter: ally.filter }">
          <svg class="mph-svg" viewBox="0 0 271 20" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
            <path :d="ALLY_PATH" fill="var(--woth-ally)" />
            <path :d="ALLY_INNER" transform="translate(8.5 2)" fill="#7abfdf" filter="url(#mphInnerGlow)" />
          </svg>
          <motion.div class="mph-sweep" :style="{ left: ally.sweepLeft, opacity: ally.sweepOpacity }" />
        </motion.div>
        <span class="mph-score mph-score--ally">{{ board.ally }}</span>
      </div>

      <div class="mph-time">{{ board.time }}</div>

      <div
        class="mph-bar mph-bar--enemy"
        :class="{ trailing: enhanced && leader === 'ally', near: enhanced && board.enemyNear }"
      >
        <svg class="mph-svg" viewBox="0 0 271 20" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
          <path :d="ENEMY_PATH" fill="#0b0b0b" fill-opacity="0.5" stroke="#ff6d46" stroke-width="0.25" />
        </svg>
        <motion.div v-if="enhanced" class="mph-ghost" :style="{ clipPath: enemy.projClip }">
          <svg class="mph-svg" viewBox="0 0 271 20" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
            <path :d="ENEMY_PATH" fill="var(--woth-enemy)" />
          </svg>
        </motion.div>
        <motion.div class="mph-fill" :style="{ clipPath: enemy.clip, filter: enemy.filter }">
          <svg class="mph-svg" viewBox="0 0 271 20" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
            <path :d="ENEMY_PATH" fill="var(--woth-enemy)" />
            <path :d="ENEMY_INNER" transform="translate(1.5 2)" fill="#ff6d46" filter="url(#mphInnerGlow)" />
          </svg>
          <motion.div class="mph-sweep" :style="{ left: enemy.sweepLeft, opacity: enemy.sweepOpacity }" />
        </motion.div>
        <span class="mph-score mph-score--enemy">{{ board.enemy }}</span>
      </div>

      <span v-if="board.enemyTeamScore != null" class="mph-teamscore mph-teamscore--enemy">{{ board.enemyTeamScore }}</span>
    </div>

    <div v-if="enhanced" class="mph-lead">
      <div
        class="mph-eta"
        :class="`eta-${board.projWinner}`"
        :style="{ visibility: projEtaStr ? 'visible' : 'hidden' }"
      >▸ {{ projEtaStr || "0:00" }}</div>
      <div class="mph-lead-track">
        <motion.div class="mph-lead-fill" :class="`lead-${leader}`" :style="{ left: leadLeft, width: leadWidth }" />
        <span class="mph-lead-center" />
      </div>
    </div>

    <div v-if="overtime" class="mph-ot">
      <div class="mph-ot-label">Overtime</div>
      <div class="mph-ot-bar"><span :style="{ width: clamp01(overtime.frac) * 100 + '%' }" /></div>
    </div>
  </div>
</template>

<style scoped>
.mph {
  --near-glow: 15px;

  width: 100%;
  height: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-1);
  font-family: var(--font-primary);
  color: var(--text-main);
  container-type: size;
  user-select: none;
  overflow: hidden;
}
.mph-defs {
  position: absolute;
  width: 0;
  height: 0;
}

.mph-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-1);
  height: clamp(14px, 46cqh, 33px);
}

.mph-bar {
  position: relative;
  height: 100%;
  aspect-ratio: 271 / 20;
  transition: opacity 0.2s;
}
.mph-bar--ally {
  --glow: var(--woth-ally);
}
.mph-bar--enemy {
  --glow: var(--woth-enemy);
}
/* Leader emphasis: dim the trailing side so ordinal is pre-attentive. */
.mph-bar.trailing {
  opacity: 0.5;
}
/* Proximity*/
.mph-bar.near {
  animation: mph-pulse 0.85s ease-in-out infinite;
}
/* Attention grabber, I estimate this will suffice to be noticeble enough vua peripheral vision */
@keyframes mph-pulse {
  0%,
  100% {
    filter: drop-shadow(0 0 calc(var(--near-glow) * 0.25) var(--glow));
  }
  50% {
    filter: drop-shadow(0 0 var(--near-glow) var(--glow))
      drop-shadow(0 0 calc(var(--near-glow) * 2) var(--glow)) brightness(1.15);
  }
}
.mph-svg {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
}
.mph-fill {
  position: absolute;
  inset: 0;
  overflow: hidden;
  will-change: clip-path, filter;
}
/* Pace ghost: */
.mph-ghost {
  position: absolute;
  inset: 0;
  overflow: hidden;
  opacity: 0.26;
  pointer-events: none;
}

.mph-sweep {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 26%;
  transform: translateX(-50%);
  background: linear-gradient(90deg, transparent 0%, rgba(255, 255, 255, 0.6) 50%, transparent 100%);
  mix-blend-mode: screen;
  pointer-events: none;
}

.mph-score {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  z-index: 1;
  font-size: clamp(9px, 60cqh, 18px);
  font-weight: var(--font-weight-2);
  line-height: 1;
  color: var(--text-main);
  white-space: nowrap;
}
.mph-score--ally {
  right: 3%;
}
.mph-score--enemy {
  left: 3%;
}

.mph-teamscore {
  flex: none;
  min-width: 0.8em;
  text-align: center;
  font-family: var(--font-primary);
  font-weight: var(--font-weight-1);
  font-size: clamp(10px, 55cqh, 17px);
  line-height: 1;
}
.mph-teamscore--ally {
  color: var(--woth-ally);
}
.mph-teamscore--enemy {
  color: var(--woth-enemy);
}

.mph-time {
  flex: none;
  min-width: 40px;
  text-align: center;
  padding: 2px var(--space-1);
  background: var(--black-1-alpha, #0b0b0b80);
  font-family: var(--font-microcopy);
  font-size: clamp(9px, 40cqh, 18px);
  font-weight: var(--font-weight-2);
  color: var(--text-main);
  clip-path: polygon(3px 0%, 100% 0%, 100% calc(100% - 3px), calc(100% - 3px) 100%, 0% 100%, 0% 3px);
}

.mph-ot {
  flex: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  width: 100px;
}
.mph-ot-label {
  font-family: var(--font-primary);
  font-size: var(--main-font-size-4);
  font-weight: var(--font-weight-1);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  /* color: var(--yellow, #ffea00); */
}
.mph-ot-bar {
  width: 100%;
  height: 6px;
  background: var(--black-1-alpha, #0b0b0b80);
  overflow: hidden;
}
.mph-ot-bar > span {
  display: block;
  height: 100%;
  background: #f9d970;
  box-shadow: inset 0 0 2px 0 #fff;
  transition: width 0.2s linear;
}

.mph-lead {
  flex: none;
  width: 62%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
}
/* Projected-winner ETA to the win threshold. */
.mph-eta {
  font-family: var(--font-microcopy);
  font-size: clamp(7px, 22cqh, 11px);
  font-weight: var(--font-weight-2);
  letter-spacing: 0.04em;
  line-height: 1;
  min-height: 1em;
}
.mph-eta.eta-ally {
  color: var(--woth-ally);
}
.mph-eta.eta-enemy {
  color: var(--woth-enemy);
}
.mph-lead-track {
  position: relative;
  width: 100%;
  height: clamp(3px, 12cqh, 6px);
  background: var(--black-1-alpha, #0b0b0b80);
  overflow: hidden;
}
.mph-lead-fill {
  position: absolute;
  top: 0;
  bottom: 0;
}
.mph-lead-fill.lead-ally {
  background: var(--woth-ally);
  box-shadow: inset 0 0 2px 0 rgba(255, 255, 255, 0.5);
}
.mph-lead-fill.lead-enemy {
  background: var(--woth-enemy);
  box-shadow: inset 0 0 2px 0 rgba(255, 255, 255, 0.5);
}
.mph-lead-fill.lead-tie {
  display: none;
}
.mph-lead-center {
  position: absolute;
  left: 50%;
  top: -1px;
  bottom: -1px;
  width: 1px;
  transform: translateX(-50%);
  background: var(--base-200);
  opacity: 0.7;
}
</style>
