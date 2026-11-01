import {
  FusePlugin,
  type FuseContext,
  type InspectorControl,
  type InspectorSection,
  type LanguageService,
  type OverlayHandle,
  type Rect,
  type When,
} from "@fuse/plugin-sdk";
import { LOCALES, messagesFor, resolveLocale, translator, type Translate } from "./i18n.js";
import { NATIVE_CSS, ROOT_ID, STYLE_ID, nativeHtml, type NativeOptions } from "./native.js";
import { RETICLES as RETICLE_LIST } from "./reticles/index.mjs";
import { NATIVES } from "./reticles/natives.js";
import { simAt, type PreviewState } from "./sim.js";
import { Cue, GHOST_MODES, buildView, spreadLimits, type CrosshairRead, type CrosshairView, type CueMode } from "./view.js";

interface Accessors {
  read(name: string): unknown;
  isConnected(page: string): boolean;
  insertHtmlOn(page: string, target: string, html: string, position?: string, elementId?: string): Promise<boolean>;
  injectStylesheetOn(page: string, css: string | null, styleId?: string): Promise<boolean>;
  countMatches(page: string, selectors: readonly string[]): Promise<Record<string, number> | null>;
}

const HUD = "battle_hud";
/** The HUD can rebuild its page and drop the markup. The plugin checks for it this often. */
const NATIVE_CHECK_MS = 5000;
const NATIVE_RETRY_MS = 2000;

/** A reticle setting for the config panels. The manager rows show the segmented and switch ones. Labels are locale keys. */
interface ReticleControl {
  type: "segmented" | "switch" | "color";
  key: string;
  label: string;
  tooltip?: string;
  options?: { value: string; label: string; tooltip?: string }[];
  disabledWhen?: When;
}

interface ReticleMeta {
  id: string;
  label: string;
  tip: string;
  defaults: Record<string, unknown>;
  controls: ReticleControl[];
}

const RETICLES = RETICLE_LIST as ReticleMeta[];
const DEFAULT_RETICLE = RETICLES[0]!.id;
const SHOW_IN = ["alive", "map", "dead", "deploy"];
const DEFAULT_SHOW_IN = ["alive"];
const POS_KEY = "manager_pos";
const SIZE = { w: 320, h: 480 };
const SOUND = "aimed.wav";
const TOGGLE_HOTKEY = "ctrl+alt+x";
/** The binding's name. A saved rebind follows it, so it stays the same in every language. */
const TOGGLE_LABEL = "Crosshair Show Manager";

const COLOR_DEFAULTS = {
  // FUSE UI semantic colours
  color_range_effective: "#71CE71FF",
  color_range_falloff: "#FFDB8CFF",
  color_range_out: "#FF6A62FF",
} as const;
type ColorKey = keyof typeof COLOR_DEFAULTS;
const SWATCHES = ["#71CE71FF", "#A3FCB7FF", "#FFDB8CFF", "#FFD85CFF", "#FF6A62FF", "#FF6D46FF", "#F2F2F2FF"];
const RETICLE_SWATCHES = ["#FFFFFFFF", "#F2F2F2FF", "#A3FCB7FF", "#8FFFB8FF", "#FFDB8CFF", "#FF6A62FF", "#000000FF", "#00000059"];

interface Style {
  reticle: string;
  /** Draw the reticle in the game HUD, in place of the game's default aim. */
  inGame: boolean;
  /** The selected reticle's settings by config key. */
  settings: Record<string, unknown>;
  /** Every reticle's settings by id, for the manager's reticle frames. */
  all: Record<string, Record<string, unknown>>;
  /** When the ghost plays: "dispersion" or "reload". */
  ghostOn: CueMode;
  aimedSound: boolean;
  range: [string, string, string];
}

const isGhostMode = (v: unknown): v is CueMode => (GHOST_MODES as readonly unknown[]).includes(v);

/** Whether the manager may write `value` to `key`. */
function validSet(key: string, value: unknown): boolean {
  if (key === "reticle") return RETICLES.some((r) => r.id === value);
  if (key === "ghost_on") return isGhostMode(value);
  if (key === "aimed_sound" || key === "in_game") return typeof value === "boolean";
  const control = RETICLES.flatMap((r) => r.controls).find((c) => c.key === key);
  if (!control) return false;
  if (control.type === "switch") return typeof value === "boolean";
  return !!control.options?.some((o) => o.value === value);
}

/** A valid "#RRGGBB[AA]" as "#RRGGBB" (the marks take no alpha), else the fallback's. */
function rgbHex(value: unknown, fallback: string): string {
  const ok = typeof value === "string" && /^#(?:[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value);
  return (ok ? (value as string) : fallback).slice(0, 7);
}

function num(v: unknown, def: number, min: number, max: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

export class CrosshairPlugin extends FusePlugin {
  static override requiresCalibration = true;

  private ctx!: FuseContext;
  private acc: Accessors | undefined;
  private language: LanguageService | undefined;
  /** Last value seen on the language service, which reads empty without the permission. */
  private appLanguage: string | undefined;
  private locale = "en";
  private t: Translate = translator("en");
  private ov: OverlayHandle | undefined;

  private showIn = new Set(DEFAULT_SHOW_IN);
  private managerOpen = true;
  private toggleCombo = TOGGLE_HOTKEY;
  private volume = 0.8;
  private style!: Style;
  private hostVisible = true;
  private lastVisible: boolean | null = null;
  private lastStyle = "";
  private lastLive = "";
  /** The ghost moment in the game: the aimed sound, and the ghost in the manager preview. */
  private cue = new Cue("dispersion");
  private simGhost = new Cue("dispersion");
  private ghostSeq = 0;
  private simT = 0;
  private simulating = false;
  /** What is in battle_hud now: "" nothing, null not known yet. */
  private nativeKey: string | null = null;
  private nativeBusy = false;
  private nativeFailed = false;
  private nativeRetryAt = 0;
  private nativeCheckAt = 0;

  setup(ctx: FuseContext): void {
    this.ctx = ctx;
    this.acc = ctx.services.get<Accessors>("accessors");
    if (!this.acc) ctx.logger.error("crosshair: 'accessors' service unavailable - plugin inactive");
    this.language = ctx.services.get<LanguageService>("language");

    ctx.config
      .defaults({
        [POS_KEY]: null,
        // Empty follows the App's language.
        locale: "",
        manager_open: true,
        in_game: true,
        reticle: DEFAULT_RETICLE,
        show_in: DEFAULT_SHOW_IN,
        ...Object.assign({}, ...RETICLES.map((r) => r.defaults)),
        ghost_on: "dispersion",
        aimed_sound: true,
        aimed_volume: 0.8,
        ...COLOR_DEFAULTS,
      })
      .load();
    this.readConfig();
    this.appLanguage = this.language?.language;
    this.locale = this.pickLocale();
    this.t = translator(this.locale);

    if (ctx.assets.exists(SOUND)) ctx.audio.preload([SOUND]);
    else ctx.logger.warning(`crosshair: assets/${SOUND} missing - no aimed sound`);

    this.ov = ctx.overlays.declare({
      id: "manager",
      kind: "vue",
      asset: "CrosshairManager.vue",
      size: SIZE,
      defaultRect: this.savedRect(),
      positionConfigKey: POS_KEY,
      interactive: true,
    });
    this.ov.onAction((action, payload) => this.onAction(action, payload));
    this.declareSchema();
    this.pushLocale();
    this.pushStyle();

    this.toggleCombo = ctx.hotkeyFor("toggle_manager", TOGGLE_HOTKEY);
    ctx.hotkeys.register(this.toggleCombo, () => this.toggleManager(), TOGGLE_LABEL);
    // The manager shows the combo bound now, also after a rebind.
    ctx.hotkeys.onChange(() => this.pushToggleKey());
    this.pushToggleKey();
    ctx.config.watch("locale", () => this.applyLocale());

    ctx.events.subscribe("accessors.page_connected", (p) => {
      // A new battle_hud page has no reticle markup yet, and the cue waits for the next change.
      if ((p as { page?: string } | undefined)?.page === HUD) {
        this.cue.reset();
        this.nativeKey = null;
      }
    });
  }

  // ---- Config ----

  /** A reticle's settings as controls, in the current language. */
  private reticleControls(r: ReticleMeta): InspectorControl[] {
    const t = this.t;
    return r.controls.map((c) => {
      const base = { id: c.key, key: c.key, label: t(c.label), tooltip: c.tooltip ? t(c.tooltip) : undefined, disabledWhen: c.disabledWhen };
      if (c.type === "switch") return { ...base, type: "switch" as const };
      if (c.type === "color") {
        const def = r.defaults[c.key];
        return { ...base, type: "color" as const, alpha: true, default: typeof def === "string" ? def : undefined, swatches: RETICLE_SWATCHES };
      }
      const options = (c.options ?? []).map((o) => ({ value: o.value, label: t(o.label), tooltip: o.tooltip ? t(o.tooltip) : undefined }));
      return { ...base, type: "segmented" as const, options };
    });
  }

  private sections(): InspectorSection[] {
    const t = this.t;
    const colorControl = (key: ColorKey, stage: string) => ({
      type: "color" as const,
      id: key,
      key,
      label: t(`config.${stage}`),
      alpha: false,
      default: COLOR_DEFAULTS[key],
      swatches: SWATCHES,
      tooltip: t(`config.${stage}Tip`),
    });
    return [
      {
        id: "xh.display",
        label: t("config.display"),
        description: t("config.displayTip"),
        order: 10,
        controls: [
          {
            type: "select",
            id: "locale",
            key: "locale",
            label: t("config.language"),
            options: [{ value: "", label: t("config.languageAuto") }, ...LOCALES.map((code) => ({ value: code, label: code.toUpperCase() }))],
            tooltip: t("config.languageTip"),
          },
          { type: "switch", id: "manager_open", key: "manager_open", label: t("config.showManager"), tooltip: t("config.showManagerTip") },
          { type: "keybind", id: "manager_key", label: t("config.managerKey"), action: TOGGLE_LABEL, tooltip: t("config.managerKeyTip") },
          { type: "switch", id: "in_game", key: "in_game", label: t("config.inGame"), tooltip: t("config.inGameTip") },
          {
            type: "select",
            id: "reticle",
            key: "reticle",
            label: t("config.reticle"),
            tooltip: t("config.reticleTip"),
            options: RETICLES.map((r) => ({ value: r.id, label: t(r.label), tooltip: t(r.tip) })),
          },
          {
            type: "buttons",
            id: "show_in",
            key: "show_in",
            mode: "multi",
            label: t("config.showIn"),
            options: SHOW_IN.map((scene) => ({ value: scene, label: t(`scene.${scene}`), tooltip: t(`scene.${scene}Tip`) })),
          },
        ],
      },
      // Each reticle's own settings show while it is the selected one.
      ...RETICLES.map((r) => ({
        id: `xh.reticle.${r.id}`,
        label: t(r.label),
        description: t(r.tip),
        order: 11,
        when: { key: "reticle", eq: r.id },
        controls: this.reticleControls(r),
      })),
      {
        id: "xh.reload",
        label: t("config.reload"),
        description: t("config.reloadTip"),
        order: 12,
        controls: [
          {
            type: "segmented",
            id: "ghost_on",
            key: "ghost_on",
            label: t("config.ghost"),
            tooltip: t("config.ghostTip"),
            options: [
              { value: "dispersion", label: t("config.ghostDispersion"), tooltip: t("config.ghostDispersionTip") },
              { value: "reload", label: t("config.ghostReload"), tooltip: t("config.ghostReloadTip") },
            ],
          },
          { type: "switch", id: "aimed_sound", key: "aimed_sound", label: t("config.aimedSound"), tooltip: t("config.aimedSoundTip") },
          {
            type: "slider",
            id: "aimed_volume",
            key: "aimed_volume",
            label: t("config.aimedVolume"),
            min: 0,
            max: 1,
            step: 0.05,
            displayMul: 100,
            unit: "%",
            default: 0.8,
            disabledWhen: { key: "aimed_sound", eq: false },
          },
        ],
      },
      {
        id: "xh.range",
        label: t("config.range"),
        description: t("config.rangeTip"),
        order: 13,
        controls: [
          colorControl("color_range_effective", "effective"),
          colorControl("color_range_falloff", "falloff"),
          colorControl("color_range_out", "out"),
        ],
      },
    ];
  }

  /** One declaration for the App panel and the inspector, in the current language. */
  private declareSchema(): void {
    const sections = this.sections();
    this.ctx.config.schema(sections);
    this.ov?.inspector.sections(sections);
  }

  private readConfig(): void {
    const cfg = this.ctx.config;
    const showIn = cfg.get<unknown>("show_in", DEFAULT_SHOW_IN);
    this.showIn = new Set(Array.isArray(showIn) ? showIn.map(String) : DEFAULT_SHOW_IN);
    this.managerOpen = Boolean(cfg.get("manager_open", true));
    const picked = cfg.get<string>("reticle", DEFAULT_RETICLE);
    const reticle = RETICLES.find((r) => r.id === picked) ?? RETICLES[0]!;
    const all: Record<string, Record<string, unknown>> = {};
    for (const r of RETICLES) {
      const own: Record<string, unknown> = {};
      for (const [key, def] of Object.entries(r.defaults)) own[key] = cfg.get(key, def);
      all[r.id] = own;
    }
    const settings = all[reticle.id]!;
    const c = (k: ColorKey) => rgbHex(cfg.get(k, COLOR_DEFAULTS[k]), COLOR_DEFAULTS[k]);
    this.volume = num(cfg.get("aimed_volume", 0.8), 0.8, 0, 1);
    const ghostOn = cfg.get<unknown>("ghost_on", "dispersion");
    const ghostMode = isGhostMode(ghostOn) ? ghostOn : "dispersion";
    this.cue.setMode(ghostMode);
    this.simGhost.setMode(ghostMode);
    this.style = {
      reticle: reticle.id,
      inGame: Boolean(cfg.get("in_game", true)),
      settings,
      all,
      ghostOn: ghostMode,
      aimedSound: Boolean(cfg.get("aimed_sound", true)),
      range: [c("color_range_effective"), c("color_range_falloff"), c("color_range_out")],
    };
  }

  private onAction(action: string, payload: unknown): void {
    if (action === "close") {
      this.ctx.config.set("manager_open", false);
      this.readConfig();
      return;
    }
    if (action !== "set") return;
    const p = (payload ?? {}) as { key?: unknown; value?: unknown };
    const key = String(p.key ?? "");
    if (!validSet(key, p.value)) return;
    this.ctx.config.set(key, p.value);
    this.readConfig();
    this.pushStyle();
  }

  private toggleManager(): void {
    this.ctx.config.set("manager_open", !this.ctx.config.get("manager_open", true));
    this.readConfig();
  }

  /** The combo bound now for the manager shortcut, for its hint. */
  private pushToggleKey(): void {
    const bound = this.ctx.hotkeys.listBindings().find((b) => b.label === TOGGLE_LABEL);
    this.ov?.setString("toggleKey", bound?.combo ?? "");
  }

  private savedRect(): Rect | undefined {
    const saved = this.ctx.config.get<Partial<Rect> | null>(POS_KEY, null);
    if (saved && typeof saved === "object" && typeof saved.x === "number" && typeof saved.y === "number") {
      return { x: saved.x, y: saved.y, w: saved.w || SIZE.w, h: saved.h || SIZE.h };
    }
    return undefined;
  }

  // ---- Language ----

  /** The user's pick, else the App's language. */
  private pickLocale(): string {
    return resolveLocale(this.ctx.config.get("locale", ""), this.appLanguage);
  }

  /** The service keeps `language` current. A permission change also shows here. */
  private followAppLanguage(): void {
    const language = this.language?.language;
    if (language === this.appLanguage) return;
    this.appLanguage = language;
    this.applyLocale();
  }

  private applyLocale(): void {
    const next = this.pickLocale();
    if (next === this.locale) return;
    this.locale = next;
    this.t = translator(next);
    this.declareSchema();
    this.pushLocale();
  }

  private pushLocale(): void {
    this.ov?.setString("locale", this.locale);
    this.ov?.setJson("messages", messagesFor(this.locale));
    // The manager draws the reticle picker and the selected reticle's rows from these.
    this.ov?.setJson(
      "reticles",
      RETICLES.map((r) => ({ id: r.id, label: this.t(r.label), controls: this.reticleControls(r) })),
    );
  }

  // ---- Overlay ----

  private pushStyle(): void {
    const s = JSON.stringify(this.style);
    if (s === this.lastStyle) return;
    this.lastStyle = s;
    this.ov?.setJson("style", this.style);
  }

  private pushLive(live: PreviewState & { preview: boolean }): void {
    const s = JSON.stringify(live);
    if (s === this.lastLive) return;
    this.lastLive = s;
    this.ov?.setJson("live", live);
  }

  /** The ghost of the reticle. One count for live and scripted cues. */
  private pushGhost(): void {
    this.ov?.setJson("cue", { seq: ++this.ghostSeq });
  }

  /** The aimed sound, at the ghost's moment. */
  private playAimed(): void {
    if (this.style.aimedSound && this.volume > 0) this.ctx.audio.play(SOUND, { volume: this.volume });
  }

  private setVisible(want: boolean): void {
    const visible = this.hostVisible && want;
    if (visible === this.lastVisible) return;
    this.lastVisible = visible;
    this.ov?.setVisible(visible);
  }

  private read(): CrosshairRead | null {
    const x = this.acc?.read("crosshair");
    return x && typeof x === "object" ? (x as CrosshairRead) : null;
  }

  private inScope(): boolean {
    const tags = this.acc?.read("scene_tags");
    return Array.isArray(tags) && tags.some((t) => this.showIn.has(String(t)));
  }

  private live(v: CrosshairView | null): PreviewState {
    return {
      active: !!v && !v.own && !v.locked,
      own: !!v?.own,
      scale: round2(v?.scale ?? 1),
      reduced: !!v?.reduced,
      reloading: !!v?.reloading,
      progress: round2(v?.progress ?? 1),
      range: v?.range ?? 0,
      distance: v?.distance ?? 0,
    };
  }

  // ---- Host states ----

  override enterCalibrate(): void {
    this.lastVisible = null;
  }

  override enterLocked(): void {
    this.lastVisible = null;
  }

  override enterInteractive(): void {
    this.lastVisible = null;
  }

  override setOverlayVisible(visible: boolean): void {
    this.hostVisible = visible;
    this.lastVisible = null;
  }

  override tick(dt: number): void {
    this.ctx.config.checkReload();
    this.readConfig();
    this.followAppLanguage();
    this.pushStyle();
    if (!this.ov) return;

    // The game reticle and its sound follow the game in every host state. The sound plays with the ghost.
    const read = this.read();
    const view = buildView(read);
    const cued = this.cue.read(view);
    if (cued) this.playAimed();
    this.syncNative(read);

    // Calibration and interactive mode play the scripted cannon, so every state shows while you edit.
    // Calibration always shows the manager, to place it. Otherwise the close button and the shortcut decide.
    const state = this.ctx.state;
    if (state === "calibrate" || state === "interactive") {
      this.setVisible(state === "calibrate" || this.managerOpen);
      this.simulate(dt);
      return;
    }
    this.simulating = false;
    const scoped = this.inScope();
    this.setVisible(this.managerOpen && scoped);
    if (cued && scoped) this.pushGhost();
    this.pushLive({ ...this.live(scoped ? view : null), preview: false });
  }

  // ---- In game ----

  /** The markup inputs, or null until the read gives the page size. */
  private nativeOptions(read: CrosshairRead): NativeOptions | null {
    const screen = read.screen;
    if (!Array.isArray(screen) || !(Number(screen[0]) > 0) || !(Number(screen[1]) > 0)) return null;
    return {
      settings: this.style.settings,
      range: this.style.range,
      ghostOn: this.style.ghostOn,
      minD: round2(spreadLimits(read).min),
      screen: [Number(screen[0]), Number(screen[1])],
    };
  }

  /** Keeps the reticle markup and the hide stylesheet in battle_hud in step with the config, also after the page comes back. */
  private syncNative(read: CrosshairRead | null): void {
    const acc = this.acc;
    if (!acc || this.nativeBusy || this.nativeFailed) return;
    if (!read || !acc.isConnected(HUD)) {
      // No read means no battle_hud: the markup went with the page.
      this.nativeKey = null;
      return;
    }
    const options = this.style.inGame ? this.nativeOptions(read) : null;
    if (this.style.inGame && !options) return;
    const key = options ? JSON.stringify({ reticle: this.style.reticle, ...options }) : "";
    const now = Date.now();
    if (key === this.nativeKey) {
      if (!key || now < this.nativeCheckAt) return;
      this.nativeCheckAt = now + NATIVE_CHECK_MS;
      this.nativeBusy = true;
      acc
        .countMatches(HUD, [`#${ROOT_ID}`])
        .then((n) => {
          if (n && n[`#${ROOT_ID}`] === 0) this.nativeKey = null;
        })
        .catch(() => undefined)
        .finally(() => {
          this.nativeBusy = false;
        });
      return;
    }
    if (now < this.nativeRetryAt) return;
    const build = NATIVES[this.style.reticle] ?? NATIVES[DEFAULT_RETICLE]!;
    this.nativeBusy = true;
    // The game aim hides only after the reticle is in, and comes back before the reticle goes.
    const apply = options
      ? acc.insertHtmlOn(HUD, "body", nativeHtml(build, options), "beforeend", ROOT_ID).then((ok) => ok && acc.injectStylesheetOn(HUD, NATIVE_CSS, STYLE_ID))
      : acc.injectStylesheetOn(HUD, null, STYLE_ID).then((ok) => ok && acc.insertHtmlOn(HUD, "body", "", "beforeend", ROOT_ID));
    apply
      .then((ok) => {
        if (ok) {
          this.nativeKey = key;
          this.nativeCheckAt = Date.now() + NATIVE_CHECK_MS;
        } else {
          this.nativeRetryAt = Date.now() + NATIVE_RETRY_MS;
        }
      })
      .catch((e) => {
        // Without the accessors.ui permission every call fails: stop retrying.
        this.nativeFailed = true;
        this.ctx.logger.warning(`crosshair: cannot draw in the game HUD - ${String(e)}`);
      })
      .finally(() => {
        this.nativeBusy = false;
      });
  }

  /** The scripted cannon. It plays the ghost, but no sound. */
  private simulate(dt: number): void {
    if (!this.simulating) {
      this.simulating = true;
      this.simT = 0;
      this.simGhost.reset();
    }
    this.simT += dt;
    const s = simAt(this.simT);
    if (this.simGhost.read({ ...s, locked: false })) this.pushGhost();
    this.pushLive({ ...s, preview: true });
  }

  override teardown(): void {
    this.ctx.hotkeys.unregister(this.toggleCombo);
    const acc = this.acc;
    if (acc && this.nativeKey !== "" && acc.isConnected(HUD)) {
      acc.injectStylesheetOn(HUD, null, STYLE_ID).catch(() => undefined);
      acc.insertHtmlOn(HUD, "body", "", "beforeend", ROOT_ID).catch(() => undefined);
    }
    this.ov?.remove();
  }
}
