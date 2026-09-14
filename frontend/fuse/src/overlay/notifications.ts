/**
 * Stage notification queue: at most MAX_VISIBLE cards on screen, the rest wait
 * their turn in arrival order.
 */
import { computed, reactive } from "vue";

export type StageNotificationType = "info" | "success" | "warning" | "error";

/** Mirrors `StageNotification` in runtime/src/host/NotificationHub.ts - keep the two in sync. */
export interface StageNotification {
  id: string;
  source: string;
  title: string;
  message: string;
  type: StageNotificationType;
  icon?: string;
  duration: number;
  createdAt: number;
  /** Bumped when the same id arrives again, so its card restarts the timer. */
  rev: number;
}

const MAX_VISIBLE = 3;

const queue = reactive<StageNotification[]>([]);

export const visibleNotifications = computed(() => queue.slice(0, MAX_VISIBLE));
export const queuedCount = computed(() => Math.max(0, queue.length - MAX_VISIBLE));

export function pushNotification(n: Omit<StageNotification, "rev">): void {
  const i = queue.findIndex((q) => q.id === n.id);
  if (i >= 0) queue.splice(i, 1, { ...n, rev: (queue[i]?.rev ?? 0) + 1 });
  else queue.push({ ...n, rev: 0 });
}

export function removeNotification(id: string): void {
  const i = queue.findIndex((q) => q.id === id);
  if (i >= 0) queue.splice(i, 1);
}

export function clearNotifications(): void {
  queue.splice(0, queue.length);
}
