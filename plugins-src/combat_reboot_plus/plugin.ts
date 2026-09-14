import {
  FusePlugin,
  type FuseContext,
  type InspectorSection,
  type OverlayHandle,
  type Rect,
} from "@fuse/plugin-sdk";

interface Accessors {
  read(name: string): unknown;
  readonly connected: boolean;
}


const BATTLE_ACTIVE = 8;
const MS_FINISH = "ActiveFinish";

const POS_KEY_TP = "vue_overlay_pos";
const POS_KEY_FP = "vue_overlay_pos_fp";

type Phase = "charge" | "cooldown";

/** Calibration-only phase lengths, so a full charge, the trigger and the cooldown all show while positioning. */
const SIM_SPAN_S: Record<Phase, number> = { charge: 5, cooldown: 5 };

/** The Figma frame's size; the overlay scales it to whatever box it's given. */
const DEFAULT_W = 225;
const DEFAULT_H = 44;

/** Default phase colours: the overlay's `--accent-200` and `--text-main`, as config hex. */
const CHARGE_COLOR = "#8FFFB8FF";
const COOLDOWN_COLOR = "#F2F2F2FF";
/** Brand colours offered in the pickers. */
const COLOR_SWATCHES = ["#8FFFB8FF", "#FFF87AFF", "#FF6A62FF", "#F2F2F2FF", "#7ABFDFFF", "#FF6D46FF"];

/** Activation sounds shipped in the plugin's assets; config stores the file name. */
const SOUNDS = [
  { value: "magsToppedUp.wav", label: "Mags Topped Up" },
  { value: "freeTopUp.wav", label: "Free Top Up" },
  { value: "twoGrand.wav", label: "Two Grand" },
];
const DEFAULT_SOUND = "magsToppedUp.wav";

/** A config colour, or the fallback when it isn't a #RRGGBB / #RRGGBBAA hex. */
function hexOr(value: unknown, fallback: string): string {
  return typeof value === "string" && /^#(?:[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value) ? value : fallback;
}

export class CombatRebootPlusPlugin extends FusePlugin {
  static override requiresCalibration = true;
  static override calibrationStages = 2;

  private ctx!: FuseContext;
  private acc: Accessors | undefined;
  private ov: OverlayHandle | undefined;

  private threshold = 2000;
  private windowMs = 20_000;
  private cooldownMs = 60_000;
  private chargeColor = CHARGE_COLOR;
  private cooldownColor = COOLDOWN_COLOR;
  private soundOn = true;
  private soundFile = DEFAULT_SOUND;
  private soundVolume = 1;
  private missingSounds = new Set<string>();

  // Tumbling window: the first hit starts a timer; if it expires before the
  // threshold is reached, the accumulator resets to 0.
  private windowStart = 0; // epoch ms; 0 = no active window
  private windowSum = 0;
  private prevDamage: number | null = null;
  private cooldownUntil = 0;
  private active = false;
  private prevDead = false;
  private triggerCount = 0;
  private curFp: boolean | null = null;
  private simPhase: Phase = "charge";
  private simT = 0;

  private lastProgress = -1;
  private lastPhase: Phase | null = null;
  private lastInMatch: boolean | null = null;
  private lastToTrigger = -1;
  private lastRemaining = -1;
  private lastColors = "";

  private rd(name: string): unknown {
    return this.acc ? this.acc.read(name) : undefined;
  }
  private numOrNull(name: string): number | null {
    const v = this.rd(name);
    return typeof v === "number" ? v : null;
  }

  setup(ctx: FuseContext): void {
    this.ctx = ctx;
    this.acc = ctx.services.get<Accessors>("accessors");
    if (!this.acc) ctx.logger.error("combat_reboot_plus: 'accessors' service unavailable - plugin inactive");

    ctx.config
      .defaults({
        vue_overlay_pos: null,
        vue_overlay_pos_fp: null,
        vue_width: DEFAULT_W,
        vue_height: DEFAULT_H,
        threshold_damage: 2000,
        window_s: 20,
        cooldown_s: 60,
        charge_color: CHARGE_COLOR,
        cooldown_color: COOLDOWN_COLOR,
        sound_on_trigger: true,
        sound_choice: DEFAULT_SOUND,
        sound_volume: 1,
      })
      .load();

    // One declaration for both surfaces: the App panel and the stage inspector.
    const sections = this.sections();
    ctx.config.schema(sections);

    this.readConfig();

    const { w, h } = this.size();
    this.ov = ctx.overlays.declare({
      id: "combatReboot",
      kind: "vue",
      asset: "CombatRebootOverlay.vue",
      size: { w, h },
      defaultRect: this.savedRect(POS_KEY_TP, w, h),
      positionConfigKey: POS_KEY_TP,
    });
    this.ov.inspector.sections(sections);
    ctx.config.onAction((id) => {
      if (id === "sound_test") this.playSound(this.soundFile);
    });
    // All three, so switching the choice doesn't cost a load on the next activation.
    ctx.audio.preload(SOUNDS.map((s) => s.value).filter((f) => ctx.assets.exists(f)));
    this.pushData(true);
  }

  /** The switch is checked by the caller, so the test button plays regardless. */
  private playSound(asset: string): void {
    if (!this.ctx.assets.exists(asset)) {
      if (!this.missingSounds.has(asset)) {
        this.missingSounds.add(asset);
        this.ctx.logger.warning(`combat_reboot_plus: no assets/${asset} - sound skipped`);
      }
      return;
    }
    this.ctx.audio.play(asset, { volume: this.soundVolume });
  }

  private sections(): InspectorSection[] {
    return [
      {
        id: "crb.trigger",
        label: "Trigger",
        description: "How much damage fires the module, how fast it must land, and how long it rests after.",
        order: 10,
        controls: [
          {
            type: "number",
            id: "threshold_damage",
            key: "threshold_damage",
            label: "Damage",
            min: 1000,
            max: 10000,
            step: 100,
            unit: "dmg",
            tooltip: "Damage to deal inside the window to trigger.",
          },
          {
            type: "slider",
            id: "window_s",
            key: "window_s",
            label: "Window",
            min: 1,
            max: 120,
            step: 1,
            unit: "s",
            default: 20,
            tooltip: "Starts on the first hit; the charge resets if the damage isn't dealt in time. Double-click to reset.",
          },
          {
            type: "slider",
            id: "cooldown_s",
            key: "cooldown_s",
            label: "Cooldown",
            min: 1,
            max: 240,
            step: 5,
            unit: "s",
            default: 60,
            tooltip: "How long the module rests after triggering. Double-click to reset.",
          },
        ],
      },
      {
        id: "crb.colors",
        label: "Colors",
        description: "The bar's fill, edge, tints and strokes all follow the phase colour.",
        order: 11,
        controls: [
          {
            type: "color",
            id: "charge_color",
            key: "charge_color",
            label: "Charging",
            alpha: false,
            swatches: COLOR_SWATCHES,
            tooltip: "Colour while damage builds toward the trigger, and of the trigger strobe.",
          },
          {
            type: "color",
            id: "cooldown_color",
            key: "cooldown_color",
            label: "Cooldown",
            alpha: false,
            swatches: COLOR_SWATCHES,
            tooltip: "Colour while the module rests after triggering.",
          },
        ],
      },
      {
        id: "crb.sound",
        label: "Sound",
        description: "Plays when the module activates. Calibration stays silent.",
        order: 12,
        controls: [
          {
            type: "switch",
            id: "sound_on_trigger",
            key: "sound_on_trigger",
            label: "On activation",
            tooltip: "Play a sound when Combat Reboot activates.",
          },
          {
            type: "select",
            id: "sound_choice",
            key: "sound_choice",
            label: "Sound",
            options: SOUNDS.map((s) => ({ value: s.value, label: s.label })),
            disabledWhen: { key: "sound_on_trigger", truthy: false },
            tooltip: "Which sound plays on activation.",
          },
          {
            type: "slider",
            id: "sound_volume",
            key: "sound_volume",
            label: "Volume",
            min: 0,
            max: 1,
            step: 0.05,
            displayMul: 100,
            unit: "%",
            default: 1,
            disabledWhen: { key: "sound_on_trigger", truthy: false },
            tooltip: "Scaled by the app's master volume. Double-click to reset.",
          },
          {
            type: "button",
            id: "sound_test",
            text: "Test sound",
            icon: "play",
            tooltip: "Play the chosen sound now.",
          },
        ],
      },
    ];
  }

  private size(): { w: number; h: number } {
    return {
      w: Number(this.ctx.config.get("vue_width", DEFAULT_W)) || DEFAULT_W,
      h: Number(this.ctx.config.get("vue_height", DEFAULT_H)) || DEFAULT_H,
    };
  }

  private readConfig(): void {
    this.threshold = Number(this.ctx.config.get("threshold_damage", 2000)) || 2000;
    this.windowMs = (Number(this.ctx.config.get("window_s", 20)) || 20) * 1000;
    this.cooldownMs = (Number(this.ctx.config.get("cooldown_s", 60)) || 60) * 1000;
    this.chargeColor = hexOr(this.ctx.config.get("charge_color", CHARGE_COLOR), CHARGE_COLOR);
    this.cooldownColor = hexOr(this.ctx.config.get("cooldown_color", COOLDOWN_COLOR), COOLDOWN_COLOR);
    this.soundOn = Boolean(this.ctx.config.get("sound_on_trigger", true));
    const file = this.ctx.config.get<unknown>("sound_choice", DEFAULT_SOUND);
    this.soundFile = SOUNDS.some((s) => s.value === file) ? String(file) : DEFAULT_SOUND;
    const vol = Number(this.ctx.config.get("sound_volume", 1));
    this.soundVolume = Number.isFinite(vol) ? Math.min(1, Math.max(0, vol)) : 1;
  }

  private savedRect(key: string, w: number, h: number): Rect | undefined {
    const saved = this.ctx.config.get<Partial<Rect> | null>(key, null);
    if (saved && typeof saved === "object" && typeof saved.x === "number" && typeof saved.y === "number") {
      return { x: saved.x, y: saved.y, w: saved.w ?? w, h: saved.h ?? h };
    }
    return undefined;
  }

  /**
   * Calibration runs the whole cycle on compressed timings - charge, trigger,
   * cooldown - so every state the bar can show is visible while positioning.
   */
  private initSim(): void {
    this.simPhase = "charge";
    this.simT = 0;
    this.resetPushed();
    this.ov?.setBool("inMatch", true);
  }

  private pushSimFrame(dt: number): void {
    if (!this.ov) return;
    this.simT += dt;
    if (this.simT >= SIM_SPAN_S[this.simPhase]) {
      this.simT = 0;
      this.simPhase = this.simPhase === "charge" ? "cooldown" : "charge";
      if (this.simPhase === "cooldown") this.ov.set("trigger", ++this.triggerCount);
    }
    const t = Math.min(this.simT / SIM_SPAN_S[this.simPhase], 1);
    const progress = this.simPhase === "charge" ? t : 1 - t;
    // Real-scale readouts on the compressed clock: damage left to trigger, then cooldown seconds.
    this.pushFrame(
      this.simPhase,
      progress,
      this.simPhase === "charge" ? (1 - progress) * this.threshold : 0,
      this.simPhase === "charge" ? 0 : (progress * this.cooldownMs) / 1000,
    );
  }

  /** Forget what the overlay was last sent, so the next push resends all of it. */
  private resetPushed(): void {
    this.lastProgress = -1;
    this.lastPhase = null;
    this.lastInMatch = null;
    this.lastToTrigger = -1;
    this.lastRemaining = -1;
    this.lastColors = "";
  }

  override enterCalibrate(stage = 1): void {
    if (!this.ov) return;
    const { w, h } = this.size();
    const key = stage === 2 ? POS_KEY_FP : POS_KEY_TP;
    this.ov.setPositionConfigKey(key);
    let rect = this.savedRect(key, w, h);
    if (!rect && stage === 2) rect = this.savedRect(POS_KEY_TP, w, h);
    if (rect) this.ov.setRect(rect);
    this.curFp = null;
    this.initSim();
  }

  override enterLocked(): void {
    this.curFp = null;
    this.resetPushed();
  }

  override setOverlayVisible(visible: boolean): void {
    if (this.ctx.state === "calibrate") return;
    this.ov?.setVisible(visible);
  }

  /** Clear only the charge window (tumbling-window expiry / cooldown elapse). */
  private resetCharge(): void {
    this.windowStart = 0;
    this.windowSum = 0;
    this.prevDamage = null;
  }

  /** Full reset: charge window + cooldown (death / match / round start). */
  private resetAll(): void {
    this.resetCharge();
    this.cooldownUntil = 0;
  }

  override tick(dt: number): void {
    this.ctx.config.checkReload();
    this.readConfig();
    if (this.ctx.state === "calibrate") {
      this.pushSimFrame(dt);
      return;
    }
    if (this.ctx.state !== "locked" || !this.acc || !this.acc.connected) return;

    const fp = this.rd("multiplayer_is_fp_view");
    this.updateView(fp == null ? null : Boolean(Number(fp)));

    const battle = this.numOrNull("battle_state");
    const matchState = this.rd("match_state");
    const isActive = battle === BATTLE_ACTIVE && matchState !== MS_FINISH;

    if (isActive !== this.active) {
      this.active = isActive;
      this.resetAll();
    }

    if (!isActive) {
      this.prevDead = false;
      this.pushData();
      return;
    }

    const hp = this.numOrNull("health");
    const isDead = hp === 0 || this.numOrNull("player_is_dead") === 1;
    if (isDead && !this.prevDead) {
      this.resetAll();
      this.ctx.logger.info(`combat_reboot_plus: death (hp=${String(hp)}) - reset`);
    }
    this.prevDead = isDead;

    const cur = this.numOrNull("player_damage");
    if (cur === null) {
      this.pushData();
      return;
    }

    if (this.prevDamage === null) {
      // First reading of the round: establish a baseline, no delta yet.
      this.prevDamage = cur;
    }
    const delta = cur - this.prevDamage;
    this.prevDamage = cur;

    // Cumulative damage dropped => the match reset the counter (new round).
    if (delta < 0) this.resetAll();

    const now = Date.now();
    if (now < this.cooldownUntil) {
      this.pushData();
      return;
    }
    if (this.cooldownUntil !== 0) {
      this.cooldownUntil = 0;
      this.resetCharge();
    }

    // Tumbling window: expire the accumulator once the timer runs out (the
    // threshold wasn't reached in time).
    if (this.windowStart !== 0 && now - this.windowStart >= this.windowMs) {
      this.resetCharge();
    }

    if (delta > 0) {
      if (this.windowStart === 0) this.windowStart = now; // first hit starts the timer
      this.windowSum += delta;
    }

    if (this.windowSum >= this.threshold) {
      this.cooldownUntil = now + this.cooldownMs;
      this.ctx.logger.info(`combat_reboot_plus: triggered (${this.windowSum} dmg) - cooldown ${this.cooldownMs / 1000}s`);
      this.resetCharge();
      this.ov?.set("trigger", ++this.triggerCount);
      if (this.soundOn) this.playSound(this.soundFile);
    }

    this.pushData();
  }

  private updateView(fpFlag: boolean | null): void {
    if (fpFlag == null || fpFlag === this.curFp || !this.ov) return;
    this.curFp = fpFlag;
    const key = fpFlag ? POS_KEY_FP : POS_KEY_TP;
    this.ov.setPositionConfigKey(key);
    const { w, h } = this.size();
    const rect = this.savedRect(key, w, h);
    if (rect) this.ov.setRect(rect);
  }

  private pushData(force = false): void {
    if (!this.ov) return;
    const now = Date.now();
    const onCooldown = now < this.cooldownUntil;
    // Expire a stale window so an idle bar shows empty, not a stuck value.
    if (!onCooldown && this.windowStart !== 0 && now - this.windowStart >= this.windowMs) this.resetCharge();
    const leftMs = onCooldown ? this.cooldownUntil - now : 0;
    const progress = onCooldown
      ? leftMs / this.cooldownMs
      : this.threshold > 0 ? this.windowSum / this.threshold : 0;

    if (force || this.active !== this.lastInMatch) {
      this.lastInMatch = this.active;
      this.ov.setBool("inMatch", this.active);
    }
    this.pushFrame(
      onCooldown ? "cooldown" : "charge",
      progress,
      this.threshold - this.windowSum,
      leftMs / 1000,
      force,
    );
  }

  /** Sends only the fields that moved; `force` resends every one. */
  private pushFrame(phase: Phase, progress: number, toTrigger: number, remainingS: number, force = false): void {
    if (!this.ov) return;
    // Sent as strings: the overlay's `color` input type is numeric, meant for Rive.
    const colors = `${this.chargeColor}|${this.cooldownColor}`;
    if (force || colors !== this.lastColors) {
      this.lastColors = colors;
      this.ov.setString("chargeColor", this.chargeColor);
      this.ov.setString("cooldownColor", this.cooldownColor);
    }
    const p = Math.round(Math.max(0, Math.min(1, progress)) * 1000) / 1000;
    const dmg = Math.max(0, Math.round(toTrigger));
    const rem = Math.max(0, Math.ceil(remainingS));

    if (force || phase !== this.lastPhase) {
      this.lastPhase = phase;
      this.ov.setString("phase", phase);
    }
    // Endpoints always go through, so a full or empty bar never stops a hair short.
    if (force || Math.abs(p - this.lastProgress) >= 0.01 || (p !== this.lastProgress && (p === 0 || p === 1))) {
      this.lastProgress = p;
      this.ov.set("progress", p);
    }
    if (force || dmg !== this.lastToTrigger) {
      this.lastToTrigger = dmg;
      this.ov.set("toTrigger", dmg);
    }
    if (force || rem !== this.lastRemaining) {
      this.lastRemaining = rem;
      this.ov.set("remaining", rem);
    }
  }

  override teardown(): void {
    this.ov?.remove();
  }
}
