import { createHmac, randomUUID } from "node:crypto";
import { FusePlugin, ConfigCategory, ConfigEntry, type FuseContext, type OverlayHandle } from "@fuse/plugin-sdk";

interface Accessors {
  read(name: string): unknown;
  readonly connected: boolean;
  readonly connectedHangar: boolean;
}

const API_BASE = "https://jypsytkbliqrwjipolhx.supabase.co/functions/v1/api-v1";

const HMAC_KEY = Buffer.from("heat_fuse_stats_v1");
const HMAC_EXCLUDE = new Set(["hmac_hex", "type"]);
// client_version stamped into the payload (kept as the Python value so the
// backend's HMAC verification + version handling stay compatible).
const CLIENT_VERSION = "3.0.0";
const MS_FINISH = "ActiveFinish";
const SKIP_GAME_MODES = new Set(["FiringRange"]);

const PM_STAT_MAP: Record<string, string> = {
  p_shell_hits_damage: "shellHitsDamage",
  p_crit_ammo_damage: "critAmmoDamage",
  p_crit_fuel_damage: "critFuelDamage",
  p_crit_engine_damage: "critEngineDamage",
  p_ability_damage_done: "abilityDamageDone",
  p_ability_damage_taken: "abilityDamageTaken",
  p_blocked_damage: "blockedDamage",
  p_ramming_damage: "rammingDamage",
  p_heal: "heal",
  p_damage_taken: "damageTaken",
  p_captured_base: "capturedBase",
  p_uncaptured_base: "uncapturedBase",
  p_capture_points: "capturePoints",
  p_hits_done: "hitsDone",
  p_hits_taken: "hitsTaken",
  p_shoot_done: "shootDone",
  p_crit_hits_done: "criticalHitsDone",
  p_crit_hits_taken: "criticalHitsTaken",
  p_noncrit_hits_done: "nonCriticalHitsDone",
  p_noncrit_hits_taken: "nonCriticalHitsTaken",
  p_noncrit_shoot_done: "nonCriticalShootDone",
  p_rp_crit_fuel_damage: "rolePointsCritFuelDamage",
};

type Num = number | null;

interface Sample {
  t: number; hp: Num; en: Num; bo: Num; pi: Num; fp: Num;
  al: Num; es: Num; ki: Num; de: Num; as: Num; da: Num; co: Num; dn: Num; sc: Num;
  ms: string | null;
  dki: number; dde: number; das: number; dda: number; dal: number; des: number; dco: number; ddn: number; dsc: number;
}

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

// Session / trend helpers
const GRAPH_MAX = 60;

/** Epoch seconds, epoch ms, or an ISO string -> ms. */
function toMs(t: unknown): number {
  const n = typeof t === "number" ? t : Date.parse(String(t ?? ""));
  if (!Number.isFinite(n)) return 0;
  return n < 1e12 ? n * 1000 : n;
}

/** Exponential moving average; N=5 => alpha = 2/(N+1). */
function ema(xs: number[], n = 5): number[] {
  const alpha = 2 / (n + 1);
  const out: number[] = [];
  let prev = 0;
  xs.forEach((x, i) => {
    prev = i === 0 ? x : alpha * x + (1 - alpha) * prev;
    out.push(Math.round(prev * 1000) / 1000);
  });
  return out;
}

/** Per-match K/D (deathless matches score their kill count). */
function kdOf(s: Record<string, unknown>): number {
  const k = Number(s.final_kills ?? 0);
  const d = Number(s.final_deaths ?? 0);
  return d > 0 ? k / d : k;
}

/** Vehicle slug -> display text, e.g. "a20_m60a2" -> "M60A2". */
function prettyVehicle(v: unknown): string {
  const s = String(v ?? "")
    .replace(/^[a-z]{1,3}\d{1,3}_/i, "")
    .replace(/_/g, " ")
    .trim();
  return s ? s.toUpperCase() : "-";
}

type Phase = "idle" | "waiting" | "recording" | "summarizing" | "finalizing";
type State = "IDLE" | "WAITING" | "RECORDING" | "SUMMARIZING";

export class HeatStatsPlugin extends FusePlugin {
  static override requiresCalibration = true;
  static override calibrationStages = 1;

  private ctx!: FuseContext;
  private acc: Accessors | undefined;
  private ov: OverlayHandle | undefined;
  private vueOv: OverlayHandle | undefined;
  private state: State = "IDLE";
  private phase: Phase = "idle";
  private lastPhase: Phase | null = null;

  private history: { outcome: string; kills: number; deaths: number; playerName: string }[] = [];

  private session: Record<string, unknown> | null = null;
  private samples: Sample[] = [];
  private startedAt = 0;

  private summarizeTimer = 0;
  private sampleTimer = 0;
  private apiRefreshTimer: ReturnType<typeof setInterval> | null = null;
  private elapsed = 0;
  private pingSum = 0;
  private fpsSum = 0;
  private perfCount = 0;
  private peakPing = 0;

  // Delta bookkeeping.
  private prev = { ki: 0, de: 0, as: null as Num, da: 0, al: 0, es: 0, co: null as Num, dn: null as Num, sc: 0 };
  private snap = { ki: 0, de: 0, as: null as Num, da: 0, al: 0, es: 0, co: null as Num, dn: null as Num, sc: 0 };

  private hpDeathCount = 0;
  private lastHp: Num = null;
  private hostVisible = true;
  private lastVueVisible: boolean | null = null;
  private sawFinish = false;
  private pmCaptured = false;
  private roster: { ally: unknown[]; enemy: unknown[] } | null = null;
  private debugMs: unknown = undefined;

  private rd(name: string): unknown {
    return this.acc ? this.acc.read(name) : undefined;
  }
  private numOr(name: string, def = 0): number {
    const v = this.rd(name);
    return typeof v === "number" ? v : def;
  }
  private numOrNull(name: string): Num {
    const v = this.rd(name);
    return typeof v === "number" ? v : null;
  }

  setup(ctx: FuseContext): void {
    this.ctx = ctx;
    this.acc = ctx.services.get<Accessors>("accessors");
    ctx.config
      .defaults({
        sample_interval_s: 5,
        summarize_hold_s: 5.0,
        overlay_pos: null,
        vue_overlay_pos: null,
        anim_width: 300,
        anim_height: 300,
        vue_width: 440,
        vue_height: 300,
        //TO-DO: don't ship the key you dumbell
        api_key: "",
        player_name: "",
        api_refresh_interval_s: 60,
        session_started_at: 0,
        mode: "default",
        scene_time_s: 8.0,
        hide_in_battle: false,
        graph_scale: "auto",
        graph_points: 20,
        graph_value_scale: 1.0,
      })
      .load();

    ctx.config.schema([
      new ConfigCategory("Display", [
        new ConfigEntry({
          key: "mode",
          label: "Mode",
          type: "choice",
          choices: ["default", "carousel"],
          description: "Single view, or a looped carousel",
        }),
        new ConfigEntry({
          key: "scene_time_s",
          label: "Scene Time (s)",
          type: "float",
          min: 2.0,
          max: 60.0,
          description: "Carousel: how long each scene is shown",
        }),
        new ConfigEntry({
          key: "hide_in_battle",
          label: "Hide During Battle",
          type: "bool",
          description: "Only visible in hangar",
        }),
        new ConfigEntry({
          key: "graph_scale",
          label: "Graph Scale",
          type: "choice",
          choices: ["auto", "manual"],
          description: "Auto fits the trend graph to the overlay size; manual uses the values below",
        }),
        new ConfigEntry({
          key: "graph_points",
          label: "Graph Points (manual)",
          type: "int",
          min: 4,
          max: 60,
          description: "Manual scale: how many recent matches the trend graph shows",
        }),
        new ConfigEntry({
          key: "graph_value_scale",
          label: "Graph Label Scale (manual)",
          type: "float",
          min: 0.5,
          max: 2.5,
          description: "Manual scale: axis + label size multiplier",
        }),
      ]),
      new ConfigCategory("API", [
        new ConfigEntry({ key: "api_key", label: "API Key", type: "str", description: "HEAT Stats API key (fuse_...)" }),
        new ConfigEntry({ key: "player_name", label: "Player Name", type: "str", description: "Player name to fetch stats for" }),
        new ConfigEntry({ key: "api_refresh_interval_s", label: "API Refresh Interval (s)", type: "int", min: 10, max: 3600, description: "How often to refresh stats from the API (0 to disable)" }),
      ]),
      new ConfigCategory("Recording", [
        new ConfigEntry({ key: "sample_interval_s", label: "Sample Interval (s)", type: "int", min: 1, max: 30 }),
        new ConfigEntry({
          key: "summarize_hold_s",
          label: "Summary Hold (s)",
          type: "float",
          min: 0.0,
          max: 20.0,
          description: "How long the summary overlay shows before uploading",
        }),
      ]),
      new ConfigCategory("Animation", [
        new ConfigEntry({ key: "anim_width", label: "Render Width", type: "int", min: 10, max: 3000 }),
        new ConfigEntry({ key: "anim_height", label: "Render Height", type: "int", min: 10, max: 3000 }),
      ]),
      new ConfigCategory("Position", [
        new ConfigEntry({ key: "overlay_pos", label: "Rive Overlay Position", type: "position" }),
        new ConfigEntry({ key: "vue_overlay_pos", label: "Stats Overlay Position", type: "position" }),
      ]),
    ]);

    ctx.events.subscribe("accessors.connected", () => this.onConnected());
    ctx.events.subscribe("accessors.disconnected", () => this.onDisconnected());

    ctx.config.watch("api_key", () => { void this.fetchAndPushStats(); });
    ctx.config.watch("player_name", () => { void this.fetchAndPushStats(); });
    ctx.config.watch("mode", () => this.pushDisplayConfig());
    ctx.config.watch("scene_time_s", () => this.pushDisplayConfig());
    ctx.config.watch("graph_scale", () => this.pushDisplayConfig());
    ctx.config.watch("graph_points", () => this.pushDisplayConfig());
    ctx.config.watch("graph_value_scale", () => this.pushDisplayConfig());

    const w = Number(ctx.config.get("anim_width", 300)) || 300;
    const h = Number(ctx.config.get("anim_height", 300)) || 300;
    this.ov = ctx.overlays.declare({
      id: "heatStats",
      kind: "rive",
      asset: "stats.riv",
      size: { w, h },
      artboard: "STATSBOARD",
      stateMachine: "cruiseEngine",
      viewModel: "VMStats",
      positionConfigKey: "overlay_pos",
    });
    this.ov.setBool("isSetupComplete", false);

    const vw = Number(ctx.config.get("vue_width", 440)) || 440;
    const vh = Number(ctx.config.get("vue_height", 300)) || 300;
    this.vueOv = ctx.overlays.declare({
      id: "heatStatsVue",
      kind: "vue",
      asset: "HeatStatsOverlay.vue",
      size: { w: vw, h: vh },
      positionConfigKey: "vue_overlay_pos",
    });
    this.vueOv.setBool("isSetupComplete", false);
    // Interactive overlay button (Refresh stats) -> re-fetch on demand.
    this.vueOv.onAction((action) => {
      if (action === "refresh") void this.fetchAndPushStats();
      // Start a new session: everything recorded before this moment is filtered
      // out of the overlay (the API keeps them; we just stop showing them).
      if (action === "newSession") {
        this.ctx.config.set("session_started_at", Math.floor(Date.now() / 1000));
        void this.fetchAndPushStats();
      }
    });

    this.pushDisplayConfig();
    void this.fetchAndPushStats();
    if (this.ctx.state === "locked") this.startApiRefresh();

    this.pushPhase();
  }

  private setPhase(p: Phase): void {
    this.phase = p;
    this.pushPhase();
  }

  private pushPhase(): void {
    if (!this.ov || this.phase === this.lastPhase) return;
    this.lastPhase = this.phase;
    this.ov.setBool("isWaiting", this.phase === "waiting");
    this.ov.setBool("isRecording", this.phase === "recording");
    this.ov.setBool("isSummarizing", this.phase === "summarizing");
    this.ov.setBool("isFinalizing", this.phase === "finalizing");
  }

  override enterCalibrate(_stage = 1): void {
    this.ov?.setBool("isSetupComplete", false);
    this.vueOv?.setBool("isSetupComplete", false);
    this.stopApiRefresh();
  }
  override enterLocked(): void {
    this.ov?.setBool("isSetupComplete", true);
    this.vueOv?.setBool("isSetupComplete", true);
    this.startApiRefresh();
  }
  override setOverlayVisible(visible: boolean): void {
    this.hostVisible = visible;
    if (this.ctx.state === "calibrate") return;
    this.ov?.setVisible(visible);
    this.applyVueVisibility();
  }

  /** battle_hud only exists while a battle is running. */
  private get inBattle(): boolean {
    return !!this.acc?.connected;
  }

  private applyVueVisibility(): void {
    if (this.ctx.state === "calibrate") return;
    const hideInBattle = Boolean(this.ctx.config.get("hide_in_battle", false));
    const visible = this.hostVisible && !(hideInBattle && this.inBattle);
    if (visible === this.lastVueVisible) return;
    this.lastVueVisible = visible;
    this.vueOv?.setVisible(visible);
  }

  override tick(dt: number): void {
    this.ctx.config.checkReload();
    this.pushPhase();
    this.applyVueVisibility();
    if (this.ctx.state !== "locked" || !this.acc) return;

    // Mid-match recovery if we went IDLE while still connected.
    if (this.state === "IDLE") {
      const msNow = this.rd("match_state");
      const bsNow = this.rd("battle_state");
      if (bsNow === 8 && msNow !== MS_FINISH) {
        // Same skip as checkMatchStart(): never record FiringRange etc.
        if (SKIP_GAME_MODES.has(String(this.rd("game_mode")))) return;
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
      this.pollDeaths();
      this.sampleTimer += dt;
      const interval = Number(this.ctx.config.get("sample_interval_s"));
      if (this.sampleTimer >= interval) {
        this.sampleTimer -= interval;
        this.takeSample();
      }
      this.checkMatchEnd();
    } else if (this.state === "SUMMARIZING") {
      this.summarizeTimer += dt;
      if (this.summarizeTimer >= Number(this.ctx.config.get("summarize_hold_s"))) {
        this.setPhase("finalizing");
        this.finalize("end");
      }
    }
  }

  private pollDeaths(): void {
    const hp = this.numOrNull("health");
    if (hp === null) return;
    if (hp === 0 && this.lastHp !== null && this.lastHp !== 0) this.hpDeathCount += 1;
    this.lastHp = hp;
  }

  override teardown(): void {
    this.stopApiRefresh();
    if (this.session && (this.state === "RECORDING" || this.state === "SUMMARIZING")) {
      this.finalize(this.sawFinish || this.pmCaptured ? "end" : "abandoned");
    }
    this.ov?.remove();
    this.vueOv?.remove();
  }

  private onConnected(): void {
    if (this.state === "IDLE") {
      this.state = "WAITING";
      this.setPhase("waiting");
      this.sawFinish = false;
      this.debugMs = undefined;
      this.ctx.logger.info("heat_stats: CDP connected - waiting for active match");
    }
  }

  private onDisconnected(): void {
    if (this.session && (this.state === "RECORDING" || this.state === "SUMMARIZING")) {
      this.finalize(this.sawFinish || this.pmCaptured ? "end" : "abandoned");
    } else if (this.state === "WAITING") {
      this.state = "IDLE";
      this.setPhase("idle");
      this.ctx.logger.info("heat_stats: CDP disconnected before match started");
    }
  }

  private checkMatchStart(): void {
    const ms = this.rd("match_state");
    const bs = this.rd("battle_state");
    if (ms !== this.debugMs) {
      this.debugMs = ms;
      this.ctx.logger.info(`heat_stats: waiting - ms=${String(ms)} bs=${String(bs)}`);
    }
    if (bs === 8 && ms !== MS_FINISH) {
      if (SKIP_GAME_MODES.has(String(this.rd("game_mode")))) return;
      this.beginSession();
    }
  }

  private checkMatchEnd(): void {
    const ms = this.rd("match_state");
    if (ms === MS_FINISH) this.sawFinish = true;
    if (ms === null || ms === undefined) this.finalize("end");
  }

  private beginSession(): void {
    this.startedAt = Date.now() / 1000;
    this.session = {
      session_id: randomUUID(),
      map_slug: this.rd("map_slug") ?? null,
      map_name: this.rd("sb_map_name") ?? null,
      game_mode: this.rd("game_mode") ?? null,
      player_name: this.rd("player_name") ?? null,
      player_vehicle: this.rd("player_vehicle") ?? null,
      player_role: this.rd("player_role") ?? null,
      player_agent_id: this.rd("player_agent_id") ?? null,
    };
    this.samples = [];
    this.hpDeathCount = 0;
    this.lastHp = this.numOrNull("health");
    this.pmCaptured = false;
    this.roster = null;
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
    this.state = "RECORDING";
    this.setPhase("recording");
    this.ctx.logger.info(
      `heat_stats: match started - ${String(this.session.game_mode ?? "?")} on ${String(this.session.map_slug ?? "?")}`,
    );
    this.takeSample();
  }

  private takeSample(): void {
    if (!this.session) return;
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
  }

  private capturePostmatch(): boolean {
    const players = this.rd("pm_players") as Array<Record<string, unknown>> | null | undefined;
    if (!players || !players.length) return false;
    const sess = this.session!;
    const myId = this.rd("pm_my_player_id");
    let myTeam = this.rd("pm_my_team");
    const me = players.find((p) => p.playerId === myId) ?? null;
    if (myTeam == null && me) myTeam = me.team;

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

    const slim = (p: Record<string, unknown>) => ({ name: p.name ?? null, agent: p.agentName ?? null, tank: p.vehicleName ?? null, role: p.role ?? null });
    this.roster = { ally: ally.map(slim), enemy: enemy.map(slim) };
    return true;
  }

  private finalize(reason: string): void {
    if (!this.session) {
      this.state = "IDLE";
      return;
    }
    if (this.acc && this.rd("match_state") != null) this.takeSample();

    const sess = this.session;
    const now = Date.now() / 1000;
    sess.ended_at = now;
    sess.duration_s = Math.round((now - this.startedAt) * 100) / 100;

    if (!this.pmCaptured) {
      sess.final_kills = this.snap.ki;
      sess.final_deaths = this.hpDeathCount;
      sess.final_assists = this.snap.as;
      sess.final_damage = this.snap.da;
      sess.final_ally_score = this.snap.al;
      sess.final_enemy_score = this.snap.es;
      sess.final_confirms = this.snap.co;
      sess.final_denies = this.snap.dn;
      sess.final_score = this.snap.sc;
    }

    if (this.perfCount > 0) {
      sess.avg_ping = Math.round((this.pingSum / this.perfCount) * 10) / 10;
      sess.avg_fps = Math.round((this.fpsSum / this.perfCount) * 10) / 10;
    }

    const allyScore = Number(sess.final_ally_score ?? 0);
    const enemyScore = Number(sess.final_enemy_score ?? 0);
    if (reason === "abandoned") sess.outcome = "abandoned";
    else if (allyScore > enemyScore) sess.outcome = "win";
    else if (allyScore < enemyScore) sess.outcome = "loss";
    else sess.outcome = "draw";

    const payload = this.buildPayload(sess);
    payload.roster = this.roster ?? {};
    payload.hmac_hex = sign(payload);
    payload.type = "heat_stats.session_complete";

    this.ctx.logger.info(
      `heat_stats: match ended - ${String(sess.outcome)} | K${sess.final_kills} D${sess.final_deaths} ` +
        `A${sess.final_assists ?? "?"} dmg${sess.final_damage} | ${this.samples.length} samples`,
    );

    this.ctx.host.broadcast(payload);

    this.history.push({
      outcome: String(sess.outcome),
      kills: Number(sess.final_kills ?? 0),
      deaths: Number(sess.final_deaths ?? 0),
      playerName: String(sess.player_name ?? ""),
    });
    if (this.history.length > 50) this.history.shift();
    this.pushStats();
    void this.fetchAndPushStats();

    this.session = null;
    this.samples = [];
    this.sawFinish = false;
    this.pmCaptured = false;
    this.roster = null;
    this.state = "IDLE";
    if (this.acc && this.acc.connected) {
      this.state = "WAITING";
      this.setPhase("waiting");
    } else {
      this.setPhase("idle");
    }
  }

  /** Assemble the full session payload (all keys present, matching Python to_dict). */
  private buildPayload(sess: Record<string, unknown>): Record<string, unknown> {
    const g = (k: string): unknown => sess[k] ?? null;
    const n = (k: string): number => (typeof sess[k] === "number" ? (sess[k] as number) : 0);
    return {
      session_id: sess.session_id,
      started_at: this.startedAt,
      ended_at: sess.ended_at,
      duration_s: sess.duration_s ?? 0,
      outcome: sess.outcome ?? "abandoned",
      map_slug: g("map_slug"),
      map_name: g("map_name"),
      game_mode: g("game_mode"),
      player_name: g("player_name"),
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
      final_ally_score: n("final_ally_score"),
      final_enemy_score: n("final_enemy_score"),
      peak_ping: this.peakPing,
      avg_ping: sess.avg_ping ?? 0,
      avg_fps: sess.avg_fps ?? 0,
      sample_count: this.samples.length,
      client_version: CLIENT_VERSION,
      ...Object.fromEntries(Object.keys(PM_STAT_MAP).map((k) => [k, g(k)])),
      ally_kills: g("ally_kills"), ally_deaths: g("ally_deaths"), ally_assists: g("ally_assists"),
      ally_damage: g("ally_damage"), ally_captures: g("ally_captures"), ally_confirms: g("ally_confirms"), ally_denies: g("ally_denies"),
      enemy_kills: g("enemy_kills"), enemy_deaths: g("enemy_deaths"), enemy_assists: g("enemy_assists"),
      enemy_damage: g("enemy_damage"), enemy_captures: g("enemy_captures"), enemy_confirms: g("enemy_confirms"), enemy_denies: g("enemy_denies"),
      samples: this.samples.map((s) => ({ ...s })),
    };
  }

  /** Display mode + carousel timing, pushed on setup and whenever they change. */
  private pushDisplayConfig(): void {
    const ov = this.vueOv;
    if (!ov) return;
    ov.setString("mode", String(this.ctx.config.get("mode", "default")));
    ov.set("sceneTime", Number(this.ctx.config.get("scene_time_s", 8)) || 8);
    ov.setString("graphScale", String(this.ctx.config.get("graph_scale", "auto")));
    ov.set("graphPoints", Number(this.ctx.config.get("graph_points", 20)) || 20);
    ov.set("graphValueScale", Number(this.ctx.config.get("graph_value_scale", 1)) || 1);
  }

  private pushStats(): void {
    const ov = this.vueOv;
    if (!ov) return;
    const h = this.history;
    const total = h.length;
    const wins = h.filter((s) => s.outcome === "win").length;
    const totalKills = h.reduce((sum, s) => sum + s.kills, 0);
    const totalDeaths = h.reduce((sum, s) => sum + s.deaths, 0);
    const winRate = total > 0 ? (wins / total) * 100 : 0;
    const kd = totalDeaths > 0 ? totalKills / totalDeaths : totalKills;
    const recent = h.slice(-5).reverse().map((s) => s.outcome);
    const name = h.length > 0 ? h[h.length - 1].playerName : "";

    ov.setString("playerName", name);
    ov.set("winRate", Math.round(winRate * 10) / 10);
    ov.set("kd", Math.round(kd * 100) / 100);
    ov.set("totalKills", totalKills);
    ov.set("battleCount", total);
    ov.setJson("recentBattles", recent);
  }

  private startApiRefresh(): void {
    this.stopApiRefresh();
    const interval = Number(this.ctx.config.get("api_refresh_interval_s", 60)) || 0;
    if (interval <= 0) return;
    this.apiRefreshTimer = setInterval(() => { void this.fetchAndPushStats(); }, interval * 1000);
  }

  private stopApiRefresh(): void {
    if (this.apiRefreshTimer) {
      clearInterval(this.apiRefreshTimer);
      this.apiRefreshTimer = null;
    }
  }

  /** Fetch all sessions from the HEAT Stats API and push aggregated stats to the Vue overlay. */
  private async fetchAndPushStats(): Promise<void> {
    const apiKey = String(this.ctx.config.get("api_key", ""));
    const playerName = String(this.ctx.config.get("player_name", "")) || String(this.rd("player_name") ?? "");
    this.ctx.logger.info(`heat_stats: fetchAndPushStats apiKey=${apiKey ? "set" : "missing"} playerName=${playerName || "missing"}`);
    if (!apiKey || !playerName) {
      this.ctx.logger.info("heat_stats: skipping API fetch - missing api_key or player_name");
      return;
    }

    try {
      const sessions: Array<Record<string, unknown>> = [];
      const pageSize = 100;
      let offset = 0;
      while (true) {
        const url = `${API_BASE}/sessions?player_name=${encodeURIComponent(playerName)}&limit=${pageSize}&offset=${offset}`;
        const resp = await fetch(url, { headers: { "x-api-key": apiKey } });
        if (!resp.ok) {
          const body = await resp.json().catch(() => ({}));
          throw new Error((body as Record<string, string>).error ?? `HTTP ${resp.status}`);
        }
        const data = await resp.json() as { sessions?: Array<Record<string, unknown>>; total?: number };
        if (!data.sessions || data.sessions.length === 0) break;
        sessions.push(...data.sessions);
        offset += data.sessions.length;
        if (data.total != null && sessions.length >= data.total) break;
      }

      const ov = this.vueOv;
      if (!ov) return;

      // Session filter: drop everything recorded before the session marker.
      const startedAt = Number(this.ctx.config.get("session_started_at", 0)) || 0;
      const cutoffMs = startedAt > 0 ? startedAt * 1000 : 0;
      const inSession = sessions.filter((s) => toMs(s.started_at) >= cutoffMs);

      // API returns newest-first; the graph reads left->right with latest right.
      const chrono = [...inSession].reverse();
      const total = chrono.length;

      const emaKd = ema(chrono.map(kdOf));
      const emaWr = ema(chrono.map((s) => (String(s.outcome) === "win" ? 100 : 0)));
      const emaDmg = ema(chrono.map((s) => Number(s.final_damage ?? 0)));
      const last = (a: number[]): number => (a.length ? a[a.length - 1]! : 0);

      const latest = inSession.slice(0, 5).map((s) => ({
        vehicle: prettyVehicle(s.player_vehicle),
        map: String(s.map_name ?? s.map_slug ?? "?"),
        mode: String(s.game_mode ?? "?"),
        score: Number(s.final_score ?? 0),
        damage: Number(s.final_damage ?? 0),
        kills: Number(s.final_kills ?? 0),
        deaths: Number(s.final_deaths ?? 0),
        assists: Number(s.final_assists ?? 0),
        outcome: String(s.outcome ?? ""),
      }));

      // ── Scene 2: efficiency + per-game-mode breakdown ──
      const sum = (f: (s: Record<string, unknown>) => number): number =>
        chrono.reduce((acc, s) => acc + f(s), 0);
      const totalKills = sum((s) => Number(s.final_kills ?? 0));
      const totalDamage = sum((s) => Number(s.final_damage ?? 0));
      const totalScore = sum((s) => Number(s.final_score ?? 0));
      const totalMin = sum((s) => Number(s.duration_s ?? 0)) / 60;
      const efficiency = {
        dmgPerKill: totalKills > 0 ? Math.round(totalDamage / totalKills) : 0,
        killsPerMin: totalMin > 0 ? Math.round((totalKills / totalMin) * 100) / 100 : 0,
        scorePerMin: totalMin > 0 ? Math.round((totalScore / totalMin) * 10) / 10 : 0,
      };

      const modeAgg = new Map<string, { wins: number; count: number }>();
      for (const s of chrono) {
        const m = String(s.game_mode ?? "?");
        const e = modeAgg.get(m) ?? { wins: 0, count: 0 };
        e.count += 1;
        if (String(s.outcome) === "win") e.wins += 1;
        modeAgg.set(m, e);
      }
      const byMode = [...modeAgg.entries()].map(([mode, v]) => ({
        mode,
        winRate: v.count ? Math.round((v.wins / v.count) * 1000) / 10 : 0,
        count: v.count,
      }));

      ov.setString("playerName", playerName);
      ov.set("battleCount", total);
      ov.setJson("efficiency", efficiency);
      ov.setJson("byMode", byMode);
      ov.set("sessionStartedAt", startedAt);
      ov.set("kd", Math.round(last(emaKd) * 100) / 100);
      ov.set("winRate", Math.round(last(emaWr) * 10) / 10);
      ov.set("damage", Math.round(last(emaDmg)));
      // EMA is computed over the whole session, but only the most recent slice
      // is plotted - otherwise a long session collapses into unreadable noise.
      const tail = (a: number[]): number[] => a.slice(-GRAPH_MAX);
      ov.setJson("series", { kd: tail(emaKd), wr: tail(emaWr), dmg: tail(emaDmg) });
      ov.setJson("latest", latest);
      this.ctx.logger.info(
        `heat_stats: fetched ${sessions.length} sessions (${total} in session) from API`,
      );
    } catch (e) {
      this.ctx.logger.warning(`heat_stats: API fetch failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}
