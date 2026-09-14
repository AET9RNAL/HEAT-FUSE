/**
 * Stage-side mirror of `runtime/src/sdk/inspector.ts`
 *
 * FUSE's own Position/Layout/Appearance sections are expressed in this same
 * shape, so built-in and plugin controls go through one renderer.
 */

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
  id: string;
  label?: string;
  tooltip?: string;
  hint?: string;
  key?: string;
  when?: When;
  disabledWhen?: When;
  width?: "full" | "half";
  /** Set by the stage on built-in controls; plugin controls never carry it. */
  builtin?: boolean;
}

export interface Option {
  value: string | number | boolean;
  label: string;
  tooltip?: string;
}

export interface SliderControl extends ControlBase {
  type: "slider";
  min: number;
  max: number;
  step?: number;
  unit?: string;
  displayMul?: number;
  default?: number;
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
  keys?: [string, string];
  labels?: [string, string];
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
  confirm?: string;
}

export interface ButtonRowControl extends ControlBase {
  type: "buttonRow";
  buttons: Omit<ButtonControl, "type" | "key">[];
}

export interface KeybindControl extends ControlBase {
  type: "keybind";
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
  builtin?: boolean;
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
  description?: string;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  order?: number;
  when?: When;
  controls: InspectorControl[];
  /** Built-in sections render their own handlers rather than hitting the socket. */
  builtin?: boolean;
}

export type InputPhase = "live" | "commit";

export interface InspectorSchema {
  overlayId: string;
  rev: number;
  sections: InspectorSection[];
}

/** Evaluate a `When` predicate against the overlay's current control values. */
export function evalWhen(when: When | undefined, values: Record<string, unknown>): boolean {
  if (!when) return true;
  if ("allOf" in when) return when.allOf.every((w) => evalWhen(w, values));
  if ("anyOf" in when) return when.anyOf.some((w) => evalWhen(w, values));
  if ("not" in when) return !evalWhen(when.not, values);

  const v = values[when.key];
  if (when.eq !== undefined && v !== when.eq) return false;
  if (when.ne !== undefined && v === when.ne) return false;
  if (when.in !== undefined && !when.in.includes(v)) return false;
  if (when.gt !== undefined && !(typeof v === "number" && v > when.gt)) return false;
  if (when.lt !== undefined && !(typeof v === "number" && v < when.lt)) return false;
  if (when.truthy !== undefined && Boolean(v) !== when.truthy) return false;
  return true;
}
