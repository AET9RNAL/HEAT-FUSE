/**
 * Map overlays: points, areas and paths that the user draws on a map.
 *
 * Geometry is in world metres (x east, y north), the frame of `worldPos`. It does not depend on
 * the map image, so a new capture of a map keeps every overlay in place.
 */

export type FeatureKind = "point" | "area" | "path";

export interface OverlayFeature {
  id: string;
  kind: FeatureKind;
  /** World metres. A point has one, a path two or more, an area three or more. */
  points: [number, number][];
  tag: string;
  label: string;
  /** #RRGGBBAA */
  stroke: string;
  fill: string;
  /** Stroke width in icon units (1/200 of the view). */
  width: number;
  /** Empty: every mode, class or vehicle. */
  modes: string[];
  roles: string[];
  vehicles: string[];
}

/** One map's overlays, keyed by the map number of maps.json. */
export type MapOverlays = Record<string, OverlayFeature[]>;

export interface Preset {
  tag: string;
  label: string;
  kind: FeatureKind;
  stroke: string;
  fill: string;
  /** Token name: assets/icons/KCIcon<icon>.svg on buttons, KCToken<icon>.svg on the map. "" for none. */
  icon: string;
  /** The editor's toolbar group. */
  group: "general" | "killconfirm";
}

export const PRESETS: Preset[] = [
  { tag: "position", label: "Position", kind: "area", stroke: "#7ABFDFFF", fill: "#7ABFDF33", icon: "", group: "general" },
  { tag: "route", label: "Route", kind: "path", stroke: "#F2F2F2E6", fill: "#00000000", icon: "", group: "general" },
  { tag: "mark", label: "Mark", kind: "point", stroke: "#F2F2F2FF", fill: "#F2F2F233", icon: "", group: "general" },
  { tag: "kc_heal", label: "Heal", kind: "point", stroke: "#78D098FF", fill: "#78D09840", icon: "Heal", group: "killconfirm" },
  { tag: "kc_overdrive", label: "Overdrive", kind: "point", stroke: "#ECA782FF", fill: "#ECA78240", icon: "Overdrive", group: "killconfirm" },
  { tag: "kc_ultimate", label: "Ultimate", kind: "point", stroke: "#DDCE9CFF", fill: "#DDCE9C40", icon: "Ultimate", group: "killconfirm" },
];

export const ROLES = ["assault", "defender", "marksman", "support"];

export const MODES = [
  { key: "conquest", label: "Conquest" },
  { key: "domination", label: "Hardpoint" },
  { key: "control", label: "Control" },
  { key: "killconfirm", label: "Kill Confirmed" },
];

export function modeKey(name: string): string {
  const k = name.toLowerCase().replace(/[^a-z]/g, "");
  return k === "killconfirmed" ? "killconfirm" : k;
}

const MAX_FEATURES = 400;
const MAX_POINTS = 256;
const HEX = /^#[0-9a-f]{8}$/i;

function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.slice(0, max) : "";
}

function strList(v: unknown): string[] {
  return Array.isArray(v) ? [...new Set(v.filter((s): s is string => typeof s === "string").map((s) => s.slice(0, 64)))] : [];
}

/** A feature from config or from the editor, made valid, or null when it cannot be. */
export function sanitizeFeature(raw: unknown): OverlayFeature | null {
  const f = raw as Partial<OverlayFeature> | null;
  if (!f || typeof f !== "object") return null;
  const kind: FeatureKind = f.kind === "area" || f.kind === "path" ? f.kind : "point";
  const points = (Array.isArray(f.points) ? f.points : [])
    .slice(0, MAX_POINTS)
    .filter((p): p is [number, number] => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]))
    .map(([x, y]): [number, number] => [Math.round(x * 10) / 10, Math.round(y * 10) / 10]);
  const need = kind === "area" ? 3 : kind === "path" ? 2 : 1;
  if (points.length < need) return null;
  const preset = PRESETS.find((p) => p.tag === f.tag);
  return {
    id: str(f.id, 40) || Math.random().toString(36).slice(2, 10),
    kind,
    points: kind === "point" ? points.slice(0, 1) : points,
    tag: preset ? preset.tag : "mark",
    label: str(f.label, 40),
    stroke: typeof f.stroke === "string" && HEX.test(f.stroke) ? f.stroke : (preset?.stroke ?? "#F2F2F2FF"),
    fill: typeof f.fill === "string" && HEX.test(f.fill) ? f.fill : (preset?.fill ?? "#F2F2F233"),
    width: Number.isFinite(f.width) ? Math.min(8, Math.max(0.2, Number(f.width))) : 1,
    modes: [...new Set(strList(f.modes).map(modeKey).filter(Boolean))],
    roles: strList(f.roles),
    vehicles: strList(f.vehicles),
  };
}

export function sanitizeList(raw: unknown): OverlayFeature[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, MAX_FEATURES).map(sanitizeFeature).filter((f): f is OverlayFeature => f !== null);
}

export interface MatchContext {
  mode: string;
  role: string;
  vehicle: string;
}

export function visibleFeatures(features: OverlayFeature[], m: MatchContext): OverlayFeature[] {
  const ok = (list: string[], v: string) => list.length === 0 || list.includes(v);
  const mode = modeKey(m.mode);
  return features.filter((f) => ok(f.modes, mode) && ok(f.roles, m.role) && ok(f.vehicles, m.vehicle));
}

const same = (a: OverlayFeature, b: OverlayFeature) => JSON.stringify(a) === JSON.stringify(b);

// Shipped features minus deleted ones, user versions in place of shipped ones, then user-only features.
export function mergeOverlays(shipped: OverlayFeature[], user: OverlayFeature[], hidden: string[]): OverlayFeature[] {
  const mine = new Map(user.map((f) => [f.id, f]));
  const gone = new Set(hidden);
  const ids = new Set(shipped.map((f) => f.id));
  const base = shipped.filter((f) => !gone.has(f.id)).map((f) => mine.get(f.id) ?? f);
  return [...base, ...user.filter((f) => !ids.has(f.id))];
}

// What the user changed against the shipped features: new or edited features, and deleted shipped ids.
export function splitEdits(list: OverlayFeature[], shipped: OverlayFeature[]): { user: OverlayFeature[]; hidden: string[] } {
  const byId = new Map(shipped.map((f) => [f.id, f]));
  const kept = new Set(list.map((f) => f.id));
  return {
    user: list.filter((f) => {
      const s = byId.get(f.id);
      return !s || !same(s, f);
    }),
    hidden: shipped.filter((f) => !kept.has(f.id)).map((f) => f.id),
  };
}

export function modeOptions(seen: string[]): { value: string; label: string }[] {
  const out = MODES.map((m) => ({ value: m.key, label: m.label }));
  for (const name of seen) {
    const key = modeKey(name);
    if (key && !out.some((o) => o.value === key)) out.push({ value: key, label: name });
  }
  return out;
}
