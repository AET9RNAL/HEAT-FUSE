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
  /** Retained view-model inputs (hydration for late joiners). */
  inputs: Record<string, OverlayInput>;
}

export type HostState = "calibrate" | "locked" | "interactive";
