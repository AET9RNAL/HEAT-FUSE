/**
 * Override parts of plugins: prebuilt game file packs (presets) and the project edits they need.
 *
 * The hub keeps each plugin's pick, checks the picked preset against the game files, and refuses exact
 * collisions between plugins (the same pack entry or the same project key). It sends the wanted state to
 * Electron main, the only writer of game files. Main applies the state while the game is closed and answers
 * with a status for each plugin.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { logger } from "../log.js";
import type { OverridePresetInfo, OverrideState, OverrideStatus, OverridesSnapshot } from "../sdk/overrides.js";
import type { DiscoveredPlugin } from "./types.js";

const APPLY_FORMAT = "fuse-override/1";
const PRESET_ID_RE = /^[A-Za-z0-9_-]{1,48}$/;
const ENTRY_RE = /^\.assets\/output\/[^/\\]+$/;
const SHA256_RE = /^[0-9a-f]{64}$/;

export type ProjectOp =
  | { op: "set"; key: string; value: unknown }
  | { op: "dependencies"; asset: string; dependencies: string[] };

interface Preset {
  id: string;
  name: string;
  preview: string | null;
  problem: string | null;
  /** The pack inside the plugin's package. */
  zip: string;
  entries: string[];
  /** Size and SHA-256 of the game's own stored entry that each pack entry replaces. */
  originals: Record<string, { size: number; sha256: string }>;
  project: ProjectOp[];
}

interface OverridePlugin {
  pluginId: string;
  name: string;
  presets: Preset[];
  defaultPreset: string | null;
}

export interface WantedPack {
  pluginId: string;
  preset: string;
  zip: string;
  entries: string[];
}

/** What the game files must hold. Main writes it, and reverts whatever a previous state added and this one leaves out. */
export interface WantedState {
  seq: number;
  gameDir: string | null;
  packs: WantedPack[];
  project: Array<ProjectOp & { pluginId: string }>;
}

export interface OverrideHubDeps {
  send(msg: Record<string, unknown>): void;
  gameDir(): string | null;
  /** The folders that hold the game's content patches (patch.zip). */
  contentPatchDirs(): string[];
  isEnabled(pluginId: string): boolean;
  allowed(pluginId: string): boolean;
  picks(): Record<string, string | null>;
  savePicks(picks: Record<string, string | null>): void;
  onChange(pluginId: string): void;
}

/** Stored entries of a zip: name, local header offset, stored size. Only stored (not compressed) entries. */
function centralDirectory(file: string): Array<{ name: string; offset: number; size: number }> {
  const fd = fs.openSync(file, "r");
  try {
    const size = fs.fstatSync(fd).size;
    const tailLen = Math.min(size, 65557);
    const tail = Buffer.alloc(tailLen);
    fs.readSync(fd, tail, 0, tailLen, size - tailLen);
    let eocd = -1;
    for (let i = tailLen - 22; i >= 0; i--) {
      if (tail.readUInt32LE(i) === 0x06054b50) {
        eocd = i;
        break;
      }
    }
    if (eocd < 0) return [];
    const cdSize = tail.readUInt32LE(eocd + 12);
    const cdOffset = tail.readUInt32LE(eocd + 16);
    if (cdOffset + cdSize > size) return [];
    const cd = Buffer.alloc(cdSize);
    fs.readSync(fd, cd, 0, cdSize, cdOffset);
    const out: Array<{ name: string; offset: number; size: number }> = [];
    let p = 0;
    while (p + 46 <= cd.length && cd.readUInt32LE(p) === 0x02014b50) {
      const method = cd.readUInt16LE(p + 10);
      const csize = cd.readUInt32LE(p + 20);
      const nameLen = cd.readUInt16LE(p + 28);
      const extraLen = cd.readUInt16LE(p + 30);
      const commentLen = cd.readUInt16LE(p + 32);
      const offset = cd.readUInt32LE(p + 42);
      const name = cd.toString("utf8", p + 46, p + 46 + nameLen);
      p += 46 + nameLen + extraLen + commentLen;
      if (method === 0) out.push({ name, offset, size: csize });
    }
    return out;
  } finally {
    fs.closeSync(fd);
  }
}

function storedBytes(file: string, offset: number, size: number): Buffer {
  const fd = fs.openSync(file, "r");
  try {
    const head = Buffer.alloc(30);
    fs.readSync(fd, head, 0, 30, offset);
    if (head.readUInt32LE(0) !== 0x04034b50) throw new Error(`${path.basename(file)}: bad local header`);
    const out = Buffer.alloc(size);
    fs.readSync(fd, out, 0, size, offset + 30 + head.readUInt16LE(26) + head.readUInt16LE(28));
    return out;
  } finally {
    fs.closeSync(fd);
  }
}

/** A path inside `root`, or null when `rel` leaves it. */
function inside(root: string, rel: string): string | null {
  const base = path.resolve(root);
  const full = path.resolve(base, rel);
  return full === base || full.startsWith(base + path.sep) ? full : null;
}

const baseName = (entry: string): string => entry.slice(entry.lastIndexOf("/") + 1);

/** The game's own entries: base packs only. Names that start with `aa_` are FUSE's pack and packs a user adds. */
class GameIndex {
  private entries = new Map<string, { file: string; offset: number; size: number }>();
  private hashes = new Map<string, string>();

  private constructor(readonly signature: string) {}

  static signature(outDir: string): string {
    try {
      return fs
        .readdirSync(outDir)
        .filter((f) => f.endsWith(".zip") && !f.startsWith("aa_"))
        .sort()
        .map((f) => {
          const st = fs.statSync(path.join(outDir, f));
          return `${f}:${st.size}:${st.mtimeMs}`;
        })
        .join("|");
    } catch {
      return "";
    }
  }

  static async build(outDir: string, signature: string): Promise<GameIndex> {
    const index = new GameIndex(signature);
    for (const f of fs.readdirSync(outDir).filter((x) => x.endsWith(".zip") && !x.startsWith("aa_")).sort()) {
      const file = path.join(outDir, f);
      // The first pack in name order wins, the same rule as the game.
      for (const e of centralDirectory(file)) if (!index.entries.has(e.name)) index.entries.set(e.name, { file, offset: e.offset, size: e.size });
      await new Promise((resolve) => setImmediate(resolve));
    }
    return index;
  }

  /** The first replaced entry whose game original differs from the one the preset was built against, or null. */
  mismatch(preset: Preset): string | null {
    for (const entry of preset.entries) {
      const want = preset.originals[entry]!;
      const got = this.entries.get(entry);
      if (!got) return `${baseName(entry)} is not in the game files`;
      if (got.size !== want.size || this.sha256(entry, got) !== want.sha256) return `${baseName(entry)} differs`;
    }
    return null;
  }

  private sha256(entry: string, got: { file: string; offset: number; size: number }): string {
    let hash = this.hashes.get(entry);
    if (!hash) {
      hash = createHash("sha256").update(storedBytes(got.file, got.offset, got.size)).digest("hex");
      this.hashes.set(entry, hash);
    }
    return hash;
  }
}

function projectKey(op: ProjectOp): string {
  return op.op === "set" ? `set:${op.key}` : `dependencies:${op.asset}`;
}

function parseProject(raw: unknown): ProjectOp[] | string {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) return "apply.json 'project' is not a list";
  const out: ProjectOp[] = [];
  for (const item of raw) {
    const o = (item ?? {}) as Record<string, unknown>;
    if (o.op === "set" && typeof o.key === "string" && o.key && o.value !== undefined) {
      out.push({ op: "set", key: o.key, value: o.value });
    } else if (
      o.op === "dependencies" &&
      typeof o.asset === "string" &&
      o.asset.startsWith("/") &&
      Array.isArray(o.dependencies) &&
      o.dependencies.every((d) => typeof d === "string" && d.startsWith("/"))
    ) {
      out.push({ op: "dependencies", asset: o.asset, dependencies: [...(o.dependencies as string[])] });
    } else {
      return `apply.json has an unknown project edit: ${JSON.stringify(item).slice(0, 120)}`;
    }
  }
  return out;
}

export class OverrideHub {
  private plugins = new Map<string, OverridePlugin>();
  private status = new Map<string, OverrideStatus>();
  /** Plugin -> the preset key main reported as applied for the current state. */
  private applied = new Map<string, string>();
  /** Plugin -> main's reason, for the current state. */
  private mainFailed = new Map<string, string>();
  /** Plugins whose changes the game files still hold, from main's last answer. */
  private mainHeld = new Set<string>();
  private seq = 0;
  private lastSent = "";
  private index: GameIndex | null = null;
  private indexDir = "";
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly deps: OverrideHubDeps) {}

  /** The override parts of the discovered plugins. */
  sync(specs: DiscoveredPlugin[]): Promise<void> {
    this.plugins.clear();
    for (const spec of specs) if (spec.manifest.override) this.plugins.set(spec.pluginId, this.parse(spec));
    for (const id of [...this.status.keys()]) if (!this.plugins.has(id)) this.status.delete(id);
    return this.recompute();
  }

  has(pluginId: string): boolean {
    return this.plugins.has(pluginId);
  }

  snapshot(pluginId: string): OverridesSnapshot {
    const plugin = this.plugins.get(pluginId);
    const presets: OverridePresetInfo[] = (plugin?.presets ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      preview: p.preview,
      problem: p.problem,
    }));
    return { presets, active: { ...(this.status.get(pluginId) ?? { preset: null, state: "off" as OverrideState }) } };
  }

  /** Picks a preset, or null for none. Returns the status once the hub has checked the pick. */
  async select(pluginId: string, preset: string | null): Promise<OverrideStatus> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) throw new Error(`'${pluginId}' has no override part`);
    if (preset !== null && !plugin.presets.some((p) => p.id === preset)) throw new Error(`'${pluginId}' has no preset '${preset}'`);
    const picks = this.deps.picks();
    // The newest pick goes last: on a collision, the older pick keeps its place.
    delete picks[pluginId];
    picks[pluginId] = preset;
    this.deps.savePicks(picks);
    await this.recompute();
    return this.snapshot(pluginId).active;
  }

  /** Clears every pick, so main removes every FUSE change from the game files. */
  async removeAll(): Promise<void> {
    const picks: Record<string, string | null> = {};
    for (const id of this.plugins.keys()) picks[id] = null;
    this.deps.savePicks(picks);
    await this.recompute();
  }

  /**
   * Main's answer to an `overrides:apply`. An answer for an older state counts for nothing. While the game runs,
   * main answers at once from its ledger: `results` then lists only the plugins that the files already hold.
   */
  onMainStatus(msg: Record<string, unknown>): void {
    if (Number(msg.seq) !== this.seq) return;
    if (Array.isArray(msg.held)) this.mainHeld = new Set(msg.held.map(String));
    const results = (msg.results ?? {}) as Record<string, { state?: string; reason?: string }>;
    const wanted = JSON.parse(this.lastSent || "{}") as Partial<WantedState>;
    const inState = new Set((wanted.packs ?? []).map((p) => p.pluginId));
    for (const id of [...this.applied.keys()]) if (!inState.has(id)) this.applied.delete(id);
    this.mainFailed.clear();
    for (const [id, r] of Object.entries(results)) {
      const pack = (wanted.packs ?? []).find((p) => p.pluginId === id);
      if (r.state === "applied" && pack) this.applied.set(id, this.appliedKey(id, pack.preset));
      else if (r.state === "failed") this.mainFailed.set(id, String(r.reason ?? "the game files could not be written"));
    }
    void this.recompute();
  }

  /** Checks every pick again and sends main the wanted state when it changed. Runs one at a time. */
  recompute(): Promise<void> {
    this.queue = this.queue.then(
      () => this.compute(),
      () => this.compute(),
    );
    return this.queue.catch((e) => logger.exception("overrides: the check failed", e));
  }

  private appliedKey(pluginId: string, presetId: string): string {
    const preset = this.plugins.get(pluginId)?.presets.find((p) => p.id === presetId);
    if (!preset) return "";
    let stamp = "";
    try {
      const st = fs.statSync(preset.zip);
      stamp = `${st.size}:${st.mtimeMs}`;
    } catch {
      /* a missing pack never matches */
    }
    return `${presetId}|${preset.zip}|${stamp}`;
  }

  /** Plugins with a pick, in pick order. A plugin without a saved pick uses its manifest default. */
  private picked(): Array<{ plugin: OverridePlugin; preset: string }> {
    const picks = this.deps.picks();
    const out: Array<{ plugin: OverridePlugin; preset: string }> = [];
    for (const [id, preset] of Object.entries(picks)) {
      const plugin = this.plugins.get(id);
      if (plugin && preset) out.push({ plugin, preset });
    }
    for (const plugin of [...this.plugins.values()].sort((a, b) => a.pluginId.localeCompare(b.pluginId))) {
      if (!(plugin.pluginId in picks) && plugin.defaultPreset) out.push({ plugin, preset: plugin.defaultPreset });
    }
    return out;
  }

  private async gameIndex(gameDir: string): Promise<GameIndex | null> {
    const outDir = path.join(gameDir, ".assets", "output");
    const signature = GameIndex.signature(outDir);
    if (!signature) return null;
    if (!this.index || this.indexDir !== outDir || this.index.signature !== signature) {
      this.index = await GameIndex.build(outDir, signature);
      this.indexDir = outDir;
    }
    return this.index;
  }

  /** Entry names that a content patch holds. A pack cannot replace those: patch.zip wins over aa_ packs. */
  private patchEntries(): Set<string> {
    const out = new Set<string>();
    for (const dir of this.deps.contentPatchDirs()) {
      let subs: string[] = [];
      try {
        subs = fs.readdirSync(dir);
      } catch {
        continue;
      }
      for (const sub of subs) {
        const zip = path.join(dir, sub, "patch.zip");
        if (!fs.existsSync(zip)) continue;
        try {
          for (const e of centralDirectory(zip)) out.add(e.name);
        } catch (e) {
          logger.warning(`overrides: cannot read ${zip}: ${String(e)}`);
        }
      }
    }
    return out;
  }

  private async compute(): Promise<void> {
    const gameDir = this.deps.gameDir();
    const index = gameDir ? await this.gameIndex(gameDir) : null;
    const patched = this.patchEntries();
    const next = new Map<string, OverrideStatus>();
    for (const id of this.plugins.keys()) next.set(id, { preset: null, state: "off" });

    const taken = new Map<string, string>();
    const packs: WantedPack[] = [];
    const project: Array<ProjectOp & { pluginId: string }> = [];
    for (const { plugin, preset: presetId } of this.picked()) {
      const id = plugin.pluginId;
      const set = (state: OverrideState, reason?: string): void => {
        next.set(id, { preset: presetId, state, ...(reason ? { reason } : {}) });
      };
      const preset = plugin.presets.find((p) => p.id === presetId);
      if (!this.deps.isEnabled(id)) {
        set("off", "the plugin is off");
        continue;
      }
      if (!preset) {
        set("failed", `the plugin has no preset '${presetId}'`);
        continue;
      }
      if (preset.problem) {
        set("failed", preset.problem);
        continue;
      }
      if (!this.deps.allowed(id)) {
        set("failed", "the 'Game file changes' permission is off");
        continue;
      }
      if (!index) {
        set("failed", "the game folder is unknown: set it in the FUSE App");
        continue;
      }
      const inPatch = preset.entries.find((e) => patched.has(e));
      if (inPatch) {
        set("failed", `the game's content patch holds ${baseName(inPatch)}, so a pack cannot replace it`);
        continue;
      }
      const changed = index.mismatch(preset);
      if (changed) {
        set("outdated", `the game files changed (${changed}): the preset needs an update from its author`);
        continue;
      }
      const keys = [...preset.entries.map((e) => `entry:${e}`), ...preset.project.map(projectKey)];
      const clash = keys.find((k) => taken.has(k));
      if (clash) {
        const other = this.plugins.get(taken.get(clash)!)?.name ?? taken.get(clash);
        set("failed", `collides with ${other}: both change ${clash.replace(/^entry:\.assets\/output\//, "")}`);
        continue;
      }
      for (const k of keys) taken.set(k, id);
      packs.push({ pluginId: id, preset: preset.id, zip: preset.zip, entries: [...preset.entries] });
      for (const op of preset.project) project.push({ ...op, pluginId: id });
      const failure = this.mainFailed.get(id);
      if (failure) set("failed", failure);
      else set(this.applied.get(id) === this.appliedKey(id, preset.id) ? "applied" : "pending");
    }

    // A plugin that leaves the state is no longer confirmed: back in, it waits for main again.
    for (const id of [...this.applied.keys()]) if (!packs.some((p) => p.pluginId === id)) this.applied.delete(id);

    // Off, but the game files still hold its changes: main takes them out when the game is closed.
    for (const [id, st] of next) {
      if (st.state === "off" && this.mainHeld.has(id)) next.set(id, { ...st, state: "pending", removing: true });
    }

    const body = JSON.stringify({ gameDir, packs, project });
    if (body !== this.lastSentBody()) {
      this.seq++;
      this.mainFailed.clear();
      this.lastSent = JSON.stringify({ seq: this.seq, gameDir, packs, project } satisfies WantedState);
      this.deps.send({ type: "overrides:apply", state: JSON.parse(this.lastSent) as WantedState });
      // A new state is pending until main answers, also for the plugins it keeps.
      for (const p of packs) {
        const st = next.get(p.pluginId);
        if (st?.state === "failed") next.set(p.pluginId, { preset: p.preset, state: "pending" });
      }
    }

    for (const [id, st] of next) {
      if (JSON.stringify(this.status.get(id)) === JSON.stringify(st)) continue;
      this.status.set(id, st);
      this.deps.onChange(id);
    }
  }

  private lastSentBody(): string {
    if (!this.lastSent) return "";
    const { gameDir, packs, project } = JSON.parse(this.lastSent) as WantedState;
    return JSON.stringify({ gameDir, packs, project });
  }

  private parse(spec: DiscoveredPlugin): OverridePlugin {
    const m = spec.manifest.override ?? {};
    const presets: Preset[] = [];
    const seen = new Set<string>();
    for (const raw of Array.isArray(m.presets) ? m.presets : []) {
      const id = String(raw?.id ?? "");
      if (!PRESET_ID_RE.test(id) || seen.has(id)) {
        logger.warning(`${spec.pluginId}: override preset id '${id}' is not valid or not unique - ignored`);
        continue;
      }
      seen.add(id);
      presets.push(this.readPreset(spec, raw ?? {}, id, m.format));
    }
    const def = typeof m.default === "string" && presets.some((p) => p.id === m.default) ? m.default : null;
    return { pluginId: spec.pluginId, name: spec.name, presets, defaultPreset: def };
  }

  private readPreset(spec: DiscoveredPlugin, raw: { name?: string; dir?: string; preview?: string }, id: string, format: unknown): Preset {
    const preset: Preset = {
      id,
      name: String(raw.name ?? id).slice(0, 64),
      preview: null,
      problem: null,
      zip: "",
      entries: [],
      originals: {},
      project: [],
    };
    const fail = (problem: string): Preset => {
      logger.warning(`${spec.pluginId}: override preset '${id}': ${problem}`);
      return { ...preset, problem };
    };
    if (format !== 1) return fail(`the override format ${String(format)} is not supported (FUSE knows format 1)`);
    const dir = inside(spec.packageRoot, String(raw.dir ?? ""));
    if (!dir || !fs.existsSync(dir)) return fail(`the preset folder '${String(raw.dir ?? "")}' is not in the package`);
    if (raw.preview) {
      const preview = inside(dir, String(raw.preview));
      if (preview && fs.existsSync(preview)) preset.preview = path.relative(spec.packageRoot, preview).split(path.sep).join("/");
    }

    let apply: Record<string, unknown>;
    try {
      apply = JSON.parse(fs.readFileSync(path.join(dir, "apply.json"), "utf8")) as Record<string, unknown>;
    } catch (e) {
      return fail(`apply.json is missing or not valid JSON (${e instanceof Error ? e.message : String(e)})`);
    }
    if (apply.format !== APPLY_FORMAT) return fail(`apply.json format '${String(apply.format)}' is not ${APPLY_FORMAT}`);
    const zip = inside(dir, String(apply.pack ?? "aa_override.zip"));
    if (!zip || !fs.existsSync(zip)) return fail("the pack named in apply.json is not in the preset folder");
    preset.zip = zip;

    const entries = apply.entries;
    if (!Array.isArray(entries) || !entries.length || !entries.every((e) => typeof e === "string" && ENTRY_RE.test(e))) {
      return fail("apply.json 'entries' must list the packed entry names (.assets/output/...)");
    }
    preset.entries = [...new Set(entries as string[])];
    const originals = (apply.originals ?? {}) as Record<string, { size?: unknown; sha256?: unknown }>;
    for (const e of preset.entries) {
      const o = originals[e];
      if (!o || typeof o.size !== "number" || typeof o.sha256 !== "string" || !SHA256_RE.test(o.sha256)) {
        return fail(`apply.json has no original size and SHA-256 for ${baseName(e)}`);
      }
      preset.originals[e] = { size: o.size, sha256: o.sha256 };
    }
    let inZip: string[];
    try {
      inZip = centralDirectory(zip).map((e) => e.name);
    } catch (e) {
      return fail(`the pack cannot be read (${e instanceof Error ? e.message : String(e)})`);
    }
    if (inZip.length !== preset.entries.length || !preset.entries.every((e) => inZip.includes(e))) {
      return fail("the pack entries differ from apply.json 'entries' (only stored entries count)");
    }
    const project = parseProject(apply.project);
    if (typeof project === "string") return fail(project);
    preset.project = project;
    return preset;
  }
}
