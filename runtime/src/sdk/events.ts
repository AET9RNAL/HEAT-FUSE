export type EventHandler = (payload: Record<string, unknown>) => void;

/** The shared event bus. Events starting with `host_` come from the runtime and can't be emitted by plugins. */
export interface PluginEvents {
  subscribe(event: string, cb: EventHandler, owner?: string): void;
  unsubscribe(event: string, cb: EventHandler): void;
  emit(event: string, payload?: Record<string, unknown>): void;
}
