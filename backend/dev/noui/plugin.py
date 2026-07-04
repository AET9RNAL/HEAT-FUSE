from __future__ import annotations

from typing import Optional

from loguru import logger

from fuse.core.api import FuseContext, FusePlugin
from fuse.ui.config_schema import ConfigCategory, ConfigEntry
from accessors import HUD, HANGAR

# Per-slot selectors for ability panel - nth-child inside AbilityPanel_base.
# DOM order: 1=ability1, 2=ability2, 3=passive(fixedPosition), 4=ultimate.
_ABILITY_1  = '[class*="AbilityPanel_base"] > [class*="AbilityPanel_ability"]:nth-child(1)'
_ABILITY_2  = '[class*="AbilityPanel_base"] > [class*="AbilityPanel_ability"]:nth-child(2)'
_PASSIVE    = '[class*="AbilityPanel_ability__fixedPosition"]'
_ULTIMATE   = '[class*="AbilityPanel_base"] > [class*="AbilityPanel_ability"]:nth-child(4)'

# (config_key, display_label, list_of_selectors_to_toggle)  - battle_hud page
_ELEMENTS: list[tuple[str, str, list[str]]] = [
    ("hide_hp",           "HP Bar",              [HUD.HP_BASE]),
    ("hide_energy",       "Energy Bar",          [HUD.MANA_BASE]),
    ("hide_ability_1",    "Ability 1",           [_ABILITY_1]),
    ("hide_ability_2",    "Ability 2",           [_ABILITY_2]),
    ("hide_passive",      "Passive Ability",     [_PASSIVE]),
    ("hide_ultimate",     "Ultimate",            [_ULTIMATE]),
    ("hide_equipment",    "Equipment Slots",     [HUD.EQUIPMENT]),
    ("hide_player_info",  "Agent Name / Class",  [HUD.PLAYER_INFO]),
    ("hide_sprint",       "Sprint Bar",          [HUD.SPRINT]),
    ("hide_speedometer",  "Speedometer",         [HUD.SPEEDOMETER]),
    ("hide_radar",        "Radar",               [HUD.RADAR]),
    ("hide_agent_xp",     "XP / Action Log",     [HUD.XP_LOG]),
    ("hide_kill_log",     "Kill Log",            [HUD.BATTLE_LOG]),
    ("hide_shell_type",   "Shell Type",          [HUD.AMMO_LOADER]),
    ("hide_reload_timer", "Reload Timer",        [HUD.RELOAD_TIMER]),
    ("hide_reload_mini",  "Reload Minigame",     [HUD.AMMO_LOADER]),
    ("hide_ammo_text",    "Ammo Switch Text",    [HUD.LOADER_SWITCH_HINT]),
    ("hide_hit_marks",    "Critical Hit Marks",  [HUD.HIT_INDICATOR]),
    ("hide_hints",        "Key Hints",           [HUD.KEY_HINTS]),
    ("hide_perf",         "Ping / FPS",          [HUD.PERF_INFO]),
    ("hide_perk_bars",    "Skill XP Bars",       [HUD.PERKS]),
    ("hide_xp_score",     "Battle Score Number", [HUD.NUMBER_BIG]),
    ("hide_reticle",      "Aim Circle",          [HUD.AIM_SWITCHER, HUD.FRONT_SIGHT]),
    ("hide_drop_calc",    "Scope / Rangefinder", [HUD.RETICLE]),
    ("hide_target_dist",  "Rangefinder Distance",[HUD.TARGET_DISTANCE]),
    ("hide_action_hints", "Action Hints (Fire)", [HUD.TARGETING_HINTS]),
]

# Elements on the markers page (separate WebSocket) - same structure.
# The skill-activation banner (TextNotification) moved here from battle_hud in a
# game update, so it must be hidden via the markers stylesheet.
_MARKERS_ELEMENTS: list[tuple[str, str, list[str]]] = [
    ("hide_perk_notif",      "Skill Activation Banner",           [HUD.TEXT_NOTIFICATION]),
    ("hide_enemy_markers",   "Enemy Markers (HP / Name / Class)", [HUD.MARKER_VEHICLE]),
    ("hide_damage_log",      "Damage Dealt Label",                [HUD.MARKER_DEALT_DAMAGE]),
    ("hide_major_effects",   "Major Status Effects",              [HUD.MARKER_MAJOR_EFFECT]),
    ("hide_ability_markers", "Ability / Duration Markers",        [HUD.TARGET_MARKERS]),
    ("hide_aux_markers",     "Auxiliary Markers (Mines / Objects)",[HUD.AUX_MARKER]),
]

# Elements on the hangar page (meta/index.html, separate WebSocket).
_HANGAR_ELEMENTS: list[tuple[str, str, list[str]]] = [
    ("hangar_nav",           "Navigation Tabs",             [HANGAR.NAV]),
    ("hangar_account",       "Account Info (Level / Wallet)", [HANGAR.ACCOUNT_INFO]),
    ("hangar_squad",         "Squad Widget",                [HANGAR.SQUAD_WIDGET]),
    ("hangar_hero",          "Hero Sign (Agent / Vehicle)", [HANGAR.HERO_SIGN]),
    ("hangar_hero_btns",     "Modify Agent / Vehicle Buttons", [HANGAR.HERO_NAV]),
    ("hangar_battle_pass",   "Battle Pass Widget",          [HANGAR.BATTLE_PASS_WIDGET]),
    ("hangar_missions",      "Missions Widget",             [HANGAR.MISSIONS_WIDGET]),
    ("hangar_boosters",      "Boosters Widget",             [HANGAR.BOOSTERS_WIDGET]),
    ("hangar_floating",      "Floating Buttons (Results / Content Hub)", [HANGAR.FLOATING_BUTTONS]),
    ("hangar_mode_sel",      "Game Mode Selector",          [HANGAR.MODE_SELECTOR]),
    ("hangar_play_button",   "Play Button",                 [HANGAR.PLAY_BUTTON]),
    ("hangar_shortcuts",     "Shortcut Legend",             [HANGAR.SHORTCUT_LEGEND]),
    ("hangar_notifications", "Notification Center",         [HANGAR.NOTIFICATION_CENTER]),
    ("hangar_side_menu",     "Side Menu",                   [HANGAR.SIDE_MENU]),
]

# Elements on the modify vehicle / agent sub-pages (same hangar WebSocket).
_MODIFY_ELEMENTS: list[tuple[str, str, list[str]]] = [
    # Shared
    ("mod_header",    "Vehicle / Agent Header (Name + Level)", [HANGAR.HERO_SIGN_VEHICLE]),
    ("mod_stats",     "Vehicle Stats (Firepower / Toughness)", [HANGAR.VEHICLE_STATS]),
    # Vehicle tab
    ("mod_weapons",   "Vehicle: Primary / Secondary Weapon Slots", [HANGAR.VEHICLE_FEATURES]),
    ("mod_fire_mode", "Vehicle: Firing Mode Indicator",            [HANGAR.VEHICLE_FIRE_MODE]),
    ("mod_payload",   "Vehicle: Payload Counter",                  [HANGAR.VEHICLE_POWER]),
    ("mod_equipment", "Vehicle: Equipment Slots (C / M)",          [HANGAR.VEHICLE_EQUIPMENT]),
    ("mod_modules",   "Vehicle: Modules Row",                      [HANGAR.VEHICLE_MODULES]),
    # Agent tab
    ("mod_bonuses",   "Agent: Ultimate / Trait",                   [HANGAR.AGENT_BONUSES]),
    ("mod_skills",    "Agent: Skills Panel (Perks + Points)",       [HANGAR.AGENT_SKILLS_BTN]),
    ("mod_vehicles",  "Agent: Vehicle Selection Cards",             [HANGAR.AGENT_VEHICLES]),
    ("mod_agent_list", "Agent: Hero Selection List (by Role)",      [HANGAR.AGENT_LIST]),
]

_STYLE_ID         = "__fuse_noui__"
_STYLE_ID_MARKERS = "__fuse_noui_m__"
_STYLE_ID_HANGAR  = "__fuse_noui_h__"


class NoUiPlugin(FusePlugin):
    """Hides individual HUD elements via an injected <style> tag in battle_hud.

    Uses inject_stylesheet() so !important rules in the stylesheet beat
    non-important inline style writes the game makes on every tick.
    Enemy markers (HP bar, name, class) are hidden via inject_stylesheet_markers()
    which targets the separate markers WebSocket page.
    """

    def __init__(self) -> None:
        self.ctx:    Optional[FuseContext] = None
        self._acc                          = None
        self._dirty:                bool   = True
        self._last_connected:       bool   = False
        self._last_connected_hangar: bool  = False
        self._paused:               bool   = False  # Ctrl+H: temporarily show HUD

    def setup(self, ctx: FuseContext) -> None:
        self.ctx = ctx
        self._acc = ctx.services.get("accessors")
        if self._acc is None:
            logger.warning("noui: 'accessors' service not available - plugin inactive")

        toggle_combo = ctx.hotkey_for("toggle", "ctrl+h")
        ctx.hotkeys.register(toggle_combo, self._toggle_all, label="Toggle No-UI")

        all_element_keys = [key for key, _, _ in _ELEMENTS + _MARKERS_ELEMENTS + _HANGAR_ELEMENTS + _MODIFY_ELEMENTS]
        defaults: dict = {key: False for key in all_element_keys}
        defaults["hide_all"] = False
        ctx.config.defaults(**defaults).load()

        ctx.config.schema([
            ConfigCategory("Master", [
                ConfigEntry("hide_all", "Hide All",
                            type="bool",
                            description="Override all toggles - hide every element at once"),
            ]),
            ConfigCategory("HP / Energy", [
                ConfigEntry("hide_hp",     "HP Bar",    type="bool"),
                ConfigEntry("hide_energy", "Energy Bar", type="bool"),
            ]),
            ConfigCategory("Abilities", [
                ConfigEntry("hide_ability_1", "Ability 1",       type="bool"),
                ConfigEntry("hide_ability_2", "Ability 2",       type="bool"),
                ConfigEntry("hide_passive",   "Passive Ability", type="bool"),
                ConfigEntry("hide_ultimate",  "Ultimate",        type="bool"),
                ConfigEntry("hide_equipment", "Equipment Slots", type="bool"),
            ]),
            ConfigCategory("Player", [
                ConfigEntry("hide_player_info", "Agent Name / Class", type="bool"),
                ConfigEntry("hide_hints",       "Key Hints",          type="bool"),
            ]),
            ConfigCategory("Movement", [
                ConfigEntry("hide_sprint",      "Sprint Bar",  type="bool"),
                ConfigEntry("hide_speedometer", "Speedometer", type="bool"),
            ]),
            ConfigCategory("Tactical", [
                ConfigEntry("hide_radar",    "Radar",          type="bool"),
                ConfigEntry("hide_agent_xp", "XP / Action Log", type="bool"),
                ConfigEntry("hide_kill_log", "Kill Log",       type="bool"),
            ]),
            ConfigCategory("Weapons", [
                ConfigEntry("hide_shell_type",   "Shell Type",       type="bool"),
                ConfigEntry("hide_reload_timer", "Reload Timer",     type="bool"),
                ConfigEntry("hide_reload_mini",  "Reload Minigame",  type="bool"),
                ConfigEntry("hide_ammo_text",    "Ammo Switch Text", type="bool"),
            ]),
            ConfigCategory("Combat", [
                ConfigEntry("hide_hit_marks", "Critical Hit Marks", type="bool"),
            ]),
            ConfigCategory("Crosshair", [
                ConfigEntry("hide_reticle",      "Aim Circle",           type="bool"),
                ConfigEntry("hide_drop_calc",     "Scope / Rangefinder",  type="bool"),
                ConfigEntry("hide_target_dist",   "Rangefinder Distance", type="bool"),
                ConfigEntry("hide_action_hints",  "Action Hints (Fire)",  type="bool"),
            ]),
            ConfigCategory("Notifications", [
                ConfigEntry("hide_perk_notif", "Skill Activation Banner", type="bool"),
                ConfigEntry("hide_perk_bars",  "Skill XP Bars",           type="bool"),
                ConfigEntry("hide_xp_score",   "Battle Score Number",     type="bool"),
            ]),
            ConfigCategory("Enemies", [
                ConfigEntry("hide_enemy_markers",   "Enemy Markers (HP / Name / Class)", type="bool"),
                ConfigEntry("hide_damage_log",      "Damage Dealt Label",                type="bool"),
                ConfigEntry("hide_major_effects",   "Major Status Effects",              type="bool"),
                ConfigEntry("hide_ability_markers", "Ability / Duration Markers",        type="bool"),
                ConfigEntry("hide_aux_markers",     "Auxiliary Markers (Mines / Objects)", type="bool"),
            ]),
            ConfigCategory("System", [
                ConfigEntry("hide_perf", "Ping / FPS", type="bool"),
            ]),
            ConfigCategory("Hangar", [
                ConfigEntry("hangar_nav",           "Navigation Tabs",                        type="bool"),
                ConfigEntry("hangar_account",       "Account Info (Level / Wallet)",          type="bool"),
                ConfigEntry("hangar_squad",         "Squad Widget",                           type="bool"),
                ConfigEntry("hangar_hero",          "Hero Sign (Agent / Vehicle)",            type="bool"),
                ConfigEntry("hangar_hero_btns",     "Modify Agent / Vehicle Buttons",         type="bool"),
                ConfigEntry("hangar_battle_pass",   "Battle Pass Widget",                     type="bool"),
                ConfigEntry("hangar_missions",      "Missions Widget",                        type="bool"),
                ConfigEntry("hangar_boosters",      "Boosters Widget",                        type="bool"),
                ConfigEntry("hangar_floating",      "Floating Buttons (Results / Content Hub)", type="bool"),
                ConfigEntry("hangar_mode_sel",      "Game Mode Selector",                     type="bool"),
                ConfigEntry("hangar_play_button",   "Play Button",                            type="bool"),
                ConfigEntry("hangar_shortcuts",     "Shortcut Legend",                        type="bool"),
                ConfigEntry("hangar_notifications", "Notification Center",                    type="bool"),
                ConfigEntry("hangar_side_menu",     "Side Menu",                              type="bool"),
            ]),
            ConfigCategory("Modify Vehicle / Agent", [
                ConfigEntry("mod_header",    "Vehicle / Agent Header (Name + Level)",   type="bool"),
                ConfigEntry("mod_stats",     "Vehicle Stats (Firepower / Toughness)",   type="bool"),
                ConfigEntry("mod_weapons",   "Vehicle: Primary / Secondary Slots",      type="bool"),
                ConfigEntry("mod_fire_mode", "Vehicle: Firing Mode Indicator",          type="bool"),
                ConfigEntry("mod_payload",   "Vehicle: Payload Counter",                type="bool"),
                ConfigEntry("mod_equipment", "Vehicle: Equipment Slots (C / M)",        type="bool"),
                ConfigEntry("mod_modules",   "Vehicle: Modules Row",                    type="bool"),
                ConfigEntry("mod_bonuses",   "Agent: Ultimate / Trait",                 type="bool"),
                ConfigEntry("mod_skills",    "Agent: Skills Panel (Perks + Points)",    type="bool"),
                ConfigEntry("mod_vehicles",  "Agent: Vehicle Selection Cards",          type="bool"),
                ConfigEntry("mod_agent_list", "Agent: Hero Selection List (by Role)",   type="bool"),
            ]),
        ])

        for key in all_element_keys + ["hide_all"]:
            ctx.config.watch(key, lambda _v: self._mark_dirty())

    def teardown(self) -> None:
        if self.ctx:
            self.ctx.hotkeys.unregister(self.ctx.hotkey_for("toggle", "ctrl+h"))
        if self._acc:
            try:
                if self._acc.connected:
                    self._acc.inject_stylesheet("", _STYLE_ID)
                    self._acc.inject_stylesheet_markers("", _STYLE_ID_MARKERS)
                if self._acc.connected_hangar:
                    self._acc.inject_stylesheet_hangar("", _STYLE_ID_HANGAR)
            except Exception:
                pass


    def tick(self, dt: float) -> None:
        if self.ctx:
            self.ctx.config.check_reload()
        if self._acc is None:
            return

        connected        = self._acc.connected
        connected_hangar = self._acc.connected_hangar

        if connected and not self._last_connected:
            self._dirty = True
        if connected_hangar and not self._last_connected_hangar:
            self._dirty = True

        self._last_connected        = connected
        self._last_connected_hangar = connected_hangar

        if self._dirty and (connected or connected_hangar):
            self._apply()


    def _toggle_all(self) -> None:
        self._paused = not self._paused
        self._dirty = True

    def _mark_dirty(self) -> None:
        self._dirty = True

    def _apply(self) -> None:
        if self._paused:
            if self._acc.connected:
                self._acc.inject_stylesheet("", _STYLE_ID)
                self._acc.inject_stylesheet_markers("", _STYLE_ID_MARKERS)
            if self._acc.connected_hangar:
                self._acc.inject_stylesheet_hangar("", _STYLE_ID_HANGAR)
            self._dirty = False
            return

        cfg      = self.ctx.config
        hide_all = bool(cfg.get("hide_all"))

        def _rules(elements):
            rules: list[str] = []
            for key, _label, selectors in elements:
                if hide_all or bool(cfg.get(key)):
                    for sel in selectors:
                        rules.append(f"{sel} {{ display: none !important; }}")
            return "\n".join(rules)

        if self._acc.connected:
            self._acc.inject_stylesheet(_rules(_ELEMENTS), _STYLE_ID)
            self._acc.inject_stylesheet_markers(_rules(_MARKERS_ELEMENTS), _STYLE_ID_MARKERS)

        if self._acc.connected_hangar:
            self._acc.inject_stylesheet_hangar(
                _rules(_HANGAR_ELEMENTS) + "\n" + _rules(_MODIFY_ELEMENTS),
                _STYLE_ID_HANGAR,
            )

        self._dirty = False


__all__ = ["NoUiPlugin"]
