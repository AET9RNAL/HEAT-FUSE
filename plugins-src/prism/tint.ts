/**
 * Raster recolour: a CSS filter chain that paints every opaque icon pixel one colour.
 * CoHTML composes a filter chain into one colour matrix and clamps only at the end,
 * so `brightness(0) invert(1)` gives exact white and the rest is solved directly:
 * sepia moves white off the grey axis, hue-rotate and saturate set the hue and
 * chroma, brightness sets the luminance.
 */

type Vec = [number, number, number];

const LUM: Vec = [0.213, 0.715, 0.072];
const lum = (v: Vec) => v[0] * LUM[0] + v[1] * LUM[1] + v[2] * LUM[2];
const mul = (m: number[], v: Vec): Vec => [
  m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
  m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
  m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
];

function hueMatrix(deg: number): number[] {
  const a = (deg / 180) * Math.PI;
  const sin = Math.sin(a);
  const cos = Math.cos(a);
  return [
    0.213 + cos * 0.787 - sin * 0.213, 0.715 - cos * 0.715 - sin * 0.715, 0.072 - cos * 0.072 + sin * 0.928,
    0.213 - cos * 0.213 + sin * 0.143, 0.715 + cos * 0.285 + sin * 0.14, 0.072 - cos * 0.072 - sin * 0.283,
    0.213 - cos * 0.213 - sin * 0.787, 0.715 - cos * 0.715 + sin * 0.715, 0.072 + cos * 0.928 + sin * 0.072,
  ];
}

/** sepia(1) applied to white, unclamped. */
const SEPIA_WHITE: Vec = [0.393 + 0.769 + 0.189, 0.349 + 0.686 + 0.168, 0.272 + 0.534 + 0.131];

const round = (v: number, d: number) => Number(v.toFixed(d));

function solve(r: number, g: number, b: number): string {
  const t: Vec = [r / 255, g / 255, b / 255];
  const lt = lum(t);
  const ct: Vec = [t[0] - lt, t[1] - lt, t[2] - lt];
  const chroma = Math.hypot(...ct);
  // Greys need no hue: invert(x) of black is (x, x, x).
  if (chroma < 1e-3) return `brightness(0) invert(${round(lt, 4)})`;

  const ls = lum(SEPIA_WHITE);
  const k = lt / ls;
  let best = { err: Infinity, deg: 0, sat: 1 };
  for (let tenth = 0; tenth < 3600; tenth++) {
    const deg = tenth / 10;
    const v = mul(hueMatrix(deg), SEPIA_WHITE);
    const lv = lum(v);
    const cv: Vec = [v[0] - lv, v[1] - lv, v[2] - lv];
    const dot = cv[0] * ct[0] + cv[1] * ct[1] + cv[2] * ct[2];
    if (dot <= 0) continue;
    const sat = dot / (k * (cv[0] * cv[0] + cv[1] * cv[1] + cv[2] * cv[2]));
    const err = Math.hypot(k * sat * cv[0] - ct[0], k * sat * cv[1] - ct[1], k * sat * cv[2] - ct[2]);
    if (err < best.err) best = { err, deg, sat };
  }
  return `brightness(0) invert(1) sepia(1) saturate(${round(best.sat, 4)}) hue-rotate(${best.deg}deg) brightness(${round(k, 4)})`;
}

const cache = new Map<string, string>();

/** Filter that paints every opaque pixel `rgb`; `alpha` < 1 adds an opacity step. */
export function tintFilter(r: number, g: number, b: number, alpha = 1): string {
  const key = `${r},${g},${b}`;
  let chain = cache.get(key);
  if (!chain) {
    chain = solve(r, g, b);
    cache.set(key, chain);
  }
  return alpha < 0.999 ? `${chain} opacity(${alpha.toFixed(3)})` : chain;
}
