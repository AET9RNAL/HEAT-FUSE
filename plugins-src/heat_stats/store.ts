import type { FuseContext, StorageCollection } from "@fuse/plugin-sdk";
import type { Sample } from "./session.js";

/**
 * pending: waiting to upload, or waiting for an account.
 * uploaded: the service has it. It is never sent again.
 * rejected: a duplicate, or it failed the server's checks. A retry fails the same way, so none is made.
 */
export type SyncState = "pending" | "uploaded" | "rejected";

export interface StoredMatch {
  /** Exactly what the upload function takes, minus the samples. */
  payload: Record<string, unknown>;
  sync: SyncState;
  /** The service's id, after it accepts the match. */
  remote_id: string | null;
  reason: string | null;
  attempts: number;
  started_at: string;
  updated_at: string;
}

interface StoredSamples {
  samples: Sample[];
}

/** A mirrored row, stored under the service's own id. */
export type CloudMatch = Record<string, unknown>;

/** How far the mirror got. A different `user_id` clears the mirror, so two players' histories never mix. */
export interface CloudCursor {
  user_id: string;
  /** Newest `created_at` pulled so far. The next pull asks for rows after it. */
  newest: string | null;
  /**
   * The row that `newest` belongs to. A bulk import gives a whole transaction one timestamp,
   * and a strict "later than" drops every other row with that timestamp.
   */
  newest_id: string | null;
  /** False until the first full pass finishes, so an interrupted backfill resumes. */
  complete: boolean;
  updated_at: string;
}

/** One upload's worth of work. */
export interface PendingUpload {
  id: string;
  payload: Record<string, unknown>;
  samples: Sample[];
}

export interface StoreCounts {
  total: number;
  pending: number;
  uploaded: number;
  rejected: number;
}

const RECENT_LIMIT = 200;
const QUERY_PAGE = 1000;
const MAX_ROWS = 20_000;
const CURSOR_ID = "cloud";

export class MatchStore {
  private readonly matches: StorageCollection<StoredMatch>;
  private readonly samples: StorageCollection<StoredSamples>;
  private readonly cloud: StorageCollection<CloudMatch>;
  private readonly meta: StorageCollection<CloudCursor>;

  constructor(private readonly ctx: FuseContext) {
    this.matches = ctx.storage.collection<StoredMatch>("matches");
    this.samples = ctx.storage.collection<StoredSamples>("samples");
    this.cloud = ctx.storage.collection<CloudMatch>("cloud");
    this.meta = ctx.storage.collection<CloudCursor>("meta");
  }

  // ── This PC's recordings ──────────────────────────────────────────

  /**
   * Keeps a finished battle, keyed by session_id. A second write of the same battle replaces it and
   * does not queue it twice. Only a pending match is replaced. An uploaded match never changes.
   */
  async record(payload: Record<string, unknown>, samples: Sample[]): Promise<void> {
    const id = String(payload.session_id ?? "");
    if (!id) {
      this.ctx.logger.warning("heat_stats: a finished battle had no session_id - not stored");
      return;
    }

    const existing = await this.matches.get(id);
    if (existing && existing.sync !== "pending") {
      this.ctx.logger.info(`heat_stats: battle ${id} is already ${existing.sync} - left alone`);
      return;
    }

    const startedAt = typeof payload.started_at === "number" ? payload.started_at * 1000 : Date.now();
    await this.matches.put(id, {
      payload,
      sync: "pending",
      remote_id: null,
      reason: null,
      attempts: existing?.attempts ?? 0,
      started_at: new Date(startedAt).toISOString(),
      updated_at: new Date().toISOString(),
    });
    await this.samples.put(id, { samples });
  }

  /** The next matches to upload. Oldest first, so the history fills in order. */
  async pending(limit = 20): Promise<PendingUpload[]> {
    const rows = await this.matches.query({
      where: [["sync", "==", "pending"]],
      orderBy: ["started_at", "asc"],
      limit,
    });
    const out: PendingUpload[] = [];
    for (const row of rows) {
      const samples = await this.samples.get(row.id);
      out.push({ id: row.id, payload: row.value.payload, samples: samples?.samples ?? [] });
    }
    return out;
  }

  async markUploaded(id: string, remoteId: string | null): Promise<void> {
    await this.matches.update(id, {
      sync: "uploaded",
      remote_id: remoteId,
      reason: null,
      updated_at: new Date().toISOString(),
    });
  }

  /** Refused for good. The queue never offers it again. */
  async markRejected(id: string, reason: string): Promise<void> {
    await this.matches.update(id, {
      sync: "rejected",
      reason,
      updated_at: new Date().toISOString(),
    });
    this.ctx.logger.warning(`heat_stats: battle ${id} refused - ${reason}`);
  }

  /** A temporary failure. The match stays in the queue. */
  async markFailed(id: string, reason: string): Promise<void> {
    const existing = await this.matches.get(id);
    await this.matches.update(id, {
      reason,
      attempts: (existing?.attempts ?? 0) + 1,
      updated_at: new Date().toISOString(),
    });
  }

  /** Queues every refused match again. Use it only after the cause of the refusal is fixed. */
  async retryRejected(): Promise<number> {
    const rows = await this.matches.query({ where: [["sync", "==", "rejected"]], limit: QUERY_PAGE });
    for (const row of rows) {
      await this.matches.update(row.id, { sync: "pending", reason: null, updated_at: new Date().toISOString() });
    }
    return rows.length;
  }

  /** Newest first, for the window when there is no account to read from. */
  async recent(limit = RECENT_LIMIT): Promise<StoredMatch[]> {
    const rows = await this.matches.query({ orderBy: ["started_at", "desc"], limit });
    return rows.map((r) => r.value);
  }

  /** Every local recording, newest first. */
  async localAll(): Promise<Record<string, unknown>[]> {
    const rows = await this.readAll(this.matches);
    return rows
      .map((r) => r.value.payload)
      .sort((a, b) => this.startedMs(b) - this.startedMs(a));
  }

  async samplesFor(id: string): Promise<Sample[] | null> {
    const row = await this.samples.get(id);
    return row?.samples ?? null;
  }

  async counts(): Promise<StoreCounts> {
    const [total, pending, uploaded, rejected] = await Promise.all([
      this.matches.count(),
      this.matches.count({ where: [["sync", "==", "pending"]] }),
      this.matches.count({ where: [["sync", "==", "uploaded"]] }),
      this.matches.count({ where: [["sync", "==", "rejected"]] }),
    ]);
    return { total, pending, uploaded, rejected };
  }

  // ── The account's mirror ──────────────────────────────────────────

  /** The cursor for this user. A cursor of another user means the mirror is theirs, so it is cleared, not read. */
  async cursor(userId: string): Promise<CloudCursor> {
    const stored = await this.meta.get(CURSOR_ID);
    // An older cursor has no `newest_id`. The pull then reads that timestamp again and skips the strict comparison.
    if (stored && stored.user_id === userId) return { ...stored, newest_id: stored.newest_id ?? null };
    if (stored) {
      this.ctx.logger.info("heat_stats: mirror belongs to another account - clearing it");
      await this.cloud.clear();
    }
    return { user_id: userId, newest: null, newest_id: null, complete: false, updated_at: new Date().toISOString() };
  }

  async setCursor(next: CloudCursor): Promise<void> {
    await this.meta.put(CURSOR_ID, { ...next, updated_at: new Date().toISOString() });
  }

  /** Stores a page of mirrored rows. A replaced row is the same row, because the service never changes a match. */
  async mirror(rows: CloudMatch[]): Promise<number> {
    let written = 0;
    for (const row of rows) {
      const id = String(row.id ?? row.session_id ?? "");
      if (!id) continue;
      await this.cloud.put(id, row);
      written++;
    }
    return written;
  }

  async cloudAll(): Promise<CloudMatch[]> {
    const rows = await this.readAll(this.cloud);
    return rows.map((r) => r.value).sort((a, b) => this.startedMs(b) - this.startedMs(a));
  }

  async cloudCount(): Promise<number> {
    return this.cloud.count();
  }


  async everything(): Promise<Record<string, unknown>[]> {
    const [cloud, local] = await Promise.all([this.cloudAll(), this.localAll()]);
    const seen = new Set<string>();
    const out: Record<string, unknown>[] = [];
    for (const row of [...cloud, ...local]) {
      const id = String(row.session_id ?? row.id ?? "");
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push(row);
    }
    return out.sort((a, b) => this.startedMs(b) - this.startedMs(a));
  }

  /** A sign-out keeps the mirror. A different account replaces it. */
  async clearCloud(): Promise<void> {
    await this.cloud.clear();
    await this.meta.delete(CURSOR_ID);
  }

  // ── Shared ────────────────────────────────────────────────────────

  private startedMs(row: Record<string, unknown>): number {
    const raw = row.started_at;
    if (typeof raw === "number") return raw * 1000;
    const parsed = Date.parse(String(raw ?? ""));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  /** Reads a full collection, one `query` page at a time. */
  private async readAll<T>(collection: StorageCollection<T>): Promise<Array<{ id: string; value: T }>> {
    const out: Array<{ id: string; value: T }> = [];
    while (out.length < MAX_ROWS) {
      const page = await collection.query({ limit: QUERY_PAGE, offset: out.length });
      out.push(...page);
      if (page.length < QUERY_PAGE) break;
    }
    return out;
  }
}
