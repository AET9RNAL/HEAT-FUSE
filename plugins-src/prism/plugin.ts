import { FusePlugin, type FuseContext, type InspectorControl, type InspectorSection } from "@fuse/plugin-sdk";
import { GAME, PAGES, SECTIONS, TEAM_LABEL, type Page, type PrismEl } from "./catalog.js";
import {
  ALL_ITEMS,
  TEAMS,
  K_PICK,
  K_ROT,
  K_SCALE,
  K_STATE,
  K_TEAM_COLOR,
  K_TEAM_TINT,
  K_TINT,
  buildCss,
  elementDefaults,
  hex8,
  teamDefaults,
} from "./css.js";

interface Accessors {
  readonly connected: boolean;
  isConnected(page: Page): boolean | undefined;
  injectStylesheetOn(page: Page, css: string | null, styleId?: string): Promise<boolean>;
}

const STYLE_ID = "__fuse_prism__";
// Prism 2 kept the markers rules under their own id.
const LEGACY_MARKERS_ID = "__fuse_prism_m__";

const PRESET_NONE = "None";
const WHITE8 = "#FFFFFFFF";

function cbPreset(team: Record<"ally" | "enemy" | "squad" | "you", string>, hp: string, en: string, speed: string, reload: string, mark: string): Record<string, boolean | string> {
  return {
    ally_tint: true, ally_color: team.ally,
    enemy_tint: true, enemy_color: team.enemy,
    squad_tint: true, squad_color: team.squad,
    you_tint: true, you_color: team.you,
    hp_bar_tint: true, hp_bar_color: hp,
    en_bar_tint: true, en_bar_color: en,
    speedo_bar_tint: true, speedo_bar_color: speed,
    reload_tint: true, reload_color: reload,
    reload_mini_tint: true, reload_mini_color: reload,
    mark_tint: true, mark_color: mark,
  };
}

const PRESETS: Record<string, Record<string, boolean | string | number>> = {
  "Colourblind - Deuteranopia": cbPreset(
    { ally: "#0072B2FF", enemy: "#E69F00FF", squad: "#56B4E9FF", you: "#F0E442FF" },
    "#0072B2FF", "#E69F00FF", "#56B4E9FF", "#E69F00FF", "#F0E442FF",
  ),
  "Colourblind - Protanopia": cbPreset(
    { ally: "#0072B2FF", enemy: "#F0E442FF", squad: "#56B4E9FF", you: "#FFFFFFFF" },
    "#0072B2FF", "#F0E442FF", "#56B4E9FF", "#F0E442FF", "#E69F00FF",
  ),
  "Colourblind - Tritanopia": cbPreset(
    { ally: "#009E73FF", enemy: "#D55E00FF", squad: "#56B4E9FF", you: "#CC79A7FF" },
    "#D55E00FF", "#009E73FF", "#CC79A7FF", "#CC79A7FF", "#D55E00FF",
  ),
  "High Contrast": {
    ally_tint: true, ally_color: "#00E5FFFF",
    enemy_tint: true, enemy_color: "#FF2D2DFF",
    squad_tint: true, squad_color: "#00FF66FF",
    you_tint: true, you_color: "#FFEE00FF",
    hp_bar_tint: true, hp_bar_color: "#00FF66FF",
    en_bar_tint: true, en_bar_color: "#00E5FFFF",
    mark_tint: true, mark_color: "#FFEE00FF",
    aim_tint: true, aim_color: "#FFEE00FF",
  },
};
const PRESET_CHOICES = [PRESET_NONE, ...Object.keys(PRESETS)];

export class PrismPlugin extends FusePlugin {
  static override requiresCalibration = false;

  private ctx!: FuseContext;
  private acc: Accessors | undefined;
  private dirty = new Set<Page>(PAGES);
  private wasConnected = new Map<Page, boolean>();

  private sections(): InspectorSection[] {
    const itemControls = (sec: string, it: PrismEl): InspectorControl[] => {
      const when = { key: K_PICK(sec), eq: it.key };
      const out: InspectorControl[] = [];
      if (it.hint) out.push({ type: "note", id: `${it.key}_note`, text: it.hint, tone: "muted", when });
      out.push({
        type: "switch",
        id: K_TINT(it.key),
        key: K_TINT(it.key),
        label: "Recolour",
        tooltip: "Use the colours below instead of the game's own. A colour left at its default follows Team Colours.",
        when,
      });
      for (const s of it.states) {
        out.push({
          type: "color",
          id: K_STATE(it, s),
          key: K_STATE(it, s),
          label: s.label,
          default: hex8(s.def),
          tooltip: "Double-click the swatch to reset to the game's colour.",
          when,
          disabledWhen: { key: K_TINT(it.key), truthy: false },
        });
      }
      if (it.xform) {
        out.push({
          type: "slider",
          id: K_SCALE(it.key),
          key: K_SCALE(it.key),
          label: "Scale",
          min: 0.1,
          max: 5,
          step: 0.05,
          unit: "×",
          default: 1,
          tooltip: "Double-click to reset.",
          when,
        });
        out.push({
          type: "slider",
          id: K_ROT(it.key),
          key: K_ROT(it.key),
          label: "Rotation",
          min: -180,
          max: 180,
          step: 1,
          unit: "°",
          default: 0,
          bipolar: true,
          tooltip: "Double-click to reset.",
          when,
        });
      }
      return out;
    };

    return [
      {
        id: "prism.accessibility",
        label: "Accessibility",
        description:
          "One-click styling tuned for a specific need. Resets and overwrites the sections below - pick None to clear, then fine-tune manually.",
        controls: [
          {
            type: "select",
            id: "preset",
            key: "preset",
            label: "Quick Preset",
            options: PRESET_CHOICES.map((p) => ({ value: p, label: p })),
          },
        ],
      },
      {
        id: "prism.team",
        label: "Team Colours",
        description:
          "Recolours everything tied to a side at once. Darker and lighter variants follow automatically.",
        controls: TEAMS.flatMap((tm): InspectorControl[] => [
          { type: "switch", id: K_TEAM_TINT(tm), key: K_TEAM_TINT(tm), label: `Recolour ${TEAM_LABEL[tm]}` },
          {
            type: "color",
            id: K_TEAM_COLOR(tm),
            key: K_TEAM_COLOR(tm),
            label: `${TEAM_LABEL[tm]} Colour`,
            default: hex8(GAME[tm].base),
            tooltip: "Double-click the swatch to reset to the game's colour.",
            disabledWhen: { key: K_TEAM_TINT(tm), truthy: false },
          },
        ]),
      },
      // One picker per section keeps each long list to the element being edited.
      ...SECTIONS.map(
        (sec): InspectorSection => ({
          id: `prism.${sec.id}`,
          label: sec.label,
          description: sec.description,
          collapsible: true,
          defaultCollapsed: true,
          controls: [
            {
              type: "select",
              id: K_PICK(sec.id),
              key: K_PICK(sec.id),
              label: "Element",
              searchable: sec.items.length > 8,
              options: sec.items.map((it) => ({ value: it.key, label: it.label })),
            },
            { type: "divider", id: `${sec.id}_divider` },
            ...sec.items.flatMap((it) => itemControls(sec.id, it)),
          ],
        }),
      ),
    ];
  }

  setup(ctx: FuseContext): void {
    this.ctx = ctx;
    this.acc = ctx.services.get<Accessors>("accessors");
    if (!this.acc) ctx.logger.error("prism: 'accessors' service not available - plugin inactive");

    const defaults: Record<string, unknown> = {
      preset: PRESET_NONE,
      ...teamDefaults(),
      ...elementDefaults(),
      ...Object.fromEntries(SECTIONS.map((s) => [K_PICK(s.id), s.items[0].key])),
    };
    ctx.config.defaults(defaults).load();
    this.migrateLegacyWhite();

    // App panel only: Prism restyles the game's own UI and has no overlay.
    ctx.config.schema(this.sections());

    ctx.config.watch("preset", (v) => this.applyPreset(String(v)));
    const markAll = () => PAGES.forEach((p) => this.dirty.add(p));
    for (const tm of TEAMS) {
      ctx.config.watch(K_TEAM_TINT(tm), markAll);
      ctx.config.watch(K_TEAM_COLOR(tm), markAll);
    }
    for (const it of ALL_ITEMS) {
      const keys = [K_TINT(it.key), ...it.states.map((s) => K_STATE(it, s))];
      if (it.xform) keys.push(K_SCALE(it.key), K_ROT(it.key));
      for (const k of keys) ctx.config.watch(k, markAll);
    }

    // A recreated document (respawn, new match, hangar return) starts without our style.
    ctx.events.subscribe("accessors.page_connected", (p) => {
      if (PAGES.includes(p.page as Page)) this.dirty.add(p.page as Page);
    });
  }

  /** Prism 2 stored white as every colour's default; untouched ones take the game's real colour. */
  private migrateLegacyWhite(): void {
    const cfg = this.ctx.config;
    const patch: Record<string, string> = {};
    for (const it of ALL_ITEMS) {
      if (Boolean(cfg.get(K_TINT(it.key)))) continue;
      for (const s of it.states) {
        const k = K_STATE(it, s);
        if (String(cfg.get(k)).toUpperCase() === WHITE8 && hex8(s.def) !== WHITE8) patch[k] = hex8(s.def);
      }
    }
    if (Object.keys(patch).length) cfg.update(patch);
  }

  /** Reset every element and team colour to its default, then overlay the chosen preset. */
  private applyPreset(name: string): void {
    const bundle: Record<string, boolean | string | number> = { ...teamDefaults(), ...elementDefaults() };
    Object.assign(bundle, PRESETS[name] ?? {});
    this.ctx.config.update(bundle);
    PAGES.forEach((p) => this.dirty.add(p));
  }

  override tick(_dt: number): void {
    this.ctx.config.checkReload();
    if (!this.acc) return;

    for (const page of PAGES) {
      const now = Boolean(this.acc.isConnected(page));
      if (now && !this.wasConnected.get(page)) this.dirty.add(page);
      this.wasConnected.set(page, now);
    }

    const ready = [...this.dirty].filter((p) => this.wasConnected.get(p));
    if (ready.length) this.apply(ready);
  }

  private apply(pages: Page[]): void {
    const css = buildCss((k) => this.ctx.config.get(k));
    for (const page of pages) {
      this.dirty.delete(page);
      const retry = () => setTimeout(() => this.dirty.add(page), 2000);
      this.acc!.injectStylesheetOn(page, css[page].join("\n"), STYLE_ID).then((ok) => ok || retry(), retry);
      if (page === "markers") this.acc!.injectStylesheetOn(page, null, LEGACY_MARKERS_ID).catch(() => undefined);
    }
  }

  override teardown(): void {
    if (!this.acc) return;
    for (const page of PAGES) {
      if (!this.acc.isConnected(page)) continue;
      this.acc.injectStylesheetOn(page, null, STYLE_ID).catch(() => undefined);
    }
  }
}
