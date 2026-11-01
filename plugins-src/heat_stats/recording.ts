import { randomUUID } from "node:crypto";
import type { FuseContext, StorageCollection } from "@fuse/plugin-sdk";
import {
  attributeLoadouts,
  playedLoadouts,
  type LoadoutCatalog,
  type LoadoutSnapshot,
  type PlayedLoadout,
} from "./loadout.js";
import { PM_STAT_MAP, type FinishedBattle, type Num, type Phase, type Sample } from "./session.js";

const MS_FINISH = "ActiveFinish";
const SKIP_GAME_MODES = new Set(["FiringRange"]);

/** A parked battle older than this cannot belong to whatever is starting now. */
const RESUME_MAX_AGE_S = 2 * 3600;
const STALE_TICKS = 3;
const SAMPLE_INTERVAL_S = 1;
const MAX_SAMPLES = (60 * (20 + 3)) / SAMPLE_INTERVAL_S;
const PARK_EVERY_SAMPLES = 30;
const PARKED_ID = "battle";

const LOADOUT_WAIT_S = 10;
/** Identity fields, filled on later ticks, because the accessors fill late on a rejoin. */
const IDENTITY: ReadonlyArray<[string, string]> = [
  ["map_slug", "map_slug"],
  ["map_name", "sb_map_name"],
  ["game_mode", "game_mode"],
  ["player_name", "player_name"],
  ["player_vehicle", "player_vehicle"],
  ["player_role", "player_role"],
  ["player_agent_id", "player_agent_id"],
];

/** Everything needed to pick a battle back up after a crash, quit or rejoin. */
interface Parked {
  session_id: string;
  started_at: number;
  saved_at: number;
  session: Record<string, unknown>;
  samples: Sample[];
  prev: Record<string, Num>;
  snap: Record<string, Num>;
  hpDeathCount: number;
  peakPing: number;
  pingSum: number;
  fpsSum: number;
  perfCount: number;
  elapsed: number;
  /** The hangar read at battle start. Records parked before loadouts were kept have none. */
  loadoutSnapshot?: LoadoutSnapshot | null;
}

type State = "IDLE" | "WAITING" | "RECORDING" | "SUMMARIZING";

export interface RecorderHooks {
  read(name: string): unknown;
  connected(): boolean;
  onPhase(phase: Phase): void;
  onFinished(battle: FinishedBattle): void;
  /**
   * Every configured loadout, read fresh from the hangar at battle start. The game locks the loadout
   * by then, so this is what the player took in. Null when the hangar cannot be read.
   */
  loadoutSnapshot(): Promise<LoadoutSnapshot | null>;
  /** The part names, when a catalog has been loaded. Never required. */
  catalog(): LoadoutCatalog | null;
}

export class MatchRecorder {
  private state: State = "IDLE";
  private current: Phase = "idle";

  private session: Record<string, unknown> | null = null;
  private samples: Sample[] = [];
  private startedAt = 0;

  private summarizeTimer = 0;
  private sampleTimer = 0;
  private elapsed = 0;
  private pingSum = 0;
  private fpsSum = 0;
  private perfCount = 0;
  private peakPing = 0;

  // prev is the last sample, for deltas. snap is the last one with a readable match_state, kept for a resume.
  private prev = { ki: 0, de: 0, as: null as Num, da: 0, al: 0, es: 0, co: null as Num, dn: null as Num, sc: 0 };
  private snap = { ki: 0, de: 0, as: null as Num, da: 0, al: 0, es: 0, co: null as Num, dn: null as Num, sc: 0 };

  private hpDeathCount = 0;
  private lastHp: Num = null;
  private pmCaptured = false;
  private roster: { ally: unknown[]; enemy: unknown[] } | null = null;
  private debugMs: unknown = undefined;
  private staleTicks = 0;

  /** The hangar at battle start, and whether the read of it has finished either way. */
  private loadoutSnapshot: LoadoutSnapshot | null = null;
  private snapshotSettled = false;
  /** What the postmatch result says was played. */
  private played: PlayedLoadout[] = [];

  private readonly parkedStore: StorageCollection<Parked>;
  /** The stored parked battle, kept here so battle start can read it without waiting. */
  private parked: Parked | null = null;
  /** No battle starts before the stored record is read, or a resume is missed. */
  private parkedLoaded = false;

  constructor(
    private readonly ctx: FuseContext,
    private readonly hooks: RecorderHooks,
  ) {
    this.parkedStore = ctx.storage.collection<Parked>("parked");
    void this.parkedStore
      .get(PARKED_ID)
      .then(
        (rec) => { this.parked = rec ?? null; },
        (e: unknown) => ctx.logger.warning(`heat_stats: could not read the parked battle: ${String(e)}`),
      )
      .finally(() => { this.parkedLoaded = true; });
    // Older builds parked in the config, at 5 s. The service refuses those samples mixed with 1 s ones.
    if (ctx.config.get("parked_battle", null) != null) ctx.config.set("parked_battle", null);
  }

  get phase(): Phase {
    return this.current;
  }

  private rd(name: string): unknown {
    return this.hooks.read(name);
  }
  private numOr(name: string, def = 0): number {
    const v = this.rd(name);
    return typeof v === "number" ? v : def;
  }
  private numOrNull(name: string): Num {
    const v = this.rd(name);
    return typeof v === "number" ? v : null;
  }

  private setPhase(p: Phase): void {
    this.current = p;
    this.hooks.onPhase(p);
  }

  tick(dt: number): void {
    if (!this.parkedLoaded) return;
    // Mid-match recovery: the recorder went IDLE while still connected.
    if (this.state === "IDLE") {
      const msNow = this.rd("match_state");
      const bsNow = this.rd("battle_state");
      // msNow must be readable. park() just reacted to an unreadable state, and a resume on it flaps between the two.
      if (bsNow === 8 && msNow != null && msNow !== MS_FINISH) {
        // Same skips as checkMatchStart(): FiringRange, and a lingering postmatch.
        if (SKIP_GAME_MODES.has(String(this.rd("game_mode")))) return;
        if (this.rd("pm_available") === 1) return;
        this.debugMs = undefined;
        this.ctx.logger.info(`heat_stats: mid-match recovery - ms=${String(msNow)} bs=${String(bsNow)}`);
        this.beginSession();
      }
    }

    if (this.state === "WAITING") {
      this.checkMatchStart();
    } else if (this.state === "RECORDING") {
      this.elapsed += dt;
      if (!this.pmCaptured && this.rd("pm_available") === 1) {
        if (this.capturePostmatch()) {
          this.pmCaptured = true;
          this.state = "SUMMARIZING";
          this.setPhase("summarizing");
          this.summarizeTimer = 0;
          return;
        }
      }
      this.fillIdentity();
      this.pollDeaths();
      this.sampleTimer += dt;
      if (this.sampleTimer >= SAMPLE_INTERVAL_S) {
        this.sampleTimer -= SAMPLE_INTERVAL_S;
        // park() writes the file synchronously, so it runs every few samples, not every sample.
        if (this.takeSample() && this.samples.length % PARK_EVERY_SAMPLES === 0) this.park();
      }
      this.checkMatchEnd();
    } else if (this.state === "SUMMARIZING") {
      this.summarizeTimer += dt;
      const hold = Number(this.ctx.config.get("summarize_hold_s"));
      // The loadout comes from the hangar read at battle start. Wait for that read,
      // so the battle is not recorded without it, but never past a hard limit.
      const waited = this.summarizeTimer >= hold + LOADOUT_WAIT_S;
      if (this.summarizeTimer >= hold && (this.snapshotSettled || waited)) {
        if (!this.snapshotSettled) {
          this.ctx.logger.warning(`heat_stats: hangar read still pending after ${LOADOUT_WAIT_S}s - finishing without it`);
        }
        this.setPhase("finalizing");
        this.finish();
      }
    }
  }

  /** True when it starts waiting for a match. */
  onConnected(): boolean {
    if (this.state !== "IDLE") return false;
    this.state = "WAITING";
    this.setPhase("waiting");
    this.debugMs = undefined;
    this.ctx.logger.info("heat_stats: CDP connected - waiting for active match");
    return true;
  }

  onDisconnected(): void {
    if (this.session) {
      // A disconnect is not a result. Only an already-captured postmatch is.
      if (this.pmCaptured) this.finish();
      else this.park("CDP disconnected");
    } else if (this.state === "WAITING") {
      this.state = "IDLE";
      this.setPhase("idle");
      this.ctx.logger.info("heat_stats: CDP disconnected before match started");
    }
  }

  teardown(): void {
    // On exit, only a captured postmatch is a complete battle. Anything else is parked, so a restart can resume it.
    if (this.session) this.pmCaptured ? this.finish() : this.park();
  }

  /** Identity reads are empty for the first ticks after a rejoin. This fills them later, or the battle stores a null map_slug. */
  private fillIdentity(): void {
    const sess = this.session;
    if (!sess) return;
    for (const [col, accessor] of IDENTITY) {
      if (sess[col] == null) {
        const v = this.rd(accessor);
        if (v != null) sess[col] = v;
      }
    }
  }

  private pollDeaths(): void {
    const hp = this.numOrNull("health");
    if (hp === null) return;
    if (hp === 0 && this.lastHp !== null && this.lastHp !== 0) this.hpDeathCount += 1;
    this.lastHp = hp;
  }

  private checkMatchStart(): void {
    const ms = this.rd("match_state");
    const bs = this.rd("battle_state");
    if (ms !== this.debugMs) {
      this.debugMs = ms;
      this.ctx.logger.info(`heat_stats: waiting - ms=${String(ms)} bs=${String(bs)}`);
    }
    if (bs === 8 && ms != null && ms !== MS_FINISH) {
      if (SKIP_GAME_MODES.has(String(this.rd("game_mode")))) return;
      // The previous battle's postmatch panel is still up. A start here records a phantom battle
      // and submits it a second time from the same panel.
      if (this.rd("pm_available") === 1) return;
      this.beginSession();
    }
  }

  /**
   * An unreadable match_state means the game went away (crash, quit, page teardown). It is NOT a finished match,
   * and a submit there stored a made-up result. So the battle is parked, and only the postmatch panel ends a battle.
   */
  private checkMatchEnd(): void {
    const ms = this.rd("match_state");
    if (ms === null || ms === undefined) {
      if (++this.staleTicks >= STALE_TICKS) this.park("match_state unreadable");
      return;
    }
    this.staleTicks = 0;
  }

  /** The parked battle, if one can still resume. */
  private takeParked(): Parked | null {
    const raw = this.parked;
    if (!raw || !raw.session_id) return null;
    const ageS = Date.now() / 1000 - Number(raw.saved_at ?? 0);
    if (!(ageS >= 0 && ageS < RESUME_MAX_AGE_S)) {
      this.ctx.logger.info(`heat_stats: parked battle too old (${Math.round(ageS)}s) - discarding`);
      this.clearParked();
      return null;
    }
    // Reject only a readable, different map. Identity reads are still empty this early on a rejoin.
    const mapNow = this.rd("map_slug");
    const mapWas = raw.session?.map_slug;
    if (mapNow != null && mapWas != null && String(mapNow) !== String(mapWas)) {
      this.ctx.logger.info(`heat_stats: parked battle is a different map (${String(mapWas)}) - discarding`);
      this.clearParked();
      return null;
    }
    // In-game counters only go up during a battle. A confident read below the parked value means a new battle on the same map.
    const killsNow = this.rd("player_kills");
    const killsWas = Number(raw.snap?.ki ?? 0);
    if (typeof killsNow === "number" && killsWas > 0 && killsNow < killsWas) {
      this.ctx.logger.info(`heat_stats: counters reset (${killsNow} < ${killsWas}) - new battle, discarding parked`);
      this.clearParked();
      return null;
    }
    return raw;
  }

  private clearParked(): void {
    if (!this.parked) return;
    this.parked = null;
    this.parkedStore
      .delete(PARKED_ID)
      .catch((e: unknown) => this.ctx.logger.warning(`heat_stats: could not clear the parked battle: ${String(e)}`));
  }

  /**
   * Reads every configured loadout from the hangar for the current battle. It is safe at any time in the battle,
   * because the game locks the loadout once a match is found. So a resumed battle can read late.
   * The result is dropped if its battle is no longer the current one.
   */
  private captureLoadouts(): void {
    const sessionId = this.session?.session_id;
    if (!sessionId) return;
    this.loadoutSnapshot = null;
    this.snapshotSettled = false;

    const current = (): boolean => this.session?.session_id === sessionId;
    this.hooks
      .loadoutSnapshot()
      .then((snapshot) => {
        if (!current()) return;
        this.loadoutSnapshot = snapshot;
        if (snapshot) {
          this.ctx.logger.info(
            `heat_stats: hangar read - ${snapshot.loadouts.length} loadouts, ${snapshot.selected ?? "none"} selected`,
          );
          // Park straight away, so a crash before the next sample keeps it.
          this.park();
        } else {
          this.ctx.logger.warning("heat_stats: hangar could not be read at battle start - its loadout will be unverified");
        }
      })
      .catch((e: unknown) => {
        if (current()) this.ctx.logger.warning(`heat_stats: hangar read failed: ${e instanceof Error ? e.message : String(e)}`);
      })
      .finally(() => {
        if (current()) this.snapshotSettled = true;
      });
  }

  /** Clears all loadout state. A new battle must never inherit the last one's. */
  private resetLoadouts(): void {
    this.loadoutSnapshot = null;
    this.snapshotSettled = false;
    this.played = [];
  }

  /** Snapshot the in-flight battle so a crash or rejoin can pick it back up. */
  private park(reason?: string): void {
    if (!this.session) return;
    const rec: Parked = {
      session_id: String(this.session.session_id),
      started_at: this.startedAt,
      saved_at: Date.now() / 1000,
      session: this.session,
      samples: this.samples,
      prev: this.prev,
      snap: this.snap,
      hpDeathCount: this.hpDeathCount,
      peakPing: this.peakPing,
      pingSum: this.pingSum,
      fpsSum: this.fpsSum,
      perfCount: this.perfCount,
      elapsed: this.elapsed,
      loadoutSnapshot: this.loadoutSnapshot,
    };
    this.parked = rec;
    // The call copies rec at once, and the runtime applies writes in order, so a later clear cannot land first.
    this.parkedStore
      .put(PARKED_ID, rec)
      .catch((e: unknown) => this.ctx.logger.warning(`heat_stats: could not park the battle: ${String(e)}`));
    if (!reason) return;
    // An explicit park ends recording. The battle stays on disk, not submitted.
    this.ctx.logger.info(
      `heat_stats: battle parked (${reason}) - ${this.samples.length} samples held, nothing submitted`,
    );
    this.session = null;
    this.samples = [];
    this.pmCaptured = false;
    this.roster = null;
    this.resetLoadouts();
    this.staleTicks = 0;
    this.state = "IDLE";
    this.setPhase("idle");
  }

  private resumeSession(rec: Parked): void {
    this.startedAt = Number(rec.started_at) || Date.now() / 1000;
    this.session = rec.session;
    this.samples = Array.isArray(rec.samples) ? rec.samples : [];
    this.prev = rec.prev as typeof this.prev;
    this.snap = rec.snap as typeof this.snap;
    this.hpDeathCount = Number(rec.hpDeathCount) || 0;
    this.peakPing = Number(rec.peakPing) || 0;
    this.pingSum = Number(rec.pingSum) || 0;
    this.fpsSum = Number(rec.fpsSum) || 0;
    this.perfCount = Number(rec.perfCount) || 0;
    this.elapsed = Number(rec.elapsed) || 0;
    this.lastHp = this.numOrNull("health");
    this.pmCaptured = false;
    this.roster = null;
    this.sampleTimer = 0;
    this.staleTicks = 0;
    this.state = "RECORDING";
    this.setPhase("recording");
    this.fillIdentity();
    this.ctx.logger.info(
      `heat_stats: resumed battle ${rec.session_id} on ${String(this.session.map_slug ?? "?")} ` +
        `- ${this.samples.length} samples carried over`,
    );
    // Keep the read the battle started with. A record without one (a crash before the read, or an older build)
    // reads now. A resume happens only inside the battle, so the loadout is still locked.
    this.resetLoadouts();
    if (rec.loadoutSnapshot) {
      this.loadoutSnapshot = rec.loadoutSnapshot;
      this.snapshotSettled = true;
    } else {
      this.captureLoadouts();
    }
  }

  private beginSession(): void {
    const parked = this.takeParked();
    if (parked) {
      this.resumeSession(parked);
      return;
    }
    this.startedAt = Date.now() / 1000;
    this.session = {
      session_id: randomUUID(),
      map_slug: this.rd("map_slug") ?? null,
      map_name: this.rd("sb_map_name") ?? null,
      game_mode: this.rd("game_mode") ?? null,
      play_mode: this.rd("play_mode") ?? null,
      play_mode_slug: this.rd("play_mode_slug") ?? null,
      player_name: this.rd("player_name") ?? null,
      player_vehicle: this.rd("player_vehicle") ?? null,
      player_role: this.rd("player_role") ?? null,
      player_agent_id: this.rd("player_agent_id") ?? null,
      currency_credits: null,
      currency_tech: null,
      currency_intel: null,
    };
    this.samples = [];
    this.hpDeathCount = 0;
    this.lastHp = this.numOrNull("health");
    this.pmCaptured = false;
    this.roster = null;
    this.resetLoadouts();
    this.prev = {
      ki: this.numOr("player_kills"),
      de: 0,
      as: this.numOrNull("player_assists"),
      da: this.numOr("player_damage"),
      al: this.numOr("ally_score"),
      es: this.numOr("enemy_score"),
      co: this.numOrNull("sb_player_confirms"),
      dn: this.numOrNull("sb_player_denies"),
      sc: this.numOr("player_role_pts"),
    };
    this.snap = { ...this.prev };
    this.elapsed = 0;
    this.sampleTimer = 0;
    this.pingSum = 0;
    this.fpsSum = 0;
    this.perfCount = 0;
    this.peakPing = 0;
    this.staleTicks = 0;
    this.state = "RECORDING";
    this.setPhase("recording");
    this.ctx.logger.info(
      `heat_stats: match started - ${String(this.session.game_mode ?? "?")} on ${String(this.session.map_slug ?? "?")}`,
    );
    this.takeSample();
    this.park();
    this.captureLoadouts();
  }

  /** False when no sample was taken. */
  private takeSample(): boolean {
    if (!this.session || this.samples.length >= MAX_SAMPLES) return false;
    const hpNow = this.numOrNull("health");
    const ki = this.numOr("player_kills");
    const de = this.hpDeathCount;
    const as_ = this.numOrNull("player_assists");
    const da = this.numOr("player_damage");
    const al = this.numOr("ally_score");
    const es = this.numOr("enemy_score");
    const co = this.numOrNull("sb_player_confirms");
    const dn = this.numOrNull("sb_player_denies");
    const sc = this.numOr("player_role_pts");
    const pi = this.numOrNull("ping");
    const fp = this.numOrNull("fps");

    if (pi !== null) {
      this.pingSum += pi;
      this.perfCount += 1;
      if (pi > this.peakPing) this.peakPing = pi;
    }
    if (fp !== null) this.fpsSum += fp;

    const dki = Math.max(0, ki - this.prev.ki);
    const dde = Math.max(0, de - this.prev.de);
    const das = as_ !== null ? Math.max(0, (as_ ?? 0) - (this.prev.as ?? 0)) : 0;
    const dda = Math.max(0, da - this.prev.da);
    const dal = al - this.prev.al;
    const des = es - this.prev.es;
    const dco = co !== null ? Math.max(0, (co ?? 0) - (this.prev.co ?? 0)) : 0;
    const ddn = dn !== null ? Math.max(0, (dn ?? 0) - (this.prev.dn ?? 0)) : 0;
    const dsc = Math.max(0, sc - this.prev.sc);

    this.samples.push({
      t: Math.round(this.elapsed),
      hp: hpNow, en: this.numOrNull("energy"), bo: this.numOrNull("boost"), pi, fp,
      al, es, ki, de, as: as_, da, co, dn, sc, ms: (this.rd("match_state") as string | null) ?? null,
      dki, dde, das, dda, dal, des, dco, ddn, dsc,
    });

    this.prev = { ki, de, as: as_, da, al, es, co, dn, sc };
    if (this.rd("match_state") != null) this.snap = { ki, de, as: as_, da, al, es, co, dn, sc };
    return true;
  }

  private capturePostmatch(): boolean {
    const players = this.rd("pm_players") as Array<Record<string, unknown>> | null | undefined;
    if (!players || !players.length) return false;
    const sess = this.session!;
    // The game's own id for the battle
    sess.battle_id = this.rd("pm_battle_id") ?? null;
    const myId = this.rd("pm_my_player_id");
    const me = players.find((p) => p.playerId === myId) ?? null;
    const myTeam = me?.team ?? this.rd("pm_my_team");

    // Read from the same row as the stats, so the loadout cannot belong to a different result.
    this.played = playedLoadouts(me);

    if (me) {
      for (const [col, key] of Object.entries(PM_STAT_MAP)) sess[col] = me[key] ?? null;
      const set = (k: string, col: string) => { if (me[k] != null) sess[col] = me[k]; };
      set("kills", "final_kills");
      set("deaths", "final_deaths");
      set("assists", "final_assists");
      set("damage", "final_damage");
      set("killConfirmed", "final_confirms");
      set("killDenied", "final_denies");
      set("rolePoints", "final_score");
      if (typeof me.place === "number" && me.place >= 0) sess.final_place = me.place;

      // Rewards are keyed by entitlement code, and each vehicle and agent has its own.
      // The whole map is kept, because a battle pays more codes than the two resolved XP figures.
      const ee = (me.entitlementsEarned as Record<string, number> | undefined) ?? {};
      const catalog = this.hooks.catalog();
      const played = this.played[0] ?? null;
      const earned = (code: string | undefined): number | null =>
        code && typeof ee[code] === "number" ? ee[code] : null;
      sess.entitlements = ee;
      // The roster's `level` is not the vehicle level: a level-50 M60A2 reported 1.
      // The game shows the hangar progression of the played vehicle.
      sess.player_vehicle_level =
        played?.vehicleId != null ? (catalog?.vehicleLevel.get(played.vehicleId) ?? null) : null;
      sess.final_xp_vehicle =
        played?.vehicleId != null ? earned(catalog?.vehicleXp.get(played.vehicleId)) : null;
      sess.final_xp_agent =
        played?.frontmanId != null ? earned(catalog?.frontmanXp.get(played.frontmanId)) : null;

      const ce = (me.currenciesEarned as Record<string, number> | undefined) ?? {};
      const curs = Array.isArray(me.currencies) ? (me.currencies as Array<{ code?: string; amount?: number }>) : [];
      const findCur = (code: string): number | null => {
        if (typeof ce[code] === "number") return ce[code];
        const found = curs.find((c) => c && c.code === code);
        return typeof found?.amount === "number" ? found.amount : null;
      };
      sess.currency_credits = findCur("soft") ?? findCur("credits") ?? null;
      sess.currency_tech = findCur("tech") ?? null;
      sess.currency_intel = findCur("intel") ?? null;
    }

    const sum = (rows: Array<Record<string, unknown>>, key: string): number =>
      rows.reduce((acc, p) => acc + (typeof p[key] === "number" ? (p[key] as number) : 0), 0);
    const ally = players.filter((p) => p.team === myTeam);
    const enemy = players.filter((p) => p.team !== myTeam);
    sess.ally_kills = sum(ally, "kills");
    sess.ally_deaths = sum(ally, "deaths");
    sess.ally_assists = sum(ally, "assists");
    sess.ally_damage = sum(ally, "damage");
    sess.ally_captures = sum(ally, "capturedBase");
    sess.ally_confirms = sum(ally, "killConfirmed");
    sess.ally_denies = sum(ally, "killDenied");
    sess.enemy_kills = sum(enemy, "kills");
    sess.enemy_deaths = sum(enemy, "deaths");
    sess.enemy_assists = sum(enemy, "assists");
    sess.enemy_damage = sum(enemy, "damage");
    sess.enemy_captures = sum(enemy, "capturedBase");
    sess.enemy_confirms = sum(enemy, "killConfirmed");
    sess.enemy_denies = sum(enemy, "killDenied");

    const scores = (this.rd("pm_team_scores") as Record<string, unknown>) ?? {};
    if (myTeam != null && Object.keys(scores).length) {
      const scoreFor = (team: unknown) => scores[String(team)] ?? scores[team as string];
      const a = scoreFor(myTeam);
      if (a != null) sess.final_ally_score = a;
      const others = Object.entries(scores).filter(([k]) => String(k) !== String(myTeam)).map(([, v]) => v);
      if (others.length && others[0] != null) sess.final_enemy_score = others[0];
    }

    const numOrNull = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
    const strOrNull = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
    /** Ids are text, because past 2^53 the accessors send decimal strings, not truncated numbers. */
    const idOrNull = (v: unknown): string | null =>
      typeof v === "number" && Number.isFinite(v) ? String(v) : strOrNull(v);

    const slim = (p: Record<string, unknown>) => ({
      /**
       * The account id. `playerId` is only the battle slot (it reads 6 for any player in that slot),
       * so anything that follows a player across battles, tags included, joins on this.
       */
      pid: idOrNull(p.profileId),
      /** The game gives bots a platform of their own. This flag says not to trust it. */
      bot: p.isBot ? 1 : 0,
      name: strOrNull(p.name),
      role: strOrNull(p.role),
      tank: strOrNull(p.vehicleName ?? p.tank),
      agent: strOrNull(p.agentName ?? p.agent),
      // The game's numeric Platform enum (0=Steam, 1=SteamDeck, 2=Wgc, 3=Xbox, 4=Psn, 5=Unknown).
      // Stored as the number and resolved for display, so a new enum value needs no migration.
      platform: numOrNull(p.platform),
      /** Rank, and the tactical model's `level`. That is not the vehicle level: it reads 1 for a level-50 tank. */
      place: numOrNull(p.place),
      level: numOrNull(p.level),
      score: numOrNull(p.rolePoints ?? p.score),
      damage: numOrNull(p.damage),
      kills: numOrNull(p.kills),
      deaths: numOrNull(p.deaths),
      assists: numOrNull(p.assists),
      confirms: numOrNull(p.killConfirmed ?? p.confirms),
      denies: numOrNull(p.killDenied ?? p.denies),
    });
    this.roster = { ally: ally.map(slim), enemy: enemy.map(slim) };
    sess.player_id = idOrNull(me?.profileId);
    return true;
  }

  /**
   * The ONLY path that files a battle for upload. It needs a captured postmatch panel, the game's own
   * end-of-battle result. Anything less is parked or dropped.
   */
  private finish(): void {
    if (!this.session) {
      this.state = "IDLE";
      return;
    }
    if (!this.pmCaptured) {
      this.park("submit without postmatch");
      return;
    }
    if (this.rd("match_state") != null) this.takeSample();

    const sess = this.session;
    const now = Date.now() / 1000;
    sess.ended_at = now;
    sess.duration_s = Math.round((now - this.startedAt) * 100) / 100;

    if (this.perfCount > 0) {
      sess.avg_ping = Math.round((this.pingSum / this.perfCount) * 10) / 10;
      sess.avg_fps = Math.round((this.fpsSum / this.perfCount) * 10) / 10;
    }

    const allyScore = Number(sess.final_ally_score ?? 0);
    const enemyScore = Number(sess.final_enemy_score ?? 0);
    if (allyScore > enemyScore) sess.outcome = "win";
    else if (allyScore < enemyScore) sess.outcome = "loss";
    else sess.outcome = "draw";

    // Attributed here, where the battle is filed, and nowhere earlier. The postmatch picks the loadout,
    // and the battle-start hangar read supplies it.
    const attribution = attributeLoadouts(this.played, this.loadoutSnapshot, this.hooks.catalog());
    sess.loadouts = attribution.loadouts;
    if (attribution.problems.length) {
      this.ctx.logger.warning(`heat_stats: loadout not verified - ${attribution.problems.join("; ")}`);
    } else {
      const named = attribution.loadouts.map((l) => `${l.loadout_id} (${l.vehicle ?? l.vehicle_id}, ${l.frontman ?? l.frontman_id})`);
      this.ctx.logger.info(`heat_stats: loadout verified - ${named.join(", ")}`);
    }

    this.hooks.onFinished({
      session: sess,
      samples: this.samples,
      startedAt: this.startedAt,
      peakPing: this.peakPing,
      roster: this.roster,
    });

    // A submitted battle must not stay resumable, or the next match resumes it and does not start clean.
    this.clearParked();
    this.session = null;
    this.samples = [];
    this.pmCaptured = false;
    this.roster = null;
    this.resetLoadouts();
    this.staleTicks = 0;
    this.state = "IDLE";
    if (this.hooks.connected()) {
      this.state = "WAITING";
      this.setPhase("waiting");
    } else {
      this.setPhase("idle");
    }
  }
}
