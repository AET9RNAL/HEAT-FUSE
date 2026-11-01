/**
 * The selected reticle inside the game HUD (battle_hud), as markup bound to the game's crosshair models.
 * The game moves, sizes and fills it in the same frame as its own aim.
 * Each reticle gives a builder (reticles/natives.ts) that draws around the origin from the expressions below.
 */
import { GAME_AIMS, type CueMode } from "./view.js";

export const ROOT_ID = "__fuse_xh__";
export const STYLE_ID = "__fuse_xh_css__";
/** Ghost classes: the layer grows, its pieces fade. Both play when the layer turns visible. */
export const GHOST_GROW = "__fuse_xh_gg";
export const GHOST_FADE = "__fuse_xh_gf";

const CFG = "{{crosshair_config}}";
const POS = "{{crosshair_position}}";
const SPR = "{{crosshair_spread}}";
const REL = "{{crosshair_reloading}}";
const MG = "{{machineGunModel}}";
/** Types whose whole aim widget the game hides. */
const HIDDEN = ["Hidden", "OnlyAmmoLoader"];
/** The ghost of the preview: scale 1 to 1.4, opacity 0.7 to 0, 0.45 s, ease out. */
const GHOST = { grow: 1.4, from: 0.7, seconds: 0.45, ease: "cubic-bezier(0, 0.55, 0.45, 1)" };

/** A 0 x 0 px box at its parent's origin. */
export const BOX = "position:absolute;left:0;top:0;width:0;height:0";

export interface NativeOptions {
  settings: Record<string, unknown>;
  /** Range mark colours "#RRGGBB" for stages 1 effective, 2 falloff, 3 out. */
  range: [string, string, string];
  ghostOn: CueMode;
  /** The game's smallest dispersion circle, px. */
  minD: number;
  /** HUD page size, px. */
  screen: [number, number];
}

/** What a reticle builder gets: expressions the game evaluates every frame, and fixed values. */
export interface NativeContext {
  /** Dispersion over the smallest circle, 1 or more. */
  scale: string;
  reloading: string;
  /** 0..1 */
  progress: string;
  /** 0 no target, 1 effective, 2 falloff, 3 out. */
  stage: string;
  /** True while the ghost layer shows: it plays each time this turns true. */
  ghost: string;
  settings: Record<string, unknown>;
  range: [string, string, string];
}

/**
 * Markup around the origin. `reticle` sits where the game puts its aim circle: at the gun point in dynamic
 * aiming, on the screen centre mark in static aiming. `sight` replaces the game's cross and stays on the gun point.
 * `fixed` stays on the screen centre mark in both modes, like the game's reload arc.
 */
export type NativeReticle = (c: NativeContext) => { reticle: string; sight: string; fixed: string };

/** A number for markup and expressions. */
export const f = (n: number): string => String(Math.round(n * 10000) / 10000);
const list = (a: readonly string[]): string => `[${a.map((s) => `'${s}'`).join(",")}]`;

/** The effective range stage, from the same fields as the Accessors `crosshair.range` read. */
export const STAGE =
  `((${CFG}.distance > 0 && ${CFG}.tooCloseDistance > ${CFG}.distance) || ` +
  `(${MG}.active && ${MG}.distance > 0 && ${MG}.effectiveDistance < ${MG}.distance) || ${CFG}.degradationProgress >= 10) ? 3 : ` +
  `(${CFG}.distance <= 0 ? 0 : (${CFG}.degradationProgress > 0 ? 2 : 1))`;

export function context(o: NativeOptions): NativeContext {
  const minD = f(o.minD);
  return {
    scale: `(Math.max(${SPR}.spread, ${minD}) / ${minD})`,
    reloading: `${REL}.reloading`,
    progress: `Math.min(1, Math.max(0, ${REL}.reloadPrc / 100))`,
    stage: STAGE,
    // Dispersion: the game's "fully aimed" flag, which also works in sniper view. Reload: the gun is loaded.
    ghost: o.ghostOn === "reload" ? `!${REL}.reloading` : `${SPR}.reduced`,
    settings: o.settings,
    range: o.range,
  };
}

/**
 * The reticle for default-aim weapon types
 */
export function nativeHtml(build: NativeReticle, o: NativeOptions): string {
  const [w, h] = o.screen;
  const { reticle, sight, fixed } = build(context(o));
  const type = `${CFG}.crosshairType`;
  const ours =
    `(${CFG}.visible && ${list(HIDDEN)}.indexOf(${type}) < 0 && ${list(GAME_AIMS)}.indexOf(${type}) < 0 && ` +
    `!${CFG}.isRestrictedByPitchLimits)`;
  const isStatic = `${CFG}.aimingMode === 1`;
  const atMark = `'translate(${f(w / 2)}px,' + (${f(h / 2)} + ${CFG}.offsetY) + 'px)'`;
  return (
    `<div id="${ROOT_ID}" style="${BOX};pointer-events:none;z-index:50">` +
    `<div style="${BOX};display:none" data-bind-style-transform2d="${POS}.transform2D" ` +
    `data-bind-style-display="(${ours} && !(${isStatic}) && ${POS}.onScreen) ? 'block' : 'none'">${reticle}</div>` +
    `<div style="${BOX};display:none" data-bind-style-transform="${atMark}" ` +
    `data-bind-style-display="(${ours} && ${isStatic}) ? 'block' : 'none'">${reticle}</div>` +
    `<div style="${BOX};display:none" data-bind-style-transform2d="${POS}.transform2D" ` +
    `data-bind-style-display="(${ours} && ${POS}.onScreen) ? 'block' : 'none'">${sight}</div>` +
    (fixed
      ? `<div style="${BOX};display:none" data-bind-style-transform="${atMark}" ` +
        `data-bind-style-display="${ours} ? 'block' : 'none'">${fixed}</div>`
      : "") +
    `</div>`
  );
}

/**
 * Hides the game's default aim and its cursor, which the reticle replaces, and defines the ghost animation.
 * Game builds name the cursor class FrontSight_defaultSight_<hash> or FrontSight_frontSight_<hash>.
 */
export const NATIVE_CSS =
  'default-aim, [class*="FrontSight_defaultSight_"], [class*="FrontSight_frontSight_"] { display: none !important; }\n' +
  `@keyframes ${GHOST_GROW} { from { transform: scale(1); } to { transform: scale(${GHOST.grow}); } }\n` +
  `@keyframes ${GHOST_FADE} { from { opacity: ${GHOST.from}; } to { opacity: 0; } }\n` +
  `.${GHOST_GROW} { transform-origin: 0 0; animation: ${GHOST_GROW} ${GHOST.seconds}s ${GHOST.ease} forwards; }\n` +
  `.${GHOST_FADE} { animation: ${GHOST_FADE} ${GHOST.seconds}s ${GHOST.ease} forwards; }`;
