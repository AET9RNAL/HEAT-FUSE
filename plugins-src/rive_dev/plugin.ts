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

  private sections(): InspectorSection[] {
    return [renderSizeSection("rd")];
  }

  setup(ctx: FuseContext): void {
    this.ctx = ctx;

    ctx.config
      .defaults({ rive_pos: null, anim_width: 400, anim_height: 400 })
      .load();

    // One declaration for both surfaces: the App panel and the stage inspector.
    const sections = this.sections();
    ctx.config.schema(sections);

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
    this.ov.inspector.sections(sections);
    const applySize = (): void =>
      this.ov?.setSize({ w: num(ctx.config.get("anim_width"), 400), h: num(ctx.config.get("anim_height"), 400) });
    ctx.config.watch("anim_width", applySize);
    ctx.config.watch("anim_height", applySize);
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
