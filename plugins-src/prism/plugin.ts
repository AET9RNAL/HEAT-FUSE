import { FusePlugin, ConfigCategory, ConfigEntry, type FuseContext } from "@fuse/plugin-sdk";
import { HUD } from "../_shared/hudSelectors.js";

interface Accessors {
  readonly connected: boolean;
  injectStylesheet(css: string | null, styleId?: string): void;
  injectStylesheetMarkers(css: string | null, styleId?: string): void;
}

/** Class-substring selector helper for elements not in the shared HUD map. */
const c = (name: string) => `[class*="${name}"]`;

type ColorProp = "color" | "background-color" | "border-color";
interface ColorTarget {
  sel: string;
  prop: ColorProp;
}


interface PrismEl {
  key: string;
  label: string;
  color?: ColorTarget[];
  xformSel: string[];
}

interface Section {
  category: string;
  items: PrismEl[];
}

const SECTIONS: Section[] = [
  {
    category: "HP",
    items: [
      { key: "hp_bar", label: "HP Bar", color: [{ sel: HUD.HP_PROGRESS_INNER, prop: "background-color" }], xformSel: [HUD.HP_BASE] },
      { key: "hp_label", label: "HP Label", color: [{ sel: HUD.HP_VALUE, prop: "color" }], xformSel: [HUD.HP_VALUE_WRAPPER] },
    ],
  },
  {
    category: "Energy",
    items: [
      { key: "en_bar", label: "Energy Bar", color: [{ sel: HUD.MANA_PROGRESS, prop: "background-color" }], xformSel: [HUD.MANA_BASE] },
      { key: "en_label", label: "Energy Label", color: [{ sel: HUD.MANA_VALUE, prop: "color" }], xformSel: [HUD.MANA_VALUE_WRAPPER] },
    ],
  },
  {
    category: "Abilities & Equipment",
    // They seem to be using .pngs hero so can't recolor anything
    items: [
      { key: "abilities", label: "Ability Panel", xformSel: [HUD.ABILITY_PANEL] },
      { key: "equipment", label: "Equipment", xformSel: [HUD.EQUIPMENT] },
    ],
  },
  {
    category: "Speedometer",
    items: [
      {
        key: "speedo_bar",
        label: "Speedometer / Boost",
        // glow behind the value + the boost/sprint drain bar
        color: [
          { sel: HUD.SPEEDOMETER_GLOW, prop: "background-color" },
          { sel: HUD.SPRINT_GLOW, prop: "background-color" },
          { sel: HUD.SPRINT_DRAIN, prop: "background-color" },
        ],
        xformSel: [HUD.SPEEDOMETER],
      },
      {
        key: "speedo_label",
        label: "Speed Label",
        color: [
          { sel: HUD.SPEEDOMETER_VALUE, prop: "color" },
          { sel: HUD.SPEEDOMETER_UNIT, prop: "color" },
        ],
        xformSel: [HUD.SPEEDOMETER_VALUE, HUD.SPEEDOMETER_UNIT],
      },
    ],
  },
  {
    category: "System",
    items: [
      {
        key: "perf",
        label: "Ping / FPS",
        color: [
          { sel: HUD.PERF_PING, prop: "color" }, // values
          { sel: c("PerfInfo_statName"), prop: "color" }, // "Ping" / "FPS" labels
        ],
        xformSel: [HUD.PERF_INFO],
      },
    ],
  },
  {
    category: "Crosshair",
    items: [
      { key: "aim", label: "Aim Circle", color: [{ sel: HUD.DEFAULT_AIM_CIRCLE, prop: "border-color" }], xformSel: [HUD.AIM_SWITCHER] },
      { key: "mark", label: "Center Mark", color: [{ sel: HUD.CROSSHAIR_MARK, prop: "background-color" }], xformSel: [HUD.CROSSHAIR_MARK] },
      // Same here, 100% a .png
      { key: "reticle", label: "Reticle (scale/rotate)", xformSel: [HUD.DEFAULT_RETICLE] },
    ],
  },
  {
    category: "Weapons",
    items: [
      { key: "shell", label: "Shell Type", color: [{ sel: c("DefaultLoader_caption"), prop: "color" }], xformSel: [HUD.AMMO_LOADER] },
      { key: "reload", label: "Reload Ring", color: [{ sel: c("DefaultLoader_progress"), prop: "border-color" }], xformSel: [c("DefaultLoader_reloader")] },
      // Kept separate from the ring/minigame so it can stay a contrasting colour
      { key: "reload_label", label: "Reload Time", color: [{ sel: `${c("ReloadTimer_base")} div`, prop: "color" }], xformSel: [c("ReloadTimer_base")] },
      {
        key: "reload_mini",
        label: "Reload Minigame",
        // fast-reload hit zones & timer bar; the moving indicator is left white for contrast
        color: [
          { sel: HUD.ACTIVE_RELOAD_TIMER, prop: "background-color" },
          { sel: HUD.RELOAD_HIT_PERFECT, prop: "background-color" },
          { sel: HUD.RELOAD_HIT_SECONDARY, prop: "background-color" },
        ],
        xformSel: [HUD.ACTIVE_RELOAD],
      },
    ],
  },
];

const ALL_ITEMS: PrismEl[] = SECTIONS.flatMap((s) => s.items);
const STYLE_ID = "__fuse_prism__";
const STYLE_ID_MARKERS = "__fuse_prism_m__";

// Global team colours 
// Vehicle markers carry don't carry an ally/enemy class, so we do a crutch check by the color.
const ENEMY_MARK = '[class*="VehicleMarker_base"][style*="--hero-color: #FF6D46"]';
const ALLY_MARK = '[class*="VehicleMarker_base"]:not([style*="--hero-color: #FF6D46"])';

function markerRules(prefix: string, rgba: string): string[] {
  return [
    `${prefix} [class*="VehicleMarker_heroLabel"] { color: ${rgba} !important; }`,
    `${prefix} [class*="VehicleMarker_userName"] { color: ${rgba} !important; }`,
    `${prefix} [class*="RoleIcon_base"] path { fill: ${rgba} !important; }`,
    `${prefix} [class*="HealthPanel"] [class*="ProgressBar_progressBg"] { background-color: ${rgba} !important; }`,
    `${prefix} [class*="StickDirectionPointer"] path { fill: ${rgba} !important; }`,
  ];
}

function scoreObjRules(team: "ally" | "enemy", rgba: string): string[] {
  return [
    `[class*="ScoreProgress_progressWrapper__${team}"] [class*="ProgressBar_progressBg"] { background-color: ${rgba} !important; }`,
    `[class*="ObjectiveProgress_base"] [class*="__${team}"] [class*="ProgressBar_progressBg"] { background-color: ${rgba} !important; }`,
  ];
}

const K_TINT = (k: string) => `${k}_tint`;
const K_COLOR = (k: string) => `${k}_color`;
const K_SCALE = (k: string) => `${k}_scale`;
const K_ROT = (k: string) => `${k}_rot`;

const PRESET_NONE = "None";
const WHITE = "#FFFFFFFF";

function cbPreset(hp: string, en: string, speed: string, reload: string, mark: string): Record<string, boolean | string> {
  return {
    hp_bar_tint: true, hp_bar_color: hp,
    hp_label_tint: true, hp_label_color: WHITE,
    en_bar_tint: true, en_bar_color: en,
    en_label_tint: true, en_label_color: WHITE,
    speedo_bar_tint: true, speedo_bar_color: speed,
    speedo_label_tint: true, speedo_label_color: WHITE,
    perf_tint: true, perf_color: WHITE,
    shell_tint: true, shell_color: WHITE,
    reload_tint: true, reload_color: reload, // ring
    reload_mini_tint: true, reload_mini_color: reload, // minigame zones + revealed container
    reload_label_tint: true, reload_label_color: WHITE, // stays white so it reads over that container
    mark_tint: true, mark_color: mark,
    aim_tint: true, aim_color: WHITE,
  };
}

const PRESETS: Record<string, Record<string, boolean | string | number>> = {
  "Colourblind - Deuteranopia": cbPreset("#0072B2FF", "#E69F00FF", "#56B4E9FF", "#E69F00FF", "#F0E442FF"),
  "Colourblind - Protanopia": cbPreset("#0072B2FF", "#F0E442FF", "#56B4E9FF", "#F0E442FF", "#E69F00FF"),
  "Colourblind - Tritanopia": cbPreset("#D55E00FF", "#009E73FF", "#CC79A7FF", "#CC79A7FF", "#D55E00FF"),
  "High Contrast": {
    hp_bar_tint: true, hp_bar_color: "#00FF66FF",
    en_bar_tint: true, en_bar_color: "#00E5FFFF",
    hp_label_tint: true, hp_label_color: "#FFFFFFFF",
    en_label_tint: true, en_label_color: "#FFFFFFFF",
    mark_tint: true, mark_color: "#FFEE00FF",
    aim_tint: true, aim_color: "#FFEE00FF",
  },
};
const PRESET_CHOICES = [PRESET_NONE, ...Object.keys(PRESETS)];

/** "#RRGGBB" / "#RRGGBBAA" -> "rgba(r, g, b, a)" (CoHTML-safe), or null. */
function hexToRgba(hex: unknown): string | null {
  if (typeof hex !== "string") return null;
  let s = hex.trim().replace(/^#/, "");
  if (s.length === 3) s = s.split("").map((ch) => ch + ch).join("");
  if (s.length === 6) s += "ff";
  if (s.length !== 8 || /[^0-9a-fA-F]/.test(s)) return null;
  const r = parseInt(s.slice(0, 2), 16);
  const g = parseInt(s.slice(2, 4), 16);
  const b = parseInt(s.slice(4, 6), 16);
  const a = parseInt(s.slice(6, 8), 16) / 255;
  return `rgba(${r}, ${g}, ${b}, ${a.toFixed(3)})`;
}

function num(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export class PrismPlugin extends FusePlugin {
  static override requiresCalibration = false;

  private ctx!: FuseContext;
  private acc: Accessors | undefined;
  private dirty = true;
  private lastConnected = false;

  setup(ctx: FuseContext): void {
    this.ctx = ctx;
    this.acc = ctx.services.get<Accessors>("accessors");
    if (!this.acc) ctx.logger.error("prism: 'accessors' service not available - plugin inactive");

    const defaults: Record<string, unknown> = {
      preset: PRESET_NONE,
      enemy_tint: false, enemy_color: "#FF6D46FF",
      ally_tint: false, ally_color: "#84FFB1FF",
    };
    for (const it of ALL_ITEMS) {
      if (it.color) {
        defaults[K_TINT(it.key)] = false;
        defaults[K_COLOR(it.key)] = "#FFFFFFFF";
      }
      defaults[K_SCALE(it.key)] = 1.0;
      defaults[K_ROT(it.key)] = 0.0;
    }
    ctx.config.defaults(defaults).load();

    const sectionCategories = SECTIONS.map(
      (sec) =>
        new ConfigCategory(
          sec.category,
          sec.items.flatMap((it) => {
            const entries: ConfigEntry[] = [];
            if (it.color) {
              entries.push(new ConfigEntry({ key: K_TINT(it.key), label: `${it.label}: Tint`, type: "bool", description: "Enable colour override" }));
              entries.push(new ConfigEntry({ key: K_COLOR(it.key), label: `${it.label}: Colour`, type: "color" }));
            }
            entries.push(new ConfigEntry({ key: K_SCALE(it.key), label: `${it.label}: Scale`, type: "float", min: 0.1, max: 5.0 }));
            entries.push(new ConfigEntry({ key: K_ROT(it.key), label: `${it.label}: Rotation`, type: "float", min: -180, max: 180 }));
            return entries;
          }),
        ),
    );

    ctx.config.schema([
      new ConfigCategory("Accessibility", [
        new ConfigEntry({
          key: "preset",
          label: "Quick Preset",
          type: "choice",
          choices: PRESET_CHOICES,
          description: "One-click styling tuned for a specific need. Resets and overwrites the sections below - pick None to clear, then fine-tune manually.",
        }),
      ]),
      new ConfigCategory("Team Colours", [
        new ConfigEntry({ key: "enemy_tint", label: "Recolour Enemies", type: "bool", description: "Enemy markers (icon / name / health), score bar + objective" }),
        new ConfigEntry({ key: "enemy_color", label: "Enemy Colour", type: "color" }),
        new ConfigEntry({ key: "ally_tint", label: "Recolour Allies", type: "bool", description: "Ally markers (icon / name / health), score bar + objective" }),
        new ConfigEntry({ key: "ally_color", label: "Ally Colour", type: "color" }),
      ]),
      ...sectionCategories,
    ]);

    ctx.config.watch("preset", (v) => this.applyPreset(String(v)));
    for (const k of ["enemy_tint", "enemy_color", "ally_tint", "ally_color"]) {
      ctx.config.watch(k, () => (this.dirty = true));
    }

    for (const it of ALL_ITEMS) {
      const keys = [K_SCALE(it.key), K_ROT(it.key)];
      if (it.color) keys.push(K_TINT(it.key), K_COLOR(it.key));
      for (const k of keys) ctx.config.watch(k, () => (this.dirty = true));
    }
  }

  /** Reset every element to its default, then overlay the chosen preset. */
  private applyPreset(name: string): void {
    const bundle: Record<string, boolean | string | number> = {};
    for (const it of ALL_ITEMS) {
      if (it.color) {
        bundle[K_TINT(it.key)] = false;
        bundle[K_COLOR(it.key)] = "#FFFFFFFF";
      }
      bundle[K_SCALE(it.key)] = 1.0;
      bundle[K_ROT(it.key)] = 0.0;
    }
    Object.assign(bundle, PRESETS[name] ?? {});
    this.ctx.config.update(bundle);
    this.dirty = true;
  }

  override tick(_dt: number): void {
    this.ctx.config.checkReload();
    if (!this.acc) return;

    const connected = this.acc.connected;
    if (connected && !this.lastConnected) this.dirty = true; // re-apply on (re)connect
    this.lastConnected = connected;

    if (this.dirty && connected) this.apply();
  }

  private apply(): void {
    const cfg = this.ctx.config;
    const rules: string[] = [];

    for (const it of ALL_ITEMS) {
      // Colour
      if (it.color && Boolean(cfg.get(K_TINT(it.key)))) {
        const rgba = hexToRgba(cfg.get(K_COLOR(it.key)));
        if (rgba) {
          for (const t of it.color) rules.push(`${t.sel} { ${t.prop}: ${rgba} !important; }`);
        }
      }
      // Scale + rotation
      const scale = num(cfg.get(K_SCALE(it.key)), 1.0);
      const rot = num(cfg.get(K_ROT(it.key)), 0.0);
      if (Math.abs(scale - 1.0) > 1e-4 || Math.abs(rot) > 1e-4) {
        const xf = `scale(${scale}) rotate(${rot}deg)`;
        for (const sel of it.xformSel) {
          rules.push(`${sel} { transform: ${xf} !important; transform-origin: center !important; }`);
        }
      }
    }

    // Global team colours
    const markerCss: string[] = [];
    if (Boolean(cfg.get("enemy_tint"))) {
      const rgba = hexToRgba(cfg.get("enemy_color"));
      if (rgba) {
        rules.push(...scoreObjRules("enemy", rgba));
        markerCss.push(...markerRules(ENEMY_MARK, rgba));
      }
    }
    if (Boolean(cfg.get("ally_tint"))) {
      const rgba = hexToRgba(cfg.get("ally_color"));
      if (rgba) {
        rules.push(...scoreObjRules("ally", rgba));
        markerCss.push(...markerRules(ALLY_MARK, rgba));
      }
    }

    this.acc!.injectStylesheet(rules.join("\n"), STYLE_ID);
    this.acc!.injectStylesheetMarkers(markerCss.join("\n"), STYLE_ID_MARKERS);
    this.dirty = false;
  }

  override teardown(): void {
    if (this.acc?.connected) {
      try {
        this.acc.injectStylesheet("", STYLE_ID);
        this.acc.injectStylesheetMarkers("", STYLE_ID_MARKERS);
      } catch {
        /* ignore */
      }
    }
  }
}
