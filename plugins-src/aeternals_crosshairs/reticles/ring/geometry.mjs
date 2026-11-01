// Geometry of the ring reticle, in px around its centre (y down). Angles are in degrees, clockwise from +x.

/** Sizes in px at the smallest dispersion circle. The ring grows with the dispersion. The band keeps its width. */
export const DESIGN = {
  /** Radius of the band's centreline: a 75 px ring. */
  r: 37.5,
  band: 3.12,
  /** The thin line on the outer edge of the band. */
  rim: 0.25,
  /** The three arcs: their middles, clockwise from the top, and their width. */
  arcs: [330, 90, 210],
  arcWidth: 60,
  /** A range mark in the middle of each gap between the arcs, and its width. */
  marks: [270, 30, 150],
  markWidth: 8,
  /** Center: the backdrop and the dot, both circles (diameters). */
  backdrop: 4,
  dot: 3.12,
  /** Reload bars: gap from the band's centreline, length, base and fill heights, fill inset at each end. */
  barGap: 25,
  barLen: 75,
  barBase: 6.25,
  barProgress: 3.12,
  barInset: 1.56,
};

const rad = (a) => (a * Math.PI) / 180;
const at = (a, r) => [r * Math.cos(rad(a)), r * Math.sin(rad(a))];

/** Inner and outer radius of the band for a centreline radius r. */
export function bandRadii(r) {
  return [r - DESIGN.band / 2, r + DESIGN.band / 2];
}

/** An annular sector from angle a0 to a1 as a polygon, in steps of at most 1 degree. */
export function sector(a0, a1, rIn, rOut) {
  const n = Math.max(1, Math.ceil(Math.abs(a1 - a0)));
  const outer = [];
  const inner = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    outer.push(at(a, rOut));
    inner.push(at(a, rIn));
  }
  return [...outer, ...inner.reverse()];
}

/** The same sector as an SVG path with true arcs. */
export function sectorPath(a0, a1, rIn, rOut) {
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
  const p = (a, r) => at(a, r).map((v) => v.toFixed(3)).join(",");
  return `M${p(a0, rOut)}A${rOut},${rOut} 0 ${large} 1 ${p(a1, rOut)}L${p(a1, rIn)}A${rIn},${rIn} 0 ${large} 0 ${p(a0, rIn)}Z`;
}

/** A whole ring as an SVG path, for the evenodd fill rule. */
export function ringPath(rIn, rOut) {
  const circle = (r) => `M${r},0A${r},${r} 0 1 1 ${-r},0A${r},${r} 0 1 1 ${r},0Z`;
  return circle(rOut) + circle(rIn);
}

/** Fill fraction of each arc for a total progress 0..1, clockwise from the top. */
export function progressSplit(progress) {
  const p = Math.max(0, Math.min(1, progress)) * 3;
  return [0, 1, 2].map((k) => Math.max(0, Math.min(1, p - k)));
}

/** The angle ranges of arc k filled to fraction f: from its start clockwise, or from its middle out. */
export function arcPart(k, f, middleOut = false) {
  const m = DESIGN.arcs[k];
  const w = DESIGN.arcWidth;
  if (f <= 0) return [];
  if (middleOut) return [[m - (w / 2) * f, m + (w / 2) * f]];
  return [[m - w / 2, m - w / 2 + w * f]];
}
