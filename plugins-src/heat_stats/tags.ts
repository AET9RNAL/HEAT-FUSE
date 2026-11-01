/**
 * Player tags: the marks this account puts on other players. The player tags in the game.
 * `TagsInjector` keeps a page script on the game pages, sends it the marks, and collects the picks.
 * `TagStore` keeps each pick on this PC first, like battles, and syncs it when there is an account.
 */
import fs from "node:fs";
import path from "node:path";
import type { FuseContext } from "@fuse/plugin-sdk";

/** The groups. The slug is the icon's file name and the value stored, everywhere. */
export const GROUPS = ["danger", "target", "friend", "lowSkill", "trash", "blocked"] as const;

/** The group HS Block keeps out of your queue. */
export const BLOCKED_GROUP = "blocked";

const DEFAULT_CDP_PORT = 17503;

interface GameConfigService {
  get(): { port?: number };
}

export function cdpPort(ctx: FuseContext): number {
  const served = Number(ctx.services.get<GameConfigService>("game_config")?.get()?.port);
  if (Number.isInteger(served) && served >= 1024 && served <= 65535) return served;
  const env = Number(process.env.FUSE_CDP_PORT);
  if (Number.isInteger(env) && env >= 1024 && env <= 65535) return env;
  return DEFAULT_CDP_PORT;
}

/** How many marks the game draws beside a nickname. */
export const MARK_SLOTS = 3;

/** The service other plugins read marks through. */
export const TAGS_SERVICE = "heat_stats.tags";

/** Config key for a group's color. */
export const tagColorKey = (id: string): string => `tag_color_${id}`;

/**
 * Marks as another plugin sees them. Keyed by nickname without the discriminator, not by player id,
 * because in battle the game reports profileId 0 for everyone until the postmatch results exist.
 */
export interface TagsServiceState {
  groups: string[];
  colors: Record<string, string>;
  /** Group -> the icon as a data URI, so a consumer needs none of these files. */
  icons: Record<string, string>;
  byName: Record<string, string[]>;
  /** How many marks a consumer should draw. */
  slots: number;
}

export const TAG_COLOR_DEFAULT = "#8FFFB8";

/**
 * pending: not yet on the account, or there is no account.
 * synced: the service has this exact version.
 * A cleared tag keeps its record with an empty list, so the deletion can reach the account. Then the record goes.
 */
export type TagSync = "pending" | "synced";

export interface TagRecord {
  pid: string;
  /** Slot order. Only the first MARK_SLOTS reach the game. Empty means "remove". */
  tags: string[];
  name: string | null;
  sync: TagSync;
  updatedAt: number;
}

export function cleanTags(value: unknown): string[] {
  const out: string[] = [];
  for (const raw of Array.isArray(value) ? value : []) {
    const id = String(raw);
    if ((GROUPS as readonly string[]).includes(id) && !out.includes(id)) out.push(id);
  }
  return out.slice(0, MARK_SLOTS);
}

/** Which account these marks belong to. It is kept apart from the marks. */
interface TagOwner {
  user_id: string;
}

const OWNER_ID = "owner";

export class TagStore {
  private tags;
  private meta;
  private cache = new Map<string, TagRecord>();
  private loaded = false;

  constructor(ctx: FuseContext) {
    this.tags = ctx.storage.collection<TagRecord>("tags");
    this.meta = ctx.storage.collection<TagOwner>("tags_meta");
  }

  async load(): Promise<void> {
    if (this.loaded) return;
    const rows = await this.tags.query({ limit: 1000 });
    for (const row of rows) {
      const value = row.value;
      if (!value?.pid) continue;
      // Marks from before tag sync have no sync state. They were never sent.
      this.cache.set(value.pid, { ...value, sync: value.sync === "synced" ? "synced" : "pending" });
    }
    this.loaded = true;
  }

  /** The account these marks were last synced with, or null for local-only. */
  async owner(): Promise<string | null> {
    return (await this.meta.get(OWNER_ID))?.user_id ?? null;
  }

  async setOwner(userId: string): Promise<void> {
    await this.meta.put(OWNER_ID, { user_id: userId });
  }

  /** Everyone who still has a mark. A cleared record is a tombstone, not a player. */
  list(): TagRecord[] {
    return [...this.cache.values()].filter((r) => r.tags.length).sort((a, b) => b.updatedAt - a.updatedAt);
  }

  get(pid: string): string[] {
    return this.cache.get(pid)?.tags ?? [];
  }

  /** What the account does not have yet, oldest first. */
  pending(limit = 50): TagRecord[] {
    return [...this.cache.values()]
      .filter((r) => r.sync === "pending")
      .sort((a, b) => a.updatedAt - b.updatedAt)
      .slice(0, limit);
  }

  /** Clearing every mark leaves a tombstone, so the removal can still be sent. */
  async set(pid: string, tags: unknown, name?: string | null): Promise<TagRecord | null> {
    const id = String(pid ?? "").trim();
    if (!id) return null;
    const record: TagRecord = {
      pid: id,
      tags: cleanTags(tags),
      name: name ?? this.cache.get(id)?.name ?? null,
      sync: "pending",
      updatedAt: Date.now(),
    };
    this.cache.set(id, record);
    await this.tags.put(id, record);
    return record.tags.length ? record : null;
  }

  /** The service has this version. A synced tombstone has no more use, so it is deleted. */
  async markSynced(record: TagRecord): Promise<void> {
    const held = this.cache.get(record.pid);
    // A new tag during the write. The record stays pending for the next run.
    if (!held || held.updatedAt !== record.updatedAt) return;
    if (!held.tags.length) {
      this.cache.delete(record.pid);
      await this.tags.delete(record.pid);
      return;
    }
    const next: TagRecord = { ...held, sync: "synced" };
    this.cache.set(record.pid, next);
    await this.tags.put(record.pid, next);
  }

  /** A row from the account. The newer copy wins, so two PCs stay safe. A newer local copy stays pending. */
  async mirror(pid: string, tags: unknown, name: string | null, updatedAt: number): Promise<boolean> {
    const id = String(pid ?? "").trim();
    if (!id) return false;
    const held = this.cache.get(id);
    if (held && held.updatedAt >= updatedAt) return false;
    const record: TagRecord = { pid: id, tags: cleanTags(tags), name, sync: "synced", updatedAt };
    this.cache.set(id, record);
    await this.tags.put(id, record);
    return true;
  }

  /** For a sign-in to a different account. The old marks do not belong to it. */
  async clear(): Promise<void> {
    this.cache.clear();
    await this.tags.clear();
  }

  /**
   * What the service publishes: marks by nickname, without the discriminator. Two players with one
   * display name collide here. The newer mark wins, and surfaces keyed by id do not change.
   */
  byName(): Record<string, string[]> {
    const out: Record<string, string[]> = {};
    for (const record of this.list()) {
      const base = String(record.name ?? "").split("#")[0].trim();
      if (base) out[base] = record.tags;
    }
    return out;
  }

  /** Deletes rows the account no longer has. A local edit newer than the pull stays. */
  async prune(keep: Set<string>, before: number): Promise<boolean> {
    let dropped = false;
    for (const record of [...this.cache.values()]) {
      if (keep.has(record.pid) || record.sync === "pending" || record.updatedAt > before) continue;
      this.cache.delete(record.pid);
      await this.tags.delete(record.pid);
      dropped = true;
    }
    return dropped;
  }
}

/** One CDP socket to one game page. It connects again on demand. */
export class PageCdp {
  private ws: WebSocket | null = null;
  private msgId = 0;
  private pending = new Map<number, { resolve: (v: unknown) => void; timer: NodeJS.Timeout }>();
  private connecting = false;

  /** The port is read per call: the App can change it while FUSE runs. */
  constructor(private port: () => number, readonly fragment: string) {}

  async ensure(): Promise<boolean> {
    if (this.ws) return true;
    if (this.connecting) return false;
    this.connecting = true;
    try {
      const url = await this.discover();
      return url ? await this.open(url) : false;
    } finally {
      this.connecting = false;
    }
  }

  private async discover(): Promise<string | null> {
    try {
      const resp = await fetch(`http://localhost:${this.port()}/json`, { signal: AbortSignal.timeout(2000) });
      const targets = (await resp.json()) as Array<Record<string, unknown>>;
      if (!Array.isArray(targets)) return null;
      for (const t of targets) {
        if (t.type === "page" && String(t.url ?? "").includes(this.fragment)) {
          return (t.webSocketDebuggerUrl as string | undefined) ?? null;
        }
      }
    } catch {
      /* debugger down, or not in a battle */
    }
    return null;
  }

  private open(url: string): Promise<boolean> {
    return new Promise((resolve) => {
      let ws: WebSocket;
      try {
        ws = new WebSocket(url);
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

/**
 * A tag icon for inlining: sized by CSS, in the group's color, without the Figma clip-path defs.
 * Those defs have fixed ids, and the icon repeats on every row. The clip only bounds the artboard,
 * so it is not worth duplicate ids in one document.
 */
export function svgMarkup(file: string, color: string): string {
  return fs
    .readFileSync(file, "utf-8")
    // The export puts fill="none" on the root, and it overrides the colored paths below.
    .replace(/<svg([^>]*)>/, (_m, attrs: string) => {
      const clean = attrs.replace(/\s(?:width|height)="[^"]*"/g, "").replace(/\sfill="none"/, "");
      return `<svg${clean} fill="${color}">`;
    })
    .replace(/<defs>[\s\S]*?<\/defs>/g, "")
    .replace(/\sclip-path="url\(#[^"]*\)"/g, "")
    .replace(/fill="(?!none)[^"]*"/g, `fill="${color}"`)
    .replace(/\s+/g, " ")
    .trim();
}

/** FNV-1a, so a page-side edit or a plugin upgrade replaces a live install. */
export function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

interface TagPick {
  pid?: unknown;
  tags?: unknown;
  /** The nickname on the row, so the window has something to show. */
  name?: unknown;
}

/**
 * Three pages draw players. battle_app has the in-battle and postmatch boards, the meta page draws
 * the postmatch board again in the hangar, and markers are the nameplates over the tanks.
 * The player tags on the boards. Markers only show the marks.
 */
const PAGES = ["battle_app", "meta/index.html", "markers"];

export class TagsInjector {
  private pages: PageCdp[];
  private script = "";
  private sig = "";
  private groups: Array<{ id: string; label: string; color: string; svg: string; solid: string }> = [];
  private sinceCheck = 0;
  private busy = false;
  private installed = new Set<PageCdp>();

  constructor(
    private ctx: FuseContext,
    private store: TagStore,
    /** Called after picks land, so the window can redraw. */
    private onChange: () => void,
  ) {
    this.pages = PAGES.map((fragment) => new PageCdp(() => cdpPort(ctx), fragment));
  }

  setup(labels: Record<string, string>, colors: Record<string, string>): void {
    const root = this.ctx.packageRoot;
    this.script = fs.readFileSync(path.join(root, "js", "tags_scoreboard.js"), "utf-8");
    const icons = path.join(root, "assets", "icons", "tags");
    this.groups = GROUPS.map((id) => {
      const color = colors[id] || TAG_COLOR_DEFAULT;
      // The outline art has two contours per shape, so it reads as a ring at small sizes.
      // The `Solid` art is the filled silhouette, for places that draw the glyph alone.
      // A group without solid art uses the outline.
      const solid = path.join(icons, `${id}Solid.svg`);
      const artwork = fs.existsSync(solid) ? solid : path.join(icons, `${id}.svg`);
      return {
        id,
        label: labels[id] ?? id,
        color,
        // The page loads only coui:// URLs, so the icons go inline.
        svg: svgMarkup(path.join(icons, `${id}.svg`), color),
        solid: svgMarkup(artwork, color),
      };
    });
    this.sig = hash(this.script + JSON.stringify(this.groups));
  }

  /** Called from the plugin's tick. It costs little while no game page is open. */
  async pump(dt: number): Promise<void> {
    this.sinceCheck += dt;
    if (this.sinceCheck < 1 || this.busy || !this.script) return;
    this.sinceCheck = 0;
    this.busy = true;
    try {
      for (const page of this.pages) {
        if (!(await page.ensure())) {
          this.installed.delete(page);
          continue;
        }
        const alive = await page.evaluate(
          `window.__fuseTags && window.__fuseTags.sig === ${JSON.stringify(this.sig)} ? 'ok' : 'missing'`,
        );
        if (alive !== "ok") await this.install(page);
        else await this.drain(page);
      }
    } catch (e) {
      this.ctx.logger.warning(`HEAT Stats tags: ${String(e)}`);
    } finally {
      this.busy = false;
    }
  }

  /** The marks, each with its nickname. In battle every profileId is 0, so the live scoreboard finds marks by nickname only. */
  private marksJson(): string {
    return JSON.stringify(this.store.list().map((r) => ({ pid: r.pid, tags: r.tags, name: r.name })));
  }

  private async install(page: PageCdp): Promise<void> {
    const cfg = JSON.stringify({
      sig: this.sig,
      slots: MARK_SLOTS,
      groups: this.groups,
      marks: this.store.list().map((r) => ({ pid: r.pid, tags: r.tags, name: r.name })),
    });
    const expr = `window.__fuseTagsCfg = ${cfg};\n${this.script}`;
    const res = String((await page.evaluate(expr)) ?? "null");
    if (res.startsWith("installed")) {
      this.installed.add(page);
      this.ctx.logger.info(`HEAT Stats tags: ${res} on ${page.fragment}`);
    } else {
      this.installed.delete(page);
      // The page loads before its scoreboard. Only a real failure is logged.
      if (res !== "null") this.ctx.logger.warning(`HEAT Stats tags: install returned '${res}' on ${page.fragment}`);
    }
  }

  /** Takes the picks made in the game, stores them, and hands back the result. */
  private async drain(page: PageCdp): Promise<void> {
    const raw = await page.evaluate("JSON.stringify(window.__fuseTags.take())");
    let picks: TagPick[] = [];
    try {
      picks = JSON.parse(String(raw ?? "[]")) as TagPick[];
    } catch {
      return;
    }
    if (!Array.isArray(picks) || !picks.length) return;

    for (const pick of picks) {
      const pid = pick?.pid == null ? "" : String(pick.pid);
      if (pid) await this.store.set(pid, pick.tags, typeof pick.name === "string" ? pick.name : null);
    }
    // Each page drew its own guess. This sends the stored marks back to all of them.
    await this.refresh();
    this.onChange();
  }

  /** The groups as another plugin needs them: color, and the icon inline. */
  serviceGroups(): Pick<TagsServiceState, "groups" | "colors" | "icons"> {
    const colors: Record<string, string> = {};
    const icons: Record<string, string> = {};
    for (const group of this.groups) {
      colors[group.id] = group.color;
      // A data URI, because another plugin's overlay serves its own files only.
      icons[group.id] = `data:image/svg+xml;utf8,${encodeURIComponent(group.svg)}`;
    }
    return { groups: this.groups.map((g) => g.id), colors, icons };
  }

  /** What each page script can see. Use it when a row is not found. */
  async report(): Promise<Record<string, unknown>> {
    const out: Record<string, unknown> = {};
    for (const page of this.pages) {
      if (!(await page.ensure())) {
        out[page.fragment] = "page absent";
        continue;
      }
      const raw = await page.evaluate("JSON.stringify(window.__fuseTags ? window.__fuseTags.report() : null)");
      try {
        out[page.fragment] = JSON.parse(String(raw ?? "null"));
      } catch {
        out[page.fragment] = raw;
      }
    }
    return out;
  }

  /** Sends the stored marks without a pick, because the window also edits them. */
  async refresh(): Promise<void> {
    const marks = this.marksJson();
    for (const page of this.installed) {
      await page.evaluate(`window.__fuseTags && window.__fuseTags.set(${marks})`);
    }
  }

  teardown(): void {
    for (const page of this.pages) {
      try {
        void page.evaluate("window.__fuseTags ? (window.__fuseTags.dispose(), 'removed') : 'absent'");
      } catch {
        /* ignore */
      }
      page.close();
    }
    this.installed.clear();
  }
}
