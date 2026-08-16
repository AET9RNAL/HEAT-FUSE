import { FusePlugin, ConfigCategory, ConfigEntry, type FuseContext, type OverlayHandle } from "@fuse/plugin-sdk";

interface Keyboard {
  press(key: string): void;
  release(key: string): void;
  /** Physical state - the host discounts the key-downs we inject ourselves. */
  isHeld(key: string): boolean;
}

interface Accessors {
  read(name: string): unknown;
  readonly connected: boolean;
}

const BATTLE_ACTIVE = 8;
const MS_FINISH = "ActiveFinish";

export class CruiseControlPlugin extends FusePlugin {
  static override requiresCalibration = true;
  static override calibrationStages = 1;

  private ctx!: FuseContext;
  private kbd: Keyboard | undefined;
  private acc: Accessors | undefined;
  private ov: OverlayHandle | undefined;
  private active = false; // holding W
  private handoff = false; // off, but W left down for the player's own hold
  private inFocus = true;
  private toggleCombo = "c";

  setup(ctx: FuseContext): void {
    this.ctx = ctx;
    this.kbd = ctx.services.get<Keyboard>("keyboard");
    if (!this.kbd) ctx.logger.error("cruise_control: 'keyboard' service not available - plugin inactive");
    this.acc = ctx.services.get<Accessors>("accessors");
    if (!this.acc) ctx.logger.error("cruise_control: 'accessors' service not available - plugin inactive");

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

  /** battle_hud only exists in battle; state 8 is the live phase. */
  private get inBattle(): boolean {
    if (!this.acc?.connected) return false;
    return this.acc.read("battle_state") === BATTLE_ACTIVE && this.acc.read("match_state") !== MS_FINISH;
  }

  private onToggle(): void {
    if (this.ctx.state !== "locked" || !this.kbd || !this.inFocus || !this.inBattle) return;
    if (this.active) {
      this.disengage();
    } else {
      this.handoff = false;
      this.kbd.press("w");
      this.active = true;
      this.setCruise(true);
    }
  }

  private onS(): void {
    if (this.ctx.state !== "locked" || !this.kbd || !this.inFocus) return;
    if (this.handoff) this.hardRelease(); // braking - drop W even mid-handoff
    else if (this.active) this.disengage();
  }

  override enterCalibrate(_stage = 1): void {
    this.hardRelease();
    this.ov?.setBool("isSetupComplete", false);
    this.ov?.setBool("isCruiseOn", false);
  }

  override enterLocked(): void {
    this.ov?.setBool("isSetupComplete", true);
    this.ov?.setBool("isCruiseOn", false);
  }

  override tick(_dt: number): void {
    this.ctx.config.checkReload();
    if (!this.kbd) return;
    if (this.handoff) {
      // Cruise is off but W stays down under the player's own hold - end it on their key-up.
      if (!this.kbd.isHeld("w")) this.hardRelease();
      return;
    }
    if (!this.active) return;
    // Battle over / left battle: drop W and switch off.
    if (this.ctx.state !== "locked" || !this.inBattle) {
      this.disengage();
      return;
    }
    // Re-assert W each tick while active - physical key-up cancels our key-down.
    if (this.inFocus) this.kbd.press("w");
  }

  override setOverlayVisible(visible: boolean): void {
    this.inFocus = visible;
    if (this.ctx.state === "calibrate") return;
    if (!visible) this.hardRelease();
    this.ov?.setVisible(visible);
  }

  override teardown(): void {
    this.hardRelease();
    this.ctx.hotkeys.unregister(this.toggleCombo);
    this.ctx.hotkeys.unregister("s");
    this.ov?.remove();
  }

  /** Switch off; if the player is already holding W, hand the key over uninterrupted. */
  private disengage(): void {
    if (!this.kbd) return;
    this.handoff = this.kbd.isHeld("w");
    if (!this.handoff) this.kbd.release("w");
    this.active = false;
    this.setCruise(false);
    this.ctx.logger.info(`cruise_control: off (handoff=${String(this.handoff)})`);
  }

  /** Switch off and force W up (focus loss, calibrate, teardown). */
  private hardRelease(): void {
    if (!this.kbd) return;
    this.kbd.release("w");
    this.handoff = false;
    this.active = false;
    this.setCruise(false);
  }
}
