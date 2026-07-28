import {
  FusePlugin,
  ConfigCategory,
  ConfigEntry,
  type FuseContext,
  type OverlayHandle,
  type Rect,
} from "@fuse/plugin-sdk";


const POS_KEY = "rive_pos";

function num(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export class RiveDevPlugin extends FusePlugin {
  static override requiresCalibration = true;
  static override calibrationStages = 1;

  private ctx!: FuseContext;
  private ov: OverlayHandle | undefined;

  setup(ctx: FuseContext): void {
    this.ctx = ctx;

    ctx.config
      .defaults({ rive_pos: null, anim_width: 400, anim_height: 400 })
      .load();

    ctx.config.schema([
      new ConfigCategory("Animation", [
        new ConfigEntry({ key: "anim_width", label: "Render Width", type: "int", min: 10, max: 3000 }),
        new ConfigEntry({ key: "anim_height", label: "Render Height", type: "int", min: 10, max: 3000 }),
      ]),
      new ConfigCategory("Position", [
        new ConfigEntry({ key: "rive_pos", label: "Overlay Position", type: "position" }),
      ]),
    ]);

    const w = num(ctx.config.get("anim_width"), 400);
    const h = num(ctx.config.get("anim_height"), 400);

    this.ov = ctx.overlays.declare({
      id: "riveDev",
      kind: "rive",
      asset: "radialhud.riv",
      size: { w, h },
      artboard: "RADIALHUDBOARD",
      stateMachine: "radialHudEngine",
      viewModel: "VmRadialHud",
      defaultRect: this.savedRect(w, h),
      positionConfigKey: POS_KEY,
    });
  }

  private savedRect(w: number, h: number): Rect | undefined {
    const saved = this.ctx.config.get<Partial<Rect> | null>(POS_KEY, null);
    if (saved && typeof saved === "object" && typeof saved.x === "number" && typeof saved.y === "number") {
      return { x: saved.x, y: saved.y, w: saved.w ?? w, h: saved.h ?? h };
    }
    return undefined;
  }

  override enterCalibrate(_stage = 1): void {
    if (!this.ov) return;
    const w = num(this.ctx.config.get("anim_width"), 400);
    const h = num(this.ctx.config.get("anim_height"), 400);
    const rect = this.savedRect(w, h);
    if (rect) this.ov.setRect(rect);
  }

  override tick(_dt: number): void {
    this.ctx.config.checkReload();
  }

  override setOverlayVisible(visible: boolean): void {
    if (this.ctx.state === "calibrate") return;
    this.ov?.setVisible(visible);
  }

  override teardown(): void {
    this.ov?.remove();
  }
}
