/**
 * Per-plugin asset loader.
 * In the Node runtime every `.fuse` is extracted to a cache dir first,
 * so assets are always plain files rooted at `<packageRoot>/assets`.
 */
import fs from "node:fs";
import path from "node:path";

export class PluginAssets {
  /** Absolute path to the plugin's `assets/` directory. */
  readonly root: string;

  constructor(assetsRoot: string) {
    this.root = assetsRoot;
  }

  /** Resolve a relative asset path to an absolute path under the assets root. */
  resolve(rel: string): string {
    return path.join(this.root, rel);
  }

  exists(rel: string): boolean {
    return fs.existsSync(this.resolve(rel));
  }

  /** Read an asset as raw bytes. */
  read(rel: string): Buffer {
    return fs.readFileSync(this.resolve(rel));
  }

  /** Read an asset as UTF-8 text. */
  readText(rel: string): string {
    return fs.readFileSync(this.resolve(rel), "utf-8");
  }
}
