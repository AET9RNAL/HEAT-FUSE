/**
 * Declarative config schema for the FUSE plugin-manager UI.
 * Serializes to the exact JSON shape the control app already consumes
 * (`frontend/fuse/src/stores/plugins.ts`).
 *
 * Entry types: bool | int | float | str | choice | position | color
 *   str    => "string"
 *   choice => "select"
 *   color  => "color"   (value is an "#RRGGBBAA" hex string)
 */
export type ConfigEntryType = "bool" | "int" | "float" | "str" | "choice" | "position" | "color";

const TYPE_MAP: Record<string, string> = { str: "string", choice: "select" };

export interface ConfigEntryInit {
  key: string;
  label: string;
  type?: ConfigEntryType;
  min?: number;
  max?: number;
  choices?: string[];
  description?: string;
  /** color entries only: allow editing the alpha channel (default true). */
  alpha?: boolean;
}

export class ConfigEntry {
  key: string;
  label: string;
  type: ConfigEntryType;
  min?: number;
  max?: number;
  choices?: string[];
  description: string;
  alpha?: boolean;

  constructor(init: ConfigEntryInit) {
    this.key = init.key;
    this.label = init.label;
    this.type = init.type ?? "str";
    this.min = init.min;
    this.max = init.max;
    this.choices = init.choices;
    this.description = init.description ?? "";
    this.alpha = init.alpha;
  }

  toDict(): Record<string, unknown> {
    const d: Record<string, unknown> = {
      key: this.key,
      label: this.label,
      type: TYPE_MAP[this.type] ?? this.type,
    };
    if (this.min != null) d.min = this.min;
    if (this.max != null) d.max = this.max;
    if (this.choices != null) d.choices = this.choices;
    if (this.description) d.description = this.description;
    if (this.type === "color" && this.alpha != null) d.alpha = this.alpha;
    return d;
  }
}

export class ConfigCategory {
  label: string;
  entries: ConfigEntry[];

  constructor(label: string, entries: ConfigEntry[] = []) {
    this.label = label;
    this.entries = entries;
  }

  toDict(): Record<string, unknown> {
    return { label: this.label, entries: this.entries.map((e) => e.toDict()) };
  }
}

export function serializeSchema(categories: ConfigCategory[] | null | undefined): Array<Record<string, unknown>> {
  return categories ? categories.map((c) => c.toDict()) : [];
}
