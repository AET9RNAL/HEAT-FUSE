/**
 * Inspector Demo - a test bed for the overlay-inspector API.
 *
 * Declares one section per control family so every input type, predicate and
 * phase can be exercised against a live overlay. The overlay itself just mirrors
 * the current values back, which is how a `live` phase is told apart from a
 * `commit` one by eye.
 */
import {
  FusePlugin,
  type FuseContext,
  type InspectorSection,
  type OverlayHandle,
} from "@fuse/plugin-sdk";

export class InspectorDemoPlugin extends FusePlugin {
  static override pluginName = "Inspector Demo";
  static override version = "1.0.0";
  static override description = "Exercises every overlay-inspector control type.";
  static override requiresCalibration = true;
  static override calibrationStages = 2;

  private ctx!: FuseContext;
  private ov: OverlayHandle | undefined;
  /** Last transient (unbound) values, echoed to the overlay for display. */
  private transient: Record<string, unknown> = { preview_phase: "charge", preview_fill: 62 };
  private lastEvent = "—";
  private stage = 1;
  private notifyCount = 0;

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
      })
      .load();

    // One declaration for both surfaces: the App panel and the stage inspector.
    const sections = this.sections();
    ctx.config.schema(sections);

    this.ov = ctx.overlays.declare({
      id: "demo",
      kind: "vue",
      asset: "DemoOverlay.vue",
      size: { w: 420, h: 300 },
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
      const action = id === "row" ? String(payload) : id;
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

    this.push();
  }

  /** Every control family the inspector knows, one section each. */
  private sections(): InspectorSection[] {
    return [
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

  override tick(): void {
    this.ctx.config.checkReload();
  }

  override teardown(): void {
    this.ov?.remove();
  }

  private push(): void {
    if (!this.ov) return;
    this.ov.setJson("demo", {
      config: this.ctx.config.snapshot(),
      transient: this.transient,
      lastEvent: this.lastEvent,
      stage: this.stage,
      state: this.ctx.state,
    });
  }
}
