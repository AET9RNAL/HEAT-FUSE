/**
 * Plugin process entry. The runtime forks this under Node's permission model;
 * it loads one plugin and talks to the runtime over the IPC channel.
 */
import path from "node:path";
import { pathToFileURL } from "node:url";
import { logger, setLevel, type LogLevel } from "../log.js";
import { Channel, errorText } from "../ipc/channel.js";
import type { InitMessage } from "../ipc/protocol.js";
import { PluginRuntime, type PluginClass } from "./context.js";

if (typeof process.send !== "function") {
  process.stderr.write("plugin-host: must be started by the FUSE runtime\n");
  process.exit(1);
}

// Taken before the plugin loads, so its own code can't swap them out.
const readRss = process.memoryUsage.rss.bind(process.memoryUsage);
const readCpu = process.cpuUsage.bind(process);
const now = performance.now.bind(performance);

const channel = new Channel((payload) => {
  if (process.connected) process.send!(payload);
});
let log = logger.bind("plugin-host");
let runtime: PluginRuntime | null = null;

process.on("message", (raw) => channel.receive(raw));
// The runtime is gone (closed, crashed or killed): nothing left to serve.
process.on("disconnect", () => process.exit(0));
process.on("uncaughtException", (e) => log.exception("uncaught exception", e));
process.on("unhandledRejection", (e) => log.exception("unhandled promise rejection", e));

channel.onMessage((msg) => {
  if (msg.t === "init") {
    void init(msg as unknown as InitMessage);
    return;
  }
  if (msg.t === "ping") {
    const cpu = readCpu();
    channel.send({ t: "pong", metrics: { rss: readRss(), cpu: cpu.user + cpu.system, at: now() } });
    return;
  }
  runtime?.handle(msg);
});

async function init(msg: InitMessage): Promise<void> {
  if (runtime) return;
  setLevel((msg.logLevel as LogLevel) || "info");
  log = logger.bind(msg.pluginId);
  try {
    const mod = (await import(pathToFileURL(msg.entryPath).href)) as Record<string, unknown>;
    const fromDefault = (mod.default as Record<string, unknown> | undefined)?.[msg.entryClass];
    const cls = (mod[msg.entryClass] ?? fromDefault ?? (msg.entryClass === "default" ? mod.default : undefined)) as
      | (PluginClass & { isFusePlugin?: unknown; pluginName: string; version: string; description: string })
      | undefined;
    // Plugin bundles carry their own FusePlugin copy, so check the inherited marker instead of instanceof.
    if (typeof cls !== "function" || cls.isFusePlugin !== true || typeof cls.prototype?.setup !== "function") {
      throw new Error(`${path.basename(msg.entryPath)}:${msg.entryClass} is not a FusePlugin`);
    }
    cls.pluginName = msg.name;
    cls.version = msg.version;
    cls.description = msg.description;
    runtime = new PluginRuntime(channel, msg, cls);
    channel.send({
      t: "ready",
      requiresCalibration: cls.requiresCalibration === true,
      calibrationStages: Number(cls.calibrationStages) || 1,
    });
  } catch (e) {
    log.exception("couldn't load the plugin", e);
    channel.send({ t: "fail", error: errorText(e) });
    channel.flush();
  }
}
