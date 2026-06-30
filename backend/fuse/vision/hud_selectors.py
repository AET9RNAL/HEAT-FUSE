"""CSS selector constants for battle_hud and markers DOM elements.

Selectors use attribute substring matching ([class*="prefix"]) so they survive
CSS module hash suffix changes (e.g. HpBar_base_0df → HpBar_base_abc).

Discovered by live CDP DOM dump.  Sections mirror the visual layers of the HUD.

Usage from any plugin:

    from fuse.vision.accessors import HUD
    acc.hide(HUD.HP_BASE)
    acc.set_color(HUD.MANA_VALUE, "rgba(255,80,0,1)")
    acc.hide(HUD.SPRINT)
    acc.hide(HUD.RADAR, all_matching=False)
"""
from __future__ import annotations

# Helper - keeps literal strings short while making intent clear.
_c = '[class*="{}"]'.format  # noqa: E731


class HUD:
    """Selector constants for every meaningful DOM element in battle_hud / markers."""

    # Root
    ROOT                      = _c("BattleHud_base")

    # Layout anchor containers (id-based - stable, no hash suffix)
    # Each DynamicContainer has a stable id="root_*" child div.
    CONTAINER_CENTER          = '#root_main'
    CONTAINER_CENTER_BOTTOM   = '#root_main_bc'
    CONTAINER_CENTER_TOPLEFT  = '#root_main_trCol'
    CONTAINER_CENTER_RIGHT    = '#root_main_rc'
    CONTAINER_CENTER_BR       = '#root_main_br'
    CONTAINER_CENTER_LEFT     = '#root_main_lc'
    CONTAINER_CTR             = '#root_ctr'
    CONTAINER_BOTTOM_CENTER   = '#root_bc'
    CONTAINER_TOP_RIGHT       = '#root_tr'
    CONTAINER_RIGHT_CENTER    = '#root_rc'
    CONTAINER_BOTTOM_RIGHT    = '#root_br'
    CONTAINER_PLAYER_PANEL    = '#root_playerPanel'
    CONTAINER_FULL_SIZE       = '#root_fullSize'
    CONTAINER_TOP_CENTER      = '#root_tc'
    CONTAINER_TOP_LEFT        = '#root_tl'
    CONTAINER_LEFT_CENTER     = '#root_lc'
    CONTAINER_CROSSHAIR       = '#root_crosshairEffect'
    CONTAINER_CENTER_CROSSHAIR = '#root_centerLayout_crosshairEffect'
    CONTAINER_CENTER_LAYOUT   = '#root_centerLayout'

    # HP Bar
    HP_BASE          = _c("HpBar_base")
    HP_HIGHLIGHT     = _c("HpBar_highlight")         # purple/cracked effect overlay
    HP_CRACKED       = _c("HpBar_crackedEffect")
    HP_VALUE_WRAPPER = _c("HpBar_valueWrapper")
    HP_VALUE         = _c("HpBar_hpValue")           # numeric HP (both thousand + units)
    HP_THOUSANDS     = _c("HpBar_hpValue__thousands")
    HP_REGEN         = _c("HpBar_hpPerSec")          # +N regen text
    HP_PROGRESS_INNER = _c("HpBar_progressInner")    # colored fill inside bar
    # ProgressBar sub-elements scoped to HpBar:
    HP_PROGRESS_BAR  = _c("HpBar") + ' ' + _c("ProgressBar_progress")
    HP_PROGRESS_BG   = _c("HpBar") + ' ' + _c("ProgressBar_barContent")

    # Mana / Ability Energy Bar
    MANA_BASE        = _c("ManaBar_base")
    MANA_VALUE_WRAPPER = _c("ManaBar_valueWrapper")
    MANA_ICON        = _c("ManaBar_manaIcon")
    MANA_VALUE       = _c("ManaBar_manaValue")
    MANA_PROGRESS    = _c("ManaBar_progress")        # colored fill inside bar
    MANA_REGEN       = _c("ManaBar_manaPerSec")      # +N regen text

    # Sprint / Boost
    SPRINT           = _c("SprintIndicator_base")
    SPRINT_DRAIN     = _c("SprintDrain_drainProgress")
    SPRINT_DRAIN_BG  = _c("SprintDrain_content")
    SPRINT_GLOW      = _c("SprintDrain_glow")
    BOOST            = _c("BoostIndicator_base")
    BOOST_ICON       = _c("BoostIndicator_vehicleIcon")

    # Zoom Indicator
    ZOOM_BASE        = _c("ZoomIndicator_base")      # root; visibility:hidden when no scope
    ZOOM_ZOOMS       = _c("ZoomIndicator_zooms")
    ZOOM_FACTORS     = _c("ZoomIndicator_factors")
    ZOOM_VALUE_WRAPPER = _c("ZoomIndicator_valueWrapper")  # __active variant when selected
    ZOOM_VALUE       = _c("ZoomIndicator_value")     # absent in this build; use ZOOM_VALUE_WRAPPER

    # Crosshair / Reticle
    CROSSHAIR_AIM    = _c("CrosshairAim_base")
    CROSSHAIR_MARK   = _c("CrosshairAim_centeredMark")    # 4×4 center dot
    AIM_SWITCHER     = _c("AimSwitcher_base")
    DEFAULT_AIM      = _c("DefaultAim_base")
    DEFAULT_AIM_CIRCLE = _c("DefaultAim_staticCircle")
    DEFAULT_AIM_SHADOW = _c("DefaultAim_shadowCircle")
    FRONT_SIGHT      = _c("FrontSight_base")
    RETICLE          = _c("Reticle_base")
    DEFAULT_RETICLE  = _c("DefaultReticle_base")     # scoped crosshair image

    # Ammo Loader
    AMMO_LOADER      = _c("AmmoLoader_base")
    DEFAULT_LOADER   = _c("DefaultLoader_base")
    LOADER_SECTORS   = _c("DefaultLoader_sectorsWrapper")
    LOADER_RELOADER  = _c("DefaultLoader_reloader")
    LOADER_CAPTION   = _c("DefaultLoader_caption")   # "Switching" timer text
    LOADER_SWITCH_HINT      = _c("LoaderSwitchingHint_base")
    LOADER_SWITCH_PROGRESS  = _c("LoaderSwitchingHint_progress")

    # Reload Timer
    RELOAD_TIMER     = _c("ReloadTimer_base")

    # Target Hit Indicator
    HIT_INDICATOR      = _c("TargetHitIndicator_base")
    HIT_CASUAL         = _c("TargetHitIndicator_casualHit")
    HIT_CRITICAL_BASE  = _c("TargetHitIndicator_criticalBaseHit")
    HIT_CRITICAL_SUPER = _c("TargetHitIndicator_criticalSuperHit")
    HIT_CRITICAL_MEGA  = _c("TargetHitIndicator_criticalMegaHit")
    HIT_GLOW           = _c("TargetHitIndicator_criticalGlow")
    HIT_MEGA_ICON      = _c("TargetHitIndicator_megaEffectIcon")

    # Speedometer
    SPEEDOMETER        = _c("Speedometer_base")
    SPEEDOMETER_VALUE  = _c("Speedometer_speedValue")
    SPEEDOMETER_UNIT   = _c("Speedometer_speedUnit")
    SPEEDOMETER_GLOW   = _c("Speedometer_glow")

    # Vehicle Doll (bottom-left, small tank silhouette)
    VEHICLE_DOLL       = _c("VehicleDoll_base")
    VEHICLE_DOLL_HULL  = _c("SimpleDoll_hull")
    VEHICLE_DOLL_IMAGE = _c("SimpleDoll_dollImage")
    VEHICLE_DOLL_TURRET = _c("SimpleDoll_turret")

    # Radar
    RADAR              = _c("Radar_base")
    RADAR_COMPASS      = _c("Radar_compass")
    RADAR_DISPLAY      = _c("Radar_display")
    RADAR_DOLL         = _c("Radar_doll")
    RADAR_SPOTTING     = _c("Radar_spottingSectorWrapper")
    RADAR_VIEW_SECTOR  = _c("Radar_viewSectorWrapper")
    RADAR_OBJECTS      = _c("Radar_detectedObjectsContainer")
    RADAR_BASES        = _c("Radar_detectedBases")

    # Player Info panel (bottom-left: name, voice, signature)
    PLAYER_INFO        = _c("PlayerInfo_base")
    PLAYER_NAME        = _c("PlayerInfo_signName")    # character name text
    PLAYER_ROLE_ICON   = _c("PlayerSignature_role")
    VOICE_INDICATOR    = _c("VoiceIndicator_base")
    VOICE_RADIO        = _c("VoiceIndicator_radio")
    VOICE_MUTE         = _c("VoiceIndicator_mute")

    # Key Hints overlay (Escape / Settings shortcuts, shown bottom-left)
    KEY_HINTS          = _c("FiringRange_base")   # FiringRange re-used as hint container

    # Abilities
    ABILITY_PANEL      = _c("AbilityPanel_base")
    ABILITY_SLOT       = _c("AbilityPanel_ability")   # each slot wrapper (multiple)
    ABILITY_ITEM       = _c("Ability_base")
    ABILITY_IMAGE      = _c("Ability_abilityImage")
    ABILITY_BORDER     = _c("Ability_abilityBorder")
    ABILITY_PROGRESS   = _c("Ability_progress")
    ABILITY_ACTIVE     = _c("ActiveState_base")
    ABILITY_COST       = _c("CostInfo_costValue")
    ABILITY_MANA_ICON  = _c("CostInfo_manaIcon")
    ABILITY_HOTKEY     = _c("Ability_hotkeyApply")

    # Equipment
    EQUIPMENT          = _c("Equipment_base")
    EQUIPMENT_SLOT     = _c("Equipment_slot")
    EQUIPMENT_ITEM     = _c("EquipmentItem_base")
    EQUIPMENT_ICON     = _c("EquipmentItem_abilityIcon")
    EQUIPMENT_COUNT    = _c("EquipmentEffectCount_base")

    # In-battle score / XP counter
    NUMBER_BIG         = _c("Number_base__BodyL")

    # Rangefinder distance label
    TARGET_DISTANCE    = _c("TargetDistance_base")

    # Perks
    PERKS              = _c("Perks_container")
    PERK_ITEM          = _c("Perk_base")
    PERK_FILL          = _c("Perk_progressFill")
    PERK_ICON          = _c("Perk_icon")

    # Kill / XP Feed
    KILL_INDICATOR     = _c("KillIndicator_base")
    KILL_LIST          = _c("KillIndicator_skullKillList")
    XP_LOG             = _c("XPLog_base")
    XP_LOG_LIST        = _c("XPLog_logListXp")
    XP_VALUE           = _c("LogXP_xpValue")
    XP_ACTIONS         = _c("XPLog_actions")
    BATTLE_LOG         = _c("BattleLog_base")
    BATTLE_LOG_ITEM    = _c("LogItem_base")
    BATTLE_LOG_CONTENT = _c("LogItem_content")
    BATTLE_LOG_KILL    = _c("LogItemKill_base")

    # Communication Wheel
    COMM_WHEEL         = _c("CommWheel_base")
    COMM_WHEEL_SECTOR  = _c("CommWheel_sector")

    # Text / Perk Notification (center-screen popup)
    TEXT_NOTIFICATION  = _c("TextNotification_base")
    TEXT_NOTIF_CAPTION = _c("TextNotification_captionText")
    TEXT_NOTIF_ICON    = _c("TextNotification_icon")

    # Voice-Over Notification
    VOICEOVER          = _c("VoiceOverNotification_base")

    # Conflict Status (top-center, invaders balance)
    CONFLICT_STATUS    = _c("ConflictStatus_base")

    # Performance Info (ping / FPS)
    PERF_INFO          = _c("PerfInfo_base")
    PERF_PING          = _c("PerfInfo_statValue")     # all stat values; filter by sibling text if needed

    # Death Screen
    DEATH_SCREEN       = _c("DeathScreen_base")
    DEATH_CARD         = _c("DeathCard_base")

    # Tactical Map
    TACTICAL_MAP       = _c("TacticalMap_base")

    # Battle Objectives
    BATTLE_OBJECTIVES  = _c("BattleObjectives_base")

    # Last Damage panel (bottom-right)
    LAST_DAMAGE        = _c("LastDamage_base")
    LAST_DAMAGE_LIST   = _c("LastDamage_list")

    # Ability Targeting Hints
    TARGETING_HINTS    = _c("TargetingHints_base")
    ABILITY_HINTS      = _c("AbilityHints_base")

    # Markers page  (separate WebSocket — coui://ui/build/markers/index.html)
    # Use Accessors.inject_stylesheet_markers() / _exec_markers() for these.

    # Vehicle markers (enemy HP bars, names, class icons)
    MARKERS_ROOT           = _c("Markers_base")
    MARKER_VEHICLE         = _c("VehicleMarker_base")       # whole enemy marker
    MARKER_PRIMARY         = _c("VehicleMarker_primarySlot")
    MARKER_TOP             = _c("VehicleMarker_topSlot")
    MARKER_ROLE_SLOT       = _c("VehicleMarker_roleSlot")   # class icon slot
    MARKER_HERO_LABEL      = _c("VehicleMarker_heroLabel")  # agent name above HP
    MARKER_USERNAME        = _c("VehicleMarker_userName")   # player name
    MARKER_HEALTH_VALUE    = _c("VehicleMarker_healthValue")
    MARKER_HEALTH_PANEL    = _c("HealthPanel_base")
    MARKER_HEALTH_BAR      = _c("ProgressBar_progress")     # scoped to HealthPanel
    MARKER_HEALTH_BG       = _c("ProgressBar_barContent")
    MARKER_DAMAGE_DELTA    = _c("HealthPanel_damageDelta")  # red flash on damage
    MARKER_SIDE_SLOT       = _c("VehicleMarker_sideSlot")
    MARKER_BOTTOM_SLOT     = _c("VehicleMarker_bottomSlot")
    MARKER_TACTIC          = _c("TacticVehicleMarker_base") # tactic indicator
    MARKER_KILL_NOTIF      = _c("KillNotification_base")

    # Status effects on vehicle markers
    MARKER_EFFECTS         = _c("EffectsPanel_base")        # effect icon strip
    MARKER_EFFECT_ITEM     = _c("VehicleEffect_base")       # each effect icon
    MARKER_EFFECT_ICON     = _c("VehicleEffect_effectIcon")
    MARKER_MAJOR_EFFECT    = _c("MajorEffect_base")         # large prominent effect
    MARKER_MAJOR_IMAGE     = _c("MajorEffect_effectImage")  # effect artwork
    MARKER_MAJOR_CAPTION   = _c("MajorEffect_caption")      # effect name text
    MARKER_MAJOR_PROGRESS  = _c("MajorEffect_progress")     # duration bar fill
    MARKER_MAJOR_PROGRESS_WRAP = _c("MajorEffect_progressWrapper")

    # Floating damage label
    MARKER_DEALT_DAMAGE    = _c("DealtDamageMarker_base")   # "974 Fuel" floating text

    # Ability / duration markers (TargetMarkers layer)
    # Appear over terrain/objects when an ability is active (mines, barrage, etc.)
    # CommonAbilityMarker_icon background-image → duration_marker_*.png asset.
    TARGET_MARKERS         = _c("TargetMarkers_base")       # container for all below
    ABILITY_MARKER         = _c("AbilityMarker_base")       # root per ability marker
    ABILITY_MARKER_COMMON  = _c("CommonAbilityMarker_base") # body
    ABILITY_MARKER_ICON    = _c("CommonAbilityMarker_icon") # bg-image = duration_marker asset
    ABILITY_MARKER_TIME    = _c("CommonAbilityMarker_remainingTime")      # timer wrapper
    ABILITY_MARKER_TIME_VAL = _c("CommonAbilityMarker_remainingTimeValue") # countdown text
    ABILITY_MARKER_BOTTOM  = _c("CommonAbilityMarker_bottomLine")
    ABILITY_MARKER_ARROW   = _c("CommonAbilityMarker_arrow")  # direction pointer

    # Auxiliary markers (mines, objects with HP/lifetime)
    AUX_MARKER             = _c("AuxiliaryMarker_base")
    AUX_MARKER_HEADER      = _c("AuxiliaryMarker_headerWrapper")
    AUX_MARKER_LIFETIME    = _c("AuxiliaryMarker_lifetime")   # countdown text
    AUX_MARKER_CAPTION     = _c("AuxiliaryMarker_caption")    # object name
    AUX_MARKER_ICON        = _c("AuxiliaryMarker_markIcon")
    AUX_MARKER_SHADOW_ICON = _c("AuxiliaryMarker_shadowIcon")
    AUX_MARKER_HP          = _c("AuxiliaryMarker_hpBar")
    AUX_MARKER_DAMAGE      = _c("AuxiliaryMarker_damageDelta")

    # Player direction / pointer overlays
    TACTICAL_POINTER       = _c("TacticalPlayerPointer_base")
    TACTICAL_POINTER_OUTLINE = _c("TacticalPlayerPointer_outline")
    TACTICAL_POINTER_MARK  = _c("TacticalPlayerPointer_playerMark")
    TACTICAL_POINTER_DIR   = _c("TacticalPlayerPointer_playerDirection")
    ABILITY_POINTER        = _c("AbilityPlayerPointer_base")
    ABILITY_POINTER_LABEL  = _c("AbilityPlayerPointer_label")

    # Rampage vignette (screen edge effect)
    RAMPAGE_VIGNETTE       = _c("RampageVignette_base")


class HANGAR:
    """Selector constants for every meaningful DOM element in the hangar (meta/index.html).

    Discovered by live CDP DOM dump on the main menu / BaseCamp screen.
    Use with Accessors.inject_stylesheet_hangar(), set_style_hangar(), etc.
    """

    # Root layout
    ROOT              = _c("HangarView_view")
    ROUTER            = _c("RouterView_base")
    BASE_CAMP         = _c("BaseCamp_base")          # main page container
    BASE_CAMP_CONTAINER = _c("BaseCamp_container")
    BASE_CAMP_WRAPPER = _c("BaseCamp_wrapper")

    # Account info (top-right cluster)
    ACCOUNT_INFO      = _c("AccountInfo_base")
    ACCOUNT_BUTTONS   = _c("AccountInfo_topMenuButtonsContainer")
    TOP_MENU_BUTTON   = _c("TopMenuButton_base")     # social / progression / wallet buttons
    TOP_MENU_UNDERLINE = _c("TopMenuButton_underline")
    WALLET_CONTAINER  = _c("AccountInfo_walletContainer")

    # Level progression (inside top-right)
    LEVEL_PROGRESSION = _c("LevelProgression_base")
    LEVEL_CONTAINER   = _c("LevelProgression_levelContainer")
    LEVEL_IMAGE       = _c("LevelProgression_levelImage")  # rank badge icon
    LEVEL_VALUE       = _c("LevelProgression_levelValue")  # numeric rank text
    LEVEL_BAR         = _c("LevelProgression_progressionBar")  # SVG XP arc

    # Wallet / currency
    WALLET            = _c("Wallet_base")
    WALLET_ROW        = _c("Wallet_reputation")      # each currency row
    CURRENCY          = _c("Currency_base")          # wrapper per currency
    CURRENCY_ICON     = _c("Currency_icon")
    CURRENCY_AMOUNT   = _c("Currency_amountAnimated")

    # Squad widget (right panel)
    SQUAD_WIDGET      = _c("SquadWidget_base")
    SQUAD_ENTRY       = _c("SquadEntry_base")        # each player slot
    SQUAD_ENTRY_LEFT  = _c("SquadEntry_leftContainer")
    SQUAD_READINESS   = _c("SquadEntry_readiness")   # "READY" text
    SQUAD_AVATAR      = _c("SquadEntry_imageContainer")
    PLAYER_IDENTITY   = _c("PlayerIdentity_base")
    PLAYER_NAME       = _c("PlayerIdentity_name")
    SPEAK_INDICATOR   = _c("SpeakIndicator_base")    # voice activity ring
    INVITE_ENTRY      = _c("InviteEntry_base")       # empty invite slot
    INVITE_BUTTON     = _c("InviteEntry_button")
    SQUAD_BOOSTER_TEXT = _c("InviteEntry_squadBoosterWrapper")  # "+15% bonus" text

    # Navigation tabs (top center)
    NAV               = _c("Navigation_base")
    NAV_WRAPPER       = _c("BumperNavigation_base")
    NAV_TAB           = _c("CommonTab_base")         # every tab
    NAV_TAB_SELECTED  = _c("Tab_tab__selected")      # active tab
    NAV_TAB_LABEL     = _c("CommonTab_title")        # tab text
    NAV_BADGE         = _c("DiscoveryBadge_base")    # red notification dot on tabs

    # Hero sign / vehicle info (center area)
    HERO_SIGN         = _c("HeroSignCommon_base")    # whole center panel
    HERO_LEVEL        = _c("HeroSignCommon_level")   # level badge
    HERO_LEVEL_LEFT   = _c("HeroSignCommon_levelDecorLeft")
    HERO_LEVEL_RIGHT  = _c("HeroSignCommon_levelDecorRight")
    HERO_LEVEL_VALUE  = _c("HeroSignCommon_levelValue")
    HERO_TITLE        = _c("HeroSignCommon_title")   # vehicle name line
    HERO_CALL_SIGN    = _c("HeroSignCommon_callSignWrapper")
    HERO_CALL_SIGN_TEXT = _c("HeroSignCommon_callSign")   # agent call sign
    HERO_PROGRESS_WRAP = _c("HeroSignCommon_progressWrapper")
    HERO_PROGRESS     = _c("HeroSignCommon_progress")
    HERO_CHILDREN     = _c("HeroSignCommon_childrenContent")
    VEHICLE_POST_PROG = _c("VehicleSign_postProgression")  # post-max-level decor
    PROGRESS_BAR      = _c("ProgressBar_base")
    PROGRESS_VALUE    = _c("ProgressBar_value")      # filled bar portion

    # Hero navigation buttons (MODIFY AGENT / MODIFY VEHICLE)
    HERO_NAV          = _c("HeroNavigation_base")
    HERO_NAV_ITEM     = _c("HeroNavigationItem_base")
    HERO_NAV_BUTTON   = _c("HeroNavigationItem_button")
    MODIFY_AGENT_BTN  = '[data-test-id="BaseCampModifyAgentButton"]'
    MODIFY_VEHICLE_BTN = '[data-test-id="BaseCampModifyVehicleButton"]'

    # Battle Pass widget (bottom-left card)
    BATTLE_PASS_WIDGET  = _c("BattlePassWidget_base")
    BATTLE_PASS_IMAGE   = _c("BattlePassWidget_image")
    BATTLE_PASS_TITLE   = _c("BattlePassWidget_widget")   # "WEEKLY PASS" text area
    BATTLE_PASS_SUBTITLE = _c("BattlePassWidget_subtitle")  # "WEEK 5/5"
    BATTLE_PASS_TIMER   = _c("BattlePassWidget_timer")      # "3d 6h"

    # Missions widget (bottom-left card)
    MISSIONS_WIDGET   = _c("MissionsWidget_base")
    MISSION_LABEL     = _c("MissionLabel_base")      # group header ("LEO 1A6A1")
    MISSION_LABEL_ROLE = _c("MissionLabel_role")     # role icon in header
    MISSION_CARD      = _c("MissionCard_base")       # each mission row
    MISSION_TITLE     = _c("MissionCard_title")      # mission description text
    MISSION_VALUES    = _c("MissionCard_values")     # "0/5" counter
    MISSION_TIMER     = _c("QuestTimer_base")        # time remaining
    MISSION_STATUS    = _c("MissionCard_status")     # progress bar
    MISSION_REWARDS   = _c("MissionCard_rewards")    # reward area
    MISSION_REWARD    = _c("MissionReward_base")     # individual reward
    MISSION_REWARD_ICON = _c("MissionReward_currency")
    MISSION_REWARD_AMOUNT = _c("MissionReward_amount")
    MISSION_COMPLETE  = _c("MissionCard_complete")   # completed overlay
    MISSION_COMPLETE_LABEL = _c("MissionCard_completeLabel")
    MISSION_SWIPER    = _c("Swiper_base")            # carousel for multiple groups
    MISSION_SWIPE_DOTS = _c("SwipeButtonsList_base")

    # Boosters widget (bottom left, above missions)
    BOOSTERS_WIDGET   = _c("BoostersWidget_base")
    BOOSTERS_WRAPPER  = _c("BoostersWidget_wrapper")
    BOOSTERS_GROUP    = _c("BoostersWidget_group")
    BOOSTER_ICON      = _c("BoosterIcon_base")
    BOOSTER_ICON_IMG  = _c("BoosterIcon_icon")
    BOOSTERS_LABEL    = _c("BoostersWidget_shortcutLabel")

    # Floating widgets (bottom-right area)
    FLOATING_BUTTONS  = _c("BaseCamp_floatingButtons")
    POST_BATTLE_WIDGET = _c("PostBattleWidget_base")   # "Battle Results" button
    POST_BATTLE_TITLE = _c("PostBattleWidget_title")
    POST_BATTLE_ICON  = _c("PostBattleWidget_icon")
    CONTENT_HUB_WIDGET = _c("ContentHubWidget_base")  # "Boosters" / content hub
    CONTENT_HUB_TITLE  = _c("ContentHubWidget_title")

    # Battle / Play button (bottom-right)
    BATTLE_WIDGET     = _c("BattleWidget_base")
    MODE_SELECTOR     = _c("ModeSelector_base")      # "QUICK MATCH" dropdown
    MODE_SELECTOR_TEXT = _c("ModeSelector_text")
    PLAY_BUTTON       = _c("PlayButton_base")
    PLAY_BUTTON_TEMPLATE = _c("PlayButtonTemplate_base")
    PLAY_BUTTON_LABEL = _c("TextContent_label")      # "PLAY" / "QUICK MATCH" text

    # Notification center
    NOTIFICATION_CENTER = _c("NotificationCenter_base")
    NOTIFICATIONS       = _c("NotificationCenter_notifications")

    # Shortcut legend (bottom bar)
    SHORTCUT_LEGEND   = _c("ShortcutLegend_base")
    SHORTCUT_ITEM     = _c("ShortcutAction_base")    # individual hint (key + label)
    SHORTCUT_KEY_ICON = _c("ShortcutActionPicto_base")
    SHORTCUT_LABEL    = _c("ShortcutAction_label")

    # Side menu (left edge)
    SIDE_MENU         = _c("SideMenu_base")
    SIDE_MENU_CONTENT = _c("SideMenu_menu")
    SIDE_MENU_UNDERLAY = _c("SideMenu_underlay")

    # Common card shell (shared by Battle Pass / Missions cards)
    COMMON_CARD       = _c("CommonCard_base")
    COMMON_CARD_IMAGE = _c("CommonCard_image")
    COMMON_CARD_CONTENT = _c("CommonCard_content")

    # Modify Vehicle / Agent — Loadout page (LoadoutMain route)
    LOADOUT_MAIN          = _c("LoadoutMain_base")          # whole loadout page
    LOADOUT_VIEW_SWITCHER = _c("LoadOutViewSwitcher_base")  # Agent / Vehicle tab row
    HERO_SIGN_VEHICLE     = _c("HeroSign_base")             # vehicle/agent header (name, level, ASSIGNED)

    # Agent sub-page (SelectHeroOutlet route)
    AGENT_OUTLET       = _c("SelectHeroOutlet_base")         # whole agent select page
    AGENT_FRONTMAN     = _c("Frontman_base")                 # agent details panel
    AGENT_BONUSES      = _c("FrontmanBonuses_base")          # ULTIMATE / TRAIT ability icons
    AGENT_FEATURES     = _c("GeneralHeroFeatures_base")      # shared hero features strip
    AGENT_SKILLS_BTN   = _c("FrontmanPerksButton_base")      # AGENT SKILLS panel (points + perk icons)
    AGENT_PERK_SLOTS   = _c("PerkSlots_base")                # perk icon slots
    AGENT_VEHICLES     = _c("VehiclesByFrontman_base")       # vehicle selection cards
    AGENT_LIST         = _c("SelectHero_heroesWrapper")      # role-grouped hero strip (ASSAULT / DEFENDER / MARKSMAN)
    AGENT_LIST_CARD    = _c("FrontmanCard_base")             # individual agent portrait card
    AGENT_LIST_GROUP   = _c("GroupCaption_base")             # role group header (ASSAULT / DEFENDER / ...)

    # Vehicle sub-page
    VEHICLE_FEATURES   = _c("VehicleFeatures_base")         # firing mode + weapon slots container
    VEHICLE_FIRE_MODE  = _c("VehicleFeatures_fireMode")     # SINGLE SHOT indicator
    VEHICLE_WEAPON_SLOT = _c("FeatureItem_base")            # PRIMARY / SECONDARY weapon items
    VEHICLE_STATS      = _c("BasicCharacteristics_base")    # stat bars (Firepower / Toughness etc.)
    VEHICLE_STAT_ITEM  = _c("CharacteristicItem_base")      # individual stat row + bar
    VEHICLE_POWER      = _c("HeroPowerWidget_base")         # PAYLOAD counter widget
    VEHICLE_EQUIPMENT  = _c("ConsumableEntries_base")       # equipment slots (C, M)
    VEHICLE_MODULES    = _c("ModulesGroupsEntries_base")    # modules row
    VEHICLE_MODULE_SLOT = _c("ProgressionGroup_slot")       # individual module / empty slot

    # Shared text / image primitives
    IMAGE             = _c("Image_base")
    SIMPLE_TEXT       = _c("SimpleText_base")
    FORMATTED_TEXT    = _c("Formatted_base")
    TEXT_BUTTON       = _c("TextButton_base")
    STYLED_BUTTON     = _c("StyledButton_base")


__all__ = ["HUD", "HANGAR"]
