import { FusePlugin, type FuseContext, type InspectorSection } from "@fuse/plugin-sdk";
import { HUD, HANGAR } from "../_shared/hudSelectors.js";

type PageName = "battle_hud" | "markers" | "base_indicators" | "hangar";

interface Accessors {
  readonly connected: boolean;
  readonly connectedHangar: boolean;
  isConnected(page: PageName): boolean;
  injectStylesheetOn(page: PageName, css: string | null, styleId?: string): Promise<boolean>;
  countMatches(page: PageName, selectors: readonly string[]): Promise<Record<string, number> | null>;
}

type Element = [key: string, label: string, selectors: string[]];

interface Group {
  page: PageName;
  styleId: string;
  elements: Element[];
}

const ABILITY_1 = '[class*="AbilityPanel_base"] > [class*="AbilityPanel_ability"]:nth-child(1)';
const ABILITY_2 = '[class*="AbilityPanel_base"] > [class*="AbilityPanel_ability"]:nth-child(2)';
const PASSIVE = '[class*="AbilityPanel_ability__fixedPosition"]';
const ULTIMATE = '[class*="AbilityPanel_base"] > [class*="AbilityPanel_ability"]:nth-child(4)';

const ELEMENTS: Element[] = [
  ["hide_hp", "HP Bar", [HUD.HP_BASE]],
  ["hide_energy", "Energy Bar", [HUD.MANA_BASE]],
  ["hide_ability_1", "Ability 1", [ABILITY_1]],
  ["hide_ability_2", "Ability 2", [ABILITY_2]],
  ["hide_passive", "Passive Ability", [PASSIVE]],
  ["hide_ultimate", "Ultimate", [ULTIMATE]],
  ["hide_equipment", "Equipment Slots", [HUD.EQUIPMENT]],
  ["hide_player_info", "Agent Name / Class", [HUD.PLAYER_INFO]],
  ["hide_sprint", "Sprint Bar", [HUD.SPRINT]],
  ["hide_speedometer", "Speedometer", [HUD.SPEEDOMETER]],
  ["hide_radar", "Radar", [HUD.RADAR]],
  ["hide_agent_xp", "XP / Action Log", [HUD.XP_LOG]],
  ["hide_kill_log", "Kill Log", [HUD.BATTLE_LOG]],
  ["hide_shell_type", "Shell Type", [HUD.AMMO_LOADER]],
  ["hide_reload_timer", "Reload Timer", [HUD.RELOAD_TIMER]],
  ["hide_reload_mini", "Reload Minigame", [HUD.AMMO_LOADER]],
  ["hide_ammo_text", "Ammo Switch Text", [HUD.LOADER_SWITCH_HINT]],
  ["hide_hit_marks", "Critical Hit Marks", [HUD.HIT_INDICATOR]],
  ["hide_hints", "Key Hints", [HUD.KEY_HINTS]],
  ["hide_perf", "Ping / FPS", [HUD.PERF_INFO]],
  ["hide_perk_bars", "Skill XP Bars", [HUD.PERKS]],
  ["hide_xp_score", "Battle Score Number", [HUD.NUMBER_BIG]],
  ["hide_reticle", "Aim Circle", [HUD.AIM_SWITCHER, HUD.FRONT_SIGHT]],
  ["hide_drop_calc", "Scope / Rangefinder", [HUD.RETICLE]],
  ["hide_target_dist", "Rangefinder Distance", [HUD.TARGET_DISTANCE]],
  ["hide_action_hints", "Action Hints (Fire)", [HUD.TARGETING_HINTS]],
  ["hide_timer", "Match Timer", [HUD.BATTLE_TIMER]],
  ["hide_score", "Team Score Bars", [HUD.SCORE_BARS]],
  ["hide_objective_progress", "Objective Progress Bar", [HUD.OBJECTIVE_PROGRESS]],
  ["hide_capture", "Capture Points (A / B / C)", [HUD.BASES_INFO]],
  ["hide_objective_banner", "Objective Banner", [HUD.GAME_OBJECTIVE]],
  ["hide_module_buffs", "Module Buffs", [HUD.CONDITIONAL_BONUS]],
  ["hide_active_camo", "Active Camo Overlay", [HUD.ADVANCED_CAMO]],
  ["hide_vehicle_switch", "Vehicle Switch Indicator", [HUD.PROXY_PET]],
  ["hide_switch_hint", "Switch Hint (R)", [HUD.ACTION_HINT]],
];

// Lives on the `base_indicators` page since the 2026-09 update - it used to be on `markers`.
const BASE_IND_ELEMENTS: Element[] = [
  ["hide_perk_notif", "Skill Activation Banner", [HUD.TEXT_NOTIFICATION]],
];

const MARKERS_ELEMENTS: Element[] = [
  ["hide_enemy_markers", "Enemy Markers (HP / Name / Class)", [HUD.MARKER_VEHICLE]],
  ["hide_damage_log", "Damage Dealt Label", [HUD.MARKER_DEALT_DAMAGE]],
  ["hide_major_effects", "Major Status Effects", [HUD.MARKER_MAJOR_EFFECT]],
  ["hide_ability_markers", "Ability / Duration Markers", [HUD.TARGET_MARKERS]],
  ["hide_aux_markers", "Auxiliary Markers (Mines / Objects)", [HUD.AUX_MARKER]],
  ["hide_status_effects", "Status Effects", [HUD.STATUS_EFFECT]],
  ["hide_objective_markers", "Objective Markers (A / B + Distance)", [HUD.ZONE_MARKERS]],
];

const HANGAR_ELEMENTS: Element[] = [
  ["hangar_nav", "Navigation Tabs", [HANGAR.NAV]],
  ["hangar_account", "Account Info (Level / Wallet)", [HANGAR.ACCOUNT_INFO]],
  ["hangar_squad", "Squad Widget", [HANGAR.SQUAD_WIDGET]],
  ["hangar_hero", "Hero Sign (Agent / Vehicle)", [HANGAR.HERO_SIGN]],
  ["hangar_hero_btns", "Modify Agent / Vehicle Buttons", [HANGAR.HERO_NAV]],
  ["hangar_battle_pass", "Battle Pass Widget", [HANGAR.BATTLE_PASS_WIDGET]],
  ["hangar_missions", "Missions Widget", [HANGAR.MISSIONS_WIDGET]],
  ["hangar_boosters", "Boosters Widget", [HANGAR.BOOSTERS_WIDGET]],
  ["hangar_floating", "Floating Buttons (Results / Content Hub)", [HANGAR.FLOATING_BUTTONS]],
  ["hangar_mode_sel", "Game Mode Selector", [HANGAR.MODE_SELECTOR]],
  ["hangar_play_button", "Play Button", [HANGAR.PLAY_BUTTON]],
  ["hangar_shortcuts", "Shortcut Legend", [HANGAR.SHORTCUT_LEGEND]],
  ["hangar_notifications", "Notification Center", [HANGAR.NOTIFICATION_CENTER]],
  ["hangar_side_menu", "Side Menu", [HANGAR.SIDE_MENU]],
];

const MODIFY_ELEMENTS: Element[] = [
  ["mod_header", "Vehicle / Agent Header (Name + Level)", [HANGAR.HERO_SIGN_VEHICLE]],
  ["mod_stats", "Vehicle Stats (Firepower / Toughness)", [HANGAR.VEHICLE_STATS]],
  ["mod_weapons", "Vehicle: Primary / Secondary Weapon Slots", [HANGAR.VEHICLE_FEATURES]],
  ["mod_fire_mode", "Vehicle: Firing Mode Indicator", [HANGAR.VEHICLE_FIRE_MODE]],
  ["mod_payload", "Vehicle: Payload Counter", [HANGAR.VEHICLE_POWER]],
  ["mod_equipment", "Vehicle: Equipment Slots (C / M)", [HANGAR.VEHICLE_EQUIPMENT]],
  ["mod_modules", "Vehicle: Modules Row", [HANGAR.VEHICLE_MODULES]],
  ["mod_bonuses", "Agent: Ultimate / Trait", [HANGAR.AGENT_BONUSES]],
  ["mod_skills", "Agent: Skills Panel (Perks + Points)", [HANGAR.AGENT_SKILLS_BTN]],
  ["mod_vehicles", "Agent: Vehicle Selection Cards", [HANGAR.AGENT_VEHICLES]],
  ["mod_agent_list", "Agent: Hero Selection List (by Role)", [HANGAR.AGENT_LIST]],
];

const STYLE_ID = "__fuse_noui__";
const STYLE_ID_MARKERS = "__fuse_noui_m__";
const STYLE_ID_BASE_IND = "__fuse_noui_b__";
const STYLE_ID_HANGAR = "__fuse_noui_h__";

const GROUPS: Group[] = [
  { page: "battle_hud", styleId: STYLE_ID, elements: ELEMENTS },
  { page: "markers", styleId: STYLE_ID_MARKERS, elements: MARKERS_ELEMENTS },
  { page: "base_indicators", styleId: STYLE_ID_BASE_IND, elements: BASE_IND_ELEMENTS },
  { page: "hangar", styleId: STYLE_ID_HANGAR, elements: [...HANGAR_ELEMENTS, ...MODIFY_ELEMENTS] },
];

/** App panel grouping of the toggles; independent of the page groups above. */
const PANEL_GROUPS: [label: string, toggles: [key: string, label: string][]][] = [
  ["HP / Energy", [
    ["hide_hp", "HP Bar"],
    ["hide_energy", "Energy Bar"],
  ]],
  ["Abilities", [
    ["hide_ability_1", "Ability 1"],
    ["hide_ability_2", "Ability 2"],
    ["hide_passive", "Passive Ability"],
    ["hide_ultimate", "Ultimate"],
    ["hide_equipment", "Equipment Slots"],
  ]],
  ["Player", [
    ["hide_player_info", "Agent Name / Class"],
    ["hide_hints", "Key Hints"],
  ]],
  ["Movement", [
    ["hide_sprint", "Sprint Bar"],
    ["hide_speedometer", "Speedometer"],
  ]],
  ["Tactical", [
    ["hide_radar", "Radar"],
    ["hide_agent_xp", "XP / Action Log"],
    ["hide_kill_log", "Kill Log"],
  ]],
  ["Weapons", [
    ["hide_shell_type", "Shell Type"],
    ["hide_reload_timer", "Reload Timer"],
    ["hide_reload_mini", "Reload Minigame"],
    ["hide_ammo_text", "Ammo Switch Text"],
  ]],
  ["Combat", [
    ["hide_hit_marks", "Critical Hit Marks"],
  ]],
  ["Crosshair", [
    ["hide_reticle", "Aim Circle"],
    ["hide_drop_calc", "Scope / Rangefinder"],
    ["hide_target_dist", "Rangefinder Distance"],
    ["hide_action_hints", "Action Hints (Fire)"],
  ]],
  ["Notifications", [
    ["hide_perk_notif", "Skill Activation Banner"],
    ["hide_perk_bars", "Skill XP Bars"],
    ["hide_xp_score", "Battle Score Number"],
  ]],
  ["Match / Objectives", [
    ["hide_timer", "Match Timer"],
    ["hide_score", "Team Score Bars"],
    ["hide_objective_progress", "Objective Progress Bar"],
    ["hide_capture", "Capture Points (A / B / C)"],
    ["hide_objective_banner", "Objective Banner"],
    ["hide_objective_markers", "Objective Markers (A / B + Distance)"],
  ]],
  ["Buffs / Status", [
    ["hide_module_buffs", "Module Buffs"],
    ["hide_status_effects", "Self Status Effects"],
    ["hide_active_camo", "Active Camo Overlay"],
  ]],
  ["Vehicle", [
    ["hide_vehicle_switch", "Vehicle Switch Indicator"],
    ["hide_switch_hint", "Switch Hint (R)"],
  ]],
  ["Enemies", [
    ["hide_enemy_markers", "Enemy Markers (HP / Name / Class)"],
    ["hide_damage_log", "Damage Dealt Label"],
    ["hide_major_effects", "Major Status Effects"],
    ["hide_ability_markers", "Ability / Duration Markers"],
    ["hide_aux_markers", "Auxiliary Markers (Mines / Objects)"],
  ]],
  ["System", [
    ["hide_perf", "Ping / FPS"],
  ]],
  ["Hangar", [
    ["hangar_nav", "Navigation Tabs"],
    ["hangar_account", "Account Info (Level / Wallet)"],
    ["hangar_squad", "Squad Widget"],
    ["hangar_hero", "Hero Sign (Agent / Vehicle)"],
    ["hangar_hero_btns", "Modify Agent / Vehicle Buttons"],
    ["hangar_battle_pass", "Battle Pass Widget"],
    ["hangar_missions", "Missions Widget"],
    ["hangar_boosters", "Boosters Widget"],
    ["hangar_floating", "Floating Buttons (Results / Content Hub)"],
    ["hangar_mode_sel", "Game Mode Selector"],
    ["hangar_play_button", "Play Button"],
    ["hangar_shortcuts", "Shortcut Legend"],
    ["hangar_notifications", "Notification Center"],
    ["hangar_side_menu", "Side Menu"],
  ]],
  ["Modify Vehicle / Agent", [
    ["mod_header", "Vehicle / Agent Header (Name + Level)"],
    ["mod_stats", "Vehicle Stats (Firepower / Toughness)"],
    ["mod_weapons", "Vehicle: Primary / Secondary Slots"],
    ["mod_fire_mode", "Vehicle: Firing Mode Indicator"],
    ["mod_payload", "Vehicle: Payload Counter"],
    ["mod_equipment", "Vehicle: Equipment Slots (C / M)"],
    ["mod_modules", "Vehicle: Modules Row"],
    ["mod_bonuses", "Agent: Ultimate / Trait"],
    ["mod_skills", "Agent: Skills Panel (Perks + Points)"],
    ["mod_vehicles", "Agent: Vehicle Selection Cards"],
    ["mod_agent_list", "Agent: Hero Selection List (by Role)"],
  ]],
];

// Selector diagnostics: warn once per key after this many consecutive zero-match checks.
const VERIFY_INTERVAL_S = 2;
const MISS_THRESHOLD = 15;

export class NoUiPlugin extends FusePlugin {
  private ctx!: FuseContext;
  private acc: Accessors | undefined;
  private dirty = true;
  private lastConnected: Record<PageName, boolean> = {
    battle_hud: false,
    markers: false,
    base_indicators: false,
    hangar: false,
  };
  private paused = false;
  private toggleCombo = "ctrl+h";
  private verifyTimer = 0;
  private verifying = false;
  private misses = new Map<string, number>();
  private warned = new Set<string>();

  private sections(): InspectorSection[] {
    return [
      {
        id: "noui.master",
        label: "Master",
        controls: [
          {
            type: "switch",
            id: "hide_all",
            key: "hide_all",
            label: "Hide All",
            hint: "Override all toggles - hide every element at once",
          },
        ],
      },
      // While Hide All is on, the individual toggles have no effect, so they read as disabled.
      ...PANEL_GROUPS.map(
        ([label, toggles]): InspectorSection => ({
          id: `noui.${label.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`,
          label,
          collapsible: true,
          controls: toggles.map(([key, text]) => ({
            type: "toggle" as const,
            id: key,
            key,
            label: text,
            disabledWhen: { key: "hide_all", truthy: true },
          })),
        }),
      ),
    ];
  }

  setup(ctx: FuseContext): void {
    this.ctx = ctx;
    this.acc = ctx.services.get<Accessors>("accessors");
    if (!this.acc) ctx.logger.warning("noui: 'accessors' service not available - plugin inactive");

    this.toggleCombo = ctx.hotkeyFor("toggle", "ctrl+h");
    ctx.hotkeys.register(this.toggleCombo, () => this.toggleAll(), "Toggle No-UI");

    const allKeys = GROUPS.flatMap((g) => g.elements).map(([k]) => k);
    const defaults: Record<string, boolean> = { hide_all: false };
    for (const k of allKeys) defaults[k] = false;
    ctx.config.defaults(defaults).load();

    // App panel only: NoUI hides parts of the game's own UI and has no overlay.
    ctx.config.schema(this.sections());

    for (const key of [...allKeys, "hide_all"]) ctx.config.watch(key, () => (this.dirty = true));
  }

  override teardown(): void {
    this.ctx.hotkeys.unregister(this.toggleCombo);
    if (!this.acc) return;
    for (const g of GROUPS) {
      if (this.acc.isConnected(g.page)) void this.inject(g, "");
    }
  }

  override tick(dt: number): void {
    this.ctx.config.checkReload();
    const acc = this.acc;
    if (!acc) return;

    let anyConnected = false;
    for (const g of GROUPS) {
      const now = acc.isConnected(g.page);
      if (now && !this.lastConnected[g.page]) {
        // Page (re)created - `base_indicators` is rebuilt on every respawn.
        this.dirty = true;
        this.resetDiagnostics(g);
      }
      this.lastConnected[g.page] = now;
      anyConnected ||= now;
    }
    if (!anyConnected) return;

    if (this.dirty) this.apply();

    this.verifyTimer += dt;
    if (this.verifyTimer >= VERIFY_INTERVAL_S && !this.verifying && !this.paused) {
      this.verifyTimer = 0;
      this.verifying = true;
      void this.verify().finally(() => (this.verifying = false));
    }
  }

  private toggleAll(): void {
    this.paused = !this.paused;
    this.dirty = true;
  }

  private enabled(key: string): boolean {
    const cfg = this.ctx.config;
    return Boolean(cfg.get("hide_all")) || Boolean(cfg.get(key));
  }

  private async inject(group: Group, css: string): Promise<void> {
    const ok = await this.acc!.injectStylesheetOn(group.page, css, group.styleId);
    if (!ok) {
      const keys = group.elements.filter(([k]) => this.enabled(k)).map(([k]) => k);
      this.ctx.logger.warning(
        `noui: style injection failed on '${group.page}' (${group.styleId}) - not hidden: ${keys.join(", ") || "(none enabled)"}`,
      );
    }
  }

  private resetDiagnostics(group: Group): void {
    for (const [key] of group.elements) {
      this.misses.delete(key);
      this.warned.delete(key);
    }
  }

  private apply(): void {
    const acc = this.acc!;
    for (const g of GROUPS) {
      if (!acc.isConnected(g.page)) continue;
      const css = this.paused ? "" : this.rules(g.elements);
      void this.inject(g, css);
      this.resetDiagnostics(g);
    }
    this.dirty = false;
  }

  private rules(elements: Element[]): string {
    const out: string[] = [];
    for (const [key, , selectors] of elements) {
      if (!this.enabled(key)) continue;
      for (const sel of selectors) out.push(`${sel} { display: none !important; }`);
    }
    return out.join("\n");
  }

  /**
   * Count what each enabled selector actually matches. A selector the page rejects is
   * reported at once; one that matches nothing for MISS_THRESHOLD checks in a row is
   * reported once, naming the toggle - that is how a stale selector surfaces after a
   * game update instead of silently doing nothing.
   */
  private async verify(): Promise<void> {
    const acc = this.acc!;
    for (const g of GROUPS) {
      if (!acc.isConnected(g.page)) continue;
      const active = g.elements.filter(([k]) => this.enabled(k) && !this.warned.has(k));
      if (!active.length) continue;

      const selectors = [...new Set(active.flatMap(([, , sels]) => sels))];
      const counts = await acc.countMatches(g.page, selectors);
      if (!counts) continue;

      for (const [key, label, sels] of active) {
        const bad = sels.filter((s) => counts[s] === -1);
        if (bad.length) {
          this.warned.add(key);
          this.ctx.logger.warning(
            `noui: '${key}' (${label}) has an invalid selector on '${g.page}': ${bad.join(", ")}`,
          );
          continue;
        }
        const total = sels.reduce((n, s) => n + (counts[s] ?? 0), 0);
        if (total > 0) {
          this.misses.delete(key);
          continue;
        }
        const n = (this.misses.get(key) ?? 0) + 1;
        this.misses.set(key, n);
        if (n >= MISS_THRESHOLD) {
          this.warned.add(key);
          this.ctx.logger.warning(
            `noui: '${key}' (${label}) matched 0 elements on '${g.page}' for ` +
              `${(MISS_THRESHOLD * VERIFY_INTERVAL_S).toFixed(0)}s - selector may be stale: ${sels.join(", ")}`,
          );
        }
      }
    }
  }
}
