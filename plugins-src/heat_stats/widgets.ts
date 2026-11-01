export type Read = (name: string) => unknown;

export type RatePhase = "waiting" | "live" | "final";

/** What one reading covers: the whole battle, one life, or one round. */
export const RESET_MODES = ["battle", "life", "round"] as const;
export type ResetMode = (typeof RESET_MODES)[number];

export interface RateWidget {
  id: string;
  /** The Accessors counter this widget divides by battle time. */
  source(read: Read): string;
  /** Fraction digits of the rate. */
  digits: number;
  /** The rate shows at least this many characters, with dim leading zeros. */
  pad: number;
  /** One calibration value per bucket. */
  sim: number[];
}

export interface RateView {
  phase: RatePhase;
  /** Null for the first WARMUP_S of a reading, where one event reads as a huge rate. */
  rate: number | null;
  /** Null until the reading is one RECENT_S window long. */
  recent: number | null;
  total: number;
  /** Counted time in whole seconds. */
  elapsed: number;
  /** The counter's gain in each BUCKET_S slice, oldest first. The last one is still filling. Null is a slice not played yet. */
  bars: (number | null)[];
}

/** `battle_state` bits: Battle while playing, Aftermath and Termination after the match ends. */
const BS_BATTLE = 8;
const BS_ENDED = 16 | 32;
/** The break between two rounds: these `match_state` values, or the round-result camera. */
const ROUND_BREAK_STATES = new Set(["RoundResult", "Countdown"]);
const ROUND_BREAK_CAMERA = "RoundResultCamera";
const FIRING_RANGE = "FiringRange";
/** Consecutive unreadable battle_state ticks before the battle counts as gone. */
const STALE_TICKS = 3;
const WARMUP_S = 15;
const RECENT_S = 60;
const BUCKET_S = 10;
export const BUCKETS = 12;
const SIM_START_S = 252;
const SIM_STEP_S = 2;

export const RATE_WIDGETS: readonly RateWidget[] = [
  {
    id: "dpm",
    // The server credits no damage against FiringRange dummies. The hit numbers over them still count.
    source: (read) => (read("game_mode") === FIRING_RANGE ? "dealt_damage" : "player_damage"),
    digits: 0,
    pad: 4,
    sim: [180, 0, 420, 960, 310, 0, 0, 640, 1120, 380, 90, 700],
  },
  {
    id: "spm",
    source: () => "player_role_pts",
    digits: 0,
    pad: 4,
    sim: [40, 0, 120, 200, 60, 0, 25, 150, 300, 90, 0, 110],
  },
  {
    id: "kpm",
    source: () => "player_kills",
    digits: 2,
    pad: 1,
    sim: [0, 0, 1, 0, 0, 0, 1, 0, 2, 0, 0, 1],
  },
];

export function isResetMode(value: unknown): value is ResetMode {
  return RESET_MODES.includes(value as ResetMode);
}

function isDead(read: Read): boolean {
  return read("health") === 0 || read("scene") === "dead" || read("player_is_dead") === 1;
}

function isRoundBreak(read: Read): boolean {
  const info = read("scene_info") as { camera?: unknown } | null | undefined;
  return ROUND_BREAK_STATES.has(String(read("match_state"))) || info?.camera === ROUND_BREAK_CAMERA;
}

/**
 * A counter over battle time. A "life" or "round" reading stops at the death or the round break,
 * holds its value through it, and starts again when play resumes.
 */
export class RateTracker {
  phase: RatePhase = "waiting";
  reset: ResetMode = "battle";
  readonly widget: RateWidget;
  private source = "";
  private base = 0;
  private value = 0;
  private elapsed = 0;
  private stale = 0;
  private paused = false;
  private samples: { t: number; v: number }[] = [];
  private nextSample = 0;
  private closed: number[] = [];
  private bucketStart = 0;
  private bucketT = 0;

  constructor(widget: RateWidget) {
    this.widget = widget;
  }

  /** A start mid-battle, after a plugin reload or a rejoin, counts from here so the rate stays true. */
  private start(value: number, source: string): void {
    this.phase = "live";
    this.source = source;
    this.base = value;
    this.value = value;
    this.elapsed = 0;
    this.stale = 0;
    this.paused = false;
    this.samples = [{ t: 0, v: value }];
    this.nextSample = 1;
    this.closed = [];
    this.bucketStart = value;
    this.bucketT = 0;
  }

  /** True while the picked reset mode holds the reading. */
  private pausedFor(read: Read): boolean {
    if (this.reset === "life") return isDead(read);
    if (this.reset === "round") return isRoundBreak(read);
    return false;
  }

  tick(read: Read, dt: number): void {
    const bs = read("battle_state");
    const source = this.widget.source(read);
    const raw = read(source);
    const value = typeof raw === "number" ? raw : null;

    if (this.phase !== "live") {
      // The last battle's results are still up, and a start here counts them again.
      if (bs === BS_BATTLE && value !== null && read("pm_available") !== 1) this.start(value, source);
      return;
    }
    if (typeof bs !== "number") {
      if (++this.stale >= STALE_TICKS) this.phase = "waiting";
      return;
    }
    this.stale = 0;
    if (bs & BS_ENDED) {
      this.phase = "final";
      return;
    }
    if (bs !== BS_BATTLE) return;
    // game_mode reads empty for the first ticks, and two counters share no baseline.
    // A counter only goes up inside one battle, so a drop is the next battle.
    if (value !== null && (source !== this.source || value < this.value)) {
      this.start(value, source);
      return;
    }

    const paused = this.pausedFor(read);
    if (paused) {
      this.paused = true;
      return;
    }
    if (this.paused && value !== null) {
      this.start(value, source);
      return;
    }
    if (value !== null) this.value = value;
    this.elapsed += dt;

    this.bucketT += dt;
    while (this.bucketT >= BUCKET_S) {
      this.closed.push(this.value - this.bucketStart);
      if (this.closed.length > BUCKETS - 1) this.closed.shift();
      this.bucketStart = this.value;
      this.bucketT -= BUCKET_S;
    }

    if (this.elapsed >= this.nextSample) {
      this.samples.push({ t: this.elapsed, v: this.value });
      this.nextSample += 1;
      while (this.samples.length > 1 && this.samples[1]!.t <= this.elapsed - RECENT_S) this.samples.shift();
    }
  }

  /** Changes when the view changes. */
  get key(): string {
    return `${this.phase}|${Math.floor(this.elapsed)}|${this.value}`;
  }

  view(): RateView {
    const total = this.value - this.base;
    const first = this.samples[0];
    const span = first ? this.elapsed - first.t : 0;
    const bars: (number | null)[] = [...this.closed, this.value - this.bucketStart];
    while (bars.length < BUCKETS) bars.unshift(null);
    return {
      phase: this.phase,
      rate: this.elapsed >= WARMUP_S ? total / (this.elapsed / 60) : null,
      recent: this.elapsed >= RECENT_S && first && span > 0 ? (this.value - first.v) / (span / 60) : null,
      total,
      elapsed: Math.floor(this.elapsed),
      bars,
    };
  }
}

/** sim */
export function simView(widget: RateWidget, t: number): RateView {
  const shift = Math.floor(t / SIM_STEP_S) % widget.sim.length;
  const bars = [...widget.sim.slice(shift), ...widget.sim.slice(0, shift)];
  const perMinute = (widget.sim.reduce((sum, v) => sum + v, 0) * 60) / (BUCKET_S * widget.sim.length);
  const elapsed = SIM_START_S + Math.floor(t);
  const total = Math.round((perMinute * elapsed) / 60);
  return {
    phase: "live",
    rate: total / (elapsed / 60),
    recent: bars.slice(-RECENT_S / BUCKET_S).reduce((sum, v) => sum + v, 0),
    total,
    elapsed,
    bars,
  };
}
