import {
  FusePlugin,
  type FuseContext,
  type InspectorSection,
  type LanguageService,
  type OverlayHandle,
  type ServiceHandle,
} from "@fuse/plugin-sdk";
import {
  DEFAULT_QUERY,
  normalizeQuery,
  queryBattles,
  toBattleRows,
  type BattleQuery,
  type BattleRow,
} from "./battles.js";
import { Account } from "./account.js";
import { buildCharts } from "./charts.js";
import { StatsClient } from "./fetching.js";
import { compactCatalog, snapshotLoadouts, type LoadoutCatalog, type LoadoutSnapshot } from "./loadout.js";
import { LOCALES, messagesFor, resolveLocale, translator, type Translate } from "./i18n.js";
import { DEFAULT_STREAK_LENGTH, STREAK_LENGTHS } from "./overview.js";
import { DEFAULT_WIDGET_SCENES, RateWidgets, WIDGET_SCENES, widgetRectKey, widgetResetKey } from "./rateWidgets.js";
import { BLOCK_RESUME_KEY, QueueGuard, type GuardLabels } from "./queueGuard.js";
import { MatchRecorder } from "./recording.js";
import { ReplayLibrary } from "./replays.js";
import { SamplesCache } from "./samples.js";
import type { Phase } from "./session.js";
import { MatchStore } from "./store.js";
import { buildUpload } from "./submission.js";
import { Sync } from "./sync.js";
import {
  TagStore,
  TagsInjector,
  GROUPS as TAG_GROUPS,
  MARK_SLOTS,
  TAGS_SERVICE,
  TAG_COLOR_DEFAULT,
  tagColorKey,
} from "./tags.js";
import { RATE_WIDGETS, RESET_MODES } from "./widgets.js";

const TAG_SWATCHES = [TAG_COLOR_DEFAULT, "#FFF87A", "#FF7A7A", "#7ABFDF", "#F2F2F2", "#C9A7FF"];

interface Accessors {
  read(name: string): unknown;
  readonly connected: boolean;
  readonly connectedHangar: boolean;
  /** Structured domains. An older Accessors build has none, and the service proxy gives undefined, so every call is guarded. */
  snapshot?(domain: string): Promise<unknown>;
  fetchSnapshot?(domain: string): Promise<unknown>;
}

/** A second read after a finished battle, so a signed-in upload has time to reach the mirror. */
const REFETCH_AFTER_SUBMIT_MS = 15_000;
/** Between attempts at the part catalog while the hangar is up but not ready. */
const CATALOG_RETRY_MS = 30_000;
/** Starting size only. The window's layout follows the size the stage gives the overlay. */
const WINDOW_SIZE = { w: 1990, h: 760 };
/** The recorder widget: one line of status, wide enough for the longest of them. */
const RECORDER_SIZE = { w: 260, h: 28 };
const TOGGLE_WINDOW_HOTKEY = "ctrl+alt+s";

export class HeatStatsPlugin extends FusePlugin {
  static override requiresCalibration = true;
  static override calibrationStages = 1;

  private ctx!: FuseContext;
  private acc: Accessors | undefined;
  private language: LanguageService | undefined;
  /** Last value seen on the language service, which reads empty without the permission. */
  private appLanguage: string | undefined;
  private ov: OverlayHandle | undefined;
  private vueOv: OverlayHandle | undefined;
  private recorder!: MatchRecorder;
  private widgets!: RateWidgets;
  private stats!: StatsClient;
  private samples!: SamplesCache;
  private account!: Account;
  private store!: MatchStore;
  private sync!: Sync;
  private replays!: ReplayLibrary;
  private tags!: TagStore;
  private tagsInjector!: TagsInjector;
  private guard!: QueueGuard;
  private tagsService: ServiceHandle | null = null;
  private lastPhase: Phase | null = null;
  private battleRows: BattleRow[] | null = null;
  private battleQuery: BattleQuery = DEFAULT_QUERY;

  private locale = "en";
  private t: Translate = translator("en");
  private toggleCombo = TOGGLE_WINDOW_HOTKEY;
  private hostVisible = true;
  private lastVueVisible: boolean | null = null;
  private lastConnection: string | null = null;

  private catalog: LoadoutCatalog | null = null;
  private catalogLoading = false;
  private catalogTriedAt = 0;

  private sections(): InspectorSection[] {
    const t = this.t;
    return [
      {
        id: "hst.display",
        label: t("config.display"),
        order: 10,
        controls: [
          {
            type: "select",
            id: "locale",
            key: "locale",
            label: t("config.language"),
            options: [
              { value: "", label: t("config.languageAuto") },
              ...LOCALES.map((code) => ({ value: code, label: code.toUpperCase() })),
            ],
            tooltip: t("config.languageTip"),
          },
          {
            type: "switch",
            id: "window_open",
            key: "window_open",
            label: t("config.showWindow"),
            tooltip: t("config.showWindowTip"),
          },
          {
            type: "switch",
            id: "hide_in_battle",
            key: "hide_in_battle",
            label: t("config.hangarOnly"),
            tooltip: t("config.hangarOnlyTip"),
          },
          {
            type: "segmented",
            id: "streak_length",
            key: "streak_length",
            label: t("config.streakLength"),
            options: STREAK_LENGTHS.map((n) => ({ value: n, label: String(n) })),
            tooltip: t("config.streakLengthTip"),
          },
        ],
      },
      {
        id: "hst.widgets",
        label: t("config.widgets"),
        description: t("config.widgetsHint"),
        order: 11,
        controls: [
          {
            type: "buttons",
            id: "widgets",
            key: "widgets",
            mode: "multi",
            label: t("config.widgetsShown"),
            options: RATE_WIDGETS.map((w) => ({
              value: w.id,
              label: t(`widgets.${w.id}.tab`),
              tooltip: t(`widgets.${w.id}.tip`),
            })),
          },
          {
            type: "buttons",
            id: "widget_show_in",
            key: "widget_show_in",
            mode: "multi",
            label: t("config.showIn"),
            options: WIDGET_SCENES.map((scene) => ({
              value: scene,
              label: t(`scene.${scene}`),
              tooltip: t(`scene.${scene}Tip`),
            })),
          },
          ...RATE_WIDGETS.map((w) => ({
            type: "buttons" as const,
            id: widgetResetKey(w.id),
            key: widgetResetKey(w.id),
            mode: "exclusive" as const,
            label: t("config.widgetReset", { widget: t(`widgets.${w.id}.tab`) }),
            options: RESET_MODES.map((mode) => ({
              value: mode,
              label: t(`widgets.reset.${mode}`),
              tooltip: t(`widgets.reset.${mode}Tip`),
            })),
          })),
        ],
      },
      {
        id: "hst.player",
        label: t("config.player"),
        order: 12,
        controls: [
          {
            type: "text",
            id: "player_name",
            key: "player_name",
            label: t("config.player"),
            placeholder: t("config.playerPlaceholder"),
            tooltip: t("config.playerTip"),
          },
        ],
      },
      {
        id: "hst.recording",
        label: t("config.recording"),
        order: 13,
        controls: [
          {
            type: "slider",
            id: "summarize_hold_s",
            key: "summarize_hold_s",
            label: t("config.summaryHold"),
            min: 0,
            max: 20,
            step: 0.5,
            unit: "s",
            default: 5,
            tooltip: t("config.summaryHoldTip"),
          },
        ],
      },
      {
        id: "hst.tags",
        label: t("config.tags"),
        description: t("config.tagsHint"),
        order: 14,
        controls: TAG_GROUPS.map((id) => ({
          type: "color" as const,
          id: tagColorKey(id),
          key: tagColorKey(id),
          label: t(`tags.${id}`),
          alpha: false,
          swatches: TAG_SWATCHES,
        })),
      },
      {
        id: "hst.block",
        label: t("config.block"),
        description: t("config.blockHint"),
        order: 15,
        controls: [
          {
            type: "switch",
            id: BLOCK_RESUME_KEY,
            key: BLOCK_RESUME_KEY,
            label: t("block.resume"),
            tooltip: t("config.blockResumeTip"),
          },
        ],
      },
    ];
  }

  private guardLabels(): GuardLabels {
    const t = this.t;
    return {
      title: t("block.title"),
      stopped: t("block.stopped"),
      inHangar: t("block.inHangar"),
      players: t("block.players"),
      resume: t("block.resume"),
      override: t("block.override"),
      waiting: t("block.waiting"),
    };
  }

  private tagColors(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const id of TAG_GROUPS) {
      out[id] = String(this.ctx.config.get(tagColorKey(id), TAG_COLOR_DEFAULT) || TAG_COLOR_DEFAULT);
    }
    return out;
  }

  /** Rebuilds the page script in the current colors and sends them to the window. */
  private applyTagColors(): void {
    this.tagsInjector?.setup(
      Object.fromEntries(TAG_GROUPS.map((id) => [id, this.t(`tags.${id}`)])),
      this.tagColors(),
    );
    this.pushTags();
  }

  setup(ctx: FuseContext): void {
    this.ctx = ctx;
    this.acc = ctx.services.get<Accessors>("accessors");
    this.language = ctx.services.get<LanguageService>("language");
    ctx.config
      .defaults({
        summarize_hold_s: 5.0,
        overlay_pos: null,
        player_name: "",
        hide_in_battle: false,
        streak_length: DEFAULT_STREAK_LENGTH,
        // Empty follows the App's language.
        locale: "",
        window_open: true,
        window_rect: null,
        widgets: [],
        widget_show_in: DEFAULT_WIDGET_SCENES,
        ...Object.fromEntries(RATE_WIDGETS.map((w) => [widgetRectKey(w.id), null])),
        ...Object.fromEntries(RATE_WIDGETS.map((w) => [widgetResetKey(w.id), "battle"])),
        ...Object.fromEntries(TAG_GROUPS.map((id) => [tagColorKey(id), TAG_COLOR_DEFAULT])),
        [BLOCK_RESUME_KEY]: false,
      })
      .load();

    this.store = new MatchStore(ctx);
    this.tags = new TagStore(ctx);
    this.guard = new QueueGuard(ctx, this.tags, (on) => ctx.config.set(BLOCK_RESUME_KEY, on));
    this.guard.setup(this.guardLabels());
    ctx.config.watch(BLOCK_RESUME_KEY, () => void this.guard.refresh());
    this.tagsInjector = new TagsInjector(ctx, this.tags, () => {
      this.pushTags();
      // A tag from the game syncs like a battle.
      this.sync.nudge();
    });
    // English until the locale resolves
    this.applyTagColors();
    // A color change rebuilds the script, so the game redraws in the new color.
    for (const id of TAG_GROUPS) ctx.config.watch(tagColorKey(id), () => this.applyTagColors());
    // Marks for any plugin that draws players, such as the HUD scoreboard.
    // Keyed by nickname, because in battle every profileId is 0.
    this.tagsService = ctx.services.provide(TAGS_SERVICE, {
      target: {},
      methods: [],
      reads: { tagsFor: "byName" },
      state: () => ({ slots: MARK_SLOTS, ...this.tagsInjector.serviceGroups(), byName: this.tags.byName() }),
    });
    void this.tags.load().then(() => this.pushTags());
    this.sync = new Sync(ctx, this.store, this.tags, {
      onChange: () => void this.pushAccount(),
      // Rebuilds from the store
      onMatchesChanged: () => void this.stats.refresh(),
      // The window and the game scoreboard both show the marks.
      onTagsChanged: () => {
        this.pushTags();
        void this.tagsInjector.refresh();
      },
    });
    this.account = new Account(ctx, {
      onChange: () => void this.pushAccount(),
      onSession: (session) => {
        void this.sync.onSession(session, this.account.api);
        // The window follows the account: its matches when signed in, and this PC's when not.
        this.stats.setSession(session ? this.account.api : null, session?.user.id ?? null);
      },
    });

    this.recorder = new MatchRecorder(ctx, {
      read: (name) => this.acc?.read(name),
      connected: () => !!this.acc?.connected,
      onPhase: () => this.pushPhase(),
      onFinished: (battle) => {
        // Stored here first, with or without an account. The queue drains after sign-in
        void this.store
          .record(buildUpload(battle), battle.samples)
          .then(() => this.sync.nudge())
          .catch((e) => ctx.logger.warning(`heat_stats: could not store the battle: ${String(e)}`));
        this.stats.refreshLater(REFETCH_AFTER_SUBMIT_MS);
        this.replays.scanLater(REFETCH_AFTER_SUBMIT_MS);
      },
      loadoutSnapshot: () => this.readLoadouts(),
      catalog: () => this.catalog,
    });
    this.widgets = new RateWidgets(ctx, (name) => this.acc?.read(name));
    this.widgets.readConfig();
    this.stats = new StatsClient(
      ctx,
      this.store,
      () => String(ctx.config.get("player_name", "")) || String(this.acc?.read("player_name") ?? ""),
      (overview, sessions) => {
        this.vueOv?.setJson("overview", overview);
        this.battleRows = sessions ? toBattleRows(sessions) : null;
        this.pushBattles();
        this.pushCharts();
        // A replay shows the result of the battle recorded with it.
        this.pushReplays();
      },
    );
    this.replays = new ReplayLibrary(ctx, () => this.pushReplays());
    this.samples = new SamplesCache(
      (id) => this.stats.samples(id),
      (open) => this.vueOv?.setJson("samples", open),
    );

    this.appLanguage = this.language?.language;
    this.locale = this.pickLocale();
    this.t = translator(this.locale);

    ctx.events.subscribe("accessors.connected", () => this.onConnected());
    ctx.events.subscribe("accessors.disconnected", () => this.recorder.onDisconnected());

    ctx.config.watch("player_name", () => { void this.stats.refresh(); });
    ctx.config.watch("locale", () => this.applyLocale());
    ctx.config.watch("streak_length", () => this.pushStreakLength());
    ctx.config.watch("widgets", () => this.widgets.sync());
    for (const key of ["widget_show_in", ...RATE_WIDGETS.map((w) => widgetResetKey(w.id))]) {
      ctx.config.watch(key, () => this.widgets.readConfig());
    }

    this.ov = ctx.overlays.declare({
      id: "heatStats",
      kind: "vue",
      asset: "HeatStatsRecorder.vue",
      size: RECORDER_SIZE,
      positionConfigKey: "overlay_pos",
    });
    this.ov.setBool("isSetupComplete", false);

    this.vueOv = ctx.overlays.declare({
      id: "heatStatsVue",
      kind: "vue",
      asset: "HeatStatsOverlay.vue",
      size: WINDOW_SIZE,
      positionConfigKey: "window_rect",
      interactive: true,
    });
    this.vueOv.setBool("isSetupComplete", false);
    this.vueOv.setString("version", (this.constructor as typeof HeatStatsPlugin).version);
    this.vueOv.onAction((action, payload) => this.onWindowAction(action, payload));

    this.declareSchema();
    this.pushLocale();
    this.pushStreakLength();
    this.pushBattles();
    this.pushCharts();
    this.pushConnection();
    this.widgets.sync();

    this.toggleCombo = ctx.hotkeyFor("toggle_window", TOGGLE_WINDOW_HOTKEY);
    ctx.hotkeys.register(this.toggleCombo, () => this.toggleWindow(), this.t("hotkeys.toggleWindow"));

    void this.stats.refresh();
    void this.replays.scan();
    // Restores a stored session, or settles into local mode.
    void this.account.start();

    this.pushPhase();
  }

  /** What the window may know about the account. Never a token. */
  private async pushAccount(): Promise<void> {
    const view = this.account.view;
    const [counts, cloud] = await Promise.all([this.store.counts(), this.store.cloudCount()]);
    // The profile is held by the sync engine, so this costs no request.
    const profile = view.state === "signedIn" ? this.sync.profile : null;
    this.vueOv?.setJson("account", { ...view, counts, cloud, profile, sync: this.sync.progress });
    this.pushConnection();
  }

  private pushConnection(): void {
    const phase = this.sync.progress.phase;
    const connection =
      this.account.view.state !== "signedIn"
        ? "local"
        : phase === "offline" || phase === "error"
          ? "offline"
          : phase === "idle"
            ? "online"
            : "syncing";
    if (connection === this.lastConnection) return;
    this.lastConnection = connection;
    this.vueOv?.setString("connection", connection);
  }

  /** One declaration for every surface: the App panel and both overlays' inspectors, in the current language. */
  private declareSchema(): void {
    const sections = this.sections();
    this.ctx.config.schema(sections);
    this.ov?.inspector.sections(sections);
    this.vueOv?.inspector.sections(sections);
    this.widgets.setSections(sections);
  }

  /** The user's pick, else the App's language. */
  private pickLocale(): string {
    return resolveLocale(this.ctx.config.get("locale", ""), this.appLanguage);
  }

  /** The service keeps `language` current. A permission change also shows here. */
  private followAppLanguage(): void {
    const language = this.language?.language;
    if (language === this.appLanguage) return;
    this.appLanguage = language;
    this.applyLocale();
  }

  private applyLocale(): void {
    const next = this.pickLocale();
    if (next === this.locale) return;
    this.locale = next;
    this.t = translator(next);
    this.declareSchema();
    this.pushLocale();
    // The in-game marks show their group name as a tooltip, so the page script is rebuilt in the new language.
    this.applyTagColors();
    this.guard.setup(this.guardLabels());
  }

  private pushLocale(): void {
    const messages = messagesFor(this.locale);
    this.vueOv?.setString("locale", this.locale);
    this.vueOv?.setJson("locales", LOCALES);
    this.vueOv?.setJson("messages", messages);
    // The recorder widget also shows text, so it gets the same messages.
    this.ov?.setString("locale", this.locale);
    this.ov?.setJson("messages", messages);
    this.widgets.setLocale(this.locale, messages);
  }

  private pushStreakLength(): void {
    const length = Number(this.ctx.config.get("streak_length", DEFAULT_STREAK_LENGTH));
    this.vueOv?.set("streakLength", STREAK_LENGTHS.includes(length) ? length : DEFAULT_STREAK_LENGTH);
  }

  private pushBattles(): void {
    // Nothing to list only when there is neither an account nor a local match.
    const hasSource = this.stats.source !== "none";
    this.vueOv?.setJson("battles", queryBattles(this.battleRows, this.battleQuery, hasSource));
  }

  /**
   * Every configured loadout, read fresh from the hangar. The cached `snapshot` is as old as the last 2-second poll,
   * so a loadout edited just before queueing can be stale there. A fresh read after battle start comes after the lock,
   * so it is exactly what the player took in. The cache is the fallback when the hangar page is absent.
   */
  private async readLoadouts(): Promise<LoadoutSnapshot | null> {
    const acc = this.acc;
    if (!acc) return null;
    let hangar: unknown = null;
    if (typeof acc.fetchSnapshot === "function") hangar = await acc.fetchSnapshot("hangar");
    if (!hangar && typeof acc.snapshot === "function") hangar = await acc.snapshot("hangar");
    return snapshotLoadouts(hangar);
  }

  /** Loads the part catalog once. It only names parts, so nothing waits for it. An earlier loadout keeps ids and no names. */
  private loadCatalog(): void {
    const acc = this.acc;
    if (this.catalog || this.catalogLoading || !acc?.connectedHangar) return;
    if (typeof acc.fetchSnapshot !== "function") return;
    if (Date.now() - this.catalogTriedAt < CATALOG_RETRY_MS) return;

    this.catalogLoading = true;
    this.catalogTriedAt = Date.now();
    acc
      .fetchSnapshot("catalog")
      .then((raw) => {
        const catalog = compactCatalog(raw);
        // A hangar that is still loading has no vehicles. The next attempt tries again.
        if (!catalog) return;
        this.catalog = catalog;
        this.ctx.logger.info(
          `heat_stats: part catalog loaded - ${catalog.vehicles.size} vehicles, ${catalog.modules.size} modules, ` +
            `${catalog.perks.size} perks, ${catalog.equipment.size} equipment`,
        );
      })
      .catch((e: unknown) =>
        this.ctx.logger.warning(`heat_stats: part catalog failed: ${e instanceof Error ? e.message : String(e)}`),
      )
      .finally(() => {
        this.catalogLoading = false;
      });
  }

  private pushReplays(): void {
    // Called from the stats callback, which can run before the library exists.
    if (!this.replays) return;
    this.vueOv?.setJson("replays", this.replays.view(this.battleRows));
  }

  /** The Charts tab's data. Computed here, so only the plotted points cross the bridge, not the battle list. */
  private pushCharts(): void {
    this.vueOv?.setJson("charts", buildCharts(this.battleRows));
  }

  /**
   * The marks for the Tags tab and every roster in the window. `battles` counts the recorded battles
   * of each player, because that is the only reason to list a tagged stranger.
   */
  private pushTags(): void {
    const seen = new Map<string, number>();
    for (const row of this.battleRows ?? []) {
      for (const side of [row.roster?.ally ?? [], row.roster?.enemy ?? []]) {
        for (const p of side) {
          if (p.pid) seen.set(p.pid, (seen.get(p.pid) ?? 0) + 1);
        }
      }
    }
    this.vueOv?.setJson("tags", {
      groups: TAG_GROUPS,
      colors: this.tagColors(),
      players: this.tags.list().map((r) => ({
        pid: r.pid,
        name: r.name,
        tags: r.tags,
        battles: seen.get(r.pid) ?? 0,
      })),
    });
    // Other plugins that draw players get the change at the same time.
    this.tagsService?.publish();
    void this.guard.refresh();
  }

  private onWindowAction(action: string, payload?: unknown): void {
    if (action === "setLocale" && typeof payload === "string" && LOCALES.includes(payload)) {
      this.ctx.config.set("locale", payload);
      this.applyLocale();
    } else if (action === "close") {
      this.ctx.config.set("window_open", false);
    } else if (action === "battles") {
      this.battleQuery = normalizeQuery(payload);
      this.pushBattles();
    } else if (action === "refresh") {
      void this.stats.refresh();
      this.samples.retry();
    } else if (action === "samples") {
      this.samples.setOpen(payload);
    } else if (action === "tags") {
      void this.onTagAction(payload);
    } else if (action === "replays") {
      const body = (payload ?? {}) as Record<string, unknown>;
      void this.replays.act(String(body.op ?? ""), String(body.name ?? ""));
    } else {
      this.onAccountAction(action, payload);
    }
  }

  /** The Tags tab edits the same record the in-game scoreboard writes. */
  private async onTagAction(payload: unknown): Promise<void> {
    const body = (payload ?? {}) as Record<string, unknown>;
    const pid = body.pid == null ? "" : String(body.pid);
    if (!pid) return;
    if (body.op === "set") await this.tags.set(pid, body.tags);
    else if (body.op === "clear") await this.tags.set(pid, []);
    else return;
    this.pushTags();
    // The game shows the old marks until it gets the new ones.
    await this.tagsInjector.refresh();
    // Signed in, this goes up on the next drain. Local-only, it waits for an account.
    this.sync.nudge();
  }


  private onAccountAction(action: string, payload?: unknown): void {
    const field = (name: string): string => {
      const body = (payload ?? {}) as Record<string, unknown>;
      return typeof body[name] === "string" ? (body[name] as string) : "";
    };

    switch (action) {
      case "signIn":
        void this.account.signIn(field("email"), field("password"));
        break;
      case "signUp":
        void this.account.signUp(field("email"), field("password"));
        break;
      case "confirmEmail":
        void this.account.confirm(field("code"));
        break;
      case "resendCode":
        void this.account.resendCode();
        break;
      case "recover":
        void this.account.recover(field("email"));
        break;
      case "confirmRecovery":
        void this.account.confirmRecovery(field("code"));
        break;
      case "resendRecovery":
        void this.account.resendRecovery();
        break;
      case "cancelRecovery":
        this.account.cancelRecovery();
        break;
      case "setPassword":
        void this.account.setPassword(field("password"));
        break;
      case "signInWithDiscord":
        void this.account.signInWithDiscord();
        break;
      case "signOut":
        void this.account.signOut();
        break;
      case "useLocal":
        this.account.useLocal();
        break;
      case "leaveLocal":
        this.account.leaveLocal();
        break;
      case "deleteAccount":
        void this.account.deleteAccount();
        break;
      case "dismissError":
        this.account.dismissError();
        break;
      case "setUsername":
        void this.sync.setUsername(field("username")).then(() => void this.pushAccount());
        break;
      case "setApiAccess":
        void this.sync.setApiAccess(Boolean((payload as { allow?: unknown })?.allow));
        break;
      case "retryRejected":
        void this.store.retryRejected().then(() => this.sync.nudge());
        break;
      default:
        break;
    }
  }

  private toggleWindow(): void {
    this.ctx.config.set("window_open", !this.ctx.config.get("window_open", true));
  }

  private pushPhase(): void {
    const phase = this.recorder.phase;
    if (!this.ov || phase === this.lastPhase) return;
    this.lastPhase = phase;
    this.ov.setString("phase", phase);
    // The window's recorder status: waiting for a match counts as idle.
    const status = phase === "recording" ? "recording" : phase === "summarizing" || phase === "finalizing" ? "submitting" : "idle";
    this.vueOv?.setString("status", status);
  }

  override enterCalibrate(_stage = 1): void {
    this.ov?.setBool("isSetupComplete", false);
    this.vueOv?.setBool("isSetupComplete", false);
    this.widgets.resend();
  }
  override enterLocked(): void {
    this.ov?.setBool("isSetupComplete", true);
    this.vueOv?.setBool("isSetupComplete", true);
    this.widgets.resend();
    void this.stats.refresh();
  }
  override setOverlayVisible(visible: boolean): void {
    this.hostVisible = visible;
    this.widgets.setHostVisible(visible);
    if (this.ctx.state === "calibrate") return;
    this.ov?.setVisible(visible);
    this.applyVueVisibility();
  }

  /** battle_hud exists only during a battle. */
  private get inBattle(): boolean {
    return !!this.acc?.connected;
  }

  private applyVueVisibility(): void {
    if (this.ctx.state === "calibrate") return;
    const open = Boolean(this.ctx.config.get("window_open", true));
    const hideInBattle = Boolean(this.ctx.config.get("hide_in_battle", false));
    const visible = this.hostVisible && open && !(hideInBattle && this.inBattle);
    if (visible === this.lastVueVisible) return;
    this.lastVueVisible = visible;
    this.vueOv?.setVisible(visible);
  }

  override tick(dt: number): void {
    this.ctx.config.checkReload();
    this.followAppLanguage();
    this.pushPhase();
    this.applyVueVisibility();
    // It limits its own rate and does nothing once loaded, so each tick can call it.
    this.loadCatalog();
    // Its own CDP socket, so tagging works whether or not a battle is recording.
    void this.tagsInjector.pump(dt);
    void this.guard.pump(dt);
    this.widgets.tick(dt);
    if (this.ctx.state !== "locked" || !this.acc) return;
    // A replay's battle looks live to Accessors. It is not a new battle.
    if (this.replays.playing) return;
    this.recorder.tick(dt);
  }

  override teardown(): void {
    this.tagsInjector.teardown();
    this.guard.teardown();
    this.replays.teardown();
    this.recorder.teardown();
    this.widgets.teardown();
    this.stats.dispose();
    this.sync.stop();
    this.ctx.hotkeys.unregister(this.toggleCombo);
    this.ov?.remove();
    this.vueOv?.remove();
  }

  private onConnected(): void {
    // Without a configured name, player_name comes from accessors only after CDP connects.
    // A refresh at lock time had no player, so it runs again here.
    if (this.recorder.onConnected()) void this.stats.refresh();
  }
}
