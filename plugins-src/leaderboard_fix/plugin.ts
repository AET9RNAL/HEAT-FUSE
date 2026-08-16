import fs from "node:fs";
import path from "node:path";
import { FusePlugin, type FuseContext } from "@fuse/plugin-sdk";

/** One CDP WebSocket to the meta page, reconnecting on demand. */
class MetaCdp {
  private ws: WebSocket | null = null;
  private msgId = 0;
  private pending = new Map<number, { resolve: (v: unknown) => void; timer: NodeJS.Timeout }>();
  private connecting = false;

  constructor(private port: number) {}

  get connected(): boolean {
    return this.ws !== null;
  }

  async ensure(): Promise<boolean> {
    if (this.ws) return true;
    if (this.connecting) return false;
    this.connecting = true;
    try {
      const wsUrl = await this.discover();
      if (!wsUrl) return false;
      return await this.open(wsUrl);
    } finally {
      this.connecting = false;
    }
  }

  private async discover(): Promise<string | null> {
    try {
      const resp = await fetch(`http://localhost:${this.port}/json`, { signal: AbortSignal.timeout(2000) });
      const targets = (await resp.json()) as Array<Record<string, unknown>>;
      if (!Array.isArray(targets)) return null;
      for (const t of targets) {
        if (t.type === "page" && String(t.url ?? "").includes("meta/index.html")) {
          return (t.webSocketDebuggerUrl as string | undefined) ?? null;
        }
      }
    } catch {
      /* debugger not up, or in battle */
    }
    return null;
  }

  private open(wsUrl: string): Promise<boolean> {
    return new Promise((resolve) => {
      let ws: WebSocket;
      try {
        ws = new WebSocket(wsUrl);
      } catch {
        resolve(false);
        return;
      }
      const timer = setTimeout(() => {
        try { ws.close(); } catch { /* ignore */ }
        resolve(false);
      }, 5000);
      ws.onopen = () => {
        clearTimeout(timer);
        this.ws = ws;
        resolve(true);
      };
      ws.onerror = () => {
        clearTimeout(timer);
        resolve(false);
      };
      ws.onclose = () => this.markDead();
      ws.onmessage = (ev) => this.onMessage(String(ev.data));
    });
  }

  private markDead(): void {
    this.ws = null;
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.resolve(null);
    }
    this.pending.clear();
  }

  private onMessage(text: string): void {
    let msg: { id?: number; result?: { result?: { value?: unknown } } };
    try {
      msg = JSON.parse(text);
    } catch {
      return;
    }
    if (typeof msg.id === "number" && this.pending.has(msg.id)) {
      const p = this.pending.get(msg.id)!;
      clearTimeout(p.timer);
      this.pending.delete(msg.id);
      p.resolve(msg.result?.result?.value ?? null);
    }
  }

  /** Runtime.evaluate (returnByValue); resolves the JS value, or null on failure. */
  evaluate(expr: string, timeoutMs = 3000): Promise<unknown> {
    const ws = this.ws;
    if (!ws) return Promise.resolve(null);
    const id = ++this.msgId;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        resolve(null);
      }, timeoutMs);
      this.pending.set(id, { resolve, timer });
      try {
        ws.send(JSON.stringify({ id, method: "Runtime.evaluate", params: { expression: expr, returnByValue: true } }));
      } catch {
        clearTimeout(timer);
        this.pending.delete(id);
        resolve(null);
      }
    });
  }

  close(): void {
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      try { ws.close(); } catch { /* ignore */ }
    }
    this.markDead();
  }
}

const DISPOSE_EXPR = "window.__fuseLbFix ? (window.__fuseLbFix.dispose(), 'removed') : 'absent'";

/** Strip the fixed width/height so CSS sizes the glyph; keep the viewBox. */
function svgMarkup(file: string): string {
  return fs
    .readFileSync(file, "utf-8")
    .replace(/<svg([^>]*)>/, (_m, attrs: string) => `<svg${attrs.replace(/\s(?:width|height)="[^"]*"/g, "")}>`)
    .replace(/\s+/g, " ")
    .trim();
}

/** Cheap FNV-1a, so the liveness check stays a short string with the SVGs folded in. */
function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

export class LeaderboardFixPlugin extends FusePlugin {
  static override requiresCalibration = false;

  private ctx!: FuseContext;
  private cdp!: MetaCdp;
  private script = "";
  private upSvg = "";
  private downSvg = "";
  private sig = "";
  private cfgJson = "";
  private sinceCheck = 0;
  private busy = false;

  setup(ctx: FuseContext): void {
    this.ctx = ctx;
    const port = Number(process.env.FUSE_CDP_PORT ?? 9222) || 9222;
    this.cdp = new MetaCdp(port);
    this.script = fs.readFileSync(path.join(ctx.packageRoot, "js", "leaderboard_sort.js"), "utf-8");
    this.upSvg = svgMarkup(path.join(ctx.packageRoot, "assets", "up.svg"));
    this.downSvg = svgMarkup(path.join(ctx.packageRoot, "assets", "down.svg"));
    // Hashing the script too: a page-side edit or plugin upgrade must replace a live install.
    this.sig = hash(this.script + this.upSvg + this.downSvg);
    this.cfgJson = JSON.stringify({ upSvg: this.upSvg, downSvg: this.downSvg, sig: this.sig });
  }

  override tick(dt: number): void {
    this.sinceCheck += dt;
    if (this.sinceCheck >= 2) {
      this.sinceCheck = 0;
      void this.apply();
    }
  }

  private async apply(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      if (!(await this.cdp.ensure())) return; // meta page gone (in battle) - retry later

      const check = await this.cdp.evaluate(
        `window.__fuseLbFix && window.__fuseLbFix.sig === ${JSON.stringify(this.sig)} ? 'ok' : 'missing'`,
      );
      if (check === "ok") return;

      const res = await this.cdp.evaluate(`window.__fuseLbCfg = ${this.cfgJson};\n${this.script}`);
      const status = String(res ?? "null");
      if (status.indexOf("installed") === 0) this.ctx.logger.info(`Leaderboard Fix: ${status}`);
      else if (status !== "no-ctx") this.ctx.logger.warning(`Leaderboard Fix: install returned '${status}'`);
    } catch (e) {
      this.ctx.logger.warning(`Leaderboard Fix apply failed: ${String(e)}`);
    } finally {
      this.busy = false;
    }
  }

  override teardown(): void {
    try {
      void this.cdp.evaluate(DISPOSE_EXPR);
    } catch {
      /* ignore */
    }
    this.cdp.close();
  }
}
