/**
 * The triangle reticle as game HUD markup, with the same shapes, layers and states as Triangle.vue.
 * Each shape is a box with a fixed clip-path polygon in px. The game updates only the box width and position,
 * so a reload fill cuts a shape at the box edge. Opaque pieces overlap by half a pixel to hide seams.
 */
import { BOX, GHOST_FADE, GHOST_GROW, f, type NativeContext, type NativeReticle } from "../../native.js";
import { colors, isOpaque } from "./colors.mjs";
import { DESIGN } from "./geometry.mjs";

type Pt = [number, number];

const SQ3 = Math.sqrt(3);
/** The reload bars sit 0.23 px above the triangle centre. */
const BAR_Y = -0.23;
/** Room around a range mark for its glow. */
const GLOW_PAD = 4;
/** Side k runs from corner k to corner k + 1: apex, bottom right, bottom left. */
const SIDE_DEG = [60, 180, 300];
/** Overlap between two opaque pieces. Translucent pieces do not overlap, so no seam shows brighter. */
const O = 0.5;
/** Far enough for a polygon edge to reach past any box: the widest side is about 440 px. */
const BIG = 1000;

const T = DESIGN.band;
const TT = DESIGN.track;
const G = DESIGN.gap;
const N_OUT = DESIGN.notchOuter;
const N_IN = DESIGN.notchInner;
const N_D = DESIGN.notchDepth;
/** A band end is cut along the corner bisector, 30 degrees to the edge. */
const CAP = T * SQ3;
const CAP_T = TT * SQ3;
const U1 = (N_OUT - N_IN) / 2;
const U2 = (N_OUT + N_IN) / 2;

/** Shapes in their own box: outer edge at y 0, inward +y. */
const RUN: Pt[] = [[0, 0], [BIG, 0], [BIG, T], [CAP, T]];
const RUN_TRACK: Pt[] = [[0, 0], [BIG, 0], [BIG, TT], [CAP_T, TT]];
const NOTCH: Pt[] = [[0, 0], [U1, N_D], [U2, N_D], [N_OUT, 0], [N_OUT, T], [0, T]];
/** The notch with `o` px more on each side, over its full-height neighbours. */
const notchWide = (o: number): Pt[] => [[0, 0], [o, 0], [o + U1, N_D], [o + U2, N_D], [o + N_OUT, 0], [N_OUT + 2 * o, 0], [N_OUT + 2 * o, T], [0, T]];
/** Half the notch, from the middle of the side: `o` px over the other half, and over the next piece. */
const notchHalf = (o: number): Pt[] => [[0, N_D], [o + N_IN / 2, N_D], [o + N_OUT / 2, 0], [N_OUT / 2 + 2 * o, 0], [N_OUT / 2 + 2 * o, T], [0, T]];
/** The end cap, `o` px over the piece before it. */
const capEnd = (o: number): Pt[] => [[0, 0], [o + CAP, 0], [o, T], [0, T]];
const MARK: Pt[] = [[0, 0], [N_OUT, 0], [U2, N_D], [U1, N_D]];

const poly = (p: Pt[]): string => `polygon(${p.map(([x, y]) => `${f(x)}px ${f(y)}px`).join(", ")})`;
const isNum = (s: string): boolean => /^-?\d+(\.\d+)?$/.test(s);
const show = (cond: string): string => `data-bind-style-display="(${cond}) ? 'block' : 'none'"`;

interface Piece {
  /** Box start along the strip, px (number or expression). */
  x: string;
  /** Box width at full fill. */
  w: string;
  /** Where the shape itself starts, past any overlap. */
  start?: string;
  h: number;
  shape: Pt[] | null;
  color: string;
  cls?: string;
}

/** A piece cut at `fill` px along its strip (null: full). */
function piece(p: Piece, fill: string | null): string {
  const style = ["position:absolute", "left:0", "top:0", `height:${f(p.h)}px`, `background-color:${p.color}`];
  if (p.shape) style.push(`clip-path:${poly(p.shape)}`);
  const attrs: string[] = [];
  if (isNum(p.x)) style[1] = `left:${p.x}px`;
  else attrs.push(`data-bind-style-transform="'translateX(' + ${p.x} + 'px)'"`);
  const width = fill === null ? p.w : `((${fill}) > ${p.start ?? p.x} ? Math.min(${p.w}, (${fill}) - ${p.x}) : 0)`;
  if (isNum(width)) style.push(`width:${width}px`);
  else attrs.push(`data-bind-style-width="${width} + 'px'"`);
  return `<div${p.cls ? ` class="${p.cls}"` : ""} style="${style.join(";")}"${attrs.length ? " " + attrs.join(" ") : ""}></div>`;
}

const at = (x: string, inner: string): string =>
  `<div style="${BOX}" data-bind-style-transform="'translateX(' + ${x} + 'px)'">${inner}</div>`;
const mirrored = (inner: string): string => `<div style="${BOX};transform:scaleX(-1)">${inner}</div>`;

export function triangleNative(c: NativeContext): ReturnType<NativeReticle> {
  const sides = String(c.settings.triangle_sides ?? "clockwise");
  const barsOn = c.settings.triangle_bars !== false;
  const { ink, reload, track, center: centerFill, centerStroke, bar: barFill, barReloading, barWork, barBase } = colors(c.settings);
  const R = `(${f(DESIGN.r)} * ${c.scale})`;
  const H = `(${f((DESIGN.r * SQ3) / 2)} * ${c.scale})`;
  /** From a corner end to the notch. */
  const run = `(${H} - ${f(G + N_OUT / 2)})`;
  /** From the notch to the start of the end cap. */
  const straight = `(${H} - ${f(G + N_OUT / 2 + CAP)})`;
  const fromCorner = `(${f(G)} - ${H})`;
  const filling = (amount: string): string => `((${c.reloading}) ? ${amount} : 1)`;

  /** A side from its start corner: mitre, notch, mitre. Cut at `fill` px from the start corner. */
  const mainStrip = (fill: string | null, color: string): string => {
    const o = isOpaque(color) ? O : 0;
    return at(
      fromCorner,
      [
        piece({ x: "0", w: run, h: T, shape: RUN, color }, fill),
        piece({ x: `(${run} - ${f(o)})`, start: run, w: f(N_OUT + 2 * o), h: T, shape: notchWide(o), color }, fill),
        piece({ x: `(${run} + ${f(N_OUT)})`, w: straight, h: T, shape: null, color }, fill),
        piece({ x: `(2 * ${run} + ${f(N_OUT - CAP - o)})`, start: `(2 * ${run} + ${f(N_OUT - CAP)})`, w: f(CAP + o), h: T, shape: capEnd(o), color }, fill),
      ].join(""),
    );
  };

  /** Half a side, from its middle out to a corner. Cut at `fill` px from the middle. */
  const mainHalf = (fill: string, color: string): string => {
    const o = isOpaque(color) ? O : 0;
    return [
      piece({ x: f(-o), start: "0", w: f(N_OUT / 2 + 2 * o), h: T, shape: notchHalf(o), color }, fill),
      piece({ x: f(N_OUT / 2), w: straight, h: T, shape: null, color }, fill),
      piece({ x: `(${H} - ${f(G + CAP + o)})`, start: `(${H} - ${f(G + CAP)})`, w: f(CAP + o), h: T, shape: capEnd(o), color }, fill),
    ].join("");
  };

  /** Side k frame: origin at the middle of the outer edge, x along the edge, y inward. */
  const frame = (k: number, inner: string): string =>
    `<div style="${BOX}" data-bind-style-transform="'rotate(${SIDE_DEG[k]}deg) translateY(' + (-0.5 * ${R}) + 'px)'">${inner}</div>`;

  /** How far side k is filled while the gun reloads, px. Null: full. */
  const reloadFill = (k: number): string | null => {
    if (sides === "off") return null;
    if (sides === "middle_out") return `(${c.progress} * (${H} - ${f(G)}))`;
    return `(Math.min(1, Math.max(0, ${c.progress} * 3 - ${k})) * (2 * ${H} - ${f(2 * G)}))`;
  };
  const side = (k: number, fill: string | null, color: string): string =>
    sides === "middle_out" && fill ? mainHalf(fill, color) + mirrored(mainHalf(fill, color)) : mainStrip(fill, color);
  const sideSet = (fill: (k: number) => string | null, color: string): string =>
    [0, 1, 2].map((k) => frame(k, side(k, fill(k), color))).join("");
  // The sides: full in the reticle colour while loaded, and filling in the reload colour while the gun reloads.
  const main =
    `<div style="${BOX};display:none" ${show(`!(${c.reloading})`)}>${sideSet(() => null, ink)}</div>` +
    `<div style="${BOX};display:none" ${show(c.reloading)}>${sideSet(reloadFill, reload)}</div>`;

  // Base: the thin track, two runs from the corners that meet under the range mark.
  const trackRun = at(fromCorner, piece({ x: "0", w: `(${H} - ${f(G)})`, h: TT, shape: RUN_TRACK, color: track }, null));
  const base = [0, 1, 2].map((k) => frame(k, trackRun + mirrored(trackRun))).join("");

  // Range: the notch mark in the stage colour, with its glow. The reticle colour with no target.
  const markAt = (color: string): string =>
    `<div style="position:absolute;left:${f(GLOW_PAD)}px;top:${f(GLOW_PAD)}px;width:${f(N_OUT)}px;height:${f(N_D)}px;` +
    `background-color:${color};clip-path:${poly(MARK)}"></div>`;
  const glowBox = `position:absolute;left:${f(-N_OUT / 2 - GLOW_PAD)}px;top:${f(-GLOW_PAD)}px;width:${f(N_OUT + 2 * GLOW_PAD)}px;height:${f(N_D + 2 * GLOW_PAD)}px`;
  const marks =
    `<div style="${glowBox};display:none" ${show(`(${c.stage}) === 0`)}>${markAt(ink)}</div>` +
    c.range
      .map(
        (color, i) =>
          `<div style="${glowBox};filter:drop-shadow(0 0 2px ${color});display:none" ${show(`(${c.stage}) === ${i + 1}`)}>${markAt(color)}</div>`,
      )
      .join("");

  // Ghost: the full sides, which grow and fade each time the ghost turns on.
  const ghostRun = at(fromCorner, piece({ x: "0", w: run, h: T, shape: RUN, color: ink, cls: GHOST_FADE }, null));
  const ghostSide =
    ghostRun +
    mirrored(ghostRun) +
    `<div class="${GHOST_FADE}" style="position:absolute;left:${f(-N_OUT / 2)}px;top:0;width:${f(N_OUT)}px;height:${f(T)}px;` +
    `background-color:${ink};clip-path:${poly(NOTCH)}"></div>`;
  const ghost =
    `<div class="xh-ghost ${GHOST_GROW}" style="${BOX};display:none" ${show(c.ghost)}>` +
    [0, 1, 2].map((k) => frame(k, ghostSide)).join("") +
    `</div>`;

  // Reload bars: the same gap from a triangle of the current spread. Both fill from their outer end toward the
  // middle, over a track of the full fill length. The game skips a binding that reads no model, so the position
  // always reads the spread.
  const inner = `(${f(DESIGN.r / SQ3)} * ${c.scale} + ${f(DESIGN.barGap)})`;
  const inset = DESIGN.barInset;
  const bar = at(
    `(-1 * ${inner} - ${f(DESIGN.barLen)})`,
    `<div style="position:absolute;left:0;top:${f(BAR_Y - DESIGN.barBase / 2)}px;width:${f(DESIGN.barLen)}px;height:${f(DESIGN.barBase)}px;background-color:${barBase}"></div>` +
      `<div style="position:absolute;left:${f(inset)}px;top:${f(BAR_Y - DESIGN.barProgress / 2)}px;width:${f(DESIGN.barLen - 2 * inset)}px;height:${f(DESIGN.barProgress)}px;background-color:${barWork}"></div>` +
      `<div style="position:absolute;left:${f(inset)}px;top:${f(BAR_Y - DESIGN.barProgress / 2)}px;height:${f(DESIGN.barProgress)}px;background-color:${barFill}" ` +
      `data-bind-style-width="(${f(DESIGN.barLen - 2 * inset)} * ${filling(c.progress)}) + 'px'" ` +
      // Half the fill colour while the gun reloads.
      `data-bind-style-background-color="(${c.reloading}) ? '${barReloading}' : '${barFill}'"></div>`,
  );
  const bars = barsOn ? `<div style="${BOX}">${bar}</div>${mirrored(bar)}` : "";

  /** A filled triangle, apex up, around the origin at circumradius rc. */
  const tri = (rc: number, color: string): string =>
    `<div style="position:absolute;left:${f((-rc * SQ3) / 2)}px;top:${f(-rc)}px;width:${f(rc * SQ3)}px;height:${f(1.5 * rc)}px;` +
    `background-color:${color};clip-path:${poly([[(rc * SQ3) / 2, 0], [rc * SQ3, 1.5 * rc], [0, 1.5 * rc]])}"></div>`;
  // The outline: each edge moved out by the stroke width.
  const center = tri(DESIGN.center + 2 * DESIGN.centerStroke, centerStroke) + tri(DESIGN.center, centerFill);

  // The layers of Triangle.vue, with the same names.
  const layer = (name: string, inner: string): string => (inner ? `<div class="xh-${name}" style="${BOX}">${inner}</div>` : "");
  return {
    reticle:
      layer("base", base) +
      layer("main", main) +
      layer("range", [0, 1, 2].map((k) => frame(k, marks)).join("")) +
      ghost,
    sight: layer("center", center),
    fixed: layer("bars", bars),
  };
}
