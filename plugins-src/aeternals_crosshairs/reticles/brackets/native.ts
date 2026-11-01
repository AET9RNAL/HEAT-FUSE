import { BOX, GHOST_FADE, GHOST_GROW, f, type NativeContext, type NativeReticle } from "../../native.js";
import { colors, rgba } from "./colors.mjs";
import { DESIGN, bracketHalves, bracketLength, bracketPath, outline, stroke } from "./geometry.mjs";

type Pt = [number, number];
interface Segment {
  a: Pt;
  d: Pt;
  n: Pt;
  len: number;
  poly: Pt[];
}

const K = [0, 1, 2, 3];
const SIGN = [
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, 1],
];
const GLOW_PAD = 2 * DESIGN.markGlow;

const poly = (p: Pt[]): string => `polygon(${p.map(([x, y]) => `${f(x)}px ${f(y)}px`).join(", ")})`;
const show = (cond: string): string => `data-bind-style-display="(${cond}) ? 'block' : 'none'"`;
const layer = (name: string, inner: string): string => (inner ? `<div class="xh-${name}" style="${BOX}">${inner}</div>` : "");

/** A polygon as a box with the polygon as its clip path, in its parent's coordinates. */
function shape(p: Pt[], color: string, cls = ""): string {
  const xs = p.map((q) => q[0]);
  const ys = p.map((q) => q[1]);
  const x0 = Math.min(...xs);
  const y0 = Math.min(...ys);
  const local = p.map(([x, y]) => [x - x0, y - y0] as Pt);
  return (
    `<div${cls ? ` class="${cls}"` : ""} style="position:absolute;left:${f(x0)}px;top:${f(y0)}px;` +
    `width:${f(Math.max(...xs) - x0)}px;height:${f(Math.max(...ys) - y0)}px;background-color:${color};clip-path:${poly(local)}"></div>`
  );
}


function segment(seg: Segment, t: string, color: string): string {
  const loc = seg.poly.map((p) => {
    const v: Pt = [p[0] - seg.a[0], p[1] - seg.a[1]];
    return [v[0] * seg.d[0] + v[1] * seg.d[1], v[0] * seg.n[0] + v[1] * seg.n[1]] as Pt;
  });
  const x0 = Math.min(...loc.map((q) => q[0]));
  const y0 = Math.min(...loc.map((q) => q[1]));
  const w = Math.max(...loc.map((q) => q[0])) - x0;
  const h = Math.max(...loc.map((q) => q[1])) - y0;
  const deg = (Math.atan2(seg.d[1], seg.d[0]) * 180) / Math.PI;
  const box = loc.map(([x, y]) => [x - x0, y - y0] as Pt);
  return (
    `<div style="${BOX};transform:translate(${f(seg.a[0])}px,${f(seg.a[1])}px) rotate(${f(deg)}deg)">` +
    `<div style="position:absolute;left:${f(x0)}px;top:${f(y0)}px;height:${f(h)}px;background-color:${color};clip-path:${poly(box)}" ` +
    `data-bind-style-width="Math.min(${f(w)}, Math.max(0, (${t}) - ${f(x0)})) + 'px'"></div></div>`
  );
}

/** Stroked polyline segments, each cut at `fill` px along the whole path. */
function strokeFill(points: Pt[], fill: string, color: string): string {
  let start = 0;
  return (stroke(points, DESIGN.band) as unknown as Segment[])
    .map((seg) => {
      const out = segment(seg, `(${fill}) - ${f(start)}`, color);
      start += seg.len;
      return out;
    })
    .join("");
}

export function bracketsNative(c: NativeContext): ReturnType<NativeReticle> {
  const sides = String(c.settings.brackets_sides ?? "clockwise");
  const barsOn = c.settings.brackets_bars !== false;
  const { ink, reload, track, center, backdrop, bar: barFill, barReloading, barWork, barBase } = colors(c.settings);
  const HALF = `(${f(DESIGN.half)} * ${c.scale})`;
  const length = bracketLength();

  /** Bracket k's frame: origin on its corner of the square, which moves out with the spread. */
  const atCorner = (k: number, inner: string): string =>
    `<div style="${BOX}" data-bind-style-transform="'translate(' + (${SIGN[k]![0]} * ${HALF}) + 'px,' + (${SIGN[k]![1]} * ${HALF}) + 'px)'">${inner}</div>`;
  /** Bracket k relative to its corner. */
  const path = (k: number, arm?: number): Pt[] => bracketPath(k, 0, arm) as Pt[];
  const full = (k: number, color: string, cls = ""): string => shape(outline(path(k), DESIGN.band) as Pt[], color, cls);

  // Base: the thin track under each bracket.
  const base = K.map((k) => atCorner(k, shape(outline(path(k, DESIGN.trackArm), DESIGN.track) as Pt[], track))).join("");

  // The brackets: whole in the reticle colour while loaded, and filling in the reload colour while the gun reloads.
  const filling = (k: number): string => {
    if (sides === "off") return full(k, reload);
    if (sides === "middle_out") {
      const s = `(${c.progress} * ${f(length / 2)})`;
      return (bracketHalves(k, 0) as Pt[][]).map((p) => strokeFill(p, s, reload)).join("");
    }
    return strokeFill(path(k), `(Math.min(1, Math.max(0, ${c.progress} * 4 - ${k})) * ${f(length)})`, reload);
  };
  const main =
    `<div style="${BOX};display:none" ${show(`!(${c.reloading})`)}>${K.map((k) => atCorner(k, full(k, ink))).join("")}</div>` +
    `<div style="${BOX};display:none" ${show(c.reloading)}>${K.map((k) => atCorner(k, filling(k))).join("")}</div>`;

  // Ghost: the whole brackets, which grow and fade each time the ghost turns on.
  const ghost =
    `<div class="xh-ghost ${GHOST_GROW}" style="${BOX};display:none" ${show(c.ghost)}>` +
    K.map((k) => atCorner(k, full(k, ink, GHOST_FADE))).join("") +
    `</div>`;

  // Reload bars
  const inner = `(${HALF} + ${f(DESIGN.barGap)})`;
  const inset = DESIGN.barInset;
  const bar =
    `<div style="${BOX}" data-bind-style-transform="'translateX(' + (-1 * ${inner} - ${f(DESIGN.barLen)}) + 'px)'">` +
    `<div style="position:absolute;left:0;top:${f(-DESIGN.barBase / 2)}px;width:${f(DESIGN.barLen)}px;height:${f(DESIGN.barBase)}px;background-color:${barBase}"></div>` +
    `<div style="position:absolute;left:${f(inset)}px;top:${f(-DESIGN.barProgress / 2)}px;width:${f(DESIGN.barLen - 2 * inset)}px;height:${f(DESIGN.barProgress)}px;background-color:${barWork}"></div>` +
    `<div style="position:absolute;left:${f(inset)}px;top:${f(-DESIGN.barProgress / 2)}px;height:${f(DESIGN.barProgress)}px;background-color:${barFill}" ` +
    `data-bind-style-width="(${f(DESIGN.barLen - 2 * inset)} * ((${c.reloading}) ? ${c.progress} : 1)) + 'px'" ` +
    // Half the fill colour while the gun reloads.
    `data-bind-style-background-color="(${c.reloading}) ? '${barReloading}' : '${barFill}'"></div></div>`;
  const bars = barsOn ? `<div style="${BOX}">${bar}</div><div style="${BOX};transform:scaleX(-1)">${bar}</div>` : "";

  // Center: the backdrop and the dot.
  const square = (side: number, color: string): string =>
    `<div style="position:absolute;left:${f(-side / 2)}px;top:${f(-side / 2)}px;width:${f(side)}px;height:${f(side)}px;background-color:${color}"></div>`;
  const centerMark = square(DESIGN.backdrop, backdrop) + square(DESIGN.dot, center);

  // Range: a mark each side of the center in the stage colour, with its glow, over a base at half that colour.
  // The reticle colour with no target.
  const box = (x0: number, x1: number, h: number, color: string, dx = 0, dy = 0): string =>
    `<div style="position:absolute;left:${f(x0 + dx)}px;top:${f(-h / 2 + dy)}px;width:${f(x1 - x0)}px;height:${f(h)}px;background-color:${color}"></div>`;
  const pair = (inner0: number, outer: number, h: number, color: string, dx = 0, dy = 0): string =>
    box(-outer, -inner0, h, color, dx, dy) + box(inner0, outer, h, color, dx, dy);
  const glowW = 2 * (DESIGN.markOuter + GLOW_PAD);
  const glowH = DESIGN.markHeight + 2 * GLOW_PAD;
  const markSet = (main: string, under: string, glow: boolean): string =>
    pair(DESIGN.markBaseInner, DESIGN.markBaseOuter, DESIGN.markBaseHeight, under) +
    (glow
      ? `<div style="position:absolute;left:${f(-glowW / 2)}px;top:${f(-glowH / 2)}px;width:${f(glowW)}px;height:${f(glowH)}px;filter:drop-shadow(0 0 ${f(DESIGN.markGlow)}px ${main})">` +
        pair(DESIGN.markInner, DESIGN.markOuter, DESIGN.markHeight, main, glowW / 2, glowH / 2) +
        `</div>`
      : pair(DESIGN.markInner, DESIGN.markOuter, DESIGN.markHeight, main));
  const range =
    `<div style="${BOX};display:none" ${show(`(${c.stage}) === 0`)}>${markSet(ink, track, false)}</div>` +
    c.range
      .map(
        (color, i) =>
          `<div style="${BOX};display:none" ${show(`(${c.stage}) === ${i + 1}`)}>${markSet(color, rgba(color, color, 0.5), true)}</div>`,
      )
      .join("");

  // The layers of Brackets.vue, with the same names.
  return {
    reticle: layer("base", base) + layer("main", main) + ghost,
    sight: layer("center", centerMark) + layer("range", range),
    fixed: layer("bars", bars),
  };
}
