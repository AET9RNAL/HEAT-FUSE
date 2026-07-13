import { logger, setLevel, type LogLevel } from "./log.js";
import { WsServer } from "./server/WsServer.js";
import { FuseHost } from "./host/FuseHost.js";

async function run(): Promise<void> {
  const level = (process.env.FUSE_LOG_LEVEL as LogLevel) ?? "info";
  setLevel(level);

  const server = new WsServer();
  const host = new FuseHost(server);
  server.attach(host);

  let port: number;
  try {
    port = await server.start();
  } catch (e) {
    logger.exception("Failed to start WebSocket server", e);
    process.exit(1);
  }

  process.stdout.write(JSON.stringify({ port, connectionToken: server.connectionToken }) + "\n");

  await host.loadPlugins();
  host.start();

  let quitting = false;
  const shutdown = (): void => {
    if (quitting) return;
    quitting = true;
    host.quit();
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Orphan guard. Electron spawns us with a piped stdin and holds its write
  // end open for our whole lifetime. When the app exits — cleanly, on crash,
  // or hard-killed (no signal reaches us on Windows) — that pipe closes and we
  // get 'end'/'close'. Self-exit so we never linger as an orphan spewing errors.
  process.stdin.on("end", shutdown);
  process.stdin.on("close", shutdown);
  process.stdin.on("error", shutdown);
  process.stdin.resume();
}

run().catch((e) => {
  logger.exception("Fatal runtime error", e);
  process.exit(1);
});
