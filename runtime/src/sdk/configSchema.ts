/**
 * Declarative config schema for the FUSE plugin-manager UI.
 *
 * `ctx.config.schema()` takes the same `InspectorSection` objects a plugin gives
 * `ov.inspector.sections()`, so the App panel and the stage render one
 * declaration with the same inputs. The legacy `ConfigCategory` / `ConfigEntry`
 * classes still work; the App maps their types onto the matching controls.
 *
 * Legacy entry types: bool | int | float | str | choice | position | color
 *   str    => "string"
 *   choice => "select"
 *   color  => "color"   (value is an "#RRGGBBAA" hex string)
 */
import type { InspectorControl, InspectorSection } from "./inspector.js";

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

/** What `ctx.config.schema()` takes: inspector sections, legacy categories, or a mix. */
export type ConfigSchemaItem = InspectorSection | ConfigCategory;

/** Duck-typed: a plugin bundle carries its own copy of `ConfigCategory`, so `instanceof` fails. */
export function isLegacyCategory(item: ConfigSchemaItem): item is ConfigCategory {
  return Array.isArray((item as ConfigCategory).entries);
}

/** A section's controls; legacy categories have none. */
export function sectionControls(item: ConfigSchemaItem): InspectorControl[] {
  return isLegacyCategory(item) ? [] : (item.controls ?? []);
}

export function serializeSchema(items: ConfigSchemaItem[] | null | undefined): Array<Record<string, unknown>> {
  if (!items) return [];
  return items.map((item) =>
    isLegacyCategory(item) ? item.toDict() : (JSON.parse(JSON.stringify(item)) as Record<string, unknown>),
  );
}
