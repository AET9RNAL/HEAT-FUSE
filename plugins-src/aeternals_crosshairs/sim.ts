/** A scripted cannon for the preview: a shot, the spread settling, the reload, and each range stage in turn. */

export interface PreviewState {
  /** A default-aim weapon: the preview follows it. */
  active: boolean;
  /** The weapon keeps the game's own aim. */
  own: boolean;
  scale: number;
  /** The aim is fully settled (the game's `spread.reduced`). */
  reduced: boolean;
  reloading: boolean;
  progress: number;
  /** 0 no target, 1 effective, 2 falloff, 3 out. */
  range: number;
  distance: number;
}

export const SIM_LOOP_S = 6;
export const RELOAD_S = 3;
/** The spread settles before the reload ends, so the two ghost moments differ. */
export const SETTLE_S = 1.5;
const RANGE_STEP_S = 1.5;
const BLOOM = 0.5;
const SETTLE_PER_S = BLOOM / SETTLE_S;

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** The preview state at t seconds into the loop. */
export function simAt(time: number): PreviewState {
  const t = ((time % SIM_LOOP_S) + SIM_LOOP_S) % SIM_LOOP_S;
  return {
    active: true,
    own: false,
    scale: round2(1 + Math.max(0, BLOOM - SETTLE_PER_S * t)),
    reduced: t >= SETTLE_S,
    reloading: t < RELOAD_S,
    progress: round2(Math.min(1, t / RELOAD_S)),
    range: 1 + (Math.floor(t / RANGE_STEP_S) % 3),
    distance: 120 + Math.round(t * 180),
  };
}
