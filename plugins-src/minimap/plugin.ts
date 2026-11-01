import {
  FusePlugin,
  type FuseContext,
  type InspectorSection,
  type LanguageService,
  type OverlayHandle,
  type Rect,
} from "@fuse/plugin-sdk";
import { LOCALES, messagesFor, resolveLocale, translator, type Translate } from "./i18n.js";
import {
  AFF_ENEMY,
  BlipTracker,
  DEFAULT_BREAKPOINTS,
  TYPE_MISSILE,
  TYPE_HELI,
  TYPE_PLANE,
  TYPE_DRONE,
  airHeading,
  bearing,
  inWarnRange,
  isAir,
  onCollisionCourse,
  readBases,
  warnSide,
  worldPos,
  wrap180,
  type Contact,
  type RadarRead,
  type Vec,
  type WarnSide,
} from "./radar.js";
import { ClassJoin, type JoinMarker } from "./classJoin.js";
import { roster } from "./vehicles.js";
import {
  PRESETS,
  ROLES,
  mergeOverlays,
  modeOptions,
  sanitizeList,
  splitEdits,
  visibleFeatures,
  type MapOverlays,
  type MatchContext,
} from "./overlays.js";

interface Accessors {
  read(name: string): unknown;
  readonly connected: boolean;
  insertHtmlOn(page: string, target: string, html: string, position?: string, elementId?: string): Promise<boolean>;
  injectStylesheetOn(page: string, css: string | null, styleId?: string): Promise<boolean>;
  countMatches(page: string, selectors: readonly string[]): Promise<Record<string, number> | null>;
}

interface MapInfo {
  scene: string;
  image: string;
  radar: string;
  center: [number, number];
  m_per_px: number;
  size_px: [number, number];
  radar_m_per_px: number;
  radar_size_px: [number, number];
  /** A larger, coarser capture with the same centre. It fills the view where the HD image ends. */
  wide?: string;
  wide_m_per_px?: number;
  wide_size_px?: [number, number];
}

interface ViewBlip {
  x: number;
  y: number;
  aff: number;
  type: number;
  platoon: number;
  age: number;
  /** The player's class from the marker join, or "" for a plain dot. */
  role: string;
  /** Air objects: travel direction, degrees clockwise from north. */
  heading: number;
  /** An enemy missile that flies at you. */
  inbound: boolean;
}
interface ViewBase {
  sign: string;
  /** Raw status bits; CapturePoint.vue turns them into the game's look. */
  status: number;
  progress: number;
  x: number | null;
  y: number | null;
  bearing: number;
  /** The game's label icon path (bomb event), empty while the letter shows. */
  icon: string;
  iconBlink: boolean;
}
interface MapLayer {
  image: string;
  /** World x of the left edge and world y of the top edge, in metres. */
  x0: number;
  ytop: number;
  w: number;
  h: number;
}
interface MinimapView {
  /** The map image and its world rectangle in metres, and the wide image under it. */
  map: (MapLayer & { wide: MapLayer | null }) | null;
  player: { x: number; y: number; camera: number; turret: number } | null;
  blips: ViewBlip[];
  bases: ViewBase[];
  warn: { id: number; rel: number; side: WarnSide } | null;
  /** An enemy the radar shows is inside the warning zone now. */
  threat: boolean;
  radarRange: number;
  mapName: string;
  contacts: number;
  sim: boolean;
}
interface MinimapStyle {
  shape: string;
  orientation: string;
  range: number;
  mapOpacity: number;
  radarRing: boolean;
  safeCone: number;
  showSafeCone: boolean;
  /** Warning distance limit in metres, and whether the warning is for enemies beyond it. */
  warnRange: number;
  warnInvert: boolean;
  /** Capture point size, 1 = the game radar's hex. */
  pointScale: number;
  colors: MinimapColors;
  /** Range while the Zoom Out key is down. */
  zoomRange: number;
  zoomed: boolean;
}
interface MinimapColors {
  you: string;
  squad: string;
  ally: string;
  enemy: string;
  contested: string;
  neutral: string;
}

const SHOW_IN = ["alive", "map", "dead", "deploy"];
const DEFAULT_SHOW_IN = ["alive"];
const POS_KEY = "vue_overlay_pos";
const DEFAULT_W = 300;
const DEFAULT_H = 356;
const HUD = "battle_hud";
const RADAR_DISPLAY = '[class*="Radar_display"]';
const LAYER_ID = "__fuse_minimap_layer__";
const LAYER_STYLE_ID = "__fuse_minimap_layer_style__";
const HIDE_RADAR_ID = "__fuse_minimap_hide_radar__";
const HIDE_RADAR_CSS = '[class*="Radar_base"] { display: none !important; }';
const LAYER_CHECK_MS = 5000;
const LAYER_RETRY_MS = 2000;
const WARN_SHOW_MS = 1500;
const SIM_MAP = "06";
const ZOOM_RANGE = 450;
const MARK_LABEL = "Minimap Mark At My Position";
const ZOOM_LABEL = "Minimap Zoom Out";
const SOUNDS: Record<WarnSide, string> = {
  left: "sounds/warn_left.ogg",
  right: "sounds/warn_right.ogg",
  rear: "sounds/warn_rear.ogg",
};

const COLOR_DEFAULTS: Record<keyof MinimapColors, string> = {
  you: "#FFD85CFF",
  squad: "#78D098FF",
  ally: "#7ABFDFFF",
  enemy: "#FF6D46FF",
  contested: "#FFD85CFF",
  neutral: "#D0CBC4FF",
};
/** Labels and tooltips are in locales: colors.<key> and colors.<key>Tip. */
const COLOR_KEYS: (keyof MinimapColors)[] = ["you", "squad", "ally", "enemy", "contested", "neutral"];
const COLOR_SWATCHES = ["#FFD85CFF", "#78D098FF", "#7ABFDFFF", "#FF6D46FF", "#D0CBC4FF", "#0072B2FF", "#E69F00FF"];

/** A valid "#RRGGBB[AA]" as "#RRGGBB" (the overlay has no alpha), else the fallback's. */
function rgbHex(value: unknown, fallback: string): string {
  const ok = typeof value === "string" && /^#(?:[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value);
  return (ok ? (value as string) : fallback).slice(0, 7);
}

function num(v: unknown, def: number, min: number, max: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
}

function isRadar(v: unknown): v is RadarRead {
  const r = v as RadarRead | null;
  return !!r && typeof r === "object" && Array.isArray(r.objects) && Array.isArray(r.bases);
}

function mapKey(slug: unknown): string {
  const m = typeof slug === "string" ? /^(\d+)_/.exec(slug) : null;
  return m ? m[1]!.padStart(2, "0") : "";
}

export class MinimapPlugin extends FusePlugin {
  static override requiresCalibration = true;

  private ctx!: FuseContext;
  private acc: Accessors | undefined;
  private language: LanguageService | undefined;
  /** Last value seen on the language service, which reads empty without the permission. */
  private appLanguage: string | undefined;
  private locale = "en";
  private t: Translate = translator("en");
  private ov: OverlayHandle | undefined;
  private maps: Record<string, MapInfo> = {};
  private radarImages = new Map<string, string>();

  private showIn = new Set(DEFAULT_SHOW_IN);
  private style: MinimapStyle = {
    shape: "circle",
    orientation: "heading",
    range: 400,
    mapOpacity: 0.9,
    radarRing: true,
    safeCone: 180,
    showSafeCone: true,
    warnRange: 300,
    warnInvert: false,
    pointScale: 2,
    colors: {
      you: rgbHex(COLOR_DEFAULTS.you, "#FFD85C"),
      squad: rgbHex(COLOR_DEFAULTS.squad, "#78D098"),
      ally: rgbHex(COLOR_DEFAULTS.ally, "#7ABFDF"),
      enemy: rgbHex(COLOR_DEFAULTS.enemy, "#FF6D46"),
      contested: rgbHex(COLOR_DEFAULTS.contested, "#FFD85C"),
      neutral: rgbHex(COLOR_DEFAULTS.neutral, "#D0CBC4"),
    },
    zoomRange: ZOOM_RANGE,
    zoomed: false,
  };
  private layerOn = true;
  private layerOpacity = 0.6;
  private layerScale = "near";
  private warnOn = true;
  private warnVolume = 0.7;
  private warnCooldownMs = 2000;
  private warnMissiles = false;

  private hostVisible = true;
  private lastVisible: boolean | null = null;
  private lastView = "";
  private lastStyle = "";
  private tracker = new BlipTracker();
  private classJoin = new ClassJoin();
  private classIcons = true;
  private map = "";
  private mode = "";
  private learned = new Map<string, Vec>();
  private lastWarnMs = 0;
  private warnSeq = 0;
  private warn: { id: number; rel: number; side: WarnSide; until: number } | null = null;
  private mapName = "";
  private simT = 0;

  /** What the game radar holds now: "" for nothing. */
  private layerKey = "";
  private layerStyle = "";
  private layerBusy = false;
  private layerCheckAt = 0;
  private layerRetryAt = 0;
  private layerFailed = false;
  private hideRadar = false;
  /** The hide stylesheet on the current battle_hud: null when unknown, so the next tick applies it. */
  private hideApplied: boolean | null = null;
  private hideBusy = false;

  private showOverlays = true;
  private editing = false;
  /** The map the editor shows: "" follows the current match. */
  private editMap = "";
  private lastEditor = "";
  private lastEditorPlayer = "";
  private cmdSeq = 0;
  private lastOverlays = "";
  /** The mode and vehicle already added to the editor's filter lists. */
  private seenMatch = "";

  setup(ctx: FuseContext): void {
    this.ctx = ctx;
    this.acc = ctx.services.get<Accessors>("accessors");
    if (!this.acc) ctx.logger.error("minimap: 'accessors' service unavailable - plugin inactive");
    this.language = ctx.services.get<LanguageService>("language");

    ctx.config
      .defaults({
        // Empty follows the App's language.
        locale: "",
        vue_overlay_pos: null,
        vue_width: DEFAULT_W,
        vue_height: DEFAULT_H,
        show_in: DEFAULT_SHOW_IN,
        shape: "circle",
        orientation: "heading",
        range: 150,
        zoom_range: ZOOM_RANGE,
        map_opacity: 0.9,
        radar_ring: true,
        show_safe_cone: true,
        class_icons: true,
        hide_game_radar: true,
        radar_layer: false,
        radar_layer_opacity: 0.6,
        radar_layer_scale: "near",
        warn_enabled: true,
        warn_cone: 200,
        warn_range: 80,
        warn_range_invert: false,
        point_scale: 2,
        ...Object.fromEntries(COLOR_KEYS.map((k) => [`color_${k}`, COLOR_DEFAULTS[k]])),
        warn_volume: 1,
        warn_cooldown: 1,
        warn_missiles: true,
        learned_bases: {},
        show_overlays: true,
        overlay_edit: false,
        map_overlays: {},
        map_overlays_hidden: {},
        seen_modes: [],
        seen_vehicles: [],
      })
      .load();
    this.readConfig();
    this.appLanguage = this.language?.language;
    this.locale = this.pickLocale();
    this.t = translator(this.locale);

    try {
      this.maps = JSON.parse(ctx.assets.readText("maps/maps.json")) as Record<string, MapInfo>;
    } catch (e) {
      ctx.logger.error(`minimap: maps/maps.json unreadable - ${String(e)}`);
    }
    ctx.audio.preload(Object.values(SOUNDS).filter((s) => ctx.assets.exists(s)));

    const { w, h } = this.size();
    this.ov = ctx.overlays.declare({
      id: "minimap",
      kind: "vue",
      asset: "Minimap.vue",
      size: { w, h },
      defaultRect: this.savedRect(w, h),
      positionConfigKey: POS_KEY,
      // The overlay layer editor takes clicks in interactive mode.
      interactive: true,
    });
    this.ov.onAction((action, payload) => this.onEditorAction(action, payload));
    this.loadShipped();
    ctx.config.watch("map_overlays", () => (this.overlayStore = null));
    ctx.config.watch("map_overlays_hidden", () => (this.overlayStore = null));
    ctx.config.watch("locale", () => this.applyLocale());
    this.declareSchema();
    this.pushLocale();
    this.pushStyle();

    ctx.hotkeys.hold(
      ctx.hotkeyFor("zoom_out", "shift"),
      { onDown: () => this.setZoom(true), onUp: () => this.setZoom(false) },
      ZOOM_LABEL,
    );
    // Works while you drive: the game keeps the keyboard outside interactive mode.
    ctx.hotkeys.register(ctx.hotkeyFor("mark_here", "ctrl+m"), () => this.markHere(), MARK_LABEL);

    ctx.events.subscribe("accessors.page_connected", (p) => {
      // A new battle_hud has no layer and no layer style yet.
      if ((p as { page?: string } | undefined)?.page !== HUD) return;
      this.layerKey = "";
      this.layerStyle = "";
      this.hideApplied = null;
    });
  }

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
    // The editor data holds translated labels.
    this.lastEditor = "";
  }

  /** One declaration for the App panel and the inspector, in the current language. */
  private declareSchema(): void {
    const sections = this.sections();
    this.ctx.config.schema(sections);
    this.ov?.inspector.sections(sections);
  }

  private pushLocale(): void {
    this.ov?.setString("locale", this.locale);
    this.ov?.setJson("messages", messagesFor(this.locale));
  }

  private sections(): InspectorSection[] {
    const t = this.t;
    return [
      {
        id: "mm.display",
        label: t("display.title"),
        order: 10,
        controls: [
          {
            type: "select",
            id: "locale",
            key: "locale",
            label: t("language.label"),
            options: [
              { value: "", label: t("language.auto") },
              ...LOCALES.map((code) => ({ value: code, label: code.toUpperCase() })),
            ],
            tooltip: t("language.tip"),
          },
          {
            type: "buttons",
            id: "show_in",
            key: "show_in",
            mode: "multi",
            label: t("display.showIn"),
            options: (["alive", "map", "dead", "deploy"] as const).map((v) => ({
              value: v,
              label: t(`display.${v}`),
              tooltip: t(`display.${v}Tip`),
            })),
          },
          {
            type: "segmented",
            id: "orientation",
            key: "orientation",
            label: t("display.rotation"),
            options: [
              { value: "heading", label: t("display.viewUp"), tooltip: t("display.viewUpTip") },
              { value: "north", label: t("display.northUp"), tooltip: t("display.northUpTip") },
            ],
          },
          {
            type: "segmented",
            id: "shape",
            key: "shape",
            label: t("display.shape"),
            options: [
              { value: "circle", label: t("display.circle") },
              { value: "square", label: t("display.square") },
            ],
          },
          {
            type: "slider",
            id: "range",
            key: "range",
            label: t("display.range"),
            min: 150,
            max: 600,
            step: 50,
            unit: " m",
            default: 150,
            tooltip: t("display.rangeTip"),
          },
          {
            type: "slider",
            id: "zoom_range",
            key: "zoom_range",
            label: t("display.zoomRange"),
            min: 200,
            max: 1500,
            step: 50,
            unit: " m",
            default: ZOOM_RANGE,
            tooltip: t("display.zoomRangeTip"),
          },
          {
            type: "keybind",
            id: "zoom_key",
            label: t("display.zoomKey"),
            action: ZOOM_LABEL,
            hold: true,
            tooltip: t("display.zoomKeyTip"),
          },
          {
            type: "slider",
            id: "map_opacity",
            key: "map_opacity",
            label: t("display.mapOpacity"),
            min: 0,
            max: 1,
            step: 0.05,
            displayMul: 100,
            unit: "%",
            default: 0.9,
          },
          {
            type: "slider",
            id: "point_scale",
            key: "point_scale",
            label: t("display.pointScale"),
            min: 0.5,
            max: 4,
            step: 0.25,
            unit: "×",
            default: 2,
            tooltip: t("display.pointScaleTip"),
          },
          {
            type: "switch",
            id: "radar_ring",
            key: "radar_ring",
            label: t("display.radarRing"),
            tooltip: t("display.radarRingTip"),
          },
          {
            type: "switch",
            id: "show_safe_cone",
            key: "show_safe_cone",
            label: t("display.safeCone"),
            tooltip: t("display.safeConeTip"),
          },
          {
            type: "switch",
            id: "class_icons",
            key: "class_icons",
            label: t("display.classIcons"),
            tooltip: t("display.classIconsTip"),
          },
        ],
      },
      {
        id: "mm.warn",
        label: t("warn.title"),
        description: t("warn.description"),
        order: 11,
        controls: [
          { type: "switch", id: "warn_enabled", key: "warn_enabled", label: t("warn.enabled") },
          {
            type: "slider",
            id: "warn_cone",
            key: "warn_cone",
            label: t("warn.cone"),
            min: 60,
            max: 300,
            step: 10,
            unit: "°",
            default: 200,
            tooltip: t("warn.coneTip"),
            disabledWhen: { key: "warn_enabled", truthy: false },
          },
          {
            type: "slider",
            id: "warn_range",
            key: "warn_range",
            label: t("warn.range"),
            min: 25,
            max: 200,
            step: 5,
            unit: " m",
            default: 80,
            tooltip: t("warn.rangeTip"),
            disabledWhen: { key: "warn_enabled", truthy: false },
          },
          {
            type: "switch",
            id: "warn_range_invert",
            key: "warn_range_invert",
            label: t("warn.invert"),
            tooltip: t("warn.invertTip"),
            disabledWhen: { key: "warn_enabled", truthy: false },
          },
          {
            type: "slider",
            id: "warn_volume",
            key: "warn_volume",
            label: t("warn.volume"),
            min: 0,
            max: 1,
            step: 0.05,
            displayMul: 100,
            unit: "%",
            default: 1,
            disabledWhen: { key: "warn_enabled", truthy: false },
          },
          {
            type: "slider",
            id: "warn_cooldown",
            key: "warn_cooldown",
            label: t("warn.cooldown"),
            min: 0.5,
            max: 10,
            step: 0.5,
            unit: " s",
            default: 1,
            tooltip: t("warn.cooldownTip"),
            disabledWhen: { key: "warn_enabled", truthy: false },
          },
          {
            type: "switch",
            id: "warn_missiles",
            key: "warn_missiles",
            label: t("warn.missiles"),
            tooltip: t("warn.missilesTip"),
            disabledWhen: { key: "warn_enabled", truthy: false },
          },
        ],
      },
      {
        id: "mm.colors",
        label: t("colors.title"),
        description: t("colors.description"),
        order: 13,
        collapsible: true,
        defaultCollapsed: true,
        controls: COLOR_KEYS.map((k) => ({
          type: "color" as const,
          id: `color_${k}`,
          key: `color_${k}`,
          label: t(`colors.${k}`),
          alpha: false,
          default: COLOR_DEFAULTS[k],
          swatches: COLOR_SWATCHES,
          tooltip: t(`colors.${k}Tip`),
        })),
      },
      {
        id: "mm.radar",
        label: t("radar.title"),
        description: t("radar.description"),
        order: 12,
        controls: [
          {
            type: "switch",
            id: "hide_game_radar",
            key: "hide_game_radar",
            label: t("radar.hide"),
            tooltip: t("radar.hideTip"),
          },
          {
            type: "switch",
            id: "radar_layer",
            key: "radar_layer",
            label: t("radar.layer"),
            disabledWhen: { key: "hide_game_radar", truthy: true },
          },
          {
            type: "slider",
            id: "radar_layer_opacity",
            key: "radar_layer_opacity",
            label: t("radar.opacity"),
            min: 0.1,
            max: 1,
            step: 0.05,
            displayMul: 100,
            unit: "%",
            default: 0.6,
            disabledWhen: { key: "radar_layer", truthy: false },
          },
          {
            type: "segmented",
            id: "radar_layer_scale",
            key: "radar_layer_scale",
            label: t("radar.scale"),
            options: [
              { value: "near", label: t("radar.near"), tooltip: t("radar.nearTip") },
              { value: "full", label: t("radar.full"), tooltip: t("radar.fullTip") },
            ],
            disabledWhen: { key: "radar_layer", truthy: false },
          },
        ],
      },
      {
        id: "mm.overlays",
        label: t("overlays.title"),
        description: t("overlays.description"),
        order: 14,
        controls: [
          {
            type: "switch",
            id: "show_overlays",
            key: "show_overlays",
            label: t("overlays.show"),
          },
          {
            type: "segmented",
            id: "overlay_edit",
            key: "overlay_edit",
            label: t("overlays.mode"),
            options: [
              { value: false, label: t("overlays.minimap") },
              { value: true, label: t("overlays.editor"), tooltip: t("overlays.editorTip") },
            ],
          },
          {
            type: "note",
            id: "overlay_note",
            text: t("overlays.note"),
          },
        ],
      },
    ];
  }

  private readConfig(): void {
    const cfg = this.ctx.config;
    const showIn = cfg.get<unknown>("show_in", DEFAULT_SHOW_IN);
    this.showIn = new Set(Array.isArray(showIn) ? showIn.map(String) : DEFAULT_SHOW_IN);
    this.style = {
      shape: cfg.get<string>("shape", "circle") === "square" ? "square" : "circle",
      orientation: cfg.get<string>("orientation", "heading") === "north" ? "north" : "heading",
      range: num(cfg.get("range", 400), 400, 150, 1200),
      mapOpacity: num(cfg.get("map_opacity", 0.9), 0.9, 0, 1),
      radarRing: Boolean(cfg.get("radar_ring", true)),
      safeCone: num(cfg.get("warn_cone", 180), 180, 60, 300),
      showSafeCone: Boolean(cfg.get("show_safe_cone", true)) && Boolean(cfg.get("warn_enabled", true)),
      warnRange: num(cfg.get("warn_range", 300), 300, 50, 300),
      warnInvert: Boolean(cfg.get("warn_range_invert", false)),
      pointScale: num(cfg.get("point_scale", 2), 2, 0.5, 4),
      colors: Object.fromEntries(
        COLOR_KEYS.map((k) => [k, rgbHex(cfg.get(`color_${k}`, COLOR_DEFAULTS[k]), COLOR_DEFAULTS[k])]),
      ) as unknown as MinimapColors,
      zoomRange: num(cfg.get("zoom_range", ZOOM_RANGE), ZOOM_RANGE, 200, 1500),
      zoomed: this.style.zoomed,
    };
    this.hideRadar = Boolean(cfg.get("hide_game_radar", true));
    this.classIcons = Boolean(cfg.get("class_icons", true));
    const layerOn = Boolean(cfg.get("radar_layer", true));
    // Turning the layer on again retries after a failure.
    if (layerOn && !this.layerOn) this.layerFailed = false;
    this.layerOn = layerOn;
    this.layerOpacity = num(cfg.get("radar_layer_opacity", 0.6), 0.6, 0.1, 1);
    this.layerScale = cfg.get<string>("radar_layer_scale", "near") === "full" ? "full" : "near";
    this.warnOn = Boolean(cfg.get("warn_enabled", true));
    this.warnVolume = num(cfg.get("warn_volume", 0.7), 0.7, 0, 1);
    this.warnCooldownMs = num(cfg.get("warn_cooldown", 2), 2, 0.5, 10) * 1000;
    this.warnMissiles = Boolean(cfg.get("warn_missiles", true));
    this.showOverlays = Boolean(cfg.get("show_overlays", true));
    this.editing = Boolean(cfg.get("overlay_edit", false));
  }

  // ---- Map overlays ----

  /** Sanitized overlays by map, read from config once and again after each config change. */
  private overlayStore: MapOverlays | null = null;
  /** The plugin's own features (assets/overlays.json), by map. */
  private shipped: MapOverlays = {};

  private loadShipped(): void {
    try {
      const raw = JSON.parse(this.ctx.assets.readText("overlays.json")) as { maps?: Record<string, unknown> };
      for (const [key, list] of Object.entries(raw.maps ?? {})) this.shipped[key] = sanitizeList(list);
    } catch (e) {
      this.ctx.logger.warning(`minimap: assets/overlays.json unreadable - ${String(e)}`);
    }
  }

  private userOverlays(): { user: Record<string, unknown>; hidden: Record<string, unknown> } {
    const obj = (key: string) => {
      const v = this.ctx.config.get<Record<string, unknown>>(key, {});
      return v && typeof v === "object" ? v : {};
    };
    return { user: obj("map_overlays"), hidden: obj("map_overlays_hidden") };
  }

  /** Every map's features: the shipped ones with the user's edits on top. */
  private overlays(): MapOverlays {
    if (this.overlayStore) return this.overlayStore;
    const { user, hidden } = this.userOverlays();
    const store: MapOverlays = {};
    for (const key of Object.keys(this.maps)) {
      const h = hidden[key];
      store[key] = mergeOverlays(this.shipped[key] ?? [], sanitizeList(user[key]), Array.isArray(h) ? h.map(String) : []);
    }
    this.overlayStore = store;
    return store;
  }

  private onEditorAction(action: string, payload: unknown): void {
    const p = (payload ?? {}) as { map?: unknown; features?: unknown };
    if (action === "overlay.save") {
      const map = String(p.map ?? "");
      if (!this.maps[map]) return;
      const { user, hidden } = splitEdits(sanitizeList(p.features), this.shipped[map] ?? []);
      const stored = this.userOverlays();
      this.ctx.config.set("map_overlays", { ...stored.user, [map]: user });
      this.ctx.config.set("map_overlays_hidden", { ...stored.hidden, [map]: hidden });
      this.overlayStore = null;
    } else if (action === "overlay.map") {
      const map = String(payload ?? "");
      if (this.maps[map]) this.editMap = map;
    } else if (action === "overlay.done") {
      this.ctx.config.set("overlay_edit", false);
      this.editing = false;
    }
  }

  /** Adds a seen mode or vehicle to its config list, so the editor can offer it as a filter. */
  private noteSeen(key: "seen_modes" | "seen_vehicles", value: unknown): void {
    if (typeof value !== "string" || !value) return;
    const list = this.ctx.config.get<string[]>(key, []);
    if (Array.isArray(list) && list.includes(value)) return;
    this.ctx.config.set(key, [...(Array.isArray(list) ? list : []), value].slice(-64));
  }

  private matchContext(): MatchContext {
    const s = (v: unknown) => (typeof v === "string" ? v : "");
    return {
      mode: s(this.acc?.read("game_mode")),
      role: s(this.acc?.read("player_role")),
      vehicle: s(this.acc?.read("player_vehicle")),
    };
  }

  /** The overlays of this map that match this match, to the minimap. */
  private pushOverlays(map: string, m: MatchContext | null): void {
    const list = this.showOverlays ? (this.overlays()[map] ?? []) : [];
    const shown = m ? visibleFeatures(list, m) : list;
    const s = JSON.stringify(shown);
    if (s === this.lastOverlays) return;
    this.lastOverlays = s;
    this.ov?.setJson("overlays", shown);
  }

  /** Editor data for the chosen map, or null when the editor is off. The player goes on its own path, as it moves. */
  private pushEditor(radar: RadarRead | null): void {
    const map = this.maps[this.editMap] ? this.editMap : this.maps[this.map] ? this.map : SIM_MAP;
    const m = this.matchContext();
    const seen = (key: string) => this.ctx.config.get<string[]>(key, []);
    const data = this.editing
      ? {
          map,
          maps: Object.keys(this.maps)
            .sort()
            .map((key) => ({ key, name: this.mapLabel(key) })),
          layer: this.mapRect(map),
          features: this.overlays()[map] ?? [],
          presets: PRESETS.map((p) => ({ ...p, label: this.t(`presets.${p.tag}`) })),
          roles: ROLES,
          // A mode the locales do not know keeps the name the game sent.
          modes: modeOptions([...seen("seen_modes"), m.mode].filter(Boolean)).map((o) => {
            const key = `modes.${o.value}`;
            const label = this.t(key);
            return label === key ? o : { ...o, label };
          }),
          // The whole roster at all times, plus any other vehicle seen in a match.
          vehicles: roster([...seen("seen_vehicles"), m.vehicle], (s) => this.ctx.assets.exists(`tanks/${s}.png`)),
          current: m,
        }
      : null;
    const s = JSON.stringify(data);
    if (s !== this.lastEditor) {
      this.lastEditor = s;
      this.ov?.setJson("editor", data);
    }
    const pos = radar ? worldPos(radar) : null;
    const player =
      this.editing && pos && map === this.map
        ? { x: Math.round(pos.x * 10) / 10, y: Math.round(pos.y * 10) / 10, heading: Math.round(radar?.camera ?? 0) }
        : null;
    const p = JSON.stringify(player);
    if (p !== this.lastEditorPlayer) {
      this.lastEditorPlayer = p;
      this.ov?.setJson("editorPlayer", player);
    }
  }

  /** The hotkey: the editor puts a mark, or the next corner, at the player's position. */
  private markHere(): void {
    if (!this.editing) return;
    this.ov?.setJson("editorCmd", { id: ++this.cmdSeq, type: "here" });
  }

  private mapLabel(key: string): string {
    const name = this.t(`maps.${key}`);
    if (name !== `maps.${key}`) return `${key} ${name}`;
    const scene = (this.maps[key]?.scene ?? key).split("_").slice(1, -1).join(" ");
    return `${key} ${scene.replace(/\b\w/g, (c) => c.toUpperCase())}`;
  }

  private size(): { w: number; h: number } {
    return {
      w: Number(this.ctx.config.get("vue_width", DEFAULT_W)) || DEFAULT_W,
      h: Number(this.ctx.config.get("vue_height", DEFAULT_H)) || DEFAULT_H,
    };
  }

  private savedRect(w: number, h: number): Rect | undefined {
    const saved = this.ctx.config.get<Partial<Rect> | null>(POS_KEY, null);
    if (saved && typeof saved === "object" && typeof saved.x === "number" && typeof saved.y === "number") {
      return { x: saved.x, y: saved.y, w: saved.w ?? w, h: saved.h ?? h };
    }
    return undefined;
  }

  private tags(): string[] {
    const tags = this.acc?.read("scene_tags");
    return Array.isArray(tags) ? tags.map(String) : [];
  }

  private setVisible(want: boolean): void {
    const visible = this.hostVisible && want;
    if (visible === this.lastVisible) return;
    this.lastVisible = visible;
    this.ov?.setVisible(visible);
  }

  private setZoom(on: boolean): void {
    if (this.style.zoomed === on) return;
    this.style = { ...this.style, zoomed: on };
    this.pushStyle();
  }

  private pushStyle(): void {
    const s = JSON.stringify(this.style);
    if (s === this.lastStyle) return;
    this.lastStyle = s;
    this.ov?.setJson("style", this.style);
  }

  private pushView(view: MinimapView): void {
    if (this.ctx.state !== "calibrate" && !this.lastVisible) return;
    const s = JSON.stringify(view);
    if (s === this.lastView) return;
    this.lastView = s;
    this.ov?.setJson("view", view);
  }

  override enterCalibrate(): void {
    const { w, h } = this.size();
    const rect = this.savedRect(w, h);
    if (rect) this.ov?.setRect(rect);
    this.simT = 0;
    this.lastView = "";
    this.lastVisible = null;
  }

  override enterLocked(): void {
    this.lastView = "";
    this.lastVisible = null;
  }

  override setOverlayVisible(visible: boolean): void {
    this.hostVisible = visible;
    this.lastVisible = null;
  }

  override tick(dt: number): void {
    this.ctx.config.checkReload();
    this.followAppLanguage();
    this.readConfig();
    this.pushStyle();
    if (!this.ov) return;

    if (this.editing) {
      // The editor replaces the minimap in every state and scene, also out of a match.
      this.setVisible(true);
      this.followMatch();
      const raw = this.acc?.read("radar");
      this.pushEditor(isRadar(raw) && raw.pos ? raw : null);
      return;
    }
    this.pushEditor(null);

    if (this.ctx.state === "calibrate") {
      this.simT += dt;
      this.pushView(this.simView(this.simT));
      this.pushOverlays(this.maps[this.map] ? this.map : SIM_MAP, null);
      return;
    }
    if (this.ctx.state !== "locked") return;

    const tags = this.tags();
    this.setVisible(tags.some((t) => this.showIn.has(t)));
    this.followMatch();
    const match = this.matchContext();
    this.pushOverlays(this.map, match);
    const seen = `${match.mode}|${match.vehicle}`;
    if (seen !== this.seenMatch) {
      this.seenMatch = seen;
      this.noteSeen("seen_vehicles", match.vehicle);
      this.noteSeen("seen_modes", match.mode);
    }

    const raw = this.acc?.read("radar");
    const radar = isRadar(raw) && raw.pos ? raw : null;
    this.syncHideRadar(radar);
    this.syncLayer(radar);
    const player = radar ? worldPos(radar) : null;
    if (!radar || !player) {
      this.tracker.reset();
      this.classJoin.reset();
      return;
    }

    const now = Date.now();
    const { blips, fresh, scanned } = this.tracker.update(radar, now);
    const classes = this.classIcons ? this.classJoin.update(blips, this.vehicles(), now) : null;
    const alive = tags.includes("alive") && Boolean(radar.visible);
    if (alive) this.maybeWarn(fresh, scanned, player, radar.camera, now);
    if (this.warn && now > this.warn.until) this.warn = null;
    const threat =
      alive && this.warnOn && blips.some((b) => b.aff === AFF_ENEMY && this.zoneSide(b, player, radar.camera) !== null);

    const { bases, learnedNow } = readBases(radar, this.learned);
    this.learn(learnedNow);

    this.pushView({
      map: this.mapRect(this.map),
      player: { x: player.x, y: player.y, camera: radar.camera, turret: radar.turret },
      blips: blips.map((b) => ({
        x: Math.round(b.x * 10) / 10,
        y: Math.round(b.y * 10) / 10,
        aff: b.aff,
        type: b.type,
        platoon: b.platoon,
        age: Math.min(1, Math.round(((now - b.seenMs) / 2600) * 20) / 20),
        role: classes?.get(b.key)?.role ?? "",
        heading: isAir(b.type) ? Math.round(airHeading(b.rot)) : 0,
        inbound: this.isInbound(b, player),
      })),
      bases: bases.map((b) => ({
        sign: b.sign,
        status: b.status,
        progress: b.progress,
        x: b.x,
        y: b.y,
        bearing: b.bearing,
        icon: b.icon,
        iconBlink: b.iconBlink,
      })),
      warn: this.warn ? { id: this.warn.id, rel: this.warn.rel, side: this.warn.side } : null,
      threat,
      radarRange: radar.range || 300,
      mapName: this.displayName(),
      contacts: blips.filter((b) => b.aff === AFF_ENEMY && b.type !== TYPE_MISSILE).length,
      sim: false,
    });
  }

  /** The scoreboard name when seen, else the scene name without its number and mode. */
  private displayName(): string {
    const sb = this.acc?.read("sb_map_name");
    if (typeof sb === "string" && sb.trim()) this.mapName = sb.trim();
    if (this.mapName) return this.mapName;
    const scene = this.maps[this.map]?.scene ?? "";
    return scene.split("_").slice(1, -1).join(" ");
  }

  /** Accessors' `vehicles` read: markers with a class, for the class join. */
  private vehicles(): JoinMarker[] {
    const raw = this.acc?.read("vehicles");
    if (!Array.isArray(raw)) return [];
    return raw.filter(
      (m): m is JoinMarker =>
        !!m && typeof m === "object" && typeof (m as JoinMarker).dist === "number" && typeof (m as JoinMarker).role === "string",
    );
  }

  /** New map or mode: forget blips and load what this plugin learned about its capture points. */
  private followMatch(): void {
    const map = mapKey(this.acc?.read("map_slug"));
    const mode = String(this.acc?.read("game_mode") ?? "");
    if (map === this.map && mode === this.mode) return;
    this.map = map;
    this.mode = mode;
    this.tracker.reset();
    this.classJoin.reset();
    this.learned.clear();
    this.mapName = "";
    const all = this.ctx.config.get<Record<string, Record<string, [number, number]>>>("learned_bases", {});
    for (const [sign, p] of Object.entries(all?.[`${map}|${mode}`] ?? {})) {
      if (Array.isArray(p) && p.length === 2) this.learned.set(sign, { x: Number(p[0]), y: Number(p[1]) });
    }
  }

  /** Keeps capture point positions seen inside the radar range, per map and mode. */
  private learn(now: [string, Vec][]): void {
    if (!this.map || !now.length) return;
    let changed = false;
    for (const [sign, p] of now) {
      const old = this.learned.get(sign);
      if (old && Math.hypot(old.x - p.x, old.y - p.y) < 5) continue;
      this.learned.set(sign, p);
      changed = true;
    }
    if (!changed) return;
    const all = { ...this.ctx.config.get<Record<string, unknown>>("learned_bases", {}) };
    all[`${this.map}|${this.mode}`] = Object.fromEntries(
      [...this.learned].map(([s, p]) => [s, [Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10]]),
    );
    this.ctx.config.set("learned_bases", all);
  }

  /** The warning rule for one enemy: its side when it is in the warning zone, else null. Missiles have their own rule. */
  private zoneSide(c: { x: number; y: number; type: number }, player: Vec, camera: number): { rel: number; side: WarnSide } | null {
    if (c.type === TYPE_MISSILE) return null;
    if (!inWarnRange(Math.hypot(c.x - player.x, c.y - player.y), this.style.warnRange, this.style.warnInvert)) return null;
    const rel = wrap180(bearing(player, c) - camera);
    const side = warnSide(rel, this.style.safeCone);
    return side ? { rel, side } : null;
  }

  /** An enemy missile whose heading points at you. Its side and range do not matter. */
  private isInbound(c: { x: number; y: number; type: number; aff: number; rot: number }, player: Vec): boolean {
    return (
      this.warnMissiles &&
      c.type === TYPE_MISSILE &&
      c.aff === AFF_ENEMY &&
      onCollisionCourse(c, airHeading(c.rot), player)
    );
  }

  private maybeWarn(fresh: Contact[], scanned: Contact[], player: Vec, camera: number, now: number): void {
    if (!this.warnOn) return;
    // A missile warns once, on its first scan on course to you. The cooldown does not hold it back.
    for (const c of scanned) {
      if (c.warned || !this.isInbound({ ...c, aff: AFF_ENEMY }, player)) continue;
      c.warned = true;
      const rel = wrap180(bearing(player, c) - camera);
      this.sound(rel, warnSide(rel, 0) ?? (rel < 0 ? "left" : "right"), now);
      return;
    }
    if (!fresh.length || now - this.lastWarnMs < this.warnCooldownMs) return;
    let pick: { rel: number; side: WarnSide } | null = null;
    for (const c of fresh) {
      const hit = this.zoneSide(c, player, camera);
      if (hit && (!pick || Math.abs(hit.rel) > Math.abs(pick.rel))) pick = hit;
    }
    if (pick) this.sound(pick.rel, pick.side, now);
  }

  private sound(rel: number, side: WarnSide, now: number): void {
    this.lastWarnMs = now;
    this.warn = { id: ++this.warnSeq, rel, side, until: now + WARN_SHOW_MS };
    if (this.warnVolume > 0) this.ctx.audio.play(SOUNDS[side], { volume: this.warnVolume });
  }

  private mapRect(key: string): MinimapView["map"] {
    const m = this.maps[key];
    if (!m) return null;
    const layer = (image: string, [pw, ph]: [number, number], mpp: number): MapLayer => {
      const w = pw * mpp;
      const h = ph * mpp;
      return { image, x0: m.center[0] - w / 2, ytop: m.center[1] + h / 2, w, h };
    };
    const wide = m.wide && m.wide_size_px && m.wide_m_per_px ? layer(m.wide, m.wide_size_px, m.wide_m_per_px) : null;
    return { ...layer(m.image, m.size_px, m.m_per_px), wide };
  }

  // ---- Map layer inside the game radar ----

  private radarImage(info: MapInfo): string {
    let b64 = this.radarImages.get(info.radar);
    if (!b64) {
      b64 = this.ctx.assets.read(info.radar).toString("base64");
      this.radarImages.set(info.radar, b64);
    }
    return b64;
  }

  /**
   * The layer follows the player with Gameface data binding on `radarMapModel`, so it moves every frame
   * inside the game page with no per-frame traffic from FUSE.
   */
  private layerHtml(info: MapInfo, radar: RadarRead): string {
    const circle = radar.circle || 105;
    const bp = radar.breakpoints.length ? radar.breakpoints : DEFAULT_BREAKPOINTS;
    const k = this.layerScale === "full" ? circle / (radar.range || 300) : bp[0]![1] / bp[0]![0];
    const [pw, ph] = info.radar_size_px;
    const w = pw * info.radar_m_per_px;
    const h = ph * info.radar_m_per_px;
    // The binding reads the raw radar position, so the image corner moves into that frame too.
    const [sx, sy] = radar.map_size ?? [0, 0];
    const x0 = info.center[0] - w / 2 + sx / 2;
    const ytop = info.center[1] + h / 2 + sy / 2;
    const f = (v: number) => v.toFixed(3);
    const tx = `(${f(circle)} - ({{radarMapModel.mapOffsetX}} - (${f(x0)})) * ${f(k)})`;
    const ty = `(${f(circle)} - ((${f(ytop)}) - {{radarMapModel.mapOffsetY}}) * ${f(k)})`;
    return (
      `<div id="${LAYER_ID}" style="position:absolute;left:0;top:0;width:${f(w * k)}rem;height:${f(h * k)}rem;` +
      `background-image:url(data:image/jpeg;base64,${this.radarImage(info)});background-size:100% 100%;` +
      `pointer-events:none;" ` +
      `data-bind-style-transform="'translate(' + ${tx} + 'rem,' + ${ty} + 'rem)'"></div>`
    );
  }

  /** Keeps the hide stylesheet on battle_hud in step with the switch, also after the page comes back. */
  private syncHideRadar(radar: RadarRead | null): void {
    const acc = this.acc;
    if (!acc || this.hideBusy) return;
    if (!radar) {
      this.hideApplied = null;
      return;
    }
    if (this.hideApplied === this.hideRadar) return;
    const want = this.hideRadar;
    this.hideBusy = true;
    acc
      .injectStylesheetOn(HUD, want ? HIDE_RADAR_CSS : null, HIDE_RADAR_ID)
      .then((ok) => {
        if (ok) this.hideApplied = want;
      })
      .catch((e) => {
        this.hideApplied = want;
        this.ctx.logger.warning(`minimap: cannot hide the game radar - ${String(e)}`);
      })
      .finally(() => {
        this.hideBusy = false;
      });
  }

  private syncLayer(radar: RadarRead | null): void {
    const acc = this.acc;
    if (!acc || this.layerBusy || this.layerFailed) return;
    if (!radar) {
      // No radar read means no battle_hud: the layer went with the page.
      this.layerKey = "";
      this.layerStyle = "";
      return;
    }
    const info = this.maps[this.map];
    const want =
      this.layerOn && !this.hideRadar && info
        ? `${this.map}|${this.layerScale}|${radar.circle}|${radar.range}|${radar.map_size ?? ""}`
        : "";
    const now = Date.now();
    if (want === this.layerKey) {
      if (want && this.layerStyle !== String(this.layerOpacity)) {
        // Opacity rides on a stylesheet, so a slider drag does not resend the image.
        const opacity = String(this.layerOpacity);
        this.layerBusy = true;
        acc
          .injectStylesheetOn(HUD, `#${LAYER_ID} { opacity: ${opacity} !important; }`, LAYER_STYLE_ID)
          .then((ok) => {
            if (ok) this.layerStyle = opacity;
          })
          .catch(() => undefined)
          .finally(() => {
            this.layerBusy = false;
          });
        return;
      }
      if (!want || now < this.layerCheckAt) return;
      // The HUD can rebuild its radar, which drops the layer.
      this.layerCheckAt = now + LAYER_CHECK_MS;
      this.layerBusy = true;
      acc
        .countMatches(HUD, [`#${LAYER_ID}`])
        .then((n) => {
          if (n && n[`#${LAYER_ID}`] === 0) this.layerKey = "";
        })
        .catch(() => undefined)
        .finally(() => {
          this.layerBusy = false;
        });
      return;
    }
    if (now < this.layerRetryAt) return;
    const html = want && info && radar ? this.layerHtml(info, radar) : "";
    this.layerBusy = true;
    acc
      .insertHtmlOn(HUD, RADAR_DISPLAY, html, "afterbegin", LAYER_ID)
      .then((ok) => {
        if (ok) {
          this.layerKey = want;
          this.layerCheckAt = Date.now() + LAYER_CHECK_MS;
        } else {
          // A missing radar (loading, death screen) waits before the next try.
          this.layerRetryAt = Date.now() + LAYER_RETRY_MS;
        }
      })
      .catch((e) => {
        // Without the accessors.ui permission every call fails; stop retrying.
        this.layerFailed = true;
        this.ctx.logger.warning(`minimap: game radar layer unavailable - ${String(e)}`);
      })
      .finally(() => {
        this.layerBusy = false;
      });
  }

  // ---- Calibration preview ----

  /** A scripted drive for calibration: the player circles, the view turns, enemies appear behind and to the side. */
  private simView(t: number): MinimapView {
    const key = this.maps[this.map] ? this.map : SIM_MAP;
    const a = t * 0.15;
    const player = { x: Math.cos(a) * 160, y: Math.sin(a) * 160 };
    const camera = wrap180(90 - (a * 180) / Math.PI + 25 * Math.sin(t * 0.7));
    const at = (deg: number, d: number) => {
      const r = ((camera + deg) * Math.PI) / 180;
      return { x: player.x + Math.sin(r) * d, y: player.y + Math.cos(r) * d };
    };
    const phase = t % 6;
    const role = (r: string) => (this.classIcons ? r : "");
    const age = (t % 2) / 2;
    const ground = { heading: 0, inbound: false };
    // Air: straight passes at 45-60 m/s like the live drone tracks, and orbits. Headings are clockwise from north.
    const fly = (from: Vec, heading: number, speed: number, s: number) => {
      const r = (heading * Math.PI) / 180;
      return { x: from.x + Math.sin(r) * speed * s, y: from.y + Math.cos(r) * speed * s, heading, inbound: false };
    };
    const orbit = (c: Vec, radius: number, speed: number) => {
      const th = (t * speed) / radius;
      return { x: c.x + Math.sin(th) * radius, y: c.y + Math.cos(th) * radius, heading: wrap180((th * 180) / Math.PI + 90), inbound: false };
    };
    // A missile runs at you from the left rear, offset by half a loop from the ground warning.
    const attackPhase = (t + 3) % 6;
    const attackBearing = wrap180(camera - 120);
    const attack = { ...at(-120, 300 - 50 * attackPhase), heading: wrap180(attackBearing + 180), inbound: this.warnMissiles };
    const air = (o: { x: number; y: number; heading: number; inbound: boolean }, aff: number, type: number): ViewBlip => ({
      ...o,
      aff,
      type,
      platoon: 0,
      age,
      role: "",
    });
    const blips: ViewBlip[] = [
      { ...at(20, 120), aff: 2, type: 0, platoon: 0, age, role: role("assault"), ...ground },
      { ...at(-40, 210), aff: 2, type: 0, platoon: 1, age, role: role("marksman"), ...ground },
      { ...at(60, 90), aff: 2, type: 0, platoon: 0, age, role: "", ...ground },
      { ...at(10, 260), aff: AFF_ENEMY, type: 0, platoon: 0, age, role: role("defender"), ...ground },
      air(fly({ x: -420, y: 120 }, 100, 60, t % 14), 2, TYPE_PLANE),
      air(fly({ x: 300, y: -380 }, -30, 60, (t + 7) % 14), AFF_ENEMY, TYPE_PLANE),
      air(orbit({ x: 110, y: -40 }, 90, 45), AFF_ENEMY, TYPE_HELI),
      air(orbit({ x: -140, y: 90 }, 50, 20), AFF_ENEMY, TYPE_DRONE),
      air(orbit({ x: 60, y: 200 }, 40, 15), 2, TYPE_DRONE),
      air(attack, AFF_ENEMY, TYPE_MISSILE),
    ];
    if (phase > 1) {
      blips.push({ ...at(160, 150), aff: AFF_ENEMY, type: 0, platoon: 0, age: Math.min(1, (phase - 1) / 2.6), role: "", ...ground });
    }
    const loop = Math.floor(t / 6) * 2;
    const warn =
      phase > 1 && phase < 2.5
        ? { id: loop + 1, rel: 160, side: "rear" as WarnSide }
        : this.warnMissiles && attackPhase < 1.5
          ? { id: loop + 2, rel: -120, side: "left" as WarnSide }
          : null;
    // The enemy at 160° and 150 m sits in the default warning zone.
    const threat = phase > 1;
    const bases: ViewBase[] = [
      { sign: "A", status: 64, progress: 1, ...at(-70, 180), bearing: 0, icon: "", iconBlink: false },
      { sign: "B", status: 16 | 32 | 512, progress: (t % 8) / 8, ...at(55, 230), bearing: 0, icon: "", iconBlink: false },
      { sign: "C", status: 128, progress: 1 - (t % 8) / 8, x: null, y: null, bearing: wrap180(camera + 120), icon: "", iconBlink: false },
      { sign: "D", status: 8 | 2048 | 512, progress: 1, ...at(-150, 120), bearing: 0, icon: "", iconBlink: false },
      { sign: "E", status: 4, progress: 0, ...at(100, 140), bearing: 0, icon: "", iconBlink: false },
    ];
    return {
      map: this.mapRect(key),
      player: { x: player.x, y: player.y, camera, turret: camera + 10 * Math.sin(t) },
      blips,
      bases,
      warn,
      threat,
      radarRange: 300,
      mapName: this.maps[key]?.scene.split("_").slice(1, -1).join(" ") ?? "",
      contacts: blips.filter((b) => b.aff === AFF_ENEMY && b.type !== TYPE_MISSILE).length,
      sim: true,
    };
  }

  override teardown(): void {
    if (this.layerKey) this.acc?.insertHtmlOn(HUD, RADAR_DISPLAY, "", "afterbegin", LAYER_ID).catch(() => undefined);
    if (this.hideApplied) this.acc?.injectStylesheetOn(HUD, null, HIDE_RADAR_ID).catch(() => undefined);
    this.ov?.remove();
  }
}
