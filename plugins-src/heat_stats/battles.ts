/** The Battles tab: stored battles, filtered, sorted and paged for the window. */
import { agentName, prettyMap, prettyVehicle, type SessionRow } from "./overview.js";

export const PAGE_SIZES = [5, 10, 20, 50, 75];
export const BATTLE_SORTS = ["played", "score", "kd", "damage", "place"] as const;
export type BattleSort = (typeof BATTLE_SORTS)[number];
export const OUTCOMES = ["win", "loss", "draw"];

export interface BattleQuery {
  search: string;
  outcome: string;
  /** Vehicle class, as `player_role`. */
  role: string;
  agent: string;
  map: string;
  mode: string;
  sort: BattleSort;
  pageSize: number;
  page: number;
}

export const DEFAULT_QUERY: BattleQuery = {
  search: "",
  outcome: "",
  role: "",
  agent: "",
  map: "",
  mode: "",
  sort: "played",
  pageSize: 10,
  page: 0,
};

type Num = number | null;

export interface RosterEntry {
  /** Text, because an id past 2^53 arrives as a decimal string. */
  pid: string | null;
  /** 1 for a bot. Bots carry a platform the game made up, so it is not shown for them. */
  bot: Num;
  name: string | null;
  agent: string | null;
  tank: string | null;
  role: string | null;
  /** The game's numeric Platform enum. The window resolves it to a name. */
  platform: Num;
  /** Counted from 0. */
  place: Num;
  /** The game's `level` field. It is not the vehicle level. */
  level: Num;
  score: Num;
  damage: Num;
  kills: Num;
  deaths: Num;
  assists: Num;
  confirms: Num;
  denies: Num;
}

export interface RosterTeams {
  ally: RosterEntry[];
  enemy: RosterEntry[];
}

export interface BattleLoadoutPart {
  id: number;
  /** The catalog's technical name, kept for the id-to-label mapping. */
  name: string | null;
  /** Slot index for equipment and perks. Null for modules, which have no order. */
  position: number | null;
}

export interface BattleCosmetic {
  id: number;
  /** "camouflage", "paint" or "style" on a camo. Null otherwise or when unknown. */
  kind: string | null;
  code: string | null;
}

export interface BattleLoadout {
  id: string | null;
  vehicle: string;
  agent: string;
  verified: boolean;
  problem: string | null;
  modules: BattleLoadoutPart[];
  equipment: BattleLoadoutPart[];
  perks: BattleLoadoutPart[];
  /** False when the recorder kept no cosmetics. Talisman and camo are then unknown */
  cosmetics: boolean;
  talisman: BattleCosmetic | null;
  /** The 2D camo or paint, or else the 3D style. */
  camo: BattleCosmetic | null;
  /** The agent's outfit items. Empty means the default outfit. */
  outfit: BattleCosmetic[];
}

export interface BattleRow {
  id: string;
  startedAt: string | null;
  playedAt: number;
  outcome: string;
  agentId: string;
  /** Empty for an agent id without a known name. */
  agent: string;
  vehicle: string;
  role: string;
  durationS: number;
  mapKey: string;
  map: string;
  mode: string;
  /** The queue: `versus_ai`, `quick_match`... Empty for battles recorded before the recorder kept it. */
  playMode: string;
  score: number;
  kills: number;
  deaths: number;
  assists: Num;
  damage: number;
  confirms: Num;
  denies: Num;
  allyScore: number;
  enemyScore: number;
  /** Null for battles recorded before these were kept. */
  place: Num;
  vehicleLevel: Num;
  xpVehicle: Num;
  xpAgent: Num;
  hits: Num;
  shots: Num;
  critHits: Num;
  shellDamage: Num;
  abilityDamage: Num;
  blockedDamage: Num;
  rammingDamage: Num;
  damageTaken: Num;
  heal: Num;
  allyKills: Num;
  allyDeaths: Num;
  allyDamage: Num;
  enemyKills: Num;
  enemyDeaths: Num;
  enemyDamage: Num;
  credits: Num;
  tech: Num;
  intel: Num;
  /** Null for a battle recorded before rosters were kept, or refused by the shape check. */
  roster: RosterTeams | null;
  /** Empty for a battle recorded before loadouts were kept. */
  loadouts: BattleLoadout[];
}

export interface BattleOption {
  value: string;
  label: string;
}

/** What the player usually does, so one battle can be read against the rest of them. */
export interface BattleNorms {
  /** Damage and score a minute, time-weighted over every battle on record. */
  dpm: number;
  spm: number;
  /** Their usual cut of the team's damage, 0-1. */
  damageShare: number;
  battles: number;
}

export interface BattlesPage {
  /** noKey (an old name): no account and no local battle. loading: the first read is not done. */
  state: "ready" | "noKey" | "loading";
  query: BattleQuery;
  total: number;
  rows: BattleRow[];
  /** Over the whole history, never the filtered page: a filter must not move the yardstick. */
  norms: BattleNorms | null;
  options: { roles: BattleOption[]; agents: BattleOption[]; maps: BattleOption[]; modes: string[] };
}

function str(v: unknown): string {
  return v == null ? "" : String(v);
}

function numOrNull(v: unknown): Num {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** A rank, or null where the game gave none: it reports -1 for a battle it never placed. */
function rank(v: unknown): Num {
  const n = numOrNull(v);
  return n != null && n >= 0 ? n : null;
}

function num(v: unknown): number {
  return numOrNull(v) ?? 0;
}

/** Rosters store the game's loc key, `frontmen.specs.frontmen.<id>.name`. An unknown id has no name. */
function rosterAgent(v: unknown): string | null {
  const raw = v == null ? "" : String(v).trim();
  if (!raw) return null;
  const id = /frontmen\.(\d+)\./i.exec(raw)?.[1];
  if (!id) return raw.includes(".") ? null : raw;
  return agentName(id) || null;
}

function rosterSide(v: unknown): RosterEntry[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((p): p is Record<string, unknown> => !!p && typeof p === "object")
    .map((p) => ({
      pid: p.pid == null ? null : String(p.pid),
      bot: numOrNull(p.bot),
      name: p.name == null ? null : String(p.name),
      agent: rosterAgent(p.agent),
      tank: p.tank == null ? null : String(p.tank),
      role: p.role == null ? null : String(p.role),
      platform: numOrNull(p.platform),
      place: numOrNull(p.place),
      level: numOrNull(p.level),
      score: numOrNull(p.score),
      damage: numOrNull(p.damage),
      kills: numOrNull(p.kills),
      deaths: numOrNull(p.deaths),
      assists: numOrNull(p.assists),
      confirms: numOrNull(p.confirms),
      denies: numOrNull(p.denies),
    }));
}

/** The stored roster, or null. The shape is not trusted: jsonb or a plain object, and older battles wrote `{}`. */
function toRoster(v: unknown): RosterTeams | null {
  if (!v || typeof v !== "object") return null;
  const teams = v as Record<string, unknown>;
  const ally = rosterSide(teams.ally);
  const enemy = rosterSide(teams.enemy);
  return ally.length || enemy.length ? { ally, enemy } : null;
}

const record = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

const partId = (v: unknown): number | null => (typeof v === "number" && Number.isInteger(v) && v > 0 ? v : null);

function loadoutParts(v: unknown, positioned: boolean): BattleLoadoutPart[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((raw) => {
    const p = record(raw);
    const id = partId(p?.id);
    if (!p || id === null) return [];
    const position = positioned && Number.isInteger(p.position) ? (p.position as number) : null;
    return [{ id, name: p.name == null ? null : String(p.name), position }];
  });
}

function cosmetic(v: unknown, kind: string | null): BattleCosmetic | null {
  const c = record(v);
  const id = partId(c?.id);
  if (!c || id === null) return null;
  return { id, kind: kind ?? (c.kind == null ? null : String(c.kind)), code: c.code == null ? null : String(c.code) };
}

/** The stored loadouts: jsonb from the service, plain objects locally. */
function toLoadouts(v: unknown): BattleLoadout[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((raw) => {
    const l = record(raw);
    if (!l) return [];
    const custom = record(l.customization);
    return [
      {
        id: l.loadout_id == null ? null : String(l.loadout_id),
        vehicle: l.vehicle ? prettyVehicle(l.vehicle) : "",
        agent: l.frontman_id == null ? "" : agentName(String(l.frontman_id)),
        verified: l.verified === true,
        problem: l.problem == null ? null : String(l.problem),
        modules: loadoutParts(l.modules, false),
        equipment: loadoutParts(l.equipment, true),
        perks: loadoutParts(l.perks, true),
        cosmetics: !!custom,
        talisman: cosmetic(custom?.talisman, null),
        // Live loadouts never carry both. If they do, the 2D item is the one on show.
        camo: cosmetic(custom?.camo, null) ?? cosmetic(custom?.style, "style"),
        outfit: Array.isArray(custom?.outfit)
          ? custom.outfit.flatMap((o) => cosmetic(o, null) ?? [])
          : [],
      },
    ];
  });
}

/** Whatever the window sent, clamped to what the list supports. */
export function normalizeQuery(raw: unknown): BattleQuery {
  const q = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const pageSize = Number(q.pageSize);
  const page = Math.floor(Number(q.page));
  const sort = str(q.sort);
  return {
    search: str(q.search).slice(0, 100),
    outcome: OUTCOMES.includes(str(q.outcome)) ? str(q.outcome) : "",
    role: str(q.role),
    agent: str(q.agent),
    map: str(q.map),
    mode: str(q.mode),
    sort: (BATTLE_SORTS as readonly string[]).includes(sort) ? (sort as BattleSort) : DEFAULT_QUERY.sort,
    pageSize: PAGE_SIZES.includes(pageSize) ? pageSize : DEFAULT_QUERY.pageSize,
    page: Number.isFinite(page) && page > 0 ? page : 0,
  };
}

/** For battles recorded before `final_place`: the player's rank from their roster entry. */
function myPlace(roster: RosterTeams | null, name: string): Num {
  if (!roster || !name) return null;
  return roster.ally.find((p) => p.name === name)?.place ?? null;
}

function toRow(s: SessionRow): BattleRow {
  const agentId = str(s.player_agent_id);
  const startedAt = s.started_at ? String(s.started_at) : null;
  const roster = toRoster(s.roster);
  return {
    id: str(s.id ?? s.session_id),
    startedAt,
    playedAt: startedAt ? Date.parse(startedAt) || 0 : 0,
    outcome: str(s.outcome),
    agentId,
    agent: agentName(agentId),
    vehicle: s.player_vehicle ? prettyVehicle(s.player_vehicle) : "",
    role: str(s.player_role),
    durationS: num(s.duration_s),
    mapKey: str(s.map_slug),
    map: s.map_name ? String(s.map_name).toUpperCase() : s.map_slug ? prettyMap(s.map_slug) : "",
    mode: str(s.game_mode),
    playMode: str(s.play_mode_slug),
    score: num(s.final_score),
    kills: num(s.final_kills),
    deaths: num(s.final_deaths),
    assists: numOrNull(s.final_assists),
    damage: num(s.final_damage),
    confirms: numOrNull(s.final_confirms),
    denies: numOrNull(s.final_denies),
    allyScore: num(s.final_ally_score),
    enemyScore: num(s.final_enemy_score),
    // Older rows can still hold -1, the game's "never placed".
    place: rank(s.final_place) ?? myPlace(roster, str(s.player_name)),
    vehicleLevel: numOrNull(s.player_vehicle_level),
    xpVehicle: numOrNull(s.final_xp_vehicle),
    xpAgent: numOrNull(s.final_xp_agent),
    hits: numOrNull(s.p_hits_done),
    shots: numOrNull(s.p_shoot_done),
    critHits: numOrNull(s.p_crit_hits_done),
    shellDamage: numOrNull(s.p_shell_hits_damage),
    abilityDamage: numOrNull(s.p_ability_damage_done),
    blockedDamage: numOrNull(s.p_blocked_damage),
    rammingDamage: numOrNull(s.p_ramming_damage),
    damageTaken: numOrNull(s.p_damage_taken),
    heal: numOrNull(s.p_heal),
    allyKills: numOrNull(s.ally_kills),
    allyDeaths: numOrNull(s.ally_deaths),
    allyDamage: numOrNull(s.ally_damage),
    enemyKills: numOrNull(s.enemy_kills),
    enemyDeaths: numOrNull(s.enemy_deaths),
    enemyDamage: numOrNull(s.enemy_damage),
    credits: numOrNull(s.currency_credits),
    tech: numOrNull(s.currency_tech),
    intel: numOrNull(s.currency_intel),
    roster,
    loadouts: toLoadouts(s.loadouts),
  };
}

/** Shaped once per load. Every query runs over the result. */
export function toBattleRows(sessions: SessionRow[]): BattleRow[] {
  return sessions.map(toRow);
}

function kd(r: BattleRow): number {
  return r.deaths ? r.kills / r.deaths : r.kills;
}

const SORT_KEYS: Record<BattleSort, (r: BattleRow) => number> = {
  played: (r) => r.playedAt,
  score: (r) => r.score,
  kd,
  damage: (r) => r.damage,
  place: (r) => (r.place != null ? -r.place : -1e9),
};

/** Highest first, newest first on ties. */
function compare(sort: BattleSort): (a: BattleRow, b: BattleRow) => number {
  const key = SORT_KEYS[sort];
  return (a, b) => key(b) - key(a) || b.playedAt - a.playedAt;
}

function haystack(r: BattleRow): string {
  return [r.vehicle, r.map, r.agent, r.mode, r.role].join(" ").toLowerCase();
}

function unique(rows: BattleRow[], value: (r: BattleRow) => string, label: (r: BattleRow) => string): BattleOption[] {
  const seen = new Map<string, string>();
  for (const r of rows) {
    const v = value(r);
    if (v && !seen.has(v)) seen.set(v, label(r));
  }
  return [...seen].map(([v, l]) => ({ value: v, label: l })).sort((a, b) => a.label.localeCompare(b.label));
}

/** Time-weighted, so a battle cut short by a disconnect cannot pull the rate around. */
function buildNorms(rows: BattleRow[]): BattleNorms {
  let minutes = 0;
  let damage = 0;
  let score = 0;
  let mine = 0;
  let team = 0;
  let battles = 0;
  for (const r of rows) {
    if (r.durationS > 0) {
      minutes += r.durationS / 60;
      damage += r.damage;
      score += r.score;
      battles += 1;
    }
    if (r.allyDamage != null && r.allyDamage > 0) {
      mine += r.damage;
      team += r.allyDamage;
    }
  }
  return {
    dpm: minutes > 0 ? damage / minutes : 0,
    spm: minutes > 0 ? score / minutes : 0,
    damageShare: team > 0 ? mine / team : 0,
    battles,
  };
}

export function queryBattles(rows: BattleRow[] | null, query: BattleQuery, hasKey: boolean): BattlesPage {
  const empty = { roles: [], agents: [], maps: [], modes: [] };
  if (!hasKey) return { state: "noKey", query, total: 0, rows: [], norms: null, options: empty };
  if (!rows) return { state: "loading", query, total: 0, rows: [], norms: null, options: empty };
  const needle = query.search.trim().toLowerCase();
  const matches = rows.filter(
    (r) =>
      (!query.outcome || r.outcome === query.outcome) &&
      (!query.role || r.role === query.role) &&
      (!query.agent || r.agentId === query.agent) &&
      (!query.map || r.mapKey === query.map) &&
      (!query.mode || r.mode === query.mode) &&
      (!needle || haystack(r).includes(needle)),
  );
  matches.sort(compare(query.sort));
  const pages = Math.max(1, Math.ceil(matches.length / query.pageSize));
  const page = Math.min(query.page, pages - 1);
  const start = page * query.pageSize;
  return {
    state: "ready",
    query: { ...query, page },
    total: matches.length,
    rows: matches.slice(start, start + query.pageSize),
    norms: buildNorms(rows),
    options: {
      roles: unique(rows, (r) => r.role, (r) => r.role.replace(/_/g, " ").toUpperCase()),
      agents: unique(rows, (r) => r.agentId, (r) => r.agent),
      maps: unique(rows, (r) => r.mapKey, (r) => r.map),
      modes: unique(rows, (r) => r.mode, (r) => r.mode).map((o) => o.value),
    },
  };
}
