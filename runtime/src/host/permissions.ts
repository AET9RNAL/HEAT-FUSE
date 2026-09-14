/**
 * Permission scopes and the user's decisions.
 *
 * Electron main owns the decisions (encrypted on disk) and the consent card,
 * which it draws outside the stage page so plugin code can't answer it.
 */
import { randomUUID } from "node:crypto";
import { logger } from "../log.js";
import type { NotificationHub } from "./NotificationHub.js";
import type { DiscoveredPlugin } from "./types.js";
import type { PermissionState, PluginPermissions } from "../sdk/permissions.js";

export type ScopeLevel = "normal" | "dangerous" | "core";

export interface ScopeDef {
  label: string;
  description: string;
  level: ScopeLevel;
  /** process: a Node flag at spawn, so a change restarts the plugin. brokered: checked on every call. */
  kind: "process" | "brokered";
  /** Icons.vue kind shown beside the scope. */
  icon: string;
}

export const SCOPES: Record<string, ScopeDef> = {
  network: {
    label: "Networking",
    description: "Connect to the internet and to local services on this PC.",
    level: "dangerous",
    kind: "process",
    icon: "cloud",
  },
  audio: { label: "Sound", description: "Play sounds from its own files.", level: "normal", kind: "brokered", icon: "sound" },
  storage: {
    label: "Local storage",
    description: "Keep its own data on this PC.",
    level: "normal",
    kind: "brokered",
    icon: "folder",
  },
  secrets: {
    label: "Secrets",
    description: "Keep encrypted values such as sign-in tokens.",
    level: "normal",
    kind: "brokered",
    icon: "password",
  },
  game: {
    label: "Game interface",
    description: "Run scripts inside the game's interface.",
    level: "core",
    kind: "brokered",
    icon: "console",
  },
};

/** A re-ask or a link counts as user-initiated this long after the plugin's last user action. */
const USER_ACTION_WINDOW_MS = 5000;
const SERVICE_NAME_RE = /^[a-z0-9_]{1,64}$/;
const SERVICE_SCOPE_RE = /^[a-z0-9_]{1,64}\.[a-z0-9_]{1,64}$/;

type Send = (msg: Record<string, unknown>) => void;

interface PluginMeta {
  name: string;
  version: string;
  author: string;
  core: boolean;
  /** Declared scope -> the author's reason. */
  reasons: Map<string, string>;
}

interface ServiceScopeDef extends ScopeDef {
  /** Plugin id whose manifest declares it. */
  provider: string;
}

export interface ScopeSummary {
  id: string;
  label: string;
  description: string;
  level: ScopeLevel;
  icon: string;
  state: PermissionState;
  reason: string;
  /** The user can change it from the stage. */
  editable: boolean;
}

export class PermissionManager {
  private plugins = new Map<string, PluginMeta>();
  private serviceScopes = new Map<string, ServiceScopeDef>();
  private serviceOwners = new Map<string, string>();
  private decisions = new Map<string, Record<string, boolean>>();
  private waiting = new Map<string, () => void>();
  private reported = new Set<string>();
  private reasked = new Set<string>();
  private reviewing = new Set<string>();
  private lastUserAction = new Map<string, number>();
  private changeListeners: Array<(pluginId: string) => void> = [];
  private ready: Promise<void> = Promise.resolve();
  private markReady: () => void = () => {};

  constructor(
    private notifications: NotificationHub,
    private send: Send | null,
  ) {
    if (!send) logger.warning("permissions: no channel to Electron - dangerous scopes are denied this session");
  }

  /**
   * Fetch the stored decisions from Electron, which re-reads them from disk. Runs
   * before every plugin load, so a deleted or changed file applies on the next load.
   */
  async waitForDecisions(timeoutMs: number): Promise<void> {
    if (!this.send) return;
    this.ready = new Promise((resolve) => (this.markReady = resolve));
    this.send({ type: "permissions:ready" });
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<void>((resolve) => {
      timer = setTimeout(() => {
        logger.warning("permissions: no stored decisions from Electron - dangerous scopes will be asked again");
        resolve();
      }, timeoutMs);
    });
    await Promise.race([this.ready, timeout]);
    clearTimeout(timer);
  }

  onMessage(msg: Record<string, unknown>): void {
    if (msg.type === "permissions:init") {
      this.decisions.clear();
      for (const [pluginId, grants] of Object.entries(asRecord(msg.decisions))) {
        this.decisions.set(pluginId, sanitizeGrants(grants));
      }
      this.markReady();
      return;
    }
    if (msg.type !== "permissions:decision") return;
    const pluginId = String(msg.pluginId ?? "");
    if (!pluginId) return;
    this.decisions.set(pluginId, { ...(this.decisions.get(pluginId) ?? {}), ...sanitizeGrants(msg.grants) });
    const done = this.waiting.get(String(msg.requestId ?? ""));
    if (done) {
      this.waiting.delete(String(msg.requestId));
      done();
    }
    for (const cb of this.changeListeners) cb(pluginId);
  }

  onChange(cb: (pluginId: string) => void): void {
    this.changeListeners.push(cb);
  }

  /** Before a reload: manifests, and the service scopes they declare, are read again. */
  resetRegistrations(): void {
    this.plugins.clear();
    this.serviceScopes.clear();
    this.serviceOwners.clear();
  }

  /** Read the manifest's provided service scopes and its declared permissions. */
  register(spec: DiscoveredPlugin): void {
    this.registerProvided(spec);
    const reasons = new Map<string, string>();
    for (const [scope, entry] of Object.entries(asRecord(spec.manifest.permissions))) {
      if (!SCOPES[scope] && !SERVICE_SCOPE_RE.test(scope)) {
        logger.warning(`permissions: ${spec.pluginId} declares unknown scope '${scope}' - ignored`);
        continue;
      }
      reasons.set(scope, String(asRecord(entry).reason ?? "").trim());
    }
    this.plugins.set(spec.pluginId, {
      name: spec.name,
      version: spec.version,
      author: spec.author,
      core: spec.isCore,
      reasons,
    });
  }

  /** Scopes the plugin's manifest declares. */
  declared(pluginId: string): string[] {
    return [...(this.plugins.get(pluginId)?.reasons.keys() ?? [])];
  }

  /**
   * The user picked a scope on the stage: show the consent card for it, whatever
   * its state. Stage clicks can come from plugin overlays, but the card can't.
   */
  review(pluginId: string, scope: string): void {
    const def = this.scopeDef(scope);
    const state = this.state(pluginId, scope);
    if (!this.send || !def || def.level === "core" || state === "undeclared") return;
    const key = `${pluginId}:${scope}`;
    if (this.reviewing.has(key)) return;
    this.reviewing.add(key);
    void this.ask(pluginId, [scope], "review").finally(() => this.reviewing.delete(key));
  }

  /** A scope `owner`'s manifest declares for one of its own services. */
  isServiceScope(scopeId: string, owner: string): boolean {
    return this.serviceScopes.get(scopeId)?.provider === owner;
  }

  state(pluginId: string, scope: string): PermissionState {
    const meta = this.plugins.get(pluginId);
    const def = this.scopeDef(scope);
    if (!meta || !def || !meta.reasons.has(scope)) return "undeclared";
    const decided = this.decisions.get(pluginId)?.[scope];
    if (def.level === "normal") return decided === false ? "denied" : "granted";
    if (def.level === "core") return meta.core && decided !== false ? "granted" : "denied";
    if (meta.core) return decided === false ? "denied" : "granted";
    if (decided === undefined) return "prompt";
    return decided ? "granted" : "denied";
  }

  has(pluginId: string, scope: string): boolean {
    return this.state(pluginId, scope) === "granted";
  }

  /** `has`, plus a notice when the plugin uses a scope it never declared. */
  check(pluginId: string, scope: string): boolean {
    const state = this.state(pluginId, scope);
    if (state === "undeclared") this.reportUndeclared(pluginId, scope);
    return state === "granted";
  }

  /** Ask about every declared scope still unanswered; resolves once the user has answered. */
  async ensureConsent(pluginId: string): Promise<void> {
    const meta = this.plugins.get(pluginId);
    if (!meta) return;
    const open = [...meta.reasons.keys()].filter((scope) => this.state(pluginId, scope) === "prompt");
    if (open.length) await this.ask(pluginId, open);
  }

  noteUserAction(pluginId: string): void {
    this.lastUserAction.set(pluginId, Date.now());
  }

  /** True once per recent user action: whatever needs one (opening a link) uses it up. */
  consumeUserAction(pluginId: string): boolean {
    const recent = Date.now() - (this.lastUserAction.get(pluginId) ?? 0) <= USER_ACTION_WINDOW_MS;
    if (recent) this.lastUserAction.delete(pluginId);
    return recent;
  }

  scoped(pluginId: string): PluginPermissions {
    return {
      has: (scope) => this.has(pluginId, scope),
      state: (scope) => this.state(pluginId, scope),
      request: (scope) => this.request(pluginId, scope),
    };
  }

  /** Declared scopes with their state, for the stage's plugin list. */
  summary(pluginId: string): ScopeSummary[] {
    const meta = this.plugins.get(pluginId);
    if (!meta) return [];
    return [...meta.reasons].map(([id, reason]) => {
      const def = this.scopeDef(id);
      const state = this.state(pluginId, id);
      return {
        id,
        label: def?.label ?? id,
        description: def?.description ?? "",
        level: def?.level ?? "dangerous",
        icon: def?.icon ?? "permission",
        state,
        reason,
        editable: !!this.send && !!def && def.level !== "core" && state !== "undeclared",
      };
    });
  }

  private scopeDef(scope: string): ScopeDef | undefined {
    return SCOPES[scope] ?? this.serviceScopes.get(scope);
  }

  private registerProvided(spec: DiscoveredPlugin): void {
    for (const [service, raw] of Object.entries(asRecord(spec.manifest.provides))) {
      if (!SERVICE_NAME_RE.test(service)) {
        logger.warning(`permissions: ${spec.pluginId} provides '${service}': names are lowercase letters, digits and '_'`);
        continue;
      }
      const owner = this.serviceOwners.get(service);
      if (owner && owner !== spec.pluginId) {
        logger.warning(`permissions: '${service}' is already provided by '${owner}' - ${spec.pluginId}'s declaration ignored`);
        continue;
      }
      this.serviceOwners.set(service, spec.pluginId);
      for (const [scope, value] of Object.entries(asRecord(asRecord(raw).scopes))) {
        const id = `${service}.${scope}`;
        if (!SERVICE_SCOPE_RE.test(id)) {
          logger.warning(`permissions: ${spec.pluginId} declares scope '${id}': names are lowercase letters, digits and '_'`);
          continue;
        }
        const def = asRecord(value);
        const description = String(def.description ?? "").trim();
        this.serviceScopes.set(id, {
          label: String(def.label ?? "").trim() || `${service} ${scope}`,
          description: `${description ? `${description} ` : ""}Provided by ${spec.name}.`,
          level: def.level === "normal" ? "normal" : "dangerous",
          kind: "brokered",
          icon: "plugin",
          provider: spec.pluginId,
        });
      }
    }
  }

  private async request(pluginId: string, scope: string): Promise<"granted" | "denied"> {
    const state = this.state(pluginId, scope);
    if (state === "granted") return "granted";
    if (state === "undeclared") {
      this.reportUndeclared(pluginId, scope);
      return "denied";
    }
    if (this.scopeDef(scope)?.level !== "dangerous") return "denied";
    if (Date.now() - (this.lastUserAction.get(pluginId) ?? 0) > USER_ACTION_WINDOW_MS) {
      logger.warning(`permissions: ${pluginId} asked for '${scope}' without a user action - ignored`);
      return "denied";
    }
    if (state === "denied") {
      const key = `${pluginId}:${scope}`;
      if (this.reasked.has(key)) return "denied";
      this.reasked.add(key);
    }
    await this.ask(pluginId, [scope]);
    return this.has(pluginId, scope) ? "granted" : "denied";
  }

  private ask(pluginId: string, scopes: string[], mode: "ask" | "review" = "ask"): Promise<void> {
    const meta = this.plugins.get(pluginId);
    if (!meta) return Promise.resolve();
    const send = this.send;
    if (!send) {
      this.decisions.set(pluginId, {
        ...(this.decisions.get(pluginId) ?? {}),
        ...Object.fromEntries(scopes.map((s) => [s, false])),
      });
      return Promise.resolve();
    }
    const requestId = randomUUID();
    logger.info(`permissions: asking the user about ${scopes.join(", ")} for ${pluginId}`);
    return new Promise((resolve) => {
      this.waiting.set(requestId, resolve);
      send({
        type: "permissions:request",
        requestId,
        mode,
        plugin: { id: pluginId, name: meta.name, version: meta.version, author: meta.author },
        scopes: scopes.map((id) => {
          const def = this.scopeDef(id);
          return {
            id,
            label: def?.label ?? id,
            description: def?.description ?? "",
            icon: def?.icon ?? "permission",
            reason: meta.reasons.get(id) ?? "",
            state: this.state(pluginId, id),
          };
        }),
      });
    });
  }

  private reportUndeclared(pluginId: string, scope: string): void {
    const key = `${pluginId}:${scope}`;
    if (this.reported.has(key)) return;
    this.reported.add(key);
    const name = this.plugins.get(pluginId)?.name ?? pluginId;
    const label = this.scopeDef(scope)?.label ?? scope;
    logger.warning(`permissions: ${pluginId} used '${scope}' without declaring it - blocked`);
    this.notifications.notify("host", {
      id: `permission-undeclared-${key}`,
      type: "warning",
      icon: "permission",
      title: `${name} was blocked from ${label}`,
      message: "It doesn't declare this permission. Contact the plugin's author.",
      duration: 10_000,
    });
  }
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function sanitizeGrants(v: unknown): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const [scope, granted] of Object.entries(asRecord(v))) {
    if (typeof granted === "boolean") out[scope] = granted;
  }
  return out;
}
