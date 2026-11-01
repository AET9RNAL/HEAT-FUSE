/** Keeps the account and this PC in step: settings and tags both ways, matches up, and the account's history down. */
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import type { FuseContext } from "@fuse/plugin-sdk";
import type { MatchStore } from "./store.js";
import type { TagRecord, TagStore } from "./tags.js";

/** The config keys that follow the account, each with its `user_profiles` column. */
const REGISTRY: ReadonlyArray<{ key: string; column: string; fallback: unknown }> = [
  { key: "locale", column: "hs_locale", fallback: "" },
  { key: "player_name", column: "hs_player_name", fallback: "" },
  { key: "streak_length", column: "hs_streak_length", fallback: 75 },
  { key: "hide_in_battle", column: "hs_hide_in_battle", fallback: false },
  { key: "window_open", column: "hs_window_open", fallback: true },
];

/** The columns the mirror keeps. A new match_sessions column reaches the window only after you add it here. */
const MIRROR_COLUMNS = [
  "id", "session_id", "user_id", "created_at", "started_at", "ended_at", "duration_s", "outcome", "roster", "loadouts",
  "map_slug", "map_name", "game_mode", "play_mode", "play_mode_slug",
  "player_name", "player_vehicle", "player_role", "player_agent_id",
  "player_id", "battle_id",
  "final_kills", "final_deaths", "final_assists", "final_damage", "final_confirms", "final_denies",
  "final_score", "final_ally_score", "final_enemy_score",
  "final_place", "player_vehicle_level", "final_xp_vehicle", "final_xp_agent", "entitlements",
  "p_hits_done", "p_shoot_done", "p_crit_hits_done", "p_shell_hits_damage", "p_ability_damage_done",
  "p_blocked_damage", "p_ramming_damage", "p_damage_taken", "p_heal",
  "currency_credits", "currency_tech", "currency_intel",
  "ally_kills", "ally_deaths", "ally_damage", "enemy_kills", "enemy_deaths", "enemy_damage",
].join(",");

const SAVE_DEBOUNCE_MS = 800;
const DRAIN_EVERY_MS = 60_000;
const RATE_LIMIT_BACKOFF_MS = 120_000;
const DRAIN_BATCH = 10;
/** Rows per mirror request. */
const PULL_PAGE = 500;
/** Marks per drain. */
const TAG_BATCH = 50;
/** The most marks one account reads. */
const TAG_PULL_LIMIT = 2000;
/** Stops a runaway backfill. A longer history continues at the next launch. */
const MAX_PULL_PAGES = 60;

export interface SyncProgress {
  phase: "idle" | "checking" | "syncing" | "uploading" | "offline" | "error";
  /** down: the account's history coming in. up: this PC's queue going out. */
  direction: "down" | "up" | null;
  /** Rows settled this run. */
  done: number;
  total: number | null;
  remote: number | null;
  message: string | null;
}

/** The profile fields the account screen edits. Read once, then kept. */
export interface ProfileView {
  username: string | null;
  allow_api_access: boolean;
}

const IDLE: SyncProgress = { phase: "idle", direction: null, done: 0, total: null, remote: null, message: null };

export interface SyncHooks {
  /** Something the window shows changed: queue counts, progress, or the profile. */
  onChange(): void;
  /** The mirror gained rows, so the window rebuilds what it shows. */
  onMatchesChanged(): void;
  /** The account's marks moved, so the window and the game both redraw. */
  onTagsChanged(): void;
}

export class Sync {
  private client: SupabaseClient | null = null;
  private userId: string | null = null;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private drainTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingColumns: Record<string, unknown> = {};
  /** Set while the server's values are being applied, so watches stay quiet. */
  private applying = false;
  private draining = false;
  private pulling = false;
  private pausedUntil = 0;
  private state: SyncProgress = IDLE;
  /** Read on sign-in and after an edit, never on a progress tick. */
  private profileCache: ProfileView | null = null;

  constructor(
    private readonly ctx: FuseContext,
    private readonly store: MatchStore,
    private readonly tags: TagStore,
    private readonly hooks: SyncHooks,
  ) {
    for (const entry of REGISTRY) {
      ctx.config.watch(entry.key, (value) => this.queueSave(entry.column, value));
    }
  }

  get progress(): SyncProgress {
    return this.state;
  }

  private setProgress(next: Partial<SyncProgress>): void {
    this.state = { ...this.state, ...next };
    this.hooks.onChange();
  }

  /** Called whenever the account signs in or out. */
  async onSession(session: Session | null, client: SupabaseClient): Promise<void> {
    this.client = session ? client : null;
    this.userId = session?.user.id ?? null;
    this.clearTimers();
    this.profileCache = null;

    if (!this.userId) {
      this.state = IDLE;
      this.hooks.onChange();
      return;
    }

    await this.ensureProfile();
    await this.loadSettings();
    await this.refreshProfile();
    await this.adoptTags();
    void this.pull();
    void this.pullTags();
    this.scheduleDrain(0);
  }

  /** Marks made before sign-in go to the account that signs in, as battles do. Marks of a different account are deleted. */
  private async adoptTags(): Promise<void> {
    const userId = this.userId;
    if (!userId) return;
    const owner = await this.tags.owner();
    if (owner && owner !== userId) await this.tags.clear();
    await this.tags.setOwner(userId);
  }

  /** A new match or a changed mark. The queue drains now, not on the timer. */
  nudge(): void {
    if (this.userId) this.scheduleDrain(0);
    this.hooks.onChange();
  }

  stop(): void {
    this.clearTimers();
  }

  private clearTimers(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    if (this.drainTimer) clearTimeout(this.drainTimer);
    this.saveTimer = null;
    this.drainTimer = null;
  }

  // ── Settings ──────────────────────────────────────────────────────

  private queueSave(column: string, value: unknown): void {
    if (this.applying || !this.userId) return;
    this.pendingColumns[column] = value;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => void this.flushSettings(), SAVE_DEBOUNCE_MS);
  }

  private async flushSettings(): Promise<void> {
    this.saveTimer = null;
    const columns = this.pendingColumns;
    this.pendingColumns = {};
    if (!this.client || !this.userId || !Object.keys(columns).length) return;

    const { error } = await this.client.from("user_profiles").update(columns).eq("user_id", this.userId);
    if (error) {
      // Put them back. The next change or sign-in tries again.
      this.pendingColumns = { ...columns, ...this.pendingColumns };
      this.ctx.logger.warning(`heat_stats: settings did not save: ${error.message}`);
    }
  }

  /** A new account has no profile row at its first sign-in. */
  private async ensureProfile(): Promise<void> {
    if (!this.client || !this.userId) return;
    const { error } = await this.client
      .from("user_profiles")
      .upsert({ user_id: this.userId }, { onConflict: "user_id", ignoreDuplicates: true });
    if (error) this.ctx.logger.warning(`heat_stats: could not prepare profile: ${error.message}`);
  }

  /** On sign-in, the account's settings win and this PC follows. */
  private async loadSettings(): Promise<void> {
    if (!this.client || !this.userId) return;
    const { data, error } = await this.client
      .from("user_profiles")
      .select("*")
      .eq("user_id", this.userId)
      .maybeSingle();

    if (error) {
      this.ctx.logger.warning(`heat_stats: could not load settings: ${error.message}`);
      return;
    }
    if (!data) return;

    this.applying = true;
    try {
      for (const entry of REGISTRY) {
        const value = (data as Record<string, unknown>)[entry.column];
        // A column the account has never set leaves this PC's choice alone.
        if (value !== null && value !== undefined) this.ctx.config.set(entry.key, value);
      }
    } finally {
      this.applying = false;
    }
    this.hooks.onChange();
  }

  /** What the account screen reads. It costs no request, because the profile is already held. */
  get profile(): ProfileView | null {
    return this.profileCache;
  }

  /** The one place that spends a request on the profile. */
  private async refreshProfile(): Promise<void> {
    if (!this.client || !this.userId) return;
    const { data } = await this.client
      .from("user_profiles")
      .select("username, allow_api_access")
      .eq("user_id", this.userId)
      .maybeSingle();
    this.profileCache = (data as ProfileView | null) ?? null;
    this.hooks.onChange();
  }

  async setUsername(username: string): Promise<string | null> {
    if (!this.client || !this.userId) return "Not signed in.";
    const trimmed = username.trim();
    if (!/^[a-zA-Z0-9_]{3,24}$/.test(trimmed)) {
      return "3-24 characters: letters, numbers and underscores.";
    }
    const { error } = await this.client
      .from("user_profiles")
      .update({ username: trimmed })
      .eq("user_id", this.userId);
    if (!error) {
      // The service took it, so the held copy is right without asking again.
      if (this.profileCache) this.profileCache.username = trimmed;
      this.hooks.onChange();
      return null;
    }
    return error.code === "23505" ? "That name is taken." : error.message;
  }

  async setApiAccess(allow: boolean): Promise<void> {
    if (!this.client || !this.userId) return;
    const { error } = await this.client
      .from("user_profiles")
      .update({ allow_api_access: allow })
      .eq("user_id", this.userId);
    if (error) {
      this.ctx.logger.warning(`heat_stats: could not change API access: ${error.message}`);
      return;
    }
    if (this.profileCache) this.profileCache.allow_api_access = allow;
    this.hooks.onChange();
  }

  // ── Matches down ──────────────────────────────────────────────────

  /** Brings the mirror up to date. Usually one count and one empty page. Only a first sign-in or a match from another PC moves rows. */
  async pull(force = false): Promise<void> {
    const client = this.client;
    const userId = this.userId;
    if (!client || !userId || this.pulling) return;

    this.pulling = true;
    const cursor = await this.store.cursor(userId);
    let newest = cursor.newest;
    let newestId = cursor.newest_id;
    let complete = cursor.complete;
    let pulled = 0;

    try {
      this.setProgress({ phase: "checking", direction: "down", done: 0, total: null, message: null });

      // The server counts and sends no rows.
      const { count, error: countError } = await client
        .from("match_sessions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId);

      if (countError) {
        this.setProgress({ phase: "offline", message: countError.message });
        return;
      }

      const mirrored = await this.store.cloudCount();
      const total = count ?? 0;
      this.setProgress({ remote: total });

      // Up to date, and the backfill is complete.
      if (!force && complete && mirrored >= total) {
        this.setProgress({ phase: "idle", direction: null, done: 0, total: null, message: null });
        return;
      }

      // The bar measures this run, not the whole history.
      this.setProgress({ phase: "syncing", done: 0, total: Math.max(total - mirrored, 0) || null });
      complete = false;

      for (let page = 0; page < MAX_PULL_PAGES; page++) {
        let query = client
          .from("match_sessions")
          .select(MIRROR_COLUMNS)
          .eq("user_id", userId)
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
          .limit(PULL_PAGE);
        // Oldest first on (created_at, id), so an interrupted backfill resumes where it stopped
        // and never skips rows with the same timestamp.
        if (newest && newestId) {
          query = query.or(`created_at.gt."${newest}",and(created_at.eq."${newest}",id.gt."${newestId}")`);
        } else if (newest) {
          // A cursor from before keyset paging reads that timestamp again. `mirror` replaces the rows.
          query = query.gte("created_at", newest);
        }

        const { data, error } = await query;
        if (error) {
          this.setProgress({ phase: "offline", message: error.message });
          break;
        }

        // supabase-js cannot narrow a runtime column list, so its type allows an error shape.
        // The `error` check above excludes it.
        const rows = (data ?? []) as unknown as Record<string, unknown>[];
        if (!rows.length) {
          complete = true;
          break;
        }

        await this.store.mirror(rows);
        pulled += rows.length;
        const last = rows[rows.length - 1];
        newest = String(last?.created_at ?? newest ?? "");
        newestId = String(last?.id ?? newestId ?? "");
        this.setProgress({ done: pulled });

        if (rows.length < PULL_PAGE) {
          complete = true;
          break;
        }
      }

      if (this.state.phase !== "offline") {
        this.setProgress({ phase: "idle", direction: null, done: 0, total: null, message: null });
      }
      if (pulled) {
        this.ctx.logger.info(`heat_stats: mirrored ${pulled} match(es) from the account`);
        this.hooks.onMatchesChanged();
      }
    } catch (e) {
      this.setProgress({ phase: "error", message: e instanceof Error ? e.message : String(e) });
    } finally {
      // The cursor is saved in every case, so a stored page is never asked for twice.
      await this.store
        .setCursor({ user_id: userId, newest, newest_id: newestId, complete, updated_at: "" })
        .catch((e: unknown) => this.ctx.logger.warning(`heat_stats: could not save the sync cursor: ${String(e)}`));
      this.pulling = false;
    }
  }

  // ── Tags both ways ────────────────────────────────────────────────

  async pullTags(): Promise<void> {
    const client = this.client;
    const userId = this.userId;
    if (!client || !userId) return;

    const startedAt = Date.now();
    const { data, error } = await client
      .from("player_tags")
      .select("player_id,tags,player_name,updated_at")
      .eq("user_id", userId)
      .limit(TAG_PULL_LIMIT);

    if (error) {
      this.ctx.logger.warning(`heat_stats: could not read tags: ${error.message}`);
      return;
    }

    let changed = false;
    const seen = new Set<string>();
    for (const row of (data ?? []) as Array<Record<string, unknown>>) {
      const pid = String(row.player_id ?? "");
      if (!pid) continue;
      seen.add(pid);
      const at = Date.parse(String(row.updated_at ?? "")) || 0;
      const name = row.player_name == null ? null : String(row.player_name);
      if (await this.tags.mirror(pid, row.tags, name, at)) changed = true;
    }
    // Untagged on another PC, so the row goes here too, unless this PC changed it since.
    if (await this.tags.prune(seen, startedAt)) changed = true;
    if (changed) this.hooks.onTagsChanged();
  }

  /** Sends the marks this PC changed: writes as one upsert, cleared marks as one delete. */
  private async drainTags(): Promise<void> {
    const client = this.client;
    const userId = this.userId;
    if (!client || !userId) return;

    const batch = this.tags.pending(TAG_BATCH);
    if (!batch.length) return;

    const writes = batch.filter((r) => r.tags.length);
    const removals = batch.filter((r) => !r.tags.length);
    const settle = async (rows: TagRecord[]): Promise<void> => {
      for (const row of rows) await this.tags.markSynced(row);
    };

    if (writes.length) {
      const { error } = await client.from("player_tags").upsert(
        writes.map((r) => ({
          user_id: userId,
          player_id: r.pid,
          tags: r.tags,
          player_name: r.name,
          // This PC's own clock decides the tiebreak, not the service's.
          updated_at: new Date(r.updatedAt).toISOString(),
        })),
        { onConflict: "user_id,player_id" },
      );
      if (error) {
        this.ctx.logger.warning(`heat_stats: tags did not save: ${error.message}`);
        return;
      }
      await settle(writes);
    }

    if (removals.length) {
      const { error } = await client
        .from("player_tags")
        .delete()
        .eq("user_id", userId)
        .in("player_id", removals.map((r) => r.pid));
      if (error) {
        this.ctx.logger.warning(`heat_stats: tags did not clear: ${error.message}`);
        return;
      }
      await settle(removals);
    }

    this.hooks.onTagsChanged();
  }

  // ── Matches up ────────────────────────────────────────────────────

  private scheduleDrain(delay: number): void {
    if (this.drainTimer) clearTimeout(this.drainTimer);
    this.drainTimer = setTimeout(() => void this.drain(), Math.max(delay, this.pausedUntil - Date.now()));
  }

  /** Sends the queue. Each match is accepted, refused for good, or left for later. Only the last repeats. */
  private async drain(): Promise<void> {
    this.drainTimer = null;
    if (this.draining || !this.client || !this.userId) return;
    if (Date.now() < this.pausedUntil) {
      this.scheduleDrain(0);
      return;
    }

    this.draining = true;
    let settled = 0;
    let accepted = 0;
    try {
      // Marks first. They are small, never fail for good, and a new tag must not wait for a match backlog.
      await this.drainTags();

      const batch = await this.store.pending(DRAIN_BATCH);
      // The queue is usually empty. Progress shows only when there is work.
      const queued = batch.length ? (await this.store.counts()).pending : 0;
      if (queued) {
        this.setProgress({ phase: "uploading", direction: "up", done: 0, total: queued, message: null });
      }
      for (const item of batch) {
        const outcome = await this.upload(item.payload, item.samples);
        if (outcome.kind === "accepted") {
          await this.store.markUploaded(item.id, outcome.remoteId);
          settled++;
          accepted++;
        } else if (outcome.kind === "refused") {
          await this.store.markRejected(item.id, outcome.reason);
          settled++;
        } else {
          await this.store.markFailed(item.id, outcome.reason);
          // The cause that stopped this match also stops the rest, so the run ends here.
          if (outcome.pauseMs) this.pausedUntil = Date.now() + outcome.pauseMs;
          if (queued) this.setProgress({ phase: "offline", message: outcome.reason });
          break;
        }
        if (queued) this.setProgress({ done: settled });
      }
      if (queued && this.state.phase === "uploading") {
        this.setProgress({ phase: "idle", direction: null, done: 0, total: null, message: null });
      }
      if (settled) this.hooks.onChange();
      // Accepted matches go into the mirror too, so the window agrees with the service without a full read.
      if (accepted) await this.pull();
    } catch (e) {
      this.ctx.logger.warning(`heat_stats: upload run failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      this.draining = false;
      this.scheduleDrain(DRAIN_EVERY_MS);
    }
  }

  private async upload(
    payload: Record<string, unknown>,
    samples: unknown[],
  ): Promise<
    | { kind: "accepted"; remoteId: string | null }
    | { kind: "refused"; reason: string }
    | { kind: "later"; reason: string; pauseMs?: number }
  > {
    if (!this.client) return { kind: "later", reason: "Not signed in." };

    const { data, error } = await this.client.functions.invoke("stats-submit", {
      body: { ...payload, samples },
    });

    if (!error) {
      const body = (data ?? {}) as { id?: string; duplicate?: boolean };
      return { kind: "accepted", remoteId: body.id ?? null };
    }

    // supabase-js wraps the response. The status decides the outcome.
    const context = (error as { context?: Response }).context;
    const status = context?.status ?? 0;
    const body = (await context?.json?.().catch(() => ({}))) as { error?: string; code?: string };
    const message = body.error ?? error.message;

    // A duplicate, or it failed the server's checks. A second send fails the same way.
    if (status === 409 || status === 422 || status === 400) {
      return { kind: "refused", reason: message };
    }
    if (status === 429) {
      return { kind: "later", reason: "Too many uploads; waiting.", pauseMs: RATE_LIMIT_BACKOFF_MS };
    }
    // 401 means the session needs attention. Anything else is the network or a brief service fault.
    return { kind: "later", reason: message, pauseMs: status === 401 ? RATE_LIMIT_BACKOFF_MS : 0 };
  }
}
