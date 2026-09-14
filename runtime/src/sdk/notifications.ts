/**
 * Stage notifications - toasts shown top-right on the overlay stage, raised by
 * the host or by a plugin through `ctx.notifications`.
 */
export type StageNotificationType = "info" | "success" | "warning" | "error";

export interface StageNotificationInit {
  title: string;
  message?: string;
  /** Accent colour and default icon. Defaults to "info". */
  type?: StageNotificationType;
  /** Icons.vue kind, overriding the type's default icon. */
  icon?: string;
  /** Milliseconds before auto-dismiss; 0 keeps it until closed. Defaults to 5000, capped at 60000. */
  duration?: number;
  /** Reusing an id replaces that notification instead of stacking another. */
  id?: string;
}

export interface StageNotifier {
  /** Queue a notification on the stage; returns its id. */
  notify(init: StageNotificationInit): string;
  /** Close a notification this source raised. */
  dismiss(id: string): void;
}
