import type { OverlayInput } from "./rive";

/** Mirrors `Rect` in runtime/src/sdk/overlay.ts - keep the two in sync. */
export interface OverlayRect {
  x: number;
  y: number;
  w: number;
  h: number;
  rot?: number;
  opacity?: number;
}

export interface OverlayDescriptor {
  overlayId: string;
  pluginId: string;
  kind: "rive" | "vue";
  assetUrl: string;
  size: { w: number; h: number };
  artboard: string | null;
  stateMachine: string | null;
  viewModel: string | null;
  rect: OverlayRect | null;
  visible: boolean;
  /** Declared as taking pointer input in interactive mode. */
  interactive?: boolean;
  /** Retained view-model inputs (hydration for late joiners). */
  inputs: Record<string, OverlayInput>;
}

export type HostState = "calibrate" | "locked" | "interactive";

/** One row of the stage's plugin list (read-only mirror of the host's roster). */
export interface StagePlugin {
  plugin_id: string;
  name: string;
  version: string;
  status: string;
  is_core: boolean;
  requires_calibration: boolean;
  calibration_stages: number;
  /** 0 when the plugin is not currently calibrating. */
  current_stage: number;
  state: string;
  in_setup: boolean;
  overlay_ids: string[];
}
