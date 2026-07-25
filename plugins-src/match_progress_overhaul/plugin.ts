import { FusePlugin, ConfigCategory, ConfigEntry, type FuseContext, type OverlayHandle } from "@fuse/plugin-sdk";
import { HUD } from "../_shared/hudSelectors.js";

interface Accessors {
  read(name: string): unknown;
  readonly connected: boolean;
  injectStylesheet(css: string | null, styleId?: string): void;
}

const CONTROL_MODES = new Set(["control"]);
const NATIVE_STYLE_ID = "__fuse_mph__";
const HIDE_NATIVE_CSS =
  `${HUD.BATTLE_TIMER}, ${HUD.SCORE_BARS}, ${HUD.OBJECTIVE_PROGRESS}, [class*="SegmentedScore_scores"] { display: none !important; }`;

export class MatchProgressOverhaulPlugin extends FusePlugin {
  static override requiresCalibration = true;
  static override calibrationStages = 1;

  private ctx!: FuseContext;
  private acc: Accessors | undefined;
  private ov: OverlayHandle | undefined;
  private lastJson = "";
  private lastConnected = false;
  private nativeHidden = false;

  private rd(name: string): unknown {
    return this.acc ? this.acc.read(name) : undefined;
  }
  private num(name: string): number | null {
    const v = this.rd(name);
    return typeof v === "number" ? v : null;
  }

  setup(ctx: FuseContext): void {
    this.ctx = ctx;
    this.acc = ctx.services.get<Accessors>("accessors");

    ctx.config
      .defaults({ vue_overlay_pos: null, vue_width: 1100, vue_height: 75, hide_native: true })
      .load();
    ctx.config.schema([
      new ConfigCategory("Native HUD", [
        new ConfigEntry({
          key: "hide_native",
          label: "Hide Native Timer + Score Bars",
          type: "bool",
          description: "",
        }),
      ]),
      new ConfigCategory("Position", [
        new ConfigEntry({ key: "vue_overlay_pos", label: "Bar Position", type: "position" }),
      ]),
    ]);

    const w = Number(ctx.config.get("vue_width", 1100)) || 1100;
    const h = Number(ctx.config.get("vue_height", 75)) || 75;
    this.ov = ctx.overlays.declare({
      id: "matchProgress",
      kind: "vue",
      asset: "MatchProgressOverhaul.vue",
      size: { w, h },
      positionConfigKey: "vue_overlay_pos",
    });
  }

  override enterCalibrate(_stage = 1): void {
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
    if (!this.acc) return;

    const connected = this.acc.connected;
    if (connected && !this.lastConnected) this.nativeHidden = false;
    this.lastConnected = connected;
    this.applyNativeHide();

    if (this.ctx.state !== "locked" || !connected) return;
    this.pushMatch();
  }

  private applyNativeHide(): void {
    const acc = this.acc;
    if (!acc) return;
    if (!acc.connected) {
      this.nativeHidden = false;
      return;
    }
    const want = Boolean(this.ctx.config.get("hide_native", true));
    if (want === this.nativeHidden) return;
    acc.injectStylesheet(want ? HIDE_NATIVE_CSS : "", NATIVE_STYLE_ID);
    this.nativeHidden = want;
  }

  override teardown(): void {
    this.ov?.remove();
    try {
      if (this.acc?.connected) this.acc.injectStylesheet("", NATIVE_STYLE_ID);
    } catch {
      /* ignore */
    }
  }

  private fmtTime(secs: number | null): string {
    if (secs == null || secs < 0) return "--:--";
    const s = Math.floor(secs);
    const m = Math.floor(s / 60);
    return `${m}:${String(s % 60).padStart(2, "0")}`;
  }

  private frac(score: number | null, desired: number | null): number {
    if (score == null || !desired || desired <= 0) return 0;
    return Math.max(0, Math.min(1, score / desired));
  }

  private pushMatch(): void {
    const battleState = this.num("battle_state");
    const ally = this.num("ally_score");
    const enemy = this.num("enemy_score");
    if (battleState !== 8 || ally == null || enemy == null) {
      this.pushData({ inMatch: false });
      return;
    }

    const mode = String(this.rd("game_mode") ?? "").toLowerCase();
    const isControl = CONTROL_MODES.has(mode) || this.num("obj_active") === 1;

    let allyText: string;
    let enemyText: string;
    let allyFill: number;
    let enemyFill: number;
    let overtime: { progress: number; total: number; frac: number } | null;

    let allyTeamScore: number | null;
    let enemyTeamScore: number | null;

    if (isControl) {
      const oa = this.num("obj_ally_prc") ?? Math.round(ally);
      const oe = this.num("obj_enemy_prc") ?? Math.round(enemy);
      allyText = `${oa}%`;
      enemyText = `${oe}%`;
      allyFill = oa / 100;
      enemyFill = oe / 100;
      overtime =
        this.num("obj_overtime") === 1 ? { progress: 0, total: 0, frac: Math.max(oa, oe) / 100 } : null;
      allyTeamScore = Math.round(ally);
      enemyTeamScore = Math.round(enemy);
    } else {
      const desired = this.num("desired_score");
      allyText = `${Math.round(ally)}`;
      enemyText = `${Math.round(enemy)}`;
      allyFill = this.frac(ally, desired);
      enemyFill = this.frac(enemy, desired);
      const otActive = this.num("overtime_active") === 1;
      const otProg = this.num("overtime_progress");
      const otTotal = this.num("overtime_total");
      overtime = otActive
        ? { progress: otProg ?? 0, total: otTotal ?? 0, frac: this.frac(otProg, otTotal) }
        : null;
      allyTeamScore = null;
      enemyTeamScore = null;
    }

    this.pushData({
      inMatch: true,
      isControl,
      ally: allyText,
      enemy: enemyText,
      allyFill,
      enemyFill,
      allyTeamScore,
      enemyTeamScore,
      time: this.fmtTime(this.num("battle_countdown")),
      leads: this.num("team_leads") ?? 0,
      overtime,
    });
  }

  private pushPlaceholder(): void {
    this.pushData({
      inMatch: true,
      isControl: false,
      ally: "2000",
      enemy: "1900",
      allyFill: 1,
      enemyFill: 0.68,
      allyTeamScore: 1,
      enemyTeamScore: 0,
      time: "15:05",
      leads: 0,
      overtime: { progress: 50, total: 100, frac: 0.5 },
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
