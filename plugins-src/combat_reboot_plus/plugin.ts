import {
  FusePlugin,
  ConfigCategory,
  ConfigEntry,
  type FuseContext,
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

export class CombatRebootPlusPlugin extends FusePlugin {
  static override requiresCalibration = true;
  static override calibrationStages = 2;

  private ctx!: FuseContext;
  private acc: Accessors | undefined;
  private ov: OverlayHandle | undefined;

  private threshold = 2000;
  private windowMs = 20_000;
  private cooldownMs = 60_000;

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


  private lastProgress = -1;
  private lastCooldown: boolean | null = null;
  private lastActive: boolean | null = null;

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
        vue_width: 115,
        vue_height: 30,
        threshold_damage: 2000,
        window_s: 20,
        cooldown_s: 60,
      })
      .load();

    ctx.config.schema([
      new ConfigCategory("Combat Reboot", [
        new ConfigEntry({ key: "threshold_damage", label: "Damage Threshold", type: "int", min: 100, max: 20000, description: "Damage needed within the window to trigger" }),
        new ConfigEntry({ key: "window_s", label: "Window (s)", type: "int", min: 1, max: 120, description: "Rolling window the damage must be dealt in" }),
        new ConfigEntry({ key: "cooldown_s", label: "Cooldown (s)", type: "int", min: 1, max: 600 }),
      ]),
      new ConfigCategory("Position", [
        new ConfigEntry({ key: "vue_overlay_pos", label: "3rd Person Position", type: "position" }),
        new ConfigEntry({ key: "vue_overlay_pos_fp", label: "1st Person Position", type: "position" }),
      ]),
    ]);

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
    this.pushData(true);
  }

  private size(): { w: number; h: number } {
    return {
      w: Number(this.ctx.config.get("vue_width", 115)) || 115,
      h: Number(this.ctx.config.get("vue_height", 30)) || 30,
    };
  }

  private readConfig(): void {
    this.threshold = Number(this.ctx.config.get("threshold_damage", 2000)) || 2000;
    this.windowMs = (Number(this.ctx.config.get("window_s", 20)) || 20) * 1000;
    this.cooldownMs = (Number(this.ctx.config.get("cooldown_s", 60)) || 60) * 1000;
  }

  private savedRect(key: string, w: number, h: number): Rect | undefined {
    const saved = this.ctx.config.get<Partial<Rect> | null>(key, null);
    if (saved && typeof saved === "object" && typeof saved.x === "number" && typeof saved.y === "number") {
      return { x: saved.x, y: saved.y, w: saved.w ?? w, h: saved.h ?? h };
    }
    return undefined;
  }

  private showCalibrationPreview(): void {
    if (!this.ov) return;
    this.ov.set("progress", 1);
    this.ov.setBool("cooldown", false);
    this.ov.setBool("active", true);
    this.lastProgress = -1;
    this.lastCooldown = null;
    this.lastActive = null;
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
    this.showCalibrationPreview();
  }

  override enterLocked(): void {
    this.curFp = null;
    this.lastProgress = -1;
    this.lastCooldown = null;
    this.lastActive = null;
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

  override tick(_dt: number): void {
    this.ctx.config.checkReload();
    this.readConfig();
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
    let progress: number;
    if (onCooldown) {
      progress = (this.cooldownUntil - now) / this.cooldownMs;
    } else {
      // Expire a stale window so an idle bar shows empty, not a stuck value.
      if (this.windowStart !== 0 && now - this.windowStart >= this.windowMs) this.resetCharge();
      progress = this.threshold > 0 ? this.windowSum / this.threshold : 0;
    }
    progress = Math.max(0, Math.min(1, progress));

    const changed =
      force ||
      onCooldown !== this.lastCooldown ||
      this.active !== this.lastActive ||
      Math.abs(progress - this.lastProgress) >= 0.01;
    if (!changed) return;

    this.lastProgress = progress;
    this.lastCooldown = onCooldown;
    this.lastActive = this.active;

    this.ov.set("progress", Math.round(progress * 1000) / 1000);
    this.ov.setBool("cooldown", onCooldown);
    this.ov.setBool("active", this.active);
  }

  override teardown(): void {
    this.ov?.remove();
  }
}
