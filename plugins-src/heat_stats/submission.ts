import { createHmac } from "node:crypto";
import { PM_STAT_MAP, type FinishedBattle } from "./session.js";

const HMAC_KEY = Buffer.from("heat_fuse_stats_v1");
const HMAC_EXCLUDE = new Set(["hmac_hex", "type"]);
// The client's version. The backend's HMAC and version checks still expect it.
const CLIENT_VERSION = "5.0.0";

// Sorted keys and fixed spellings, or the same payload signs two different ways.
function canonical(v: unknown): string {
  if (v === null || v === undefined) return "null";
  if (typeof v === "number") return JSON.stringify(v);
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "string") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(canonical).join(",") + "]";
  const obj = v as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonical(obj[k])).join(",") + "}";
}

function sign(payload: Record<string, unknown>): string {
  const filtered: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload)) if (!HMAC_EXCLUDE.has(k)) filtered[k] = v;
  return createHmac("sha256", HMAC_KEY).update(canonical(filtered)).digest("hex");
}

/** Every key is present, as the Python client's to_dict sent it. */
function buildPayload(battle: FinishedBattle): Record<string, unknown> {
  const sess = battle.session;
  const g = (k: string): unknown => sess[k] ?? null;
  const n = (k: string): number => (typeof sess[k] === "number" ? (sess[k] as number) : 0);
  const rank = (k: string): unknown => {
    const v = sess[k];
    return typeof v === "number" && v >= 0 ? v : null;
  };
  return {
    session_id: sess.session_id,
    started_at: battle.startedAt,
    ended_at: sess.ended_at,
    duration_s: sess.duration_s ?? 0,
    outcome: sess.outcome ?? "abandoned",
    map_slug: g("map_slug"),
    map_name: g("map_name"),
    game_mode: g("game_mode"),
    play_mode: g("play_mode"),
    play_mode_slug: g("play_mode_slug"),
    player_name: g("player_name"),
    player_id: g("player_id"),
    battle_id: g("battle_id"),
    player_vehicle: g("player_vehicle"),
    player_role: g("player_role"),
    player_agent_id: g("player_agent_id"),
    final_kills: n("final_kills"),
    final_deaths: n("final_deaths"),
    final_assists: g("final_assists"),
    final_damage: n("final_damage"),
    final_confirms: g("final_confirms"),
    final_denies: g("final_denies"),
    final_score: n("final_score"),
    final_place: rank("final_place"),
    player_vehicle_level: g("player_vehicle_level"),
    final_xp_vehicle: g("final_xp_vehicle"),
    final_xp_agent: g("final_xp_agent"),
    final_ally_score: n("final_ally_score"),
    final_enemy_score: n("final_enemy_score"),
    peak_ping: battle.peakPing,
    avg_ping: sess.avg_ping ?? 0,
    avg_fps: sess.avg_fps ?? 0,
    sample_count: battle.samples.length,
    client_version: CLIENT_VERSION,
    currency_credits: g("currency_credits"),
    currency_tech: g("currency_tech"),
    currency_intel: g("currency_intel"),
    ...Object.fromEntries(Object.keys(PM_STAT_MAP).map((k) => [k, g(k)])),
    ally_kills: g("ally_kills"), ally_deaths: g("ally_deaths"), ally_assists: g("ally_assists"),
    ally_damage: g("ally_damage"), ally_captures: g("ally_captures"), ally_confirms: g("ally_confirms"), ally_denies: g("ally_denies"),
    enemy_kills: g("enemy_kills"), enemy_deaths: g("enemy_deaths"), enemy_assists: g("enemy_assists"),
    enemy_damage: g("enemy_damage"), enemy_captures: g("enemy_captures"), enemy_confirms: g("enemy_confirms"), enemy_denies: g("enemy_denies"),
  };
}

export function buildUpload(battle: FinishedBattle): Record<string, unknown> {
  const payload = buildPayload(battle);
  payload.roster = battle.roster ?? {};
  // The service builds rows from an allow-list, so an older service drops this field and keeps the battle.
  payload.loadouts = Array.isArray(battle.session.loadouts) ? battle.session.loadouts : [];
  // Every reward code the battle paid, not only the two XP figures the columns resolve.
  payload.entitlements = battle.session.entitlements ?? {};
  payload.hmac_hex = sign(payload);
  return payload;
}
