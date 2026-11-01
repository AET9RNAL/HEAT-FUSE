// Geometry of the brackets reticle, in px around its centre (y down).
// Four corner brackets, clockwise from the top left: 0 top left, 1 top right, 2 bottom right, 3 bottom left.

const SQ2 = Math.SQRT2;

/** Sizes in px at the smallest dispersion circle. The square grows with the dispersion. The brackets keep their size. */
export const DESIGN = {
  /** Half the side of the square on the bracket centrelines: a 75 px square. */
  half: 37.5,
  /** Bracket and base track widths. */
  band: 3.12,
  track: 1.56,
  /** Along each side from the corner: where the bevel ends, where a bracket ends, and where its base track ends. */
  bevel: 9.38,
  arm: 25,
  trackArm: 28.13,
  /** Center: the backdrop and the dot, both squares. */
  backdrop: 6.24,
  dot: 3.12,
  /** Range marks beside the center: inner and outer x, height, and the same for the base under each mark. */
  markInner: 28.125,
  markOuter: 34.375,
  markHeight: 1.56,
  markBaseInner: 27.625,
  markBaseOuter: 34.875,
  markBaseHeight: 1.81,
  /** Blur of the glow around a range mark. */
  markGlow: 2,
  /** Reload bars: gap from the square, length, base and fill heights, fill inset at each end. */
  barGap: 25,
  barLen: 75,
  barBase: 6.25,
  barProgress: 3.12,
  barInset: 1.56,
};

/** The direction of the side that leaves corner k, clockwise. The side that arrives at corner k is the one of k - 1. */
const OUT = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
];
const SIGN = [
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, 1],
];

const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const mul = (a, s) => [a[0] * s, a[1] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const unit = (a) => {
  const l = Math.hypot(a[0], a[1]) || 1;
  return [a[0] / l, a[1] / l];
};

/** Corner k of the square with half side `half`. */
export function corner(k, half) {
  return [SIGN[k][0] * half, SIGN[k][1] * half];
}

/** Centreline of bracket k, clockwise: arm end, bevel start, bevel end, arm end. `arm` is measured from the corner. */
export function bracketPath(k, half, arm = DESIGN.arm, bevel = DESIGN.bevel) {
  const c = corner(k, half);
  const into = OUT[(k + 3) % 4];
  const out = OUT[k];
  return [sub(c, mul(into, arm)), sub(c, mul(into, bevel)), add(c, mul(out, bevel)), add(c, mul(out, arm))];
}

/** Where the line through p with direction d meets the line through q with direction e. */
function meet(p, d, q, e) {
  const den = d[0] * e[1] - d[1] * e[0];
  if (Math.abs(den) < 1e-9) return [p[0], p[1]];
  const s = ((q[0] - p[0]) * e[1] - (q[1] - p[1]) * e[0]) / den;
  return [p[0] + d[0] * s, p[1] + d[1] * s];
}

/**
 * A polyline stroked with width w, mitred joins and flat ends, as one band per segment. Each band ends on the
 * join's bisector, so the bands meet without a gap. A segment: start a, direction d, length len, band polygon.
 */
export function stroke(points, w) {
  const h = w / 2;
  const segs = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const d = unit(sub(b, a));
    segs.push({ a, b, d, n: [-d[1], d[0]], len: Math.hypot(b[0] - a[0], b[1] - a[1]) });
  }
  // The edge points at each vertex on both sides: flat at the ends, the miter point at a join.
  const side = (s) =>
    points.map((p, i) => {
      if (i === 0) return add(p, mul(segs[0].n, s * h));
      if (i === points.length - 1) return add(p, mul(segs[i - 1].n, s * h));
      const u = segs[i - 1];
      const v = segs[i];
      return meet(add(p, mul(u.n, s * h)), u.d, add(p, mul(v.n, s * h)), v.d);
    });
  const left = side(1);
  const right = side(-1);
  return segs.map((s, i) => ({ ...s, poly: [left[i], left[i + 1], right[i + 1], right[i]] }));
}

/** The whole stroked polyline as one polygon. */
export function outline(points, w) {
  const segs = stroke(points, w);
  return [...segs.map((s) => s.poly[0]), segs.at(-1).poly[1], segs.at(-1).poly[2], ...segs.map((s) => s.poly[3]).reverse()];
}

/** The part of a polygon before position t along the line from a in direction d. */
export function clipBefore(poly, a, d, t) {
  const res = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const sp = dot(sub(p, a), d);
    const sq = dot(sub(q, a), d);
    if (sp <= t) res.push(p);
    if (sp <= t !== sq <= t) res.push(add(p, mul(sub(q, p), (t - sp) / (sq - sp))));
  }
  return res.length >= 3 ? res : [];
}

/** The segments of a stroked path filled up to length s along its centreline. */
export function strokePart(segs, s) {
  let start = 0;
  const out = [];
  for (const seg of segs) {
    const part = clipBefore(seg.poly, seg.a, seg.d, s - start);
    if (part.length) out.push(part);
    start += seg.len;
  }
  return out;
}

/** Centreline length of a bracket. */
export function bracketLength(arm = DESIGN.arm, bevel = DESIGN.bevel) {
  return 2 * (arm - bevel) + bevel * SQ2;
}

/** The two halves of bracket k, from the middle of its bevel out to each arm end. */
export function bracketHalves(k, half) {
  const [p0, p1, p2, p3] = bracketPath(k, half);
  const m = mul(add(p1, p2), 0.5);
  return [
    [m, p2, p3],
    [m, p1, p0],
  ];
}

/** Fill fraction of each bracket for a total progress 0..1, clockwise from the top left. */
export function progressSplit(progress) {
  const p = Math.max(0, Math.min(1, progress)) * 4;
  return [0, 1, 2, 3].map((k) => Math.max(0, Math.min(1, p - k)));
}

/** An axis-aligned rectangle as a polygon. */
export function rect(x0, y0, x1, y1) {
  return [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ];
}

/** Points for an SVG polygon. */
export function pts(poly) {
  return poly.map((p) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(" ");
}
