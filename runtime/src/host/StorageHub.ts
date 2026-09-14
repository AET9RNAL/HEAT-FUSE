/**
 * Plugin storage: one SQLite file per plugin under `data/storage/`. Plugins see
 * collections of JSON documents; the host checks `storage` before every call.
 */
import fs from "node:fs";
import path from "node:path";
import type * as Sqlite from "node:sqlite";
import { logger } from "../log.js";
import { DATA_DIR } from "../utils/paths.js";

const STORAGE_DIR = path.join(DATA_DIR, "storage");
const MAX_DB_BYTES = 50 * 1024 * 1024;
const MAX_DOC_BYTES = 1024 * 1024;
const MAX_ROWS = 1000;
const MAX_ID_LENGTH = 256;
const COLLECTION_RE = /^[A-Za-z0-9_.-]{1,64}$/;
const FIELD_RE = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/;
const COMPARE: Record<string, string> = { "==": "=", "!=": "!=", "<": "<", "<=": "<=", ">": ">", ">=": ">=" };

type SqlValue = null | number | string;

let sqliteModule: Promise<typeof Sqlite | null> | null = null;

function loadSqlite(): Promise<typeof Sqlite | null> {
  sqliteModule ??= import("node:sqlite").catch((e: unknown) => {
    logger.error(`storage: node:sqlite isn't available on Node ${process.versions.node} (${String(e)})`);
    return null;
  });
  return sqliteModule;
}

export class StorageHub {
  private dbs = new Map<string, Promise<Sqlite.DatabaseSync>>();

  async handle(pluginId: string, op: string, collection: string, args: unknown[]): Promise<unknown> {
    if (!COLLECTION_RE.test(collection)) {
      throw new Error(`collection names are 1-64 letters, digits, '_', '.' or '-' (got '${collection}')`);
    }
    const db = await this.open(pluginId);
    switch (op) {
      case "get": {
        const row = db.prepare("SELECT data FROM docs WHERE collection = ? AND id = ?").get(collection, docId(args[0]));
        return row ? (JSON.parse(String(row.data)) as unknown) : undefined;
      }
      case "put": {
        const data = encode(args[1]);
        this.ensureRoom(db, data);
        db.prepare(
          "INSERT INTO docs (collection, id, data, updated_at) VALUES (?, ?, ?, ?) " +
            "ON CONFLICT (collection, id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at",
        ).run(collection, docId(args[0]), data, Date.now());
        return undefined;
      }
      case "update": {
        const id = docId(args[0]);
        const row = db.prepare("SELECT data FROM docs WHERE collection = ? AND id = ?").get(collection, id);
        if (!row) return false;
        const current = JSON.parse(String(row.data)) as unknown;
        if (!isPlainObject(current) || !isPlainObject(args[1])) {
          throw new Error("update needs an object document and an object patch");
        }
        const data = encode({ ...current, ...args[1] });
        this.ensureRoom(db, data);
        db.prepare("UPDATE docs SET data = ?, updated_at = ? WHERE collection = ? AND id = ?").run(data, Date.now(), collection, id);
        return true;
      }
      case "delete":
        return Number(db.prepare("DELETE FROM docs WHERE collection = ? AND id = ?").run(collection, docId(args[0])).changes) > 0;
      case "query": {
        const { sql, params } = buildQuery(collection, asRecord(args[0]), "SELECT id, data FROM docs", true);
        return db
          .prepare(sql)
          .all(...params)
          .map((row) => ({ id: String(row.id), value: JSON.parse(String(row.data)) as unknown }));
      }
      case "count": {
        const { sql, params } = buildQuery(collection, asRecord(args[0]), "SELECT COUNT(*) AS n FROM docs", false);
        return Number(db.prepare(sql).get(...params)?.n ?? 0);
      }
      case "clear":
        db.prepare("DELETE FROM docs WHERE collection = ?").run(collection);
        return undefined;
      default:
        throw new Error(`unknown storage operation '${op}'`);
    }
  }

  /** The plugin stopped; its file stays on disk. */
  close(pluginId: string): void {
    const pending = this.dbs.get(pluginId);
    if (!pending) return;
    this.dbs.delete(pluginId);
    void pending.then(
      (db) => {
        try {
          db.close();
        } catch {
          /* already closed */
        }
      },
      () => {},
    );
  }

  closeAll(): void {
    for (const pluginId of [...this.dbs.keys()]) this.close(pluginId);
  }

  private open(pluginId: string): Promise<Sqlite.DatabaseSync> {
    let pending = this.dbs.get(pluginId);
    if (!pending) {
      pending = loadSqlite().then((mod) => {
        if (!mod) throw new Error("storage isn't available in this runtime");
        fs.mkdirSync(STORAGE_DIR, { recursive: true });
        const db = new mod.DatabaseSync(path.join(STORAGE_DIR, `${encodeURIComponent(pluginId)}.db`));
        db.exec(
          "PRAGMA journal_mode = WAL;" +
            "CREATE TABLE IF NOT EXISTS docs (collection TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, " +
            "updated_at INTEGER NOT NULL, PRIMARY KEY (collection, id)) WITHOUT ROWID;",
        );
        return db;
      });
      pending.catch(() => this.dbs.delete(pluginId));
      this.dbs.set(pluginId, pending);
    }
    return pending;
  }

  private ensureRoom(db: Sqlite.DatabaseSync, data: string): void {
    const bytes = Buffer.byteLength(data, "utf8");
    if (bytes > MAX_DOC_BYTES) throw new Error(`the document is ${bytes} bytes; the limit is ${MAX_DOC_BYTES}`);
    const pages = Number(db.prepare("PRAGMA page_count").get()?.page_count ?? 0);
    const pageSize = Number(db.prepare("PRAGMA page_size").get()?.page_size ?? 4096);
    if (pages * pageSize + bytes > MAX_DB_BYTES) {
      throw new Error(`storage is full (${MAX_DB_BYTES / (1024 * 1024)} MB per plugin)`);
    }
  }
}

function buildQuery(
  collection: string,
  query: Record<string, unknown>,
  select: string,
  paged: boolean,
): { sql: string; params: SqlValue[] } {
  const params: SqlValue[] = [collection];
  let sql = `${select} WHERE collection = ?`;
  for (const clause of Array.isArray(query.where) ? query.where : []) {
    if (!Array.isArray(clause) || clause.length !== 3) throw new Error("each where clause is [field, op, value]");
    const [field, op, value] = clause as [unknown, unknown, unknown];
    const pathArg = jsonPath(field);
    if (op === "in") {
      if (!Array.isArray(value) || !value.length) throw new Error("'in' needs a non-empty array");
      sql += ` AND json_extract(data, ?) IN (${value.map(() => "?").join(", ")})`;
      params.push(pathArg, ...value.map(sqlValue));
    } else if (typeof op === "string" && COMPARE[op]) {
      if (value === null && (op === "==" || op === "!=")) {
        sql += ` AND json_extract(data, ?) IS ${op === "==" ? "" : "NOT "}NULL`;
        params.push(pathArg);
      } else {
        sql += ` AND json_extract(data, ?) ${COMPARE[op]} ?`;
        params.push(pathArg, sqlValue(value));
      }
    } else {
      throw new Error(`unsupported operator '${String(op)}'`);
    }
  }
  if (!paged) return { sql, params };
  if (Array.isArray(query.orderBy) && query.orderBy.length) {
    const [field, direction] = query.orderBy as [unknown, unknown];
    sql += ` ORDER BY json_extract(data, ?) ${direction === "desc" ? "DESC" : "ASC"}`;
    params.push(jsonPath(field));
  }
  sql += " LIMIT ? OFFSET ?";
  params.push(clampInt(query.limit, 1, MAX_ROWS, MAX_ROWS), clampInt(query.offset, 0, Number.MAX_SAFE_INTEGER, 0));
  return { sql, params };
}

function jsonPath(field: unknown): string {
  if (typeof field !== "string" || !FIELD_RE.test(field)) {
    throw new Error(`fields are letters, digits and '_', dotted for nesting (got '${String(field)}')`);
  }
  return `$.${field}`;
}

/** JSON booleans come out of json_extract as 1 and 0. */
function sqlValue(value: unknown): SqlValue {
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value === null || typeof value === "string" || (typeof value === "number" && Number.isFinite(value))) return value;
  throw new Error("query values are strings, finite numbers, booleans or null");
}

function docId(value: unknown): string {
  if (typeof value !== "string" || !value || value.length > MAX_ID_LENGTH) {
    throw new Error(`document ids are strings of 1-${MAX_ID_LENGTH} characters`);
  }
  return value;
}

function encode(value: unknown): string {
  const text = JSON.stringify(value);
  if (text === undefined) throw new Error("documents must be JSON values");
  return text;
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : fallback;
  return Math.min(max, Math.max(min, n));
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function asRecord(v: unknown): Record<string, unknown> {
  return isPlainObject(v) ? v : {};
}
