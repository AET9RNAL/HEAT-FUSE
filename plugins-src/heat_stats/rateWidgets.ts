import type { FuseContext, InspectorSection, OverlayHandle } from "@fuse/plugin-sdk";
import { RATE_WIDGETS, RateTracker, isResetMode, simView, type Read, type RateWidget } from "./widgets.js";

export const WIDGET_SCENES = ["alive", "map", "dead", "deploy", "results"];
export const DEFAULT_WIDGET_SCENES = ["alive", "dead"];
const WIDGET_SIZE = { w: 240, h: 92 };
const FIRST_SPOT = { x: 24, y: 320 };
const STACK_GAP = 8;

export const widgetRectKey = (id: string): string => `widget_${id}_rect`;
export const widgetResetKey = (id: string): string => `widget_${id}_reset`;

function configList(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

interface Shown {
  widget: RateWidget;
  ov: OverlayHandle;
  /** The last view sent, so an unchanged tracker sends nothing. */
  key: string;
  visible: boolean | null;
}

export class RateWidgets {
  private readonly trackers = RATE_WIDGETS.map((widget) => new RateTracker(widget));
  private readonly shown = new Map<string, Shown>();
  private scenes = new Set(DEFAULT_WIDGET_SCENES);
  private hostVisible = true;
  private sections: InspectorSection[] = [];
  private locale = "en";
  private messages: Record<string, string> = {};
  private simT = 0;

  constructor(
    private readonly ctx: FuseContext,
    private readonly read: Read,
  ) {}

  /** Declares the widgets picked in the `widgets` config and removes the rest. */
  sync(): void {
    const picked = new Set(configList(this.ctx.config.get("widgets", [])));
    for (const [id, shown] of this.shown) {
      if (picked.has(id)) continue;
      shown.ov.remove();
      this.shown.delete(id);
    }
    RATE_WIDGETS.forEach((widget, index) => {
      if (picked.has(widget.id) && !this.shown.has(widget.id)) this.declare(widget, index);
    });
  }

  private declare(widget: RateWidget, index: number): void {
    const ov = this.ctx.overlays.declare({
      id: `widget_${widget.id}`,
      kind: "vue",
      asset: "HeatStatsWidget.vue",
      size: WIDGET_SIZE,
      defaultRect: { x: FIRST_SPOT.x, y: FIRST_SPOT.y + index * (WIDGET_SIZE.h + STACK_GAP), ...WIDGET_SIZE },
      positionConfigKey: widgetRectKey(widget.id),
    });
    ov.setJson("widget", { id: widget.id, digits: widget.digits, pad: widget.pad });
    ov.setString("locale", this.locale);
    ov.setJson("messages", this.messages);
    ov.inspector.sections(this.sections);
    this.shown.set(widget.id, { widget, ov, key: "", visible: null });
  }

  setSections(sections: InspectorSection[]): void {
    this.sections = sections;
    for (const { ov } of this.shown.values()) ov.inspector.sections(sections);
  }

  setLocale(locale: string, messages: Record<string, string>): void {
    this.locale = locale;
    this.messages = messages;
    for (const { ov } of this.shown.values()) {
      ov.setString("locale", locale);
      ov.setJson("messages", messages);
    }
  }

  readConfig(): void {
    this.scenes = new Set(configList(this.ctx.config.get("widget_show_in", DEFAULT_WIDGET_SCENES)));
    for (const tracker of this.trackers) {
      const reset = this.ctx.config.get(widgetResetKey(tracker.widget.id), "battle");
      tracker.reset = isResetMode(reset) ? reset : "battle";
    }
  }

  setHostVisible(visible: boolean): void {
    this.hostVisible = visible;
    this.resend();
  }

  /** Sends every widget its view and visibility again on the next tick. */
  resend(): void {
    this.simT = 0;
    for (const shown of this.shown.values()) {
      shown.key = "";
      shown.visible = null;
    }
  }

  tick(dt: number): void {
    for (const tracker of this.trackers) tracker.tick(this.read, dt);
    if (!this.shown.size) return;
    if (this.ctx.state === "calibrate") {
      this.tickSim(dt);
      return;
    }
    if (this.ctx.state !== "locked") return;

    const inScope = this.inScope();
    for (const tracker of this.trackers) {
      const shown = this.shown.get(tracker.widget.id);
      if (!shown) continue;
      this.setVisible(shown, inScope);
      if (!inScope || tracker.key === shown.key) continue;
      shown.key = tracker.key;
      shown.ov.setJson("rate", tracker.view());
    }
  }

  /** The sample battle moves once a second. */
  private tickSim(dt: number): void {
    const second = Math.floor(this.simT);
    this.simT += dt;
    const moved = Math.floor(this.simT) !== second;
    for (const shown of this.shown.values()) {
      if (shown.key === "sim" && !moved) continue;
      shown.key = "sim";
      shown.ov.setJson("rate", simView(shown.widget, this.simT));
    }
  }

  /** Accessors tags the game state once for every plugin. This only checks the tags against the user's pick. */
  private inScope(): boolean {
    const tags = this.read("scene_tags");
    return Array.isArray(tags) && tags.some((tag) => this.scenes.has(String(tag)));
  }

  private setVisible(shown: Shown, want: boolean): void {
    const visible = this.hostVisible && want;
    if (visible === shown.visible) return;
    shown.visible = visible;
    shown.ov.setVisible(visible);
  }

  teardown(): void {
    for (const { ov } of this.shown.values()) ov.remove();
    this.shown.clear();
  }
}
