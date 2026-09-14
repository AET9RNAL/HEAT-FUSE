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
import { FusePlugin, type FuseContext, type InspectorSection, type ServiceHandle } from "@fuse/plugin-sdk";
import { Accessors } from "./accessors.js";

/** What other plugins may call. Everything else on Accessors stays internal. */
const SERVICE_METHODS = [
  "injectStylesheetOn",
  "injectStylesheet",
  "injectStylesheetMarkers",
  "injectStylesheetBaseIndicators",
  "injectStylesheetHangar",
  "countMatches",
  "setStyle",
  "setStyleHangar",
  "setStyles",
  "setStylesHangar",
  "resetStyle",
  "resetStyleHangar",
  "hide",
  "show",
  "hideHangar",
  "showHangar",
  "pollOpenUrl",
];

export class AccessorsPlugin extends FusePlugin {
  private acc!: Accessors;
  private ctx!: FuseContext;
  private svc: ServiceHandle | null = null;
  private syncInterval = 5;
  private pollInterval = 0.1;
  private syncTimer = 0;
  private pollTimer = 0;
  private syncing = false;
  private polling = false;
  private wasConnected = false;

  private sections(): InspectorSection[] {
    return [
      {
        id: "acc.cdp",
        label: "CDP Debugger",
        description: "How FUSE connects to the game's UI debugger.",
        controls: [
          {
            type: "number",
            id: "cdp_port",
            key: "cdp_port",
            label: "CDP Port",
            min: 1024,
            max: 65535,
            step: 1,
            tooltip: "Chrome DevTools Protocol port the game exposes.",
          },
          {
            type: "number",
            id: "connect_timeout_s",
            key: "connect_timeout_s",
            label: "Connect Timeout",
            min: 1,
            max: 30,
            step: 0.5,
            unit: "s",
            tooltip: "How long to wait for a game page to accept the connection.",
          },
          {
            type: "number",
            id: "reconnect_interval_s",
            key: "reconnect_interval_s",
            label: "Reconnect Interval",
            min: 1,
            max: 60,
            step: 1,
            unit: "s",
            tooltip: "How often to look for game pages that appeared or went away.",
          },
          {
            type: "number",
            id: "poll_interval_s",
            key: "poll_interval_s",
            label: "Poll Interval",
            min: 0.05,
            max: 1,
            step: 0.05,
            unit: "s",
            tooltip: "How often game values are read. Lower is more responsive and costs more CPU.",
          },
        ],
      },
    ];
  }

  setup(ctx: FuseContext): void {
    this.ctx = ctx;
    ctx.config
      .defaults({ cdp_port: 9222, connect_timeout_s: 8.0, reconnect_interval_s: 5.0, poll_interval_s: 0.1 })
      .load();

    // App panel only: Accessors is a service and has no overlay.
    ctx.config.schema(this.sections());

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

    // Consumers run in their own processes: read(), isConnected() and the connection flags
    // come from this state, published every tick.
    this.svc = ctx.services.provide("accessors", {
      target: this.acc,
      methods: SERVICE_METHODS,
      reads: { read: "values", isConnected: "pages" },
      // Anything that changes the game's interface needs accessors.ui.
      scopes: Object.fromEntries(SERVICE_METHODS.filter((m) => m !== "countMatches").map((m) => [m, "ui"])),
      state: () => this.acc.publicState(),
    });
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
    this.svc?.publish();
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
    // Consumers see the new flag before the event that announces it.
    this.svc?.publish();
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
