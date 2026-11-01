import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import type { FuseContext } from "@fuse/plugin-sdk";
import type { BattleRow } from "./battles.js";
import { prettyMap } from "./overview.js";

/** Set on a Steam start, so Steam does not start the game again through itself. */
const STEAM_APP_ID = "2100280";
/** The build line sits before the first binary block, well inside this. */
const HEADER_BYTES = 512;
/** A stored battle that started further from the replay than this is another battle. */
const MATCH_WINDOW_MS = 3 * 60_000;
/** A file changed this recently is the battle the game is still writing. */
const WRITING_MS = 30_000;
const KEPT_FOLDER = "replays";
const PLAYBACK_ARGS = [
  "--project",
  "../coldwar.project",
  "--mode",
  "client",
  "--world",
  "/plugins/replay/worlds/replay_loading.world",
  "--replay-playback",
];

const MODES = [
  "double_domination",
  "20v20_conquest",
  "v1_conquest",
  "killconfirm",
  "domination",
  "stormfront",
  "conquest",
  "pve_ftue",
  "control",
  "ct2",
].sort((a, b) => b.length - a.length);

const MAP_NAMES: Record<string, string> = {
  "01": "Scarred City",
  "02": "Blossom Crash",
  "03": "Sunstroke",
  "04": "Nord Oko",
  "05": "Nexus Dam",
  "06": "Aircraft Carrier",
  "07": "Project Phoenix",
  "08": "Inferno One",
  "09": "Moonshot",
  "10": "Eden",
  "11": "Railgun",
  "100": "Tactical Training 3v3",
  "218": "Rocket Jump",
  "252": "Utopia",
};

/** `09_moonshot_conquest_2026_09_21_17_31_57_67fc6cba.replay`: map number, map, mode, battle start in local time, id. */
const NAME_RE = /^(\d+)_(.+)_(\d{4})_(\d{2})_(\d{2})_(\d{2})_(\d{2})_(\d{2})_([0-9a-z]+)\.replay$/i;

interface GameConfigState {
  installs?: unknown;
  replaysDir?: unknown;
}

interface Install {
  platform: string;
  dir: string;
}

interface Build extends Install {
  /** Null when `build_meta.json` is missing or unreadable. */
  hash: string | null;
  launcher: boolean;
}

interface NameParts {
  number: string;
  /** The map as the game names its world folder: `01_beirut`, `06_aircraftcarrier`. */
  slug: string;
  mode: string;
  startedAt: number;
}

interface ReplayFile {
  name: string;
  gamePath: string | null;
  keptPath: string | null;
  size: number;
  modifiedAt: number;
  parts: NameParts | null;
  branch: string | null;
  commit: string | null;
}

interface Header {
  size: number;
  modifiedAt: number;
  branch: string | null;
  commit: string | null;
}

export interface ReplayResult {
  outcome: string;
  vehicle: string;
  score: number;
  kills: number;
  deaths: number;
  damage: number;
}

export interface ReplayView {
  name: string;
  mapSlug: string;
  map: string;
  mode: string;
  /** Ms. Null for a file name the parser does not know. */
  startedAt: number | null;
  durationS: number | null;
  size: number;
  branch: string | null;
  /** ready: an installed game has the build. old: none has it. unknown: the header names no build. */
  build: "ready" | "old" | "unknown";
  /** The platform of the install that plays it. */
  install: string | null;
  inGame: boolean;
  kept: boolean;
  writing: boolean;
  playing: boolean;
  /** The battle HEAT Stats recorded at the same time on the same map. */
  result: ReplayResult | null;
}

export interface ReplaysPage {
  state: "ready" | "loading" | "noAccess";
  canKeep: boolean;
  canPlay: boolean;
  /** The i18n key of the last action that failed. */
  notice: string | null;
  rows: ReplayView[];
}

function parseName(name: string): NameParts | null {
  const m = NAME_RE.exec(name);
  if (!m) return null;
  const [, number = "", middle = "", y, mo, d, h, mi, s] = m;
  const lower = middle.toLowerCase();
  const known = MODES.find((mode) => lower.endsWith(`_${mode}`));
  // An unknown mode: the map is the first word, as every current map but one is.
  const cut = known ? lower.length - known.length - 1 : lower.indexOf("_");
  const map = cut > 0 ? lower.slice(0, cut) : lower;
  return {
    number,
    slug: `${number}_${map.replace(/_/g, "")}`,
    mode: cut > 0 ? lower.slice(cut + 1) : "",
    startedAt: new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s)).getTime(),
  };
}

async function readHeader(file: string): Promise<{ branch: string | null; commit: string | null }> {
  const handle = await fs.open(file, "r");
  try {
    const { buffer, bytesRead } = await handle.read(Buffer.alloc(HEADER_BYTES), 0, HEADER_BYTES, 0);
    const text = buffer.subarray(0, bytesRead).toString("latin1");
    return {
      branch: /branch: '([^']*)'/.exec(text)?.[1] ?? null,
      commit: /commit: '([0-9a-f]{40})'/i.exec(text)?.[1]?.toLowerCase() ?? null,
    };
  } finally {
    await handle.close();
  }
}

async function readBuild(install: Install): Promise<Build> {
  const bin = path.join(install.dir, "bin");
  let hash: string | null = null;
  try {
    const meta = JSON.parse(await fs.readFile(path.join(bin, "build_meta.json"), "utf8")) as { hash?: unknown };
    hash = typeof meta.hash === "string" && /^[0-9a-f]{40}$/i.test(meta.hash) ? meta.hash.toLowerCase() : null;
  } catch {
    // An install without the file cannot say which replays it plays.
  }
  const launcher = await fs.access(path.join(bin, "engine_launcher.exe")).then(
    () => true,
    () => false,
  );
  return { ...install, hash, launcher };
}

async function listReplays(dir: string | null): Promise<string[]> {
  if (!dir) return [];
  try {
    return (await fs.readdir(dir)).filter((f) => f.toLowerCase().endsWith(".replay"));
  } catch {
    return [];
  }
}

function installsOf(raw: unknown): Install[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((i) => {
    const r = (i ?? {}) as Record<string, unknown>;
    return typeof r.dir === "string" && typeof r.platform === "string" ? [{ platform: r.platform, dir: r.dir }] : [];
  });
}

export class ReplayLibrary {
  private files = new Map<string, ReplayFile>();
  private headers = new Map<string, Header>();
  private builds: Build[] = [];
  private scanned = false;
  private access = false;
  private notice: string | null = null;
  private child: ChildProcess | null = null;
  private playingName: string | null = null;
  private laterTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly ctx: FuseContext,
    private readonly onChange: () => void,
  ) {}

  /** True while a replay this plugin started is on screen. The recorder skips that battle. */
  get playing(): boolean {
    return this.child !== null;
  }

  private get keptDir(): string | null {
    return this.ctx.filesDir ? path.join(this.ctx.filesDir, KEPT_FOLDER) : null;
  }

  private gameConfig(): { installs: Install[]; replaysDir: string | null } {
    const svc = this.ctx.services.get<GameConfigState>("game_config");
    return {
      installs: installsOf(svc?.installs),
      replaysDir: typeof svc?.replaysDir === "string" ? svc.replaysDir : null,
    };
  }

  async scan(): Promise<void> {
    const { installs, replaysDir } = this.gameConfig();
    this.access = this.ctx.permissions.has("game_files") && !!replaysDir;
    if (!this.access) {
      this.files.clear();
      this.scanned = true;
      this.onChange();
      return;
    }
    const keptDir = this.keptDir;
    const [builds, inGame, kept] = await Promise.all([
      Promise.all(installs.map(readBuild)),
      listReplays(replaysDir),
      listReplays(keptDir),
    ]);
    this.builds = builds;

    const next = new Map<string, ReplayFile>();
    for (const name of new Set([...inGame, ...kept])) {
      const gamePath = replaysDir && inGame.includes(name) ? path.join(replaysDir, name) : null;
      const keptPath = keptDir && kept.includes(name) ? path.join(keptDir, name) : null;
      const file = await this.describe(name, gamePath, keptPath);
      if (file) next.set(name, file);
    }
    this.files = next;
    this.scanned = true;
    this.onChange();
  }

  /** The game writes the replay at the end of a battle, so a scan soon after finds it. */
  scanLater(ms: number): void {
    if (this.laterTimer) clearTimeout(this.laterTimer);
    this.laterTimer = setTimeout(() => {
      this.laterTimer = null;
      void this.scan();
    }, ms);
  }

  private async describe(name: string, gamePath: string | null, keptPath: string | null): Promise<ReplayFile | null> {
    const source = gamePath ?? keptPath;
    if (!source) return null;
    try {
      const stat = await fs.stat(source);
      let header = this.headers.get(name);
      if (!header || header.size !== stat.size || header.modifiedAt !== stat.mtimeMs) {
        header = { size: stat.size, modifiedAt: stat.mtimeMs, ...(await readHeader(source)) };
        this.headers.set(name, header);
      }
      return {
        name,
        gamePath,
        keptPath,
        size: stat.size,
        modifiedAt: stat.mtimeMs,
        parts: parseName(name),
        branch: header.branch,
        commit: header.commit,
      };
    } catch (e) {
      this.ctx.logger.warning(`heat_stats: could not read replay ${name}: ${String(e)}`);
      return null;
    }
  }

  private buildFor(file: ReplayFile): Build | undefined {
    // Steam last: started directly, a Steam copy can make Steam start the game again.
    const playable = this.builds
      .filter((b) => b.launcher)
      .sort((a, b) => Number(a.platform === "steam") - Number(b.platform === "steam"));
    // No build in the header: the first install gets a try.
    return file.commit ? playable.find((b) => b.hash === file.commit) : playable[0];
  }

  view(rows: BattleRow[] | null): ReplaysPage {
    const canKeep = !!this.keptDir;
    const canPlay = this.ctx.permissions.has("processes");
    if (!this.scanned) return { state: "loading", canKeep, canPlay, notice: null, rows: [] };
    if (!this.access) return { state: "noAccess", canKeep, canPlay, notice: null, rows: [] };

    const names = new Map<string, string>();
    for (const r of rows ?? []) if (r.mapKey && r.map && !names.has(r.mapKey)) names.set(r.mapKey, r.map);

    const now = Date.now();
    const out = [...this.files.values()].map((f): ReplayView => {
      const p = f.parts;
      const build = this.buildFor(f);
      const startedAt = p?.startedAt ?? null;
      return {
        name: f.name,
        mapSlug: p?.slug ?? "",
        map: p ? (names.get(p.slug) ?? MAP_NAMES[p.number]?.toUpperCase() ?? prettyMap(p.slug)) : f.name,
        mode: p?.mode ?? "",
        startedAt,
        durationS: startedAt != null && f.modifiedAt > startedAt ? Math.round((f.modifiedAt - startedAt) / 1000) : null,
        size: f.size,
        branch: f.branch,
        build: !f.commit ? "unknown" : build ? "ready" : "old",
        install: build?.platform ?? null,
        inGame: !!f.gamePath,
        kept: !!f.keptPath,
        writing: now - f.modifiedAt < WRITING_MS,
        playing: this.playingName === f.name,
        result: p ? resultFor(rows, p) : null,
      };
    });
    out.sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0));
    return { state: "ready", canKeep, canPlay, notice: this.notice, rows: out };
  }

  /** The window sends only a name. Every path comes from this plugin's own scan. */
  async act(op: string, name: string): Promise<void> {
    this.notice = null;
    if (op === "scan") return this.scan();
    const file = this.files.get(name);
    if (!file) {
      this.notice = "replays.notice.missing";
      return this.scan();
    }
    if (op === "keep") return this.keep(file);
    if (op === "unkeep") return this.unkeep(file);
    if (op === "play") {
      this.play(file);
      this.onChange();
    }
  }

  private async keep(file: ReplayFile): Promise<void> {
    const dir = this.keptDir;
    if (!dir || !file.gamePath || file.keptPath) return;
    try {
      await fs.mkdir(dir, { recursive: true });
      await fs.copyFile(file.gamePath, path.join(dir, file.name));
    } catch (e) {
      this.ctx.logger.warning(`heat_stats: could not keep replay ${file.name}: ${String(e)}`);
      this.notice = "replays.notice.keepFailed";
    }
    await this.scan();
  }

  /** Without the game's copy, this deletes the replay for good. The window asks first. */
  private async unkeep(file: ReplayFile): Promise<void> {
    if (!file.keptPath || file.name === this.playingName) return;
    try {
      await fs.rm(file.keptPath);
    } catch (e) {
      this.ctx.logger.warning(`heat_stats: could not remove kept replay ${file.name}: ${String(e)}`);
    }
    await this.scan();
  }

  private play(file: ReplayFile): void {
    if (this.child) {
      this.notice = "replays.notice.busy";
      return;
    }
    if (!this.ctx.permissions.has("processes")) {
      this.notice = "replays.notice.noPlay";
      return;
    }
    const build = this.buildFor(file);
    if (!build) {
      this.notice = this.builds.some((b) => b.launcher) ? "replays.notice.oldBuild" : "replays.notice.noGame";
      return;
    }
    const bin = path.join(build.dir, "bin");
    // The game finds a bare name in its own replay folder. A kept copy needs its full path.
    const target = file.gamePath ? file.name : (file.keptPath ?? "");
    const steam = build.platform === "steam" ? { SteamAppId: STEAM_APP_ID, SteamGameId: STEAM_APP_ID } : {};
    try {
      const child = spawn(path.join(bin, "engine_launcher.exe"), [...PLAYBACK_ARGS, target], {
        cwd: bin,
        env: { ...process.env, ...steam },
        detached: true,
        stdio: "ignore",
        windowsHide: false,
      });
      this.child = child;
      this.playingName = file.name;
      const done = (): void => {
        if (this.child !== child) return;
        this.child = null;
        this.playingName = null;
        this.onChange();
      };
      child.once("error", (e) => {
        this.ctx.logger.warning(`heat_stats: replay playback failed to start: ${String(e)}`);
        this.notice = "replays.notice.startFailed";
        done();
      });
      child.once("exit", done);
      this.ctx.logger.info(`heat_stats: playing replay ${file.name} in the ${build.platform} install`);
    } catch (e) {
      this.ctx.logger.warning(`heat_stats: replay playback failed to start: ${String(e)}`);
      this.notice = "replays.notice.startFailed";
    }
  }

  teardown(): void {
    if (this.laterTimer) clearTimeout(this.laterTimer);
    this.laterTimer = null;
  }
}

function resultFor(rows: BattleRow[] | null, parts: NameParts): ReplayResult | null {
  let best: BattleRow | null = null;
  let gap = MATCH_WINDOW_MS;
  for (const r of rows ?? []) {
    if (r.mapKey !== parts.slug || !r.playedAt) continue;
    const d = Math.abs(r.playedAt - parts.startedAt);
    if (d <= gap) {
      best = r;
      gap = d;
    }
  }
  if (!best) return null;
  return {
    outcome: best.outcome,
    vehicle: best.vehicle,
    score: best.score,
    kills: best.kills,
    deaths: best.deaths,
    damage: best.damage,
  };
}
