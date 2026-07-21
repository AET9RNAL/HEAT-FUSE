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
}

interface ClassGroup {
  role: string;
  cells: Cell[];
}

const SLUG_SEED: Record<string, string> = {
  "1": "a01_chrysler_xm1_volcano",
  "2": "a13_chrysler_xm1_ares_90",
  "3": "a02_m1e1_120",
  "8": "g11_leopard2k_st",
  "24": "gb01_challenger",
  "34": "a07_hstv_l",
  "39": "a12_alvt",
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
        new ConfigEntry({ key: "layout", label: "Layout", type: "choice", choices: ["scoreboard", "columns"], description: "Horizontal strip (standard) or vertical two-column roster" }),
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
    // Populate with placeholder data so the strip is visible while positioning.
    this.pushPlaceholder();
  }
  override enterLocked(): void {
    this.lastJson = "";
  }
  override setOverlayVisible(visible: boolean): void {
    if (this.ctx.state === "calibrate") return;
    this.ov?.setVisible(visible);
  }

  override tick(_dt: number): void {
    this.ctx.config.checkReload();
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

    const layout = String(this.ctx.config.get("layout", "scoreboard"));
    const mirror = layout !== "columns" && Boolean(this.ctx.config.get("mirror_enemies", true));
    this.pushData({
      inMatch: true,
      layout,
      showNames: Boolean(this.ctx.config.get("show_names", false)),
      allies: this.groupByClass(allies, myName, false),
      enemies: this.groupByClass(enemies, myName, mirror),
    });
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

  private groupByClass(rows: Warrior[], myName: string, reverse: boolean): ClassGroup[] {
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
      };
      const list = byRole.get(w.role) ?? [];
      list.push(cell);
      byRole.set(w.role, list);
    }
    const roles = [...byRole.keys()].sort((a, b) => classRank(a) - classRank(b));
    if (reverse) roles.reverse();
    return roles.map((role) => ({ role, cells: byRole.get(role)! }));
  }

  private pushPlaceholder(): void {
    const mk = (role: string, dead: boolean, self = false): Cell => ({
      tank: null, agent: null, role, dead, respawning: false, health: dead ? 0 : 100,
      name: role, isPlayer: true, hasBomb: false, isSelf: self,
    });
    this.pushData({
      inMatch: true,
      layout: String(this.ctx.config.get("layout", "scoreboard")),
      showNames: Boolean(this.ctx.config.get("show_names", false)),
      allies: [
        { role: "marksman", cells: [mk("marksman", false, true), mk("marksman", false)] },
        { role: "assault", cells: [mk("assault", false)] },
        { role: "defender", cells: [mk("defender", false), mk("defender", true)] },
      ],
      enemies: [
        { role: "defender", cells: [mk("defender", false), mk("defender", true)] },
        { role: "assault", cells: [mk("assault", false), mk("assault", false)] },
        { role: "marksman", cells: [mk("marksman", true)] },
      ],
    });
  }

  private pushData(payload: Record<string, unknown>): void {
    if (!this.ov) return;
    const json = JSON.stringify(payload);
    if (json === this.lastJson) return;
    this.lastJson = json;
    this.ov.setJson("board", payload);
  }
}
