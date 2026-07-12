/**
 * FUSE core plugin - exposes CDP-based game reads as the "accessors" service.
 * TS port of backend/dev/accessors/plugin.py.
 *
 * Other plugins declare `"dependencies": ["accessors"]` and consume it:
 *     const acc = ctx.services.require<Accessors>("accessors");
 *     acc.read("multiplayer_vehicle_health");  // number | null
 *
 * Emits `accessors.connected` / `accessors.disconnected` on ctx.events.
 */
import fs from "node:fs";
import path from "node:path";
import { FusePlugin, ConfigCategory, ConfigEntry, type FuseContext } from "@fuse/plugin-sdk";
import { Accessors } from "./accessors.js";

export class AccessorsPlugin extends FusePlugin {
  private acc!: Accessors;
  private ctx!: FuseContext;
  private syncInterval = 5;
  private pollInterval = 0.1;
  private syncTimer = 0;
  private pollTimer = 0;
  private syncing = false;
  private polling = false;
  private wasConnected = false;

  setup(ctx: FuseContext): void {
    this.ctx = ctx;
    ctx.config
      .defaults({ cdp_port: 9222, connect_timeout_s: 8.0, reconnect_interval_s: 5.0, poll_interval_s: 0.1 })
      .load();

    ctx.config.schema([
      new ConfigCategory("CDP Debugger", [
        new ConfigEntry({ key: "cdp_port", label: "CDP Port", type: "int", min: 1024, max: 65535 }),
        new ConfigEntry({ key: "connect_timeout_s", label: "Connect Timeout (s)", type: "float", min: 1.0, max: 30.0 }),
        new ConfigEntry({ key: "reconnect_interval_s", label: "Reconnect Interval (s)", type: "float", min: 1.0, max: 60.0 }),
        new ConfigEntry({ key: "poll_interval_s", label: "Poll Interval (s)", type: "float", min: 0.05, max: 1.0 }),
      ]),
    ]);

    const jsDir = path.join(ctx.packageRoot, "js");
    const readScript = (name: string): string => fs.readFileSync(path.join(jsDir, name), "utf-8");

    this.acc = new Accessors({
      port: Number(ctx.config.get("cdp_port")),
      connectTimeout: Number(ctx.config.get("connect_timeout_s")),
      logger: ctx.logger,
      scripts: {
        readAll: readScript("read_all.js"),
        readMarkers: readScript("read_markers.js"),
        readBattleApp: readScript("read_battle_app.js"),
      },
    });

    this.syncInterval = Number(ctx.config.get("reconnect_interval_s"));
    this.pollInterval = Number(ctx.config.get("poll_interval_s"));

    ctx.services.register("accessors", this.acc, (this.constructor as typeof FusePlugin).pluginName);
    this.startSync();
  }

  tick(dt: number): void {
    if (!this.syncing) {
      this.syncTimer += dt;
      if (this.syncTimer >= this.syncInterval) {
        this.syncTimer = 0;
        this.startSync();
      }
    }
    if (this.acc.connected && !this.polling) {
      this.pollTimer += dt;
      if (this.pollTimer >= this.pollInterval) {
        this.pollTimer = 0;
        this.startPoll();
      }
    }
  }

  teardown(): void {
    this.acc.close();
  }

  private startSync(): void {
    this.syncing = true;
    void this.acc
      .sync()
      .then((connected) => this.onSyncResult(connected))
      .catch((e) => this.ctx.logger.exception("accessors sync failed", e))
      .finally(() => {
        this.syncing = false;
      });
  }

  private startPoll(): void {
    this.polling = true;
    void this.acc
      .refresh()
      .then((ok) => {
        if (!ok) {
          this.ctx.logger.warning("accessors: battle_hud poll failed - re-syncing");
          this.syncTimer = this.syncInterval; // force an immediate reconcile
        }
      })
      .catch((e) => this.ctx.logger.exception("accessors refresh failed", e))
      .finally(() => {
        this.polling = false;
      });
  }

  private onSyncResult(connected: boolean): void {
    if (connected && !this.wasConnected) {
      this.ctx.logger.info("accessors: battle_hud connected");
      this.ctx.events.emit("accessors.connected");
    } else if (this.wasConnected && !connected) {
      this.ctx.logger.info("accessors: battle_hud disconnected");
      this.ctx.events.emit("accessors.disconnected");
    }
    this.wasConnected = connected;
  }
}
