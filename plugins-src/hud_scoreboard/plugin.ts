import fs from "node:fs";
import { FusePlugin, ConfigCategory, ConfigEntry, type FuseContext, type OverlayHandle } from "@fuse/plugin-sdk";

interface Accessors {
  read(name: string): unknown;
  readonly connected: boolean;
}

/** One player's slim record as emitted by read_all.js `sb_warriors`. */
interface Warrior {
  name: string;
  team: number | null;
  role: string;
  vehicle_id: number | null;
  vehicle_disp: string | null;
  agent_icon: string | null;
  agent: string | null;
  is_dead: number;
  health_pct: number | null;
  respawning: number;
  has_bomb: number;
  place: number | null;
  is_bot: number;
  is_player: number;
  level: number | null;
  platoon_number: number;
  platoon_mate: number;
}

/** One scoreboard row as scraped by read_battle_app.js (`sb_ally_rows`). */
interface ScoreRow {
  name: string;
  score: number;
  damage: number;
  deaths: number;
  kcd: string;
}

interface Cell {
  tank: string | null;
  agent: string | null;
  role: string;
  dead: boolean;
  respawning: boolean;
  health: number | null;
  name: string;
  isPlayer: boolean;
  hasBomb: boolean;
  isSelf: boolean;
  /** Squad group ID within the team; 0 = solo (no squad). */
  squad: number;
  /** Top scorer on this cell's team. */
  leader: boolean;
}

interface ClassGroup {
  role: string;
  cells: Cell[];
}

/** Calibration-only cell: real Cell plus the state the fake battle drives. */
interface SimCell extends Cell {
  ally: boolean;
  hpTarget: number;
  respawnIn: number;
  score: number;
}

const SLUG_SEED: Record<string, string> = {
  "1": "a01_chrysler_xm1_volcano",
  "2": "a13_chrysler_xm1_ares_90",
  "3": "a02_m1e1_120",
  "8": "g11_leopard2k_st",
  "24": "gb01_challenger",
  "34": "a07_hstv_l",
  "39": "a12_alvt",
  "41": "r01_t_62a",
  "42": "g01_leopard_1_a6_120",
  "53": "a08_m3_bradley",
  "97": "a05_m551a1_sheridan",
  "100": "g07_marder1a3",
  "101": "a20_m60a2",
};

// Fallback resolver
const DISPLAY_SLUGS: Record<string, string> = {
  "M1E1": "a02_m1e1_120",
  "XM1V": "a01_chrysler_xm1_volcano",
  "XM1 90": "a13_chrysler_xm1_ares_90",
  "ALVT": "a12_alvt",
  "M60A1": "a14_m60a1",
  "M60A2": "a20_m60a2",
  "Leo 1A6A1": "g01_leopard_1_a6_120",
  "LEO 2KST": "g11_leopard2k_st",
  "LEO 2FK": "g06_leopard2fk_atgm",
  "AMX10 RC": "f05_amx_10_rc",
  "Obj. 287": "r08_object_287",
  "FV4030 X": "gb01_challenger",
  "HSTV-L": "a07_hstv_l",
  "M551A1": "a05_m551a1_sheridan",
  "M3E1": "a08_m3_bradley",
  "Marder 1A3": "g07_marder1a3",
};

const SIM_NAMES = [
  "VOLKOV", "HARLAN", "KESTREL", "DRAGO", "NOVAK",
  "RIVERA", "OKONKWO", "SVEN", "TAKEDA", "MERCER",
];
/** Ally / enemy role rosters for the calibration battle. */
const SIM_ROLES = ["marksman", "marksman", "assault", "defender", "defender"];

// Leader = top `score` 
const LEAD_MIN = 1;
const LEAD_REL = 0.05;
const LEAD_ABS = 25;

const CLASS_ORDER = ["marksman", "assault", "defender"];
const classRank = (role: string): number => {
  const i = CLASS_ORDER.indexOf(role);
  return i === -1 ? CLASS_ORDER.length : i;
};

export class HudScoreboardPlugin extends FusePlugin {
  static override requiresCalibration = true;
  static override calibrationStages = 1;

  private ctx!: FuseContext;
  private acc: Accessors | undefined;
  private ov: OverlayHandle | undefined;
  private lastJson = "";
  private slugMap: Record<string, string> = {};
  private knownTanks = new Set<string>();
  private knownAgents = new Set<string>();
  private sim: SimCell[] = [];
  private simEventIn = 0;
  private allyLeader: string | null = null;
  private enemyLeader: string | null = null;

  private rd(name: string): unknown {
    return this.acc ? this.acc.read(name) : undefined;
  }

  private readAssetBasenames(sub: string): Set<string> {
    try {
      const dir = this.ctx.assets.resolve(sub);
      const names = fs
        .readdirSync(dir)
        .filter((f) => f.toLowerCase().endsWith(".png"))
        .map((f) => f.slice(0, -4));
      return new Set(names);
    } catch {
      return new Set();
    }
  }

  setup(ctx: FuseContext): void {
    this.ctx = ctx;
    this.acc = ctx.services.get<Accessors>("accessors");

    ctx.config
      .defaults({
        vue_overlay_pos: null,
        vue_width: 1500,
        vue_height: 50,
        mirror_enemies: true,
        show_names: false,
        layout: "scoreboard",
        vehicle_slugs: {},
      })
      .load();

    const saved = ctx.config.get<Record<string, string>>("vehicle_slugs", {});
    this.slugMap = { ...SLUG_SEED, ...(saved && typeof saved === "object" ? saved : {}) };

    this.knownTanks = this.readAssetBasenames("tanks");
    this.knownAgents = this.readAssetBasenames("agents");

    ctx.config.schema([
      new ConfigCategory("Layout", [
        new ConfigEntry({ key: "layout", label: "Layout", type: "choice", choices: ["scoreboard", "columns", "simplified"], description: "Horizontal strip (standard), vertical two-column roster, or class icons only with HP as fill" }),
        new ConfigEntry({ key: "mirror_enemies", label: "Mirror Enemy Side", type: "bool", description: "Reverse the enemy cluster so classes read outward-in, matching the game strip" }),
        new ConfigEntry({ key: "show_names", label: "Show Player Names", type: "bool" }),
      ]),
      new ConfigCategory("Position", [
        new ConfigEntry({ key: "vue_overlay_pos", label: "Scoreboard Position", type: "position" }),
      ]),
    ]);

    const w = Number(ctx.config.get("vue_width", 1500)) || 1500;
    const h = Number(ctx.config.get("vue_height", 50)) || 50;
    this.ov = ctx.overlays.declare({
      id: "hudScoreboard",
      kind: "vue",
      asset: "HudScoreboard.vue",
      size: { w, h },
      positionConfigKey: "vue_overlay_pos",
    });
  }

  override enterCalibrate(_stage = 1): void {
    // Fake battle so the strip is populated and lively while positioning.
    this.initSim();
  }
  override enterLocked(): void {
    this.sim = [];
    this.allyLeader = null;
    this.enemyLeader = null;
    this.lastJson = "";
  }
  override setOverlayVisible(visible: boolean): void {
    if (this.ctx.state === "calibrate") return;
    this.ov?.setVisible(visible);
  }

  override tick(dt: number): void {
    this.ctx.config.checkReload();
    if (this.ctx.state === "calibrate") {
      this.pushSimFrame(dt);
      return;
    }
    if (this.ctx.state !== "locked") return;
    // Not in a battle (e.g. hangar - battle_hud not connected): hide the board so
    // the calibration placeholder doesn't linger until the first match runs.
    if (!this.acc || !this.acc.connected) {
      this.pushData({ inMatch: false, allies: [], enemies: [] });
      return;
    }
    this.harvestSlugs();
    this.pushRoster();
  }

  private harvestSlugs(): void {
    const fresh = this.rd("sb_vehicle_slugs") as Record<string, string> | undefined;
    if (!fresh || typeof fresh !== "object") return;
    let changed = false;
    for (const [id, slug] of Object.entries(fresh)) {
      if (slug && this.slugMap[id] !== slug) {
        this.slugMap[id] = slug;
        changed = true;
      }
    }
    if (changed) this.ctx.config.set("vehicle_slugs", { ...this.slugMap });
  }

  override teardown(): void {
    this.ov?.remove();
  }

  private pushRoster(): void {
    const warriors = this.rd("sb_warriors") as Warrior[] | undefined;
    if (!Array.isArray(warriors) || warriors.length === 0) {
      this.pushData({ inMatch: false, allies: [], enemies: [] });
      return;
    }

    const myTeam = this.resolveMyTeam(warriors);
    if (myTeam === null) {
      this.pushData({ inMatch: false, allies: [], enemies: [] });
      return;
    }
    const myName = String(this.rd("player_name") ?? "");

    const allies = warriors.filter((w) => w.team === myTeam);
    const enemies = warriors.filter((w) => w.team !== myTeam);

    this.allyLeader = this.resolveLeader(this.rd("sb_ally_rows"), this.allyLeader);
    this.enemyLeader = this.resolveLeader(this.rd("sb_enemy_rows"), this.enemyLeader);

    const layout = String(this.ctx.config.get("layout", "scoreboard"));
    const mirror = layout !== "columns" && Boolean(this.ctx.config.get("mirror_enemies", true));
    this.pushData({
      inMatch: true,
      layout,
      showNames: Boolean(this.ctx.config.get("show_names", false)),
      allies: this.groupByClass(allies, myName, false, this.allyLeader),
      enemies: this.groupByClass(enemies, myName, mirror, this.enemyLeader),
    });
  }

  /**
   * Top scorer for one team. Returns `current` unchanged while the challenger is
   * within the margin, so the crown holds instead of flipping every damage tick.
   */
  private resolveLeader(rows: unknown, current: string | null): string | null {
    if (!Array.isArray(rows) || rows.length === 0) return current;
    const list = rows as ScoreRow[];
    let top: ScoreRow | undefined;
    for (const r of list) if (!top || r.score > top.score) top = r;
    if (!top || top.score < LEAD_MIN) return null;
    const held = current ? list.find((r) => r.name === current) : undefined;
    if (!held) return top.name;
    if (top.name === held.name) return held.name;
    return top.score >= held.score + Math.max(LEAD_ABS, held.score * LEAD_REL) ? top.name : held.name;
  }

  private resolveMyTeam(warriors: Warrior[]): number | null {
    const mt = this.rd("sb_my_team");
    if (typeof mt === "number") return mt;
    const myName = this.rd("player_name");
    if (typeof myName === "string" && myName) {
      const me = warriors.find((w) => w.name === myName);
      if (me && me.team !== null) return me.team;
    }
    return null;
  }

  private squadOf(w: Warrior): number {
    return w.platoon_number > 0 ? w.platoon_number : 0;
  }

  private groupByClass(rows: Warrior[], myName: string, reverse: boolean, leader: string | null): ClassGroup[] {
    const byRole = new Map<string, Cell[]>();
    const sorted = [...rows].sort(
      (a, b) => classRank(a.role) - classRank(b.role) || (a.place ?? 99) - (b.place ?? 99),
    );
    for (const w of sorted) {
      const slug =
        (w.vehicle_id != null ? this.slugMap[String(w.vehicle_id)] : undefined) ??
        (w.vehicle_disp ? DISPLAY_SLUGS[w.vehicle_disp] : undefined);
      const cell: Cell = {
        tank: slug && this.knownTanks.has(slug) ? slug : null,
        agent: w.agent_icon && this.knownAgents.has(w.agent_icon) ? w.agent_icon : null,
        role: w.role,
        dead: w.is_dead === 1,
        respawning: w.respawning === 1,
        health: w.health_pct,
        name: w.name,
        isPlayer: w.is_player === 1,
        hasBomb: w.has_bomb === 1,
        isSelf: !!myName && w.name === myName,
        squad: this.squadOf(w),
        leader: !!leader && w.name === leader,
      };
      const list = byRole.get(w.role) ?? [];
      list.push(cell);
      byRole.set(w.role, list);
    }
    const roles = [...byRole.keys()].sort((a, b) => classRank(a) - classRank(b));
    if (reverse) roles.reverse();
    return roles.map((role) => ({ role, cells: byRole.get(role)! }));
  }

  private pick<T>(pool: T[], not?: T): T | undefined {
    const list = not === undefined ? pool : pool.filter((v) => v !== not);
    return list.length ? list[Math.floor(Math.random() * list.length)] : undefined;
  }

  /** Seed the calibration roster: random art per cell so the strip reads as a real board. */
  private initSim(): void {
    const tanks = [...this.knownTanks];
    const agents = [...this.knownAgents];
    let n = 0;
    const mk = (role: string, ally: boolean, self: boolean, squad: number): SimCell => ({
      tank: this.pick(tanks) ?? null,
      agent: this.pick(agents) ?? null,
      role,
      dead: false,
      respawning: false,
      health: 100,
      name: SIM_NAMES[n % SIM_NAMES.length] ?? role,
      isPlayer: true,
      hasBomb: false,
      isSelf: self,
      squad,
      leader: false,
      ally,
      hpTarget: 100,
      respawnIn: 0,
      score: 0,
    });
    this.sim = [];
    for (const role of SIM_ROLES) {
      this.sim.push(mk(role, true, n === 0, n < 2 ? 1 : 0));
      n++;
    }
    for (const role of SIM_ROLES) {
      this.sim.push(mk(role, false, false, n === 6 || n === 7 ? 2 : 0));
      n++;
    }
    this.simEventIn = 1;
    this.allyLeader = null;
    this.enemyLeader = null;
  }

  /**
   Fake sim
   */
  private pushSimFrame(dt: number): void {
    if (!this.sim.length) this.initSim();
    const tanks = [...this.knownTanks];

    for (const c of this.sim) {
      if (c.dead) {
        c.respawnIn -= dt;
        if (c.respawnIn <= 0) {
          c.dead = false;
          c.respawning = false;
          c.tank = this.pick(tanks, c.tank ?? undefined) ?? c.tank;
          c.health = 100;
          c.hpTarget = 100;
        } else {
          c.respawning = c.respawnIn < 1.5;
        }
        continue;
      }
      const hp = c.health ?? 100;
      const delta = c.hpTarget - hp;
      if (Math.abs(delta) > 0.5) c.health = hp + Math.sign(delta) * Math.min(Math.abs(delta), 70 * dt);
      else c.health = c.hpTarget;
    }

    this.simEventIn -= dt;
    if (this.simEventIn <= 0) {
      this.simEventIn = 0.5 + Math.random() * 1.1;
      const hits = 1 + (Math.random() < 0.4 ? 1 : 0);
      for (let i = 0; i < hits; i++) {
        const c = this.pick(this.sim.filter((s) => !s.dead));
        if (!c) break;
        const roll = Math.random();
        const hp = c.health ?? 100;
        if (roll < 0.3 || hp <= 22) {
          c.dead = true;
          c.health = 0;
          c.hpTarget = 0;
          c.respawnIn = 3 + Math.random() * 2.5;
          // Whoever landed the kill: credit a random teammate of the victim's foe.
          const killer = this.pick(this.sim.filter((s) => s.ally !== c.ally && !s.dead));
          if (killer) killer.score += 100 + Math.floor(Math.random() * 60);
        } else if (roll < 0.88) {
          c.hpTarget = Math.max(4, hp - (28 + Math.random() * 45));
          const dealer = this.pick(this.sim.filter((s) => s.ally !== c.ally && !s.dead));
          if (dealer) dealer.score += 15 + Math.floor(Math.random() * 40);
        } else {
          c.hpTarget = Math.min(100, hp + (12 + Math.random() * 28));
          c.score += 10 + Math.floor(Math.random() * 20);
        }
      }
    }

    const allies = this.sim.filter((c) => c.ally);
    const enemies = this.sim.filter((c) => !c.ally);
    const asRows = (cells: SimCell[]): ScoreRow[] =>
      cells.map((c) => ({ name: c.name, score: c.score, damage: 0, deaths: 0, kcd: "" }));
    this.allyLeader = this.resolveLeader(asRows(allies), this.allyLeader);
    this.enemyLeader = this.resolveLeader(asRows(enemies), this.enemyLeader);

    const layout = String(this.ctx.config.get("layout", "scoreboard"));
    const mirror = layout !== "columns" && Boolean(this.ctx.config.get("mirror_enemies", true));
    this.pushData({
      inMatch: true,
      layout,
      showNames: Boolean(this.ctx.config.get("show_names", false)),
      allies: this.groupSim(allies, false, this.allyLeader),
      enemies: this.groupSim(enemies, mirror, this.enemyLeader),
    });
  }

  private groupSim(cells: SimCell[], reverse: boolean, leader: string | null): ClassGroup[] {
    const byRole = new Map<string, Cell[]>();
    for (const c of cells) {
      const { ally: _a, hpTarget: _h, respawnIn: _r, score: _s, ...cell } = c;
      const list = byRole.get(c.role) ?? [];
      list.push({
        ...cell,
        health: cell.health == null ? null : Math.round(cell.health),
        leader: !!leader && cell.name === leader,
      });
      byRole.set(c.role, list);
    }
    const roles = [...byRole.keys()].sort((a, b) => classRank(a) - classRank(b));
    if (reverse) roles.reverse();
    return roles.map((role) => ({ role, cells: byRole.get(role)! }));
  }

  private pushData(payload: Record<string, unknown>): void {
    if (!this.ov) return;
    const json = JSON.stringify(payload);
    if (json === this.lastJson) return;
    this.lastJson = json;
    this.ov.setJson("board", payload);
  }
}
