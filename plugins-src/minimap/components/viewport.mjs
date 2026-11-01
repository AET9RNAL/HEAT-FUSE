// Editor view math: a north-up view of the world with a centre (cx, cy) in metres and a scale k in px per metre.
// Screen (sx, sy) counts from the top-left of the view, w x h px. World y points north, screen y points down.

/** @typedef {{ cx: number, cy: number, k: number }} View */
/** @typedef {{ x0: number, ytop: number, w: number, h: number }} Rect */

/** @param {Rect} r @param {number} w @param {number} h @returns {View} */
export function fit(r, w, h, pad = 0.04) {
  const k = Math.min(w / r.w, h / r.h) * (1 - pad);
  return { cx: r.x0 + r.w / 2, cy: r.ytop - r.h / 2, k };
}

/** @param {View} v @returns {[number, number]} */
export function toWorld(v, sx, sy, w, h) {
  return [v.cx + (sx - w / 2) / v.k, v.cy - (sy - h / 2) / v.k];
}

/** @param {View} v @returns {[number, number]} */
export function toScreen(v, x, y, w, h) {
  return [w / 2 + (x - v.cx) * v.k, h / 2 - (y - v.cy) * v.k];
}

/** Scales by `factor` and keeps the world point under (sx, sy) in place. @param {View} v @returns {View} */
export function zoomAt(v, sx, sy, w, h, factor, kMin, kMax) {
  const k = Math.min(kMax, Math.max(kMin, v.k * factor));
  const [x, y] = toWorld(v, sx, sy, w, h);
  return { cx: x - (sx - w / 2) / k, cy: y + (sy - h / 2) / k, k };
}

/** The SVG viewBox of the view, for content drawn at (x, -y). @param {View} v */
export function viewBox(v, w, h) {
  return `${v.cx - w / 2 / v.k} ${-v.cy - h / 2 / v.k} ${w / v.k} ${h / v.k}`;
}

function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function inPolygon(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * The topmost feature at world (x, y), or null. `tol` is the pick distance in metres.
 * `badge(f)` gives the circle of a point's art drawn above it, as { dy, r } in metres, or null.
 * @template {{ id: string, kind: string, tag?: string, points: [number, number][] }} F
 * @param {F[]} features
 * @param {number} x
 * @param {number} y
 * @param {number} tol
 * @param {((f: F) => { dy: number, r: number } | null) | undefined} [badge]
 * @returns {F | null}
 */
export function hitFeature(features, x, y, tol, badge) {
  for (let i = features.length - 1; i >= 0; i--) {
    const f = features[i];
    const p = f.points;
    if (f.kind === "point") {
      if (Math.hypot(p[0][0] - x, p[0][1] - y) <= tol * 2) return f;
      const b = badge?.(f);
      if (b && Math.hypot(p[0][0] - x, p[0][1] + b.dy - y) <= b.r) return f;
      continue;
    }
    for (let j = 1; j < p.length; j++) {
      if (segDist(x, y, p[j - 1][0], p[j - 1][1], p[j][0], p[j][1]) <= tol) return f;
    }
    if (f.kind === "area") {
      const last = p.length - 1;
      if (segDist(x, y, p[last][0], p[last][1], p[0][0], p[0][1]) <= tol) return f;
      if (inPolygon(x, y, p)) return f;
    }
  }
  return null;
}
