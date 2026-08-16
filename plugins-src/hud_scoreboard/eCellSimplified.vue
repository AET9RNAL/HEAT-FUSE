<script setup lang="ts">
import { computed, ref, watch, onBeforeUnmount } from "vue";
import "fuse_ui/ui/tokens.css";
import FlameWrap from "canvas_ui/ui/FlameWrap.vue";
import WaveWarp from "canvas_ui/ui/WaveWarp.vue";

export interface SimpleCell {
  role: string;
  dead: boolean;
  health: number | null;
  isSelf: boolean;
  leader: boolean;
  /** Squad group ID within the team; 0 = solo (no squad). */
  squad: number;
}

const props = defineProps<{ cell: SimpleCell; assetBase: string; side: "ally" | "enemy" }>();

// Same palette and index rule as eSquadCell, so a squad reads identically here.
const SQUAD_PALETTE = ["#a3fcb7", "#f95252", "#f9ee52", "#52f95a", "#52f9ee", "#5255f9", "#c752f9"];
const squadColor = computed(
  () => SQUAD_PALETTE[(Math.max(1, props.cell.squad) - 1) % SQUAD_PALETTE.length],
);

const CLASS_ROLES = new Set(["assault", "defender", "marksman"]);

function iconVar(suffix: string): string {
  const r = props.cell.role;
  return CLASS_ROLES.has(r) ? `url("${props.assetBase ?? ""}/assets/icons/class/${r}${suffix}.svg")` : "none";
}
const iconUrl = computed(() => iconVar(""));
const outlineUrl = computed(() => iconVar("_outline"));

// Fill height encodes HP
const fillPct = computed(() => {
  if (props.cell.dead) return 0;
  const h = props.cell.health;
  return h == null ? 100 : Math.max(0, Math.min(100, h));
});

// The wave rides the fill's surface, so it is invisible at an empty or full
// icon — unmount it there rather than run a WebGL context per cell for nothing.
// Wider release band than engage band: without it, HP hovering on a boundary
// would thrash a GL context up and down every tick.
const warpOn = ref(false);
watch(
  () => fillPct.value,
  (p) => {
    warpOn.value = warpOn.value ? p > 1 && p < 97 : p > 2 && p < 95;
  },
  { immediate: true },
);

// Team leader flame
const FLAME_IN_MS = 220;
const FLAME_OUT_MS = 420;
const easeOutExpo = (t: number): number => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);

const flameLevel = ref(0);
let flameRaf = 0;

function fadeFlame(to: number): void {
  cancelAnimationFrame(flameRaf);
  const from = flameLevel.value;
  if (from === to) return;
  const up = to > from;
  const dur = up ? FLAME_IN_MS : FLAME_OUT_MS;
  const start = performance.now();
  const step = (now: number) => {
    const t = Math.min((now - start) / dur, 1);
    const e = up ? easeOutExpo(t) : easeOutCubic(t);
    flameLevel.value = from + (to - from) * e;
    if (t < 1) flameRaf = requestAnimationFrame(step);
    else flameLevel.value = to;
  };
  flameRaf = requestAnimationFrame(step);
}

watch(() => props.cell.leader, (on) => fadeFlame(on ? 1 : 0), { immediate: true });

const flameOn = computed(() => flameLevel.value > 0.001);
const flameIntensity = computed(() => 1.15 * flameLevel.value);

// FlameWrap's reach/spread/turbulence props are CSS pixels, so they track the
// measured icon or the fire body outgrows the rect and reads as a blob.
const iconEl = ref<HTMLElement | null>(null);
const iconH = ref(0);
let iconRo: ResizeObserver | null = null;
watch(iconEl, (el) => {
  iconRo?.disconnect();
  iconRo = null;
  if (el) {
    iconRo = new ResizeObserver(([entry]) => {
      const box = entry.borderBoxSize?.[0];
      iconH.value = box ? box.blockSize : entry.contentRect.height;
    });
    iconRo.observe(el);
  }
});

// Wave amplitude/length are CSS pixels, so they track the icon like the flame's.
const waveGeom = computed(() => {
  const h = iconH.value || 32;
  return { waveHeight: h * 0.025, 
          waveWidth: h * 1.2 };
});

const flameGeom = computed(() => {
  const h = iconH.value || 32;
  return {
    height: h * 1.55,
    spread: h * 0.06,
    turbulenceReach: h * 0.18,
  };
});

// trace-content reads the silhouette out of the captured texture, so the capture
// box has to be bigger than the icon: the field needs room to decay, and the art
// must not touch an edge (CLAMP_TO_EDGE would smear it outward forever).
const flamePad = computed(() => {
  const h = iconH.value || 32;
  return { x: h * 0.28, top: h * 0.55, bottom: h * 0.22 };
});
const flameBoxStyle = computed(() => {
  const p = flamePad.value;
  return { left: `${-p.x}px`, right: `${-p.x}px`, top: `${-p.top}px`, bottom: `${-p.bottom}px` };
});
const flameShapeStyle = computed(() => {
  const p = flamePad.value;
  return { left: `${p.x}px`, right: `${p.x}px`, top: `${p.top}px`, bottom: `${p.bottom}px` };
});
const ALLY_FLAME: [number, number, number] = [0.48, 0.74, 0.86]; // --woth-ally #7abfdf
const ENEMY_FLAME: [number, number, number] = [1.0, 0.43, 0.28]; // --woth-enemy #ff6d46
const flameColor = computed(() => (props.side === "enemy" ? ENEMY_FLAME : ALLY_FLAME));

onBeforeUnmount(() => {
  cancelAnimationFrame(flameRaf);
  iconRo?.disconnect();
});
</script>

<template>
  <div
    class="esimp"
    :class="[side, { dead: cell.dead, self: cell.isSelf, leader: cell.leader }]"
    :style="{ '--icon': iconUrl, '--outline': outlineUrl, '--hp': fillPct + '%' }"
  >
    <div v-if="cell.squad > 0" class="esimp-squad" :style="{ background: squadColor }" />

    <div ref="iconEl" class="esimp-icon">

      <div class="esimp-art esimp-art--plain">
        <div v-if="warpOn" class="esimp-warpbox">
          <WaveWarp
            class="esimp-warp"
            wave-type="sine"
            v-bind="waveGeom"
            :direction="0"
            :wave-speed="0.5"
            pinning="none"
            :phase="0"
            antialiasing="high"
          >
            <div class="esimp-fill" />
          </WaveWarp>
        </div>
        <div v-else class="esimp-fill" />
        <div class="esimp-stroke" />
      </div>

      <!-- FlameWrap burns its own root box and sets position inline, so the
           capture-sized box has to be this wrapper. The slot is a plain
           silhouette: trace-only means it shapes the fire without ever being
           drawn, so the HP fill's clip edge can't put a burning front inside
           the icon and the art keeps rendering normally above. -->
      <div v-if="flameOn" class="esimp-flamebox" :style="flameBoxStyle">
        <FlameWrap
          class="esimp-flame"
          :color="flameColor"
          :intensity="flameIntensity"
          v-bind="flameGeom"
          trace-content
          trace-only
          :radius="5"
          :speed="0.7"
          :scale="0.8"
          :turbulence="0.7"
          :turbulence-scale="3"
          :sparks="3"
          :spark-size="0.35"
          :spark-density="1"
          :spark-speed="0.5"
          :rim="1.2"
          :smoke="2"
          :scorch="2"
        >
          <div class="esimp-flame-shape" :style="flameShapeStyle" />
        </FlameWrap>
      </div>
    </div>
  </div>
</template>

<style scoped>
.esimp {
  position: relative;
  width: 100%;
  height: 100%;
  container-type: size;
  --col: var(--woth-ally);
}

.esimp-squad {
  position: absolute;
  left: 0;
  right: 0;
  bottom: calc(100% + var(--space-2));
  height: clamp(2px, 8cqh, 4px);
}
.esimp-icon {
  position: absolute;
  inset: 0;
}
.esimp.enemy {
  --col: var(--woth-enemy);
}
.esimp.self {
  --col: var(--canary-yellow);
}

.esimp-fill,
.esimp-stroke {
  position: absolute;
  inset: 0;
  z-index: 1;
  background: var(--col);
  -webkit-mask-repeat: no-repeat;
  mask-repeat: no-repeat;
  -webkit-mask-position: center;
  mask-position: center;
}

/* HP fill revealed bottom-up. */
.esimp-fill {
  -webkit-mask-image: var(--icon);
  mask-image: var(--icon);
  -webkit-mask-size: contain;
  mask-size: contain;
  clip-path: inset(calc(100% - var(--hp)) 0 0 0);
  opacity: 0.9;
  transition: clip-path 0.25s linear;
}

/* Icon strok */
.esimp-stroke {
  -webkit-mask-image: var(--outline);
  mask-image: var(--outline);
  -webkit-mask-size: contain;
  mask-size: contain;
}
.esimp-flamebox {
  position: absolute;
  z-index: 1;
  pointer-events: none;
}
.esimp-flame {
  width: 100%;
  height: 100%;
}

.esimp-art {
  position: absolute;
}

/* WaveWarp's root sets position inline, so the sizing box is this wrapper.
   Masked to the silhouette as well: the warp pushes pixels past the outline,
   and the fill's own mask is applied before the displacement, not after. */
.esimp-warpbox {
  position: absolute;
  inset: 0;
  -webkit-mask-image: var(--icon);
  mask-image: var(--icon);
  -webkit-mask-size: contain;
  mask-size: contain;
  -webkit-mask-position: center;
  mask-position: center;
  -webkit-mask-repeat: no-repeat;
  mask-repeat: no-repeat;
}
.esimp-warp {
  width: 100%;
  height: 100%;
}

/* Trace stand-in: solid, HP-independent, never drawn (trace-only). Colour is
   irrelevant — only its alpha reaches the shader. */
.esimp-flame-shape {
  position: absolute;
  background: #000;
  -webkit-mask-image: var(--icon);
  mask-image: var(--icon);
  -webkit-mask-size: contain;
  mask-size: contain;
  -webkit-mask-position: center;
  mask-position: center;
  -webkit-mask-repeat: no-repeat;
  mask-repeat: no-repeat;
}

.esimp-art--plain {
  inset: 0;
  filter: drop-shadow(0 0 1px var(--black-1)) ;
}
.esimp.dead {
  opacity: 0.45;
}
.esimp.dead .esimp-stroke {
  background: var(--text-muted);
  filter: none;
}
</style>
