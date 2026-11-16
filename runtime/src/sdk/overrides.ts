/**
 * The override part of a plugin: prebuilt game file packs (presets) that FUSE puts into the game.
 * Needs `game_overrides`.
 */
export type OverrideState = "off" | "pending" | "applied" | "outdated" | "failed";

/** What a preset changes: a hangar scene, a world, or a prefab. */
export type OverridePresetKind = "hangar" | "world" | "prefab";

export interface OverridePresetInfo {
  id: string;
  name: string;
  /** The preview image, as a path inside the package, or null. */
  preview: string | null;
  /** Why FUSE cannot apply this preset, for example a damaged package. Null when it can. */
  problem: string | null;
  /** Null when the manifest gives no known kind. */
  kind: OverridePresetKind | null;
  /** The manifest default: FUSE uses it until the user picks a preset. */
  isDefault: boolean;
}

export interface OverrideStatus {
  preset: string | null;
  state: OverrideState;
  reason?: string;
  /** pending only: FUSE takes this plugin's changes out of the game files when the game is closed. */
  removing?: boolean;
}

export interface OverridesSnapshot {
  presets: OverridePresetInfo[];
  active: OverrideStatus;
}

export interface PluginOverrides {
  /** The presets of this plugin's manifest. */
  presets(): OverridePresetInfo[];
  /** The picked preset and how far FUSE got with it. */
  active(): OverrideStatus;
  /** Picks a preset, or null for none. FUSE writes it into the game when the game is closed. */
  select(preset: string | null): Promise<OverrideStatus>;
  /** Called when the presets or the status change. Returns a function that removes the listener. */
  onChange(cb: () => void): () => void;
}
