// Geometry of the triangle reticle, in px around the triangle centre (y down, apex up).
// The sides run clockwise from the apex: 0 right, 1 bottom, 2 left.

const SQ3 = Math.sqrt(3);

/** Corner k (0 apex, 1 bottom right, 2 bottom left) at circumradius r. */
export function vertex(k, r) {
  const a = (k * 2 * Math.PI) / 3;
  return [r * Math.sin(a), -r * Math.cos(a)];
}

/** Where the line through p with direction d meets the line through q with direction e. */
function meet(p, d, q, e) {
  const den = d[0] * e[1] - d[1] * e[0];
  if (Math.abs(den) < 1e-9) return [p[0], p[1]];
  const s = ((q[0] - p[0]) * e[1] - (q[1] - p[1]) * e[0]) / den;
  return [p[0] + d[0] * s, p[1] + d[1] * s];
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const mul = (a, s) => [a[0] * s, a[1] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const unit = (a) => {
  const l = Math.hypot(a[0], a[1]) || 1;
  return [a[0] / l, a[1] / l];
};

/** The band of each side [outer start, outer end, inner end, inner start]: circumradius r, thickness t, corner gap g. */
export function bars(r, t, g) {
  const tt = Math.max(0.5, Math.min(t, r / 2 - 0.5));
  const ri = r - 2 * tt;
  const V = [0, 1, 2].map((k) => vertex(k, r));
  const W = [0, 1, 2].map((k) => vertex(k, ri));
  const out = [];
  for (let k = 0; k < 3; k++) {
    const k1 = (k + 1) % 3;
    const edge = unit(sub(V[k1], V[k]));
    // Each end is cut along the corner bisector, half a gap away from the corner.
    const cut = (c, toward) => {
      const u = unit(V[c]);
      let n = [-u[1], u[0]];
      if (dot(n, toward) < 0) n = mul(n, -1);
      return { p: add(V[c], mul(n, g / 2)), d: u };
    };
    const a = cut(k, edge);
    const b = cut(k1, mul(edge, -1));
    out.push([
      meet(a.p, a.d, V[k], edge),
      meet(b.p, b.d, V[k], edge),
      meet(b.p, b.d, W[k], edge),
      meet(a.p, a.d, W[k], edge),
    ]);
  }
  return out;
}

/** The part of a polygon between positions lo and hi along side k. */
function clipAlong(poly, k, r, lo, hi) {
  const v0 = vertex(k, r);
  const e = unit(sub(vertex((k + 1) % 3, r), v0));
  // Keeps one side of the bound. An edge that crosses the bound gets a point on it.
  const half = (pts, keep, bound) => {
    const res = [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const q = pts[(i + 1) % pts.length];
      const sp = dot(sub(p, v0), e);
      const sq = dot(sub(q, v0), e);
      if (keep(sp)) res.push(p);
      if (keep(sp) !== keep(sq)) res.push(add(p, mul(sub(q, p), (bound - sp) / (sq - sp))));
    }
    return res;
  };
  return half(half(poly, (s) => s >= lo, lo), (s) => s <= hi, hi);
}

/** [min, max] position of a polygon along side k, from corner k. */
function spanAlong(poly, k, r) {
  const v0 = vertex(k, r);
  const e = unit(sub(vertex((k + 1) % 3, r), v0));
  const s = poly.map((p) => dot(sub(p, v0), e));
  return [Math.min(...s), Math.max(...s)];
}

/** Side k filled from its start corner up to fraction f of its length. */
export function barPart(poly, k, r, f) {
  if (f <= 0) return [];
  if (f >= 1) return poly;
  const [lo, hi] = spanAlong(poly, k, r);
  return clipAlong(poly, k, r, lo - 1, lo + f * (hi - lo));
}

/** Side k filled from its middle out to both corners, fraction f of its length. */
export function barSlab(poly, k, r, f) {
  if (f <= 0) return [];
  if (f >= 1) return poly;
  const [lo, hi] = spanAlong(poly, k, r);
  const mid = (lo + hi) / 2;
  const half = (f * (hi - lo)) / 2;
  return clipAlong(poly, k, r, mid - half, mid + half);
}

/** Sizes in px at the smallest dispersion circle. The radius grows with the dispersion, and every other size stays. */
export const DESIGN = {
  /** Circumradius: a 75 px side. */
  r: 75 / SQ3,
  /** Side thickness, base track thickness, and the gap at each corner. */
  band: 3.125,
  track: 1.5625,
  gap: 1.5625,
  /** Range notch in the middle of each side: outer width, inner width and depth. */
  notchOuter: 9.375,
  notchInner: 3.125,
  notchDepth: 1.5625,
  /** Circumradius of the center mark (6.26 x 5.42 px), and the width of its outline. */
  center: 6.26 / SQ3,
  centerStroke: 1,
  /** Reload bars: gap from the triangle at its centre height, length, base and fill heights, fill inset at each end. */
  barGap: 12.5,
  barLen: 75,
  barBase: 6.25,
  barProgress: 3.125,
  barInset: 1.5625,
};

/**
 * Side k with the range notch cut into the middle of its outer edge, and the notch itself.
 * Point order: outer start, notch, outer end, inner end, inner start.
 */
export function notchedSide(k, r, t, g, notch = DESIGN) {
  const [p0, p1, p2, p3] = bars(r, t, g)[k];
  const e = unit(sub(p1, p0));
  const m = mul(add(vertex(k, r), vertex((k + 1) % 3, r)), 0.5);
  const n = mul(unit(m), -1);
  const a = sub(m, mul(e, notch.notchOuter / 2));
  const b = add(m, mul(e, notch.notchOuter / 2));
  const ai = add(sub(m, mul(e, notch.notchInner / 2)), mul(n, notch.notchDepth));
  const bi = add(add(m, mul(e, notch.notchInner / 2)), mul(n, notch.notchDepth));
  return { side: [p0, a, ai, bi, b, p1, p2, p3], range: [a, ai, bi, b] };
}

/** Half the triangle width at its centre height, where the reload bars sit. */
export function halfWidth(r) {
  return r / SQ3;
}

/** Fill fraction of each side for a total progress 0..1, clockwise from the apex. */
export function progressSplit(progress) {
  const p = Math.max(0, Math.min(1, progress)) * 3;
  return [0, 1, 2].map((k) => Math.max(0, Math.min(1, p - k)));
}

/** A filled triangle, apex up, at circumradius r. */
export function solid(r) {
  return [0, 1, 2].map((k) => vertex(k, r));
}

/** The same triangle with each edge moved out by s: the circumradius grows by 2 s. */
export function outset(r, s) {
  return solid(r + 2 * s);
}

/** Points for an SVG polygon. */
export function pts(poly) {
  return poly.map((p) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(" ");
}
