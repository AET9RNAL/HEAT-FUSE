/**
 * A plugin's private database, kept by the runtime in its own SQLite file.
 * Needs the `storage` permission. Documents are JSON; ids are strings.
 */
export type StorageOp = "==" | "!=" | "<" | "<=" | ">" | ">=" | "in";

/** `[field, op, value]`; `field` may be dotted (`"player.name"`). Values: string, number, boolean or null. */
export type StorageWhere = [field: string, op: StorageOp, value: unknown];

export interface StorageQuery {
  where?: StorageWhere[];
  orderBy?: [field: string, direction?: "asc" | "desc"];
  /** Defaults to and is capped at 1000. */
  limit?: number;
  offset?: number;
}

export interface StorageCollection<T = Record<string, unknown>> {
  get(id: string): Promise<T | undefined>;
  put(id: string, value: T): Promise<void>;
  /** Shallow-merges into an existing object document; false when there isn't one. */
  update(id: string, patch: Partial<T>): Promise<boolean>;
  delete(id: string): Promise<boolean>;
  query(query?: StorageQuery): Promise<Array<{ id: string; value: T }>>;
  count(query?: Pick<StorageQuery, "where">): Promise<number>;
  clear(): Promise<void>;
}

export interface PluginStorage {
  /** Collection names: 1-64 letters, digits, `_`, `.` or `-`. */
  collection<T = Record<string, unknown>>(name: string): StorageCollection<T>;
}
