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
import type { ConfigCategory } from "../sdk/configSchema.js";

type Json = unknown;
type Constraint = { type: "int" | "float"; min?: number; max?: number };
type Watcher = (value: Json) => void;

const MISSING = Symbol("missing");

export class PluginConfig {
  private _path: string;
  private _data: Record<string, Json> = {};
  private _defaults: Record<string, Json> = {};
  private _watchers = new Map<string, Watcher[]>();
  private _log: Logger;
  private _constraints = new Map<string, Constraint>();
  private _mtimeMs = 0;
  private _nextMtimeCheck = 0;

  loaded = false;
  schemaCategories: ConfigCategory[] | null = null;

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

  // --- Schema -------------------------------------------------------------

  schema(categories: ConfigCategory[]): this {
    this.schemaCategories = categories;
    this._constraints.clear();
    for (const cat of categories) {
      for (const entry of cat.entries) {
        if ((entry.type === "int" || entry.type === "float") && (entry.min != null || entry.max != null)) {
          this._constraints.set(entry.key, { type: entry.type, min: entry.min, max: entry.max });
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

  private _notify(key: string, value: Json): void {
    for (const cb of this._watchers.get(key) ?? []) {
      try {
        cb(value);
      } catch (e) {
        this._log.exception(`Config: watcher for '${key}' raised`, e);
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
