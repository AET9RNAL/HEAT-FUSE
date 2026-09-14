/**
 * Messages between the runtime and a plugin process over Node's IPC channel.
 * Every message carries `t`. Requests add `rid` and are answered with
 * `{ t: "reply", rid, ok, value | error }`.
 */
import type { HostState } from "../sdk/plugin.js";
import type { PermissionState } from "../sdk/permissions.js";

export type WireMessage = { t: string } & Record<string, unknown>;

export interface ServiceSnapshot {
  /** Plugin id of the provider, or "host". */
  owner: string;
  state: Record<string, unknown>;
  /** Consumer method -> state key, answered synchronously as `state[key][arg]`. */
  reads: Record<string, string>;
  /** Methods consumers call over RPC. */
  methods: string[];
}

export interface InitMessage {
  t: "init";
  pluginId: string;
  name: string;
  version: string;
  description: string;
  entryPath: string;
  entryClass: string;
  packageRoot: string;
  manifestHotkeys: Record<string, string>;
  config: { path: string; defaults: Record<string, unknown>; disk: Record<string, unknown> };
  state: HostState;
  permissions: Record<string, PermissionState>;
  services: Record<string, ServiceSnapshot>;
  logLevel: string;
}
