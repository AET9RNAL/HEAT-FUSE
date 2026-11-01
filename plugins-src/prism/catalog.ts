/**
 * Prism's map of the game UI: sections -> elements -> states -> CSS targets.
 * Each state is one look an element can take (ally/enemy, ready/cooldown, ...);
 * its targets carry the selector that matches only that look.
 * Selectors and colours come from the live build (docs/COHTML_FRONTEND_MAP.md).
 */

export type Page = "battle_hud" | "markers" | "base_indicators" | "battle_app" | "hangar";
export type Team = "ally" | "enemy" | "squad" | "you" | "contested";
export type Shade = "base" | "dark" | "light";

export interface Target {
  page: Page;
  sel: string;
  /** `{c}` colour, `{c@0.6}` colour at that alpha, `{c:dark}` / `{c:light}` derived shade, `{tint}` raster recolour filter. */
  decl: string;
}

export interface State {
  id: string;
  label: string;
  /** The game's own colour, "#RRGGBB" or "#RRGGBBAA". */
  def: string;
  team?: Team;
  shade?: Shade;
  targets: Target[];
}

export interface PrismEl {
  key: string;
  label: string;
  hint?: string;
  states: State[];
  /** Scale/rotate wrappers; only HUD widgets that own their layout get these. `keep` is the element's own CSS transform. */
  xform?: { page: Page; sel: string; keep?: string }[];
}

export interface Section {
  id: string;
  label: string;
  description: string;
  items: PrismEl[];
}

/** The game's affiliation palette (battle_app `Palette_Affiliation*`, HUD/markers constants). */
export const GAME: Record<Team, Record<Shade, string>> = {
  ally: { base: "#7ABFDF", dark: "#3F6273", light: "#A1DCF7" },
  enemy: { base: "#FF6D46", dark: "#99371C", light: "#FFBCAA" },
  squad: { base: "#78D098", dark: "#4F8C62", light: "#B7EBC9" },
  you: { base: "#FFD85C", dark: "#F2C758", light: "#FEEBAC" },
  contested: { base: "#FFBD4C", dark: "#FFD85C", light: "#FFD85C" },
};

export const TEAM_LABEL: Record<Team, string> = {
  ally: "Ally",
  enemy: "Enemy",
  squad: "Squad",
  you: "You",
  contested: "Contested",
};

const WHITE = "#F8F7F6";
const GREEN = "#84FFB1";
const ORANGE = "#FF8F33";
const YELLOW = "#FFD85C";

// --- selector helpers ------------------------------------------------------

/** The trailing `_` stops `Name_part` from also matching a longer part such as `Name_partWrapper`. */
export const c = (name: string): string => `[class*="${name}_"]`;
/** Inline style contains `decl` - custom properties keep the game's raw string. */
const inl = (decl: string): string => `[style*="${decl}"]`;
/** "#7ABFDF" -> "122, 191, 223", the spacing CoHTML uses when it serialises rgba(). */
const rgbOf = (hex: string): string => {
  const s = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16)).join(", ");
};
const bgIs = (hex: string): string => inl(`background-color: rgba(${rgbOf(hex)}`);
const colorIs = (hex: string): string => inl(`color: rgba(${rgbOf(hex)}`);
const fillIs = (hex: string): string => `[fill="${hex}"]`;
const strokeIs = (hex: string): string => `[stroke="${hex}"]`;

const t = (page: Page, sel: string, decl: string): Target => ({ page, sel, decl });
const COLOR = "color: {c}";
const BG = "background-color: {c}";
const BORDER = "border-color: {c}";
const FILL = "fill: {c}";
const STROKE = "stroke: {c}";
const TINT = "filter: {tint}";

const st = (id: string, label: string, def: string, targets: Target[]): State => ({ id, label, def, targets });

function teamStates(teams: readonly Team[], shade: Shade, targets: (tm: Team) => Target[]): State[] {
  return teams.map((tm) => ({ id: tm, label: TEAM_LABEL[tm], def: GAME[tm][shade], team: tm, shade, targets: targets(tm) }));
}

const MK: Page = "markers";
const HUD: Page = "battle_hud";
const BI: Page = "base_indicators";
const APP: Page = "battle_app";
const HANGAR: Page = "hangar";

const MARKER_TEAMS: readonly Team[] = ["ally", "enemy", "squad", "you"];

// --- Nameplates -------------------------------------------------------------

/** Vehicle markers carry their affiliation only as the inline `--hero-color`. */
const vm = (tm: Team): string => `${c("VehicleMarker_base")}${inl(`--hero-color: ${GAME[tm].base}`)}`;
const TACTIC_FILE: Record<string, string> = { ally: "ally", enemy: "enemy", squad: "platoon", you: "proxy" };

const NAMEPLATES: Section = {
  id: "nameplates",
  label: "Nameplates",
  description: "Markers above every vehicle in the world, for each affiliation.",
  items: [
    {
      key: "np_name",
      label: "Player Name",
      states: teamStates(MARKER_TEAMS, "light", (tm) => [t(MK, `${vm(tm)} ${c("VehicleMarker_userName")}`, COLOR)]),
    },
    {
      key: "np_vehicle",
      label: "Vehicle Name",
      states: teamStates(MARKER_TEAMS, "base", (tm) => [t(MK, `${vm(tm)} ${c("VehicleMarker_heroLabel")}`, COLOR)]),
    },
    {
      key: "np_role",
      label: "Role Icon",
      // The first path is the dark outline; the second one carries the team colour.
      states: teamStates(MARKER_TEAMS, "base", (tm) => [t(MK, `${vm(tm)} ${c("RoleIcon_base")} path + path`, FILL)]),
    },
    {
      key: "np_health",
      label: "Health Bar",
      states: teamStates(MARKER_TEAMS, "base", (tm) => [
        t(MK, `${vm(tm)} ${c("HealthPanel_base")} ${c("ProgressBar_progressBg")}`, BG),
        t(MK, `${vm(tm)} ${c("HealthPanel_base")} ${c("ProgressBar_barContent")}`, "background-color: {c@0.2}"),
      ]),
    },
    {
      key: "np_health_value",
      label: "Health Value",
      states: MARKER_TEAMS.map((tm) => st(tm, TEAM_LABEL[tm], WHITE, [t(MK, `${vm(tm)} ${c("VehicleMarker_healthValue")}`, COLOR)])),
    },
    {
      key: "np_distance",
      label: "Distance",
      states: teamStates(MARKER_TEAMS, "light", (tm) => [t(MK, `${vm(tm)} ${c("VehicleMarker_distance")}`, COLOR)]),
    },
    {
      key: "np_arrow",
      label: "Off-screen Arrow",
      states: teamStates(MARKER_TEAMS, "base", (tm) => [t(MK, `${vm(tm)} ${c("StickDirectionPointer_arrowInner")}`, FILL)]),
    },
    {
      key: "np_extra_health",
      label: "Extra Health",
      states: [st("color", "Extra Health", YELLOW, [t(MK, c("HealthPanel_extraHealth"), "background: {c}")])],
    },
    {
      key: "np_tactical",
      label: "Tactical Map Icon",
      hint: "Raster icon: the colour replaces the icon's own shading.",
      states: teamStates(MARKER_TEAMS, "base", (tm) => [
        t(MK, `${c("TacticVehicleMarker_mark")}${inl(`marker_${TACTIC_FILE[tm]}`)}`, TINT),
        t(MK, `${c("TacticVehicleMarker_direction")}${inl(`direction_${TACTIC_FILE[tm]}`)}`, TINT),
      ]),
    },
    {
      key: "np_kill",
      label: "Kill Notification",
      hint: "Raster icon above a vehicle that was just destroyed.",
      states: [
        { ...st("ally", "Ally Killed", GAME.ally.base, [t(MK, `${c("KillNotification_base")}${inl("ally_kill")}`, TINT)]), team: "ally", shade: "base" },
        { ...st("enemy", "Enemy Killed", GAME.enemy.base, [t(MK, `${c("KillNotification_base")}${inl("enemy_kill")}`, TINT)]), team: "enemy", shade: "base" },
      ],
    },
    {
      key: "np_effects",
      label: "Effect Badges",
      states: [
        st("positive", "Positive", "#6AB886", [t(MK, c("VehicleEffect_base"), "background-color: {c@0.6}")]),
        st("negative", "Negative", "#99371C", [t(MK, c("VehicleEffect_base__negative"), BG)]),
      ],
    },
    {
      key: "np_status_icons",
      label: "Status Effect Icons",
      hint: "Raster icons of the large effect shown above a vehicle.",
      states: (["fire", "radiation", "jammed", "slowed", "immobilize", "vulnerable", "invincibility"] as const).map((fx) =>
        st(fx, fx[0].toUpperCase() + fx.slice(1), "#FFFFFF", [t(MK, `${c("MajorEffect_effectImage")}${inl(`ico_${fx}.png`)}`, TINT)]),
      ),
    },
    {
      key: "np_status_glow",
      label: "Status Effect Glow",
      hint: "The game sends one glow colour per effect; each state is one of those colours.",
      states: [
        ["ff4c1a", "Fire"],
        ["d8d717", "Invincible"],
        ["989898", "Immobilized / Jammed"],
        ["b06333", "Vulnerable"],
        ["f8f7f6", "Slowed"],
        ["b78d24", "Amber Glow"],
        ["aca0a0", "Pale Grey Glow"],
      ].map(([hex, label]) =>
        st(hex, label, `#${hex.toUpperCase()}`, [
          t(MK, `${c("MajorEffect_highlight")}${inl(`--highlight-color: #${hex}`)}`, "background-image: radial-gradient(50% 50% at 50% 50%, {c} 40%, transparent)"),
        ]),
      ),
    },
    {
      key: "np_status_timer",
      label: "Status Effect Timer",
      states: [st("color", "Bar", WHITE, [t(MK, c("MajorEffect_progressInner"), BG)])],
    },
    {
      key: "np_marks",
      label: "Spotted / Vendetta Marks",
      hint: "Raster icons next to the name.",
      states: [
        st("spotted", "Spotted", "#FFFFFF", [t(MK, `${c("ImageMark_base")}${inl("ico_identified")}`, TINT)]),
        st("vendetta", "Vendetta", "#FFFFFF", [t(MK, `${c("ImageMark_base")}${inl("ico_vendetta")}`, TINT)]),
        st("fragile", "Fragile", "#FFFFFF", [t(MK, `${c("ImageMark_base")}${inl("cracks_fragility")}`, TINT)]),
      ],
    },
  ],
};

// --- World markers ---------------------------------------------------------

const zone = (val: string): string => `${c("ZoneMarker_base")}${inl(`--marker-color: ${val}`)}`;
const zoneTargets = (val: string): Target[] => [
  t(MK, `${zone(val)} ${c("ZoneMarker_labelValue")}`, COLOR),
  t(MK, `${zone(val)} ${c("ZoneMarker_icon")}`, BG),
  t(MK, `${zone(val)} ${c("ZoneMarker_frame")}`, BORDER),
  t(MK, `${zone(val)} ${c("ZoneMarker_frame__reduced")}`, "background-color: {c:dark}"),
  t(MK, `${zone(val)} ${c("ZoneMarker_corners")}`, BG),
  t(MK, `${zone(val)} ${c("ZoneMarker_line")}`, BG),
  t(MK, `${zone(val)} ${c("ZoneMarker_mask")}`, "background-image: radial-gradient(50% 50% at 50% 50%, {c} 50%, transparent)"),
  t(MK, `${zone(val)} ${c("StickDirectionPointer_arrowInner")}`, FILL),
];
const aux = (hex: string): string => `${c("AuxiliaryMarker_markIcon")}${bgIs(hex)}`;
const missile = (hex: string): string => `${c("GuidedMissileMarker_base")}${inl(`--indicator-color: ${hex}`)}`;

const WORLD: Section = {
  id: "world",
  label: "World Markers",
  description: "Damage numbers, deployables, pings and lock-on marks in the 3D view.",
  items: [
    {
      key: "wm_damage",
      label: "Damage Numbers",
      states: [
        st("normal", "Normal Hit", WHITE, [
          t(MK, c("FastShootDamage_damageValue"), COLOR),
          t(MK, c("GunDamage_damageValue"), COLOR),
        ]),
        st("critical", "Critical Hit", YELLOW, [
          t(MK, c("FastShootDamage_damageValue__critical"), COLOR),
          t(MK, c("GunDamage_damageValue__critical"), COLOR),
        ]),
        st("shield", "Shield Hit", WHITE, [
          t(MK, c("FastShootDamage_damageValue__shield"), COLOR),
          t(MK, c("GunDamage_damageValue__shield"), COLOR),
        ]),
        st("caption", "Hit Caption", WHITE, [
          t(MK, c("FastShootDamage_damageCaption"), COLOR),
          t(MK, c("GunDamage_damageAction"), COLOR),
        ]),
      ],
    },
    {
      key: "wm_aux_icon",
      label: "Deployables: Icon",
      hint: "Drones, turrets, mines and probes. Wrecks use the neutral state.",
      states: [
        ...teamStates(["ally", "enemy", "you"], "base", (tm) => [t(MK, aux(GAME[tm].base), BG)]),
        st("neutral", "Neutral / Wreck", WHITE, [t(MK, aux(WHITE), BG)]),
      ],
    },
    {
      key: "wm_aux_timer",
      label: "Deployables: Timer",
      // Enemy has no modifier class, so it comes first and the others override it.
      states: [
        { ...st("enemy", "Enemy", GAME.enemy.base, [t(MK, c("AuxiliaryMarker_cooldown"), COLOR)]), team: "enemy", shade: "base" },
        st("ally", "Ally", WHITE, [t(MK, c("AuxiliaryMarker_cooldown__ally"), COLOR)]),
        st("you", "Yours", WHITE, [t(MK, c("AuxiliaryMarker_cooldown__player"), COLOR)]),
      ],
    },
    {
      key: "wm_aim_marks",
      label: "Ability Target Marks",
      states: teamStates(["ally", "enemy", "squad", "you"], "base", (tm) => [
        t(MK, c(`AbilityAimMarker_playerMark__${tm === "squad" ? "platoon" : tm}`), BG),
      ]),
    },
    {
      key: "wm_pings",
      label: "Pings",
      hint: "Danger pings (attack, danger, last known position) use their own state.",
      states: [
        st("danger", "Danger", GAME.enemy.base, zoneTargets(GAME.enemy.base)),
        ...teamStates(["ally", "squad", "you"], "base", (tm) => zoneTargets(GAME[tm].base)),
        st("neutral", "Neutral", WHITE, zoneTargets(WHITE)),
      ],
    },
    {
      key: "wm_ping_votes",
      label: "Ping Votes",
      states: [
        st("color", "Others", WHITE, [t(MK, c("PingVotes_voteIcon"), BG), t(BI, c("PingVotes_voteIcon"), BG)]),
        { ...st("you", "Yours", YELLOW, [t(MK, `${c("PingVotes_voteIcon")}${bgIs(YELLOW)}`, BG), t(BI, `${c("PingVotes_voteIcon")}${bgIs(YELLOW)}`, BG)]), team: "you", shade: "base" },
      ],
    },
    {
      key: "wm_ability_timer",
      label: "Ability Area Timer",
      states: [
        st("color", "Text", "#C5C5C3", [
          t(MK, c("CommonAbilityMarker_remainingTimeValue"), COLOR),
          t(MK, c("CommonMarker_remainingTimeValue"), COLOR),
        ]),
      ],
    },
    {
      key: "wm_tactical_pointer",
      label: "Tactical Map: Your Pointer",
      hint: "Raster icons of your own vehicle on the tactical map.",
      states: [
        { ...st("color", "Pointer", GAME.you.base, [
          t(MK, c("TacticalPlayerPointer_playerMark"), TINT),
          t(MK, c("TacticalPlayerPointer_playerDirection"), TINT),
          t(MK, c("TacticalPlayerPointer_aim"), TINT),
        ]), team: "you", shade: "base" },
      ],
    },
    {
      key: "wm_lock",
      label: "Lock-on Caption",
      states: [
        st("color", "Background", YELLOW, [
          t(MK, c("BasicTargetMark_lockOnCaption"), BG),
          t(MK, c("FocusedTargetMark_lockOnCaption"), BG),
        ]),
      ],
    },
    {
      key: "wm_missile",
      label: "Guided Missile",
      states: [
        { ...st("enemy", "Enemy Missile", GAME.enemy.base, [
          t(MK, `${missile(GAME.enemy.base)} ${c("GuidedMissileMarker_distanceValue")}`, COLOR),
          t(MK, `${missile(GAME.enemy.base)} ${c("GuidedMissileMarker_missileIndicatorInner")}`, FILL),
          t(MK, `${missile(GAME.enemy.base)} ${c("StickDirectionPointer_arrowInner")}`, FILL),
        ]), team: "enemy", shade: "base" },
        st("own", "Own Missile", GREEN, [
          t(MK, `${missile(GREEN)} ${c("GuidedMissileMarker_distanceValue")}`, COLOR),
          t(MK, `${missile(GREEN)} ${c("GuidedMissileMarker_missileIndicatorInner")}`, FILL),
          t(MK, `${missile(GREEN)} ${c("StickDirectionPointer_arrowInner")}`, FILL),
        ]),
      ],
    },
    {
      key: "wm_decoy",
      label: "Decoy Health",
      states: [st("color", "Health", YELLOW, [t(MK, c("DecoyMarker_healthProgress"), BG)])],
    },
    {
      key: "wm_out_of_range",
      label: "Out of Range",
      states: [
        st("color", "Lines & Caption", WHITE, [
          t(MK, c("OutOfRange_line"), "background-color: {c@0.8}"),
          t(MK, c("OutOfRange_caption"), "color: {c@0.8}"),
        ]),
      ],
    },
    {
      key: "wm_resist",
      label: "Resistance Glow",
      states: [
        st("resist", "Resistance", GREEN, [t(MK, c("StatusEffect_resistFactorGlow__resistance"), BG)]),
        st("vulnerable", "Vulnerability", GAME.enemy.base, [t(MK, c("StatusEffect_resistFactorGlow__vulnerability"), BG)]),
      ],
    },
  ],
};

// --- Capture points ----------------------------------------------------------

/** World capture marker: SVG `fill`/`stroke` attributes set per state. */
const cpPath = (attr: string): string => `${c("WorldBaseMarker_wrapperMask")} path${attr}`;
const cpAlert = (hex: string): Target[] => [
  t(BI, `${c("WorldBaseMarker_progressAlertGradient")}${bgIs(hex)}`, BG),
  t(BI, `${c("WorldBaseMarker_progressAlertTopBorder")}${bgIs(hex)}`, BG),
];
const cpCaption = (hex: string): string => `${c("CaptureBaseDefault_subtitle")} ${c("TextElement_content")}${colorIs(hex)}`;
/** HUD hex (compass, minimap, log): inline `--border-color` / `--bg-color`. */
const hexBorder = (val: string): string => `${c("BaseHexElement_base")}${inl(`--border-color: ${val}`)} ${c("BaseHexElement_framePath")}`;
const hexBg = (val: string): string => `${c("BaseHexElement_base")}${inl(`--bg-color: ${val}`)} ${c("BaseHexElement_bg")}`;
const rgbaRaw = (hex: string, a: string): string => `rgba(${rgbOf(hex).replace(/ /g, "")}, ${a})`;
const arrow = (val: string): string => `${c("BaseStatus_baseWrapper")}${inl(`--arrow-color: ${val}`)} ${c("BaseStatus_arrow")}`;
const statusLabel = (val: string): string => `${c("BaseStatusLabel_base")}${inl(`--label-color: ${val}`)} ${c("BaseStatusLabel_status")}`;

const CAPTURE: Section = {
  id: "capture",
  label: "Capture Points",
  description: "Point markers in the world, the hexes on the compass and minimap, and capture captions.",
  items: [
    {
      key: "cp_fill",
      label: "Point Marker: Fill",
      states: [
        st("neutral", "Neutral", "#172026", [t(BI, cpPath(fillIs("#172026")), FILL)]),
        { ...st("ally", "Ally Held", GAME.ally.dark, [t(BI, cpPath(fillIs(GAME.ally.dark)), FILL)]), team: "ally", shade: "dark" },
        { ...st("enemy", "Enemy Held", GAME.enemy.dark, [t(BI, cpPath(fillIs(GAME.enemy.dark)), FILL)]), team: "enemy", shade: "dark" },
      ],
    },
    {
      key: "cp_ring",
      label: "Point Marker: Capture Ring",
      states: teamStates(["ally", "enemy"], "base", (tm) => [
        t(BI, cpPath(strokeIs(GAME[tm].base)), STROKE),
        ...cpAlert(GAME[tm].base),
      ]),
    },
    {
      key: "cp_letter",
      label: "Point Marker: Letter",
      states: [
        st("normal", "Normal", WHITE, [t(BI, c("WorldBaseMarker_label"), COLOR)]),
        st("activating", "Activating", GREEN, [t(BI, c("WorldBaseMarker_label__activating"), COLOR)]),
      ],
    },
    {
      key: "cp_caption",
      label: "Point Marker: Caption",
      hint: "CONTESTED / CAPTURE! / DEFEND! captions, distance and timer.",
      states: [
        { ...st("contested", "Contested", GAME.contested.base, [t(BI, cpCaption(GAME.contested.base), COLOR)]), team: "contested", shade: "base" },
        st("capture", "Capture / Positive", GREEN, [t(BI, cpCaption(GREEN), COLOR)]),
        { ...st("enemy", "Losing / Negative", GAME.enemy.base, [t(BI, cpCaption(GAME.enemy.base), COLOR)]), team: "enemy", shade: "base" },
        st("info", "Distance & Timer", WHITE, [t(BI, cpCaption(WHITE), COLOR)]),
      ],
    },
    {
      key: "cp_arrow",
      label: "Point Marker: Off-screen Arrow",
      states: [st("color", "Arrow", WHITE, [t(BI, `${c("CaptureBaseDefault_arrow")} ${c("StickDirectionPointer_arrowInner")}`, FILL)])],
    },
    {
      key: "cp_notice",
      label: "Point Marker: Notice Icon",
      hint: "Raster icon above a point that needs action.",
      states: [st("color", "Icon", WHITE, [t(BI, c("CaptureBaseDefault_noticeIcon"), TINT)])],
    },
    {
      key: "cp_hex_border",
      label: "Point Hex: Border",
      hint: "Hexes on the objective compass, the minimap and in the event log.",
      states: [
        st("neutral", "Neutral", "#D0CBC4", [t(HUD, hexBorder("#D0CBC4"), STROKE)]),
        ...teamStates(["ally", "enemy"], "base", (tm) => [t(HUD, hexBorder(GAME[tm].base), STROKE)]),
        { ...st("contested", "Contested", YELLOW, [t(HUD, hexBorder(YELLOW), STROKE)]), team: "contested", shade: "dark" },
      ],
    },
    {
      key: "cp_hex_fill",
      label: "Point Hex: Fill",
      states: [
        ...teamStates(["ally", "enemy"], "base", (tm) => [t(HUD, hexBg(rgbaRaw(GAME[tm].base, "0.6")), "background-color: {c@0.6}")]),
        { ...st("contested", "Contested", YELLOW, [t(HUD, hexBg(rgbaRaw(YELLOW, "0.6")), "background-color: {c@0.6}")]), team: "contested", shade: "dark" },
      ],
    },
    {
      key: "cp_compass_arrows",
      label: "Compass: Capture Arrows",
      states: [
        st("neutral", "Neutral", WHITE, [t(HUD, arrow(WHITE), BG)]),
        ...teamStates(["ally", "enemy"], "base", (tm) => [t(HUD, arrow(GAME[tm].base), BG)]),
      ],
    },
    {
      key: "cp_compass_label",
      label: "Compass: Status Text",
      states: [
        st("neutral", "Neutral", "#252525", [t(HUD, statusLabel("#252525"), COLOR)]),
        ...teamStates(["ally", "enemy"], "base", (tm) => [t(HUD, statusLabel(GAME[tm].base), COLOR)]),
        { ...st("contested", "Contested", "#FFBD4C", [t(HUD, statusLabel("#FFBD4C"), COLOR)]), team: "contested", shade: "base" },
      ],
    },
    {
      key: "cp_compass_overtime",
      label: "Compass: Overtime Badge",
      states: [st("color", "Overtime", YELLOW, [t(HUD, `${c("BaseStatusLabel_base")}${inl(`--label-bg-color: ${YELLOW}`)} ${c("BaseStatusLabel_textWrapper")}`, BG)])],
    },
    {
      key: "cp_clearing",
      label: "Compass: Clearing Notice",
      states: [
        st("color", "Background", GAME.enemy.base, [t(HUD, c("BaseStatus_clearingBg"), "background-color: {c}; background-image: radial-gradient(50% 50% at 50% 50%, {c} 50%, transparent)")]),
        st("notice", "Point Notice", GAME.enemy.dark, [t(HUD, c("BaseObject_noticeBackground"), BG)]),
      ],
    },
    {
      key: "cp_log_badge",
      label: "Event Log: Point Badge",
      hint: "The point badge in 'point captured' log lines.",
      states: [
        { ...st("ally_frame", "Ally Frame", GAME.ally.light, [t(HUD, `${c("BaseLabel_chevronFrame")}${bgIs(GAME.ally.light)}`, BG)]), team: "ally", shade: "light" },
        { ...st("ally_fill", "Ally Fill", GAME.ally.dark, [t(HUD, `${c("BaseLabel_chevronUnderlay")}${bgIs(GAME.ally.dark)}`, BG)]), team: "ally", shade: "dark" },
        { ...st("enemy_frame", "Enemy Frame", GAME.enemy.light, [t(HUD, `${c("BaseLabel_chevronFrame")}${bgIs(GAME.enemy.light)}`, BG)]), team: "enemy", shade: "light" },
        { ...st("enemy_fill", "Enemy Fill", GAME.enemy.dark, [t(HUD, `${c("BaseLabel_chevronUnderlay")}${bgIs(GAME.enemy.dark)}`, BG)]), team: "enemy", shade: "dark" },
      ],
    },
  ],
};

// --- Minimap -----------------------------------------------------------------

const detected = (kind: string, tm: Team): string =>
  `${c(`DetectedObject_object__${kind}`)}${c(`DetectedObject_object__${tm === "squad" ? "platoon" : tm}`)}`;

const MINIMAP: Section = {
  id: "minimap",
  label: "Minimap",
  description: "The radar in the top-right corner.",
  items: [
    {
      key: "mm_vehicles",
      label: "Vehicles",
      states: teamStates(["ally", "enemy", "squad"], "base", (tm) => [
        t(HUD, detected("vehicle", tm), "background-color: {c}; box-shadow: 0 0 6rem 0 {c}"),
        t(HUD, `${detected("vehicle", tm)} ${c("DetectedObject_highlight")}`, "background-color: {c:light}"),
      ]),
    },
    {
      key: "mm_air",
      label: "Aircraft & Drones",
      hint: "Raster icons: the colour replaces the icon's own shading.",
      states: teamStates(["ally", "enemy", "squad"], "base", (tm) => [
        t(HUD, detected("air", tm), TINT),
        t(HUD, `${detected("air", tm)} ${c("DetectedObject_highlight")}`, "background-color: {c:light}"),
      ]),
    },
    {
      key: "mm_sectors",
      label: "Spotting Sectors",
      states: [
        { ...st("outer", "Outer Ring", GAME.enemy.base, [t(HUD, c("SpottingSector_sector__outer"), BORDER)]), team: "enemy", shade: "base" },
        { ...st("inner", "Inner Fill", GAME.enemy.dark, [t(HUD, c("SpottingSector_sector__inner"), BORDER)]), team: "enemy", shade: "dark" },
      ],
    },
    {
      key: "mm_cone",
      label: "View Cone",
      states: [st("color", "Cone", WHITE, [t(HUD, c("Radar_coneBase"), "border-color: {c@0.5}; background-color: {c@0.1}")])],
    },
    {
      key: "mm_spotted",
      label: "Spotted Area",
      states: [st("color", "Area", GREEN, [t(HUD, c("Radar_xRayArea__spotted"), "background-color: {c@0.5}")])],
    },
    {
      key: "mm_scan",
      label: "Scan Wave",
      states: [
        st("normal", "Normal", "#D0CBC4", [t(HUD, c("Radar_scanWave"), "background: radial-gradient(50% 50% at 50% 50%, transparent 50%, {c@0.1} 100%)")]),
        st("special", "Special", "#9FFEC2", [t(HUD, c("Radar_scanWave__special"), "background: radial-gradient(50% 50% at 50% 50%, transparent 50%, {c@0.4} 100%)")]),
      ],
    },
    {
      key: "mm_pointer",
      label: "Player Pointer",
      hint: "Raster icon.",
      states: [st("color", "Pointer", WHITE, [t(HUD, c("Radar_pointer"), TINT)])],
    },
    {
      key: "mm_grid",
      label: "Grid",
      hint: "Raster image.",
      states: [st("color", "Grid", WHITE, [t(HUD, c("Radar_staticGrid"), TINT)])],
    },
    {
      key: "mm_turret",
      label: "Turret Indicator",
      hint: "Raster icon.",
      states: [st("color", "Turret", WHITE, [t(HUD, c("Doll_turretImage"), TINT)])],
    },
  ],
};

// --- Score & objectives ------------------------------------------------------

const SCORE: Section = {
  id: "score",
  label: "Score & Objectives",
  description: "The top score bar, round counters and objective banners.",
  items: [
    {
      key: "sc_bar",
      label: "Score Bar",
      hint: "Covers the point bar and the round-based (Control) bar.",
      states: teamStates(["ally", "enemy"], "base", (tm) => [
        t(HUD, `${c(`ScoreProgress_progressWrapper__${tm}`)} ${c("ProgressBar_progressBg")}`, BG),
        t(HUD, c(`ScoreProgress_progressWrapper__${tm}`), "border-color: {c@0.6}"),
        t(HUD, c(`SegmentedScoreProgress_progressWrapper__${tm}`), "border-color: {c@0.6}"),
        t(HUD, `${c("ScoreProgress_scoreWrapper")}${inl(`border-top-color: rgba(${rgbOf(GAME[tm].base)}`)}`, "border-color: {c@0.6}"),
        t(HUD, `${c("SegmentedScoreProgress_scoreWrapper")}${inl(`border-top-color: rgba(${rgbOf(GAME[tm].base)}`)}`, "border-color: {c@0.6}"),
        t(HUD, `${c("ScoreProgress_scoreValue")}${colorIs(GAME[tm].base)}`, COLOR),
        t(HUD, `${c("SegmentedScoreProgress_scoreValue")}${colorIs(GAME[tm].base)}`, COLOR),
        t(HUD, `${c("ScoreProgress_fastPoints__active")}${inl(`--fast-points-color: ${GAME[tm].base}`)}`,
          "background-image: linear-gradient(to right, transparent, transparent 10%, {c} 50%, {c} 60%, transparent 60%, transparent)"),
      ]),
    },
    {
      key: "sc_rounds",
      label: "Round Pips",
      hint: "Control and other round-based modes.",
      states: teamStates(["ally", "enemy"], "base", (tm) => [
        t(HUD, `${c("SegmentedProgressBar_item")}${bgIs(GAME[tm].base)}`, BG),
        t(HUD, `${c("SegmentedProgressBar_itemBg")}${bgIs(GAME[tm].base)}`, "background-color: {c@0.2}"),
        t(HUD, `${c("ProgressCounter_teamMarker")}${tm === "enemy" ? c("ProgressCounter_teamMarker__enemy") : ""}`, BG),
      ]),
    },
    {
      key: "sc_wins",
      label: "Win / Loss Count",
      states: [
        st("victory", "Victories", YELLOW, [t(HUD, c("WinCount_victoryCount"), COLOR)]),
        { ...st("defeat", "Defeats", GAME.enemy.base, [t(HUD, c("WinCount_defeatCount"), COLOR)]), team: "enemy", shade: "base" },
      ],
    },
    {
      key: "sc_status",
      label: "Match Status Text",
      states: [
        st("normal", "Normal", WHITE, [t(HUD, `${c("GameStatusLabel_base")}${colorIs(WHITE)}`, COLOR)]),
        { ...st("losing", "Losing", GAME.enemy.base, [t(HUD, `${c("GameStatusLabel_base")}${colorIs(GAME.enemy.base)}`, COLOR)]), team: "enemy", shade: "base" },
      ],
    },
    {
      key: "sc_timer",
      label: "Match Timer",
      states: [st("color", "Timer", WHITE, [t(HUD, `${c("BattleTimer_base")} ${c("TextElement_content")}`, COLOR)])],
      xform: [{ page: HUD, sel: c("BattleTimer_base") }],
    },
    {
      key: "sc_objective",
      label: "Objective Banner",
      states: [
        st("timer", "Timer", GREEN, [t(HUD, c("GameObjective_timer"), BG)]),
        st("critical", "Timer: Critical", GAME.enemy.base, [
          t(HUD, c("GameObjective_timer__critical"), BG),
          t(HUD, c("GameObjective_timer__supercritical"), BG),
        ]),
        st("title", "Title", WHITE, [t(HUD, c("GameObjective_eventTitle"), COLOR)]),
        st("title_critical", "Title: Critical", GAME.enemy.base, [
          t(HUD, c("GameObjective_eventTitle__critical"), COLOR),
          t(HUD, c("GameObjective_eventTitle__supercritical"), COLOR),
        ]),
        st("border", "Header Border", GREEN, [t(HUD, c("GameObjective_outsideBorder__header"), "background-color: {c@0.6}")]),
      ],
    },
    {
      key: "sc_hq",
      label: "HQ Notice",
      states: teamStates(["ally", "enemy"], "base", (tm) => [t(HUD, c(`HQModeScore_notice__${tm}`), "background: {c@0.6}")]),
    },
    {
      key: "sc_event_result",
      label: "Event Result Banner",
      hint: "Mode events and game messages: success or alert.",
      states: [
        st("success", "Success", GREEN, [
          t(HUD, c("EventResutls_base"), "background: {c}"),
          t(HUD, c("GameMessage_base"), "background: {c}"),
          t(HUD, c("EventResutls_messageLabel"), COLOR),
          t(HUD, c("GameMessage_messageLabel"), COLOR),
        ]),
        st("alert", "Alert / Failed", GAME.enemy.base, [
          t(HUD, c("EventResutls_base__alert"), "background: {c}"),
          t(HUD, c("GameMessage_base__alert"), "background: {c}"),
          t(HUD, c("EventResutls_messageLabel__failed"), COLOR),
          t(HUD, c("GameMessage_messageLabel__negative"), COLOR),
        ]),
      ],
    },
    {
      key: "sc_competition",
      label: "Competition Event",
      states: [
        st("highlight", "Highlight", WHITE, [t(HUD, c("CompetitionEvent_highlight"), "background: {c@0.4}")]),
        { ...st("enemy", "Enemy Highlight", GAME.enemy.base, [t(HUD, c("CompetitionEvent_highlight__enemy"), "background: {c@0.4}")]), team: "enemy", shade: "base" },
        st("header", "Header Border", GREEN, [t(HUD, c("CompetitionEvent_outsideBorder__header"), "background-color: {c@0.6}")]),
        st("critical", "Critical Border", GAME.enemy.base, [t(HUD, c("CompetitionEvent_outsideBorder__critical"), "background-color: {c@0.6}")]),
      ],
    },
    {
      key: "sc_respawns",
      label: "Respawns Left",
      states: [
        st("icon", "Tank Icon", "#FFFFFF", [t(HUD, c("RespawnsLeft_tankIcon"), TINT)]),
        st("separator", "Separator", WHITE, [t(HUD, c("RespawnsLeft_separator"), BG)]),
      ],
    },
  ],
};

// --- Kill feed & events ------------------------------------------------------

const feedName = (hex: string): Target[] => [
  t(HUD, `${c("LogItemKill_player")}${colorIs(hex)}`, COLOR),
  t(HUD, `${c("LogItemKill_player")} ${c("TextElement_content")}${colorIs(hex)}`, COLOR),
];
const note = (val: string): string => `${c("TextNotification_base")}${inl(`--variant-color: ${val}`)}`;
const noteTargets = (val: string): Target[] =>
  [BI, MK].flatMap((page) => [
    t(page, `${note(val)} ${c("TextNotification_captionWrapper")}`, BG),
    t(page, `${note(val)} ${c("TextNotification_bigNumber")}`, BG),
    t(page, `${note(val)} ${c("TextNotification_bigText")}`, BG),
    t(page, `${note(val)} ${c("TextNotification_descriptionWrapper")}`, BG),
    t(page, `${note(val)} ${c("TextNotification_highlightCaptionBg")}`, BG),
    t(page, `${note(val)} ${c("TextNotification_highlightDescriptionBg")}`, BG),
  ]);

const FEED: Section = {
  id: "feed",
  label: "Kill Feed & Events",
  description: "Kill feed, XP log, kill confirmations and banner notifications.",
  items: [
    {
      key: "kf_names",
      label: "Kill Feed: Names",
      states: teamStates(["ally", "enemy", "squad", "you"], "light", (tm) => feedName(GAME[tm].light)),
    },
    {
      key: "kf_icon",
      label: "Kill Feed: Icon",
      hint: "Raster icons.",
      states: [
        st("kill", "Kill", WHITE, [t(HUD, `${c("LogItemKill_deathIcon")}${inl("ico_kill")}`, TINT)]),
        st("death", "Death", WHITE, [t(HUD, `${c("LogItemKill_deathIcon")}${inl("ico_death")}`, TINT)]),
      ],
    },
    {
      key: "kf_victim",
      label: "Kill Banner: Victim",
      states: [
        { ...st("name", "Name", GAME.enemy.base, [t(HUD, c("LogKill_victimName"), COLOR)]), team: "enemy", shade: "base" },
        st("highlight", "Highlight Background", GAME.enemy.base, [t(HUD, c("LogKill_victimNameWrapper__highlighted"), BG)]),
        st("highlight_name", "Highlighted Name", "#FFFFFF", [t(HUD, c("LogKill_victimName__highlighted"), COLOR)]),
      ],
    },
    {
      key: "xp_value",
      label: "XP Log: Points",
      states: [
        st("normal", "Normal", "#FFFFFF", [t(HUD, c("LogXP_xpValue"), COLOR)]),
        st("special", "Special", YELLOW, [t(HUD, c("LogXP_xpValue__specialColor"), COLOR)]),
        st("mega", "Mega", YELLOW, [t(HUD, c("LogXP_xpValue__megaColor"), COLOR)]),
      ],
    },
    {
      key: "xp_actions",
      label: "XP Log: Actions",
      states: [
        st("simple", "Regular", WHITE, [
          t(HUD, c("LogSimple_message"), COLOR),
          t(HUD, c("LogSimple_multiplier"), COLOR),
          t(HUD, c("LogKill_message"), COLOR),
        ]),
        st("special", "Special", YELLOW, [
          t(HUD, c("LogSpecial_label"), COLOR),
          t(HUD, c("LogSpecial_multiplier"), COLOR),
        ]),
        st("mega", "Mega", YELLOW, [
          t(HUD, c("LogMega_label"), COLOR),
          t(HUD, c("LogMega_multiplier"), COLOR),
        ]),
      ],
    },
    {
      key: "kf_pings",
      label: "Event Log: Ping Icons",
      hint: "Ping and command icons in the event log, by sender.",
      states: teamStates(["you", "ally", "squad"], "light", (tm) => [t(HUD, `${c("LogImageLabel_image")}${bgIs(GAME[tm].light)}`, BG)]),
    },
    {
      key: "ev_comm",
      label: "Command Wheel",
      states: [
        st("border", "Sector Border", WHITE, [t(HUD, c("CommCommand_border"), BG)]),
        st("caption", "Active Caption", WHITE, [t(HUD, c("CommCommand_caption__active"), COLOR)]),
      ],
    },
    {
      key: "ev_air",
      label: "Air Strike Warning",
      states: [
        st("line", "Line", ORANGE, [t(HUD, c("AirDanger_line"), BG)]),
        st("stripes", "Stripes", "#F2C758", [t(HUD, c("AirDanger_stripes"), "background: linear-gradient(to top, {c@0.2}, {c@0.2} 22rem, transparent, transparent 11rem)")]),
        st("icon", "Icon", "#FFFFFF", [t(HUD, c("AirDanger_icon"), TINT)]),
      ],
    },
    {
      key: "ev_missions",
      label: "Mission Tracker",
      states: [
        st("progress", "Progress", YELLOW, [
          t(HUD, c("MissionProgress_currentProgress"), BG),
          t(HUD, `${c("MissionProgress_base")}${inl(`border-top-color: rgba(${rgbOf(YELLOW)}`)}`, BORDER),
        ]),
        st("completed", "Completed Line", GREEN, [t(HUD, c("NotificationItem_statusLine__completed"), BG)]),
        st("goal", "Goal Highlight", "#FFFFFF", [t(HUD, c("MissionGoalLabel_highlightedText"), COLOR)]),
      ],
    },
    {
      key: "ev_skull",
      label: "Kill Skull",
      hint: "Raster icon at the crosshair after a kill.",
      states: [st("color", "Skull", WHITE, [t(HUD, c("SkullKill_skullKill"), TINT)])],
    },
    {
      key: "ev_notice",
      label: "Banner Notifications",
      hint: "Skill activations and mode notices.",
      states: [
        st("positive", "Positive", GREEN, noteTargets(GREEN)),
        st("neutral", "Neutral", WHITE, noteTargets(WHITE)),
        st("accent", "Accent", YELLOW, noteTargets(YELLOW)),
        { ...st("negative", "Negative", GAME.enemy.base, noteTargets(GAME.enemy.base)), team: "enemy", shade: "base" },
      ],
    },
    {
      key: "ev_medal",
      label: "Medal Banner",
      states: [st("color", "Highlight", WHITE, [t(BI, c("MedalNotification_highlightCaptionBg"), BG), t(MK, c("MedalNotification_highlightCaptionBg"), BG)])],
    },
    {
      key: "ev_death_card",
      label: "Death Card",
      states: [
        { ...st("killer", "Killer Card", GAME.enemy.base, [
          t(HUD, c("PlayerCard_header"), BG),
          t(HUD, c("PlayerCard_roleIcon"), BG),
          t(HUD, c("PlayerCard_affiliationLabel"), COLOR),
          t(HUD, c("PlayerCard_separator"), COLOR),
        ]), team: "enemy", shade: "base" },
        st("caption", "Killed By Caption", GAME.enemy.base, [t(HUD, c("DeathCard_killedByCaption"), COLOR)]),
        st("label", "Killer Label", GAME.enemy.dark, [t(HUD, c("DeathCard_killerLabel"), BG)]),
      ],
    },
  ],
};

// --- Gunnery -----------------------------------------------------------------

const reloadStroke = (val: string): string => `${c("DefaultAim_base")}${inl(`--reload-stroke-color: ${val}`)}`;

const GUNNERY: Section = {
  id: "gunnery",
  label: "Gunnery",
  description: "Crosshair, hit markers, loaders and weapon-specific aims.",
  items: [
    {
      key: "aim",
      label: "Aim Circle",
      states: [
        st("color", "Circle", WHITE, [t(HUD, c("DefaultAim_staticCircle"), BORDER)]),
        st("dimmed", "Circle: Dimmed", WHITE, [
          t(HUD, `${c("DefaultAim_base")}${inl("--static-stroke-color: rgba(248,247,246, 0.5)")} ${c("DefaultAim_staticCircle")}`, "border-color: {c@0.5}"),
        ]),
      ],
      xform: [{ page: HUD, sel: c("AimSwitcher_base") }],
    },
    {
      key: "aim_reload",
      label: "Aim Reload Arc",
      states: [
        st("loading", "Reloading", "#FFFFFF", [
          t(HUD, `${reloadStroke("#FFFFFF")} ${c("DefaultAim_reloadingCircle")}`, BORDER),
          t(HUD, `${reloadStroke("#FFFFFF")} ${c("DefaultAim_highlightShadow")}`, BG),
        ]),
        st("ready", "Ready", GREEN, [
          t(HUD, `${reloadStroke(GREEN)} ${c("DefaultAim_reloadingCircle")}`, BORDER),
          t(HUD, `${reloadStroke(GREEN)} ${c("DefaultAim_highlightShadow")}`, BG),
        ]),
      ],
    },
    {
      key: "mark",
      label: "Center Mark",
      states: [st("color", "Mark", WHITE, [t(HUD, c("CrosshairAim_centeredMark"), BG)])],
      xform: [{ page: HUD, sel: c("CrosshairAim_centeredMark") }],
    },
    {
      key: "reticle",
      label: "Reticle",
      hint: "Raster image: the colour replaces its own shading.",
      states: [st("color", "Reticle", "#FFFFFF", [t(HUD, c("DefaultReticle_base"), TINT)])],
      xform: [{ page: HUD, sel: c("DefaultReticle_base") }],
    },
    {
      key: "front_sight",
      label: "Front Sight",
      hint: "Raster cursor.",
      states: [st("color", "Cursor", "#FFFFFF", [t(HUD, c("FrontSight_defaultSight"), TINT)])],
    },
    {
      key: "hit_cross",
      label: "Hit Marker",
      hint: "Raster icons per hit tier.",
      states: [
        st("casual", "Normal Hit", "#FFFFFF", [t(HUD, c("TargetHitCross_lineIcon__casual"), TINT)]),
        st("critical", "Critical", "#FFFFFF", [t(HUD, c("TargetHitCross_lineIcon__criticalBase"), TINT)]),
        st("super", "Super Critical", "#FFFFFF", [t(HUD, c("TargetHitCross_lineIcon__criticalSuper"), TINT)]),
        st("mega", "Mega Critical", "#FFFFFF", [t(HUD, c("TargetHitCross_lineIcon__criticalMega"), TINT)]),
      ],
    },
    {
      key: "hit_glow",
      label: "Critical Hit Glow",
      hint: "Raster glows and stripes per hit tier.",
      states: [
        st("critical", "Critical", "#FFFFFF", [
          t(HUD, c("TargetHitIndicator_criticalGlow__base"), TINT),
          t(HUD, c("TargetHitIndicator_criticalStripe__base"), TINT),
        ]),
        st("super", "Super Critical", "#FFFFFF", [
          t(HUD, c("TargetHitIndicator_criticalGlow__super"), TINT),
          t(HUD, c("TargetHitIndicator_criticalStripe__super"), TINT),
        ]),
        st("mega", "Mega Critical", "#FFFFFF", [
          t(HUD, c("TargetHitIndicator_criticalGlow__megaLeft"), TINT),
          t(HUD, c("TargetHitIndicator_criticalGlow__megaRight"), TINT),
          t(HUD, c("TargetHitIndicator_megaEffectIcon"), TINT),
        ]),
      ],
    },
    {
      key: "hit_points",
      label: "Hit Dots",
      states: [st("color", "Dots", GREEN, [t(HUD, c("HitPoint_dot"), BG)])],
    },
    {
      key: "kill_lines",
      label: "Kill Lines",
      hint: "Raster lines around the crosshair after a kill.",
      states: [st("color", "Lines", "#FFFFFF", [t(HUD, c("IndicatorLines_killLine"), TINT)])],
    },
    {
      key: "distance",
      label: "Target Distance",
      // The game shades the warning in steps, so "Warning" is the generic rule and "In Range" overrides it.
      states: [
        st("warning", "Warning", ORANGE, [t(HUD, `${c("TargetDistance_distance")}`, COLOR)]),
        st("normal", "In Range", "#FFFFFF", [t(HUD, `${c("TargetDistance_distance")}${colorIs("#FFFFFF")}`, COLOR)]),
      ],
    },
    {
      key: "zoom",
      label: "Zoom Indicator",
      states: [
        st("value", "Value", WHITE, [t(HUD, c("ZoomIndicator_value"), COLOR)]),
        st("active", "Active Frame", WHITE, [t(HUD, c("ZoomIndicator_valueWrapper__active"), BORDER)]),
      ],
    },
    {
      key: "shell",
      label: "Shell Type",
      states: [
        st("color", "Caption", WHITE, [t(HUD, c("AmmoCaption_base"), COLOR), t(HUD, c("DefaultLoader_caption"), COLOR)]),
        st("secondary", "Secondary Weapon", GREEN, [t(HUD, c("AmmoCaption_base__secondary"), COLOR)]),
        st("paused", "Paused", GAME.enemy.base, [t(HUD, c("AmmoCaption_base__paused"), COLOR)]),
      ],
      xform: [{ page: HUD, sel: c("AmmoLoader_base") }],
    },
    {
      key: "reload",
      label: "Reload Ring",
      states: [
        st("color", "Progress", ORANGE, [
          t(HUD, c("DefaultLoader_progress"), BORDER),
          t(HUD, c("HeLoader_progress"), BORDER),
          t(HUD, c("GuidedMissileLoader_progress"), BORDER),
          t(HUD, c("LoaderSwitchingHint_progress"), "background: {c}"),
          t(HUD, c("LoaderSwitchingHint_cap"), "background: {c}"),
        ]),
        st("track", "Track", "#12191D", [
          t(HUD, c("DefaultLoader_background"), "border-color: {c@0.6}"),
          t(HUD, c("HeLoader_background"), "border-color: {c@0.6}"),
          t(HUD, c("GuidedMissileLoader_background"), "border-color: {c@0.6}"),
        ]),
      ],
      xform: [{ page: HUD, sel: c("DefaultLoader_reloader") }],
    },
    {
      key: "reload_label",
      label: "Reload Time",
      hint: "After a successful fast reload the timer shows as a green badge instead of plain text.",
      states: [
        st("color", "Timer", "#FFFFFF", [t(HUD, c("ReloadTimer_defaultTimer"), COLOR)]),
        st("improved", "After Fast Reload: Badge", GREEN, [
          t(HUD, c("ReloadTimer_improvedTimer"), BG),
          t(HUD, c("ReloadTimer_timerPulseBg"), "background-color: {c@0.2}"),
        ]),
        st("improved_text", "After Fast Reload: Text", "#356647", [
          t(HUD, c("ReloadTimer_timer"), COLOR),
          t(HUD, c("ReloadTimer_timerArrowIcon"), TINT),
        ]),
      ],
      xform: [{ page: HUD, sel: c("ReloadTimer_base") }],
    },
    {
      key: "reload_mini",
      label: "Reload Minigame",
      // The hit zones carry an inline colour: light green while hittable, grey before that.
      states: [
        st("color", "Hit Zones: Ready", "#9FFEC2", [
          t(HUD, `${c("ReloadHitArea_perfectHitArea")}${bgIs("#9FFEC2")}`, BG),
          t(HUD, `${c("ReloadHitArea_secondaryHitArea")}${bgIs("#9FFEC2")}`, BG),
          t(HUD, c("ActiveReloadV1_hitArea"), BORDER),
        ]),
        st("waiting", "Hit Zones: Waiting", "#D0CBC4", [
          t(HUD, `${c("ReloadHitArea_perfectHitArea")}${bgIs("#D0CBC4")}`, BG),
          t(HUD, `${c("ReloadHitArea_secondaryHitArea")}${bgIs("#D0CBC4")}`, BG),
        ]),
        st("glow", "Hit Glow", GREEN, [
          t(HUD, c("ReloadHitArea_perfectHighlight"), "background: linear-gradient(270deg, transparent, {c} 51%, transparent 100%)"),
          t(HUD, c("ReloadHitArea_secondaryHighlight"), "background: linear-gradient(270deg, {c} 0, transparent 100%)"),
        ]),
        st("failed", "Failed", GAME.enemy.base, [
          t(HUD, c("ReloadHitArea_hitLine__failed"), "background-color: {c:dark}"),
          t(HUD, c("ActiveReloadV1_hitArea__fail"), BORDER),
        ]),
        st("indicator", "Indicator", "#FFFFFF", [t(HUD, c("ReloadHitArea_hitIndicator"), BG)]),
        st("missed", "Indicator: Missed", GAME.enemy.light, [t(HUD, c("ReloadHitArea_hitIndicator__missed"), BG)]),
      ],
      // The hit bar only: the badge above it has its own scale.
      xform: [{ page: HUD, sel: c("ActiveReloadV2_hitArea") }],
    },
    {
      key: "reload_badge",
      label: "Reload Minigame: Badge",
      hint: "The time badge above the minigame: green when it speeds the reload up, red when it slows it down.",
      states: [
        st("bg", "Background", GREEN, [t(HUD, c("ActiveReloadTimer_base"), BG)]),
        st("bg_slower", "Background: Slower", GAME.enemy.base, [t(HUD, c("ActiveReloadTimer_base__negative"), BG)]),
        st("text", "Text & Arrow", "#356647", [t(HUD, c("ActiveReloadTimer_value"), COLOR), t(HUD, c("ActiveReloadTimer_arrow"), BG)]),
        st("text_slower", "Text & Arrow: Slower", GAME.enemy.dark, [
          t(HUD, c("ActiveReloadTimer_value__negative"), COLOR),
          t(HUD, c("ActiveReloadTimer_arrow__negative"), BG),
        ]),
      ],
      xform: [{ page: HUD, sel: c("ActiveReloadV2_reloadTimer"), keep: "translate(-50%, -50%)" }],
    },
    {
      key: "ammo_sectors",
      label: "Ammo Sectors",
      hint: "Clip segments around the reticle.",
      states: [
        st("loaded", "Loaded", WHITE, [t(HUD, `${c("AmmoSector_base")} ${inl(`border-top-color: rgba(${rgbOf(WHITE)}`)}`, BORDER)]),
        st("loading", "Reloading", ORANGE, [t(HUD, `${c("AmmoSector_base")} ${inl(`border-top-color: rgba(${rgbOf(ORANGE)}`)}`, BORDER)]),
        st("boosted", "Boosted", GREEN, [t(HUD, `${c("AmmoSector_base")} ${inl(`border-top-color: rgba(${rgbOf(GREEN)}`)}`, BORDER)]),
        st("empty", "Empty", "#12191D", [t(HUD, `${c("AmmoSector_base")} ${inl("border-top-color: rgba(18, 25, 29")}`, "border-color: {c@0.3}")]),
        st("paused", "Paused Glow", GAME.enemy.base, [t(HUD, c("AmmoSector_sector__paused"), "box-shadow: 0 0 20rem {c}")]),
        st("pause_badge", "Reload Paused Badge", GAME.enemy.base, [t(HUD, c("ReloadingPause_base"), BG)]),
      ],
    },
    {
      key: "mg_loader",
      label: "Machine Gun Loader",
      states: [
        st("ready", "Ready", GREEN, [t(HUD, `${c("MachineGunLoader_progressSector")}${inl(`border-top-color: rgba(${rgbOf(GREEN)}`)}`, BORDER)]),
        st("loading", "Reloading", ORANGE, [t(HUD, `${c("MachineGunLoader_progressSector")}${inl(`border-top-color: rgba(${rgbOf(ORANGE)}`)}`, BORDER)]),
      ],
    },
    {
      key: "sights",
      label: "Missile & Tracker Sights",
      states: [
        st("color", "Lines", WHITE, [
          t(HUD, c("GuidedMissileReticle_line"), BG),
          t(HUD, c("TargetTrackerSight_crossbar"), BG),
          t(HUD, c("TargetTrackerSight_stem"), BG),
          t(HUD, c("TargetTrackerSight_leftStroke"), BG),
          t(HUD, c("TargetTrackerSight_rightStroke"), BG),
          t(HUD, c("TargetTrackerSight_crossingPoint"), BG),
        ]),
      ],
    },
    {
      key: "burst_loader",
      label: "Secondary Loader",
      hint: "Segmented ring of a secondary weapon.",
      states: [
        st("loaded", "Loaded", GREEN, [t(HUD, `${c("BurstLoader_sectorsWrapper")} path[stroke="${GREEN}"]`, STROKE)]),
        st("loading", "Reloading", ORANGE, [t(HUD, `${c("BurstLoader_sectorsWrapper")} path[stroke="${ORANGE}"]`, STROKE)]),
      ],
    },
    {
      key: "overheat",
      label: "Overheat",
      states: [
        st("normal", "Heating", WHITE, [t(HUD, c("OverheatIndicator_progress"), BORDER), t(HUD, c("OverheatIndicator_progressCap"), BORDER)]),
        st("awaiting", "Cooling", ORANGE, [
          t(HUD, c("OverheatIndicator_progress__awaiting"), BORDER),
          t(HUD, c("OverheatIndicator_progressCap__awaiting"), BORDER),
          t(HUD, c("Bat4mOverheatIndicator_progress__awaiting"), "background: {c}"),
        ]),
        st("overheated", "Overheated", GAME.enemy.base, [
          t(HUD, c("OverheatIndicator_progress__overheated"), BORDER),
          t(HUD, c("OverheatIndicator_progressCap__overheated"), BORDER),
          t(HUD, c("OverheatIndicator_measureUnit__overheated"), COLOR),
          t(HUD, c("OverheatIndicator_measureUnitArrow__overheated"), FILL),
          t(HUD, c("Bat4mOverheatIndicator_progress__overheated"), "background: {c}"),
        ]),
      ],
    },
    {
      key: "railgun",
      label: "Railgun Charge",
      states: [
        st("low", "Low", WHITE, [
          t(HUD, c("RailGunAim_progressPath__low"), BG),
          t(HUD, c("RailGunAim_progressPath__lowReady"), BG),
          t(HUD, c("RailGunAim_chargeLevel1__lowReady"), BG),
        ]),
        st("normal", "Charged", "#FFDF78", [
          t(HUD, c("RailGunAim_progressPath__normal"), BG),
          t(HUD, c("RailGunAim_progressPath__normalReady"), BG),
          t(HUD, c("RailGunAim_chargeLevel1__normalReady"), BG),
          t(HUD, c("RailGunAim_chargeLevel2__normalReady"), BG),
          t(HUD, c("RailGunAim_chargeLevel1__high"), BG),
          t(HUD, c("RailGunAim_chargeLevel2__high"), BG),
          t(HUD, c("FrontSight_railGunBack__normal"), BG),
        ]),
        st("over", "Overcharged / Paused", GAME.enemy.base, [
          t(HUD, c("RailGunAim_progressPath__high"), BG),
          t(HUD, c("RailGunAim_progressPath__overcharged"), BG),
          t(HUD, c("RailGunAim_progressPath__paused"), BG),
          t(HUD, c("RailGunAim_chargeLevel1__overcharged"), BG),
          t(HUD, c("RailGunAim_chargeLevel2__overcharged"), BG),
          t(HUD, c("RailGunAim_chargeLevel3__overcharged"), BG),
          t(HUD, c("RailGunAim_chargeLevel1__paused"), BG),
          t(HUD, c("RailGunAim_chargeLevel2__paused"), BG),
          t(HUD, c("RailGunAim_chargeLevel3__paused"), BG),
          t(HUD, c("RailGunAim_overchargeLabelText"), COLOR),
          t(HUD, c("FrontSight_railGunBack__overcharged"), BG),
        ]),
      ],
    },
    {
      key: "burst",
      label: "Burst Shots",
      states: [
        st("filled", "Loaded", WHITE, [t(HUD, c("ShotsIndicator_filledItem"), BG)]),
        st("cooldown", "Cooldown", GAME.enemy.base, [
          t(HUD, c("ShotsIndicator_cooldownProcess"), "background: {c}"),
          t(HUD, c("ShotsIndicator_shotsLabel"), COLOR),
        ]),
      ],
    },
    {
      key: "gun_aims",
      label: "Auto-cannon Aims",
      hint: "Gatling, mechanic machine gun and tracker aims.",
      states: [
        st("normal", "Normal", WHITE, [
          t(HUD, c("GatlingGunAim_aim"), BORDER),
          t(HUD, c("GatlingGunWithOverheatAim_aim"), BORDER),
          t(HUD, c("MechanicMachineGunAim_aim"), BORDER),
          t(HUD, c("TargetTrackerGunAim_captureCorner"), BORDER),
        ]),
        st("out_of_range", "Out of Range", GAME.enemy.light, [t(HUD, c("MechanicMachineGunAim_aim__outOfRange"), BORDER)]),
        st("paused", "Paused", GAME.enemy.base, [
          t(HUD, c("GatlingGunAim_aim__paused"), BORDER),
          t(HUD, c("GatlingGunWithOverheatAim_aim__paused"), BORDER),
          t(HUD, c("MechanicMachineGunAim_aim__paused"), BORDER),
          t(HUD, c("TargetTrackerGunAim_captureCorner__paused"), BORDER),
        ]),
      ],
    },
  ],
};

// --- Player panel ------------------------------------------------------------

/** Bar end caps paint a 2rem gradient in the bar colour; each end points its own way. */
const barCaps = (bar: string, hex: string): Target[] => [
  t(HUD, `${bar} ${c("ProgressBar_cap__start")} ${c("BarCap_base")}${inl(`rgba(${rgbOf(hex)}`)}`, "background-image: linear-gradient(to right, {c} 2rem, transparent 2rem, transparent)"),
  t(HUD, `${bar} ${c("ProgressBar_cap__end")} ${c("BarCap_base")}${inl(`rgba(${rgbOf(hex)}`)}`, "background-image: linear-gradient(to left, {c} 2rem, transparent 2rem, transparent)"),
];
const abilityBorder = (val: string): string => `${c("Ability_base")}${inl(`--base-border-color: ${val}`)} ${c("Ability_abilityBorder")}`;
const abilityStates = (id: string, label: string, hex: string): State =>
  st(id, label, hex, [
    t(HUD, abilityBorder(hex), BORDER),
    t(HUD, abilityBorder(rgbaRaw(hex, "0.4")), "border-color: {c@0.4}"),
  ]);

const PLAYER: Section = {
  id: "player",
  label: "Player Panel",
  description: "Your health, energy, abilities, equipment and speed.",
  items: [
    {
      key: "hp_bar",
      label: "HP Bar",
      states: [
        // One fill element: the game adds a blinking class while healing or low, and turns it red at 0 HP.
        // Each later state is at least as specific, so it wins over the ones before it.
        st("color", "Normal", GREEN, [
          t(HUD, `${c("HpBar_base")} ${c("ProgressBar_progressBg")}`, BG),
          ...barCaps(c("HpBar_base"), GREEN),
        ]),
        st("regen", "Healing (blinking)", GREEN, [t(HUD, `${c("HpBar_base")} ${c("HpBar_healProgress")}`, BG)]),
        st("critical", "Low HP (blinking)", GREEN, [t(HUD, `${c("HpBar_base")} ${c("HpBar_criticalProgress")}`, BG)]),
        st("zero", "Destroyed (0 HP)", GAME.enemy.base, [t(HUD, `${c("HpBar_base")} ${c("ProgressBar_progressBg")}${bgIs(GAME.enemy.base)}`, BG)]),
        st("extra", "Extra Health", YELLOW, [t(HUD, c("HpBar_extraHealth"), "background: {c}")]),
        st("damage", "Damage Taken", GAME.enemy.base, [t(HUD, c("HpBar_damageDelta"), BG), t(HUD, c("HpBar_deltaInner"), BG)]),
        st("healing", "Incoming Heal", WHITE, [t(HUD, c("HpBar_healingDelta"), BG), t(HUD, c("HpBar_increasingValue"), BG)]),
        st("track", "Track", "#12191D", [t(HUD, `${c("HpBar_base")} ${c("ProgressBar_barContent")}`, "background-color: {c@0.5}")]),
      ],
      xform: [{ page: HUD, sel: c("HpBar_base") }],
    },
    {
      key: "hp_label",
      label: "HP Value",
      states: [
        st("color", "Normal", GREEN, [t(HUD, `${c("HpBar_hpValue")}${colorIs(GREEN)}`, COLOR)]),
        st("extra", "With Extra Health", YELLOW, [t(HUD, `${c("HpBar_hpValue")}${colorIs(YELLOW)}`, COLOR)]),
        st("regen", "Regeneration", WHITE, [t(HUD, `${c("HpBar_hpPerSec")} ${c("TextElement_content")}`, COLOR)]),
      ],
      xform: [{ page: HUD, sel: c("HpBar_valueWrapper"), keep: "translateX(-100%)" }],
    },
    {
      key: "en_bar",
      label: "Energy Bar",
      states: [
        st("color", "Energy", "#F9F4EF", [
          t(HUD, `${c("ManaBar_base")} ${c("ProgressBar_progressBg")}${inl(`rgba(${rgbOf("#F9F4EF")}`)}`, "background-color: {c}; background-image: none"),
          ...barCaps(c("ManaBar_base"), "#F9F4EF"),
        ]),
        st("increase", "Gain", GREEN, [t(HUD, c("ManaBar_increaseDelta"), BG)]),
        st("cost", "Ability Cost Preview", "#F9F4EF", [t(HUD, c("ManaBar_estimatedCostInner"), "background-image: linear-gradient(to right, {c} 0rem, {c})")]),
      ],
      xform: [{ page: HUD, sel: c("ManaBar_base") }],
    },
    {
      key: "en_label",
      label: "Energy Value",
      states: [
        st("color", "Value", WHITE, [t(HUD, c("ManaBar_manaValue"), COLOR)]),
        st("regen", "Regeneration", WHITE, [t(HUD, `${c("ManaBar_manaPerSec")} ${c("TextElement_content")}`, COLOR)]),
      ],
      xform: [{ page: HUD, sel: c("ManaBar_valueWrapper"), keep: "translateX(-100%)" }],
    },
    {
      key: "abilities",
      label: "Ability Frames",
      states: [
        abilityStates("ready", "Ready", WHITE),
        abilityStates("unavailable", "Unavailable", "#84858B"),
        abilityStates("active", "Active", GREEN),
        st("charge", "Charging", GREEN, [
          t(HUD, `${c("Ability_base")}${inl(`--progress-border-color: ${GREEN}`)} ${c("Ability_progressBorder")}`, BORDER),
          t(HUD, c("Ability_progressChunk"), BG),
        ]),
        st("silenced", "Silenced", GAME.enemy.base, [t(HUD, c("SilenceState_icon"), BG)]),
      ],
      xform: [{ page: HUD, sel: c("AbilityPanel_base") }],
    },
    {
      key: "equipment",
      label: "Equipment",
      states: [
        st("idle", "Idle Border", WHITE, [t(HUD, c("EquipmentItem_borderOverlay"), "border-color: {c@0.4}")]),
        st("ready", "Ready Border", "#6AB886", [t(HUD, c("EquipmentItem_borderOverlay__ready"), BORDER), t(HUD, c("EquipmentItem_borderOverlay__active"), BORDER)]),
        st("active", "Active", GREEN, [t(HUD, c("EquipmentItem_itemContent__active"), "background: {c}")]),
      ],
      xform: [{ page: HUD, sel: c("Equipment_base") }],
    },
    {
      key: "doll",
      label: "Damage Doll",
      hint: "The vehicle silhouette by the minimap. Hull and turret are raster icons.",
      states: [
        st("hull", "Hull", "#FFFFFF", [t(HUD, c("SimpleDoll_hull"), TINT)]),
        st("turret", "Turret", "#FFFFFF", [t(HUD, c("SimpleDoll_turret"), TINT)]),
        st("track", "Track Damaged", GAME.enemy.base, [t(HUD, c("DollTrackIndicator_indicator"), "background-color: {c}; box-shadow: 0 0 10rem 0 {c}")]),
      ],
      xform: [{ page: HUD, sel: c("VehicleDoll_base") }],
    },
    {
      key: "pet",
      label: "Drone Widget",
      hint: "The widget for a deployed drone",
      states: [
        st("hp", "Health", "#FFFFFF", [t(HUD, c("RegularPetIndicator_hpBar"), BG)]),
        st("warn", "Warning Timer", GAME.enemy.base, [t(HUD, c("RegularPetIndicator_timer__warn"), COLOR), t(HUD, c("RegularPetIndicator_crossedLine"), BG)]),
        st("warn_bg", "Warning Background", GAME.enemy.dark, [
          t(HUD, c("RegularPetIndicator_timerWrapper__warn"), "background-color: {c@0.6}"),
          t(HUD, c("RegularPetWidget_base__warn"), "background-color: {c@0.6}"),
          t(HUD, c("RegularPetIndicator_disabledState"), "background-color: {c@0.6}"),
        ]),
      ],
    },
    {
      key: "perks",
      label: "Skill Progress",
      states: [st("color", "Fill", YELLOW, [t(HUD, c("Perk_progressFill"), BG)])],
      xform: [{ page: HUD, sel: c("Perks_container") }],
    },
    {
      key: "speedo_bar",
      label: "Speedometer / Boost",
      // The speed glow ellipses have no background until their container is hasted or slowed,
      // so they are only ever painted under those two classes.
      states: [
        st("color", "Boost Bar", WHITE, [
          t(HUD, c("SprintDrain_drainProgress"), BG),
          t(HUD, c("SprintDrain_content"), "border-right-color: {c}"),
        ]),
        st("boosted", "Boost Bar: Boosted", GREEN, [
          t(HUD, c("SprintDrain_drainProgress__boosted"), BG),
          t(HUD, c("SprintDrain_glow"), "background: {c}"),
        ]),
        st("hasted", "Speed Glow: Hasted", GREEN, [t(HUD, `${c("Speedometer_glow__hasted")} > ${c("Speedometer_glow__ellipse")}`, "background: {c}")]),
        st("slowed", "Speed Glow: Slowed", ORANGE, [t(HUD, `${c("Speedometer_glow__slowed")} > ${c("Speedometer_glow__ellipse")}`, "background: {c}")]),
      ],
      xform: [{ page: HUD, sel: c("Speedometer_base") }],
    },
    {
      key: "speedo_label",
      label: "Speed Value",
      states: [st("color", "Value", WHITE, [t(HUD, c("Speedometer_speedValue"), COLOR), t(HUD, c("Speedometer_speedUnit"), COLOR)])],
      xform: [{ page: HUD, sel: c("Speedometer_speedValue") }, { page: HUD, sel: c("Speedometer_speedUnit") }],
    },
    {
      key: "perf",
      label: "Ping / FPS",
      states: [st("color", "Text", WHITE, [t(HUD, c("PerfInfo_statValue"), COLOR), t(HUD, c("PerfInfo_statName"), COLOR)])],
      xform: [{ page: HUD, sel: c("PerfInfo_base") }],
    },
  ],
};

// --- Scoreboard & results ----------------------------------------------------

/** React text: the colour sits in the inline `--text-component-color`. */
const textColor = (hex: string): string => inl(`--text-component-color: ${hex}`);
const BOARD_PAGES: readonly Page[] = [APP, HANGAR];
const onBoards = (sel: string, decl: string): Target[] => BOARD_PAGES.map((page) => t(page, sel, decl));
const nameTargets = (hex: string): Target[] => [
  ...onBoards(`${c("PlayerName_base")}${textColor(hex)}`, COLOR),
  ...onBoards(`${c("PlayerName_base")} ${textColor(hex)}`, COLOR),
  ...onBoards(`${c("AgentInfo_name")}${textColor(hex)}`, COLOR),
  ...onBoards(`${c("AgentInfo_role")}${bgIs(hex)}`, BG),
];

const SCOREBOARD: Section = {
  id: "scoreboard",
  label: "Scoreboard",
  description: "The in-battle scoreboard and the results table in the hangar.",
  items: [
    {
      key: "sb_names",
      label: "Players",
      hint: "Names, agent names and role icons.",
      states: [
        ...teamStates(["you", "ally", "enemy"], "base", (tm) => nameTargets(GAME[tm].base)),
        { ...st("ally_dead", "Ally: Destroyed", GAME.ally.dark, nameTargets(GAME.ally.dark)), team: "ally", shade: "dark" },
        { ...st("enemy_dead", "Enemy: Destroyed", GAME.enemy.dark, nameTargets(GAME.enemy.dark)), team: "enemy", shade: "dark" },
        st("offline", "Offline", "#83858B", nameTargets("#83858B")),
      ],
    },
    {
      key: "sb_headers",
      label: "Team Headers",
      states: teamStates(["ally", "enemy"], "base", (tm) => [
        ...onBoards(c(`TableHeader_base__${tm}`), BG),
        ...onBoards(c(`TeamScore_base__${tm}`), BORDER),
        ...onBoards(`${c(`TeamScore_base__${tm}`)} ${c("TeamScore_scoreLabel")}`, COLOR),
        ...onBoards(`${c(`TeamScore_base__${tm}`)} ${c("TeamScore_scoresValue")}`, COLOR),
      ]),
    },
    {
      key: "sb_stats",
      label: "Stat Cells",
      states: [
        st("normal", "Normal", WHITE, onBoards(`${c("CellWrapper_base")}${colorIs(WHITE)}`, COLOR)),
        st("best", "Best / Highlight", YELLOW, onBoards(`${c("CellWrapper_base")}${colorIs(YELLOW)}`, COLOR)),
        st("zero", "Zero / Disabled", "#83858B", onBoards(`${c("CellWrapper_base")}${colorIs("#83858B")}`, COLOR)),
      ],
    },
  ],
};

const RESULTS: Section = {
  id: "results",
  label: "Match Results",
  description: "The end-of-match flow and the results pages in the hangar.",
  items: [
    {
      key: "rs_outcome",
      label: "Outcome",
      states: [
        { ...st("victory", "Victory", GAME.ally.base, [
          t(HANGAR, c("BattleInfoHeader_resultLabel__victory"), COLOR),
          t(APP, `${c("ResultPreview_resultLabel")}${textColor(GAME.ally.base)}`, COLOR),
          t(APP, `${c("ResultPreview_resultLabel")} ${textColor(GAME.ally.base)}`, COLOR),
          t(APP, c("BattleResult_line__positive"), "background-color: {c}; box-shadow: 0 0 10rem 0 {c}"),
        ]), team: "ally", shade: "base" },
        { ...st("defeat", "Defeat", GAME.enemy.base, [
          t(HANGAR, c("BattleInfoHeader_resultLabel__defeat"), COLOR),
          t(APP, `${c("ResultPreview_resultLabel")}${textColor(GAME.enemy.base)}`, COLOR),
          t(APP, `${c("ResultPreview_resultLabel")} ${textColor(GAME.enemy.base)}`, COLOR),
          t(APP, c("BattleResult_line__negative"), "background-color: {c}; box-shadow: 0 0 10rem 0 {c}"),
        ]), team: "enemy", shade: "base" },
      ],
    },
    {
      key: "rs_team_score",
      label: "Team Scores",
      states: teamStates(["ally", "enemy"], "base", (tm) => {
        const side = tm === "ally" ? "allies" : "enemies";
        return [
          t(APP, `${c(`BattleScore_base__${side}`)} ${c("BattleScore_score")}`, COLOR),
          t(APP, `${c(`BattleScore_base__${side}`)} ${c("BattleScore_labelWrapper")}`, BG),
        ];
      }),
    },
    {
      key: "rs_top_players",
      label: "Top Player Frames",
      states: [
        { ...st("ally", "Ally", GAME.ally.base, [t(APP, c("TopPlayerCard_avatar"), BORDER)]), team: "ally", shade: "base" },
        { ...st("squad", "Squad", GAME.squad.base, [t(APP, `${c("TopPlayerCard_base__platoon")} ${c("TopPlayerCard_avatar")}`, BORDER)]), team: "squad", shade: "base" },
        { ...st("you", "You", GAME.you.base, [t(APP, `${c("TopPlayerCard_base__self")} ${c("TopPlayerCard_avatar")}`, BORDER)]), team: "you", shade: "base" },
      ],
    },
    {
      key: "rs_badges",
      label: "Best Stat Badge",
      states: [st("color", "Badge", YELLOW, [t(HANGAR, c("StatBadge_bestMarkBg"), "background: {c}"), t(APP, c("StatBadge_bestMarkBg"), "background: {c}")])],
    },
    {
      key: "rs_xp",
      label: "XP Bars",
      states: [
        st("gain", "Earned XP", "#9FFEC2", [
          ...onBoards(c("DeprecatedProgressBar_diff"), "background-color: {c}; background-image: linear-gradient(90deg, {c@0.7} 30%, {c} 97%)"),
          ...onBoards(c("DeprecatedProgressBar_diffEdge"), "background-color: {c}; background-image: none"),
        ]),
        st("fill", "Current XP", "#D0CBC4", onBoards(c("DeprecatedProgressBar_value"), "background-color: {c}; background-image: none")),
        st("level", "Level Caption", "#F2C758", onBoards(`${c("DynProgressBar_caption")}${textColor("#F2C758")}`, COLOR)),
      ],
    },
    {
      key: "rs_currency",
      label: "Currency Icons",
      hint: "Reward and wallet currency icons.",
      states: [
        st("soft", "Credits", "#F9F4EF", onBoards(`${c("Currency_icon")}${bgIs("#F9F4EF")}`, BG)),
        st("hard", "Gold", "#EFA72B", onBoards(`${c("Currency_icon")}${bgIs("#EFA72B")}`, BG)),
        st("other", "Tech & Intel", "#CCCCCC", onBoards(`${c("Currency_icon")}${bgIs("#CCCCCC")}`, BG)),
      ],
    },
    {
      key: "rs_level_up",
      label: "Level Up",
      states: [st("color", "New Level", YELLOW, [
        t(HANGAR, `${c("ProgressionLevel_newLevel")}`, COLOR),
        t(APP, `${c("ProgressionLevel_newLevel")}`, COLOR),
      ])],
    },
  ],
};

export const SECTIONS: Section[] = [NAMEPLATES, WORLD, CAPTURE, MINIMAP, SCORE, FEED, GUNNERY, PLAYER, SCOREBOARD, RESULTS];

export const PAGES: readonly Page[] = [HUD, MK, BI, APP, HANGAR];
