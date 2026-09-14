/**
 * Inspector Demo - a test bed for the overlay-inspector API and the plugin APIs.
 *
 * Declares one section per control family so every input type, predicate and
 * phase can be exercised against a live overlay, plus a section that drives
 * storage, secrets, links, permissions and services and runs their self-tests.
 * The overlay mirrors values and results back.
 */
import {
  FusePlugin,
  type FuseContext,
  type InspectorSection,
  type OverlayHandle,
  type ServiceHandle,
  type TeardownReason,
} from "@fuse/plugin-sdk";
import { runSelfTests, type TestReport } from "./selftest.js";

const DATA = "demo";
const TOKEN_KEY = "demo.token";
const SERVICE = "inspector_demo";
const SHOWN_SCOPES = ["storage", "secrets", "network", `${SERVICE}.admin`, "audio"];

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export class InspectorDemoPlugin extends FusePlugin {
  static override pluginName = "Inspector Demo";
  static override version = "2.0.0";
  static override description = "Exercises every overlay-inspector control type and the plugin APIs.";
  static override requiresCalibration = true;
  static override calibrationStages = 2;

  private ctx!: FuseContext;
  private ov: OverlayHandle | undefined;
  /** Last transient (unbound) values, echoed to the overlay for display. */
  private transient: Record<string, unknown> = { preview_phase: "charge", preview_fill: 62 };
  private lastEvent = "—";
  private stage = 1;
  private notifyCount = 0;

  private svc: ServiceHandle | null = null;
  private svcCounter = 0;
  private counter: number | null = null;
  private token = "—";
  private askResult = "—";
  private loadResult = "idle";
  private burnUntil = 0;
  private ballast: Buffer | null = null;
  private ballastTimer: ReturnType<typeof setTimeout> | null = null;
  private linkResult = "—";
  private lastCallback = "—";
  private report: TestReport | null = null;
  private testsRunning = false;
  private refreshTimer = 0;

  /** The `inspector_demo` service. The self-test calls it on itself, through the runtime. */
  private readonly service = {
    ping: (): string => "pong",
    echo: (value: unknown): unknown => value,
    fail: (): never => {
      throw new Error("boom");
    },
    bigint: (): bigint => BigInt(1),
    hang: (): Promise<never> => new Promise<never>(() => {}),
    resetCounter: (): boolean => {
      this.svcCounter = 0;
      this.svc?.publish();
      return true;
    },
  };

  setup(ctx: FuseContext): void {
    this.ctx = ctx;

    ctx.config
      .defaults({
        demo_pos: null,
        opacity_pct: 62,
        offset: 0,
        count: 10,
        nudge_x: 0,
        nudge_y: 0,
        enabled: true,
        compact: false,
        density: "medium",
        phase: "charge",
        corners: ["tl", "br"],
        font_family: "WGNormalidad",
        title: "Inspector Demo",
        notes: "",
        accent: "#FFDB8CFF",
        tint: "#84FFB1FF",
        anchor: "center",
        combo: "ctrl+alt+d",
        last_teardown: "",
      })
      .load();

    // One declaration for both surfaces: the App panel and the stage inspector.
    const sections = this.sections();
    ctx.config.schema(sections);

    this.ov = ctx.overlays.declare({
      id: "demo",
      kind: "vue",
      asset: "DemoOverlay.vue",
      size: { w: 460, h: 560 },
      positionConfigKey: "demo_pos",
    });

    this.ov.inspector.sections(sections);

    this.ov.inspector.onInput((id, value, phase) => {
      if (!id.startsWith("preview_")) {
        this.lastEvent = `${id} = ${JSON.stringify(value)} (${phase})`;
        this.push();
        return;
      }
      // Transient controls never reach config - the plugin is their only store.
      this.transient[id] = value;
      this.lastEvent = `${id} = ${JSON.stringify(value)} (${phase}, transient)`;
      this.push();
    });

    // Presses from both surfaces land here: the stage falls back to it when the overlay has no handler.
    ctx.config.onAction((id, payload) => {
      // A button row reports its own id, with the pressed button's id as the payload.
      const action = id === "row" || id.startsWith("api_row") ? String(payload) : id;
      if (action === "reset") {
        ctx.config.update({ offset: 0, count: 10, opacity_pct: 100, nudge_x: 0, nudge_y: 0 });
      }
      if (action === "wipe") {
        ctx.config.set("notes", "");
      }
      if (action === "notify") {
        const types = ["info", "success", "warning", "error"] as const;
        const type = types[this.notifyCount++ % types.length] ?? "info";
        ctx.notifications.notify({
          type,
          title: `Test ${type} notification`,
          message: "Raised from Inspector Demo. Hover to pause the countdown, click this text to expand it.",
        });
      }
      if (action === "randomise") {
        ctx.config.set("accent", `#${Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, "0").toUpperCase()}FF`);
      }
      if (action === "selftest" || action === "selftest_slow") void this.runTests(action === "selftest_slow");
      if (action === "counter") void this.bumpCounter();
      if (action === "token") void this.saveToken();
      if (action === "svc_bump") {
        this.svcCounter++;
        this.svc?.publish();
      }
      if (action === "open_link") void this.openLink();
      if (action === "ask_network") void this.ask("network");
      if (action === "ask_admin") void this.ask(`${SERVICE}.admin`);
      if (action === "burn_cpu") void this.burnCpu(3);
      if (action === "hold_memory") this.holdMemory(64, 10);
      if (action === "clear_data") void this.clearData();
      this.lastEvent = `action: ${id}${payload === undefined ? "" : ` ${JSON.stringify(payload)}`}`;
      this.push();
    });

    // Any config write - inspector, App panel or a hand edit - refreshes the view.
    for (const key of Object.keys(ctx.config.snapshot())) {
      ctx.config.watch(key, () => this.push());
    }

    ctx.hotkeys.register(ctx.hotkeyFor("demo_action", "ctrl+alt+d"), () => {
      this.lastEvent = "hotkey fired";
      this.push();
    }, "Demo Action");

    // `resetCounter` and the state need inspector_demo.admin, declared in the manifest's `provides`.
    this.svc = ctx.services.provide(SERVICE, {
      target: this.service,
      methods: Object.keys(this.service),
      scopes: { resetCounter: "admin" },
      stateScope: "admin",
      state: () => ({ counter: this.svcCounter }),
    });

    // Registered first and throws on purpose: the next handler must still run.
    ctx.links.onCallback((url) => {
      if (url.includes("throw")) throw new Error("callback test: thrown on purpose");
    });
    ctx.links.onCallback((url) => {
      this.lastCallback = url;
      this.lastEvent = "link callback received";
      this.push();
    });

    void this.loadCounter();
    this.push();
  }

  /** Every control family the inspector knows, one section each. */
  private sections(): InspectorSection[] {
    return [
      {
        id: "demo.apis",
        label: "Plugin APIs",
        description: "Storage, secrets, links, permissions and services. Results show on the overlay.",
        order: 9,
        controls: [
          {
            type: "button",
            id: "selftest",
            text: "Run self-test",
            variant: "accent",
            tooltip: "Runs every API check, including the calls that must be refused.",
          },
          {
            type: "button",
            id: "selftest_slow",
            text: "Run with slow tests",
            tooltip: "Adds a link opened without a user action and a service call that never answers. About 20 s.",
          },
          {
            type: "buttonRow",
            id: "api_row_data",
            buttons: [
              { id: "counter", text: "Counter +1", tooltip: "Storage: adds one to a saved counter." },
              { id: "token", text: "Save token", tooltip: "Secrets: saves a token and reads it back." },
              { id: "svc_bump", text: "Service +1", tooltip: "Publishes a new counter on the demo's service. Visible only with Demo admin." },
            ],
          },
          {
            type: "buttonRow",
            id: "api_row_ask",
            buttons: [
              { id: "open_link", text: "Open example.com", tooltip: "Links: opens a page in your browser." },
              { id: "ask_network", text: "Ask for Networking", tooltip: "Permissions: asks again after a deny, once per session. Allowing restarts the plugin." },
              { id: "ask_admin", text: "Ask for Demo admin", tooltip: "Permissions: asks again for this plugin's own scope, once per session after a deny." },
            ],
          },
          {
            type: "buttonRow",
            id: "api_row_load",
            buttons: [
              { id: "burn_cpu", text: "Burn CPU 3 s", tooltip: "Keeps one core busy, for the CPU segment in the info bar." },
              { id: "hold_memory", text: "Hold 64 MB 10 s", tooltip: "Allocates memory, for the RAM segment in the info bar." },
            ],
          },
          {
            type: "buttonRow",
            id: "api_row_clear",
            buttons: [
              { id: "clear_data", text: "Clear demo data", variant: "danger", confirm: "Sure?", tooltip: "Clears the counter, the token and test records." },
            ],
          },
          {
            type: "note",
            id: "api_note",
            text: "Link callbacks: open fuse://plugin/inspector_demo/callback?state=test in a browser; add &throw=1 to test a failing handler. Change permissions from the info bar above this overlay.",
          },
        ],
      },
      {
        id: "demo.numeric",
        label: "Numeric",
        description: "Sliders commit on release; the number field commits on blur or Enter.",
        order: 10,
        controls: [
          {
            type: "slider",
            id: "opacity_pct",
            key: "opacity_pct",
            label: "Fill",
            min: 0,
            max: 100,
            step: 1,
            unit: "%",
            default: 100,
            tooltip: "Bound slider - writes opacity_pct on release. Double-click to reset.",
          },
          {
            type: "slider",
            id: "offset",
            key: "offset",
            label: "Offset",
            min: -50,
            max: 50,
            step: 1,
            unit: "px",
            bipolar: true,
            default: 0,
            hint: "Bipolar: the fill grows out from zero.",
          },
          {
            type: "number",
            id: "count",
            key: "count",
            label: "Count",
            min: 1,
            max: 64,
            step: 1,
            tooltip: "Drag the label sideways to scrub. Shift for ×10.",
          },
          {
            type: "vec2",
            id: "nudge",
            label: "Nudge",
            keys: ["nudge_x", "nudge_y"],
            labels: ["X", "Y"],
            min: -200,
            max: 200,
            tooltip: "One control, two config keys.",
          },
        ],
      },
      {
        id: "demo.booleans",
        label: "Booleans",
        order: 11,
        controls: [
          {
            type: "toggle",
            id: "enabled",
            key: "enabled",
            label: "Enabled",
            tooltip: "Checkbox form. Everything below depends on it.",
          },
          {
            type: "switch",
            id: "compact",
            key: "compact",
            label: "Compact",
            disabledWhen: { key: "enabled", truthy: false },
            hint: "Disabled while Enabled is off - a disabledWhen predicate.",
          },
        ],
      },
      {
        id: "demo.choice",
        label: "Choice",
        description: "Exclusive and multi-select, in the four shapes the inspector offers.",
        order: 12,
        controls: [
          {
            type: "segmented",
            id: "density",
            key: "density",
            label: "Density",
            options: [
              { value: "small", label: "S", tooltip: "Small" },
              { value: "medium", label: "M", tooltip: "Medium" },
              { value: "large", label: "L", tooltip: "Large" },
            ],
          },
          {
            type: "buttons",
            id: "phase",
            key: "phase",
            mode: "exclusive",
            label: "Phase",
            options: [
              { value: "charge", label: "Charge" },
              { value: "active", label: "Active" },
              { value: "reload", label: "Reload" },
            ],
          },
          {
            type: "buttons",
            id: "corners",
            key: "corners",
            mode: "multi",
            label: "Corners",
            options: [
              { value: "tl", label: "", icon: "align-top", tooltip: "Top left" },
              { value: "tr", label: "", icon: "align-right", tooltip: "Top right" },
              { value: "bl", label: "", icon: "align-left", tooltip: "Bottom left" },
              { value: "br", label: "", icon: "align-bottom", tooltip: "Bottom right" },
            ],
            hint: "Multi mode stores an array.",
          },
          {
            type: "select",
            id: "font_family",
            key: "font_family",
            label: "Font",
            searchable: true,
            options: [
              { value: "WGNormalidad", label: "WGNormalidad" },
              { value: "Geist Mono", label: "Geist Mono" },
              { value: "system-ui", label: "System UI" },
              { value: "Courier New", label: "Courier New" },
            ],
          },
          {
            type: "radio",
            id: "anchor",
            key: "anchor",
            label: "Anchor",
            width: "full",
            options: [
              { value: "start", label: "Start", description: "Pin to the leading edge." },
              { value: "center", label: "Centre", description: "Grow from the middle." },
              { value: "end", label: "End", description: "Pin to the trailing edge." },
            ],
          },
        ],
      },
      {
        id: "demo.text",
        label: "Text & colour",
        order: 13,
        controls: [
          {
            type: "text",
            id: "title",
            key: "title",
            label: "Title",
            placeholder: "Overlay title",
            maxLength: 32,
          },
          {
            type: "text",
            id: "notes",
            key: "notes",
            label: "Notes",
            width: "full",
            multiline: true,
            placeholder: "Free text, committed on blur",
          },
          {
            type: "color",
            id: "accent",
            key: "accent",
            label: "Accent",
            alpha: true,
            swatches: ["#FFDB8CFF", "#84FFB1FF", "#FF3935FF", "#F2F2F2FF"],
          },
          {
            type: "color",
            id: "tint",
            key: "tint",
            label: "Tint",
            withOpacitySlider: true,
            hint: "Swatch plus an inline alpha slider.",
          },
        ],
      },
      {
        id: "demo.transient",
        label: "Preview",
        description: "Unbound controls: the plugin sees them, config never does.",
        order: 14,
        controls: [
          {
            type: "buttons",
            id: "preview_phase",
            mode: "exclusive",
            options: [
              { value: "charge", label: "Charge" },
              { value: "active", label: "Active" },
              { value: "reload", label: "Reload" },
            ],
          },
          {
            type: "slider",
            id: "preview_fill",
            label: "Fill",
            min: 0,
            max: 100,
            step: 1,
            unit: "%",
          },
        ],
      },
      {
        id: "demo.actions",
        label: "Actions",
        order: 15,
        collapsible: true,
        controls: [
          { type: "note", id: "note1", text: "Buttons round-trip to the plugin as inspector:action." },
          { type: "button", id: "randomise", text: "Randomise accent", variant: "accent", icon: "reset" },
          { type: "button", id: "notify", text: "Send test notification", icon: "about" },
          {
            type: "buttonRow",
            id: "row",
            buttons: [
              { id: "reset", text: "Reset", icon: "reset", tooltip: "Restore numeric defaults" },
              { id: "wipe", text: "Wipe notes", variant: "danger", confirm: "Sure?" },
            ],
          },
          { type: "divider", id: "div1" },
          { type: "keybind", id: "combo", key: "combo", label: "Shortcut" },
          {
            type: "note",
            id: "note2",
            tone: "warn",
            text: "Rebinding here only stores the string - wiring it to the host registry is separate.",
          },
        ],
      },
      {
        id: "demo.stage2",
        label: "Stage 2 only",
        description: "Section-level `when`, driven by a transient control.",
        order: 16,
        when: { key: "preview_phase", eq: "reload" },
        controls: [
          {
            type: "note",
            id: "note3",
            text: "Visible only while Preview is set to Reload.",
          },
        ],
      },
    ];
  }

  override enterCalibrate(stage = 1): void {
    this.stage = stage;
    this.push();
  }

  override enterLocked(): void {
    this.stage = 0;
    this.push();
  }

  override setOverlayVisible(visible: boolean): void {
    if (this.ctx.state === "calibrate") return;
    this.ov?.setVisible(visible);
  }

  override tick(dt: number): void {
    // Permission changes and service state arrive without an event of their own.
    this.refreshTimer += dt;
    if (this.refreshTimer < 1) return;
    this.refreshTimer = 0;
    this.push();
  }

  override teardown(reason?: TeardownReason): void {
    this.burnUntil = 0;
    if (this.ballastTimer) clearTimeout(this.ballastTimer);
    this.ballast = null;
    // Written during teardown, so the overlay shows whether the last write landed.
    this.ctx.config.set("last_teardown", `${reason ?? "none"} at ${new Date().toLocaleTimeString()}`);
    this.ov?.remove();
  }

  private async runTests(slow: boolean): Promise<void> {
    if (this.testsRunning) return;
    this.testsRunning = true;
    this.report = null;
    this.push();
    try {
      this.report = await runSelfTests(this.ctx, {
        slow,
        onProgress: (report) => {
          this.report = report;
          this.push();
        },
      });
      for (const r of this.report.results) {
        if (r.status === "fail") this.ctx.logger.warning(`self-test failed: ${r.group} / ${r.name}: ${r.detail}`);
      }
      const { passed, failed, skipped } = this.report;
      this.ctx.logger.info(`self-test: ${passed} passed, ${failed} failed, ${skipped} skipped`);
      this.lastEvent = `self-test: ${passed} passed, ${failed} failed, ${skipped} skipped`;
    } catch (e) {
      this.lastEvent = `self-test crashed: ${errorText(e)}`;
    } finally {
      this.testsRunning = false;
      void this.loadCounter();
      this.push();
    }
  }

  private async loadCounter(): Promise<void> {
    if (!this.ctx.permissions.has("storage")) {
      this.counter = null;
      this.push();
      return;
    }
    try {
      const doc = await this.ctx.storage.collection<{ value: number }>(DATA).get("counter");
      this.counter = doc?.value ?? 0;
    } catch (e) {
      this.ctx.logger.warning(`counter: ${errorText(e)}`);
    }
    this.push();
  }

  private async bumpCounter(): Promise<void> {
    try {
      const col = this.ctx.storage.collection<{ value: number }>(DATA);
      const next = ((await col.get("counter"))?.value ?? 0) + 1;
      await col.put("counter", { value: next });
      this.counter = next;
      this.lastEvent = `storage: counter = ${next}`;
    } catch (e) {
      this.lastEvent = `storage: ${errorText(e)}`;
    }
    this.push();
  }

  private async saveToken(): Promise<void> {
    try {
      const token = `demo-${Date.now().toString(36)}`;
      await this.ctx.secrets.set(TOKEN_KEY, token);
      this.token = (await this.ctx.secrets.get(TOKEN_KEY)) === token ? `saved ${token}` : "read back didn't match";
    } catch (e) {
      this.token = errorText(e);
    }
    this.push();
  }

  private async openLink(): Promise<void> {
    try {
      this.linkResult = (await this.ctx.links.open("https://example.com/")) ? "opened" : "refused: no recent user action";
    } catch (e) {
      this.linkResult = errorText(e);
    }
    this.push();
  }

  private async ask(scope: string): Promise<void> {
    this.askResult = `${scope}: asking…`;
    this.push();
    // Allowing network restarts this plugin: it's fixed when the process starts.
    try {
      this.askResult = `${scope}: ${await this.ctx.permissions.request(scope)}`;
    } catch (e) {
      this.askResult = `${scope}: ${errorText(e)}`;
    }
    this.push();
  }

  /** Busy in 50 ms slices, so heartbeats and other messages still get through. */
  private async burnCpu(seconds: number): Promise<void> {
    if (this.burnUntil > Date.now()) return;
    this.burnUntil = Date.now() + seconds * 1000;
    this.loadResult = `burning CPU for ${seconds} s`;
    this.push();
    while (Date.now() < this.burnUntil) {
      const sliceEnd = Math.min(this.burnUntil, Date.now() + 50);
      while (Date.now() < sliceEnd) Math.sqrt(Math.random());
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
    this.loadResult = this.ballast ? this.loadResult : "idle";
    this.push();
  }

  private holdMemory(mb: number, seconds: number): void {
    if (this.ballast) return;
    // Filled, so the pages are really committed.
    this.ballast = Buffer.alloc(mb * 1024 * 1024, 1);
    this.loadResult = `holding ${mb} MB for ${seconds} s`;
    this.push();
    this.ballastTimer = setTimeout(() => {
      this.ballast = null;
      this.ballastTimer = null;
      this.loadResult = "idle";
      this.push();
    }, seconds * 1000);
  }

  private async clearData(): Promise<void> {
    const errors: string[] = [];
    const attempt = (work: Promise<unknown>): Promise<unknown> => work.catch((e) => errors.push(errorText(e)));
    await attempt(this.ctx.storage.collection(DATA).clear());
    await attempt(this.ctx.storage.collection("selftest").clear());
    await attempt(this.ctx.secrets.delete(TOKEN_KEY));
    if (!errors.length) {
      this.counter = 0;
      this.token = "—";
    }
    this.lastEvent = errors.length ? `clear: ${errors.join("; ")}` : "demo data cleared";
    this.push();
  }

  private push(): void {
    if (!this.ov) return;
    const view = this.ctx.services.get<{ counter?: number }>(SERVICE);
    let service = "starting…";
    if (view) service = typeof view.counter === "number" ? `counter ${view.counter}` : "state hidden (needs Demo admin)";
    this.ov.setJson("demo", {
      config: this.ctx.config.snapshot(),
      transient: this.transient,
      lastEvent: this.lastEvent,
      stage: this.stage,
      state: this.ctx.state,
      apis: {
        permissions: SHOWN_SCOPES.map((id) => ({ id, state: this.ctx.permissions.state(id) })),
        counter: this.counter ?? (this.ctx.permissions.has("storage") ? "…" : "needs storage"),
        token: this.token,
        service,
        ask: this.askResult,
        load: this.loadResult,
        teardown: this.ctx.config.get("last_teardown", "") || "—",
        link: this.linkResult,
        callback: this.lastCallback,
      },
      tests: this.report
        ? { running: this.testsRunning, ...this.report }
        : this.testsRunning
          ? { running: true, passed: 0, failed: 0, skipped: 0, total: 0, results: [] }
          : null,
    });
  }
}
