export type OverlayKind = "rive" | "vue";

export interface Size {
  w: number;
  h: number;
}

/** Rect in device-independent pixels (DIPs), absolute in the display space. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
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
}

export interface OverlayHandle {
  readonly id: string;
  set(path: string, value: number): void;
  setBool(path: string, value: boolean): void;
  setString(path: string, value: string): void;
  setColor(path: string, argb: number): void;
  setEnum(path: string, label: string): void;
  trigger(path: string): void;
  setJson(path: string, value: unknown): void;
  setRect(rect: Rect): void;
  setPositionConfigKey(key: string): void;
  setVisible(visible: boolean): void;
  /**
   * Register a handler for actions emitted by an interactive Vue overlay
   * (buttons/inputs calling `emitAction`). One handler per overlay; a second
   * call replaces the first. Payload is arbitrary JSON authored by the overlay.
   */
  onAction(cb: (action: string, payload?: unknown) => void): void;
  remove(): void;
}

export interface OverlayManager {
  declare(decl: OverlayDeclaration): OverlayHandle;
  get(id: string): OverlayHandle | undefined;
  all(): OverlayHandle[];
}
