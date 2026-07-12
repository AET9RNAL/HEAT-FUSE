/**
 * Lightweight pub/sub event bus
 *
 * In single-threaded Node we defer dispatch to the
 * next macrotask (`setImmediate`) to preserve the same "emit returns first,
 * handlers run after" ordering.
 */
import { logger } from "../log.js";

export type EventHandler = (payload: Record<string, unknown>) => void;

export class EventBus {
  private handlers = new Map<string, Array<[string, EventHandler]>>();

  subscribe(event: string, cb: EventHandler, owner = ""): void {
    const list = this.handlers.get(event) ?? [];
    list.push([owner, cb]);
    this.handlers.set(event, list);
    logger.debug(`EventBus: '${owner}' subscribed to '${event}'`);
  }

  unsubscribe(event: string, cb: EventHandler): void {
    const list = this.handlers.get(event);
    if (!list) return;
    this.handlers.set(
      event,
      list.filter(([, h]) => h !== cb),
    );
  }

  emit(event: string, payload: Record<string, unknown> = {}): void {
    const handlers = [...(this.handlers.get(event) ?? [])];
    if (!handlers.length) return;
    setImmediate(() => {
      for (const [owner, cb] of handlers) {
        try {
          cb(payload);
        } catch (e) {
          logger.exception(`EventBus handler '${owner}' for '${event}' raised`, e);
        }
      }
    });
  }
}
