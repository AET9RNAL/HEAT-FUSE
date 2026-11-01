import type { OverlayInspector } from "./inspector.js";

export type OverlayKind = "rive" | "vue";

export interface Size {
  w: number;
  h: number;
}

/**
 * Rect in device-independent pixels (DIPs), absolute in the display space.
 *
 * `x`/`y` are the *unrotated* top-left; rotation is applied about the rect's
 * center, so the two stay independent and a rotation never moves the origin.
 */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Clockwise degrees in [0, 360). Defaults to 0. */
  rot?: number;
  /** 0..1. Defaults to 1. */
  opacity?: number;
}

export interface OverlayDeclaration {
  id: string;
  kind: OverlayKind;
  asset: string;
  size: Size;
  artboard?: string;
  stateMachine?: string;
  viewModel?: string;
  defaultRect?: Rect;
  positionConfigKey?: string;
  /** Takes pointer input in interactive mode (Ctrl+I); badged on the stage while calibrating. */
  interactive?: boolean;
}

export interface OverlayHandle {
  readonly id: string;
  /** In-stage config surface for this overlay (sections shown in the inspector). */
  readonly inspector: OverlayInspector;
  set(path: string, value: number): void;
  setBool(path: string, value: boolean): void;
  setString(path: string, value: string): void;
  setColor(path: string, argb: number): void;
  setEnum(path: string, label: string): void;
  trigger(path: string): void;
  setJson(path: string, value: unknown): void;
  setRect(rect: Rect): void;
  /** Canvas size, applied live. The stage can't resize Rive overlays, so their plugin sizes them. */
  setSize(size: Size): void;
  setPositionConfigKey(key: string): void;
  setVisible(visible: boolean): void;
  /**
   * Register a handler for actions emitted by an interactive Vue overlay
   * (buttons/inputs calling `emitAction`). One handler per overlay; a second
   * call replaces the first. Payload is arbitrary JSON authored by the overlay.
   * An action named `report:<name>` is data from the overlay (stats, telemetry):
   * it reaches this handler but does not count as a user action.
   */
  onAction(cb: (action: string, payload?: unknown) => void): void;
  remove(): void;
}

export interface OverlayManager {
  declare(decl: OverlayDeclaration): OverlayHandle;
  get(id: string): OverlayHandle | undefined;
  all(): OverlayHandle[];
  /**
   * The URL path of a file in `<filesDir>/overlay/`, for an overlay to fetch (put the stage asset base in
   * front). Use it for large data that the plugin makes at run time. The route needs the `files` permission.
   */
  fileUrl(relPath: string): string;
}

/** The folder of `filesDir` that the overlay file route serves. */
export const OVERLAY_FILES_DIR = "overlay";

export function overlayFileUrl(pluginId: string, relPath: string): string {
  const rel = relPath.replace(/\\/g, "/").replace(/^\/+/, "");
  return `/overlay-file/${encodeURIComponent(pluginId)}/${rel.split("/").map(encodeURIComponent).join("/")}`;
}
