import type { AppWindow } from "@fuse/plugin-sdk";

/** The last value of each data path. Each set goes to every open window, and a new window gets all of them. */
export class ViewFeed {
  private readonly values = new Map<string, unknown>();
  private readonly windows = new Set<AppWindow>();

  set(path: string, value: unknown): void {
    this.values.set(path, value);
    for (const win of this.windows) win.setJson(path, value);
  }

  attach(win: AppWindow): void {
    this.windows.add(win);
    for (const [path, value] of this.values) win.setJson(path, value);
  }

  detach(win: AppWindow): void {
    this.windows.delete(win);
  }
}
