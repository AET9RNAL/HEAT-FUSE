/**
 * Windowed apps on the stage. A plugin declares its apps in the manifest `apps` list
 */
import type { Size } from "./overlay.js";

export type AppWindowCommand = "focus" | "minimize" | "maximize" | "restore" | "close";

export interface AppWindowState {
  focused: boolean;
  maximized: boolean;
  minimized: boolean;
  /** The window size in DIPs. 0 x 0 until the stage places the window. */
  size: Size;
}

export interface AppWindow {
  readonly id: string;
  readonly appId: string;
  /** "main", or a key of the manifest `views`. */
  readonly view: string;
  readonly state: AppWindowState;
  /** Data for the view's `data` prop, as `OverlayHandle.setJson`. */
  setJson(path: string, value: unknown): void;
  setTitle(title: string): void;
  focus(): void;
  minimize(): void;
  maximize(): void;
  restore(): void;
  close(): void;
  /** Actions the view sends with `emitAction`. One handler per window: a second call replaces the first. */
  onAction(cb: (action: string, payload?: unknown) => void): void;
  /** Runs after the window state changes. Returns a function that removes the listener. */
  onState(cb: (state: AppWindowState) => void): () => void;
}

export interface AppHandlers {
  /** FUSE calls this for each new window of the app, and again for the open windows after a plugin restart. */
  open(win: AppWindow): void | Promise<void>;
  close?(win: AppWindow): void;
}

export interface AppManager {
  /** The handlers of one app from the manifest `apps` list. */
  handle(appId: string, handlers: AppHandlers): void;
  /** Opens a window of an app: the main view, or another view such as a tool window. */
  open(appId: string, view?: string): Promise<AppWindow>;
  windows(appId?: string): AppWindow[];
}
