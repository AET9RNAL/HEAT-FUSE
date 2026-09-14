import type { ConfigSchemaItem } from "./configSchema.js";

/**
 * A plugin's config. Reads are local; writes go to the runtime, which persists
 * them to `fuse_<plugin_id>.json` and keeps the App and the stage in sync.
 */
export interface PluginConfigApi {
  readonly loaded: boolean;
  readonly configPath: string;
  defaults(dict: Record<string, unknown>): this;
  /** Pass the same sections given to `ov.inspector.sections()`; legacy categories still work. */
  schema(items: ConfigSchemaItem[]): this;
  load(): this;
  save(): void;
  reload(): void;
  /** Kept for compatibility: the runtime watches the file and pushes changes. */
  checkReload(): boolean;
  get<T = unknown>(key: string, def?: T): T;
  has(key: string): boolean;
  set(key: string, value: unknown): void;
  /** Applied and announced without writing the file, for drags in flight. */
  setLive(key: string, value: unknown): void;
  update(data: Record<string, unknown>): void;
  snapshot(): Record<string, unknown>;
  watch(key: string, callback: (value: unknown) => void): void;
  /** Button presses from the App panel, and from the stage when the overlay has no handler of its own. */
  onAction(cb: (controlId: string, payload?: unknown) => void): void;
}
