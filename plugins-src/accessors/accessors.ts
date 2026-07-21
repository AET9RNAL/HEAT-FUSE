import { HUD, HANGAR } from "../_shared/hudSelectors.js";

export { HUD, HANGAR };

type CacheValue = number | string | boolean | unknown[] | null;

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
  "player_kills", "player_assists", "player_damage", "player_role_pts",
  "player_is_dead", "player_role", "player_vehicle", "player_agent_id", "player_name",
  "on_fire", "debuff_count", "debuff_tags", "buff_count", "buff_tags",
  "major_effect_count",
  "missile_dist", "missile_in_flight",
  "sb_open", "sb_map_name", "sb_game_mode_name",
  "sb_ally_rows", "sb_enemy_rows",
  "sb_warriors", "sb_my_team", "sb_vehicle_slugs",
  "sb_player_deaths", "sb_player_confirms", "sb_player_denies",
  "pm_available", "pm_game_mode", "pm_map_slug", "pm_started_at", "pm_finished_at",
  "pm_my_player_id", "pm_my_team", "pm_team_scores", "pm_players",
  "_dbg_phm", "_dbg_mam",
];

type Logger = { debug(m: string): void; info(m: string): void; warning(m: string): void };

type PageName = "battle_hud" | "markers" | "battle_app" | "hangar";
const PAGE_MATCH: ReadonlyArray<[PageName, string]> = [
  ["battle_hud", "battle_hud"],
  ["markers", "markers"],
  ["battle_app", "battle_app"],
  ["hangar", "meta/index.html"],
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

export class Accessors {
  private port: number;
  private connectTimeout: number;
  private recvTimeout: number;
  private log: Logger;

  private conns: Record<PageName, CdpConn | null> = {
    battle_hud: null,
    markers: null,
    battle_app: null,
    hangar: null,
  };
  private _connected = false;
  private _connectedHangar = false;
  private cache = new Map<string, CacheValue>();

  private jsReadAll: string;
  private jsReadMarkers: string;
  private jsReadBattleApp: string;

  constructor(opts: {
    port?: number;
    connectTimeout?: number;
    recvTimeout?: number;
    logger: Logger;
    scripts: { readAll: string; readMarkers: string; readBattleApp: string };
  }) {
    this.port = opts.port ?? 9222;
    this.connectTimeout = (opts.connectTimeout ?? 8.0) * 1000;
    this.recvTimeout = (opts.recvTimeout ?? 0.5) * 1000;
    this.log = opts.logger;
    this.jsReadAll = opts.scripts.readAll;
    this.jsReadMarkers = opts.scripts.readMarkers;
    this.jsReadBattleApp = opts.scripts.readBattleApp;
  }

  get connected(): boolean {
    return this._connected;
  }
  get connectedHangar(): boolean {
    return this._connectedHangar;
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
      return false;
    }
    const changed: string[] = [];
    for (const name of ["battle_hud", "markers", "battle_app", "hangar"] as PageName[]) {
      const wantUrl = targets[name];
      const conn = this.conns[name];
      if (wantUrl && (conn === null || conn.dead || conn.url !== wantUrl)) {
        if (conn) conn.close();
        const fresh = await CdpConn.connect(wantUrl, this.connectTimeout);
        if (fresh) {
          this.conns[name] = fresh;
          changed.push(`+${name}`);
        } else if (conn) {
          this.conns[name] = null;
        }
      } else if (!wantUrl && conn !== null) {
        conn.close();
        this.conns[name] = null;
        changed.push(`-${name}`);
      }
    }
    this._connected = this.conns.battle_hud !== null;
    this._connectedHangar = this.conns.hangar !== null;
    if (changed.length) this.log.info(`Accessors: CDP connections updated [${changed.join(" ")}]`);
    return this._connected || this._connectedHangar;
  }

  close(): void {
    for (const name of Object.keys(this.conns) as PageName[]) {
      this.conns[name]?.close();
      this.conns[name] = null;
    }
    this._connected = false;
    this._connectedHangar = false;
    this.cache.clear();
  }

  private drop(name: PageName): void {
    this.conns[name]?.close();
    this.conns[name] = null;
    if (name === "battle_hud") this._connected = false;
    if (name === "hangar") this._connectedHangar = false;
  }

  /** Poll battle_hud, markers, and battle_app. Returns false on primary failure. */
  async refresh(): Promise<boolean> {
    const hud = this.conns.battle_hud;
    if (!this._connected || !hud) return false;

    const evalPage = async (conn: CdpConn, expr: string): Promise<Record<string, unknown> | null> => {
      const raw = await conn.evaluate(expr, true, this.recvTimeout);
      return raw ? (JSON.parse(String(raw)) as Record<string, unknown>) : null;
    };

    let data: Record<string, unknown> | null;
    try {
      data = await evalPage(hud, this.jsReadAll);
    } catch (e) {
      this.log.warning(`Accessors: battle_hud eval failed - ${String(e)}`);
      this.drop("battle_hud");
      this.cache.clear();
      return false;
    }
    if (data) {
      if (data._err) this.log.warning(`Accessors: JS error (hud): ${String(data._err)}`);
      this.updateCache(data);
    }

    const markers = this.conns.markers;
    if (markers) {
      try {
        const md = await evalPage(markers, this.jsReadMarkers);
        if (md) {
          if (md._err) this.log.warning(`Accessors: JS error (markers): ${String(md._err)}`);
          this.updateCache(md);
        }
      } catch (e) {
        this.log.warning(`Accessors: markers eval failed - ${String(e)}`);
        this.drop("markers");
      }
    }

    const battleApp = this.conns.battle_app;
    if (battleApp) {
      try {
        const ad = await evalPage(battleApp, this.jsReadBattleApp);
        if (ad) {
          if (ad._err) this.log.warning(`Accessors: JS error (battle_app): ${String(ad._err)}`);
          this.updateCache(ad);
          this.matchLocalRow((ad.sb_ally_rows as Array<Record<string, unknown>>) ?? []);
        }
      } catch (e) {
        this.log.warning(`Accessors: battle_app eval failed - ${String(e)}`);
        this.drop("battle_app");
      }
    }
    return true;
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
    for (const key of EXTRA_KEYS) {
      const val = data[key];
      if (val != null) this.cache.set(key, val as CacheValue);
    }
  }

  /** Return the last-cached value for `name`, or null. */
  read(name: string): CacheValue | undefined {
    return this.cache.get(name);
  }

  // --- Setters / style injection (fire-and-forget) ------------------------

  private async exec(name: PageName, expr: string): Promise<void> {
    const conn = this.conns[name];
    const okFlag = name === "hangar" ? this._connectedHangar : this._connected;
    if (!conn || (name === "battle_hud" && !okFlag)) return;
    try {
      await conn.evaluate(expr, false, this.recvTimeout);
    } catch (e) {
      this.log.warning(`Accessors.exec(${name}): send failed - ${String(e)}`);
      this.drop(name);
    }
  }

  private static styleExpr(styleId: string, css: string | null): string {
    const sid = styleId.replace(/'/g, "\\'");
    if (css === null) {
      return `(function(){var el=document.getElementById('${sid}');if(el)el.remove();})();null`;
    }
    const safe = css.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");
    return (
      "(function(){" +
      `var el=document.getElementById('${sid}');` +
      `if(!el){el=document.createElement('style');el.id='${sid}';document.head.appendChild(el);}` +
      "el.textContent=`" + safe + "`;" +
      "})();null"
    );
  }

  injectStylesheet(css: string | null, styleId = "__fuse__"): Promise<void> {
    return this.exec("battle_hud", Accessors.styleExpr(styleId, css));
  }
  injectStylesheetMarkers(css: string | null, styleId = "__fuse__"): Promise<void> {
    return this.exec("markers", Accessors.styleExpr(styleId, css));
  }
  injectStylesheetHangar(css: string | null, styleId = "__fuse__"): Promise<void> {
    return this.exec("hangar", Accessors.styleExpr(styleId, css));
  }

  private setStyleOn(
    page: PageName,
    selector: string,
    prop: string,
    value: string,
    allMatching: boolean,
    important: boolean,
  ): Promise<void> {
    const prio = important ? "'important'" : "''";
    const sel = JSON.stringify(selector);
    const p = JSON.stringify(prop);
    const v = JSON.stringify(value);
    const expr = allMatching
      ? `Array.from(document.querySelectorAll(${sel})).forEach(function(el){el.style.setProperty(${p},${v},${prio})});null`
      : `var el=document.querySelector(${sel});if(el)el.style.setProperty(${p},${v},${prio});null`;
    return this.exec(page, expr);
  }

  setStyle(selector: string, prop: string, value: string, opts: { allMatching?: boolean; important?: boolean } = {}): Promise<void> {
    return this.setStyleOn("battle_hud", selector, prop, value, !!opts.allMatching, !!opts.important);
  }
  setStyleHangar(selector: string, prop: string, value: string, opts: { allMatching?: boolean; important?: boolean } = {}): Promise<void> {
    return this.setStyleOn("hangar", selector, prop, value, !!opts.allMatching, !!opts.important);
  }

  private setStylesOn(page: PageName, selector: string, styles: Record<string, string>, allMatching: boolean, important: boolean): Promise<void> {
    const prio = important ? "'important'" : "''";
    const sel = JSON.stringify(selector);
    const assignments = Object.entries(styles)
      .map(([k, v]) => `el.style.setProperty(${JSON.stringify(k)},${JSON.stringify(v)},${prio})`)
      .join(";");
    const expr = allMatching
      ? `Array.from(document.querySelectorAll(${sel})).forEach(function(el){${assignments}});null`
      : `var el=document.querySelector(${sel});if(el){${assignments}};null`;
    return this.exec(page, expr);
  }

  setStyles(selector: string, styles: Record<string, string>, opts: { allMatching?: boolean; important?: boolean } = {}): Promise<void> {
    return this.setStylesOn("battle_hud", selector, styles, !!opts.allMatching, !!opts.important);
  }
  setStylesHangar(selector: string, styles: Record<string, string>, opts: { allMatching?: boolean; important?: boolean } = {}): Promise<void> {
    return this.setStylesOn("hangar", selector, styles, !!opts.allMatching, !!opts.important);
  }

  private resetStyleOn(page: PageName, selector: string, prop: string | null, allMatching: boolean): Promise<void> {
    const sel = JSON.stringify(selector);
    let expr: string;
    if (prop !== null) {
      const p = JSON.stringify(prop);
      expr = allMatching
        ? `Array.from(document.querySelectorAll(${sel})).forEach(function(el){el.style.removeProperty(${p})});null`
        : `var el=document.querySelector(${sel});if(el)el.style.removeProperty(${p});null`;
    } else {
      expr = allMatching
        ? `Array.from(document.querySelectorAll(${sel})).forEach(function(el){el.style.cssText=''});null`
        : `var el=document.querySelector(${sel});if(el)el.style.cssText='';null`;
    }
    return this.exec(page, expr);
  }

  resetStyle(selector: string, prop: string | null = null, opts: { allMatching?: boolean } = {}): Promise<void> {
    return this.resetStyleOn("battle_hud", selector, prop, !!opts.allMatching);
  }
  resetStyleHangar(selector: string, prop: string | null = null, opts: { allMatching?: boolean } = {}): Promise<void> {
    return this.resetStyleOn("hangar", selector, prop, !!opts.allMatching);
  }

  // Convenience wrappers ---------------------------------------------------

  hide(selector: string, opts: { allMatching?: boolean } = {}): Promise<void> {
    return this.setStyle(selector, "visibility", "hidden", { allMatching: opts.allMatching, important: true });
  }
  show(selector: string, opts: { allMatching?: boolean } = {}): Promise<void> {
    return this.resetStyle(selector, "visibility", opts);
  }
  hideHangar(selector: string, opts: { allMatching?: boolean } = {}): Promise<void> {
    return this.setStyleHangar(selector, "visibility", "hidden", { allMatching: opts.allMatching, important: true });
  }
  showHangar(selector: string, opts: { allMatching?: boolean } = {}): Promise<void> {
    return this.resetStyleHangar(selector, "visibility", opts);
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
