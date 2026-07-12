import { FusePlugin, ConfigCategory, ConfigEntry, type FuseContext } from "@fuse/plugin-sdk";
import { HUD, HANGAR } from "../_shared/hudSelectors.js";

interface Accessors {
  readonly connected: boolean;
  readonly connectedHangar: boolean;
  injectStylesheet(css: string | null, styleId?: string): void;
  injectStylesheetMarkers(css: string | null, styleId?: string): void;
  injectStylesheetHangar(css: string | null, styleId?: string): void;
}

type Element = [key: string, label: string, selectors: string[]];

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
];

const MARKERS_ELEMENTS: Element[] = [
  ["hide_perk_notif", "Skill Activation Banner", [HUD.TEXT_NOTIFICATION]],
  ["hide_enemy_markers", "Enemy Markers (HP / Name / Class)", [HUD.MARKER_VEHICLE]],
  ["hide_damage_log", "Damage Dealt Label", [HUD.MARKER_DEALT_DAMAGE]],
  ["hide_major_effects", "Major Status Effects", [HUD.MARKER_MAJOR_EFFECT]],
  ["hide_ability_markers", "Ability / Duration Markers", [HUD.TARGET_MARKERS]],
  ["hide_aux_markers", "Auxiliary Markers (Mines / Objects)", [HUD.AUX_MARKER]],
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
const STYLE_ID_HANGAR = "__fuse_noui_h__";

export class NoUiPlugin extends FusePlugin {
  private ctx!: FuseContext;
  private acc: Accessors | undefined;
  private dirty = true;
  private lastConnected = false;
  private lastConnectedHangar = false;
  private paused = false;
  private toggleCombo = "ctrl+h";

  setup(ctx: FuseContext): void {
    this.ctx = ctx;
    this.acc = ctx.services.get<Accessors>("accessors");
    if (!this.acc) ctx.logger.warning("noui: 'accessors' service not available - plugin inactive");

    this.toggleCombo = ctx.hotkeyFor("toggle", "ctrl+h");
    ctx.hotkeys.register(this.toggleCombo, () => this.toggleAll(), "Toggle No-UI");

    const allKeys = [...ELEMENTS, ...MARKERS_ELEMENTS, ...HANGAR_ELEMENTS, ...MODIFY_ELEMENTS].map(([k]) => k);
    const defaults: Record<string, boolean> = { hide_all: false };
    for (const k of allKeys) defaults[k] = false;
    ctx.config.defaults(defaults).load();

    ctx.config.schema([
      new ConfigCategory("Master", [
        new ConfigEntry({ key: "hide_all", label: "Hide All", type: "bool", description: "Override all toggles - hide every element at once" }),
      ]),
      new ConfigCategory("HP / Energy", [
        new ConfigEntry({ key: "hide_hp", label: "HP Bar", type: "bool" }),
        new ConfigEntry({ key: "hide_energy", label: "Energy Bar", type: "bool" }),
      ]),
      new ConfigCategory("Abilities", [
        new ConfigEntry({ key: "hide_ability_1", label: "Ability 1", type: "bool" }),
        new ConfigEntry({ key: "hide_ability_2", label: "Ability 2", type: "bool" }),
        new ConfigEntry({ key: "hide_passive", label: "Passive Ability", type: "bool" }),
        new ConfigEntry({ key: "hide_ultimate", label: "Ultimate", type: "bool" }),
        new ConfigEntry({ key: "hide_equipment", label: "Equipment Slots", type: "bool" }),
      ]),
      new ConfigCategory("Player", [
        new ConfigEntry({ key: "hide_player_info", label: "Agent Name / Class", type: "bool" }),
        new ConfigEntry({ key: "hide_hints", label: "Key Hints", type: "bool" }),
      ]),
      new ConfigCategory("Movement", [
        new ConfigEntry({ key: "hide_sprint", label: "Sprint Bar", type: "bool" }),
        new ConfigEntry({ key: "hide_speedometer", label: "Speedometer", type: "bool" }),
      ]),
      new ConfigCategory("Tactical", [
        new ConfigEntry({ key: "hide_radar", label: "Radar", type: "bool" }),
        new ConfigEntry({ key: "hide_agent_xp", label: "XP / Action Log", type: "bool" }),
        new ConfigEntry({ key: "hide_kill_log", label: "Kill Log", type: "bool" }),
      ]),
      new ConfigCategory("Weapons", [
        new ConfigEntry({ key: "hide_shell_type", label: "Shell Type", type: "bool" }),
        new ConfigEntry({ key: "hide_reload_timer", label: "Reload Timer", type: "bool" }),
        new ConfigEntry({ key: "hide_reload_mini", label: "Reload Minigame", type: "bool" }),
        new ConfigEntry({ key: "hide_ammo_text", label: "Ammo Switch Text", type: "bool" }),
      ]),
      new ConfigCategory("Combat", [
        new ConfigEntry({ key: "hide_hit_marks", label: "Critical Hit Marks", type: "bool" }),
      ]),
      new ConfigCategory("Crosshair", [
        new ConfigEntry({ key: "hide_reticle", label: "Aim Circle", type: "bool" }),
        new ConfigEntry({ key: "hide_drop_calc", label: "Scope / Rangefinder", type: "bool" }),
        new ConfigEntry({ key: "hide_target_dist", label: "Rangefinder Distance", type: "bool" }),
        new ConfigEntry({ key: "hide_action_hints", label: "Action Hints (Fire)", type: "bool" }),
      ]),
      new ConfigCategory("Notifications", [
        new ConfigEntry({ key: "hide_perk_notif", label: "Skill Activation Banner", type: "bool" }),
        new ConfigEntry({ key: "hide_perk_bars", label: "Skill XP Bars", type: "bool" }),
        new ConfigEntry({ key: "hide_xp_score", label: "Battle Score Number", type: "bool" }),
      ]),
      new ConfigCategory("Enemies", [
        new ConfigEntry({ key: "hide_enemy_markers", label: "Enemy Markers (HP / Name / Class)", type: "bool" }),
        new ConfigEntry({ key: "hide_damage_log", label: "Damage Dealt Label", type: "bool" }),
        new ConfigEntry({ key: "hide_major_effects", label: "Major Status Effects", type: "bool" }),
        new ConfigEntry({ key: "hide_ability_markers", label: "Ability / Duration Markers", type: "bool" }),
        new ConfigEntry({ key: "hide_aux_markers", label: "Auxiliary Markers (Mines / Objects)", type: "bool" }),
      ]),
      new ConfigCategory("System", [new ConfigEntry({ key: "hide_perf", label: "Ping / FPS", type: "bool" })]),
      new ConfigCategory("Hangar", [
        new ConfigEntry({ key: "hangar_nav", label: "Navigation Tabs", type: "bool" }),
        new ConfigEntry({ key: "hangar_account", label: "Account Info (Level / Wallet)", type: "bool" }),
        new ConfigEntry({ key: "hangar_squad", label: "Squad Widget", type: "bool" }),
        new ConfigEntry({ key: "hangar_hero", label: "Hero Sign (Agent / Vehicle)", type: "bool" }),
        new ConfigEntry({ key: "hangar_hero_btns", label: "Modify Agent / Vehicle Buttons", type: "bool" }),
        new ConfigEntry({ key: "hangar_battle_pass", label: "Battle Pass Widget", type: "bool" }),
        new ConfigEntry({ key: "hangar_missions", label: "Missions Widget", type: "bool" }),
        new ConfigEntry({ key: "hangar_boosters", label: "Boosters Widget", type: "bool" }),
        new ConfigEntry({ key: "hangar_floating", label: "Floating Buttons (Results / Content Hub)", type: "bool" }),
        new ConfigEntry({ key: "hangar_mode_sel", label: "Game Mode Selector", type: "bool" }),
        new ConfigEntry({ key: "hangar_play_button", label: "Play Button", type: "bool" }),
        new ConfigEntry({ key: "hangar_shortcuts", label: "Shortcut Legend", type: "bool" }),
        new ConfigEntry({ key: "hangar_notifications", label: "Notification Center", type: "bool" }),
        new ConfigEntry({ key: "hangar_side_menu", label: "Side Menu", type: "bool" }),
      ]),
      new ConfigCategory("Modify Vehicle / Agent", [
        new ConfigEntry({ key: "mod_header", label: "Vehicle / Agent Header (Name + Level)", type: "bool" }),
        new ConfigEntry({ key: "mod_stats", label: "Vehicle Stats (Firepower / Toughness)", type: "bool" }),
        new ConfigEntry({ key: "mod_weapons", label: "Vehicle: Primary / Secondary Slots", type: "bool" }),
        new ConfigEntry({ key: "mod_fire_mode", label: "Vehicle: Firing Mode Indicator", type: "bool" }),
        new ConfigEntry({ key: "mod_payload", label: "Vehicle: Payload Counter", type: "bool" }),
        new ConfigEntry({ key: "mod_equipment", label: "Vehicle: Equipment Slots (C / M)", type: "bool" }),
        new ConfigEntry({ key: "mod_modules", label: "Vehicle: Modules Row", type: "bool" }),
        new ConfigEntry({ key: "mod_bonuses", label: "Agent: Ultimate / Trait", type: "bool" }),
        new ConfigEntry({ key: "mod_skills", label: "Agent: Skills Panel (Perks + Points)", type: "bool" }),
        new ConfigEntry({ key: "mod_vehicles", label: "Agent: Vehicle Selection Cards", type: "bool" }),
        new ConfigEntry({ key: "mod_agent_list", label: "Agent: Hero Selection List (by Role)", type: "bool" }),
      ]),
    ]);

    for (const key of [...allKeys, "hide_all"]) ctx.config.watch(key, () => (this.dirty = true));
  }

  override teardown(): void {
    this.ctx.hotkeys.unregister(this.toggleCombo);
    if (!this.acc) return;
    try {
      if (this.acc.connected) {
        this.acc.injectStylesheet("", STYLE_ID);
        this.acc.injectStylesheetMarkers("", STYLE_ID_MARKERS);
      }
      if (this.acc.connectedHangar) this.acc.injectStylesheetHangar("", STYLE_ID_HANGAR);
    } catch {
      /* ignore */
    }
  }

  override tick(_dt: number): void {
    this.ctx.config.checkReload();
    if (!this.acc) return;

    const connected = this.acc.connected;
    const connectedHangar = this.acc.connectedHangar;
    if (connected && !this.lastConnected) this.dirty = true;
    if (connectedHangar && !this.lastConnectedHangar) this.dirty = true;
    this.lastConnected = connected;
    this.lastConnectedHangar = connectedHangar;

    if (this.dirty && (connected || connectedHangar)) this.apply();
  }

  private toggleAll(): void {
    this.paused = !this.paused;
    this.dirty = true;
  }

  private apply(): void {
    const acc = this.acc!;
    if (this.paused) {
      if (acc.connected) {
        acc.injectStylesheet("", STYLE_ID);
        acc.injectStylesheetMarkers("", STYLE_ID_MARKERS);
      }
      if (acc.connectedHangar) acc.injectStylesheetHangar("", STYLE_ID_HANGAR);
      this.dirty = false;
      return;
    }

    const cfg = this.ctx.config;
    const hideAll = Boolean(cfg.get("hide_all"));

    const rules = (elements: Element[]): string => {
      const out: string[] = [];
      for (const [key, , selectors] of elements) {
        if (hideAll || Boolean(cfg.get(key))) {
          for (const sel of selectors) out.push(`${sel} { display: none !important; }`);
        }
      }
      return out.join("\n");
    };

    if (acc.connected) {
      acc.injectStylesheet(rules(ELEMENTS), STYLE_ID);
      acc.injectStylesheetMarkers(rules(MARKERS_ELEMENTS), STYLE_ID_MARKERS);
    }
    if (acc.connectedHangar) {
      acc.injectStylesheetHangar(rules(HANGAR_ELEMENTS) + "\n" + rules(MODIFY_ELEMENTS), STYLE_ID_HANGAR);
    }
    this.dirty = false;
  }
}
