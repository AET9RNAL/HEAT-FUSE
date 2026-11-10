import path from "node:path";
import { HotkeyRegistry } from "../sdk/hotkeys.js";
import type { Size } from "../sdk/overlay.js";

/** "always": the process runs while the plugin is on. "app": the process runs only while a window is open. */
export type AppLifecycle = "always" | "app";
export type AppInstances = "single" | "multi";

export const MAIN_VIEW = "main";

const ID_RE = /^[a-z0-9][a-z0-9_-]{0,31}$/;
const ICON_RE = /\.(svg|png|webp|jpg|jpeg)$/i;
const DEFAULT_SIZE: Size = { w: 480, h: 360 };
const DEFAULT_MIN_SIZE: Size = { w: 240, h: 160 };
const MIN_PX = 120;
const MAX_PX = 7680;
const MAX_KEYWORDS = 16;

export interface AppViewSpec {
  key: string;
  /** The Vue file, relative to the package root. */
  view: string;
  /** Null: the window shows the app name. */
  title: string | null;
  size: Size;
  minSize: Size;
  maxSize: Size | null;
  resizable: boolean;
}

export interface AppSpec {
  /** `<plugin_id>:<app_id>`. */
  key: string;
  pluginId: string;
  appId: string;
  name: string;
  /** The icon file, relative to the package root, or null. */
  icon: string | null;
  keywords: string[];
  instances: AppInstances;
  /** The manifest's launch hotkey, or null. */
  hotkey: string | null;
  views: Record<string, AppViewSpec>;
}

export interface ParsedApps {
  lifecycle: AppLifecycle;
  apps: AppSpec[];
  /** Problems that do not stop the plugin: the field falls back to its default. */
  warnings: string[];
}

function record(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/** A forward-slash path inside the package, or null when it leaves the package. */
function packagePath(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const rel = v.trim().replace(/\\/g, "/").replace(/^\.\//, "");
  if (!rel || rel.startsWith("/") || path.isAbsolute(rel) || rel.split("/").includes("..")) return null;
  return rel;
}

function px(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(Math.min(MAX_PX, Math.max(MIN_PX, n))) : fallback;
}

function size(v: unknown, fallback: Size): Size {
  const r = record(v);
  return r ? { w: px(r.w, fallback.w), h: px(r.h, fallback.h) } : { ...fallback };
}

function viewSpec(
  key: string,
  raw: Record<string, unknown>,
  where: string,
  fileExists: (rel: string) => boolean,
): AppViewSpec {
  const view = packagePath(raw.view);
  if (!view || !view.endsWith(".vue")) throw new Error(`${where}: 'view' must be a .vue file inside the package`);
  if (!fileExists(view)) throw new Error(`${where}: view '${view}' is not in the package`);
  const win = record(raw.window) ?? raw;
  const sz = size(win.size, DEFAULT_SIZE);
  const min = size(win.minSize, DEFAULT_MIN_SIZE);
  const max = record(win.maxSize) ? size(win.maxSize, sz) : null;
  min.w = Math.min(min.w, sz.w);
  min.h = Math.min(min.h, sz.h);
  if (max) {
    max.w = Math.max(max.w, sz.w);
    max.h = Math.max(max.h, sz.h);
  }
  return {
    key,
    view,
    title: typeof raw.title === "string" && raw.title.trim() ? raw.title.trim() : null,
    size: sz,
    minSize: min,
    maxSize: max,
    resizable: win.resizable !== false,
  };
}

/** Throws with a reason for the user when the manifest cannot work. `fileExists` takes a package path. */
export function parseApps(
  manifest: Record<string, unknown>,
  pluginId: string,
  hasRuntime: boolean,
  fileExists: (rel: string) => boolean,
): ParsedApps {
  const warnings: string[] = [];
  const rawLifecycle = manifest.lifecycle ?? "always";
  if (rawLifecycle !== "always" && rawLifecycle !== "app") {
    throw new Error(`manifest 'lifecycle' must be "always" or "app"`);
  }
  const lifecycle: AppLifecycle = rawLifecycle;
  const rawApps = manifest.apps ?? [];
  if (!Array.isArray(rawApps)) throw new Error("manifest 'apps' must be a list");
  if (rawApps.length && !hasRuntime) throw new Error("manifest 'apps' needs a runtime part ('entry')");
  if (lifecycle === "app" && !rawApps.length) throw new Error(`lifecycle "app" needs at least one entry in 'apps'`);

  const apps: AppSpec[] = [];
  const ids = new Set<string>();
  rawApps.forEach((item, i) => {
    const raw = record(item);
    if (!raw) throw new Error(`apps[${i}] must be an object`);
    const appId = typeof raw.id === "string" ? raw.id : "";
    if (!ID_RE.test(appId)) throw new Error(`apps[${i}].id must be 1-32 lowercase letters, digits, '_' or '-'`);
    if (ids.has(appId)) throw new Error(`apps: the id '${appId}' is used twice`);
    ids.add(appId);
    const where = `apps '${appId}'`;

    const views: Record<string, AppViewSpec> = { [MAIN_VIEW]: viewSpec(MAIN_VIEW, raw, where, fileExists) };
    const rawViews = raw.views === undefined ? {} : record(raw.views);
    if (!rawViews) throw new Error(`${where}: 'views' must be an object`);
    for (const [key, value] of Object.entries(rawViews)) {
      if (!ID_RE.test(key) || key === MAIN_VIEW) throw new Error(`${where}: view key '${key}' is not allowed`);
      const v = record(value);
      if (!v) throw new Error(`${where}: views.${key} must be an object`);
      views[key] = viewSpec(key, v, `${where} view '${key}'`, fileExists);
    }

    let icon = packagePath(raw.icon);
    if (raw.icon !== undefined && (!icon || !ICON_RE.test(icon) || !fileExists(icon))) {
      warnings.push(`${where}: icon '${String(raw.icon)}' is not an svg, png, webp or jpg file in the package - no icon`);
      icon = null;
    }

    let hotkey: string | null = null;
    if (raw.hotkey !== undefined) {
      try {
        const { mods, key } = HotkeyRegistry.parse(String(raw.hotkey));
        hotkey = [...mods, key].join("+");
      } catch {
        warnings.push(`${where}: hotkey '${String(raw.hotkey)}' is not a key combination - no launch hotkey`);
      }
    }

    const win = record(raw.window) ?? {};
    const keywords = Array.isArray(raw.keywords)
      ? [...new Set(raw.keywords.map((k) => String(k).trim().toLowerCase()).filter(Boolean))].slice(0, MAX_KEYWORDS)
      : [];

    apps.push({
      key: `${pluginId}:${appId}`,
      pluginId,
      appId,
      name: typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : appId,
      icon,
      keywords,
      instances: win.instances === "multi" ? "multi" : "single",
      hotkey,
      views,
    });
  });
  return { lifecycle, apps, warnings };
}
