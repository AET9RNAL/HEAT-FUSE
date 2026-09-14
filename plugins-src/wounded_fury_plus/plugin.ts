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
  readonly connectedHangar: boolean;
}


const BATTLE_ACTIVE = 8;
const MS_FINISH = "ActiveFinish";

const POS_KEY_TP = "vue_overlay_pos";
const POS_KEY_FP = "vue_overlay_pos_fp";

/** Extra time past the nominal duration before a stuck buff tag is force-expired. */
const TAG_HOLD_SLACK_MS = 1500;

/**
 * `player_vehicle` is the art slug, e.g. "a02_m1e1_120" (hud_scoreboard's
 * SLUG_SEED lists them). Compared loosely so a variant suffix or a shorthand
 * like "m1e1" in config still matches.
 */
const M1E1_SLUG = "a02_m1e1_120";

type Phase = "charge" | "active" | "cooldown";

const SIM_SPAN_S: Record<Phase, number> = { charge: 5, active: 6, cooldown: 4 };

const DEFAULT_W = 225;
const DEFAULT_H = 44;

/** How long a confirmed vehicle survives out-of-battle reads (respawn transitions) before it's forgotten. */
const VEHICLE_LATCH_GRACE_MS = 15_000;

const HANGAR_SETTLE_MS = 3000;

/** Default phase colours: the overlay's `--accent-200`, `--error-highlight` and `--text-main`, as config hex. */
const CHARGE_COLOR = "#8FFFB8FF";
const ACTIVE_COLOR = "#FF6A62FF";
const COOLDOWN_COLOR = "#F2F2F2FF";
const ACTIVE_SOUND = "wfActive.wav";
const TEN_LEFT_SOUND = "10sLeft.wav";
const TEN_LEFT_AT_MS = 11_000;

/** colors offered in the pickers. */
const COLOR_SWATCHES = ["#8FFFB8FF", "#FFF87AFF", "#FF6A62FF", "#F2F2F2FF", "#7ABFDFFF", "#FF6D46FF"];

/** A config colour, or the fallback when it isn't a #RRGGBB / #RRGGBBAA hex. */
function hexOr(value: unknown, fallback: string): string {
  return typeof value === "string" && /^#(?:[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value) ? value : fallback;
}

export class WoundedFuryPlusPlugin extends FusePlugin {
  static override requiresCalibration = true;
  static override calibrationStages = 2;

  private ctx!: FuseContext;
  private acc: Accessors | undefined;
  private ov: OverlayHandle | undefined;

  private threshold = 4000;
  private durationMs = 30_000;
  private cooldownMs = 40_000;
  private chargeColor = CHARGE_COLOR;
  private activeColor = ACTIVE_COLOR;
  private cooldownColor = COOLDOWN_COLOR;
  private soundOn = true;
  private soundVolume = 1;
  private soundTenLeft = true;
  private tenLeftPlayed = false;
  private missingSounds = new Set<string>();
  private buffTag = "";
  private logTags = false;
  private vehicleSlug = M1E1_SLUG;

  // Damage *taken* accumulates from spawn with no time window - the modifier
  // fires once the vehicle has soaked `threshold` before being destroyed.
  private damageSum = 0;
  private prevHp: number | null = null;
  private phase: Phase = "charge";
  private phaseUntil = 0; // epoch ms; end of the active or cooldown phase
  private tagHeld = false;
  private inMatch = false;
  private prevDead = false;
  private triggerCount = 0;
  private curFp: boolean | null = null;
  private seenTags = new Set<string>();
  private simPhase: Phase = "charge";
  private simT = 0;
  private onVehicle = false;
  private lastSeenVehicle = "";
  private hostVisible = true;
  private showInBattle = true;
  private showInHangar = false;
  private inHangar = false;
  private hangarSince = 0;
  private lastVisible: boolean | null = null;

  private lastProgress = -1;
  private lastPhase: Phase | null = null;
  private lastInMatch: boolean | null = null;
  private lastToTrigger = -1;
  private lastRemaining = -1;
  private lastColors = "";

  // A respawn can rebuild the HUD page without re-sending the vehicle slug.
  private vehicleLatched = false;
  private latchedVehicleId: number | null = null;
  private lastMatchAt = 0;

  private rd(name: string): unknown {
    return this.acc ? this.acc.read(name) : undefined;
  }
  private numOrNull(name: string): number | null {
    const v = this.rd(name);
    return typeof v === "number" ? v : null;
  }
  private tags(): string[] {
    const v = this.rd("buff_tags");
    return Array.isArray(v) ? v.filter((t): t is string => typeof t === "string") : [];
  }

  setup(ctx: FuseContext): void {
    this.ctx = ctx;
    this.acc = ctx.services.get<Accessors>("accessors");
    if (!this.acc) ctx.logger.error("wounded_fury_plus: 'accessors' service unavailable - plugin inactive");

    ctx.config
      .defaults({
        vue_overlay_pos: null,
        vue_overlay_pos_fp: null,
        vue_width: DEFAULT_W,
        vue_height: DEFAULT_H,
        show_in: ["battle"],
        threshold_damage: 4000,
        duration_s: 30,
        cooldown_s: 40,
        charge_color: CHARGE_COLOR,
        active_color: ACTIVE_COLOR,
        cooldown_color: COOLDOWN_COLOR,
        sound_on_trigger: true,
        sound_ten_left: true,
        sound_volume: 1,
        buff_tag: "",
        log_buff_tags: false,
        vehicle_slug: M1E1_SLUG,
      })
      .load();

    // One declaration for both surfaces: the App panel and the stage inspector.
    const sections = this.sections();
    ctx.config.schema(sections);

    this.readConfig();

    const { w, h } = this.size();
    this.ov = ctx.overlays.declare({
      id: "woundedFury",
      kind: "vue",
      asset: "WoundedFury.vue",
      size: { w, h },
      defaultRect: this.savedRect(POS_KEY_TP, w, h),
      positionConfigKey: POS_KEY_TP,
    });
    this.ov.inspector.sections(sections);
    // A button row reports its own id, with the pressed button's id as the payload.
    ctx.config.onAction((id, payload) => {
      if (id === "sound_test") this.playSound(payload === "ten_left" ? TEN_LEFT_SOUND : ACTIVE_SOUND);
    });
    ctx.audio.preload([ACTIVE_SOUND, TEN_LEFT_SOUND].filter((s) => ctx.assets.exists(s)));
    this.pushData(true);
  }

  /** Switches are checked by the caller, so the test buttons play regardless. */
  private playSound(asset: string): void {
    if (!this.ctx.assets.exists(asset)) {
      if (!this.missingSounds.has(asset)) {
        this.missingSounds.add(asset);
        this.ctx.logger.warning(`wounded_fury_plus: no assets/${asset} - sound skipped`);
      }
      return;
    }
    this.ctx.audio.play(asset, { volume: this.soundVolume });
  }

  private sections(): InspectorSection[] {
    return [
      {
        id: "wf.display",
        label: "Display",
        description: "Where the overlay shows. Both can be on.",
        order: 10,
        controls: [
          {
            type: "buttons",
            id: "show_in",
            key: "show_in",
            mode: "multi",
            label: "Show in",
            options: [
              { value: "battle", label: "Battle", tooltip: "Live charge, buff and cooldown while driving the vehicle." },
              { value: "hangar", label: "Hangar", tooltip: "The overlay at rest while in the hangar." },
            ],
          },
        ],
      },
      {
        id: "wf.trigger",
        label: "Trigger",
        description: "When the modifier fires and how long each phase lasts.",
        order: 11,
        controls: [
          {
            type: "number",
            id: "threshold_damage",
            key: "threshold_damage",
            label: "Damage",
            min: 100,
            max: 50000,
            step: 100,
            unit: "hp",
            tooltip: "Damage the vehicle must take before being destroyed to trigger.",
          },
          {
            type: "slider",
            id: "duration_s",
            key: "duration_s",
            label: "Buff",
            min: 1,
            max: 120,
            step: 1,
            unit: "s",
            default: 30,
            tooltip: "How long the buff stays up once triggered. Double-click to reset.",
          },
          {
            type: "slider",
            id: "cooldown_s",
            key: "cooldown_s",
            label: "Cooldown",
            min: 1,
            max: 600,
            step: 5,
            unit: "s",
            default: 40,
            tooltip: "Counted from the moment the buff ends. Double-click to reset.",
          },
        ],
      },
      {
        id: "wf.colors",
        label: "Colors",
        description: "The bar's fill, edge, tints and strokes all follow the phase colour.",
        order: 12,
        controls: [
          {
            type: "color",
            id: "charge_color",
            key: "charge_color",
            label: "Charging",
            alpha: false,
            swatches: COLOR_SWATCHES,
            tooltip: "Colour while damage taken builds toward the trigger.",
          },
          {
            type: "color",
            id: "active_color",
            key: "active_color",
            label: "Active",
            alpha: false,
            swatches: COLOR_SWATCHES,
            tooltip: "Colour while the buff is up.",
          },
          {
            type: "color",
            id: "cooldown_color",
            key: "cooldown_color",
            label: "Cooldown",
            alpha: false,
            swatches: COLOR_SWATCHES,
            tooltip: "Colour while the buff recharges.",
          },
        ],
      },
      {
        id: "wf.sound",
        label: "Sound",
        description: "Cues for the buff going up and running out. Calibration stays silent.",
        order: 13,
        controls: [
          {
            type: "switch",
            id: "sound_on_trigger",
            key: "sound_on_trigger",
            label: "On activation",
            tooltip: "Play a sound when Wounded Fury activates.",
          },
          {
            type: "switch",
            id: "sound_ten_left",
            key: "sound_ten_left",
            label: "10 s warning",
            tooltip: "Play a countdown cue when the buff has 11 seconds left.",
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
            disabledWhen: {
              allOf: [
                { key: "sound_on_trigger", truthy: false },
                { key: "sound_ten_left", truthy: false },
              ],
            },
            tooltip: "Scaled by the app's master volume. Double-click to reset.",
          },
          {
            type: "buttonRow",
            id: "sound_test",
            buttons: [
              { id: "activation", text: "Activation", icon: "play", tooltip: "Play the activation sound now." },
              { id: "ten_left", text: "10 s left", icon: "play", tooltip: "Play the 10-second warning now." },
            ],
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
    const showIn = this.ctx.config.get<unknown>("show_in", ["battle"]);
    const places = Array.isArray(showIn) ? showIn : ["battle"];
    this.showInBattle = places.includes("battle");
    this.showInHangar = places.includes("hangar");
    this.threshold = Number(this.ctx.config.get("threshold_damage", 4000)) || 4000;
    this.durationMs = (Number(this.ctx.config.get("duration_s", 30)) || 30) * 1000;
    this.cooldownMs = (Number(this.ctx.config.get("cooldown_s", 40)) || 40) * 1000;
    this.chargeColor = hexOr(this.ctx.config.get("charge_color", CHARGE_COLOR), CHARGE_COLOR);
    this.activeColor = hexOr(this.ctx.config.get("active_color", ACTIVE_COLOR), ACTIVE_COLOR);
    this.cooldownColor = hexOr(this.ctx.config.get("cooldown_color", COOLDOWN_COLOR), COOLDOWN_COLOR);
    this.soundOn = Boolean(this.ctx.config.get("sound_on_trigger", true));
    this.soundTenLeft = Boolean(this.ctx.config.get("sound_ten_left", true));
    const vol = Number(this.ctx.config.get("sound_volume", 1));
    this.soundVolume = Number.isFinite(vol) ? Math.min(1, Math.max(0, vol)) : 1;
    this.buffTag = String(this.ctx.config.get("buff_tag", "") ?? "").trim();
    this.logTags = Boolean(this.ctx.config.get("log_buff_tags", false));
    this.vehicleSlug = String(this.ctx.config.get("vehicle_slug", M1E1_SLUG) ?? "").trim().toLowerCase();
  }

  /** Local player's roster vehicle id - still readable when the slug isn't. */
  private playerVehicleId(): number | null {
    const roster = this.rd("sb_warriors");
    if (!Array.isArray(roster)) return null;
    for (const w of roster) {
      const row = w as { is_player?: unknown; vehicle_id?: unknown } | null;
      if (row?.is_player === 1 && typeof row.vehicle_id === "number") return row.vehicle_id;
    }
    return null;
  }

  /**
   * Loose slug match: either side containing the other counts (see M1E1_SLUG).
   * A respawn can leave the slug unreadable, so a confirmed match holds until the
   * roster shows a different vehicle or the battle is over.
   */
  private matchesVehicle(): boolean {
    if (this.vehicleSlug === "") return true;
    const v = this.rd("player_vehicle");
    const slug = typeof v === "string" ? v.trim().toLowerCase() : "";
    const vehicleId = this.playerVehicleId();
    if (slug !== this.lastSeenVehicle) {
      this.lastSeenVehicle = slug;
      this.ctx.logger.info(
        slug
          ? `wounded_fury_plus: vehicle slug "${slug}" (roster id ${String(vehicleId)})`
          : `wounded_fury_plus: vehicle slug unreadable (roster id ${String(vehicleId)}, match held: ${this.vehicleLatched})`,
      );
    }
    if (slug) {
      const ok = slug === this.vehicleSlug || slug.includes(this.vehicleSlug) || this.vehicleSlug.includes(slug);
      this.vehicleLatched = ok;
      this.latchedVehicleId = ok ? vehicleId : null;
      return ok;
    }
    if (!this.vehicleLatched) return false;
    return vehicleId === null || this.latchedVehicleId === null || vehicleId === this.latchedVehicleId;
  }

  private forgetVehicle(): void {
    this.vehicleLatched = false;
    this.latchedVehicleId = null;
  }

  /** In battle on the vehicle and/or in the hangar, per config; hidden everywhere else. */
  private applyVisibility(): void {
    if (this.ctx.state === "calibrate") return;
    const wanted = (this.showInBattle && this.inMatch && this.onVehicle) || (this.showInHangar && this.inHangar);
    const visible = this.hostVisible && wanted;
    if (visible === this.lastVisible) return;
    this.lastVisible = visible;
    this.ctx.logger.info(
      `wounded_fury_plus: ${visible ? "shown" : "hidden"} (show_battle=${this.showInBattle} show_hangar=${this.showInHangar}` +
        ` in_hangar=${this.inHangar} match=${this.inMatch} vehicle=${this.onVehicle} host=${this.hostVisible}` +
        ` battle_state=${String(this.rd("battle_state"))} match_state=${String(this.rd("match_state"))}` +
        ` slug="${this.lastSeenVehicle}" held=${this.vehicleLatched} roster_id=${String(this.latchedVehicleId)})`,
    );
    this.ov?.setVisible(visible);
  }

  private savedRect(key: string, w: number, h: number): Rect | undefined {
    const saved = this.ctx.config.get<Partial<Rect> | null>(key, null);
    if (saved && typeof saved === "object" && typeof saved.x === "number" && typeof saved.y === "number") {
      return { x: saved.x, y: saved.y, w: saved.w ?? w, h: saved.h ?? h };
    }
    return undefined;
  }

  /**
   * Calibration runs the whole lifecycle on compressed timings, so every state
   * the bar can show - fill, ignition, buff countdown, cooldown - is visible
   * while positioning instead of one frozen frame.
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
      this.simPhase = this.simPhase === "charge" ? "active" : this.simPhase === "active" ? "cooldown" : "charge";
      if (this.simPhase === "active") this.ov.set("trigger", ++this.triggerCount);
    }
    const t = Math.min(this.simT / SIM_SPAN_S[this.simPhase], 1);
    const progress = this.simPhase === "charge" ? t : 1 - t;
    // Real-scale readouts on the compressed clock: HP left to trigger, then buff and cooldown seconds.
    const spanMs = this.simPhase === "active" ? this.durationMs : this.cooldownMs;
    this.pushFrame(
      this.simPhase,
      progress,
      this.simPhase === "charge" ? (1 - progress) * this.threshold : 0,
      this.simPhase === "charge" ? 0 : (progress * spanMs) / 1000,
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
    this.lastVisible = null;
    this.initSim();
  }

  override enterLocked(): void {
    this.curFp = null;
    this.resetPushed();
    this.lastVisible = null;
    this.applyVisibility();
  }

  override setOverlayVisible(visible: boolean): void {
    this.hostVisible = visible;
    this.applyVisibility();
  }

  /** Clear only the damage accumulator (trigger consumed it). */
  private resetCharge(): void {
    this.damageSum = 0;
  }

  /** Full reset: accumulator + phase (death / match / round start). */
  private resetAll(): void {
    this.resetCharge();
    this.prevHp = null;
    this.phase = "charge";
    this.phaseUntil = 0;
    this.tagHeld = false;
  }

  private fire(now: number, reason: string): void {
    this.phase = "active";
    this.phaseUntil = now + this.durationMs;
    this.resetCharge();
    this.ctx.logger.info(`wounded_fury_plus: triggered (${reason}) - buff ${this.durationMs / 1000}s`);
    this.ov?.set("trigger", ++this.triggerCount);
    this.tenLeftPlayed = false;
    if (this.soundOn) this.playSound(ACTIVE_SOUND);
  }

  /**
   * Hangar = its page is up and the battle HUD's isn't. It has to hold for a moment
   * first, so a HUD page reconnecting mid-battle isn't taken for a trip to the hangar.
   */
  private updateHangar(now: number): void {
    const raw = Boolean(this.acc?.connectedHangar) && !this.acc?.connected;
    if (!raw) {
      this.hangarSince = 0;
      this.inHangar = false;
      return;
    }
    if (this.hangarSince === 0) this.hangarSince = now;
    if (this.inHangar || now - this.hangarSince < HANGAR_SETTLE_MS) return;
    this.inHangar = true;
    this.inMatch = false;
    this.onVehicle = false;
    this.resetAll();
  }

  override tick(dt: number): void {
    this.ctx.config.checkReload();
    this.readConfig();
    if (this.ctx.state === "calibrate") {
      this.pushSimFrame(dt);
      return;
    }
    if (this.ctx.state !== "locked" || !this.acc) return;
    this.updateHangar(Date.now());
    if (!this.acc.connected) {
      // Out of battle only the hangar can change what's shown; the charge rests at zero there.
      this.applyVisibility();
      this.pushData();
      return;
    }

    const fp = this.rd("multiplayer_is_fp_view");
    this.updateView(fp == null ? null : Boolean(Number(fp)));

    const battle = this.numOrNull("battle_state");
    const matchState = this.rd("match_state");
    const isMatch = battle === BATTLE_ACTIVE && matchState !== MS_FINISH;

    // Checked before refreshing, so a long spell out of battle (the hangar) also counts.
    const nowMs = Date.now();
    if (this.vehicleLatched && nowMs - this.lastMatchAt > VEHICLE_LATCH_GRACE_MS) this.forgetVehicle();
    if (isMatch) this.lastMatchAt = nowMs;

    if (isMatch !== this.inMatch) {
      this.inMatch = isMatch;
      this.resetAll();
    }

    const onVehicle = isMatch && this.matchesVehicle();
    if (onVehicle !== this.onVehicle) {
      this.onVehicle = onVehicle;
      this.resetAll();
    }
    this.applyVisibility();

    if (!isMatch || !onVehicle) {
      this.prevDead = false;
      this.pushData();
      return;
    }

    const now = Date.now();

    const tags = this.tags();
    if (this.logTags) {
      for (const t of tags) {
        if (this.seenTags.has(t)) continue;
        this.seenTags.add(t);
        this.ctx.logger.info(`wounded_fury_plus: buff tag seen - "${t}"`);
      }
    }
    const tagSeen = this.buffTag !== "" && tags.includes(this.buffTag);

    const hp = this.numOrNull("health");
    const isDead = hp === 0 || this.numOrNull("player_is_dead") === 1;
    if (isDead && !this.prevDead) {
      this.resetAll();
      this.ctx.logger.info(`wounded_fury_plus: death (hp=${String(hp)}) - reset`);
    }
    this.prevDead = isDead;

    // Track HP every tick regardless of phase, so re-entering the charge phase
    // never sees one giant delta accumulated while the buff was up.
    let taken = 0;
    if (hp !== null) {
      if (this.prevHp === null) this.prevHp = hp;
      const delta = hp - this.prevHp;
      this.prevHp = hp;
      // Positive deltas are regen / repair / respawn - only losses count.
      if (delta < 0) taken = -delta;
    }

    switch (this.phase) {
      case "charge": {
        // The tag is authoritative: it means the game applied the buff, whatever
        // the estimate says.
        if (tagSeen) {
          this.tagHeld = true;
          this.fire(now, `tag "${this.buffTag}"`);
          break;
        }
        this.damageSum += taken;
        if (this.damageSum >= this.threshold) this.fire(now, `${this.damageSum} dmg taken`);
        break;
      }
      case "active": {
        if (tagSeen) {
          this.tagHeld = true;
        } else if (this.tagHeld) {
          // Tag dropped => the game ended the buff; that beats the local timer.
          this.tagHeld = false;
          this.phase = "cooldown";
          this.phaseUntil = now + this.cooldownMs;
          break;
        }
        // Hard cap: a tag that never clears (accessor loss) must not stick.
        if (now >= this.phaseUntil + (this.tagHeld ? TAG_HOLD_SLACK_MS : 0)) {
          this.tagHeld = false;
          this.phase = "cooldown";
          this.phaseUntil = now + this.cooldownMs;
        }
        break;
      }
      case "cooldown": {
        // The buff coming back early means the cooldown estimate was wrong.
        if (tagSeen) {
          this.tagHeld = true;
          this.fire(now, `tag "${this.buffTag}"`);
          break;
        }
        if (now >= this.phaseUntil) {
          this.phase = "charge";
          this.phaseUntil = 0;
          this.resetCharge();
        }
        break;
      }
    }

    // Once per buff; a buff no longer than the cue's lead time would overlap the activation sound.
    if (
      this.phase === "active" &&
      this.soundTenLeft &&
      !this.tenLeftPlayed &&
      this.durationMs > TEN_LEFT_AT_MS &&
      this.phaseUntil - now <= TEN_LEFT_AT_MS
    ) {
      this.tenLeftPlayed = true;
      this.playSound(TEN_LEFT_SOUND);
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
    const leftMs = Math.max(0, this.phaseUntil - Date.now());
    const spanMs = this.phase === "active" ? this.durationMs : this.cooldownMs;
    const progress =
      this.phase === "charge"
        ? this.threshold > 0 ? this.damageSum / this.threshold : 0
        : spanMs > 0 ? leftMs / spanMs : 0;

    // The overlay dims outside a match; the hangar counts as one.
    const live = this.inMatch || this.inHangar;
    if (force || live !== this.lastInMatch) {
      this.lastInMatch = live;
      this.ov.setBool("inMatch", live);
    }
    this.pushFrame(
      this.phase,
      progress,
      this.threshold - this.damageSum,
      this.phase === "charge" ? 0 : leftMs / 1000,
      force,
    );
  }

  /** Sends only the fields that moved; `force` resends every one. */
  private pushFrame(phase: Phase, progress: number, toTrigger: number, remainingS: number, force = false): void {
    if (!this.ov) return;
    // Sent as strings: the overlay's `color` input type is numeric, meant for Rive.
    const colors = `${this.chargeColor}|${this.activeColor}|${this.cooldownColor}`;
    if (force || colors !== this.lastColors) {
      this.lastColors = colors;
      this.ov.setString("chargeColor", this.chargeColor);
      this.ov.setString("activeColor", this.activeColor);
      this.ov.setString("cooldownColor", this.cooldownColor);
    }
    const p = Math.round(Math.max(0, Math.min(1, progress)) * 1000) / 1000;
    const hp = Math.max(0, Math.round(toTrigger));
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
    if (force || hp !== this.lastToTrigger) {
      this.lastToTrigger = hp;
      this.ov.set("toTrigger", hp);
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
