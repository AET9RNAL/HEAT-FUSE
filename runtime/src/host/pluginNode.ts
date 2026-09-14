import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { logger } from "../log.js";

export interface PluginNode {
  execPath: string;
  /** Extra environment the binary needs (Electron's Node runs as plain Node only with this set). */
  env: Record<string, string>;
  version: string;
  /** Has `--allow-net` (Node 25+), so network can be denied per plugin. */
  netFlag: boolean;
}

/**
 * The Node binary plugin processes run on: the one Electron main points at
 * (`FUSE_PLUGIN_NODE`, shipped with the app), or the runtime's own as a fallback.
 */
export function resolvePluginNode(): PluginNode {
  const bundled = process.env.FUSE_PLUGIN_NODE;
  if (bundled && fs.existsSync(bundled)) {
    try {
      const version = execFileSync(bundled, ["-p", "process.versions.node"], {
        encoding: "utf8",
        timeout: 10_000,
        windowsHide: true,
      }).trim();
      return { execPath: bundled, env: {}, version, netFlag: major(version) >= 25 };
    } catch (e) {
      logger.warning(`plugin node: ${bundled} isn't usable (${String(e)}) - using the runtime's own Node`);
    }
  }
  const version = process.versions.node;
  return {
    execPath: process.execPath,
    env: process.versions.electron ? { ELECTRON_RUN_AS_NODE: "1" } : {},
    version,
    netFlag: major(version) >= 25,
  };
}

function major(version: string): number {
  return Number.parseInt(version.split(".")[0] ?? "0", 10) || 0;
}
