import fs from "node:fs";
import path from "node:path";
import { logger } from "../log.js";
import { DEV_PLUGINS, DEV_PLUGINS_SRC, isDevPlugin } from "../utils/paths.js";
import type { WsServer } from "../server/WsServer.js";

const WATCHED_EXT = new Set([".vue", ".js", ".mjs", ".css", ".json", ".svg", ".png", ".riv"]);
const DEBOUNCE_MS = 80;

export class DevWatcher {
  private server: WsServer;
  private watchers = new Map<string, fs.FSWatcher>();
  private timers = new Map<string, NodeJS.Timeout>();

  constructor(server: WsServer) {
    this.server = server;
  }

  /** Start watching `pluginId` if it is opted into dev mode. No-op otherwise. */
  watch(pluginId: string): void {
    // `reloadPlugins` re-instantiates every plugin; keep the existing watcher.
    if (!isDevPlugin(pluginId) || this.watchers.has(pluginId)) return;
    const dir = path.join(DEV_PLUGINS_SRC, pluginId);
    if (!fs.existsSync(dir)) {
      if (DEV_PLUGINS.has(pluginId)) logger.warning(`dev watch: no source dir for '${pluginId}' at ${dir}`);
      return;
    }
    try {
      const w = fs.watch(dir, { recursive: true }, (_event, filename) => {
        if (!filename) return;
        if (!WATCHED_EXT.has(path.extname(String(filename)).toLowerCase())) return;
        this.schedule(pluginId);
      });
      w.on("error", (e) => logger.warning(`dev watch error for '${pluginId}': ${String(e)}`));
      this.watchers.set(pluginId, w);
      logger.info(`dev watch: ${pluginId} -> ${dir}`);
    } catch (e) {
      logger.warning(`dev watch: failed to watch ${dir}: ${String(e)}`);
    }
  }

  private schedule(pluginId: string): void {
    clearTimeout(this.timers.get(pluginId));
    this.timers.set(
      pluginId,
      setTimeout(() => {
        this.timers.delete(pluginId);
        logger.info(`dev reload: ${pluginId}`);
        this.server.broadcastOverlay({ type: "overlay:reload", pluginId, rev: Date.now() });
      }, DEBOUNCE_MS),
    );
  }

  stop(): void {
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
    for (const w of this.watchers.values()) w.close();
    this.watchers.clear();
  }
}
