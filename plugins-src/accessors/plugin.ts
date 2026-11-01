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
import { Accessors, DEFAULT_CDP_PORT } from "./accessors.js";

/** The runtime's `game_config` service: the App's port, and what coldwar.project says. */
interface GameConfigService {
  get(): { port?: number; enabled?: boolean; valid?: boolean; reachable?: boolean };
}

/** What other plugins may call. Everything else on Accessors stays internal. */
const SERVICE_METHODS = [
  "injectStylesheetOn",
  "injectStylesheet",
  "injectStylesheetMarkers",
  "injectStylesheetBaseIndicators",
  "injectStylesheetHangar",
  "countMatches",
  "snapshot",
  "fetchSnapshot",
  "setStyleOn",
  "setStyle",
  "setStyleHangar",
  "setStylesOn",
  "setStyles",
  "setStylesHangar",
  "resetStyleOn",
  "resetStyle",
  "resetStyleHangar",
  "hideOn",
  "hide",
  "hideHangar",
  "showOn",
  "show",
  "showHangar",
  "insertHtmlOn",
  "pollOpenUrl",
];

/** Read-only methods consumers may call without the "ui" scope. */
const READ_ONLY_METHODS = new Set(["countMatches", "snapshot", "fetchSnapshot"]);

export class AccessorsPlugin extends FusePlugin {
  private acc!: Accessors;
  private ctx!: FuseContext;
  private svc: ServiceHandle | null = null;
  private gameCfg: GameConfigService | undefined;
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
            min: 0,
            max: 65535,
            step: 1,
            tooltip: "Override the port the FUSE App configured. 0 follows the App.",
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
            min: 0.0001,
            max: 1,
            step: 0.01,
            unit: "s",
            tooltip: "How often game values are read. Lower is more responsive and costs more CPU.",
          },
          {
            type: "number",
            id: "hangar_poll_interval_s",
            key: "hangar_poll_interval_s",
            label: "Hangar Poll Interval",
            min: 0.5,
            max: 5,
            step: 0.5,
            unit: "s",
            tooltip: "How often hangar data (currencies, loadouts, progression) is refreshed.",
          },
        ],
      },
    ];
  }

  setup(ctx: FuseContext): void {
    this.ctx = ctx;
    this.gameCfg = ctx.services.get<GameConfigService>("game_config");
    ctx.config
      .defaults({
        cdp_port: 0,
        connect_timeout_s: 8.0,
        reconnect_interval_s: 5.0,
        poll_interval_s: 0.1,
        hangar_poll_interval_s: 2.0,
      })
      .load();

    // App panel only: Accessors is a service and has no overlay.
    ctx.config.schema(this.sections());

    const jsDir = path.join(ctx.packageRoot, "js");
    const readScript = (name: string): string => fs.readFileSync(path.join(jsDir, name), "utf-8");

    this.acc = new Accessors({
      port: this.resolvePort(),
      connectTimeout: Number(ctx.config.get("connect_timeout_s")),
      hangarPollInterval: Number(ctx.config.get("hangar_poll_interval_s")),
      logger: ctx.logger,
      onEvent: (name, payload) => ctx.events.emit(name, payload),
      scripts: {
        common: readScript("common.js"),
        postmatch: readScript("postmatch.js"),
        readAll: readScript("read_all.js"),
        readCrosshair: readScript("read_crosshair.js"),
        readMarkers: readScript("read_markers.js"),
        readBattleApp: readScript("read_battle_app.js"),
        readHangar: readScript("read_hangar.js"),
        readHangarScene: readScript("read_hangar_scene.js"),
        readPostmatch: readScript("read_postmatch.js"),
        readRoster: readScript("read_roster.js"),
      },
    });

    this.syncInterval = Number(ctx.config.get("reconnect_interval_s"));
    this.pollInterval = Number(ctx.config.get("poll_interval_s"));

    // The App owns the port. `cdp_port` is an override for a non-standard set-up.
    ctx.config.watch("cdp_port", () => this.acc.setPort(this.resolvePort()));
    ctx.events.subscribe("host_game_config_changed", () => this.acc.setPort(this.resolvePort()));

    // Consumers run in their own processes: read(), isConnected() and the connection flags
    // come from this state, published every tick.
    this.svc = ctx.services.provide("accessors", {
      target: this.acc,
      methods: SERVICE_METHODS,
      reads: { read: "values", isConnected: "pages" },
      // Anything that changes the game's interface needs accessors.ui.
      scopes: Object.fromEntries(SERVICE_METHODS.filter((m) => !READ_ONLY_METHODS.has(m)).map((m) => [m, "ui"])),
      state: () => this.acc.publicState(),
    });
    this.startSync();
  }

  /** The config override wins, then the App's port, then the spawn env, then the default. */
  private resolvePort(): number {
    const override = Number(this.ctx.config.get("cdp_port"));
    if (Number.isInteger(override) && override >= 1024 && override <= 65535) return override;
    const served = Number(this.gameCfg?.get()?.port);
    if (Number.isInteger(served) && served >= 1024 && served <= 65535) return served;
    const env = Number(process.env.FUSE_CDP_PORT);
    if (Number.isInteger(env) && env >= 1024 && env <= 65535) return env;
    return DEFAULT_CDP_PORT;
  }

  tick(dt: number): void {
    if (!this.syncing) {
      this.syncTimer += dt;
      if (this.syncTimer >= this.syncInterval) {
        this.syncTimer = 0;
        this.startSync();
      }
    }
    if (this.acc.anyConnected && !this.polling) {
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
          this.ctx.logger.warning("accessors: page poll failed - re-syncing");
          this.syncTimer = this.syncInterval; // force an immediate reconcile
        }
      })
      .catch((e) => this.ctx.logger.exception("accessors refresh failed", e))
      .finally(() => {
        this.polling = false;
      });
  }

  private onSyncResult(_anyConnected: boolean): void {
    // Consumers see the new flag before the event that announces it.
    this.svc?.publish();
    // Legacy events stay scoped to battle_hud; per-page transitions are the
    // new accessors.page_connected / accessors.page_disconnected events.
    const hudUp = this.acc.connected;
    if (hudUp && !this.wasConnected) {
      this.ctx.logger.info("accessors: battle_hud connected");
      this.ctx.events.emit("accessors.connected");
    } else if (this.wasConnected && !hudUp) {
      this.ctx.logger.info("accessors: battle_hud disconnected");
      this.ctx.events.emit("accessors.disconnected");
    }
    this.wasConnected = hudUp;
  }
}
