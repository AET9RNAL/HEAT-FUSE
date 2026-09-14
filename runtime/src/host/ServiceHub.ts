/**
 * Services shared across plugin processes. Each consumer mirrors a provider's
 * state for synchronous reads; method calls are routed through here, and scoped
 * methods and state are checked against the consumer's permissions.
 */
import { logger } from "../log.js";
import type { ServiceSnapshot, WireMessage } from "../ipc/protocol.js";
import { applyPatch, diffState, jsonClone, type StatePatch } from "../ipc/serviceState.js";

export interface ServiceConsumer {
  readonly pluginId: string;
  deliver(msg: WireMessage): void;
}

export type ServiceInvoke = (method: string, args: unknown[]) => Promise<unknown>;

/** Whether `consumerId` holds `<service>.<scope>`, a scope `owner` guards its service with. */
export type ServiceAuthorizer = (consumerId: string, service: string, scope: string, owner: string) => boolean;

export interface ServiceDecl {
  state?: Record<string, unknown>;
  reads?: Record<string, unknown>;
  methods?: unknown[];
  /** Method -> scope name. */
  scopes?: Record<string, unknown>;
  stateScope?: unknown;
}

interface Entry extends ServiceSnapshot {
  name: string;
  invoke: ServiceInvoke;
  methodScopes: Record<string, string>;
  stateScope: string | null;
}

interface HostProvider {
  state: () => Record<string, unknown>;
  last: Record<string, unknown>;
}

export class ServiceHub {
  private services = new Map<string, Entry>();
  private subscribers = new Map<string, Set<ServiceConsumer>>();
  private hostProviders = new Map<string, HostProvider>();

  constructor(private readonly authorize: ServiceAuthorizer = () => true) {}

  provide(owner: string, name: string, decl: ServiceDecl, invoke: ServiceInvoke): boolean {
    const current = this.services.get(name);
    if (current && current.owner !== owner) {
      logger.warning(`services: '${owner}' can't provide '${name}' - '${current.owner}' already does`);
      return false;
    }
    const entry: Entry = {
      name,
      owner,
      state: jsonClone(decl.state ?? {}),
      reads: cleanMap(decl.reads),
      methods: cleanMethods(decl.methods),
      invoke,
      methodScopes: cleanMap(decl.scopes),
      stateScope: typeof decl.stateScope === "string" && decl.stateScope ? decl.stateScope : null,
    };
    this.services.set(name, entry);
    for (const consumer of this.subscribers.get(name) ?? []) this.deliverState(consumer, entry);
    logger.debug(`services: '${owner}' provides '${name}'`);
    return true;
  }

  /** A service the runtime itself provides; `publishHost` sends what changed in its state. */
  provideHost(
    name: string,
    target: object,
    decl: { reads?: Record<string, string>; methods: string[]; state: () => Record<string, unknown> },
  ): void {
    const state = jsonClone(decl.state());
    this.hostProviders.set(name, { state: decl.state, last: state });
    this.provide("host", name, { state, reads: decl.reads, methods: decl.methods }, async (method, args) => {
      const fn = (target as Record<string, unknown>)[method];
      if (typeof fn !== "function") throw new Error(`service '${name}' has no method '${method}'`);
      return fn.apply(target, args) as unknown;
    });
  }

  publishHost(name: string): void {
    const provider = this.hostProviders.get(name);
    if (!provider) return;
    const next = jsonClone(provider.state());
    const patch = diffState(provider.last, next);
    if (!patch) return;
    provider.last = next;
    this.publish("host", name, patch);
  }

  publish(owner: string, name: string, patch: StatePatch): void {
    const entry = this.services.get(name);
    if (!entry || entry.owner !== owner) return;
    applyPatch(entry.state, patch);
    for (const consumer of this.subscribers.get(name) ?? []) {
      if (this.canRead(consumer.pluginId, entry)) consumer.deliver({ t: "service.patch", name, patch });
    }
  }

  subscribe(consumer: ServiceConsumer, name: string): void {
    if (!name) return;
    let set = this.subscribers.get(name);
    if (!set) {
      set = new Set();
      this.subscribers.set(name, set);
    }
    set.add(consumer);
    const entry = this.services.get(name);
    if (entry) this.deliverState(consumer, entry);
  }

  /** A consumer's permissions changed: resend what it may now read (or no longer may). */
  refresh(consumer: ServiceConsumer): void {
    for (const [name, set] of this.subscribers) {
      const entry = this.services.get(name);
      if (entry && set.has(consumer)) this.deliverState(consumer, entry);
    }
  }

  call(consumerId: string, name: string, method: string, args: unknown[]): Promise<unknown> {
    const entry = this.services.get(name);
    if (!entry) return Promise.reject(new Error(`service '${name}' isn't available`));
    if (!entry.methods.includes(method)) {
      return Promise.reject(new Error(`service '${name}' has no method '${method}'`));
    }
    const scope = entry.methodScopes[method];
    if (scope && !this.authorize(consumerId, name, scope, entry.owner)) {
      return Promise.reject(new Error(`'${name}.${method}' needs the '${name}.${scope}' permission`));
    }
    return entry.invoke(method, args);
  }

  withdraw(owner: string, name: string): void {
    const entry = this.services.get(name);
    if (!entry || entry.owner !== owner) return;
    this.services.delete(name);
    for (const consumer of this.subscribers.get(name) ?? []) consumer.deliver({ t: "service.gone", name });
  }

  /** A plugin process stopped: its services go away, and it stops receiving updates. */
  removeParticipant(owner: string, consumer: ServiceConsumer): void {
    for (const [name, entry] of [...this.services]) {
      if (entry.owner === owner) this.withdraw(owner, name);
    }
    for (const set of this.subscribers.values()) set.delete(consumer);
  }

  /** Every service as `consumerId` may see it, for a starting plugin process. */
  snapshotsFor(consumerId: string): Record<string, ServiceSnapshot> {
    return Object.fromEntries([...this.services].map(([name, entry]) => [name, this.snapshotFor(consumerId, entry)]));
  }

  private canRead(consumerId: string, entry: Entry): boolean {
    return !entry.stateScope || this.authorize(consumerId, entry.name, entry.stateScope, entry.owner);
  }

  private snapshotFor(consumerId: string, entry: Entry): ServiceSnapshot {
    return {
      owner: entry.owner,
      state: this.canRead(consumerId, entry) ? entry.state : {},
      reads: entry.reads,
      methods: entry.methods,
    };
  }

  private deliverState(consumer: ServiceConsumer, entry: Entry): void {
    consumer.deliver({ t: "service.state", name: entry.name, snapshot: this.snapshotFor(consumer.pluginId, entry) });
  }
}

function cleanMap(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === "string") out[key] = value;
  }
  return out;
}

function cleanMethods(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((m): m is string => typeof m === "string") : [];
}
