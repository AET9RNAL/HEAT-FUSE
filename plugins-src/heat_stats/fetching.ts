/**
 * What the window shows, read from the local store only. `sync.ts` keeps that store
 * current, so a refresh needs no network and a large history never downloads again at launch.
 * Samples are the exception: too large to mirror, so they load one battle at a time.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { FuseContext } from "@fuse/plugin-sdk";
import { aggregateSessions, buildOverview, STAT_GROUPS, type Overview, type SessionRow, type StatGroup, type StatRow } from "./overview.js";
import type { Sample } from "./session.js";
import type { MatchStore } from "./store.js";

/** account: signed in. local: this PC only. none: nothing recorded yet. */
export type StatsSource = "account" | "local" | "none";

export class StatsClient {
  private client: SupabaseClient | null = null;
  private userId: string | null = null;
  private fetching = false;
  private queued = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastSource: StatsSource = "none";

  constructor(
    private readonly ctx: FuseContext,
    private readonly store: MatchStore,
    /** The player to label the overview with, or "" when there is none. */
    private readonly player: () => string,
    private readonly onLoaded: (overview: Overview | null, sessions: SessionRow[] | null) => void,
  ) {}

  /** Signing in or out changes which side of the store the window reads. */
  setSession(client: SupabaseClient | null, userId: string | null): void {
    this.client = userId ? client : null;
    this.userId = userId;
    void this.refresh();
  }

  get source(): StatsSource {
    return this.lastSource;
  }

  /** A refresh asked for during a refresh runs once after it, never in parallel. */
  async refresh(): Promise<void> {
    if (this.fetching) {
      this.queued = true;
      return;
    }
    this.fetching = true;
    try {
      do {
        this.queued = false;
        await this.load();
      } while (this.queued);
    } catch (e) {
      this.ctx.logger.warning(`heat_stats: overview build failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      this.fetching = false;
    }
  }

  refreshLater(ms: number): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.refresh();
    }, ms);
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  /**
   * One battle's samples, or null when it has none. The server deletes them after 180 days.
   * The id is the service row id for a cloud battle and the recorder's session id for a local one,
   * so each source only ever sees an id that it issued.
   */
  async samples(id: string): Promise<Sample[] | null> {
    const local = await this.store.samplesFor(id);
    if (local) return local;

    if (this.client && this.userId) {
      const { data, error } = await this.client
        .from("match_samples_blob")
        .select("samples")
        .eq("session_id_fk", id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      const samples = (data as { samples?: unknown } | null)?.samples;
      return Array.isArray(samples) ? (samples as Sample[]) : null;
    }
    return null;
  }

  private async load(): Promise<void> {
    const signedIn = Boolean(this.userId);
    // Signed out, the window still reads the mirror. Those battles are on this disk,
    // and a sign-out ends a session, not a history.
    const sessions = signedIn
      ? ((await this.store.cloudAll()) as SessionRow[])
      : ((await this.store.everything()) as SessionRow[]);

    this.lastSource = signedIn ? "account" : sessions.length ? "local" : "none";

    if (!sessions.length) {
      this.onLoaded(null, signedIn ? [] : null);
      return;
    }

    // The configured name, else the player of the newest match.
    const player = this.player() || String(sessions[0]?.player_name ?? "");
    const groups = Object.fromEntries(
      STAT_GROUPS.map((g) => [g, aggregateSessions(sessions, g)]),
    ) as Record<StatGroup, StatRow[]>;
    const overview = buildOverview(player, aggregateSessions(sessions)[0], groups, sessions);

    this.onLoaded(overview, sessions);
    this.ctx.logger.info(`heat_stats: overview for ${player || "this PC"} - ${overview.battles} battles (${this.lastSource})`);
  }
}
