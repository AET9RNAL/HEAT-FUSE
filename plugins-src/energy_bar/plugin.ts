import {
  FusePlugin,
  ConfigCategory,
  ConfigEntry,
  type FuseContext,
  type OverlayHandle,
  type Rect,
} from "@fuse/plugin-sdk";

interface Accessors {
  read(name: string): number | string | boolean | unknown[] | null | undefined;
}

const DEFAULT_COLOR_HIGH = "84FFB1";
const DEFAULT_COLOR_MID = "FF9800";
const DEFAULT_COLOR_LOW = "FF3935";

const POS_KEY_TP = "bar_custom_pos";
const POS_KEY_FP = "bar_custom_pos_fp";

function hexToArgb(hexStr: unknown, fallback: number): number {
  try {
    const s = String(hexStr).trim().replace(/^#/, "");
    if (s.length === 6) return (0xff000000 | parseInt(s, 16)) >>> 0;
    if (s.length === 8) return parseInt(s, 16) >>> 0;
  } catch {
    /* ignore */
  }
  return fallback;
}

function num(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export class EnergyBarPlugin extends FusePlugin {
  static override requiresCalibration = true;
  static override calibrationStages = 2;

  private ctx!: FuseContext;
  private acc: Accessors | undefined;
  private ov: OverlayHandle | undefined;

  private colorHigh = 0xff84ffb1;
  private colorMid = 0xffff9800;
  private colorLow = 0xffff3935;
  private strokeWeight = 1.5;
  private rotation = 0.0;
  private curFp: boolean | null = null;

  private energyColor(pct: number): number {
    if (pct > 60) return this.colorHigh;
    if (pct > 30) return this.colorMid;
    return this.colorLow;
  }

  setup(ctx: FuseContext): void {
    this.ctx = ctx;
    this.acc = ctx.services.get<Accessors>("accessors");
    if (!this.acc) ctx.logger.warning("energy_bar: 'accessors' service not available");

    ctx.config
      .defaults({
        bar_custom_pos: null,
        bar_custom_pos_fp: null,
        memory_chain: "multiplayer_vehicle_energy",
        anim_width: 300,
        anim_height: 300,
        color_high: DEFAULT_COLOR_HIGH,
        color_mid: DEFAULT_COLOR_MID,
        color_low: DEFAULT_COLOR_LOW,
        stroke_weight: "1.5",
        rotation: "0.0",
      })
      .load();

    ctx.config.schema([
      new ConfigCategory("Memory Source", [
        new ConfigEntry({
          key: "memory_chain",
          label: "Pointer Chain",
          type: "choice",
          choices: ["multiplayer_vehicle_energy", "training_vehicle_energy"],
          description: "Which source to read energy from",
        }),
      ]),
      new ConfigCategory("Colors", [
        new ConfigEntry({ key: "color_high", label: "High Energy >60% (hex RGB)", type: "str", description: "e.g. 84FFB1" }),
        new ConfigEntry({ key: "color_mid", label: "Mid Energy >30% (hex RGB)", type: "str", description: "e.g. FF9800" }),
        new ConfigEntry({ key: "color_low", label: "Low Energy ≤30% (hex RGB)", type: "str", description: "e.g. FF3935" }),
      ]),
      new ConfigCategory("Style", [
        new ConfigEntry({ key: "stroke_weight", label: "Stroke Weight", type: "float", min: 0.5, max: 3.0, description: "0.5 – 3.0" }),
      ]),
      new ConfigCategory("Animation", [
        new ConfigEntry({ key: "anim_width", label: "Render Width", type: "int", min: 10, max: 3000 }),
        new ConfigEntry({ key: "anim_height", label: "Render Height", type: "int", min: 10, max: 3000 }),
      ]),
      new ConfigCategory("Rotation", [
        new ConfigEntry({ key: "rotation", label: "Rotation (degrees)", type: "float", min: -360.0, max: 360.0 }),
      ]),
      new ConfigCategory("Position", [
        new ConfigEntry({ key: "bar_custom_pos", label: "3rd Person Position", type: "position" }),
        new ConfigEntry({ key: "bar_custom_pos_fp", label: "1st Person Position", type: "position" }),
      ]),
    ]);

    this.colorHigh = hexToArgb(ctx.config.get("color_high"), 0xff84ffb1);
    this.colorMid = hexToArgb(ctx.config.get("color_mid"), 0xffff9800);
    this.colorLow = hexToArgb(ctx.config.get("color_low"), 0xffff3935);
    this.strokeWeight = num(ctx.config.get("stroke_weight"), 1.5);
    this.rotation = num(ctx.config.get("rotation"), 0.0);

    const w = num(ctx.config.get("anim_width"), 300);
    const h = num(ctx.config.get("anim_height"), 300);

    this.ov = ctx.overlays.declare({
      id: "energyBar",
      kind: "rive",
      asset: "rive/energyBar.riv",
      size: { w, h },
      stateMachine: "energyEngine",
      viewModel: "energyBarVM",
      defaultRect: this.savedRect(POS_KEY_TP, w, h),
      positionConfigKey: POS_KEY_TP,
    });

    // Seed initial view-model state (retained for late-joining stage clients).
    this.ov.set("energyValue", 0.5);
    this.ov.setColor("colorProperty", this.energyColor(50));
    this.ov.set("strokeWeight", this.strokeWeight);
    this.ov.set("rotation", this.rotation);
    this.ov.setBool("isSetupComplete", false);
    this.ov.setString("state", "CALIBRATING 3rd PERSON");

    ctx.config.watch("color_high", (v) => (this.colorHigh = hexToArgb(v, 0xff84ffb1)));
    ctx.config.watch("color_mid", (v) => (this.colorMid = hexToArgb(v, 0xffff9800)));
    ctx.config.watch("color_low", (v) => (this.colorLow = hexToArgb(v, 0xffff3935)));
    ctx.config.watch("stroke_weight", (v) => {
      this.strokeWeight = num(v, this.strokeWeight);
      this.ov?.set("strokeWeight", this.strokeWeight);
    });
    ctx.config.watch("rotation", (v) => {
      this.rotation = num(v, this.rotation);
      this.ov?.set("rotation", this.rotation);
    });
  }

  private savedRect(key: string, w: number, h: number): Rect | undefined {
    const saved = this.ctx.config.get<Partial<Rect> | null>(key, null);
    if (saved && typeof saved === "object" && typeof saved.x === "number" && typeof saved.y === "number") {
      return { x: saved.x, y: saved.y, w: saved.w ?? w, h: saved.h ?? h };
    }
    return undefined;
  }

  override enterCalibrate(stage = 1): void {
    if (!this.ov) return;
    const w = num(this.ctx.config.get("anim_width"), 300);
    const h = num(this.ctx.config.get("anim_height"), 300);
    const key = stage === 2 ? POS_KEY_FP : POS_KEY_TP;
    this.ov.setPositionConfigKey(key);
    let rect = this.savedRect(key, w, h);
    if (!rect && stage === 2) rect = this.savedRect(POS_KEY_TP, w, h);
    if (rect) this.ov.setRect(rect); // moves + persists to `key`
    this.curFp = null;
    this.ov.setBool("isSetupComplete", false);
    this.ov.setString("state", stage === 2 ? "CALIBRATING 1st PERSON" : "CALIBRATING 3rd PERSON");
  }

  override enterLocked(): void {
    if (!this.ov) return;
    this.curFp = null; // force updateView() to reposition on the next locked tick
    this.ov.setBool("isSetupComplete", true);
    this.ov.setString("state", "COMPLETE");
  }

  override tick(_dt: number): void {
    this.ctx.config.checkReload();
    if (!this.ov || this.ctx.state !== "locked") return;

    let pct = 0;
    let fpFlag: boolean | null = null;
    if (this.acc) {
      const val = this.acc.read(this.ctx.config.get("memory_chain", "multiplayer_vehicle_energy"));
      if (val != null) pct = Math.max(0, Math.min(100, Math.trunc(Number(val))));
      const fp = this.acc.read("multiplayer_is_fp_view");
      fpFlag = fp == null ? null : Boolean(Number(fp));
    }
    this.updateView(fpFlag);
    this.ov.set("energyValue", pct / 100.0);
    this.ov.setColor("colorProperty", this.energyColor(pct));
    this.ov.set("strokeWeight", this.strokeWeight);
    this.ov.set("rotation", this.rotation);
  }

  /** Dual-view: switch the persisted position key + rect when FP/TP changes. */
  private updateView(fpFlag: boolean | null): void {
    if (fpFlag == null || fpFlag === this.curFp || !this.ov) return;
    this.curFp = fpFlag;
    const key = fpFlag ? POS_KEY_FP : POS_KEY_TP;
    this.ov.setPositionConfigKey(key);
    const w = num(this.ctx.config.get("anim_width"), 300);
    const h = num(this.ctx.config.get("anim_height"), 300);
    const rect = this.savedRect(key, w, h);
    if (rect) this.ov.setRect(rect);
  }

  override setOverlayVisible(visible: boolean): void {
    if (this.ctx.state === "calibrate") return;
    this.ov?.setVisible(visible);
  }

  override teardown(): void {
    this.ov?.remove();
  }
}
