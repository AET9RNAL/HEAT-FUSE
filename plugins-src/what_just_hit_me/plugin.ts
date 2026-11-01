import {
  FusePlugin,
  type FuseContext,
  type InspectorSection,
  type LanguageService,
  type OverlayHandle,
  type Rect,
} from "@fuse/plugin-sdk";
import { LOCALES, messagesFor, resolveLocale, translator, type Translate } from "./i18n.js";

interface Accessors {
  read(name: string): unknown;
  readonly connected: boolean;
}

/** Subset of Accessors' `damage_log`*/
interface DamageEntry {
  id: number;
  life: number;
  value: number;
  updates: number;
  source_name: string;
  effect_name: string;
  attacker: string;
  attacker_vehicle: string;
  relation: "self" | "ally" | "enemy" | "unknown";
  last_ms: number;
  fatal: boolean;
}
interface DamageDeath {
  life: number;
  at_ms: number;
  fatal_id: number | null;
  killer: { unique_name: string; name: string } | null;
}
interface DamageLogState {
  match: number;
  life: number;
  alive: boolean;
  entries: DamageEntry[];
  deaths: DamageDeath[];
  missed: number;
  rev: number;
}

interface WjhmRow {
  id: number;
  attacker: string;
  vehicle: string;
  source: string;
  effect: string;
  value: number;
  relation: string;
  fatal: boolean;
  updates: number;
  lastMs: number;
}
interface WjhmView {
  alive: boolean;
  total: number;
  rows: WjhmRow[];
  hidden: number;
  missed: number;
  killer: { name: string; vehicle: string } | null;
}

/** Accessors' `scene_tags` the user can pick; the spawn drop carries the "deploy" tag. */
const SHOW_IN = ["alive", "map", "dead", "deploy", "results"];
const DEFAULT_SHOW_IN = ["alive", "dead"];
const POS_KEY = "vue_overlay_pos";
const DEFAULT_W = 350;
const DEFAULT_H = 200;
const SIM_LOOP_S = 11;

function baseName(unique: string): string {
  return unique.replace(/#\d+$/, "");
}

/** A scripted life for calibration: hits land, a burn grows in place, then a fatal shell. */
function simState(t: number): DamageLogState {
  const now = Date.now();
  const at = (s: number) => now - (t - s) * 1000;
  const entries: DamageEntry[] = [];
  const add = (from: number, e: Omit<DamageEntry, "life" | "last_ms" | "fatal" | "updates">, updates = 0) => {
    if (t >= from) entries.push({ ...e, life: 0, last_ms: at(from), fatal: false, updates });
  };
  add(0.5, { id: 1, value: 574, source_name: "shell", effect_name: "none", attacker: "thardin", attacker_vehicle: "XM1V", relation: "enemy" });
  add(1.5, { id: 2, value: 181, source_name: "ramming", effect_name: "none", attacker: "Kristopher", attacker_vehicle: "AMX10 RC", relation: "enemy" });
  const burnTicks = Math.max(0, Math.min(16, Math.floor((t - 2.5) / 0.25) + 1));
  add(2.5, { id: 3, value: 17 * burnTicks, source_name: "periodic", effect_name: "fire", attacker: "Sharon", attacker_vehicle: "", relation: "enemy" }, burnTicks - 1);
  add(4, { id: 4, value: 199, source_name: "indirect", effect_name: "blast", attacker: "swhitney", attacker_vehicle: "XM1 90", relation: "enemy" });
  add(5, { id: 5, value: 254, source_name: "falling", effect_name: "none", attacker: "You", attacker_vehicle: "", relation: "self" });
  add(7, { id: 6, value: 820, source_name: "shell", effect_name: "none", attacker: "Claire2006", attacker_vehicle: "HSTV-L", relation: "enemy" });
  const dead = t >= 7;
  const fatal = entries.find((e) => e.id === 6);
  if (fatal) fatal.fatal = true;
  return {
    match: 1,
    life: 0,
    alive: !dead,
    entries,
    deaths: dead ? [{ life: 0, at_ms: at(7), fatal_id: 6, killer: { unique_name: "Claire2006#91307", name: "" } }] : [],
    missed: 0,
    rev: 0,
  };
}

export class WhatJustHitMePlugin extends FusePlugin {
  static override requiresCalibration = true;

  private ctx!: FuseContext;
  private acc: Accessors | undefined;
  private language: LanguageService | undefined;
  /** Last value seen on the language service, which reads empty without the permission. */
  private appLanguage: string | undefined;
  private ov: OverlayHandle | undefined;

  private locale = "en";
  private t: Translate = translator("en");
  private maxRows = 3;
  private showSelf = true;
  private showIn = new Set(DEFAULT_SHOW_IN);
  private hostVisible = true;
  private lastVisible: boolean | null = null;
  private lastKey = "";
  private simT = 0;

  setup(ctx: FuseContext): void {
    this.ctx = ctx;
    this.acc = ctx.services.get<Accessors>("accessors");
    if (!this.acc) ctx.logger.error("what_just_hit_me: 'accessors' service unavailable - plugin inactive");
    this.language = ctx.services.get<LanguageService>("language");

    ctx.config
      .defaults({
        vue_overlay_pos: null,
        vue_width: DEFAULT_W,
        vue_height: DEFAULT_H,
        max_rows: 3,
        show_self: true,
        show_in: DEFAULT_SHOW_IN,
        // Empty follows the App's language.
        locale: "",
      })
      .load();
    this.readConfig();

    this.appLanguage = this.language?.language;
    this.locale = this.pickLocale();
    this.t = translator(this.locale);

    const { w, h } = this.size();
    this.ov = ctx.overlays.declare({
      id: "damageLog",
      kind: "vue",
      asset: "WhatJustHitMe.vue",
      size: { w, h },
      defaultRect: this.savedRect(w, h),
      positionConfigKey: POS_KEY,
    });
    this.declareSchema();
    this.pushLocale();
    ctx.config.watch("locale", () => this.applyLocale());
  }

  private sections(): InspectorSection[] {
    const t = this.t;
    return [
      {
        id: "wjhm.log",
        label: t("config.section"),
        description: t("config.sectionTip"),
        order: 10,
        controls: [
          {
            type: "select",
            id: "locale",
            key: "locale",
            label: t("config.language"),
            options: [
              { value: "", label: t("config.languageAuto") },
              ...LOCALES.map((code) => ({ value: code, label: code.toUpperCase() })),
            ],
            tooltip: t("config.languageTip"),
          },
          {
            type: "buttons",
            id: "show_in",
            key: "show_in",
            mode: "multi",
            label: t("config.showIn"),
            options: SHOW_IN.map((scene) => ({
              value: scene,
              label: t(`scene.${scene}`),
              tooltip: t(`scene.${scene}Tip`),
            })),
          },
          {
            type: "slider",
            id: "max_rows",
            key: "max_rows",
            label: t("config.rows"),
            min: 3,
            max: 10,
            step: 1,
            default: 3,
            tooltip: t("config.rowsTip"),
          },
          {
            type: "switch",
            id: "show_self",
            key: "show_self",
            label: t("config.selfDamage"),
            tooltip: t("config.selfDamageTip"),
          },
        ],
      },
    ];
  }

  /** One declaration for the App panel and the overlay inspector, in the current language. */
  private declareSchema(): void {
    const sections = this.sections();
    this.ctx.config.schema(sections);
    this.ov?.inspector.sections(sections);
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
  }

  private pushLocale(): void {
    this.ov?.setString("locale", this.locale);
    this.ov?.setJson("messages", messagesFor(this.locale));
  }

  private readConfig(): void {
    const rows = Number(this.ctx.config.get("max_rows", 3));
    this.maxRows = Number.isFinite(rows) ? Math.min(10, Math.max(3, Math.round(rows))) : 3;
    this.showSelf = Boolean(this.ctx.config.get("show_self", true));
    const showIn = this.ctx.config.get<unknown>("show_in", DEFAULT_SHOW_IN);
    this.showIn = new Set(Array.isArray(showIn) ? showIn.map(String) : DEFAULT_SHOW_IN);
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

  /** Accessors tags the game state once for every plugin; this only checks the tags against the user's pick. */
  private inScope(): boolean {
    const tags = this.acc?.read("scene_tags");
    return Array.isArray(tags) && tags.some((tag) => this.showIn.has(String(tag)));
  }

  private setVisible(want: boolean): void {
    const visible = this.hostVisible && want;
    if (visible === this.lastVisible) return;
    this.lastVisible = visible;
    this.ov?.setVisible(visible);
  }

  override enterCalibrate(): void {
    const { w, h } = this.size();
    const rect = this.savedRect(w, h);
    if (rect) this.ov?.setRect(rect);
    this.simT = 0;
    this.lastKey = "";
    this.lastVisible = null;
  }

  override enterLocked(): void {
    this.lastKey = "";
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
    if (!this.ov) return;

    if (this.ctx.state === "calibrate") {
      this.simT = (this.simT + dt) % SIM_LOOP_S;
      this.ov.setJson("log", this.buildView(simState(this.simT)));
      return;
    }
    if (this.ctx.state !== "locked") return;

    const live = this.inScope();
    this.setVisible(live);
    if (!live) return;

    const raw = this.acc?.read("damage_log");
    if (!raw || typeof raw !== "object") return;
    const state = raw as DamageLogState;
    const key = `${state.match}|${state.rev}|${this.maxRows}|${this.showSelf}`;
    if (key === this.lastKey) return;
    this.lastKey = key;
    this.ov.setJson("log", this.buildView(state));
  }

  private buildView(s: DamageLogState): WjhmView {
    const life = s.entries.filter((e) => e.life === s.life);
    const total = life.reduce((sum, e) => sum + e.value, 0);
    const shown = (this.showSelf ? life : life.filter((e) => e.relation !== "self")).sort((a, b) => b.id - a.id);
    const rows = shown.slice(0, this.maxRows).map<WjhmRow>((e) => ({
      id: e.id,
      attacker: e.attacker,
      vehicle: e.attacker_vehicle,
      source: e.source_name,
      effect: e.effect_name,
      value: e.value,
      relation: e.relation,
      fatal: e.fatal,
      updates: e.updates,
      lastMs: e.last_ms,
    }));

    let killer: WjhmView["killer"] = null;
    const death = s.alive ? null : s.deaths.find((d) => d.life === s.life);
    if (death) {
      const fatal = life.find((e) => e.id === death.fatal_id);
      const name = death.killer ? baseName(death.killer.unique_name) || death.killer.name : fatal?.attacker ?? "";
      if (name) killer = { name, vehicle: fatal?.attacker_vehicle ?? "" };
    }

    return {
      alive: s.alive,
      total,
      rows,
      hidden: shown.length - rows.length,
      missed: s.missed,
      killer,
    };
  }

  override teardown(): void {
    this.ov?.remove();
  }
}
