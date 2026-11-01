<script setup lang="ts">
// Draws map overlay features inside an SVG layer that holds world metres at (x, -y).
import { computed } from "vue";

interface Feature {
  id: string;
  kind: string;
  points: [number, number][];
  tag: string;
  label: string;
  stroke: string;
  fill: string;
  width: number;
}

const props = withDefaults(
  defineProps<{
    features: Feature[];
    /** Icon unit in metres. */
    u: number;
    /** Keeps icons and labels upright in a turned layer, e.g. "rotate(30)". */
    upright?: string;
    assetBase?: string;
    selectedId?: string;
    /** The shape under the editor's select tool. */
    hoverId?: string;
  }>(),
  { upright: "", assetBase: "", selectedId: "", hoverId: "" },
);

/** Kill Confirmed tokens: the badge assets/icons/KCToken<name>.svg, by tag. */
const TOKENS: Record<string, string> = { kc_heal: "Heal", kc_overdrive: "Overdrive", kc_ultimate: "Ultimate" };
/** Badge size in icon units. The art is 14 x 16 with its tip at the bottom centre. */
const TOKEN_H = 11;
const TOKEN_W = (TOKEN_H * 14) / 16;

const tokenMasks = computed(() =>
  Object.values(TOKENS).map((name) => ({ id: `ov-kc-${name}`, href: `${props.assetBase}/assets/icons/KCToken${name}.svg` })),
);

function centroid(p: [number, number][]): [number, number] {
  let x = 0;
  let y = 0;
  for (const q of p) {
    x += q[0];
    y += q[1];
  }
  return [x / p.length, y / p.length];
}

const shapes = computed(() =>
  props.features.map((f) => {
    const p = f.points;
    const d = p.map(([x, y], i) => `${i ? "L" : "M"} ${x} ${-y}`).join(" ") + (f.kind === "area" ? " Z" : "");
    const anchor = f.kind === "point" ? p[0] : f.kind === "path" ? p[Math.floor((p.length - 1) / 2)] : centroid(p);
    const token = f.kind === "point" ? (TOKENS[f.tag] ?? "") : "";
    return {
      ...f,
      d,
      at: `translate(${anchor[0]} ${-anchor[1]}) ${props.upright}`,
      mask: token ? `url(#ov-kc-${token})` : "",
      labelY: f.kind === "point" ? (token ? 2 : 9) : 0,
      selected: f.id === props.selectedId,
      hovered: f.id === props.hoverId && f.id !== props.selectedId,
    };
  }),
);
</script>

<template>
  <g class="ov-shapes">
    <defs>
      <!-- One alpha mask per token badge; each mark paints its own colour through it. -->
      <mask v-for="m in tokenMasks" :id="m.id" :key="m.id" maskContentUnits="objectBoundingBox" style="mask-type: alpha">
        <image :href="m.href" x="0" y="0" width="1" height="1" preserveAspectRatio="xMidYMid meet" />
      </mask>
    </defs>
    <template v-for="s in shapes" :key="s.id">
      <template v-if="s.kind !== 'point'">
        <path
          v-if="s.hovered"
          class="ov-hover"
          :d="s.d"
          fill="none"
          :stroke-width="(s.width + 3.2) * u"
          stroke-linejoin="round"
          stroke-linecap="round"
        />
        <!-- A dark case under the line keeps it readable on light ground. -->
        <path
          class="ov-case"
          :d="s.d"
          fill="none"
          :stroke-width="(s.width + 1.2) * u"
          stroke-linejoin="round"
          stroke-linecap="round"
        />
        <path
          :d="s.d"
          :fill="s.kind === 'area' ? s.fill : 'none'"
          :stroke="s.stroke"
          :stroke-width="s.width * u"
          :stroke-dasharray="s.selected ? `${3 * u} ${2 * u}` : undefined"
          stroke-linejoin="round"
          stroke-linecap="round"
        />
      </template>
      <g :transform="s.at">
        <!-- A token: its art in the token colour, nothing behind it. The tip is on the point. -->
        <g v-if="s.kind === 'point' && s.mask">
          <circle
            v-if="s.selected"
            class="ov-pick"
            :cy="-TOKEN_H * 0.5 * u"
            :r="TOKEN_H * 0.75 * u"
            :stroke-width="0.6 * u"
            :stroke-dasharray="`${2 * u} ${1.5 * u}`"
          />
          <circle v-else-if="s.hovered" class="ov-hover-ring" :cy="-TOKEN_H * 0.5 * u" :r="TOKEN_H * 0.75 * u" :stroke-width="0.6 * u" />
          <rect
            :x="-TOKEN_W * 0.5 * u"
            :y="-TOKEN_H * u"
            :width="TOKEN_W * u"
            :height="TOKEN_H * u"
            :fill="s.stroke"
            :mask="s.mask"
          />
        </g>
        <g v-else-if="s.kind === 'point'">
          <circle
            v-if="s.selected"
            class="ov-pick"
            :r="8 * u"
            :stroke-width="0.6 * u"
            :stroke-dasharray="`${2 * u} ${1.5 * u}`"
          />
          <circle v-else-if="s.hovered" class="ov-hover-ring" :r="8 * u" :stroke-width="0.6 * u" />
          <circle :r="5.5 * u" class="ov-case" fill="none" :stroke-width="(s.width + 1.2) * u" />
          <circle :r="5.5 * u" :fill="s.fill" :stroke="s.stroke" :stroke-width="s.width * u" />
          <circle :r="1.6 * u" :fill="s.stroke" />
        </g>
        <text
          v-if="s.label"
          class="ov-label"
          :y="(s.labelY + 2.2) * u"
          :font-size="4.4 * u"
          :stroke-width="1.4 * u"
          dy="0.36em"
        >{{ s.label }}</text>
      </g>
    </template>
  </g>
</template>

<style scoped>
.ov-case {
  stroke: rgba(10, 14, 16, 0.55);
}

.ov-pick {
  fill: none;
  stroke: #f2f2f2;
}

.ov-hover {
  stroke: rgba(242, 242, 242, 0.35);
}

.ov-hover-ring {
  fill: rgba(242, 242, 242, 0.08);
  stroke: rgba(242, 242, 242, 0.55);
}

.ov-label {
  font-family: var(--font-microcopy);
  text-anchor: middle;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  fill: #f2f2f2;
  stroke: rgba(10, 14, 16, 0.8);
  stroke-linejoin: round;
  paint-order: stroke;
}
</style>
