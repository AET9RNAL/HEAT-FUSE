import { BOX, GHOST_FADE, GHOST_GROW, f, type NativeContext, type NativeReticle } from "../../native.js";
import { colors } from "./colors.mjs";
import { DESIGN } from "./geometry.mjs";

const GLOW_PAD = 4;
const W = DESIGN.arcWidth;

const show = (cond: string): string => `data-bind-style-display="(${cond}) ? 'block' : 'none'"`;
const layer = (name: string, inner: string): string => (inner ? `<div class="xh-${name}" style="${BOX}">${inner}</div>` : "");

function wedge(a0: number, a1: number): string {
  const steps = Math.max(1, Math.ceil(Math.abs(a1 - a0) / 45));
  const pts = ["50% 50%"];
  for (let i = 0; i <= steps; i++) {
    const a = ((a0 + ((a1 - a0) * i) / steps) * Math.PI) / 180;
    pts.push(`${f(50 + 100 * Math.cos(a))}% ${f(50 + 100 * Math.sin(a))}%`);
  }
  return `polygon(${pts.join(", ")})`;
}

export function ringNative(c: NativeContext): ReturnType<NativeReticle> {
  const sides = String(c.settings.ring_sides ?? "clockwise");
  const barsOn = c.settings.ring_bars !== false;
  const { ink, reload, base, rim, center, backdrop, bar: barFill, barReloading, barWork, barBase } = colors(c.settings);
  const R = `(${f(DESIGN.r)} * ${c.scale})`;
  /** Outer radius of the band. */
  const OUT = `(${R} + ${f(DESIGN.band / 2)})`;
  const size = `data-bind-style-width="(2 * ${OUT}) + 'px'" data-bind-style-height="(2 * ${OUT}) + 'px'"`;

  /** Moves the origin to the top left of the ring box. */
  const atBox = (inner: string): string =>
    `<div style="${BOX}" data-bind-style-transform="'translate(' + (-1 * ${OUT}) + 'px,' + (-1 * ${OUT}) + 'px)'">${inner}</div>`;
  const ringStyle = (border: number, color: string, clip = ""): string =>
    `position:absolute;left:0;top:0;box-sizing:border-box;border-radius:50%;border:${f(border)}px solid ${color}` +
    (clip ? `;clip-path:${clip}` : "");
  /** A ring the size of the ring box. */
  const ring = (border: number, color: string, clip = "", cls = ""): string =>
    `<div${cls ? ` class="${cls}"` : ""} style="${ringStyle(border, color, clip)}" ${size}></div>`;
  const arc = (m: number, color: string, cls = ""): string => ring(DESIGN.band, color, wedge(m - W / 2, m + W / 2), cls);

  /** The part of a ring between angle `from` and `from + turn`, `turn` (an expression) running 0..`span` toward `dir`. */
  const filling = (from: number, span: number, dir: 1 | -1, turn: string, color: string): string => {
    const box = dir > 0 ? wedge(from, from + span) : wedge(from - span, from);
    const half = dir > 0 ? wedge(from - 180, from) : wedge(from, from + 180);
    return (
      `<div style="position:absolute;left:0;top:0;clip-path:${box}" ${size}>` +
      `<div style="${ringStyle(DESIGN.band, color, half)};width:100%;height:100%;transform-origin:50% 50%" ` +
      `data-bind-style-transform="'rotate(' + (${dir} * ${turn}) + 'deg)'"></div></div>`
    );
  };

  // The arcs: whole in the reticle colour while loaded, and filling in the reload colour while the gun reloads.
  const reloadArcs = DESIGN.arcs
    .map((m: number, k: number) => {
      if (sides === "off") return arc(m, reload);
      if (sides === "middle_out") {
        const turn = `(${c.progress} * ${f(W / 2)})`;
        return filling(m, W / 2, 1, turn, reload) + filling(m, W / 2, -1, turn, reload);
      }
      return filling(m - W / 2, W, 1, `(Math.min(1, Math.max(0, ${c.progress} * 3 - ${k})) * ${f(W)})`, reload);
    })
    .join("");
  const main =
    `<div style="${BOX};display:none" ${show(`!(${c.reloading})`)}>${atBox(DESIGN.arcs.map((m: number) => arc(m, ink)).join(""))}</div>` +
    `<div style="${BOX};display:none" ${show(c.reloading)}>${atBox(reloadArcs)}</div>`;

  // Range: a mark in the middle of each gap in the stage colour, with its glow. The reticle colour with no target.
  const markArcs = (color: string): string =>
    DESIGN.marks.map((m: number) => ring(DESIGN.band, color, wedge(m - DESIGN.markWidth / 2, m + DESIGN.markWidth / 2))).join("");
  const glow = (color: string): string =>
    `<div style="position:absolute;left:${f(-GLOW_PAD)}px;top:${f(-GLOW_PAD)}px;filter:drop-shadow(0 0 2px ${color})" ` +
    `data-bind-style-width="(2 * ${OUT} + ${f(2 * GLOW_PAD)}) + 'px'" data-bind-style-height="(2 * ${OUT} + ${f(2 * GLOW_PAD)}) + 'px'">` +
    `<div style="position:absolute;left:${f(GLOW_PAD)}px;top:${f(GLOW_PAD)}px">${markArcs(color)}</div></div>`;
  const range =
    `<div style="${BOX};display:none" ${show(`(${c.stage}) === 0`)}>${atBox(markArcs(ink))}</div>` +
    c.range.map((color, i) => `<div style="${BOX};display:none" ${show(`(${c.stage}) === ${i + 1}`)}>${atBox(glow(color))}</div>`).join("");

  // Ghost: the whole arcs, which grow and fade each time the ghost turns on.
  const ghost =
    `<div class="xh-ghost ${GHOST_GROW}" style="${BOX};display:none" ${show(c.ghost)}>` +
    atBox(DESIGN.arcs.map((m: number) => arc(m, ink, GHOST_FADE)).join("")) +
    `</div>`;

  // Reload bars: the same gap from a ring of the current spread. Both fill from their outer end toward the middle,
  // over a track of the full fill length.
  const inner = `(${R} + ${f(DESIGN.barGap)})`;
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
  const circle = (d: number, color: string): string =>
    `<div style="position:absolute;left:${f(-d / 2)}px;top:${f(-d / 2)}px;width:${f(d)}px;height:${f(d)}px;border-radius:50%;background-color:${color}"></div>`;

  // The layers of Ring.vue, with the same names.
  return {
    reticle:
      layer("base", atBox(ring(DESIGN.band, base))) +
      layer("rim", atBox(ring(DESIGN.rim, rim))) +
      layer("main", main) +
      layer("range", range) +
      ghost,
    sight: layer("center", circle(DESIGN.backdrop, backdrop) + circle(DESIGN.dot, center)),
    fixed: layer("bars", bars),
  };
}
