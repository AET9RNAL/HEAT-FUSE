/**
 * HS Block: holds PLAY while a player tagged "blocked" can be in the same matchmaking queue.
 * The page script on the hangar does the searching and the drawing. This side sends it the players and logs what it did.
 */
import fs from "node:fs";
import path from "node:path";
import type { FuseContext } from "@fuse/plugin-sdk";
import { BLOCKED_GROUP, PageCdp, cdpPort, hash, svgMarkup, type TagStore } from "./tags.js";

export const BLOCK_RESUME_KEY = "block_resume";

/** The game's enemy colour, which the held PLAY button also takes. */
const BLOCK_RED = "#FF6D46";

export type GuardLabels = Record<"title" | "stopped" | "inHangar" | "players" | "resume" | "override" | "waiting", string>;

interface GuardEvent {
  kind?: unknown;
  on?: unknown;
  names?: unknown;
}

export class QueueGuard {
  private page: PageCdp;
  private script = "";
  private sig = "";
  private labels: GuardLabels | null = null;
  private logo = "";
  private sinceCheck = 0;
  private busy = false;
  private installed = false;

  constructor(
    private ctx: FuseContext,
    private store: TagStore,
    /** The page flipped "Resume queue when safe". */
    private onResume: (on: boolean) => void,
  ) {
    this.page = new PageCdp(() => cdpPort(ctx), "meta/index.html");
  }

  setup(labels: GuardLabels): void {
    const root = this.ctx.packageRoot;
    this.script = fs.readFileSync(path.join(root, "js", "queue_guard.js"), "utf-8");
    this.logo = svgMarkup(path.join(root, "assets", "HSLogo.svg"), BLOCK_RED);
    this.labels = labels;
    this.sig = hash(this.script + JSON.stringify(labels) + this.logo);
  }

  private players(): Array<{ pid: string; name: string | null }> {
    return this.store
      .list()
      .filter((r) => r.tags.includes(BLOCKED_GROUP))
      .map((r) => ({ pid: r.pid, name: r.name }));
  }

  private resume(): boolean {
    return Boolean(this.ctx.config.get(BLOCK_RESUME_KEY, false));
  }

  /** Called from the plugin's tick. The hangar page exists only between battles. */
  async pump(dt: number): Promise<void> {
    this.sinceCheck += dt;
    if (this.sinceCheck < 1 || this.busy || !this.script) return;
    this.sinceCheck = 0;
    this.busy = true;
    try {
      if (!(await this.page.ensure())) {
        this.installed = false;
        return;
      }
      const alive = await this.page.evaluate(
        `window.__fuseBlock && window.__fuseBlock.sig === ${JSON.stringify(this.sig)} ? 'ok' : 'missing'`,
      );
      if (alive !== "ok") await this.install();
      else await this.drain();
    } catch (e) {
      this.ctx.logger.warning(`HEAT Stats block: ${String(e)}`);
    } finally {
      this.busy = false;
    }
  }

  private async install(): Promise<void> {
    const cfg = JSON.stringify({
      sig: this.sig,
      labels: this.labels,
      logo: this.logo,
      players: this.players(),
      resume: this.resume(),
    });
    const res = String((await this.page.evaluate(`window.__fuseBlockCfg = ${cfg};\n${this.script}`)) ?? "null");
    this.installed = res.startsWith("installed");
    if (this.installed) this.ctx.logger.info(`HEAT Stats block: ${res}`);
    else if (res !== "null") this.ctx.logger.warning(`HEAT Stats block: install returned '${res}'`);
  }

  private async drain(): Promise<void> {
    const raw = await this.page.evaluate("JSON.stringify(window.__fuseBlock.take())");
    let events: GuardEvent[] = [];
    try {
      events = JSON.parse(String(raw ?? "[]")) as GuardEvent[];
    } catch {
      return;
    }
    if (!Array.isArray(events)) return;
    for (const ev of events) {
      if (ev?.kind === "resume") this.onResume(Boolean(ev.on));
      else if (ev?.kind === "held") {
        const names = Array.isArray(ev.names) ? ev.names.join(", ") : "";
        this.ctx.logger.info(`HEAT Stats block: held the queue for ${names}`);
      } else if (ev?.kind === "override") this.ctx.logger.info("HEAT Stats block: queued anyway on the second press");
      else if (ev?.kind === "resumed") this.ctx.logger.info("HEAT Stats block: queued once it was safe");
    }
  }

  /** Sends the blocked players and the resume pick after a change. */
  async refresh(): Promise<void> {
    if (!this.installed) return;
    await this.page.evaluate(
      `window.__fuseBlock && window.__fuseBlock.set(${JSON.stringify(this.players())}, ${JSON.stringify(this.resume())})`,
    );
  }

  /** What the page script knows, for a log or a bug report. */
  async report(): Promise<unknown> {
    if (!(await this.page.ensure())) return "page absent";
    const raw = await this.page.evaluate("JSON.stringify(window.__fuseBlock ? window.__fuseBlock.report() : null)");
    try {
      return JSON.parse(String(raw ?? "null"));
    } catch {
      return raw;
    }
  }

  teardown(): void {
    try {
      void this.page.evaluate("window.__fuseBlock ? (window.__fuseBlock.dispose(), 'removed') : 'absent'");
    } catch {
      /* ignore */
    }
    this.page.close();
    this.installed = false;
  }
}
