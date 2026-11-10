/**
 * Stage-side mirror of the apps, windows, taskbar and console. `overlayClient.ts`
 */
import { computed, reactive, ref, toRaw } from "vue";
import mitt from "mitt";
import type { OverlayInput } from "../rive";
import type { AppEntry, LauncherSettings, WindowDescriptor } from "./types";
import type { Rect, SnapZone } from "./windowGeometry";

export const apps = ref<AppEntry[]>([]);
export const windows = reactive(new Map<string, WindowDescriptor>());
/** Window ids, bottom to top. */
export const windowOrder = ref<string[]>([]);
export const launcher = reactive<LauncherSettings>({ edge: "bottom", autoHide: true, consoleHotkey: "ctrl+space" });
export const consoleOpen = ref(false);
/** Live data per window, so one window updates without a stage render. */
export const windowBus = mitt<Record<string, Record<string, OverlayInput>>>();
/** The snap a window drag would make now, for the preview. */
export const snapPreview = ref<{ rect: Rect; zone: Exclude<SnapZone, null> } | null>(null);
/** The taskbar is on the stage, dim or full. The stage takes the mouse over it. */
export const taskbarShown = ref(false);
/** A taskbar context menu is open: the taskbar stays out. */
export const taskbarMenuOpen = ref(false);
/** The stage tour shows the taskbar: it stays out. */
export const taskbarHeld = ref(false);
/** The stage window has the keyboard: a focused window shows its focus bar only then. */
export const stageKeyboard = ref(typeof document !== "undefined" && document.hasFocus());
/** The runtime's answer to the last Configure Command change. */
export const configureResult = ref<{ appKey: string; ok: boolean; error?: string; owner?: string; at: number } | null>(null);

export const orderedWindows = computed(() =>
  windowOrder.value.map((id) => windows.get(id)).filter((w): w is WindowDescriptor => !!w),
);

export const visibleWindows = computed(() => orderedWindows.value.filter((w) => !w.minimized));

export const appsUiShown = computed(() => visibleWindows.value.length > 0 || consoleOpen.value || taskbarShown.value);

export const focusedWindowId = computed(() => orderedWindows.value.find((w) => w.focused)?.windowId ?? null);

/** Runs when the runtime asks the stage to take the keyboard for a window. */
let focusRequest: (windowId: string) => void = () => {};

export function onFocusRequest(cb: (windowId: string) => void): void {
  focusRequest = cb;
}

function moveToTop(id: string): void {
  windowOrder.value = [...windowOrder.value.filter((x) => x !== id), id];
}

/** Optimistic focus on pointer down, before the runtime answers. */
export function raiseWindow(id: string): void {
  if (windowOrder.value[windowOrder.value.length - 1] !== id) moveToTop(id);
  for (const w of windows.values()) w.focused = w.windowId === id;
}

/** Applies one runtime message. False when it is not an apps message. */
export function applyAppsMessage(m: Record<string, unknown>): boolean {
  switch (m.type) {
    case "app:list":
      apps.value = Array.isArray(m.apps) ? (m.apps as AppEntry[]) : [];
      return true;
    case "launcher:settings":
      if (m.edge === "bottom" || m.edge === "top" || m.edge === "left" || m.edge === "right") launcher.edge = m.edge;
      if (typeof m.autoHide === "boolean") launcher.autoHide = m.autoHide;
      if (typeof m.consoleHotkey === "string") launcher.consoleHotkey = m.consoleHotkey;
      return true;
    case "window:opened": {
      const d = m as unknown as WindowDescriptor & { focus?: boolean };
      windows.set(d.windowId, { ...d, inputs: d.inputs ?? {} });
      if (!windowOrder.value.includes(d.windowId)) windowOrder.value = [...windowOrder.value, d.windowId];
      if (d.focused) raiseWindow(d.windowId);
      if (d.focus) focusRequest(d.windowId);
      return true;
    }
    case "window:state": {
      const w = windows.get(String(m.windowId));
      if (!w) return true;
      if (typeof m.title === "string") w.title = m.title;
      if (m.rect !== undefined) w.rect = (m.rect as Rect | null) ?? null;
      if (typeof m.maximized === "boolean") w.maximized = m.maximized;
      if (typeof m.minimized === "boolean") w.minimized = m.minimized;
      if (typeof m.focused === "boolean") w.focused = m.focused;
      if (m.status === "open" || m.status === "waiting" || m.status === "crashed") w.status = m.status;
      return true;
    }
    case "window:order":
      if (Array.isArray(m.order)) windowOrder.value = (m.order as unknown[]).map(String).filter((id) => windows.has(id));
      return true;
    case "window:closed": {
      const id = String(m.windowId);
      windows.delete(id);
      windowOrder.value = windowOrder.value.filter((x) => x !== id);
      return true;
    }
    case "window:data": {
      const id = String(m.windowId);
      const inputs = (m.inputs as Record<string, OverlayInput>) ?? {};
      const w = windows.get(id);
      // Raw write: per-frame data must not render the stage.
      if (w) Object.assign(toRaw(w).inputs, inputs);
      windowBus.emit(id, inputs);
      return true;
    }
    case "window:take_focus":
      focusRequest(String(m.windowId));
      return true;
    case "console:open":
      consoleOpen.value = true;
      // A key opened it: the search field needs the keyboard from the game.
      focusRequest("");
      return true;
    case "app:configure_result":
      configureResult.value = {
        appKey: String(m.appKey ?? ""),
        ok: m.ok === true,
        error: typeof m.error === "string" ? m.error : undefined,
        owner: typeof m.owner === "string" ? m.owner : undefined,
        at: Date.now(),
      };
      return true;
    case "console:close":
      consoleOpen.value = false;
      return true;
  }
  return false;
}

/** The runtime connection closed: the next one hydrates everything again. */
export function clearApps(): void {
  apps.value = [];
  windows.clear();
  windowOrder.value = [];
  consoleOpen.value = false;
  snapPreview.value = null;
}
