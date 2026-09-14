/**
 * Per-plugin config
 *
 * per-plugin `fuse_<plugin_id>.json`, host `fuse_host.json`,
 * both under `data/configs/` (or `FUSE_DATA_DIR/configs`), JSON indent 2.
 */
import fs from "node:fs";
import path from "node:path";
import { logger, type Logger } from "../log.js";
import { resolveConfig } from "../utils/paths.js";
import { isLegacyCategory, sectionControls, type ConfigSchemaItem } from "../sdk/configSchema.js";
import { coerceValue, controlKeys, isValueControl, type InspectorControl } from "../sdk/inspector.js";

type Json = unknown;
type Constraint = { type: "int" | "float"; min?: number; max?: number };
type Watcher = (value: Json) => void;
type ActionHandler = (controlId: string, payload?: unknown) => void;

const MISSING = Symbol("missing");

export class PluginConfig {
  private _path: string;
  private _data: Record<string, Json> = {};
  private _defaults: Record<string, Json> = {};
  private _watchers = new Map<string, Watcher[]>();
  private _changeListeners: Array<(key: string, value: Json) => void> = [];
  private _log: Logger;
  private _constraints = new Map<string, Constraint>();
  private _mtimeMs = 0;
  private _nextMtimeCheck = 0;

  /** Value controls by the config key they write, from the schema's sections. */
  private _controls = new Map<string, InspectorControl>();
  /** Button, button-row and row-button ids the schema declares. */
  private _actionIds = new Set<string>();
  private _actionHandler: ActionHandler | null = null;

  loaded = false;
  schemaCategories: ConfigSchemaItem[] | null = null;

  constructor(name: string) {
    this._path = resolveConfig(`fuse_${name}.json`);
    fs.mkdirSync(path.dirname(this._path), { recursive: true });
    this._log = logger.bind(name);
  }

  // --- Defaults -----------------------------------------------------------

  defaults(dict: Record<string, Json>): this {
    Object.assign(this._defaults, dict);
    this._log.debug(`Config: defaults registered (${Object.keys(this._defaults).join(", ")})`);
    return this;
  }

  /** Defaults registered so far. */
  defaultsSnapshot(): Record<string, Json> {
    return { ...this._defaults };
  }

  // --- Schema -------------------------------------------------------------

  /** Pass the same sections given to `ov.inspector.sections()`; legacy categories still work. */
  schema(items: ConfigSchemaItem[]): this {
    this.schemaCategories = items;
    this._constraints.clear();
    this._controls.clear();
    this._actionIds.clear();
    for (const item of items) {
      if (isLegacyCategory(item)) {
        for (const entry of item.entries) {
          if ((entry.type === "int" || entry.type === "float") && (entry.min != null || entry.max != null)) {
            this._constraints.set(entry.key, { type: entry.type, min: entry.min, max: entry.max });
          }
        }
        continue;
      }
      for (const control of sectionControls(item)) {
        if (control.type === "button") {
          this._actionIds.add(control.id);
        } else if (control.type === "buttonRow") {
          this._actionIds.add(control.id);
          for (const b of control.buttons) if (b.id) this._actionIds.add(b.id);
        } else if (isValueControl(control)) {
          for (const key of controlKeys(control)) this._controls.set(key, control);
        }
      }
    }
    return this;
  }

  // --- Load / save --------------------------------------------------------

  load(): this {
    let onDisk: Record<string, Json> = {};
    let fromDisk = false;
    if (fs.existsSync(this._path)) {
      try {
        onDisk = JSON.parse(fs.readFileSync(this._path, "utf-8"));
        fromDisk = true;
      } catch (e) {
        this._log.warning(`Config: could not read ${this._path}: ${String(e)}`);
      }
    }
    this._data = { ...this._defaults, ...onDisk };
    this.loaded = true;
    try {
      this._mtimeMs = fs.existsSync(this._path) ? fs.statSync(this._path).mtimeMs : 0;
    } catch {
      this._mtimeMs = 0;
    }
    this._log.debug(
      fromDisk
        ? `Config loaded from ${this._path} (${Object.keys(onDisk).length} disk key(s))`
        : `Config: no file at ${this._path} - using ${Object.keys(this._defaults).length} default(s)`,
    );
    return this;
  }

  /** The file's contents without defaults; empty when there is no readable file. */
  readDisk(): Record<string, Json> {
    try {
      return fs.existsSync(this._path) ? (JSON.parse(fs.readFileSync(this._path, "utf-8")) as Record<string, Json>) : {};
    } catch {
      return {};
    }
  }

  save(): void {
    try {
      fs.writeFileSync(this._path, JSON.stringify(this._data, null, 2));
    } catch (e) {
      this._log.warning(`Config: could not save ${this._path}: ${String(e)}`);
    }
  }

  reload(): void {
    const old = { ...this._data };
    this.load();
    const changed = Object.keys(this._data).filter((k) => !deepEq(old[k], this._data[k]));
    for (const key of changed) this._notify(key, this._data[key]);
  }

  /** Poll file mtime (≤1×/sec); reload + fire watchers if changed on disk. */
  checkReload(): boolean {
    const now = performance.now() / 1000;
    if (now < this._nextMtimeCheck) return false;
    this._nextMtimeCheck = now + 1.0;
    let mtime: number;
    try {
      mtime = fs.statSync(this._path).mtimeMs;
    } catch {
      return false;
    }
    if (mtime === this._mtimeMs) return false;
    this._mtimeMs = mtime;
    this.reload();
    return true;
  }

  // --- Read / write -------------------------------------------------------

  get<T = Json>(key: string, def: T | typeof MISSING = MISSING): T {
    if (key in this._data) return this._data[key] as T;
    if (def !== MISSING) return def;
    throw new Error(`PluginConfig: key '${key}' not found and no default given`);
  }

  has(key: string): boolean {
    return key in this._data;
  }

  /**
   * Check a write from outside the plugin (the App panel) against the control
   * that owns the key - the same rules the stage inspector applies. Keys no
   * section declares keep the legacy clamp-only path.
   */
  accept(key: string, raw: Json): { ok: true; value: Json } | { ok: false } {
    const control = this._controls.get(key);
    if (!control) return { ok: true, value: raw };
    if (control.type === "vec2" && control.keys) {
      // A two-key vec2 is written one key at a time, so each arrives as a number.
      const n = typeof raw === "number" ? raw : Number.parseFloat(String(raw));
      if (!Number.isFinite(n)) return { ok: false };
      let v = n;
      if (control.min != null) v = Math.max(control.min, v);
      if (control.max != null) v = Math.min(control.max, v);
      return { ok: true, value: v };
    }
    return coerceValue(control, raw);
  }

  // --- Actions ------------------------------------------------------------

  /** Button presses from the App panel, and from the stage when the overlay has no handler of its own. */
  onAction(cb: ActionHandler): void {
    this._actionHandler = cb;
  }

  /** Hand a press to the plugin; false when it registered no handler. */
  runAction(controlId: string, payload?: unknown): boolean {
    if (!this._actionHandler) return false;
    try {
      this._actionHandler(controlId, payload);
    } catch (e) {
      this._log.exception(`Config: onAction handler raised for '${controlId}'`, e);
    }
    return true;
  }

  /** A press from the App panel: only ids the schema declares as buttons get through. */
  dispatchAction(controlId: string, payload?: unknown): boolean {
    if (!this._actionIds.has(controlId)) return false;
    return this.runAction(controlId, payload);
  }

  private clamp(key: string, value: Json): Json {
    const c = this._constraints.get(key);
    if (!c) return value;
    let v = c.type === "int" ? Number.parseInt(String(value), 10) : Number.parseFloat(String(value));
    if (Number.isNaN(v)) return value;
    if (c.min != null) v = Math.max(c.min, v);
    if (c.max != null) v = Math.min(c.max, v);
    return v;
  }

  set(key: string, value: Json): void {
    value = this.clamp(key, value);
    const had = key in this._data;
    const old = this._data[key];
    this._data[key] = value;
    this.save();
    if (!had || !deepEq(old, value)) this._notify(key, value);
  }

  /**
   * In-memory write that fires watchers without touching disk - the live half of
   * an inspector drag, where `set` would rewrite the config file every frame.
   * The matching `set` on pointer-up is what persists.
   */
  setLive(key: string, value: Json): void {
    value = this.clamp(key, value);
    const had = key in this._data;
    const old = this._data[key];
    this._data[key] = value;
    if (!had || !deepEq(old, value)) this._notify(key, value);
  }

  update(data: Record<string, Json>): void {
    const changed: Record<string, Json> = {};
    for (const [key, raw] of Object.entries(data)) {
      const value = this.clamp(key, raw);
      const had = key in this._data;
      const old = this._data[key];
      this._data[key] = value;
      if (!had || !deepEq(old, value)) changed[key] = value;
    }
    this.save();
    for (const [key, value] of Object.entries(changed)) this._notify(key, value);
  }

  snapshot(): Record<string, Json> {
    return { ...this._data };
  }

  // --- Watch --------------------------------------------------------------

  watch(key: string, callback: Watcher): void {
    const list = this._watchers.get(key) ?? [];
    list.push(callback);
    this._watchers.set(key, list);
  }

  /** Every key change, however it happened: a set, a reload, an edit to the file. */
  onAnyChange(cb: (key: string, value: Json) => void): void {
    this._changeListeners.push(cb);
  }

  private _notify(key: string, value: Json): void {
    for (const cb of this._watchers.get(key) ?? []) {
      try {
        cb(value);
      } catch (e) {
        this._log.exception(`Config: watcher for '${key}' raised`, e);
      }
    }
    for (const cb of this._changeListeners) {
      try {
        cb(key, value);
      } catch (e) {
        this._log.exception(`Config: change listener for '${key}' raised`, e);
      }
    }
  }

  get configPath(): string {
    return this._path;
  }
}

function deepEq(a: Json, b: Json): boolean {
  if (a === b) return true;
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Legacy host-level config manager - port of `ConfigManager`. Used for
 * `fuse_host.json` (enabled_plugins / disabled_plugins / hotkey_overrides).
 */
export class ConfigManager {
  readonly configPath: string;
  //TO-DO: wrong filename
  constructor(filename = "heat_ailos_torc.json") {
    this.configPath = resolveConfig(filename);
    fs.mkdirSync(path.dirname(this.configPath), { recursive: true });
  }

  load<T extends Record<string, Json>>(defaults?: T): T {
    const config: Record<string, Json> = defaults ? { ...defaults } : {};
    if (!fs.existsSync(this.configPath)) return config as T;
    try {
      Object.assign(config, JSON.parse(fs.readFileSync(this.configPath, "utf-8")));
    } catch (e) {
      logger.warning(`Could not load config: ${String(e)}`);
    }
    return config as T;
  }

  save(config: Record<string, Json>): void {
    try {
      fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
    } catch (e) {
      logger.warning(`Could not save config: ${String(e)}`);
    }
  }
}
