<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, provide, reactive, ref, watch } from "vue";
import { AnimatePresence, animate, motion, useMotionValue, useMotionValueEvent, useSpring } from "motion-v";
import { Dynamics } from "fuse_ui/ui/dynamics.mjs";
import "fuse_ui/ui/tokens.css";
import eCapturePoint from "./components/eCapturePoint.vue";
import MapEditor from "./components/MapEditor.vue";
import OverlayShapes from "./components/OverlayShapes.vue";
import { I18N, createI18n } from "./components/i18n.mjs";

interface ViewBlip {
  x: number;
  y: number;
  aff: number;
  type: number;
  platoon: number;
  age: number;
  role?: string;
  heading?: number;
  inbound?: boolean;
}
interface ViewBase {
  sign: string;
  status: number;
  progress: number;
  x: number | null;
  y: number | null;
  bearing: number;
  icon?: string;
  iconBlink?: boolean;
}
interface MapLayer {
  image: string;
  x0: number;
  ytop: number;
  w: number;
  h: number;
}
interface MinimapView {
  map: (MapLayer & { wide?: MapLayer | null }) | null;
  player: { x: number; y: number; camera: number; turret: number } | null;
  blips: ViewBlip[];
  bases: ViewBase[];
  warn: { id: number; rel: number; side: string } | null;
  threat?: boolean;
  radarRange: number;
  mapName: string;
  contacts: number;
  sim: boolean;
}
interface MinimapStyle {
  shape: string;
  orientation: string;
  range: number;
  mapOpacity: number;
  radarRing: boolean;
  safeCone: number;
  showSafeCone: boolean;
  warnRange: number;
  warnInvert: boolean;
  pointScale?: number;
  colors?: MinimapColors;
  /** Range while the Zoom Out key is down. */
  zoomRange?: number;
  zoomed?: boolean;
}
interface MinimapColors {
  you: string;
  squad: string;
  ally: string;
  enemy: string;
  contested: string;
  neutral: string;
}

interface OverlayFeature {
  id: string;
  kind: string;
  points: [number, number][];
  tag: string;
  label: string;
  stroke: string;
  fill: string;
  width: number;
  modes: string[];
  roles: string[];
  vehicles: string[];
}
/** The editor's data, from the plugin. Its shape lives in MapEditor.vue. */
type EditorData = InstanceType<typeof MapEditor>["$props"]["editor"];

const props = defineProps<{
  data: Partial<{
    view: MinimapView;
    style: MinimapStyle;
    overlays: OverlayFeature[];
    editor: EditorData | null;
    editorPlayer: { x: number; y: number; heading: number } | null;
    editorCmd: { id: number; type: string } | null;
    locale: string;
    messages: Record<string, string>;
  }>;
  assetBase?: string;
  interactive?: boolean;
  emitAction?: (action: string, payload?: unknown) => void;
}>();

const GAME_COLORS: MinimapColors = {
  you: "#FFD85C",
  squad: "#78D098",
  ally: "#7ABFDF",
  enemy: "#FF6D46",
  contested: "#FFD85C",
  neutral: "#D0CBC4",
};
const INK = "#F2F2F2";
const FLASH = "#FFF87A";
const DEFAULT_STYLE: MinimapStyle = {
  shape: "circle",
  orientation: "heading",
  range: 400,
  mapOpacity: 0.9,
  radarRing: true,
  safeCone: 180,
  showSafeCone: true,
  warnRange: 300,
  warnInvert: false,
  pointScale: 2,
};
const WARN_SPAN = 26;
/** Near-critical damping: follows the 10 Hz radar read without overshoot. */
const TRACK = { stiffness: 320, damping: 36, mass: 1 };
/** A jump this long (respawn, new match) snaps instead of sliding across the map. */
const SNAP_M = 150;
const ZOOM = { stiffness: 380, damping: 40, mass: 1 };

const style = computed(() => props.data?.style ?? DEFAULT_STYLE);
const colors = computed(() => ({ ...GAME_COLORS, ...style.value.colors }));
/** The CSS rules read the warning and arrow colours from these. */
const colorVars = computed(() => ({
  "--woth-enemy": colors.value.enemy,
  "--woth-ally": colors.value.ally,
  "--mm-you": colors.value.you,
}));
// The plugin pushes the messages of the chosen language; the editor reads them through useI18n.
const i18n = createI18n({
  get locale() {
    return props.data?.locale ?? "en";
  },
  get messages() {
    return props.data?.messages ?? {};
  },
});
provide(I18N, i18n);
const t = i18n.t;

const view = computed(() => props.data?.view ?? null);
const editor = computed(() => props.data?.editor ?? null);
const overlays = computed(() => props.data?.overlays ?? []);
const player = computed(() => view.value?.player ?? null);
const zoomed = computed(() => style.value.zoomed === true && (style.value.zoomRange ?? 0) > 0);
const rangeTarget = computed(() => (zoomed.value ? style.value.zoomRange! : style.value.range));
const rangeMv = useMotionValue(rangeTarget.value);
const rangeSpring = useSpring(rangeMv, ZOOM);
const shownRange = ref(rangeTarget.value);
useMotionValueEvent(rangeSpring, "change", (v: number) => (shownRange.value = v));
watch(rangeTarget, (v) => rangeMv.set(v));
/** View radius in metres*/
const R = computed(() => shownRange.value);
/** Icon unit in metres: 1/200 of the view */
const u = computed(() => R.value / 100);
const round = computed(() => style.value.shape !== "square");
const viewBox = computed(() => `${-R.value} ${-R.value} ${2 * R.value} ${2 * R.value}`);

function wrap180(deg: number): number {
  return ((((deg + 180) % 360) + 360) % 360) - 180;
}

function polar(deg: number, r: number): [number, number] {
  const a = (deg * Math.PI) / 180;
  return [r * Math.sin(a), -r * Math.cos(a)];
}

function arc(from: number, to: number, r: number): string {
  const [x0, y0] = polar(from, r);
  const [x1, y1] = polar(to, r);
  const large = to - from > 180 ? 1 : 0;
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

function padded(value: number, len: number) {
  const digits = String(Math.max(0, Math.trunc(value)));
  return { dim: "0".repeat(Math.max(0, len - digits.length)), lit: digits };
}

// ---- Smoothed player: the radar read arrives at about 10 Hz, the springs draw every frame ----

function follower() {
  const target = useMotionValue(0);
  const spring = useSpring(target, TRACK);
  return { target, spring };
}
const cam = follower();
const tur = follower();
const px = follower();
const py = follower();
const shown = reactive({ cam: 0, tur: 0, x: 0, y: 0 });
useMotionValueEvent(cam.spring, "change", (v: number) => (shown.cam = v));
useMotionValueEvent(tur.spring, "change", (v: number) => (shown.tur = v));
useMotionValueEvent(px.spring, "change", (v: number) => (shown.x = v));
useMotionValueEvent(py.spring, "change", (v: number) => (shown.y = v));

let seen = false;
let rawCam = 0;
let rawTur = 0;
watch(player, (p) => {
  if (!p) {
    seen = false;
    return;
  }
  const snap = !seen || Math.hypot(p.x - px.target.get(), p.y - py.target.get()) > SNAP_M;
  // Angles accumulate the short way round, so 179° to -179° turns 2°, not 358°.
  const camTo = snap ? p.camera : cam.target.get() + wrap180(p.camera - rawCam);
  const turTo = snap ? p.turret : tur.target.get() + wrap180(p.turret - rawTur);
  rawCam = p.camera;
  rawTur = p.turret;
  const pairs: [ReturnType<typeof follower>, number][] = [
    [cam, camTo],
    [tur, turTo],
    [px, p.x],
    [py, p.y],
  ];
  for (const [f, v] of pairs) {
    if (snap) {
      f.target.jump(v);
      f.spring.jump(v);
    } else {
      f.target.set(v);
    }
  }
  if (snap) Object.assign(shown, { cam: camTo, tur: turTo, x: p.x, y: p.y });
  seen = true;
});

/** Map turn in degrees. In "View Up" the view direction points up. */
const rot = computed(() => (style.value.orientation === "north" ? 0 : shown.cam));

// ---- Drawing square: the largest square that fits the stage ----

const stage = ref<HTMLElement | null>(null);
const box = ref(0);
let ro: ResizeObserver | null = null;
// The editor replaces the stage element, so measure whichever stage element exists now.
watch(
  stage,
  (el) => {
    ro?.disconnect();
    ro = null;
    if (!el) return;
    const measure = () => {
      box.value = Math.floor(Math.min(el.clientWidth, el.clientHeight));
    };
    measure();
    ro = new ResizeObserver(measure);
    ro.observe(el);
  },
  { flush: "post" },
);
onBeforeUnmount(() => ro?.disconnect());

const viewStyle = computed(() => ({ width: `${box.value}px`, height: `${box.value}px` }));

const mapUrl = computed(() => {
  const m = view.value?.map;
  return m ? `${props.assetBase ?? ""}/assets/${m.image}` : "";
});
const wideUrl = computed(() => {
  const w = view.value?.map?.wide;
  return w ? `${props.assetBase ?? ""}/assets/${w.image}` : "";
});

/** An image moves on the GPU: centre, turn, then the player's offset from the image corner. */
function layerStyle(m: MapLayer | null | undefined) {
  if (!m || !player.value || !box.value) return null;
  const s = box.value / (2 * R.value);
  const half = box.value / 2;
  return {
    width: `${m.w * s}px`,
    height: `${m.h * s}px`,
    transform:
      `translate(${half}px, ${half}px) rotate(${-rot.value}deg) ` +
      `translate(${(m.x0 - shown.x) * s}px, ${(shown.y - m.ytop) * s}px)`,
  };
}
const mapStyle = computed(() => layerStyle(view.value?.map));
/** The coarse wide capture fills the view where the HD image ends. */
const wideStyle = computed(() => layerStyle(view.value?.map?.wide));

// ---- World layer: drawn at (x, -y) in metres, turned and centred on the player ----

const worldTransform = computed(() => `rotate(${-rot.value}) translate(${-shown.x} ${shown.y})`);
/** Keeps icons and letters upright inside the turned world layer. */
const upright = computed(() => `rotate(${rot.value})`);

/** A 100 m grid, shown when this map has no image. */
const grid = computed(() => {
  if (view.value?.map || !player.value) return [];
  const step = 100;
  const span = R.value * 1.5;
  const lines: { x1: number; y1: number; x2: number; y2: number }[] = [];
  for (let x = Math.floor((shown.x - span) / step) * step; x <= shown.x + span; x += step) {
    lines.push({ x1: x, y1: -(shown.y - span), x2: x, y2: -(shown.y + span) });
  }
  for (let y = Math.floor((shown.y - span) / step) * step; y <= shown.y + span; y += step) {
    lines.push({ x1: shown.x - span, y1: -y, x2: shown.x + span, y2: -y });
  }
  return lines;
});

const CLASS_ICONS = ["assault", "defender", "marksman"];
/** The icon for each air type of the radar (tools/minimap_air_icons.py). Type 1, the proxy pet, stays a dot. */
const AIR_ICONS: Record<number, string> = { 2: "heli", 3: "plane", 4: "drone", 5: "missile" };
const iconMasks = computed(() => {
  const base = `${props.assetBase ?? ""}/assets/icons`;
  return [
    ...CLASS_ICONS.flatMap((r) => [
      { id: `mm-cls-${r}`, href: `${base}/classes/${r}.svg` },
      { id: `mm-cls-${r}-outline`, href: `${base}/classes/${r}_outline.svg` },
    ]),
    ...Object.values(AIR_ICONS).flatMap((n) => [
      { id: `mm-air-${n}`, href: `${base}/air/${n}.png` },
      { id: `mm-air-${n}-outline`, href: `${base}/air/${n}_outline.png` },
    ]),
  ];
});

const blips = computed(() =>
  (view.value?.blips ?? []).map((b, i) => {
    const role = b.type === 0 && b.role && CLASS_ICONS.includes(b.role) ? b.role : "";
    const air = b.type > 0 ? (AIR_ICONS[b.type] ?? "") : "";
    const mask = role ? `mm-cls-${role}` : air ? `mm-air-${air}` : "";
    return {
      key: i,
      x: b.x,
      y: b.y,
      // An air icon turns with its heading, as on the game radar. Ground icons stay upright.
      transform: air ? `translate(${b.x} ${-b.y}) rotate(${b.heading ?? 0})` : `translate(${b.x} ${-b.y}) ${upright.value}`,
      color: b.aff === 4 ? colors.value.enemy : b.platoon > 0 ? colors.value.squad : colors.value.ally,
      kind: mask ? "icon" : b.aff === 4 ? "enemy" : "ally",
      half: (air ? 9 : 4) * u.value,
      fillMask: mask ? `url(#${mask})` : "",
      outlineMask: mask ? `url(#${mask}-outline)` : "",
      inbound: b.inbound === true,
      opacity: 1 - 0.65 * b.age,
    };
  }),
);
const inbound = computed(() => blips.value.filter((b) => b.inbound));

const pointW = computed(() => 9 * u.value * (style.value.pointScale ?? 2));
const pointHalfH = computed(() => (pointW.value * 38) / 50);
const rimChevron = computed(() => {
  const k = u.value;
  const top = pointHalfH.value + 2 * k;
  return `M ${-3 * k} ${-top} L 0 ${-top - 3.5 * k} L ${3 * k} ${-top}`;
});

const shownBases = computed(() => (view.value?.bases ?? []).filter((b) => b.status !== 2));

const knownBases = computed(() =>
  shownBases.value
    .filter((b) => b.x !== null && b.y !== null)
    .map((b) => ({ ...b, transform: `translate(${b.x ?? 0} ${-(b.y ?? 0)}) ${upright.value}` })),
);

/** Capture points with no known position: on the rim, in their direction. */
const rimBases = computed(() =>
  shownBases.value
    .filter((b) => b.x === null || b.y === null)
    .map((b) => {
      const angle = b.bearing - rot.value;
      // Inside the rim with room for the chevron, at any point size.
      const [x, y] = polar(angle, Math.max(R.value * 0.4, R.value * 0.94 - pointHalfH.value - 6 * u.value));
      return {
        ...b,
        transform: `translate(${x.toFixed(2)} ${y.toFixed(2)})`,
        chevron: `rotate(${angle.toFixed(1)})`,
      };
    }),
);


const viewAngle = computed(() => shown.cam - rot.value);
const arrowTransform = computed(() => `rotate(${viewAngle.value.toFixed(1)})`);
const turretTransform = computed(() => `rotate(${(shown.tur - rot.value).toFixed(1)})`);
const arrow = computed(() => {
  const k = u.value;
  return `M 0 ${-6.5 * k} L ${4.6 * k} ${4.8 * k} L 0 ${2.2 * k} L ${-4.6 * k} ${4.8 * k} Z`;
});

/** Where a new enemy plays the warning tone: outside the silent front cone, inside or beyond the range. */
const warnZone = computed(() => {
  if (!style.value.showSafeCone || !player.value) return null;
  const half = style.value.safeCone / 2;
  const far = R.value * 1.5;
  const range = Math.min(style.value.warnRange, far);
  const ri = style.value.warnInvert ? range : 0;
  const ro = style.value.warnInvert ? far : range;
  const large = 360 - 2 * half > 180 ? 1 : 0;
  const [ox0, oy0] = polar(half, ro);
  const [ox1, oy1] = polar(360 - half, ro);
  const [ix0, iy0] = polar(half, ri);
  const [ix1, iy1] = polar(360 - half, ri);
  const f = (v: number) => v.toFixed(1);
  const fill =
    ri > 0
      ? `M ${f(ox0)} ${f(oy0)} A ${ro} ${ro} 0 ${large} 1 ${f(ox1)} ${f(oy1)} L ${f(ix1)} ${f(iy1)} A ${ri} ${ri} 0 ${large} 0 ${f(ix0)} ${f(iy0)} Z`
      : `M 0 0 L ${f(ox0)} ${f(oy0)} A ${ro} ${ro} 0 ${large} 1 ${f(ox1)} ${f(oy1)} Z`;
  const [rx0, ry0] = polar(half, range);
  const [rx1, ry1] = polar(360 - half, range);
  return {
    transform: arrowTransform.value,
    ri,
    ro,
    fill,
    edges: `M ${f(ox0)} ${f(oy0)} L ${f(ix0)} ${f(iy0)} M ${f(ox1)} ${f(oy1)} L ${f(ix1)} ${f(iy1)}`,
    rangeArc: range < far ? `M ${f(rx0)} ${f(ry0)} A ${range} ${range} 0 ${large} 1 ${f(rx1)} ${f(ry1)}` : "",
  };
});

// ---- Warning zone motion: the zone is a live scan, so it moves ----

const threat = computed(() => view.value?.threat === true);

/** Hatch offset in pattern periods. Only the fraction is used, so the lines march with no seam. */
const marchV = useMotionValue(0);
const march = ref(0);
useMotionValueEvent(marchV, "change", (v: number) => (march.value = v - Math.floor(v)));
let marchAnim: { stop: () => void } | null = null;
function startMarch(): void {
  marchAnim?.stop();
  const from = march.value;
  marchAnim = animate(marchV, [from, from + 1], { duration: threat.value ? 0.6 : 2.4, ease: "linear", repeat: Infinity });
}

/** The game radar scans every 2 s; one ring runs out through the zone per scan period. */
const SCAN_S = 2;
const scanV = useMotionValue(0);
const scan = ref(0);
useMotionValueEvent(scanV, "change", (v: number) => (scan.value = v));
let scanAnim: { stop: () => void } | null = null;

onMounted(() => {
  startMarch();
  scanAnim = animate(scanV, [0, 1], { duration: SCAN_S, ease: "linear", repeat: Infinity });
});
watch(threat, startMarch);
onBeforeUnmount(() => {
  marchAnim?.stop();
  scanAnim?.stop();
});

/** The scan ring: a thin bright front and a soft trailing band, fading as it reaches the far edge. */
const scanRing = computed(() => {
  const z = warnZone.value;
  if (!z) return null;
  const r = z.ri + (z.ro - z.ri) * scan.value;
  const fade = Math.min(1, scan.value * 6) * (1 - scan.value);
  return { front: r, band: Math.max(0, r - 3.5 * u.value), alpha: fade };
});

const THREAT_GLOW = { opacity: [0.06, 0.24, 0.06] };
const THREAT_T = { duration: 1.1, ease: "easeInOut", repeat: Infinity };
/** An object on course to you: its ring and its line to you blink. */
const INBOUND_PULSE = { opacity: [0.25, 1, 0.25] };
const INBOUND_T = { duration: 0.6, ease: "easeInOut", repeat: Infinity };

/** Compass rim: a tick every 15°, a letter every 90°. Circle shape only. */
const compass = computed(() => {
  if (!round.value) return null;
  const ticks: string[] = [];
  for (let a = 0; a < 360; a += 15) {
    const [x0, y0] = polar(a, R.value * 0.985);
    const [x1, y1] = polar(a, R.value * (a % 90 === 0 ? 0.93 : a % 45 === 0 ? 0.95 : 0.965));
    ticks.push(`M ${x0.toFixed(1)} ${y0.toFixed(1)} L ${x1.toFixed(1)} ${y1.toFixed(1)}`);
  }
  const letters = ["N", "E", "S", "W"].map((t, i) => {
    const [x, y] = polar(i * 90 - rot.value, R.value * 0.86);
    return { t, x, y, north: i === 0 };
  });
  return { ticks: ticks.join(" "), turn: `rotate(${-rot.value})`, letters };
});

const north = computed(() => {
  const [x, y] = polar(-rot.value, R.value * 0.88);
  return { x, y };
});

const warn = computed(() => (player.value ? (view.value?.warn ?? null) : null));
const warnArc = computed(() => {
  const w = warn.value;
  if (!w) return null;
  const at = viewAngle.value + w.rel;
  return { id: w.id, d: arc(at - WARN_SPAN, at + WARN_SPAN, R.value * 0.965) };
});

const radarRing = computed(() => (style.value.radarRing && player.value ? (view.value?.radarRange ?? 300) : 0));
/** Dims the map past the radar range, where the radar shows no contacts. */
const ringVeil = computed(() => {
  const r = radarRing.value;
  const s = R.value * 1.5;
  if (!r || r >= s) return "";
  return `M ${-s} ${-s} H ${s} V ${s} H ${-s} Z M ${r} 0 A ${r} ${r} 0 1 0 ${-r} 0 A ${r} ${r} 0 1 0 ${r} 0 Z`;
});

// ---- Readout ----

const rangeDigits = computed(() => padded(R.value, 4));
const headingDigits = computed(() => padded(Math.round((((shown.cam % 360) + 360) % 360)) % 360, 3));
const contacts = computed(() => view.value?.contacts ?? 0);
const contactDigits = computed(() => padded(contacts.value, 2));
const sim = computed(() => view.value?.sim === true);
const mapName = computed(() => view.value?.mapName || t("hud.noMap"));
const idle = computed(() => !player.value);
</script>

<template>
  <div class="mm-overlay" :style="colorVars">
    <MapEditor
      v-if="editor"
      :editor="editor"
      :player="data.editorPlayer ?? null"
      :cmd="data.editorCmd ?? null"
      :interactive="interactive === true"
      :asset-base="assetBase"
      :emit-action="emitAction"
    />
    <div v-else class="mm" :class="{ idle }">
      <header v-if="sim" class="head">
        <span class="title">{{ t("hud.title") }}</span>
        <span class="map-name">{{ mapName }}</span>
        <span class="sim">{{ t("hud.preview") }}</span>
      </header>

      <div ref="stage" class="stage">
        <div class="view" :class="{ round }" :style="viewStyle">
          <!-- One opacity for both images, so the HD edge shows no step. -->
          <div class="map-stack" :style="{ opacity: style.mapOpacity }">
            <img v-if="wideStyle && wideUrl" class="map" :src="wideUrl" :style="wideStyle" alt="" draggable="false" />
            <img
              v-if="mapStyle && mapUrl"
              class="map"
              :class="{ feather: wideUrl }"
              :src="mapUrl"
              :style="mapStyle"
              alt=""
              draggable="false"
            />
          </div>

          <svg class="layer" :viewBox="viewBox" aria-hidden="true">
            <defs>
              <pattern
                id="mm-hatch"
                patternUnits="userSpaceOnUse"
                :x="march * 4 * u"
                :width="4 * u"
                :height="4 * u"
                patternTransform="rotate(45)"
              >
                <rect :width="1.1 * u" :height="4 * u" :fill="colors.enemy" opacity="0.28" />
              </pattern>
              <!-- One alpha mask per class and air icon; each blip paints its side colour through it. -->
              <mask v-for="m in iconMasks" :id="m.id" :key="m.id" maskContentUnits="objectBoundingBox" style="mask-type: alpha">
                <image :href="m.href" x="0" y="0" width="1" height="1" preserveAspectRatio="xMidYMid meet" />
              </mask>
            </defs>

            <path v-if="ringVeil" class="ring-veil" :d="ringVeil" fill-rule="evenodd" />

            <!-- World layer -->
            <g v-if="player" :transform="worldTransform">
              <line
                v-for="(l, i) in grid"
                :key="`g${i}`"
                class="grid"
                :x1="l.x1"
                :y1="l.y1"
                :x2="l.x2"
                :y2="l.y2"
                :stroke-width="0.4 * u"
              />
              <OverlayShapes :features="overlays" :u="u" :upright="upright" :asset-base="assetBase" />
              <!-- A dashed line from an object on course to the player -->
              <motion.line
                v-for="b in inbound"
                :key="`l${b.key}`"
                :x1="b.x"
                :y1="-b.y"
                :x2="shown.x"
                :y2="-shown.y"
                :stroke="b.color"
                :stroke-width="0.7 * u"
                :stroke-dasharray="`${2 * u} ${1.6 * u}`"
                :initial="{ opacity: 0.25 }"
                :animate="INBOUND_PULSE"
                :transition="INBOUND_T"
              />
              <g v-for="b in blips" :key="`o${b.key}`" :transform="b.transform" :opacity="b.opacity">
                <motion.circle
                  v-if="b.inbound"
                  :r="b.half * 1.7"
                  fill="none"
                  :stroke="b.color"
                  :stroke-width="0.8 * u"
                  :initial="{ opacity: 0.25 }"
                  :animate="INBOUND_PULSE"
                  :transition="INBOUND_T"
                />
                <g v-if="b.kind === 'icon'">
                  <rect :x="-b.half" :y="-b.half" :width="2 * b.half" :height="2 * b.half" :fill="b.color" :mask="b.fillMask" />
                  <rect
                    :x="-b.half"
                    :y="-b.half"
                    :width="2 * b.half"
                    :height="2 * b.half"
                    fill="rgba(10, 14, 16, 0.85)"
                    :mask="b.outlineMask"
                  />
                </g>
                <rect
                  v-else-if="b.kind === 'enemy'"
                  :x="-2.8 * u"
                  :y="-2.8 * u"
                  :width="5.6 * u"
                  :height="5.6 * u"
                  transform="rotate(45)"
                  :fill="b.color"
                  class="blip"
                  :stroke-width="0.8 * u"
                />
                <circle v-else :r="3 * u" :fill="b.color" class="blip" :stroke-width="0.8 * u" />
              </g>
              <g v-for="b in knownBases" :key="`b${b.sign}`" :transform="b.transform">
                <eCapturePoint
                  :sign="b.sign"
                  :status="b.status"
                  :progress="b.progress"
                  :w="pointW"
                  :colors="colors"
                  :icon="b.icon"
                  :icon-blink="b.iconBlink"
                  :asset-base="assetBase"
                />
              </g>
            </g>

            <!-- Screen layer -->
            <g v-if="warnZone" :transform="warnZone.transform">
              <clipPath id="mm-warnclip">
                <path :d="warnZone.fill" />
              </clipPath>
              <path :d="warnZone.fill" fill="url(#mm-hatch)" />
              <motion.path
                :d="warnZone.fill"
                :fill="colors.enemy"
                :initial="{ opacity: 0 }"
                :animate="threat ? THREAT_GLOW : { opacity: 0 }"
                :transition="threat ? THREAT_T : Dynamics.smooth"
              />
              <g v-if="scanRing" clip-path="url(#mm-warnclip)">
                <circle
                  :r="scanRing.band"
                  fill="none"
                  :stroke="colors.enemy"
                  :stroke-width="6 * u"
                  :opacity="0.22 * scanRing.alpha"
                />
                <circle
                  :r="scanRing.front"
                  fill="none"
                  :stroke="colors.enemy"
                  :stroke-width="0.8 * u"
                  :opacity="0.8 * scanRing.alpha"
                />
              </g>
              <path
                class="warn-edge"
                :class="{ hot: threat }"
                :d="warnZone.edges"
                :stroke-width="0.5 * u"
                :stroke-dasharray="`${2 * u} ${2 * u}`"
              />
              <path v-if="warnZone.rangeArc" class="warn-edge" :class="{ hot: threat }" :d="warnZone.rangeArc" :stroke-width="0.7 * u" />
            </g>

            <g v-if="radarRing">
              <circle class="ring-case" :r="radarRing" :stroke-width="2.2 * u" />
              <circle class="ring" :r="radarRing" :stroke-width="0.9 * u" :stroke-dasharray="`${3 * u} ${2.5 * u}`" />
            </g>
            <text
              v-if="radarRing && radarRing < R"
              class="ring-label"
              :y="-radarRing - 2.6 * u"
              :font-size="4.6 * u"
              :stroke-width="1.6 * u"
            >
              {{ t("hud.radarRing", { m: radarRing }) }}
            </text>

            <g v-if="compass">
              <path class="tick" :d="compass.ticks" :transform="compass.turn" :stroke-width="0.6 * u" />
              <text
                v-for="l in compass.letters"
                :key="l.t"
                class="cardinal"
                :class="{ north: l.north }"
                :x="l.x"
                :y="l.y"
                :font-size="5.4 * u"
                dy="0.36em"
              >{{ l.t }}</text>
            </g>
            <text v-else class="cardinal north" :x="north.x" :y="north.y" :font-size="5.4 * u" dy="0.36em">N</text>

            <g v-for="b in rimBases" :key="`r${b.sign}`" :transform="b.transform">
              <g :transform="b.chevron">
                <path :d="rimChevron" class="rim-chevron" :stroke-width="1.2 * u" />
              </g>
              <eCapturePoint
                :sign="b.sign"
                :status="b.status"
                :progress="b.progress"
                :w="pointW"
                :colors="colors"
                :icon="b.icon"
                :icon-blink="b.iconBlink"
                :asset-base="assetBase"
              />
            </g>

            <g v-if="player">
              <line :transform="turretTransform" x1="0" y1="0" x2="0" :y2="-15 * u" class="turret" :stroke-width="1 * u" />
              <path :transform="arrowTransform" :d="arrow" class="you" :stroke-width="0.9 * u" />
            </g>

            <motion.path
              v-if="warnArc"
              :key="`w${warnArc.id}`"
              :d="warnArc.d"
              class="warn-arc"
              :stroke-width="3.2 * u"
              :initial="{ opacity: 0 }"
              :animate="{ opacity: [0, 1, 0.3, 1, 0] }"
              :transition="{ duration: 1.4, ease: 'easeOut' }"
            />
          </svg>

          <template v-if="!round">
            <span class="bracket tl" aria-hidden="true" />
            <span class="bracket tr" aria-hidden="true" />
            <span class="bracket bl" aria-hidden="true" />
            <span class="bracket br" aria-hidden="true" />
          </template>
        </div>
      </div>

      <div class="readout">
        <AnimatePresence :initial="false" mode="wait">
          <motion.span
            v-if="warn"
            :key="`a${warn.id}`"
            class="cell alert"
            :initial="{ opacity: 0, x: -6 }"
            :animate="{ opacity: 1, x: 0 }"
            :exit="{ opacity: 0, x: 6 }"
            :transition="Dynamics.snappy"
          >
            <span class="cell-label">{{ t("hud.enemy") }}</span>
            <span class="cell-value">{{ t(`hud.${warn.side}`) }}</span>
          </motion.span>
          <motion.span
            v-else
            key="range"
            class="cell"
            :initial="{ opacity: 0, x: -6 }"
            :animate="{ opacity: 1, x: 0 }"
            :exit="{ opacity: 0, x: 6 }"
            :transition="Dynamics.snappy"
          >
            <span class="cell-label">{{ zoomed ? t("hud.zoom") : t("hud.range") }}</span>
            <span class="cell-value"><i>{{ rangeDigits.dim }}</i>{{ rangeDigits.lit }}<small>m</small></span>
          </motion.span>
        </AnimatePresence>
        <span class="cell">
          <span class="cell-label">{{ t("hud.heading") }}</span>
          <span class="cell-value"><i>{{ headingDigits.dim }}</i>{{ headingDigits.lit }}<small>°</small></span>
        </span>
        <span class="cell" :class="{ hot: contacts > 0 }">
          <span class="cell-label">{{ t("hud.contacts") }}</span>
          <motion.span
            :key="`c${contacts}`"
            class="cell-value"
            :initial="{ color: FLASH }"
            :animate="{ color: contacts > 0 ? colors.enemy : INK }"
            :transition="Dynamics.smooth"
          ><i>{{ contactDigits.dim }}</i>{{ contactDigits.lit }}</motion.span>
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.mm-overlay {
  width: 100%;
  height: 100%;
  container-type: inline-size;
  pointer-events: none;
}

.mm {
  --u: calc(100cqw / 300);
  display: flex;
  flex-direction: column;
  gap: calc(3 * var(--u));
  width: 100%;
  height: 100%;
}

.mm.idle {
  opacity: 0.4;
}

.head {
  display: flex;
  align-items: center;
  gap: calc(8 * var(--u));
  flex: none;
  height: calc(24 * var(--u));
  padding: 0 calc(8 * var(--u));
  box-sizing: border-box;
  background: var(--black-3-a);
  border: calc(1 * var(--u)) solid var(--base-600);
  corner-shape: bevel;
  border-radius: calc(6 * var(--u)) 0 0 0;
}

.title {
  font-family: var(--font-primary);
  font-size: calc(11 * var(--u));
  font-weight: var(--font-weight-2);
  line-height: 1;
  color: var(--text-main);
  text-transform: uppercase;
  white-space: nowrap;
}

.map-name,
.sim,
.cell-label {
  font-family: var(--font-microcopy);
  font-size: calc(6.5 * var(--u));
  line-height: 1;
  letter-spacing: 0.1em;
  color: var(--text-muted);
  text-transform: uppercase;
  white-space: nowrap;
}

.map-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  text-align: right;
}

.sim {
  padding: calc(2 * var(--u)) calc(4 * var(--u));
  color: var(--warning-color);
  border: calc(1 * var(--u)) solid color-mix(in srgb, var(--warning-color) 45%, transparent);
}

/* Map viewport */
.stage {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.view {
  position: relative;
  overflow: hidden;
  box-sizing: border-box;
  background: color-mix(in srgb, var(--black-2) 85%, transparent);
  border: calc(1 * var(--u)) solid var(--base-600);
  corner-shape: bevel;
  border-radius: calc(10 * var(--u)) 0 calc(10 * var(--u)) 0;
}

.view.round {
  corner-shape: round;
  border-radius: 50%;
}

.map-stack {
  position: absolute;
  inset: 0;
}

/* The HD edge fades over about 15 m into the wide image under it. */
.map.feather {
  mask-image:
    linear-gradient(to bottom, transparent, #000 1%, #000 99%, transparent),
    linear-gradient(to right, transparent, #000 0.6%, #000 99.4%, transparent);
  mask-composite: intersect;
}

.map {
  position: absolute;
  left: 0;
  top: 0;
  max-width: none;
  transform-origin: 0 0;
  will-change: transform;
  user-select: none;
}

.layer {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.grid {
  stroke: color-mix(in srgb, var(--base-200) 12%, transparent);
}

.blip {
  stroke: rgba(10, 14, 16, 0.85);
}

.cardinal,
.ring-label {
  font-family: var(--font-microcopy);
  text-anchor: middle;
}

.rim-chevron {
  fill: none;
  stroke: color-mix(in srgb, var(--base-200) 70%, transparent);
  stroke-linecap: round;
  stroke-linejoin: round;
}

.ring-veil {
  fill: rgba(10, 14, 16, 0.34);
}

.ring-case {
  fill: none;
  stroke: rgba(10, 14, 16, 0.6);
}

.ring {
  fill: none;
  stroke: color-mix(in srgb, var(--base-200) 88%, transparent);
}

.ring-label {
  fill: color-mix(in srgb, var(--base-200) 92%, transparent);
  stroke: rgba(10, 14, 16, 0.75);
  stroke-linejoin: round;
  paint-order: stroke;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.tick {
  fill: none;
  stroke: color-mix(in srgb, var(--base-200) 45%, transparent);
}

.cardinal {
  fill: color-mix(in srgb, var(--base-200) 70%, transparent);
}

.cardinal.north {
  fill: var(--text-main);
}

.warn-edge {
  fill: none;
  stroke: color-mix(in srgb, var(--woth-enemy) 45%, transparent);
}

.warn-edge.hot {
  stroke: color-mix(in srgb, var(--woth-enemy) 90%, transparent);
}

.turret {
  stroke: color-mix(in srgb, var(--mm-you) 75%, transparent);
  stroke-linecap: round;
}

.you {
  fill: var(--mm-you);
  stroke: rgba(10, 14, 16, 0.9);
  stroke-linejoin: round;
}

.warn-arc {
  fill: none;
  stroke: var(--woth-enemy);
  stroke-linecap: round;
}

.bracket {
  position: absolute;
  width: calc(6 * var(--u));
  height: calc(6 * var(--u));
  border-color: color-mix(in srgb, var(--base-200) 45%, transparent);
  border-style: solid;
  border-width: 0;
}

.bracket.tl {
  top: calc(3 * var(--u));
  left: calc(3 * var(--u));
  border-top-width: calc(1 * var(--u));
  border-left-width: calc(1 * var(--u));
}

.bracket.tr {
  top: calc(3 * var(--u));
  right: calc(3 * var(--u));
  border-top-width: calc(1 * var(--u));
  border-right-width: calc(1 * var(--u));
}

.bracket.bl {
  bottom: calc(3 * var(--u));
  left: calc(3 * var(--u));
  border-bottom-width: calc(1 * var(--u));
  border-left-width: calc(1 * var(--u));
}

.bracket.br {
  bottom: calc(3 * var(--u));
  right: calc(3 * var(--u));
  border-bottom-width: calc(1 * var(--u));
  border-right-width: calc(1 * var(--u));
}

/* Readout cells */
.readout {
  display: flex;
  flex: none;
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
  min-width: calc(58 * var(--u));
  padding: calc(4 * var(--u)) calc(6 * var(--u));
  border-right: calc(1 * var(--u)) solid var(--base-600);
}

.cell:last-child {
  border-right: none;
}

.cell-value {
  font-family: var(--font-microcopy);
  font-size: calc(10 * var(--u));
  line-height: 1;
  color: var(--text-main);
  font-variant-numeric: tabular-nums;
}

.cell-value i {
  font-style: normal;
  color: var(--base-600);
}

.cell-value small {
  margin-left: calc(1 * var(--u));
  font-size: calc(6.5 * var(--u));
  color: var(--text-muted);
}

.cell.hot .cell-label {
  color: var(--woth-enemy);
}

.cell.alert {
  background: repeating-linear-gradient(135deg, color-mix(in srgb, var(--woth-enemy) 18%, transparent) 0 1px, transparent 1px 6px),
    color-mix(in srgb, var(--woth-enemy) 22%, var(--black-2));
}

.cell.alert .cell-label {
  color: var(--woth-enemy);
}

.cell.alert .cell-value {
  color: var(--text-main);
  text-transform: uppercase;
}
</style>
