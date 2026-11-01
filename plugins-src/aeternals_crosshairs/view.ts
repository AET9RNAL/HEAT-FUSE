/** Turns the Accessors `crosshair` read into the reticle state, and decides when the ghost and the sound play. */

export interface CrosshairRead {
  config?: Record<string, unknown> | null;
  spread?: { spread?: number; reduced?: boolean } | null;
  reloading?: { reloading?: boolean; reloadPrc?: number; isPaused?: boolean } | null;
  range?: { stage?: number; distance?: number } | null;
  js?: Record<string, Record<string, unknown> | undefined> | null;
  /** HUD page size, px. */
  screen?: [number, number] | null;
}

export interface CrosshairView {
  /** The game draws its own aim for this crosshair type (machine gun, overheat, missiles...). */
  own: boolean;
  /** Pitch limit: the game shows its cross instead of an aim. */
  locked: boolean;
  /** Dispersion circle over the game's smallest circle, 1 or more. */
  scale: number;
  /** The game's "fully aimed" flag: the spread settled at its rest size. It also works in sniper view. */
  reduced: boolean;
  reloading: boolean;
  /** 0..1 */
  progress: number;
  paused: boolean;
  /** 0 nothing under the aim, 1 effective, 2 falloff, 3 out. */
  range: number;
  distance: number;
}

/** The game's spread limits in rem, and px per rem at 1440p, for when its models are not read yet. */
export const MIN_SPREAD_REM = 30;
export const MAX_SPREAD_REM = 175;
export const REM = 1.335;
/** Types whose whole aim widget the game hides. */
const HIDDEN_TYPES = new Set(["Hidden", "OnlyAmmoLoader"]);
/** Types with their own game aim. Every other type uses the default aim, which the reticle replaces. */
export const GAME_AIMS = [
  "TopAttack",
  "RailGun",
  "MachineGunMechanic",
  "TargetTrackerGun",
  "Mim146Missiles",
  "GatlingGun",
  "GatlingGunWithOverheat",
  "RayAiming",
  "BallisticStrike",
  "RocketBarrage",
  "Hidden",
  "OnlyCenterMark",
];
const OWN = new Set(GAME_AIMS);

const num = (v: unknown, def: number): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
};

/** The game's spread circle limits, px. */
export function spreadLimits(x: CrosshairRead | null): { min: number; max: number } {
  const app = x?.js?.NormalizedAimAppearance ?? {};
  const rem = num(x?.js?.ViewInfoModel?.remMultiplier, REM);
  return { min: num(app.minSpreadDiameter, MIN_SPREAD_REM) * rem, max: num(app.maxSpreadDiameter, MAX_SPREAD_REM) * rem };
}

/** The reticle state, or null while the game hides its crosshair. */
export function buildView(x: CrosshairRead | null): CrosshairView | null {
  const cfg = x?.config;
  if (!cfg) return null;
  const type = String(cfg.crosshairType ?? "");
  if (!cfg.visible || HIDDEN_TYPES.has(type)) return null;
  const rl = x?.reloading ?? {};
  const lim = spreadLimits(x);
  return {
    own: OWN.has(type),
    locked: Boolean(cfg.isRestrictedByPitchLimits),
    scale: Math.max(num(x?.spread?.spread, 0), lim.min) / lim.min,
    reduced: Boolean(x?.spread?.reduced),
    reloading: Boolean(rl.reloading),
    progress: Math.max(0, Math.min(1, num(rl.reloadPrc, 0) / 100)),
    paused: Boolean(rl.isPaused),
    range: Math.max(0, Math.min(3, Math.trunc(num(x?.range?.stage, 0)))),
    distance: Math.max(0, Math.round(num(x?.range?.distance, 0))),
  };
}

/**
 * When the ghost and the aimed sound play. "dispersion": each time the aim fully settles (`spread.reduced` turns
 * true). "reload": at the end of each reload. The ghost in the game HUD uses the same flags (native.ts).
 */
export type CueMode = "dispersion" | "reload";
export const GHOST_MODES = ["dispersion", "reload"] as const;

export class Cue {
  private armed = false;
  private mode: CueMode;

  constructor(mode: CueMode) {
    this.mode = mode;
  }

  /** A new mode starts unarmed. */
  setMode(mode: CueMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    this.armed = false;
  }

  reset(): void {
    this.armed = false;
  }

  /** True when the cue fires on this read. */
  read(v: Pick<CrosshairView, "own" | "locked" | "reloading" | "reduced"> | null): boolean {
    if (!v || v.own || v.locked) return false;
    const above = this.mode === "dispersion" ? !v.reduced : v.reloading;
    if (above) {
      this.armed = true;
      return false;
    }
    return this.armed ? this.fire() : false;
  }

  private fire(): boolean {
    this.armed = false;
    return true;
  }
}
