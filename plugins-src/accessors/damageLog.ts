/** Match history of damage taken, keyed by the engine's log id (docs/COHTML_FRONTEND_MAP.md §8.4). */

const SOURCE_NAMES = ["unknown", "shell", "ramming", "falling", "indirect", "periodic"];
const EFFECT_NAMES = ["none", "fire", "radiation", "shock", "blast"];

const MAX_ENTRIES = 150;
/** battle_hud gone at least this long means the next page belongs to a new match. */
const NEW_MATCH_GAP_MS = 20_000;

export type DamageRelation = "self" | "ally" | "enemy" | "unknown";

export interface DamageEntry {
  id: number;
  /** Index of the life this entry belongs to, 0-based within the match. */
  life: number;
  value: number;
  /** Times `value` grew after the entry appeared (merged hits or periodic ticks). */
  updates: number;
  source: number;
  source_name: string;
  effect: number;
  effect_name: string;
  attacker: string;
  /** Display label from the game; can be empty. */
  attacker_vehicle: string;
  attacker_vehicle_id: number | null;
  attacker_team: number | null;
  attacker_role: string | null;
  relation: DamageRelation;
  first_ms: number;
  last_ms: number;
  fatal: boolean;
}

export interface DamageKiller {
  unique_name: string;
  name: string;
  vehicle_id: number | null;
  /** Spec key, e.g. "a07_hstv_l.specs.specification.callSign" - not a label. */
  vehicle_key: string;
  team: number | null;
  role: string;
  agent_icon: string | null;
}

export interface DamageDeath {
  life: number;
  at_ms: number;
  fatal_id: number | null;
  killer: DamageKiller | null;
}

export interface DamageLogState {
  match: number;
  life: number;
  alive: boolean;
  /** Oldest first. */
  entries: DamageEntry[];
  deaths: DamageDeath[];
  /** Entries lost because more than 5 arrived between two polls. */
  missed: number;
  /** Bumps on every change. */
  rev: number;
}

export interface DamageLogChange {
  entry: DamageEntry;
  update: boolean;
}

interface RawEntry {
  id: number;
  source: number;
  effect: number;
  value: number;
  name: string;
  vehicle: string;
}

interface Warrior {
  name?: unknown;
  team?: unknown;
  vehicle_id?: unknown;
  role?: unknown;
  is_player?: unknown;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** "Claire2006#91307" -> "Claire2006". */
function baseName(unique: string): string {
  return unique.replace(/#\d+$/, "");
}

export class DamageLog {
  private match = 0;
  private life = 0;
  private alive = true;
  private entries = new Map<number, DamageEntry>();
  private deaths: DamageDeath[] = [];
  private missed = 0;
  private lastId: number | null = null;
  private rev = 0;
  private pendingMatch = true;
  private hudLostAt: number | null = null;

  hudLost(now: number): void {
    if (this.hudLostAt === null) this.hudLostAt = now;
  }

  /** The hangar is up. The history stays readable until the next match starts. */
  matchOver(): void {
    this.pendingMatch = true;
  }

  /** Feed one battle_hud read. */
  read(data: Record<string, unknown>, now: number): { changes: DamageLogChange[]; died: DamageDeath | null } {
    if (this.pendingMatch || (this.hudLostAt !== null && now - this.hudLostAt >= NEW_MATCH_GAP_MS)) this.startMatch();
    this.hudLostAt = null;

    const roster = Array.isArray(data.sb_warriors) ? (data.sb_warriors as Warrior[]) : [];
    const me = roster.find((w) => w?.is_player === 1);
    const localName = typeof data.player_name === "string" && data.player_name ? data.player_name : String(me?.name ?? "");
    const myTeam = num(data.sb_my_team) ?? num(me?.team);

    const changes: DamageLogChange[] = [];
    const raw = Array.isArray(data.dmg_log) ? (data.dmg_log as RawEntry[]) : [];
    for (const r of raw) {
      if (num(r?.id) === null) continue;
      const known = this.entries.get(r.id);
      if (!known) {
        if (this.lastId !== null && r.id > this.lastId + 1) this.missed += r.id - this.lastId - 1;
        if (this.lastId === null || r.id > this.lastId) this.lastId = r.id;
        const entry: DamageEntry = {
          id: r.id,
          life: this.life,
          value: r.value,
          updates: 0,
          source: r.source,
          source_name: SOURCE_NAMES[r.source] ?? "unknown",
          effect: r.effect,
          effect_name: EFFECT_NAMES[r.effect] ?? "none",
          attacker: r.name,
          attacker_vehicle: r.vehicle,
          attacker_vehicle_id: null,
          attacker_team: null,
          attacker_role: null,
          relation: "unknown",
          first_ms: now,
          last_ms: now,
          fatal: false,
        };
        this.join(entry, roster, localName, myTeam);
        this.entries.set(r.id, entry);
        changes.push({ entry, update: false });
      } else if (known.value !== r.value) {
        known.value = r.value;
        known.updates++;
        known.last_ms = now;
        if (!known.attacker_vehicle && r.vehicle) known.attacker_vehicle = r.vehicle;
        if (known.relation === "unknown") this.join(known, roster, localName, myTeam);
        changes.push({ entry: known, update: true });
      }
    }
    this.trim();

    let dirty = changes.length > 0;
    let died: DamageDeath | null = null;
    const hp = num(data.health);
    const dead = data.player_is_dead === 1 || hp === 0;
    if (dead && this.alive) {
      this.alive = false;
      died = { life: this.life, at_ms: now, fatal_id: null, killer: null };
      this.deaths.push(died);
      dirty = true;
    } else if (!dead && !this.alive) {
      this.alive = true;
      this.life++;
      dirty = true;
    }

    // The killer and the fatal entry can land a poll late, so both follow the model until the respawn.
    const last = this.deaths[this.deaths.length - 1];
    if (!this.alive && last && last.life === this.life) {
      const killer = (data.dmg_killer as DamageKiller | undefined) ?? null;
      if (killer && JSON.stringify(killer) !== JSON.stringify(last.killer)) {
        last.killer = killer;
        dirty = true;
      }
      if (this.markFatal(last)) dirty = true;
    }

    if (dirty) this.rev++;
    return { changes, died };
  }

  state(): DamageLogState {
    return {
      match: this.match,
      life: this.life,
      alive: this.alive,
      entries: [...this.entries.values()].sort((a, b) => a.id - b.id),
      deaths: this.deaths,
      missed: this.missed,
      rev: this.rev,
    };
  }

  private startMatch(): void {
    this.pendingMatch = false;
    this.match++;
    this.life = 0;
    this.alive = true;
    this.entries.clear();
    this.deaths = [];
    this.missed = 0;
    this.lastId = null;
    this.rev++;
  }

  private join(e: DamageEntry, roster: Warrior[], localName: string, myTeam: number | null): void {
    if (localName && e.attacker === localName) {
      e.relation = "self";
      return;
    }
    const w = roster.find((x) => x?.name === e.attacker);
    if (!w) return;
    e.attacker_vehicle_id = num(w.vehicle_id);
    e.attacker_team = num(w.team);
    e.attacker_role = typeof w.role === "string" && w.role ? w.role : null;
    if (w.is_player === 1) e.relation = "self";
    else if (e.attacker_team !== null && myTeam !== null) e.relation = e.attacker_team === myTeam ? "ally" : "enemy";
  }

  /** Latest entry of the ended life, preferring the killer's. Returns true when the pick changed. */
  private markFatal(d: DamageDeath): boolean {
    const names = d.killer ? [d.killer.name, baseName(d.killer.unique_name)].filter(Boolean) : [];
    const pick = (byKiller: boolean): DamageEntry | null => {
      let best: DamageEntry | null = null;
      for (const e of this.entries.values()) {
        if (e.life !== d.life || (byKiller && !names.includes(e.attacker))) continue;
        if (!best || e.last_ms > best.last_ms || (e.last_ms === best.last_ms && e.id > best.id)) best = e;
      }
      return best;
    };
    const best = (names.length ? pick(true) : null) ?? pick(false);
    const id = best?.id ?? null;
    if (id === d.fatal_id) return false;
    if (d.fatal_id !== null) {
      const prev = this.entries.get(d.fatal_id);
      if (prev) prev.fatal = false;
    }
    if (best) best.fatal = true;
    d.fatal_id = id;
    return true;
  }

  private trim(): void {
    if (this.entries.size <= MAX_ENTRIES) return;
    const ids = [...this.entries.keys()].sort((a, b) => a - b);
    for (const id of ids.slice(0, this.entries.size - MAX_ENTRIES)) this.entries.delete(id);
  }
}
