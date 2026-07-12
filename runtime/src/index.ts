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

  const shutdown = (): void => host.quit();
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

run().catch((e) => {
  logger.exception("Fatal runtime error", e);
  process.exit(1);
});
