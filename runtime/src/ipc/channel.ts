import type { WireMessage } from "./protocol.js";

interface Pending {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer?: NodeJS.Timeout;
}

/**
 * One end of the runtime <-> plugin IPC link. Outgoing messages are batched into
 * a single write per turn; a request resolves when its reply arrives.
 */
export class Channel {
  private queue: WireMessage[] = [];
  private scheduled = false;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private handler: (msg: WireMessage) => void = () => {};
  private closed = false;

  constructor(private readonly write: (payload: object) => void) {}

  onMessage(handler: (msg: WireMessage) => void): void {
    this.handler = handler;
  }

  receive(raw: unknown): void {
    const list = isBatch(raw) ? raw.m : [raw];
    for (const item of list) {
      if (!isMessage(item)) continue;
      if (item.t === "reply") this.settle(item);
      else this.handler(item);
    }
  }

  send(msg: WireMessage): void {
    if (this.closed) return;
    this.queue.push(msg);
    if (this.scheduled) return;
    this.scheduled = true;
    setImmediate(() => this.flush());
  }

  /** Write whatever is queued now, e.g. right before replying to a teardown. */
  flush(): void {
    this.scheduled = false;
    if (this.closed || !this.queue.length) return;
    const payload = this.queue.length === 1 ? this.queue[0]! : { t: "batch", m: this.queue };
    this.queue = [];
    try {
      this.write(payload);
    } catch {
      /* the other end is gone */
    }
  }

  request<T = unknown>(msg: WireMessage, timeoutMs = 0): Promise<T> {
    if (this.closed) return Promise.reject(new Error("the channel is closed"));
    const rid = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      const entry: Pending = { resolve: resolve as (value: unknown) => void, reject };
      if (timeoutMs > 0) {
        entry.timer = setTimeout(() => {
          this.pending.delete(rid);
          reject(new Error(`'${msg.t}' timed out`));
        }, timeoutMs);
      }
      this.pending.set(rid, entry);
      this.send({ ...msg, rid });
    });
  }

  reply(rid: unknown, result: { ok: true; value?: unknown } | { ok: false; error: string }): void {
    this.send({ t: "reply", rid, ...result });
  }

  close(reason: string): void {
    if (this.closed) return;
    this.closed = true;
    this.queue = [];
    for (const p of this.pending.values()) {
      if (p.timer) clearTimeout(p.timer);
      p.reject(new Error(reason));
    }
    this.pending.clear();
  }

  private settle(msg: WireMessage): void {
    const rid = Number(msg.rid);
    const p = this.pending.get(rid);
    if (!p) return;
    this.pending.delete(rid);
    if (p.timer) clearTimeout(p.timer);
    if (msg.ok === true) p.resolve(msg.value);
    else p.reject(new Error(String(msg.error ?? "the request failed")));
  }
}

export function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function isMessage(v: unknown): v is WireMessage {
  return !!v && typeof v === "object" && typeof (v as { t?: unknown }).t === "string";
}

function isBatch(v: unknown): v is { t: "batch"; m: unknown[] } {
  return isMessage(v) && v.t === "batch" && Array.isArray((v as { m?: unknown }).m);
}
