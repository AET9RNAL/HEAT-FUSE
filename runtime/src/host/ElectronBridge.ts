import { randomUUID } from "node:crypto";

type Send = (msg: Record<string, unknown>) => void;

interface Pending {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

/**
 * Requests to Electron main over the runtime's IPC channel, for what only main
 * can do: OS encryption for secrets, opening the user's browser.
 */
export class ElectronBridge {
  private pending = new Map<string, Pending>();

  constructor(private readonly send: Send | null) {}

  request<T = unknown>(type: string, payload: Record<string, unknown>, timeoutMs = 5000): Promise<T> {
    const send = this.send;
    if (!send) return Promise.reject(new Error("not available outside the FUSE app"));
    const requestId = randomUUID();
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`'${type}' got no answer from FUSE`));
      }, timeoutMs);
      this.pending.set(requestId, { resolve: resolve as (value: unknown) => void, reject, timer });
      send({ ...payload, type, requestId });
    });
  }

  /** True when `msg` was an answer to one of this bridge's requests. */
  onMessage(msg: Record<string, unknown>): boolean {
    if (msg.type !== "bridge:result") return false;
    const requestId = String(msg.requestId ?? "");
    const p = this.pending.get(requestId);
    if (!p) return true;
    this.pending.delete(requestId);
    clearTimeout(p.timer);
    if (msg.ok === true) p.resolve(msg.value);
    else p.reject(new Error(String(msg.error ?? "FUSE refused the request")));
    return true;
  }
}
