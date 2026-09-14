/**
 * Stage notifications: host- and plugin-sourced toasts broadcast to the overlay
 * stage, with a short replay list so a stage window that connects late still
 * shows what's current.
 */
import { randomUUID } from "node:crypto";
import type { WsServer } from "../server/WsServer.js";
import type { StageNotificationInit, StageNotificationType, StageNotifier } from "../sdk/notifications.js";

const DEFAULT_DURATION_MS = 5000;
const MAX_DURATION_MS = 60_000;
const MAX_RETAINED = 20;
const TYPES: readonly StageNotificationType[] = ["info", "success", "warning", "error"];

export interface StageNotification {
  id: string;
  /** "host" or the id of the plugin that raised it. */
  source: string;
  title: string;
  message: string;
  type: StageNotificationType;
  icon?: string;
  /** Milliseconds; 0 stays until closed. */
  duration: number;
  createdAt: number;
}

export class NotificationHub {
  /** Insertion-ordered, oldest first, so trimming drops the stalest. */
  private active = new Map<string, StageNotification>();
  private expiry = new Map<string, NodeJS.Timeout>();
  /** Raised before any stage connected (discovery runs first); their clocks start on hydration. */
  private undelivered = new Set<string>();

  constructor(private server: WsServer) {}

  /** A notifier bound to one source, so ids can't collide across plugins. */
  scoped(source: string): StageNotifier {
    return {
      notify: (init) => this.notify(source, init),
      dismiss: (id) => this.dismiss(source, id),
    };
  }

  notify(source: string, init: StageNotificationInit): string {
    const id = this.fullId(source, init.id ?? randomUUID());
    const rawDuration = Number(init.duration ?? DEFAULT_DURATION_MS);
    const duration = Number.isFinite(rawDuration)
      ? Math.min(MAX_DURATION_MS, Math.max(0, rawDuration))
      : DEFAULT_DURATION_MS;

    const n: StageNotification = {
      id,
      source,
      title: String(init.title ?? "").trim() || source,
      message: String(init.message ?? ""),
      type: TYPES.includes(init.type as StageNotificationType) ? (init.type as StageNotificationType) : "info",
      icon: typeof init.icon === "string" && init.icon ? init.icon : undefined,
      duration,
      createdAt: Date.now(),
    };

    // Delete first so a replaced id moves to the newest end of the map.
    this.active.delete(id);
    this.active.set(id, n);
    while (this.active.size > MAX_RETAINED) {
      const oldest = this.active.keys().next().value;
      if (oldest === undefined) break;
      this.forget(oldest);
    }
    this.schedulePrune(n);
    this.server.broadcastOverlay({ type: "stage:notify", notification: n });
    return id;
  }

  dismiss(source: string, id: string): void {
    const full = this.fullId(source, id);
    if (!this.active.has(full)) return;
    this.forget(full);
    this.server.broadcastOverlay({ type: "stage:dismiss", id: full });
  }

  /** A stage client closed it: stop replaying it, and close it on every other stage client. */
  onStageDismissed(id: string): void {
    if (!this.active.has(id)) return;
    this.forget(id);
    this.server.broadcastOverlay({ type: "stage:dismiss", id });
  }

  /** Current notifications for a newly connected stage, with the time they have left. */
  hydration(): StageNotification[] {
    const now = Date.now();
    for (const id of this.undelivered) {
      this.undelivered.delete(id);
      const n = this.active.get(id);
      if (!n) continue;
      n.createdAt = now;
      this.schedulePrune(n);
    }
    return [...this.active.values()].map((n) => ({
      ...n,
      duration: n.duration === 0 ? 0 : Math.max(1000, n.duration - (now - n.createdAt)),
    }));
  }

  private fullId(source: string, id: string): string {
    return id.startsWith(`${source}:`) ? id : `${source}:${id}`;
  }

  // Replay only has to outlive the toast; each stage runs its own hover-pausable timer.
  private schedulePrune(n: StageNotification): void {
    const prev = this.expiry.get(n.id);
    if (prev) clearTimeout(prev);
    this.expiry.delete(n.id);
    if (n.duration === 0) return;
    if (!this.server.hasOverlayClient()) {
      this.undelivered.add(n.id);
      return;
    }
    const t = setTimeout(() => this.forget(n.id), n.duration);
    t.unref();
    this.expiry.set(n.id, t);
  }

  private forget(id: string): void {
    this.active.delete(id);
    this.undelivered.delete(id);
    const t = this.expiry.get(id);
    if (t) clearTimeout(t);
    this.expiry.delete(id);
  }
}
