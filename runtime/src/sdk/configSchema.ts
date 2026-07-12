/**
 * Declarative config schema for the FUSE plugin-manager UI.
 * Serializes to the exact JSON shape the control app already consumes
 * (`frontend/fuse/src/stores/plugins.ts`).
 *
 * Entry types: bool | int | float | str | choice | position
 *   str    => "string"
 *   choice => "select"
 */
export type ConfigEntryType = "bool" | "int" | "float" | "str" | "choice" | "position";

const TYPE_MAP: Record<string, string> = { str: "string", choice: "select" };

export interface ConfigEntryInit {
  key: string;
  label: string;
  type?: ConfigEntryType;
  min?: number;
  max?: number;
  choices?: string[];
  description?: string;
}

export class ConfigEntry {
  key: string;
  label: string;
  type: ConfigEntryType;
  min?: number;
  max?: number;
  choices?: string[];
  description: string;

  constructor(init: ConfigEntryInit) {
    this.key = init.key;
    this.label = init.label;
    this.type = init.type ?? "str";
    this.min = init.min;
    this.max = init.max;
    this.choices = init.choices;
    this.description = init.description ?? "";
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
