import { HUD, HANGAR } from "../_shared/hudSelectors.js";
import { DamageLog, type DamageDeath, type DamageLogChange } from "./damageLog.js";
import { hangarScreen, sceneOf, sceneTags, type Scene, type SceneHangar, type SceneHud } from "./scene.js";

export { HUD, HANGAR };

type CacheValue = number | string | boolean | unknown[] | Record<string, unknown> | null;

/** Structured snapshot domains served by snapshot()/fetchSnapshot(). */
export type SnapshotDomain = "postmatch" | "roster" | "hangar" | "catalog" | "damage_log";

// game_memory-compatible field names => [JS result key, coerce].
const FIELD_MAP: Record<string, [string, (v: unknown) => number]> = {
  multiplayer_vehicle_health: ["health", toInt],
  multiplayer_vehicle_energy: ["energy", toInt],
  multiplayer_vehicle_boost: ["boost", toInt],
  multiplayer_camera_zoom: ["zoom_idx", toInt],
  multiplayer_is_fp_view: ["is_fp", toInt],
};

function toInt(v: unknown): number {
  return Math.trunc(Number(v));
}

const EXTRA_KEYS: readonly string[] = [
  "health", "health_regen", "health_pct",
  "energy", "energy_regen",
  "boost", "boost_active",
  "zoom_val", "zoom_idx", "num_zooms", "zooms",
  "speed",
  "ab1_state", "ab1_cd", "ab1_charges",
  "ab2_state", "ab2_cd", "ab2_charges",
  "ult_state", "ult_charge_pct",
  "target_dist", "target_dist_vis",
  "xp_action", "xp_action_type",
  "equip1_state", "equip1_cd", "equip1_charges",
  "equip2_state", "equip2_cd", "equip2_charges",
  "trait_state", "trait_cur_time", "trait_time", "trait_type",
  "battle_state", "battle_countdown",
  "ping", "fps",
  "game_mode", "match_state", "map_slug",
  "ally_score", "enemy_score", "allied_zones", "enemy_zones",
  "desired_score", "team_leads",
  "obj_active", "obj_ally_prc", "obj_enemy_prc", "obj_overtime",
  "overtime_active", "overtime_progress", "overtime_total",
  "player_kills", "player_assists", "player_damage", "player_role_pts",
  "player_is_dead", "player_role", "player_vehicle", "player_agent_id", "player_name",
  "on_fire", "debuff_count", "debuff_tags", "buff_count", "buff_tags",
  "major_effect_count",
  "dealt_damage", "dealt_hits",
  "missile_dist", "missile_in_flight",
  "sb_open", "sb_map_name", "sb_game_mode_name",
  "sb_ally_rows", "sb_enemy_rows",
  "sb_warriors", "sb_my_team", "sb_vehicle_slugs",
  "sb_player_deaths", "sb_player_confirms", "sb_player_denies",
  "pm_available", "pm_game_mode", "pm_map_slug", "pm_started_at", "pm_finished_at",
  "pm_battle_id", "pm_game_source", "pm_fingerprint",
  "pm_my_player_id", "pm_my_team", "pm_team_scores", "pm_players",
  "roster",
  "radar",
  "crosshair",
  "vehicles",
  "hangar_ready", "hangar_loadout", "hangar",
  "play_mode", "play_mode_slug",
  "_dbg_phm", "_dbg_mam",
];

/** Flat currency conveniences are dynamic: every `cur_<code>` is cached. */
const CUR_PREFIX = "cur_";
const PM_KEYS: readonly string[] = [
  "pm_available", "pm_game_mode", "pm_map_slug", "pm_started_at", "pm_finished_at",
  "pm_battle_id", "pm_game_source", "pm_fingerprint",
  "pm_my_player_id", "pm_my_team", "pm_team_scores", "pm_players",
];

type Logger = { debug(m: string): void; info(m: string): void; warning(m: string): void };

export type PageName =
  | "battle_hud"
  | "markers"
  | "base_indicators"
  | "battle_app"
  | "hangar"
  | "splash"
  | "transition_world";
const PAGE_MATCH: ReadonlyArray<[PageName, string]> = [
  ["battle_hud", "battle_hud"],
  ["markers", "markers"],
  ["base_indicators", "base_indicators"],
  ["battle_app", "battle_app"],
  ["hangar", "meta/index.html"],
  ["splash", "splash/index.html"],
  ["transition_world", "transition_world/index.html"],
];
const ALL_PAGES: readonly PageName[] = [
  "battle_hud",
  "markers",
  "base_indicators",
  "battle_app",
  "hangar",
  "splash",
  "transition_world",
];

/** One CDP WebSocket connection to a single Gameface page. */
class CdpConn {
  private ws: WebSocket;
  private msgId = 0;
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>();
  dead = false;
  readonly url: string;

  private constructor(ws: WebSocket, url: string) {
    this.ws = ws;
    this.url = url;
    ws.onmessage = (ev) => this.onMessage(String(ev.data));
    ws.onclose = () => this.markDead();
    ws.onerror = () => this.markDead();
  }

  static async connect(url: string, timeoutMs: number): Promise<CdpConn | null> {
    return new Promise((resolve) => {
      let ws: WebSocket;
      try {
        ws = new WebSocket(url);
      } catch {
        resolve(null);
        return;
      }
      const timer = setTimeout(() => {
        try {
          ws.close();
        } catch {
          /* ignore */
        }
        resolve(null);
      }, timeoutMs);
      ws.onopen = () => {
        clearTimeout(timer);
        resolve(new CdpConn(ws, url));
      };
      ws.onerror = () => {
        clearTimeout(timer);
        resolve(null);
      };
    });
  }

  private markDead(): void {
    this.dead = true;
    for (const { reject, timer } of this.pending.values()) {
      clearTimeout(timer);
      reject(new Error("cdp socket closed"));
    }
    this.pending.clear();
  }

  private onMessage(text: string): void {
    let msg: { id?: number; result?: unknown };
    try {
      msg = JSON.parse(text);
    } catch {
      return;
    }
    if (typeof msg.id === "number" && this.pending.has(msg.id)) {
      const p = this.pending.get(msg.id)!;
      clearTimeout(p.timer);
      this.pending.delete(msg.id);
      p.resolve(msg.result);
    }
  }

  /** Runtime.evaluate; returns result.result.value (parsed CDP value), or throws. */
  async evaluate(expr: string, returnByValue = true, recvTimeoutMs = 500): Promise<unknown> {
    if (this.dead) throw new Error("cdp socket dead");
    const id = ++this.msgId;
    const payload = JSON.stringify({
      id,
      method: "Runtime.evaluate",
      params: { expression: expr, returnByValue },
    });
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("cdp eval timeout"));
      }, recvTimeoutMs);
      this.pending.set(id, {
        resolve: (result) => {
          const r = result as { result?: { value?: unknown } };
          resolve(r?.result?.value);
        },
        reject,
        timer,
      });
      try {
        this.ws.send(payload);
      } catch (e) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(e as Error);
      }
    });
  }

  close(): void {
    try {
      this.ws.close();
    } catch {
      /* ignore */
    }
  }
}

/** Only a fallback: the App owns the port and the runtime serves it. */
export const DEFAULT_CDP_PORT = 17503;

export class Accessors {
  private port: number;
  private connectTimeout: number;
  private recvTimeout: number;
  private log: Logger;
  private onEvent: ((name: string, payload: Record<string, unknown>) => void) | null;

  private conns: Record<PageName, CdpConn | null> = {
    battle_hud: null,
    markers: null,
    base_indicators: null,
    battle_app: null,
    hangar: null,
    splash: null,
    transition_world: null,
  };
  private _connected = false;
  private _connectedHangar = false;
  private _connectedBaseIndicators = false;
  private cache = new Map<string, CacheValue>();
  /** Large structured records; served by snapshot()/fetchSnapshot(), not flat reads. */
  private snapshots = new Map<SnapshotDomain, unknown>();
  /** `battleId:finishedAt` of the captured postmatch, or null when none/stale. */
  private pmFingerprint: string | null = null;
  private hangarPollMs: number;
  private lastHangarPoll = 0;
  private dmg = new DamageLog();
  private dmgRev = -1;
  private sceneHud: SceneHud | null = null;
  private sceneRoute: string | null = null;
  private sceneHangar: SceneHangar | null = null;
  private scene: Scene = "offline";
  private sceneTagsKey = "";
  private sceneSince = Date.now();
  /** The battle_hud socket the hit baseline belongs to; a new page starts a new hit counter. */
  private hitConn: CdpConn | null = null;
  private lastHitId: number | null = null;

  private jsLibs: string;
  private jsReadAll: string;
  private jsReadCrosshair: string;
  private jsReadMarkers: string;
  private jsReadBattleApp: string;
  private jsReadHangar: string;
  private jsReadHangarScene: string;
  private jsReadPostmatch: string;
  private jsReadRoster: string;

  constructor(opts: {
    port?: number;
    connectTimeout?: number;
    recvTimeout?: number;
    /** Minimum seconds between hangar polls; hangar data changes slowly. */
    hangarPollInterval?: number;
    logger: Logger;
    /** Fired on page connect/disconnect and when a postmatch snapshot is captured. */
    onEvent?: (name: string, payload: Record<string, unknown>) => void;
    scripts: {
      common: string;
      postmatch: string;
      readAll: string;
      readCrosshair: string;
      readMarkers: string;
      readBattleApp: string;
      readHangar: string;
      readHangarScene: string;
      readPostmatch: string;
      readRoster: string;
    };
  }) {
    this.port = opts.port ?? DEFAULT_CDP_PORT;
    this.connectTimeout = (opts.connectTimeout ?? 8.0) * 1000;
    this.recvTimeout = (opts.recvTimeout ?? 0.5) * 1000;
    this.hangarPollMs = (opts.hangarPollInterval ?? 2.0) * 1000;
    this.log = opts.logger;
    this.onEvent = opts.onEvent ?? null;
    // Readers share one scope: helpers (common.js), the postmatch normalizer
    // (postmatch.js), then `return (<reader>)();` yields the JSON string.
    this.jsLibs = opts.scripts.common + "\n" + opts.scripts.postmatch;
    this.jsReadAll = opts.scripts.readAll;
    this.jsReadCrosshair = opts.scripts.readCrosshair;
    this.jsReadMarkers = opts.scripts.readMarkers;
    this.jsReadBattleApp = opts.scripts.readBattleApp;
    this.jsReadHangar = opts.scripts.readHangar;
    this.jsReadHangarScene = opts.scripts.readHangarScene;
    this.jsReadPostmatch = opts.scripts.readPostmatch;
    this.jsReadRoster = opts.scripts.readRoster;
  }

  private emit(name: string, payload: Record<string, unknown> = {}): void {
    try {
      this.onEvent?.(name, payload);
    } catch {
      /* consumer event errors must not break polling */
    }
  }

  /** Compose the shared-scope eval program: libs, prelude vars, then the reader. */
  private wrap(reader: string, prelude = ""): string {
    return "(function(){" + this.jsLibs + ";" + prelude + ";return (" + reader + ");})()";
  }

  get connected(): boolean {
    return this._connected;
  }
  get connectedHangar(): boolean {
    return this._connectedHangar;
  }
  /** The `base_indicators` page exists only while spawned - it is recreated on respawn. */
  get connectedBaseIndicators(): boolean {
    return this._connectedBaseIndicators;
  }
  /** Any CoHTML page is connected (hangar alone keeps reads alive outside battle). */
  get anyConnected(): boolean {
    return ALL_PAGES.some((p) => this.conns[p] !== null);
  }
  isConnected(page: PageName): boolean {
    return this.conns[page] !== null;
  }

  /** What other plugins read synchronously; the plugin publishes it every tick. */
  publicState(): Record<string, unknown> {
    const pages: Record<string, boolean> = {};
    for (const name of Object.keys(this.conns) as PageName[]) pages[name] = this.conns[name] !== null;
    return {
      values: Object.fromEntries(this.cache),
      pages,
      connected: this._connected,
      connectedHangar: this._connectedHangar,
      connectedBaseIndicators: this.connectedBaseIndicators,
    };
  }

  private async discoverTargets(): Promise<Partial<Record<PageName, string>> | null> {
    let targets: Array<Record<string, unknown>>;
    try {
      const resp = await fetch(`http://localhost:${this.port}/json`, {
        signal: AbortSignal.timeout(2000),
      });
      targets = (await resp.json()) as Array<Record<string, unknown>>;
    } catch (e) {
      this.log.debug(`Accessors: CDP not reachable on port ${this.port}: ${String(e)}`);
      return null;
    }
    if (!Array.isArray(targets)) return null;
    const found: Partial<Record<PageName, string>> = {};
    for (const t of targets) {
      if (t.type !== "page") continue;
      const url = String(t.url ?? "");
      const wsurl = t.webSocketDebuggerUrl as string | undefined;
      if (!wsurl) continue;
      for (const [name, needle] of PAGE_MATCH) {
        if (!(name in found) && url.includes(needle)) {
          found[name] = wsurl;
          break;
        }
      }
    }
    return found;
  }

  async open(): Promise<boolean> {
    return this.sync();
  }

  /** Reconcile open sockets with the CDP pages that exist now. */
  async sync(): Promise<boolean> {
    const targets = await this.discoverTargets();
    if (targets === null) {
      this.close();
      this.updateScene();
      return false;
    }
    const changed: string[] = [];
    for (const name of ALL_PAGES) {
      const wantUrl = targets[name];
      const conn = this.conns[name];
      if (wantUrl && (conn === null || conn.dead || conn.url !== wantUrl)) {
        if (conn) conn.close();
        const fresh = await CdpConn.connect(wantUrl, this.connectTimeout);
        if (fresh) {
          this.conns[name] = fresh;
          changed.push(`+${name}`);
          this.emit("accessors.page_connected", { page: name });
        } else if (conn) {
          this.conns[name] = null;
        }
      } else if (!wantUrl && conn !== null) {
        conn.close();
        this.conns[name] = null;
        changed.push(`-${name}`);
        this.emit("accessors.page_disconnected", { page: name });
      }
    }
    this._connected = this.conns.battle_hud !== null;
    this._connectedHangar = this.conns.hangar !== null;
    this._connectedBaseIndicators = this.conns.base_indicators !== null;
    if (!this._connected) this.dmg.hudLost(Date.now());
    if (this._connectedHangar) this.dmg.matchOver();
    if (changed.length) this.log.info(`Accessors: CDP connections updated [${changed.join(" ")}]`);
    this.updateScene();
    return this.anyConnected;
  }

  /** One scene for every consumer, so no plugin guesses battle state on its own. */
  private updateScene(): void {
    if (!this.conns.battle_hud) this.sceneHud = null;
    if (!this.conns.battle_app) this.sceneRoute = null;
    if (!this.conns.hangar) this.sceneHangar = null;
    const pages: Record<string, boolean> = {};
    for (const name of ALL_PAGES) pages[name] = this.conns[name] !== null;
    const bs = this.cache.get("battle_state");
    const next = sceneOf({
      pages,
      battleState: typeof bs === "number" ? bs : null,
      hud: this.sceneHud,
      route: this.sceneRoute,
    });
    const tags = sceneTags(next, this.sceneHangar);
    const tagsKey = tags.join(",");
    const now = Date.now();
    if (next !== this.scene || tagsKey !== this.sceneTagsKey) {
      const prev = this.scene;
      if (next !== this.scene) this.sceneSince = now;
      this.scene = next;
      this.sceneTagsKey = tagsKey;
      this.emit("accessors.scene_changed", { scene: next, prev, tags });
    }
    this.cache.set("scene", this.scene);
    this.cache.set("scene_tags", tags);
    this.cache.set("scene_info", {
      scene: this.scene,
      tags,
      since_ms: this.sceneSince,
      camera: this.sceneHud?.camera ?? "",
      route: this.scene === "hangar" ? (this.sceneHangar?.route ?? null) : this.sceneRoute,
      screen: this.scene === "hangar" ? hangarScreen(this.sceneHangar?.route ?? null) : null,
      queued: this.sceneHangar?.queued ?? false,
      battle_state: typeof bs === "number" ? bs : null,
    });
  }

  /** A new port invalidates every socket; the next sync re-discovers the pages. */
  setPort(port: number): void {
    if (!Number.isInteger(port) || port < 1024 || port > 65535 || port === this.port) return;
    this.log.info(`Accessors: CDP port ${this.port} -> ${port}`);
    this.port = port;
    this.close();
  }

  close(): void {
    for (const name of Object.keys(this.conns) as PageName[]) {
      this.conns[name]?.close();
      this.conns[name] = null;
    }
    this._connected = false;
    this._connectedHangar = false;
    this._connectedBaseIndicators = false;
    this.cache.clear();
    this.snapshots.clear();
    this.pmFingerprint = null;
  }

  private drop(name: PageName): void {
    if (this.conns[name] === null) return;
    this.conns[name]?.close();
    this.conns[name] = null;
    if (name === "battle_hud") {
      this._connected = false;
      this.dmg.hudLost(Date.now());
    }
    if (name === "hangar") this._connectedHangar = false;
    if (name === "base_indicators") this._connectedBaseIndicators = false;
    this.emit("accessors.page_disconnected", { page: name });
  }

  /**
   * Poll every connected page independently. battle_hud/markers/battle_app run
   * every call; the hangar reader runs on its own slower cadence. Returns false
   * when nothing is connected or a page's eval failed (its socket was dropped
   * and a re-sync is needed).
   */
  async refresh(): Promise<boolean> {
    if (!this.anyConnected) return false;
    let failed = false;

    const evalPage = async (conn: CdpConn, expr: string): Promise<Record<string, unknown> | null> => {
      const raw = await conn.evaluate(expr, true, this.recvTimeout);
      return raw ? (JSON.parse(String(raw)) as Record<string, unknown>) : null;
    };

    const hud = this.conns.battle_hud;
    if (hud) {
      try {
        const data = await evalPage(hud, this.wrap(this.jsReadAll));
        if (data) {
          if (data._err) this.log.warning(`Accessors: JS error (hud): ${String(data._err)}`);
          this.updateCache(data);
          if (data.roster) this.snapshots.set("roster", data.roster);
          this.sceneHud = (data.scene_hud as SceneHud | undefined) ?? null;
          const { changes, died } = this.dmg.read(data, Date.now());
          this.publishDamage(changes, died);
        }
      } catch (e) {
        this.log.warning(`Accessors: battle_hud eval failed - ${String(e)}`);
        this.drop("battle_hud");
        this.cache.clear();
        failed = true;
      }
    }

    const hudX = this.conns.battle_hud;
    if (hudX) {
      try {
        const xd = await evalPage(hudX, this.wrap(this.jsReadCrosshair));
        if (xd) {
          if (xd._err) this.log.warning(`Accessors: JS error (crosshair): ${String(xd._err)}`);
          this.updateCache(xd);
          this.publishHits(hudX, xd.crosshair);
        }
      } catch (e) {
        this.log.warning(`Accessors: crosshair eval failed - ${String(e)}`);
        this.drop("battle_hud");
        this.cache.clear();
        failed = true;
      }
    }

    const markers = this.conns.markers;
    if (markers) {
      try {
        const md = await evalPage(markers, this.wrap(this.jsReadMarkers));
        if (md) {
          if (md._err) this.log.warning(`Accessors: JS error (markers): ${String(md._err)}`);
          this.updateCache(md);
        }
      } catch (e) {
        this.log.warning(`Accessors: markers eval failed - ${String(e)}`);
        this.drop("markers");
        failed = true;
      }
    }

    const battleApp = this.conns.battle_app;
    if (battleApp) {
      try {
        // pm_result is ~100KB; the page sends it only on the first poll that
        // finds results, then we dedup by fingerprint.
        const wantPm = this.pmFingerprint === null;
        const ad = await evalPage(battleApp, this.wrap(this.jsReadBattleApp, `var __FUSE_WANT_PM=${wantPm ? 1 : 0};`));
        if (ad) {
          if (ad._err) this.log.warning(`Accessors: JS error (battle_app): ${String(ad._err)}`);
          this.updateCache(ad);
          this.sceneRoute = typeof ad.scene_route === "string" ? ad.scene_route : null;
          this.adoptPostmatch(ad.pm_result, "battle_app");
          if (ad.pm_available === 0) this.clearPostmatch();
          if (ad.roster) this.snapshots.set("roster", ad.roster);
          this.matchLocalRow((ad.sb_ally_rows as Array<Record<string, unknown>>) ?? []);
        }
      } catch (e) {
        this.log.warning(`Accessors: battle_app eval failed - ${String(e)}`);
        this.drop("battle_app");
        failed = true;
      }
    }

    const hangar = this.conns.hangar;
    if (hangar) {
      try {
        const hs = await evalPage(hangar, this.wrap(this.jsReadHangarScene));
        this.sceneHangar = hs
          ? { route: typeof hs.route === "string" ? hs.route : null, queued: hs.queued === 1 }
          : null;
      } catch (e) {
        this.log.warning(`Accessors: hangar scene eval failed - ${String(e)}`);
        this.drop("hangar");
        failed = true;
      }
    }
    if (hangar && this.conns.hangar && Date.now() - this.lastHangarPoll >= this.hangarPollMs) {
      this.lastHangarPoll = Date.now();
      try {
        const wantPm = this.pmFingerprint === null;
        const hd = await evalPage(hangar, this.wrap(this.jsReadHangar, `var __FUSE_WANT_PM=${wantPm ? 1 : 0};`));
        if (hd) {
          if (hd._err) this.log.warning(`Accessors: JS error (hangar): ${String(hd._err)}`);
          this.updateCache(hd);
          if (hd.hangar) this.snapshots.set("hangar", hd.hangar);
          this.adoptPostmatch(hd.pm_result, "hangar");
        }
      } catch (e) {
        this.log.warning(`Accessors: hangar eval failed - ${String(e)}`);
        this.drop("hangar");
        failed = true;
      }
    }
    this.updateScene();
    return !failed;
  }

  /** Store a full normalized postmatch tree once per battle, keyed by fingerprint. */
  private adoptPostmatch(res: unknown, source: string): void {
    if (!res || typeof res !== "object") return;
    const pm = res as Record<string, unknown>;
    const fp = `${String(pm.battleId)}:${String(pm.finishedAt)}`;
    if (this.pmFingerprint === fp && this.snapshots.has("postmatch")) return;
    const changed = this.pmFingerprint !== fp;
    this.pmFingerprint = fp;
    this.snapshots.set("postmatch", pm);
    this.cache.set("pm_fingerprint", fp);
    if (pm.battleId != null) this.cache.set("pm_battle_id", pm.battleId as CacheValue);
    if (changed) this.emit("accessors.results_available", { battleId: pm.battleId ?? null, source });
  }

  /** Cache the damage history when it moved (or the cache was cleared), then announce each change. */
  private publishDamage(changes: DamageLogChange[], died: DamageDeath | null): void {
    const state = this.dmg.state();
    if (state.rev !== this.dmgRev || !this.cache.has("damage_log")) {
      this.dmgRev = state.rev;
      this.cache.set("damage_log", state as unknown as Record<string, unknown>);
      this.snapshots.set("damage_log", state);
    }
    for (const { entry, update } of changes) {
      this.emit("accessors.damage_taken", { match: state.match, update, entry });
    }
    if (died) {
      this.emit("accessors.player_died", {
        match: state.match,
        life: died.life,
        fatal_id: died.fatal_id,
        killer: died.killer,
      });
    }
  }

  /**
   * Announce each damage action the HUD drained since the last poll. The first read on a page
   * only sets the baseline, so a restart does not replay old hits.
   */
  private publishHits(conn: CdpConn, crosshair: unknown): void {
    const hits = (crosshair as { hits?: Array<Record<string, unknown>> } | null)?.hits;
    if (!Array.isArray(hits)) return;
    if (conn !== this.hitConn) {
      this.hitConn = conn;
      this.lastHitId = null;
    }
    let max = -1;
    for (const h of hits) max = Math.max(max, Number(h.id));
    // Ids only rise on one page, so a drop is a new page.
    if (this.lastHitId === null || max < this.lastHitId) {
      this.lastHitId = max;
      return;
    }
    for (const h of hits) {
      const id = Number(h.id);
      if (!(id > this.lastHitId)) continue;
      this.emit("accessors.crosshair_hit", { hit: h });
    }
    this.lastHitId = Math.max(this.lastHitId, max);
  }

  /** A reader reported no results on screen: drop the stale postmatch view. */
  private clearPostmatch(): void {
    if (this.pmFingerprint === null && !this.snapshots.has("postmatch")) return;
    this.pmFingerprint = null;
    this.snapshots.delete("postmatch");
    for (const k of PM_KEYS) this.cache.delete(k);
  }

  private matchLocalRow(allyRows: Array<Record<string, unknown>>): void {
    const pName = this.cache.get("player_name");
    const pDmg = this.cache.get("player_damage");
    const pSc = this.cache.get("player_role_pts");
    for (const row of allyRows) {
      const byName = Boolean(pName && row.name === pName);
      const byStats = pDmg != null && pSc != null && row.damage === pDmg && row.score === pSc;
      if (byName || byStats) {
        this.cache.set("sb_player_deaths", (row.deaths as CacheValue) ?? null);
        const parts = String(row.kcd ?? "").split(" / ");
        if (parts.length >= 3) {
          const c = Number.parseInt(parts[1]!, 10);
          const d = Number.parseInt(parts[2]!, 10);
          if (!Number.isNaN(c)) this.cache.set("sb_player_confirms", c);
          if (!Number.isNaN(d)) this.cache.set("sb_player_denies", d);
        }
        return;
      }
    }
  }

  private updateCache(data: Record<string, unknown>): void {
    for (const [field, [key, coerce]] of Object.entries(FIELD_MAP)) {
      if (key in data) {
        const val = data[key];
        this.cache.set(field, val != null ? coerce(val) : null);
      }
    }
    for (const key of Object.keys(data)) {
      const val = data[key];
      if (val == null) continue;
      if (EXTRA_KEYS.includes(key) || key.startsWith(CUR_PREFIX)) this.cache.set(key, val as CacheValue);
    }
  }

  /** Return the last-cached value for `name`, or null. */
  read(name: string): CacheValue | undefined {
    return this.cache.get(name);
  }

  /**
   * Last captured structured snapshot for a domain, or null.
   *   "postmatch" - full normalized result tree (stats, currencies, rewards,
   *                 entitlements, coefs, per-loadout stats, account identity
   *                 incl. platform/inputScheme), kept until the next battle's
   *                 results replace it
   *   "roster"    - last full tactical roster (players, me, teams, is_free)
   *   "hangar"    - last hangar snapshot (currencies, entitlements, loadouts,
   *                 vehicle/agent ownership + progression, equipment)
   *   "catalog"   - last on-demand catalog pull (fetchSnapshot("catalog")):
   *                 perks, talismans, and every vehicle with its modules,
   *                 frontmen and equipment. Heavy; pull once per game build
   *   "damage_log" - damage taken this match (same object as the `damage_log` read)
   * The returned object is a provider-side reference; the service RPC clones it
   * on the way out, so callers may treat it as immutable.
   */
  snapshot(domain: SnapshotDomain | string): unknown {
    return this.snapshots.get(domain as SnapshotDomain) ?? null;
  }

  /**
   * Force a fresh in-page pull for a domain, cache it, and return it. Unlike
   * snapshot() this evaluates on the game page right now. Resolves null when
   * the data or its page is unavailable.
   */
  async fetchSnapshot(domain: SnapshotDomain | string): Promise<unknown> {
    const evalJson = async (conn: CdpConn, expr: string): Promise<unknown> => {
      const raw = await conn.evaluate(expr, true, this.recvTimeout);
      return raw ? JSON.parse(String(raw)) : null;
    };
    try {
      switch (domain) {
        case "postmatch": {
          const conn = this.conns.battle_app ?? this.conns.hangar;
          if (!conn) return this.snapshots.get("postmatch") ?? null;
          const pm = await evalJson(conn, this.wrap(this.jsReadPostmatch));
          if (pm) this.adoptPostmatch(pm, "fetch");
          return pm ?? this.snapshots.get("postmatch") ?? null;
        }
        case "roster": {
          const conn = this.conns.battle_app ?? this.conns.battle_hud;
          if (!conn) return this.snapshots.get("roster") ?? null;
          const roster = await evalJson(conn, this.wrap(this.jsReadRoster));
          if (roster) this.snapshots.set("roster", roster);
          return roster ?? this.snapshots.get("roster") ?? null;
        }
        case "hangar": {
          const conn = this.conns.hangar;
          if (!conn) return this.snapshots.get("hangar") ?? null;
          const hd = (await evalJson(conn, this.wrap(this.jsReadHangar))) as Record<string, unknown> | null;
          if (hd?.hangar) this.snapshots.set("hangar", hd.hangar);
          if (hd) this.updateCache(hd);
          return hd?.hangar ?? this.snapshots.get("hangar") ?? null;
        }
        case "catalog": {
          const conn = this.conns.hangar;
          if (!conn) return this.snapshots.get("catalog") ?? null;
          const hd = (await evalJson(
            conn,
            this.wrap(this.jsReadHangar, "var __FUSE_HANGAR_FULL=1;var __FUSE_WANT_PM=0;"),
          )) as Record<string, unknown> | null;
          // The full read spreads the catalog over two places: perks and
          // talismans on `catalog`, per-vehicle modules on `hangar.vehicles`.
          // Served as one self-contained domain, so a consumer never has to
          // catch the heavy hangar before the next light poll replaces it.
          // `hangar` is left to the regular reader, keeping its shape stable.
          const full = hd?.hangar as Record<string, unknown> | undefined;
          const catalog = hd?.catalog
            ? {
                ...(hd.catalog as Record<string, unknown>),
                vehicles: full?.vehicles ?? [],
                frontmen: full?.frontmen ?? [],
                equipment: full?.equipment ?? [],
              }
            : null;
          if (catalog) this.snapshots.set("catalog", catalog);
          return catalog ?? this.snapshots.get("catalog") ?? null;
        }
        case "damage_log":
          return this.dmg.state();
        default:
          return null;
      }
    } catch (e) {
      this.log.warning(`Accessors.fetchSnapshot('${domain}') failed - ${String(e)}`);
      return this.snapshots.get(domain as SnapshotDomain) ?? null;
    }
  }

  // --- Setters / style injection (fire-and-forget) ------------------------

  private async exec(name: PageName, expr: string): Promise<void> {
    const conn = this.conns[name];
    if (!conn || conn.dead) return;
    try {
      await conn.evaluate(expr, false, this.recvTimeout);
    } catch (e) {
      this.log.warning(`Accessors.exec(${name}): send failed - ${String(e)}`);
      this.drop(name);
    }
  }

  /** Injection expression; evaluates to "ok" or "err:<message>" so the caller can tell. */
  private static styleExpr(styleId: string, css: string | null): string {
    const sid = styleId.replace(/'/g, "\\'");
    if (css === null) {
      return `(function(){try{var el=document.getElementById('${sid}');if(el)el.remove();return 'ok';}catch(e){return 'err:'+e.message;}})()`;
    }
    const safe = css.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");
    return (
      "(function(){try{" +
      `var el=document.getElementById('${sid}');` +
      `if(!el){el=document.createElement('style');el.id='${sid}';document.head.appendChild(el);}` +
      "el.textContent=`" + safe + "`;" +
      `return document.getElementById('${sid}')?'ok':'err:style tag missing after append';` +
      "}catch(e){return 'err:'+e.message;}})()"
    );
  }

  /**
   * Inject (or clear, with `css === null`) a stylesheet on any page. Resolves false
   * and logs why when the page is not connected or the page-side eval failed.
   */
  async injectStylesheetOn(page: PageName, css: string | null, styleId = "__fuse__"): Promise<boolean> {
    const conn = this.conns[page];
    if (!conn) {
      this.log.warning(`Accessors: '${styleId}' not injected - page '${page}' has no CDP connection`);
      return false;
    }
    try {
      const raw = await conn.evaluate(Accessors.styleExpr(styleId, css), true, this.recvTimeout);
      const res = String(raw ?? "");
      if (res !== "ok") {
        this.log.warning(`Accessors: '${styleId}' injection on '${page}' failed - ${res || "no result"}`);
        return false;
      }
      return true;
    } catch (e) {
      this.log.warning(`Accessors: '${styleId}' injection on '${page}' failed - ${String(e)}`);
      this.drop(page);
      return false;
    }
  }

  injectStylesheet(css: string | null, styleId = "__fuse__"): Promise<boolean> {
    return this.injectStylesheetOn("battle_hud", css, styleId);
  }
  injectStylesheetMarkers(css: string | null, styleId = "__fuse__"): Promise<boolean> {
    return this.injectStylesheetOn("markers", css, styleId);
  }
  injectStylesheetBaseIndicators(css: string | null, styleId = "__fuse__"): Promise<boolean> {
    return this.injectStylesheetOn("base_indicators", css, styleId);
  }
  injectStylesheetHangar(css: string | null, styleId = "__fuse__"): Promise<boolean> {
    return this.injectStylesheetOn("hangar", css, styleId);
  }

  /**
   * Element count per selector on `page`. -1 marks a selector the page rejected as
   * invalid syntax; null means the page is not connected or the eval failed.
   */
  async countMatches(page: PageName, selectors: readonly string[]): Promise<Record<string, number> | null> {
    const conn = this.conns[page];
    if (!conn || selectors.length === 0) return null;
    const list = JSON.stringify(selectors);
    const expr =
      "(function(){var out={};var sels=" + list + ";" +
      "for(var i=0;i<sels.length;i++){try{out[sels[i]]=document.querySelectorAll(sels[i]).length;}catch(e){out[sels[i]]=-1;}}" +
      "return JSON.stringify(out);})()";
    try {
      const raw = await conn.evaluate(expr, true, this.recvTimeout);
      return raw ? (JSON.parse(String(raw)) as Record<string, number>) : null;
    } catch (e) {
      this.log.debug(`Accessors: countMatches('${page}') failed - ${String(e)}`);
      return null;
    }
  }

  /** Generic per-page style ops - the base for styling any CoHTML document. */
  setStyleOn(
    page: PageName,
    selector: string,
    prop: string,
    value: string,
    opts: { allMatching?: boolean; important?: boolean } = {},
  ): Promise<void> {
    const prio = opts.important ? "'important'" : "''";
    const sel = JSON.stringify(selector);
    const p = JSON.stringify(prop);
    const v = JSON.stringify(value);
    const expr = opts.allMatching
      ? `Array.from(document.querySelectorAll(${sel})).forEach(function(el){el.style.setProperty(${p},${v},${prio})});null`
      : `var el=document.querySelector(${sel});if(el)el.style.setProperty(${p},${v},${prio});null`;
    return this.exec(page, expr);
  }

  setStyle(selector: string, prop: string, value: string, opts: { allMatching?: boolean; important?: boolean } = {}): Promise<void> {
    return this.setStyleOn("battle_hud", selector, prop, value, opts);
  }
  setStyleHangar(selector: string, prop: string, value: string, opts: { allMatching?: boolean; important?: boolean } = {}): Promise<void> {
    return this.setStyleOn("hangar", selector, prop, value, opts);
  }

  setStylesOn(
    page: PageName,
    selector: string,
    styles: Record<string, string>,
    opts: { allMatching?: boolean; important?: boolean } = {},
  ): Promise<void> {
    const prio = opts.important ? "'important'" : "''";
    const sel = JSON.stringify(selector);
    const assignments = Object.entries(styles)
      .map(([k, v]) => `el.style.setProperty(${JSON.stringify(k)},${JSON.stringify(v)},${prio})`)
      .join(";");
    const expr = opts.allMatching
      ? `Array.from(document.querySelectorAll(${sel})).forEach(function(el){${assignments}});null`
      : `var el=document.querySelector(${sel});if(el){${assignments}};null`;
    return this.exec(page, expr);
  }

  setStyles(selector: string, styles: Record<string, string>, opts: { allMatching?: boolean; important?: boolean } = {}): Promise<void> {
    return this.setStylesOn("battle_hud", selector, styles, opts);
  }
  setStylesHangar(selector: string, styles: Record<string, string>, opts: { allMatching?: boolean; important?: boolean } = {}): Promise<void> {
    return this.setStylesOn("hangar", selector, styles, opts);
  }

  resetStyleOn(
    page: PageName,
    selector: string,
    prop: string | null = null,
    opts: { allMatching?: boolean } = {},
  ): Promise<void> {
    const sel = JSON.stringify(selector);
    let expr: string;
    if (prop !== null) {
      const p = JSON.stringify(prop);
      expr = opts.allMatching
        ? `Array.from(document.querySelectorAll(${sel})).forEach(function(el){el.style.removeProperty(${p})});null`
        : `var el=document.querySelector(${sel});if(el)el.style.removeProperty(${p});null`;
    } else {
      expr = opts.allMatching
        ? `Array.from(document.querySelectorAll(${sel})).forEach(function(el){el.style.cssText=''});null`
        : `var el=document.querySelector(${sel});if(el)el.style.cssText='';null`;
    }
    return this.exec(page, expr);
  }

  resetStyle(selector: string, prop: string | null = null, opts: { allMatching?: boolean } = {}): Promise<void> {
    return this.resetStyleOn("battle_hud", selector, prop, opts);
  }
  resetStyleHangar(selector: string, prop: string | null = null, opts: { allMatching?: boolean } = {}): Promise<void> {
    return this.resetStyleOn("hangar", selector, prop, opts);
  }

  // Convenience wrappers ---------------------------------------------------

  hideOn(page: PageName, selector: string, opts: { allMatching?: boolean } = {}): Promise<void> {
    return this.setStyleOn(page, selector, "visibility", "hidden", { allMatching: opts.allMatching, important: true });
  }
  showOn(page: PageName, selector: string, opts: { allMatching?: boolean } = {}): Promise<void> {
    return this.resetStyleOn(page, selector, "visibility", opts);
  }
  hide(selector: string, opts: { allMatching?: boolean } = {}): Promise<void> {
    return this.hideOn("battle_hud", selector, opts);
  }
  show(selector: string, opts: { allMatching?: boolean } = {}): Promise<void> {
    return this.showOn("battle_hud", selector, opts);
  }
  hideHangar(selector: string, opts: { allMatching?: boolean } = {}): Promise<void> {
    return this.hideOn("hangar", selector, opts);
  }
  showHangar(selector: string, opts: { allMatching?: boolean } = {}): Promise<void> {
    return this.showOn("hangar", selector, opts);
  }

  /**
   * Insert HTML into a page relative to `targetSelector` (`beforebegin`,
   * `afterbegin`, `beforeend`, `afterend`). When `elementId` is given, an
   * existing element with that id is removed first, so repeated calls are
   * idempotent - include the same id in the inserted markup to own it.
   * Resolves false when the page/target is missing.
   */
  async insertHtmlOn(
    page: PageName,
    targetSelector: string,
    html: string,
    position: "beforebegin" | "afterbegin" | "beforeend" | "afterend" = "beforeend",
    elementId?: string,
  ): Promise<boolean> {
    const conn = this.conns[page];
    if (!conn || conn.dead) return false;
    if (!["beforebegin", "afterbegin", "beforeend", "afterend"].includes(position)) {
      this.log.warning(`Accessors.insertHtmlOn: invalid position '${position}'`);
      return false;
    }
    const sel = JSON.stringify(targetSelector);
    const h = JSON.stringify(html);
    const pos = JSON.stringify(position);
    const rm = elementId
      ? `var old=document.getElementById(${JSON.stringify(elementId)});if(old)old.remove();`
      : "";
    const expr =
      `(function(){try{var el=document.querySelector(${sel});if(!el)return 'err:no target';` +
      `${rm}el.insertAdjacentHTML(${pos},${h});return 'ok';` +
      "}catch(e){return 'err:'+e.message}})()";
    try {
      const res = String((await conn.evaluate(expr, true, this.recvTimeout)) ?? "");
      if (res !== "ok") {
        this.log.warning(`Accessors.insertHtmlOn('${page}'): ${res || "no result"}`);
        return false;
      }
      return true;
    } catch (e) {
      this.log.warning(`Accessors.insertHtmlOn('${page}') failed - ${String(e)}`);
      this.drop(page);
      return false;
    }
  }

  /** Read+clear window.__fuse_open_url__ from the hangar page. */
  async pollOpenUrl(): Promise<string | null> {
    const conn = this.conns.hangar;
    if (!this._connectedHangar || !conn) return null;
    const expr =
      "(function(){var u=window.__fuse_open_url__;if(u){delete window.__fuse_open_url__;return u;}return null;})()";
    try {
      const val = await conn.evaluate(expr, true, this.recvTimeout);
      return val ? String(val) : null;
    } catch (e) {
      this.log.warning(`Accessors.pollOpenUrl: failed - ${String(e)}`);
      this.drop("hangar");
      return null;
    }
  }
}
