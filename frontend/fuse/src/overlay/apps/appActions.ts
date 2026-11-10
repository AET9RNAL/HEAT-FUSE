/** The user's actions on an app, shared by the taskbar menu and the console. */
import { focusStageForClick, releaseStageFocus, sendAppLaunch, sendAppsMessage, sendWindowCommand } from "../overlayClient";
import { consoleOpen, raiseWindow, windowOrder } from "./appsState";
import type { AppEntry } from "./types";

export function topWindowOf(app: AppEntry): string | undefined {
  for (let i = windowOrder.value.length - 1; i >= 0; i--) {
    const id = windowOrder.value[i]!;
    if (app.windows.includes(id)) return id;
  }
  return undefined;
}

export function focusWindow(id: string): void {
  raiseWindow(id);
  sendWindowCommand(id, "focus");
  focusStageForClick();
}

/** Brings the app's top window forward, or opens a window. `newWindow` always opens one (multi-instance apps). */
export function openApp(app: AppEntry, newWindow = false): void {
  const top = newWindow ? undefined : topWindowOf(app);
  if (top) {
    focusWindow(top);
    return;
  }
  sendAppLaunch(app.key, newWindow ? { newWindow: true } : {});
  focusStageForClick();
}

export function toggleFavorite(app: AppEntry): void {
  sendAppsMessage("app:favorite", { appKey: app.key, favorite: app.favorite < 0 });
}

export function moveFavorite(app: AppEntry, delta: -1 | 1): void {
  if (app.favorite < 0) return;
  sendAppsMessage("app:favorite", { appKey: app.key, favorite: true, index: Math.max(0, app.favorite + delta) });
}

export function togglePin(app: AppEntry): void {
  sendAppsMessage("app:pin", { appKey: app.key, pinned: !app.pinned });
}

export function closeAllWindows(app: AppEntry): void {
  for (const id of [...app.windows]) sendWindowCommand(id, "close");
}

export function quitApp(app: AppEntry): void {
  sendAppsMessage("app:quit", { appKey: app.key });
}

/** The FUSE App shows the config window of the app's plugin. */
export function openCommandSettings(app: AppEntry): void {
  sendAppsMessage("app:open_settings", { appKey: app.key });
}

export function closeConsole(giveBack: boolean): void {
  if (!consoleOpen.value) return;
  consoleOpen.value = false;
  sendAppsMessage("console:closed");
  if (giveBack) releaseStageFocus();
}
