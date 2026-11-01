/** Where the player is, for overlay visibility. Built from the engine's camera slot, not game-mode phase names. */

export type Scene =
  | "offline"
  | "loading"
  | "hangar"
  | "prebattle"
  | "alive"
  | "map"
  | "dead"
  | "deploy"
  | "spawning"
  | "results";

export const SCENES: readonly Scene[] = [
  "offline",
  "loading",
  "hangar",
  "prebattle",
  "alive",
  "map",
  "dead",
  "deploy",
  "spawning",
  "results",
];

/** The battle_hud part of a read (read_all.js `scene_hud`). */
export interface SceneHud {
  camera: string;
  hud: number;
  map: number;
  kill_card: number;
  respawn: number;
  observer: number;
  finished: number;
}

export interface SceneInputs {
  pages: Partial<Record<string, boolean>>;
  battleState: number | null;
  hud: SceneHud | null;
  route: string | null;
}

// battleInfoModel.state: Unknown 1, Anticipation 2, Countdown 4, Battle 8, Aftermath 16, Termination 32, Paused 64, Cancel 128.
const BEFORE_BATTLE = new Set([1, 2, 4]);
const AFTER_BATTLE = new Set([16, 32, 128]);

export function sceneOf(i: SceneInputs): Scene {
  if (!i.pages.battle_hud) {
    if (i.pages.hangar) return "hangar";
    if (i.pages.battle_app) return "results";
    if (i.pages.splash || i.pages.transition_world) return "loading";
    return "offline";
  }
  const h = i.hud;
  const route = i.route ?? "";
  if (h?.finished || (i.battleState !== null && AFTER_BATTLE.has(i.battleState)) || route.startsWith("/ui/postMatch")) {
    return "results";
  }
  if (i.battleState !== null && BEFORE_BATTLE.has(i.battleState)) return "prebattle";

  const camera = h?.camera ?? "";
  if (camera === "CustomizeDeployCamera" || route.startsWith("/ui/customDeploy") || route.startsWith("/ui/vehicleSwap")) {
    return "deploy";
  }
  if (camera === "DeathcamCamera") return "dead";
  if (camera === "RebornCamera") return "spawning";
  // The respawn model turns on at the fatal hit, about 2 s before the death camera.
  if (h?.respawn) return "dead";
  if (camera === "TacticalMapCamera" || h?.map) return "map";
  return "alive";
}

/** Hangar screens by `meta` route prefix, first match wins (docs/COHTML_FRONTEND_MAP.md §8.6). */
const HANGAR_SCREENS: ReadonlyArray<[RegExp, string]> = [
  [/^\/ui\/hangar\/frontman\/[^/]*\/vehicles\/[^/]*\/frontmanDetails(\/|$)/, "agent"],
  [/^\/ui\/hangar\/frontman\/[^/]*\/vehicles(\/|$)/, "select"],
  [/^\/ui\/hangar\/vehicleSwap(\/|$)/, "select"],
  [/^\/ui\/hangar\/frontman\/[^/]+\/vehicle\/[^/]+(\/|$)/, "vehicle"],
  [/^\/ui\/hangar\/(missions|ops|battlePass)(\/|$)/, "missions"],
  [/^\/ui\/hangar\/(modeSelector|practice)(\/|$)/, "modes"],
  [/^\/ui\/hangar\/(career|inviteCodes)(\/|$)/, "career"],
  [/^\/ui\/hangar\/postMatch(\/|$)/, "results"],
  [/^\/ui\/hangar\/(shop|plus)(\/|$)/, "store"],
  [/^\/ui\/(hangar\/)?tutorial(\/|$)/, "tutorial"],
  [/^\/ui\/settings(\/|$)/, "settings"],
  [/^\/ui\/hangar(\/(baseCamp|pending|news)(\/|$)|\/?$)/, "base"],
];

export const HANGAR_SCREEN_NAMES: readonly string[] = [
  "base", "select", "agent", "vehicle", "missions", "modes", "career", "results", "store", "tutorial", "settings", "other",
];

export function hangarScreen(route: string | null): string {
  if (!route) return "base";
  for (const [pattern, screen] of HANGAR_SCREENS) if (pattern.test(route)) return screen;
  return "other";
}

/** The `meta` part of a read (read_hangar_scene.js). */
export interface SceneHangar {
  route: string | null;
  queued: boolean;
}

/**
 * Every tag that applies now: the scene, a group ("match") or a hangar screen ("hangar.vehicle"), and "queue".
 * A plugin shows when one of these is in its Show in list.
 */
export function sceneTags(scene: Scene, hangar: SceneHangar | null): string[] {
  switch (scene) {
    case "alive":
    case "map":
    case "dead":
    case "deploy":
      return ["match", scene];
    case "spawning":
      return ["match", "spawning", "deploy"];
    case "hangar": {
      const tags = ["hangar", `hangar.${hangarScreen(hangar?.route ?? null)}`];
      if (hangar?.queued) tags.push("queue");
      return tags;
    }
    default:
      return [scene];
  }
}
