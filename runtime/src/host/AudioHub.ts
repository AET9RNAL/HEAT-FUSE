/**
 * Plugin audio routing. The runtime has no audio output of its own: it checks and
 * addresses sounds, and the stage window fetches, decodes and plays them.
 */
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { logger } from "../log.js";
import type { WsServer } from "../server/WsServer.js";
import type { PlayOptions, PluginAudio } from "../sdk/audio.js";

const AUDIO_EXT = new Set([".mp3", ".wav", ".ogg"]);

export interface AudioMaster {
  volume: number;
  muted: boolean;
}

export class AudioHub {
  /** Sounds each plugin asked to warm, replayed to a stage that connects later. */
  private preloads = new Map<string, Set<string>>();
  private master: AudioMaster = { volume: 1, muted: false };

  constructor(
    private server: WsServer,
    private resolveAsset: (pluginId: string, rel: string) => string | null,
  ) {}

  scoped(pluginId: string): PluginAudio {
    return {
      preload: (assets) => this.preload(pluginId, assets),
      play: (asset, opts) => this.play(pluginId, asset, opts),
      stop: (id) => this.stop(pluginId, id),
      stopAll: () => this.stopAll(pluginId),
    };
  }

  preload(pluginId: string, assets: string[]): void {
    const urls = (Array.isArray(assets) ? assets : [])
      .map((a) => this.urlFor(pluginId, a))
      .filter((u): u is string => u !== null);
    if (!urls.length) return;
    const set = this.preloads.get(pluginId) ?? new Set<string>();
    for (const u of urls) set.add(u);
    this.preloads.set(pluginId, set);
    this.server.broadcastOverlay({ type: "audio:preload", urls });
  }

  /** `requestedId` lets a plugin process name the sound up front; it must carry the plugin's prefix. */
  play(pluginId: string, asset: string, opts: PlayOptions = {}, requestedId?: string): string {
    const url = this.urlFor(pluginId, asset);
    if (!url) return "";
    const id = requestedId?.startsWith(`${pluginId}:`) ? requestedId : `${pluginId}:${randomUUID()}`;
    this.server.broadcastOverlay({
      type: "audio:play",
      id,
      source: pluginId,
      url,
      volume: clamp(opts.volume, 0, 1, 1),
      loop: Boolean(opts.loop),
      rate: clamp(opts.rate, 0.25, 4, 1),
    });
    return id;
  }

  /** Ids are prefixed with their plugin, so one plugin can't stop another's sounds. */
  stop(pluginId: string, id: string): void {
    if (typeof id !== "string" || !id.startsWith(`${pluginId}:`)) return;
    this.server.broadcastOverlay({ type: "audio:stop", id });
  }

  stopAll(pluginId: string): void {
    this.server.broadcastOverlay({ type: "audio:stop_all", source: pluginId });
  }

  /** A plugin going away takes its sounds with it. */
  removePlugin(pluginId: string): void {
    this.preloads.delete(pluginId);
    this.stopAll(pluginId);
  }

  setMaster(volume: unknown, muted: unknown): void {
    this.master = { volume: clamp(volume, 0, 1, this.master.volume), muted: Boolean(muted) };
    this.server.broadcastOverlay({ type: "audio:master", ...this.master });
  }

  hydration(): { master: AudioMaster; preload: string[] } {
    return { master: this.master, preload: [...this.preloads.values()].flatMap((s) => [...s]) };
  }

  /** Stage URL for a plugin audio asset, or null (logged) when it can't be played. */
  private urlFor(pluginId: string, asset: string): string | null {
    const rel = String(asset ?? "").replace(/\\/g, "/").replace(/^\/+/, "");
    if (!rel || rel.split("/").includes("..")) {
      logger.warning(`audio: ${pluginId} asked for an invalid path '${String(asset)}'`);
      return null;
    }
    if (!AUDIO_EXT.has(path.extname(rel).toLowerCase())) {
      logger.warning(`audio: ${pluginId}/${rel} is not an .mp3, .wav or .ogg file`);
      return null;
    }
    const abs = this.resolveAsset(pluginId, rel);
    if (!abs || !fs.existsSync(abs)) {
      logger.warning(`audio: ${pluginId}/${rel} not found`);
      return null;
    }
    return `/overlay-asset/${encodeURIComponent(pluginId)}/${rel.split("/").map(encodeURIComponent).join("/")}`;
  }
}

function clamp(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}
