/** HEAT Stats API rows, shaped for the overview tab. */

export interface StatRow {
  group_key?: unknown;
  total_sessions?: unknown;
  wins?: unknown;
  losses?: unknown;
  win_rate?: unknown;
  avg_kd?: unknown;
  avg_kills?: unknown;
  avg_damage?: unknown;
  avg_score?: unknown;
}

/** A `/sessions` row: every match_sessions column but the samples. */
export interface SessionRow {
  outcome?: unknown;
  map_slug?: unknown;
  map_name?: unknown;
  started_at?: unknown;
  [column: string]: unknown;
}

export interface PerformanceRow {
  key: string;
  name: string;
  battles: number;
  kd: number;
  damage: number;
  score: number;
  winRate: number;
}

export interface Overview {
  player: string;
  battles: number;
  wins: number;
  losses: number;
  winRate: number;
  kd: number;
  /** Null until a battle carries `final_place`. Older battles predate the column. */
  avgPlacement: number | null;
  avgKills: number;
  avgDamage: number;
  /** Oldest to newest, up to STREAK_MAX. The window shows the last `streak_length`. */
  streak: string[];
  /** Null without a session list, because it needs every battle in play order. */
  longestWinStreak: number | null;
  /** Battles per local day (YYYY-MM-DD) over the last ACTIVITY_DAYS. Null without a session list. */
  activity: Record<string, number> | null;
  vehicles: PerformanceRow[];
  agents: PerformanceRow[];
  maps: PerformanceRow[];
  modes: PerformanceRow[];
}

export type StatGroup = "vehicle" | "agent" | "map" | "mode";
export const STAT_GROUPS: readonly StatGroup[] = ["vehicle", "agent", "map", "mode"];

/** Battles the streak strip can show, as offered in the config. */
export const STREAK_LENGTHS = [25, 50, 75, 100];
export const DEFAULT_STREAK_LENGTH = 75;
const STREAK_MAX = Math.max(...STREAK_LENGTHS);

/** Agent id -> name. The window labels an unknown id "Agent {id}". */
const AGENT_NAMES: Record<string, string> = {
  "1": "EMBER",
  "2": "KENT",
  "3": "CHOPPER",
  "5": "REAPER",
  "8": "RAKETA",
  "28": "HOUND",
  "29": "FLAIR",
  "30": "FUZZER",
  "33": "TWISTER",
};

/** Empty for an id without a known name. */
export function agentName(id: string): string {
  return AGENT_NAMES[id] ?? "";
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Vehicle slug -> display text, e.g. "a20_m60a2" -> "M60A2". */
export function prettyVehicle(v: unknown): string {
  const s = String(v ?? "")
    .replace(/^[a-z]{1,3}\d{1,3}_/i, "")
    .replace(/_/g, " ")
    .trim();
  return s ? s.toUpperCase() : "-";
}

/** Map slug -> display text, e.g. "03_sunstroke" -> "SUNSTROKE". */
export function prettyMap(v: unknown): string {
  const s = String(v ?? "")
    .replace(/^\d+_/, "")
    .replace(/_/g, " ")
    .trim();
  return s ? s.toUpperCase() : "-";
}

function performance(rows: StatRow[], name: (key: string) => string): PerformanceRow[] {
  return [...rows]
    .sort((a, b) => num(b.total_sessions) - num(a.total_sessions))
    .map((r) => {
      const key = String(r.group_key ?? "");
      return {
        key,
        name: name(key),
        battles: num(r.total_sessions),
        kd: num(r.avg_kd),
        damage: num(r.avg_damage),
        score: num(r.avg_score),
        winRate: num(r.win_rate),
      };
    });
}

/** The activity grid's reach: 53 weeks. */
const ACTIVITY_DAYS = 53 * 7;
const DAY_MS = 86_400_000;

/** Local calendar day, as the window's activity grid keys it. */
function dayKey(day: Date): string {
  const pad = (v: number) => String(v).padStart(2, "0");
  return `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;
}

/** Battles per local day, by when each started. */
function activityByDay(sessions: SessionRow[], now = Date.now()): Record<string, number> {
  const since = now - ACTIVITY_DAYS * DAY_MS;
  const days: Record<string, number> = {};
  for (const s of sessions) {
    const started = new Date(String(s.started_at ?? ""));
    const time = started.getTime();
    if (!Number.isFinite(time) || time < since) continue;
    const key = dayKey(started);
    days[key] = (days[key] ?? 0) + 1;
  }
  return days;
}

/** Longest run of wins, in play order. */
export function longestWinStreak(outcomes: string[]): number {
  let best = 0;
  let run = 0;
  for (const o of outcomes) {
    run = o === "win" ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}

/** Which column each grouping keys on. */
const GROUP_COLUMNS: Record<StatGroup, string> = {
  vehicle: "player_vehicle",
  agent: "player_agent_id",
  map: "map_slug",
  mode: "game_mode",
};

function mean(total: number, count: number): number {
  return count ? total / count : 0;
}

/** The game counts place from 0 and reports -1 for no rank. People count from 1, as the battle list does. */
function averagePlace(sessions: SessionRow[] | null): number | null {
  if (!sessions) return null;
  let sum = 0;
  let counted = 0;
  for (const s of sessions) {
    const raw = s.final_place;
    if (raw == null || raw === "") continue;
    const place = Number(raw);
    if (!Number.isFinite(place) || place < 0) continue;
    sum += place;
    counted += 1;
  }
  return counted ? sum / counted + 1 : null;
}

export function aggregateSessions(sessions: SessionRow[], group?: StatGroup): StatRow[] {
  const column = group ? GROUP_COLUMNS[group] : null;
  const buckets = new Map<string, SessionRow[]>();
  for (const s of sessions) {
    const key = column ? String(s[column] ?? "") : "";
    // A row with nothing in the grouping column belongs to no group.
    if (column && !key) continue;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(s);
    else buckets.set(key, [s]);
  }

  return [...buckets].map(([key, rows]) => {
    const total = rows.length;
    let wins = 0;
    let losses = 0;
    let kills = 0;
    let deaths = 0;
    let damage = 0;
    let score = 0;
    for (const r of rows) {
      const outcome = String(r.outcome ?? "");
      if (outcome === "win") wins++;
      else if (outcome === "loss") losses++;
      kills += num(r.final_kills);
      deaths += num(r.final_deaths);
      damage += num(r.final_damage);
      score += num(r.final_score);
    }
    return {
      group_key: key,
      total_sessions: total,
      wins,
      losses,
      win_rate: mean(wins, total) * 100,
      avg_kd: deaths ? kills / deaths : kills,
      avg_kills: mean(kills, total),
      avg_damage: mean(damage, total),
      avg_score: mean(score, total),
    };
  });
}

/** `sessions` arrives newest first, or null when there is no list. */
export function buildOverview(
  player: string,
  all: StatRow | undefined,
  groups: Record<StatGroup, StatRow[]>,
  sessions: SessionRow[] | null,
): Overview {
  const mapNames = new Map<string, string>();
  for (const s of sessions ?? []) {
    if (s.map_slug != null && s.map_name) mapNames.set(String(s.map_slug), String(s.map_name).toUpperCase());
  }
  const played = (sessions ?? []).map((s) => String(s.outcome ?? "")).reverse();
  return {
    player,
    battles: num(all?.total_sessions),
    wins: num(all?.wins),
    losses: num(all?.losses),
    winRate: num(all?.win_rate),
    kd: num(all?.avg_kd),
    avgPlacement: averagePlace(sessions),
    avgKills: num(all?.avg_kills),
    avgDamage: num(all?.avg_damage),
    streak: played.slice(-STREAK_MAX),
    longestWinStreak: sessions ? longestWinStreak(played) : null,
    activity: sessions ? activityByDay(sessions) : null,
    vehicles: performance(groups.vehicle, prettyVehicle),
    agents: performance(groups.agent, agentName),
    maps: performance(groups.map, (key) => mapNames.get(key) ?? prettyMap(key)),
    modes: performance(groups.mode, (key) => key),
  };
}
