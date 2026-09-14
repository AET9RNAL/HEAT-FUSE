/**
 * Services shared between plugins. Each plugin runs in its own process, so a
 * service is data consumers read synchronously plus methods they call async.
 *
 *     const svc = ctx.services.provide("accessors", {
 *       target: this.acc,
 *       methods: ["injectStylesheet"],
 *       reads: { read: "values" },          // consumer's acc.read(k) -> state.values[k]
 *       scopes: { injectStylesheet: "ui" }, // consumers need "accessors.ui"
 *       state: () => ({ values, connected }),
 *     });
 *     svc.publish();                          // after state changes; sends only what moved
 *
 * Scopes are declared in the provider's manifest under `provides.<service>.scopes`.
 */
export interface ServiceSpec {
  /** Object whose methods consumers call. Every call is async on their side. */
  target: object;
  /** Methods consumers may call. Defaults to every method on `target`. */
  methods?: string[];
  /** Consumer-side synchronous reads: method name -> state key, answered as `state[key][arg]`. */
  reads?: Record<string, string>;
  /** Data consumers read synchronously, as properties or through `reads`. Must be JSON. */
  state?: () => Record<string, unknown>;
  /** Method -> scope name. A consumer calling it needs the `<service>.<scope>` permission. */
  scopes?: Record<string, string>;
  /** Scope a consumer needs to see `state` at all; without it, reads come back empty. */
  stateScope?: string;
}

export interface ServiceHandle {
  /** Send consumers whatever changed in `state()` since the last publish. */
  publish(): void;
}

export interface PluginServices {
  get<T = unknown>(name: string): T | undefined;
  require<T = unknown>(name: string): T;
  provide(name: string, spec: ServiceSpec): ServiceHandle;
  /** Legacy: every method of `impl` becomes an async call for consumers, with no synchronous reads. */
  register(name: string, impl: unknown, owner?: string): void;
  unregister(name: string): void;
}
