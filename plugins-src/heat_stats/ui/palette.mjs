/**
 * Chart colours.
 *
 * Not the UI accents: those live at OKLCH L 0.71-0.96, well outside the
 * 0.48-0.67 band a mark needs on a dark surface, and `--woth-ally` sits under
 * the chroma floor - as a chart series it reads grey. Each colour below holds
 * its token's hue and was snapped to an in-band lightness, then validated
 * against `--black-2` (#191a19), the panel these are drawn on.
 *
 * Categorical, adjacent pairs: worst CVD ΔE 9.1 (deutan), normal-vision floor
 * 24.1, every slot >= 3:1. The first three also clear the all-pairs test, which
 * is what caps the scatter at three series.
 *
 * Two rules hold the whole thing together:
 *   - The order is fixed and never cycled. A fifth series folds into "other",
 *     or the chart becomes small multiples. A generated hue would fail CVD.
 *   - A chart is either outcome-coloured or identity-coloured, never both.
 */

/** Identity: which series. Assigned in order, from the first slot. */
export const CATEGORICAL = ["#03ae63", "#d43c02", "#027fa7", "#9d9501"];

/** Magnitude: how much. One hue, light end 2.36:1 on the surface. */
export const SEQUENTIAL = ["#046336", "#04884c", "#03ae63", "#0ed67b", "#19ff94"];

/** Polarity: which side of your own average. Two hues, neutral grey between. */
export const POSITIVE = "#03ae63";
export const NEGATIVE = "#d43c02";
export const NEUTRAL = "#6b6b69";

/** Where a value sits on the sequential ramp. `t` is 0-1; null is "no reading". */
export function step(t) {
  if (t == null || !Number.isFinite(t)) return "transparent";
  const i = Math.min(SEQUENTIAL.length - 1, Math.max(0, Math.round(t * (SEQUENTIAL.length - 1))));
  return SEQUENTIAL[i];
}

/** rgba() of any of the above, for fills under a line. */
export function alpha(hex, a) {
  const v = parseInt(hex.slice(1), 16);
  return `rgba(${(v >> 16) & 255}, ${(v >> 8) & 255}, ${v & 255}, ${a})`;
}
