import { FusePlugin, ConfigCategory, ConfigEntry, type FuseContext, type OverlayHandle } from "@fuse/plugin-sdk";

interface Keyboard {
  press(key: string): void;
  release(key: string): void;
}

export class CruiseControlPlugin extends FusePlugin {
  static override requiresCalibration = true;
  static override calibrationStages = 1;

  private ctx!: FuseContext;
  private kbd: Keyboard | undefined;
  private ov: OverlayHandle | undefined;
  private active = false; // holding W
  private inFocus = true;
  private toggleCombo = "c";

  setup(ctx: FuseContext): void {
    this.ctx = ctx;
    this.kbd = ctx.services.get<Keyboard>("keyboard");
    if (!this.kbd) ctx.logger.error("cruise_control: 'keyboard' service not available - plugin inactive");

    ctx.config.defaults({ overlay_pos: null, anim_width: 300, anim_height: 300 }).load();

    ctx.config.schema([
      new ConfigCategory("Animation", [
        new ConfigEntry({ key: "anim_width", label: "Render Width", type: "int", min: 10, max: 3000 }),
        new ConfigEntry({ key: "anim_height", label: "Render Height", type: "int", min: 10, max: 3000 }),
      ]),
      new ConfigCategory("Position", [
        new ConfigEntry({ key: "overlay_pos", label: "Overlay Position", type: "position" }),
      ]),
    ]);

    const w = Number(ctx.config.get("anim_width", 300)) || 300;
    const h = Number(ctx.config.get("anim_height", 300)) || 300;

    this.ov = ctx.overlays.declare({
      id: "cruiseControl",
      kind: "rive",
      asset: "rive/cruiseControl.riv",
      size: { w, h },
      artboard: "CRUISEBOARD",
      stateMachine: "cruiseEngine",
      viewModel: "VmCruiseControl",
      positionConfigKey: "overlay_pos",
    });
    this.ov.setBool("isSetupComplete", false);
    this.ov.setBool("isCruiseOn", false);

    this.toggleCombo = ctx.hotkeyFor("toggle", "c");
    ctx.hotkeys.register(this.toggleCombo, () => this.onToggle(), "Toggle Cruise Control");
    ctx.hotkeys.register("s", () => this.onS(), "Cruise Control Release");
  }

  private setCruise(on: boolean): void {
    this.ov?.setBool("isCruiseOn", on);
  }

  private onToggle(): void {
    if (this.ctx.state !== "locked" || !this.kbd || !this.inFocus) return;
    if (this.active) {
      this.releaseAll();
    } else {
      this.kbd.press("w");
      this.active = true;
      this.setCruise(true);
    }
  }

  private onS(): void {
    if (this.ctx.state !== "locked" || !this.kbd || !this.inFocus) return;
    if (this.active) this.releaseAll();
  }

  override enterCalibrate(_stage = 1): void {
    this.releaseAll();
    this.ov?.setBool("isSetupComplete", false);
    this.ov?.setBool("isCruiseOn", false);
  }

  override enterLocked(): void {
    this.ov?.setBool("isSetupComplete", true);
    this.ov?.setBool("isCruiseOn", false);
  }

  override tick(_dt: number): void {
    this.ctx.config.checkReload();
    // Re-assert W each tick while active - physical key-up cancels our key-down.
    if (this.kbd && this.active && this.inFocus && this.ctx.state === "locked") {
      this.kbd.press("w");
    }
  }

  override setOverlayVisible(visible: boolean): void {
    this.inFocus = visible;
    if (this.ctx.state === "calibrate") return;
    if (!visible) this.releaseAll();
    this.ov?.setVisible(visible);
  }

  override teardown(): void {
    this.releaseAll();
    this.ctx.hotkeys.unregister(this.toggleCombo);
    this.ctx.hotkeys.unregister("s");
    this.ov?.remove();
  }

  private releaseAll(): void {
    if (!this.kbd) return;
    this.kbd.release("w");
    this.active = false;
    this.setCruise(false);
  }
}
