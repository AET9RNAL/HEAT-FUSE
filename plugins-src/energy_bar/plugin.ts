import {
  FusePlugin,
  type FuseContext,
  type InspectorSection,
  type OverlayHandle,
  type Rect,
} from "@fuse/plugin-sdk";

/** The stage can't resize Rive overlays; `anim_width` / `anim_height` size the canvas instead, live. */
function renderSizeSection(idPrefix: string): InspectorSection {
  return {
    id: `${idPrefix}.size`,
    label: "Size",
    order: 90,
    controls: [
      {
        type: "vec2",
        id: "render_size",
        keys: ["anim_width", "anim_height"],
        labels: ["W", "H"],
        label: "Render size",
        min: 10,
        max: 3000,
        step: 10,
        tooltip: "Canvas size. Rive overlays can't be resized on the stage, so this is how to scale them.",
      },
    ],
  };
}

interface Accessors {
  read(name: string): number | string | boolean | unknown[] | null | undefined;
}

const DEFAULT_COLOR_HIGH = "#84FFB1FF";
const DEFAULT_COLOR_MID = "#FF9800FF";
const DEFAULT_COLOR_LOW = "#FF3935FF";
/** The defaults plus brand colours, offered in the pickers. */
const COLOR_SWATCHES = [DEFAULT_COLOR_HIGH, DEFAULT_COLOR_MID, DEFAULT_COLOR_LOW, "#F2F2F2FF", "#7ABFDFFF", "#FFF87AFF"];

const POS_KEY_TP = "bar_custom_pos";
const POS_KEY_FP = "bar_custom_pos_fp";

function hexToArgb(hexStr: unknown, fallback: number): number {
  try {
    const s = String(hexStr).trim().replace(/^#/, "");
    if (s.length === 6) return (0xff000000 | parseInt(s, 16)) >>> 0;
    // Config colours are #RRGGBBAA; Rive wants ARGB.
    if (s.length === 8) return ((parseInt(s.slice(6, 8), 16) << 24) | parseInt(s.slice(0, 6), 16)) >>> 0;
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

  private sections(): InspectorSection[] {
    return [
      {
        id: "eb.colors",
        label: "Colors",
        description: "Bar colour by how much energy is left.",
        order: 11,
        controls: [
          {
            type: "color",
            id: "color_high",
            key: "color_high",
            label: "High",
            alpha: false,
            swatches: COLOR_SWATCHES,
            tooltip: "Above 60% energy.",
          },
          {
            type: "color",
            id: "color_mid",
            key: "color_mid",
            label: "Mid",
            alpha: false,
            swatches: COLOR_SWATCHES,
            tooltip: "Above 30% energy.",
          },
          {
            type: "color",
            id: "color_low",
            key: "color_low",
            label: "Low",
            alpha: false,
            swatches: COLOR_SWATCHES,
            tooltip: "30% energy and below.",
          },
        ],
      },
      {
        id: "eb.style",
        label: "Style",
        order: 12,
        controls: [
          {
            type: "slider",
            id: "stroke_weight",
            key: "stroke_weight",
            label: "Stroke",
            min: 0.5,
            max: 3,
            step: 0.1,
            default: 1.5,
            tooltip: "Outline weight. Double-click to reset.",
          },
          {
            type: "slider",
            id: "rotation",
            key: "rotation",
            label: "Rotation",
            min: -360,
            max: 360,
            step: 1,
            unit: "°",
            default: 0,
            bipolar: true,
            tooltip: "Double-click to reset.",
          },
        ],
      },
      renderSizeSection("eb"),
    ];
  }

  setup(ctx: FuseContext): void {
    this.ctx = ctx;
    this.acc = ctx.services.get<Accessors>("accessors");
    if (!this.acc) ctx.logger.warning("energy_bar: 'accessors' service not available");

    ctx.config
      .defaults({
        bar_custom_pos: null,
        bar_custom_pos_fp: null,
        anim_width: 300,
        anim_height: 300,
        color_high: DEFAULT_COLOR_HIGH,
        color_mid: DEFAULT_COLOR_MID,
        color_low: DEFAULT_COLOR_LOW,
        stroke_weight: 1.5,
        rotation: 0,
      })
      .load();

    // Older saves kept colours as bare hex ("84FFB1") and numbers as strings ("1.5");
    // the pickers and sliders work in #RRGGBBAA and real numbers.
    for (const key of ["color_high", "color_mid", "color_low"]) {
      const v = ctx.config.get<unknown>(key, "");
      if (typeof v === "string" && /^[0-9a-f]{6}$/i.test(v.trim())) ctx.config.set(key, `#${v.trim().toUpperCase()}FF`);
    }
    for (const key of ["stroke_weight", "rotation"]) {
      const v = ctx.config.get<unknown>(key, null);
      if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) ctx.config.set(key, Number(v));
    }

    // One declaration for both surfaces: the App panel and the stage inspector.
    const sections = this.sections();
    ctx.config.schema(sections);

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
    this.ov.inspector.sections(sections);

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
    const applySize = (): void =>
      this.ov?.setSize({ w: num(ctx.config.get("anim_width"), 300), h: num(ctx.config.get("anim_height"), 300) });
    ctx.config.watch("anim_width", applySize);
    ctx.config.watch("anim_height", applySize);
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
      const val = this.acc.read("multiplayer_vehicle_energy");
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
