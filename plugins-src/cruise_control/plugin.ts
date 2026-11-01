import { FusePlugin, type FuseContext, type InspectorSection, type OverlayHandle } from "@fuse/plugin-sdk";

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

/** Accessors' `scene` values where the vehicle can drive: cruise holds W only there. */
const DRIVE_SCENES = new Set(["alive", "map"]);
/** Accessors' `scene_tags` offered in the two Show in controls. */
const SHOW_IN_OPTIONS = [
  { value: "alive", label: "Alive", tooltip: "While you drive, aim or use an ability." },
  { value: "map", label: "Map", tooltip: "While the tactical map is open." },
  { value: "dead", label: "Death screen", tooltip: "From the fatal hit until the deploy screen." },
  { value: "deploy", label: "Deploy", tooltip: "On the deploy screen and during the spawn drop." },
];
const HANGAR_OPTIONS = [
  { value: "hangar.base", label: "Base camp", tooltip: "The hangar's main screen." },
  { value: "hangar.select", label: "Select", tooltip: "Agent and vehicle selection." },
  { value: "hangar.agent", label: "Agent", tooltip: "Agent details, skills, cosmetics and progression." },
  { value: "hangar.vehicle", label: "Vehicle", tooltip: "Vehicle overview, workshop, equipment, cosmetics and progression." },
  { value: "hangar.missions", label: "Missions", tooltip: "Missions and operations." },
  { value: "hangar.modes", label: "Modes", tooltip: "Game mode selection." },
  { value: "hangar.career", label: "Career", tooltip: "Career, stats, friends and clans." },
  { value: "hangar.results", label: "Results", tooltip: "Results of the last battle." },
  { value: "hangar.settings", label: "Settings", tooltip: "The settings screens." },
  { value: "queue", label: "In queue", tooltip: "While matchmaking runs, on any hangar screen." },
];
const DEFAULT_SHOW_IN = ["alive", "map"];

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
  private showIn = new Set(DEFAULT_SHOW_IN);
  private lastVisible: boolean | null = null;

  private sections(): InspectorSection[] {
    return [
      {
        id: "cc.display",
        label: "Display",
        description: "Where the overlay shows. Cruise itself works only while you drive.",
        order: 10,
        controls: [
          {
            type: "buttons",
            id: "show_in",
            key: "show_in",
            mode: "multi",
            label: "Show in match",
            options: SHOW_IN_OPTIONS,
          },
          {
            type: "buttons",
            id: "show_in_hangar",
            key: "show_in_hangar",
            mode: "multi",
            label: "Show in hangar",
            options: HANGAR_OPTIONS,
          },
        ],
      },
      renderSizeSection("cc"),
    ];
  }

  setup(ctx: FuseContext): void {
    this.ctx = ctx;
    this.kbd = ctx.services.get<Keyboard>("keyboard");
    if (!this.kbd) ctx.logger.error("cruise_control: 'keyboard' service not available - plugin inactive");
    this.acc = ctx.services.get<Accessors>("accessors");
    if (!this.acc) ctx.logger.error("cruise_control: 'accessors' service not available - plugin inactive");

    ctx.config
      .defaults({ overlay_pos: null, anim_width: 300, anim_height: 300, show_in: DEFAULT_SHOW_IN, show_in_hangar: [] })
      .load();

    // One declaration for both surfaces: the App panel and the stage inspector.
    const sections = this.sections();
    ctx.config.schema(sections);

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
    this.ov.inspector.sections(sections);
    const applySize = (): void =>
      this.ov?.setSize({
        w: Number(ctx.config.get("anim_width", 300)) || 300,
        h: Number(ctx.config.get("anim_height", 300)) || 300,
      });
    ctx.config.watch("anim_width", applySize);
    ctx.config.watch("anim_height", applySize);
    this.ov.setBool("isSetupComplete", false);
    this.ov.setBool("isCruiseOn", false);

    this.toggleCombo = ctx.hotkeyFor("toggle", "c");
    ctx.hotkeys.register(this.toggleCombo, () => this.onToggle(), "Toggle Cruise Control");
    ctx.hotkeys.register("s", () => this.onS(), "Cruise Control Release");
  }

  private setCruise(on: boolean): void {
    this.ov?.setBool("isCruiseOn", on);
  }

  private get scene(): string {
    const scene = this.acc?.read("scene");
    return typeof scene === "string" ? scene : "";
  }

  private get inBattle(): boolean {
    return DRIVE_SCENES.has(this.scene);
  }

  /** Accessors' scene tags against both Show in picks. */
  private applyVisibility(): void {
    if (this.ctx.state === "calibrate") return;
    const want = new Set<string>();
    for (const key of ["show_in", "show_in_hangar"]) {
      const raw = this.ctx.config.get<unknown>(key, key === "show_in" ? DEFAULT_SHOW_IN : []);
      if (Array.isArray(raw)) for (const v of raw) want.add(String(v));
    }
    this.showIn = want;
    const tags = this.acc?.read("scene_tags");
    const visible = this.inFocus && Array.isArray(tags) && tags.some((tag) => want.has(String(tag)));
    if (visible === this.lastVisible) return;
    this.lastVisible = visible;
    this.ov?.setVisible(visible);
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
    this.lastVisible = null;
    this.applyVisibility();
  }

  override tick(_dt: number): void {
    this.ctx.config.checkReload();
    this.applyVisibility();
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
    this.lastVisible = null;
    this.applyVisibility();
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
