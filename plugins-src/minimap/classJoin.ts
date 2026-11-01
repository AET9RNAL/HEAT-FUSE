export interface JoinMarker {
  id: number;
  aff: number;
  role: string;
  name: string;
  /** Metres from the player. */
  dist: number;
  squad: number;
}

export interface JoinBlip {
  key: string;
  aff: number;
  type: number;
  x: number;
  y: number;
  dist: number;
  platoon: number;
}

export type JoinHow = "squad" | "clear" | "kept" | "unclear" | "none";

export interface JoinResult {
  role: string;
  name: string;
  how: JoinHow;
  markerId: number | null;
}

const MAX_ERR_M = 20;
const CLEAR_MARGIN_M = 12;
const KEEP_ERR_M = 15;
const TRACK_MATCH_M = 70;
const TRACK_LOST_MS = 5000;
const VEHICLE = 0;
const SIDES = [2, 4];

const NONE: JoinResult = { role: "", name: "", how: "none", markerId: null };

interface Track {
  aff: number;
  x: number;
  y: number;
  markerId: number | null;
  lastMs: number;
}

/** Hungarian method on a rows x cols cost matrix. Returns the column for each row, or -1. */
export function assign(cost: number[][]): number[] {
  const rows = cost.length;
  const cols = rows ? cost[0]!.length : 0;
  if (!rows || !cols) return new Array(rows).fill(-1);
  const n = Math.max(rows, cols);
  const big = 1e9;
  const a = (i: number, j: number) => (i < rows && j < cols ? cost[i]![j]! : big / 1e3);
  const u = new Array(n + 1).fill(0);
  const v = new Array(n + 1).fill(0);
  const p = new Array(n + 1).fill(0);
  const way = new Array(n + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array(n + 1).fill(big);
    const used = new Array(n + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = big;
      let j1 = 0;
      for (let j = 1; j <= n; j++) {
        if (used[j]) continue;
        const cur = a(i0 - 1, j - 1) - u[i0] - v[j];
        if (cur < minv[j]) {
          minv[j] = cur;
          way[j] = j0;
        }
        if (minv[j] < delta) {
          delta = minv[j];
          j1 = j;
        }
      }
      for (let j = 0; j <= n; j++) {
        if (used[j]) {
          u[p[j]] += delta;
          v[j] -= delta;
        } else {
          minv[j] -= delta;
        }
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0);
  }
  const out = new Array(rows).fill(-1);
  for (let j = 1; j <= n; j++) {
    const i = p[j] - 1;
    if (i >= 0 && i < rows && j - 1 < cols) out[i] = j - 1;
  }
  return out;
}

export class ClassJoin {
  private results = new Map<string, JoinResult>();
  private tracks: Track[] = [];

  reset(): void {
    this.results.clear();
    this.tracks = [];
  }

  /** Returns a result for every blip. Only blips that are new on this poll are paired again. */
  update(blips: JoinBlip[], markers: JoinMarker[], now: number): Map<string, JoinResult> {
    const next = new Map<string, JoinResult>();
    for (const b of blips) {
      const old = this.results.get(b.key);
      if (old) next.set(b.key, old);
    }
    this.tracks = this.tracks.filter((t) => now - t.lastMs < TRACK_LOST_MS);
    const linked = new Set<Track>();

    for (const aff of SIDES) {
      const fresh = blips.filter((b) => b.aff === aff && !next.has(b.key));
      if (!fresh.length) continue;
      const side = markers.filter((m) => m.aff === aff && m.role);
      const claimed = new Set<number>();
      const todo: JoinBlip[] = [];

      for (const b of fresh) {
        if (b.type !== VEHICLE) {
          next.set(b.key, NONE);
          continue;
        }
        const mate = b.platoon > 0 ? side.find((m) => m.squad === b.platoon) : undefined;
        if (mate) {
          next.set(b.key, { role: mate.role, name: mate.name, how: "squad", markerId: mate.id });
          claimed.add(mate.id);
        } else {
          todo.push(b);
        }
      }

      const open = side.filter((m) => !claimed.has(m.id));
      const cost = todo.map((b) => open.map((m) => Math.min(MAX_ERR_M, Math.abs(m.dist - b.dist))));
      const pick = assign(cost);
      const unsure: JoinBlip[] = [];
      todo.forEach((b, i) => {
        const j = pick[i]!;
        const err = j >= 0 ? cost[i]![j]! : MAX_ERR_M;
        if (j < 0 || err >= MAX_ERR_M) {
          next.set(b.key, NONE);
          unsure.push(b);
          return;
        }
        const m = open[j]!;
        let alt = Infinity;
        open.forEach((o, k) => {
          if (k !== j) alt = Math.min(alt, Math.abs(o.dist - b.dist));
        });
        if (alt - err >= CLEAR_MARGIN_M) {
          next.set(b.key, { role: m.role, name: m.name, how: "clear", markerId: m.id });
          claimed.add(m.id);
        } else {
          next.set(b.key, { role: "", name: "", how: "unclear", markerId: m.id });
          unsure.push(b);
        }
      });

      // An unsure blip keeps the marker its track had, if that marker still fits and no sure blip took it.
      for (const b of unsure) {
        const t = this.track(b, linked);
        if (!t || t.markerId === null || claimed.has(t.markerId)) continue;
        const m = side.find((o) => o.id === t.markerId);
        if (m && Math.abs(m.dist - b.dist) <= KEEP_ERR_M) {
          next.set(b.key, { role: m.role, name: m.name, how: "kept", markerId: m.id });
          claimed.add(m.id);
        }
      }

      for (const b of fresh) {
        const r = next.get(b.key) ?? NONE;
        const t = this.track(b, linked);
        const sure = r.how === "squad" || r.how === "clear" || r.how === "kept";
        if (t) {
          t.x = b.x;
          t.y = b.y;
          t.lastMs = now;
          if (sure) t.markerId = r.markerId;
          linked.add(t);
        } else {
          const nt: Track = { aff, x: b.x, y: b.y, markerId: sure ? r.markerId : null, lastMs: now };
          this.tracks.push(nt);
          linked.add(nt);
        }
      }
    }
    this.results = next;
    return next;
  }

  /** The nearest track of the blip's side from earlier scans, not yet linked on this poll. */
  private track(b: JoinBlip, linked: Set<Track>): Track | null {
    let best: Track | null = null;
    let bestD = TRACK_MATCH_M;
    for (const t of this.tracks) {
      if (t.aff !== b.aff || (linked.has(t) && t.x !== b.x)) continue;
      const d = Math.hypot(t.x - b.x, t.y - b.y);
      if (d < bestD) {
        best = t;
        bestD = d;
      }
    }
    return best;
  }
}
