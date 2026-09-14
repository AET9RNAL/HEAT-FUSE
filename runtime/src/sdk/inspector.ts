/**
 * Overlay Inspector schema - the in-stage config surface.
 *
 * A plugin declares sections of controls on an overlay handle; the stage renders
 * them under FUSE's own Position/Layout/Appearance sections. Controls carrying a
 * `key` are bound to that plugin's config (the same keys the App panel edits, so
 * both surfaces stay in sync); controls without one are transient and reach the
 * plugin only through `onInput`.
 *
 * Everything here is serialized to JSON over the overlay socket, so predicates
 * are data rather than functions.
 */

/** Conditional predicate evaluated against the overlay's current control values. */
export type When =
  | {
      key: string;
      eq?: unknown;
      ne?: unknown;
      in?: unknown[];
      gt?: number;
      lt?: number;
      truthy?: boolean;
    }
  | { allOf: When[] }
  | { anyOf: When[] }
  | { not: When };

export interface ControlBase {
  /** Unique within the overlay. */
  id: string;
  /** Omitted => the control spans the row instead of sitting beside a label. */
  label?: string;
  /** Hover help. */
  tooltip?: string;
  /** Muted copy rendered under the control. */
  hint?: string;
  /** Plugin config key. Absent => transient (never persisted). */
  key?: string;
  when?: When;
  disabledWhen?: When;
  width?: "full" | "half";
}

export interface SliderControl extends ControlBase {
  type: "slider";
  min: number;
  max: number;
  step?: number;
  /** Readout unit, e.g. "%", "px", "°". */
  unit?: string;
  /** Readout multiplier - 100 renders a 0..1 value as a percentage. */
  displayMul?: number;
  /** Enables double-click reset. */
  default?: number;
  /** Fill grows from the centre rather than the left. */
  bipolar?: boolean;
}

export interface NumberControl extends ControlBase {
  type: "number";
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  precision?: number;
}

export interface Vec2Control extends ControlBase {
  type: "vec2";
  /** Config keys for the two components; overrides `key`. */
  keys?: [string, string];
  labels?: [string, string];
  /** Offers a link toggle that keeps the ratio. */
  link?: boolean;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
}

export interface ToggleControl extends ControlBase {
  type: "toggle";
}

export interface SwitchControl extends ControlBase {
  type: "switch";
}

export interface Option {
  value: string | number | boolean;
  label: string;
  tooltip?: string;
}

export interface SegmentedControl extends ControlBase {
  type: "segmented";
  options: Option[];
}

export interface ButtonsControl extends ControlBase {
  type: "buttons";
  mode: "exclusive" | "multi";
  options: (Option & { icon?: string })[];
}

export interface SelectControl extends ControlBase {
  type: "select";
  options: (Option & { group?: string })[];
  searchable?: boolean;
}

export interface TextControl extends ControlBase {
  type: "text";
  placeholder?: string;
  maxLength?: number;
  pattern?: string;
  multiline?: boolean;
}

export interface ColorControl extends ControlBase {
  type: "color";
  alpha?: boolean;
  /** Renders an opacity slider beside the swatch. */
  withOpacitySlider?: boolean;
  swatches?: string[];
}

export interface RadioControl extends ControlBase {
  type: "radio";
  options: (Option & { description?: string })[];
}

export interface ButtonControl extends ControlBase {
  type: "button";
  text: string;
  variant?: "default" | "accent" | "danger" | "ghost";
  icon?: string;
  /** Requires a second click, showing this text in between. */
  confirm?: string;
}

export interface ButtonRowControl extends ControlBase {
  type: "buttonRow";
  buttons: Omit<ButtonControl, "type" | "key">[];
}

export interface KeybindControl extends ControlBase {
  type: "keybind";
  /** Hotkey action label as registered with the host; omit to just store the combo. */
  action?: string;
}

export interface NoteControl extends ControlBase {
  type: "note";
  text: string;
  tone?: "muted" | "warn";
}

export interface DividerControl {
  type: "divider";
  id?: string;
}

export type InspectorControl =
  | SliderControl
  | NumberControl
  | Vec2Control
  | ToggleControl
  | SwitchControl
  | SegmentedControl
  | ButtonsControl
  | SelectControl
  | TextControl
  | ColorControl
  | RadioControl
  | ButtonControl
  | ButtonRowControl
  | KeybindControl
  | NoteControl
  | DividerControl;

export interface InspectorSection {
  id: string;
  label: string;
  /** Grey copy under the section header. */
  description?: string;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  /** Sort key; FUSE's built-in sections occupy 0, 1, 2. */
  order?: number;
  when?: When;
  controls: InspectorControl[];
}

/** Phase of a value change: `live` is a drag in flight, `commit` persists it. */
export type InputPhase = "live" | "commit";

export interface OverlayInspector {
  /** Declare or replace this overlay's sections. */
  sections(list: InspectorSection[]): void;
  /** Patch one control in place (relabel, disable, swap options). */
  patch(controlId: string, patch: Record<string, unknown>): void;
  /** Current value of every control, bound and transient. */
  values(): Record<string, unknown>;
  onInput(cb: (controlId: string, value: unknown, phase: InputPhase) => void): void;
  onAction(cb: (controlId: string, payload?: unknown) => void): void;
}

/** Controls that hold a value (everything but the decorative ones). */
export function isValueControl(c: InspectorControl): boolean {
  return c.type !== "divider" && c.type !== "note" && c.type !== "button" && c.type !== "buttonRow";
}

/** Config keys a control reads and writes. */
export function controlKeys(c: InspectorControl): string[] {
  if (c.type === "vec2" && c.keys) return [...c.keys];
  if (c.type === "divider") return [];
  return c.key ? [c.key] : [];
}

/** Flatten sections to a control lookup, last declaration winning on id collisions. */
export function indexControls(sections: InspectorSection[]): Map<string, InspectorControl> {
  const out = new Map<string, InspectorControl>();
  for (const s of sections) {
    for (const c of s.controls) {
      if (c.id) out.set(c.id, c);
    }
  }
  return out;
}

/**
 * Coerce an inbound value against its control's declaration. The stage is an
 * untrusted input path and these values land in a plugin's config file, so a
 * value that cannot be made to fit is rejected rather than written.
 */
export function coerceValue(c: InspectorControl, raw: unknown): { ok: true; value: unknown } | { ok: false } {
  switch (c.type) {
    case "slider":
    case "number": {
      const n = typeof raw === "number" ? raw : Number.parseFloat(String(raw));
      if (!Number.isFinite(n)) return { ok: false };
      let v = n;
      if (c.min != null) v = Math.max(c.min, v);
      if (c.max != null) v = Math.min(c.max, v);
      return { ok: true, value: v };
    }
    case "vec2": {
      const o = raw as { x?: unknown; y?: unknown } | null;
      if (!o || typeof o !== "object") return { ok: false };
      const x = Number(o.x);
      const y = Number(o.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return { ok: false };
      const clamp = (v: number): number => {
        let out = v;
        if (c.min != null) out = Math.max(c.min, out);
        if (c.max != null) out = Math.min(c.max, out);
        return out;
      };
      return { ok: true, value: { x: clamp(x), y: clamp(y) } };
    }
    case "toggle":
    case "switch":
      return { ok: true, value: Boolean(raw) };
    case "segmented":
    case "select":
    case "radio": {
      const match = c.options.find((o) => o.value === raw);
      return match ? { ok: true, value: match.value } : { ok: false };
    }
    case "buttons": {
      if (c.mode === "multi") {
        if (!Array.isArray(raw)) return { ok: false };
        const allowed = raw.filter((v) => c.options.some((o) => o.value === v));
        return { ok: true, value: allowed };
      }
      const match = c.options.find((o) => o.value === raw);
      return match ? { ok: true, value: match.value } : { ok: false };
    }
    case "text": {
      if (typeof raw !== "string") return { ok: false };
      return { ok: true, value: c.maxLength != null ? raw.slice(0, c.maxLength) : raw };
    }
    case "color":
      return typeof raw === "string" ? { ok: true, value: raw } : { ok: false };
    case "keybind":
      return typeof raw === "string" ? { ok: true, value: raw } : { ok: false };
    default:
      return { ok: false };
  }
}
