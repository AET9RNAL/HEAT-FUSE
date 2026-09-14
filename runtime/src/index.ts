import { logger, setLevel, type LogLevel } from "./log.js";
import { WsServer } from "./server/WsServer.js";
import { FuseHost } from "./host/FuseHost.js";

async function run(): Promise<void> {
  const level = (process.env.FUSE_LOG_LEVEL as LogLevel) ?? "info";
  setLevel(level);

  const server = new WsServer();
  // Electron main spawns us with an IPC channel for permission decisions.
  const send = process.send
    ? (msg: Record<string, unknown>): void => {
        if (process.connected) process.send!(msg);
      }
    : null;
  const host = new FuseHost(server, send);
  server.attach(host);
  process.on("message", (msg) => {
    if (msg && typeof msg === "object") host.onElectronMessage(msg as Record<string, unknown>);
  });
  host.setAutoLockOnStart(process.env.FUSE_AUTO_LOCK === "1");

  let port: number;
  try {
    port = await server.start();
  } catch (e) {
    logger.exception("Failed to start WebSocket server", e);
    process.exit(1);
  }

  process.stdout.write(
    JSON.stringify({
      port,
      connectionToken: server.connectionToken,
      stageToken: server.stageToken,
      obsToken: server.obsToken,
    }) + "\n",
  );

  await host.permissions.waitForDecisions(3000);
  await host.loadPlugins();
  host.start();

  let quitting = false;
  const shutdown = (): void => {
    if (quitting) return;
    quitting = true;
    void host.quit();
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Orphan guard. Electron spawns us with a piped stdin and holds its write
  // end open for our whole lifetime. When the app exits — cleanly, on crash,
  // or hard-killed (no signal reaches us on Windows) — that pipe closes and we
  // get 'end'/'close'. Self-exit so we never linger as an orphan spewing errors.
  process.on("disconnect", shutdown);
  process.stdin.on("end", shutdown);
  process.stdin.on("close", shutdown);
  process.stdin.on("error", shutdown);
  process.stdin.resume();
}

run().catch((e) => {
  logger.exception("Fatal runtime error", e);
  process.exit(1);
});
