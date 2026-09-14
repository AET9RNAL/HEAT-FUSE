/**
 * Self-tests for the plugin APIs, run from the demo's inspector. Every case goes
 * through the real runtime, including the calls that must be refused.
 */
import type { FuseContext, StorageCollection, StorageOp, StorageWhere } from "@fuse/plugin-sdk";

export type TestStatus = "pass" | "fail" | "skip";

export interface TestResult {
  group: string;
  name: string;
  status: TestStatus;
  detail: string;
  ms: number;
}

export interface TestReport {
  results: TestResult[];
  passed: number;
  failed: number;
  skipped: number;
  total: number;
  done: boolean;
}

const CASE_TIMEOUT_MS = 20_000;
/** Past the runtime's 5 s user-action window, counted from the button press. */
const USER_ACTION_WAIT_MS = 5_700;
const PLUGIN_ID = "inspector_demo";
const SERVICE = "inspector_demo";
const SELFTEST = "selftest";
const OTHER = "selftest.other";
/** Secrets live in Electron main; a runtime started on its own can't reach them. */
const OUTSIDE_APP = "not available outside the FUSE app";

class Skipped extends Error {}

interface T {
  ok(condition: unknown, message: string): void;
  equal(actual: unknown, expected: unknown, what?: string): void;
  /** Resolves with the refusal's message. */
  rejects(work: Promise<unknown>, expected: string | RegExp): Promise<string>;
  throws(work: () => unknown, expected: string | RegExp): string;
  skip(reason: string): never;
  note(text: string): void;
}

interface Case {
  group: string;
  name: string;
  /** Waits on purpose; only in the slow run. */
  slow?: boolean;
  run(t: T): Promise<void> | void;
}

interface DemoService {
  ping(): Promise<string>;
  echo(value: unknown): Promise<unknown>;
  fail(): Promise<never>;
  bigint(): Promise<unknown>;
  hang(): Promise<never>;
  resetCounter(): Promise<boolean>;
  counter?: number;
  nope?: unknown;
}

interface Rec {
  name: string;
  score: number;
  tier?: { level: number };
  active?: boolean;
  note?: string | null;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const text = (e: unknown): string => (e instanceof Error ? e.message : String(e));

function show(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

function matches(message: string, expected: string | RegExp): boolean {
  return typeof expected === "string" ? message.includes(expected) : expected.test(message);
}

function tools(notes: string[]): T {
  return {
    ok(condition, message) {
      if (!condition) throw new Error(message);
    },
    equal(actual, expected, what) {
      if (show(actual) !== show(expected)) {
        throw new Error(`${what ? `${what}: ` : ""}got ${show(actual)}, expected ${show(expected)}`);
      }
    },
    async rejects(work, expected) {
      try {
        await work;
      } catch (e) {
        const message = text(e);
        if (!matches(message, expected)) throw new Error(`refused with "${message}", expected ${String(expected)}`);
        notes.push(`refused: ${message}`);
        return message;
      }
      throw new Error(`succeeded, but should have been refused (${String(expected)})`);
    },
    throws(work, expected) {
      try {
        work();
      } catch (e) {
        const message = text(e);
        if (!matches(message, expected)) throw new Error(`threw "${message}", expected ${String(expected)}`);
        notes.push(`threw: ${message}`);
        return message;
      }
      throw new Error(`didn't throw (${String(expected)})`);
    },
    skip(reason) {
      throw new Skipped(reason);
    },
    note(line) {
      notes.push(line);
    },
  };
}

function withTimeout<R>(work: Promise<R>, ms: number): Promise<R> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`no result after ${ms / 1000} s`)), ms);
  });
  return Promise.race([work, limit]).finally(() => clearTimeout(timer));
}

function cases(ctx: FuseContext, startedAt: number): Case[] {
  const perms = ctx.permissions;
  const col = (): StorageCollection<Rec> => ctx.storage.collection<Rec>(SELFTEST);
  const ids = (rows: Array<{ id: string }>): string[] => rows.map((r) => r.id);

  const needStorage = (t: T): void => {
    if (!perms.has("storage")) t.skip(`storage is ${perms.state("storage")}`);
  };
  const needSecrets = (t: T): void => {
    if (!perms.has("secrets")) t.skip(`secrets are ${perms.state("secrets")}`);
  };

  async function seed(): Promise<StorageCollection<Rec>> {
    const c = col();
    await c.clear();
    await c.put("low", { name: "low", score: 1, tier: { level: 1 }, active: false });
    await c.put("mid", { name: "mid", score: 5, tier: { level: 2 }, active: true, note: null });
    await c.put("high", { name: "high", score: 9, tier: { level: 2 }, active: true, note: "x" });
    return c;
  }

  async function inApp<R>(t: T, work: Promise<R>): Promise<R> {
    try {
      return await work;
    } catch (e) {
      if (text(e).includes(OUTSIDE_APP)) t.skip("the runtime was started outside the FUSE app");
      throw e;
    }
  }

  // A provider's own service arrives like anyone else's: subscribe, then wait for its state.
  async function serviceNamed<S>(name: string): Promise<S | undefined> {
    for (let i = 0; i < 40; i++) {
      const svc = ctx.services.get<S>(name);
      if (svc) return svc;
      await sleep(50);
    }
    return undefined;
  }

  async function service(): Promise<DemoService> {
    const svc = await serviceNamed<DemoService>(SERVICE);
    if (!svc) throw new Error(`service '${SERVICE}' never showed up`);
    return svc;
  }

  return [
    // --- storage ------------------------------------------------------------
    {
      group: "storage",
      name: "without the permission, every call is refused",
      async run(t) {
        if (perms.has("storage")) t.skip("storage is allowed");
        await t.rejects(col().get("a"), "'storage' permission");
        await t.rejects(col().count(), "'storage' permission");
      },
    },
    {
      group: "storage",
      name: "put then get returns the same document",
      async run(t) {
        needStorage(t);
        const c = col();
        await c.clear();
        const doc: Rec = { name: "alpha", score: 3, tier: { level: 2 }, active: true, note: null };
        await c.put("a", doc);
        t.equal(await c.get("a"), doc);
      },
    },
    {
      group: "storage",
      name: "a missing id reads as undefined",
      async run(t) {
        needStorage(t);
        t.equal(await col().get("missing"), undefined);
      },
    },
    {
      group: "storage",
      name: "put replaces the whole document",
      async run(t) {
        needStorage(t);
        const c = col();
        await c.put("a", { name: "alpha", score: 3, tier: { level: 2 } });
        await c.put("a", { name: "alpha2", score: 4 });
        t.equal(await c.get("a"), { name: "alpha2", score: 4 });
      },
    },
    {
      group: "storage",
      name: "update merges into an object document",
      async run(t) {
        needStorage(t);
        const c = col();
        await c.put("b", { name: "beta", score: 1 });
        t.equal(await c.update("b", { score: 5 }), true, "update result");
        t.equal(await c.get("b"), { name: "beta", score: 5 });
      },
    },
    {
      group: "storage",
      name: "update of a missing id returns false",
      async run(t) {
        needStorage(t);
        t.equal(await col().update("nobody", { score: 1 }), false);
        t.equal(await col().get("nobody"), undefined, "nothing created");
      },
    },
    {
      group: "storage",
      name: "update of a non-object document is refused",
      async run(t) {
        needStorage(t);
        await ctx.storage.collection<unknown>(SELFTEST).put("scalar", 5);
        await t.rejects(ctx.storage.collection<Record<string, unknown>>(SELFTEST).update("scalar", { x: 1 }), "object document");
        t.equal(await ctx.storage.collection<unknown>(SELFTEST).get("scalar"), 5, "left unchanged");
      },
    },
    {
      group: "storage",
      name: "query filters, orders and pages",
      async run(t) {
        needStorage(t);
        const c = await seed();
        t.equal(ids(await c.query({ where: [["score", ">=", 5]], orderBy: ["score", "desc"] })), ["high", "mid"], ">= desc");
        t.equal(ids(await c.query({ where: [["score", "<", 5]] })), ["low"], "<");
        t.equal(ids(await c.query({ where: [["name", "!=", "mid"]], orderBy: ["name"] })), ["high", "low"], "!=");
        t.equal(ids(await c.query({ orderBy: ["score"], limit: 1, offset: 1 })), ["mid"], "limit and offset");
        t.equal(ids(await c.query({ where: [["score", ">", 1], ["score", "<=", 5]] })), ["mid"], "clauses combine with AND");
      },
    },
    {
      group: "storage",
      name: "'in', nested fields, booleans and null",
      async run(t) {
        needStorage(t);
        const c = await seed();
        t.equal(ids(await c.query({ where: [["name", "in", ["low", "high"]]], orderBy: ["score"] })), ["low", "high"], "in");
        t.equal(ids(await c.query({ where: [["tier.level", "==", 2]], orderBy: ["score"] })), ["mid", "high"], "nested");
        t.equal(ids(await c.query({ where: [["active", "==", true]], orderBy: ["score"] })), ["mid", "high"], "boolean");
        t.equal(ids(await c.query({ where: [["note", "==", null]], orderBy: ["score"] })), ["low", "mid"], "null or missing");
        t.equal(ids(await c.query({ where: [["note", "!=", null]] })), ["high"], "not null");
      },
    },
    {
      group: "storage",
      name: "count honours the filter",
      async run(t) {
        needStorage(t);
        const c = await seed();
        t.equal(await c.count(), 3, "all");
        t.equal(await c.count({ where: [["active", "==", true]] }), 2, "active");
        t.equal(await c.count({ where: [["score", ">", 100]] }), 0, "none");
      },
    },
    {
      group: "storage",
      name: "limit and offset are clamped",
      async run(t) {
        needStorage(t);
        const c = await seed();
        t.equal((await c.query({ limit: 0 })).length, 1, "limit 0 reads one row");
        t.equal((await c.query({ limit: -5, offset: -2 })).length, 1, "negative values");
        t.equal((await c.query({ limit: 1e9 })).length, 3, "huge limit");
      },
    },
    {
      group: "storage",
      name: "delete returns true once, then false",
      async run(t) {
        needStorage(t);
        const c = await seed();
        t.equal(await c.delete("low"), true, "first delete");
        t.equal(await c.delete("low"), false, "second delete");
        t.equal(await c.count(), 2, "count after");
      },
    },
    {
      group: "storage",
      name: "clear empties only its own collection",
      async run(t) {
        needStorage(t);
        const c = await seed();
        const other = ctx.storage.collection<{ v: number }>(OTHER);
        await other.put("keep", { v: 1 });
        await c.clear();
        t.equal(await c.count(), 0, "cleared");
        t.equal(await other.get("keep"), { v: 1 }, "other collection kept");
        await other.clear();
      },
    },
    {
      group: "storage",
      name: "concurrent and bulk writes all land",
      async run(t) {
        needStorage(t);
        const c = col();
        await c.clear();
        await Promise.all(Array.from({ length: 50 }, (_, i) => c.put(`p${i}`, { name: `p${i}`, score: i })));
        t.equal(await c.count(), 50, "50 concurrent puts");
        for (let i = 50; i < 250; i++) await c.put(`p${i}`, { name: `p${i}`, score: i });
        t.equal(await c.count(), 250, "then 200 sequential");
        t.equal((await c.query({ orderBy: ["score", "desc"], limit: 1 }))[0]?.id, "p249", "ordering by number");
        await c.clear();
      },
    },
    {
      group: "storage",
      name: "text that looks like SQL is stored as text",
      async run(t) {
        needStorage(t);
        const c = col();
        const evil: Rec = { name: "'); DROP TABLE docs; --", score: 0 };
        await c.put("x'); DROP TABLE docs; --", evil);
        t.equal(await c.get("x'); DROP TABLE docs; --"), evil, "round trip");
        t.equal(ids(await c.query({ where: [["name", "==", evil.name]] })), ["x'); DROP TABLE docs; --"], "query by it");
      },
    },
    {
      group: "storage",
      name: "collection names are checked",
      async run(t) {
        needStorage(t);
        await t.rejects(ctx.storage.collection("../escape").get("x"), "collection names");
        await t.rejects(ctx.storage.collection("").count(), "collection names");
        await t.rejects(ctx.storage.collection("x".repeat(65)).count(), "collection names");
      },
    },
    {
      group: "storage",
      name: "document ids are checked",
      async run(t) {
        needStorage(t);
        await t.rejects(col().put("", { name: "", score: 0 }), "document ids");
        await t.rejects(col().get("x".repeat(257)), "document ids");
        await t.rejects(ctx.storage.collection<unknown>(SELFTEST).get(42 as unknown as string), "document ids");
      },
    },
    {
      group: "storage",
      name: "field paths are checked",
      async run(t) {
        needStorage(t);
        await t.rejects(col().query({ where: [["score) OR 1=1 --", "==", 1]] }), "fields are");
        await t.rejects(col().query({ orderBy: ["$.score"] }), "fields are");
        await t.rejects(col().count({ where: [["", "==", 1]] }), "fields are");
      },
    },
    {
      group: "storage",
      name: "malformed where clauses are refused",
      async run(t) {
        needStorage(t);
        await t.rejects(col().query({ where: [["score", "like" as StorageOp, 1]] }), "unsupported operator");
        await t.rejects(col().query({ where: [["score", "=="] as unknown as StorageWhere] }), "each where clause");
        await t.rejects(col().query({ where: [["name", "in", []]] }), "non-empty array");
        await t.rejects(col().query({ where: [["name", "in", "abc"]] }), "non-empty array");
      },
    },
    {
      group: "storage",
      name: "query values must be plain",
      async run(t) {
        needStorage(t);
        await t.rejects(col().query({ where: [["score", "==", { a: 1 }]] }), "query values");
        await t.rejects(col().query({ where: [["score", "==", [1]]] }), "query values");
      },
    },
    {
      group: "storage",
      name: "documents over 1 MB are refused",
      async run(t) {
        needStorage(t);
        await t.rejects(col().put("big", { name: "x".repeat(1024 * 1024), score: 0 }), "limit is");
        t.equal(await col().get("big"), undefined, "nothing stored");
      },
    },
    {
      group: "storage",
      name: "an update that would pass 1 MB is refused",
      async run(t) {
        needStorage(t);
        await col().put("grow", { name: "small", score: 1 });
        await t.rejects(col().update("grow", { name: "x".repeat(1024 * 1024) }), "limit is");
        t.equal(await col().get("grow"), { name: "small", score: 1 }, "left unchanged");
      },
    },
    {
      group: "storage",
      name: "ids are exact and case-sensitive",
      async run(t) {
        needStorage(t);
        const c = col();
        await c.put("Case", { name: "upper", score: 1 });
        await c.put("ключ 🔑", { name: "unicode", score: 2 });
        t.equal(await c.get("case"), undefined, "different case");
        t.equal(await c.get("Case "), undefined, "trailing space");
        t.equal((await c.get("ключ 🔑"))?.name, "unicode", "non-ASCII id");
      },
    },
    {
      group: "storage",
      name: "numbers and numeric strings don't match each other",
      async run(t) {
        needStorage(t);
        const c = await seed();
        t.equal(ids(await c.query({ where: [["score", "==", "5"]] })), [], "string against a number");
        t.equal(ids(await c.query({ where: [["score", "==", 5]] })), ["mid"], "number against a number");
      },
    },

    // --- secrets ------------------------------------------------------------
    {
      group: "secrets",
      name: "without the permission, every call is refused",
      async run(t) {
        if (perms.has("secrets")) t.skip("secrets are allowed");
        await t.rejects(ctx.secrets.get("selftest.token"), "'secrets' permission");
        await t.rejects(ctx.secrets.set("selftest.token", "x"), "'secrets' permission");
      },
    },
    {
      group: "secrets",
      name: "set, get, has and delete round-trip",
      async run(t) {
        needSecrets(t);
        const key = "selftest.token";
        const value = `v-${Date.now()}`;
        await inApp(t, ctx.secrets.set(key, value));
        t.equal(await ctx.secrets.get(key), value, "get");
        t.equal(await ctx.secrets.has(key), true, "has");
        t.equal(await ctx.secrets.delete(key), true, "delete");
        t.equal(await ctx.secrets.has(key), false, "has after delete");
        t.equal(await ctx.secrets.delete(key), false, "second delete");
        t.equal(await ctx.secrets.get(key), undefined, "get after delete");
      },
    },
    {
      group: "secrets",
      name: "non-ASCII values survive",
      async run(t) {
        needSecrets(t);
        const value = "ключ 🔑 \"quoted\" \n newline";
        await inApp(t, ctx.secrets.set("selftest.unicode", value));
        t.equal(await ctx.secrets.get("selftest.unicode"), value);
        await ctx.secrets.delete("selftest.unicode");
      },
    },
    {
      group: "secrets",
      name: "keys are checked",
      async run(t) {
        needSecrets(t);
        await t.rejects(ctx.secrets.set("bad key!", "x"), "secret keys");
        await t.rejects(ctx.secrets.get(""), "secret keys");
        await t.rejects(ctx.secrets.has("k".repeat(129)), "secret keys");
        await t.rejects(ctx.secrets.delete("../other_plugin"), "secret keys");
      },
    },
    {
      group: "secrets",
      name: "values must be strings",
      async run(t) {
        needSecrets(t);
        await t.rejects(ctx.secrets.set("selftest.number", 42 as unknown as string), "must be strings");
        await t.rejects(ctx.secrets.set("selftest.object", { a: 1 } as unknown as string), "must be strings");
      },
    },
    {
      group: "secrets",
      name: "values over 16 KB are refused",
      async run(t) {
        needSecrets(t);
        await t.rejects(ctx.secrets.set("selftest.big", "x".repeat(16 * 1024 + 1)), "limited to");
      },
    },
    {
      group: "secrets",
      name: "keys are case-sensitive",
      async run(t) {
        needSecrets(t);
        await inApp(t, ctx.secrets.set("selftest.Case", "upper"));
        t.equal(await ctx.secrets.get("selftest.case"), undefined, "different case");
        t.equal(await ctx.secrets.get("selftest.Case"), "upper", "same case");
        await ctx.secrets.delete("selftest.Case");
      },
    },
    {
      group: "secrets",
      name: "a plugin keeps at most 100 secrets",
      async run(t) {
        needSecrets(t);
        const keys: string[] = [];
        let refusal = "";
        try {
          for (let i = 0; i < 101 && !refusal; i++) {
            const key = `selftest.limit${i}`;
            try {
              await inApp(t, ctx.secrets.set(key, "x"));
              keys.push(key);
            } catch (e) {
              if (e instanceof Skipped) throw e;
              refusal = text(e);
            }
          }
          t.ok(refusal.includes("up to 100 secrets"), refusal ? `refused with "${refusal}"` : "101 secrets were stored");
          t.ok(keys.length > 0 && keys.length <= 100, `${keys.length} stored before the refusal`);
          const first = keys[0]!;
          await ctx.secrets.set(first, "replaced");
          t.equal(await ctx.secrets.get(first), "replaced", "overwriting a key at the limit");
          t.note(`${keys.length} stored, then refused`);
        } finally {
          for (const key of keys) await ctx.secrets.delete(key).catch(() => {});
        }
      },
    },

    // --- links --------------------------------------------------------------
    {
      group: "links",
      name: "http links are refused",
      async run(t) {
        await t.rejects(ctx.links.open("http://example.com/"), "only https");
      },
    },
    {
      group: "links",
      name: "other schemes are refused",
      async run(t) {
        await t.rejects(ctx.links.open("javascript:alert(1)"), "only https");
        await t.rejects(ctx.links.open("file:///C:/Windows/win.ini"), "only https");
        await t.rejects(ctx.links.open(`fuse://plugin/${PLUGIN_ID}/loop`), "only https");
      },
    },
    {
      group: "links",
      name: "malformed links are refused",
      async run(t) {
        await t.rejects(ctx.links.open("not a url"), "valid URL");
        await t.rejects(ctx.links.open(""), "valid URL");
      },
    },
    {
      group: "links",
      name: "overlong links are refused",
      async run(t) {
        await t.rejects(ctx.links.open(`https://example.com/${"a".repeat(2100)}`), "limited to");
      },
    },
    {
      group: "links",
      name: "links with a user name or password are refused",
      async run(t) {
        await t.rejects(ctx.links.open("https://user:pass@example.com/"), "user name or password");
      },
    },
    {
      group: "links",
      name: "without a recent user action, open returns false",
      slow: true,
      async run(t) {
        const wait = startedAt + USER_ACTION_WAIT_MS - Date.now();
        if (wait > 0) await sleep(wait);
        t.note("waited out the 5 s user-action window");
        t.equal(await ctx.links.open("https://example.com/?fuse-selftest"), false);
      },
    },

    // --- permissions --------------------------------------------------------
    {
      group: "permissions",
      name: "declared scopes report a decision",
      run(t) {
        for (const scope of ["storage", "secrets", "network", `${SERVICE}.admin`]) {
          t.ok(["granted", "denied", "prompt"].includes(perms.state(scope)), `${scope} is ${perms.state(scope)}`);
        }
      },
    },
    {
      group: "permissions",
      name: "undeclared scopes read as undeclared",
      run(t) {
        t.equal(perms.state("game"), "undeclared", "game");
        t.equal(perms.has("game"), false, "has(game)");
        t.equal(perms.state("no_such_scope"), "undeclared", "unknown scope");
        t.equal(perms.state("accessors.ui"), "undeclared", "another plugin's scope");
      },
    },
    {
      group: "permissions",
      name: "asking for an undeclared scope is denied",
      async run(t) {
        t.equal(await perms.request("game"), "denied");
        t.note("FUSE shows a 'blocked' notice once per session");
      },
    },
    {
      group: "permissions",
      name: "normal scopes can't be asked for again",
      async run(t) {
        const before = perms.state("storage");
        t.equal(await perms.request("storage"), before === "granted" ? "granted" : "denied");
      },
    },
    {
      group: "permissions",
      name: "undeclared audio stays silent",
      run(t) {
        t.equal(ctx.audio.play("missing.mp3"), "");
      },
    },
    {
      group: "permissions",
      name: "a dangerous scope can't be asked for without a recent user action",
      slow: true,
      async run(t) {
        const scope = ["network", `${SERVICE}.admin`].find((s) => perms.state(s) !== "granted");
        if (!scope) return t.skip("every dangerous scope is already allowed");
        const wait = startedAt + USER_ACTION_WAIT_MS - Date.now();
        if (wait > 0) await sleep(wait);
        t.equal(await perms.request(scope), "denied");
        t.note(`asked for ${scope} with no click in the last 5 s; no card should appear`);
      },
    },

    // --- services -----------------------------------------------------------
    {
      group: "services",
      name: "unscoped methods answer",
      async run(t) {
        const svc = await service();
        t.equal(await svc.ping(), "pong");
      },
    },
    {
      group: "services",
      name: "arguments and results cross as JSON",
      async run(t) {
        const svc = await service();
        const value = { list: [1, "two", null], nested: { ok: true } };
        t.equal(await svc.echo(value), value, "object");
        t.equal(await svc.echo(undefined), null, "undefined arrives as null");
      },
    },
    {
      group: "services",
      name: "errors thrown by the provider reach the caller",
      async run(t) {
        const svc = await service();
        await t.rejects(svc.fail(), "boom");
      },
    },
    {
      group: "services",
      name: "results that aren't JSON are refused",
      async run(t) {
        const svc = await service();
        await t.rejects(svc.bigint(), "BigInt");
      },
    },
    {
      group: "services",
      name: "scoped methods follow the permission",
      async run(t) {
        const svc = await service();
        if (perms.has(`${SERVICE}.admin`)) {
          t.equal(await svc.resetCounter(), true);
          t.note("Demo admin is allowed");
        } else {
          await t.rejects(svc.resetCounter(), `needs the '${SERVICE}.admin' permission`);
        }
      },
    },
    {
      group: "services",
      name: "scoped state follows the permission",
      async run(t) {
        const svc = await service();
        await sleep(150);
        if (perms.has(`${SERVICE}.admin`)) t.equal(typeof svc.counter, "number", "counter visible");
        else t.equal(svc.counter, undefined, "counter hidden");
      },
    },
    {
      group: "services",
      name: "unknown members aren't callable",
      async run(t) {
        const svc = await service();
        t.equal(typeof svc.nope, "undefined");
      },
    },
    {
      group: "services",
      name: "missing services read as undefined, and require throws",
      run(t) {
        t.equal(ctx.services.get("no_such_service"), undefined, "get");
        t.throws(() => ctx.services.require("no_such_service"), "is not registered");
      },
    },
    {
      group: "services",
      name: "a name another provider owns can't be taken over",
      async run(t) {
        type Keyboard = Record<string, unknown>;
        if (!(await serviceNamed<Keyboard>("keyboard"))) return t.skip("FUSE's keyboard service isn't running");
        // Never call it: FUSE's keyboard service presses real keys.
        ctx.services.provide("keyboard", { target: { press: () => "hijacked" }, methods: ["press"] });
        await sleep(300);
        t.equal(typeof ctx.services.get<Keyboard>("keyboard")?.isHeld, "function", "still FUSE's service");
        ctx.services.unregister("keyboard");
        await sleep(200);
        t.equal(typeof ctx.services.get<Keyboard>("keyboard")?.isHeld, "function", "unregister can't remove it");
      },
    },
    {
      group: "services",
      name: "unlisted methods stay hidden, and a withdrawn service fails cleanly",
      async run(t) {
        type Temp = { ping(): Promise<string>; secret?: unknown; up?: boolean };
        const name = `${SERVICE}_temp`;
        ctx.services.provide(name, {
          target: { ping: () => "pong", secret: () => "leak" },
          methods: ["ping"],
          state: () => ({ up: true }),
        });
        const svc = await serviceNamed<Temp>(name);
        if (!svc) throw new Error("the temporary service never showed up");
        for (let i = 0; i < 20 && svc.up !== true; i++) await sleep(50);
        t.equal(await svc.ping(), "pong", "listed method");
        t.equal(typeof svc.secret, "undefined", "unlisted method");
        t.equal(svc.up, true, "state before");
        ctx.services.unregister(name);
        let message = "";
        for (let i = 0; i < 40 && !message.includes("isn't available"); i++) {
          await sleep(50);
          message = await svc.ping().then(() => "", (e: unknown) => text(e));
        }
        t.ok(message.includes("isn't available"), `after withdrawing: "${message || "still answering"}"`);
        t.equal(svc.up, undefined, "state after");
      },
    },
    {
      group: "services",
      name: "legacy register shares methods",
      async run(t) {
        const name = `${SERVICE}_legacy`;
        ctx.services.register(name, { double: (n: number) => n * 2 });
        const svc = await serviceNamed<{ double(n: number): Promise<number> }>(name);
        if (!svc) throw new Error("the registered service never showed up");
        t.equal(await svc.double(21), 42);
        ctx.services.unregister(name);
      },
    },
    {
      group: "services",
      name: "a provider that never answers times out",
      slow: true,
      async run(t) {
        const svc = await service();
        await t.rejects(svc.hang(), "timed out");
      },
    },

    // --- core ---------------------------------------------------------------
    {
      group: "core",
      name: "config.get without a default throws for a missing key",
      run(t) {
        t.throws(() => ctx.config.get("selftest_missing_key"), "not found");
      },
    },
    {
      group: "core",
      name: "config.get falls back to its default",
      run(t) {
        t.equal(ctx.config.get("selftest_missing_key", 7), 7);
      },
    },
    {
      group: "core",
      name: "events round-trip through the runtime",
      async run(t) {
        let got: unknown = null;
        const handler = (payload: Record<string, unknown>): void => {
          got = payload;
        };
        ctx.events.subscribe(`${PLUGIN_ID}.selftest`, handler);
        ctx.events.emit(`${PLUGIN_ID}.selftest`, { n: 1 });
        for (let i = 0; i < 40 && got === null; i++) await sleep(50);
        ctx.events.unsubscribe(`${PLUGIN_ID}.selftest`, handler);
        t.equal(got, { n: 1 });
      },
    },
    {
      group: "core",
      name: "plugins can't emit host_* events",
      async run(t) {
        let fired = false;
        const handler = (): void => {
          fired = true;
        };
        ctx.events.subscribe("host_selftest_fake", handler);
        ctx.events.emit("host_selftest_fake", {});
        await sleep(300);
        ctx.events.unsubscribe("host_selftest_fake", handler);
        t.equal(fired, false);
      },
    },
    {
      group: "core",
      name: "an empty hotkey combo throws",
      run(t) {
        t.throws(() => ctx.hotkeys.register(" + ", () => {}), "empty hotkey combo");
      },
    },
    {
      group: "core",
      name: "notification ids carry the plugin id",
      run(t) {
        const id = ctx.notifications.notify({ type: "info", title: "Self-test", message: "Checking notification ids.", duration: 1500 });
        t.ok(id.startsWith(`${PLUGIN_ID}:`), `id was '${id}'`);
        ctx.notifications.dismiss(id);
      },
    },
    {
      group: "core",
      name: "dismissing an unknown notification is harmless",
      run() {
        ctx.notifications.dismiss("no_such_notification");
        ctx.notifications.dismiss("");
      },
    },
    {
      group: "core",
      name: "live config writes reach watchers",
      run(t) {
        let seen: unknown;
        ctx.config.watch("selftest_live", (value) => {
          seen = value;
        });
        const value = Date.now();
        ctx.config.setLive("selftest_live", value);
        t.equal(seen, value, "watcher");
        t.equal(ctx.config.get("selftest_live"), value, "read back");
      },
    },
    {
      group: "core",
      name: "broadcasts never throw; FUSE drops types without the plugin's prefix",
      run(t) {
        ctx.host.broadcast({ type: `${PLUGIN_ID}.selftest`, at: Date.now() });
        ctx.host.broadcast({ type: "selftest_unprefixed" });
        ctx.host.broadcast({});
        t.note("the runtime log shows the two refusals");
      },
    },
    {
      group: "core",
      name: "a combo FUSE owns isn't taken over",
      run(t) {
        let fired = false;
        ctx.hotkeys.register("ctrl+l", () => {
          fired = true;
        }, "Self-test steal");
        t.equal(ctx.hotkeys.unregister("ctrl+l"), true, "the plugin's own record is removed");
        t.equal(fired, false, "never fired");
        t.note("FUSE keeps Ctrl+L; the runtime log shows the refusal");
      },
    },
  ];
}

export async function runSelfTests(
  ctx: FuseContext,
  opts: { slow: boolean; onProgress?: (report: TestReport) => void },
): Promise<TestReport> {
  const startedAt = Date.now();
  const list = cases(ctx, startedAt).filter((c) => opts.slow || !c.slow);
  const report: TestReport = { results: [], passed: 0, failed: 0, skipped: 0, total: list.length, done: false };
  try {
    for (const c of list) {
      const started = Date.now();
      const notes: string[] = [];
      let status: TestStatus = "pass";
      let detail = "";
      try {
        await withTimeout(Promise.resolve().then(() => c.run(tools(notes))), CASE_TIMEOUT_MS);
        detail = notes.join("; ");
      } catch (e) {
        status = e instanceof Skipped ? "skip" : "fail";
        detail = text(e);
      }
      report.results.push({ group: c.group, name: c.name, status, detail, ms: Date.now() - started });
      if (status === "pass") report.passed++;
      else if (status === "fail") report.failed++;
      else report.skipped++;
      opts.onProgress?.(report);
    }
  } finally {
    if (ctx.permissions.has("storage")) {
      await ctx.storage.collection(SELFTEST).clear().catch(() => {});
      await ctx.storage.collection(OTHER).clear().catch(() => {});
    }
    report.done = true;
  }
  return report;
}
