import type { OverlayInput } from "../rive";
import type { Rect, Size } from "./windowGeometry";

export type TaskbarEdge = "bottom" | "top" | "left" | "right";
export type WindowStatus = "open" | "waiting" | "crashed";
export type WindowCommand = "focus" | "minimize" | "maximize" | "restore" | "close" | "restart";
/** console action panel. */
export type ActionView = "actions" | "configure";

/** One app of the `app:list` message. Mirrors `AppHub.listPayload` in runtime/src/host/AppHub.ts. */
export interface AppEntry {
  key: string;
  pluginId: string;
  appId: string;
  name: string;
  pluginName: string;
  iconUrl: string | null;
  keywords: string[];
  views: string[];
  instances: "single" | "multi";
  running: boolean;
  windows: string[];
  favorite: number;
  pinned: boolean;
  alias: string | null;
  hotkey: string | null;
  /** The owner of the combo when the launch hotkey could not bind. */
  hotkeyConflict: string | null;
  usage: { count: number; last: number };
}

/** One window. Mirrors `AppHub.openedPayload` in runtime/src/host/AppHub.ts. */
export interface WindowDescriptor {
  windowId: string;
  appKey: string;
  pluginId: string;
  appId: string;
  view: string;
  viewUrl: string;
  iconUrl: string | null;
  title: string;
  /** Null until the stage places the window. */
  rect: Rect | null;
  size: Size;
  minSize: Size;
  maxSize: Size | null;
  resizable: boolean;
  maximized: boolean;
  minimized: boolean;
  focused: boolean;
  status: WindowStatus;
  z: number;
  inputs: Record<string, OverlayInput>;
}

export interface LauncherSettings {
  edge: TaskbarEdge;
  autoHide: boolean;
  consoleHotkey: string;
}
