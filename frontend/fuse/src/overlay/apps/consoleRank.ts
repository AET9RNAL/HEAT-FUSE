export interface RankApp {
  key: string;
  name: string;
  pluginId: string;
  pluginName: string;
  alias: string | null;
  keywords: string[];
  /** Place in the favorites list, -1 when it is not a favorite. */
  favorite: number;
  usage: { count: number; last: number };
}

export type SectionId = "favorites" | "suggestions" | "all" | "results";

export interface ConsoleSection<T> {
  id: SectionId;
  items: T[];
}

export const SUGGESTION_COUNT = 5;
export const SUGGESTION_DAYS = 14;
const DAY_MS = 86_400_000;

function words(text: string): string[] {
  return text.toLowerCase().split(/[\s_\-.:/]+/).filter(Boolean);
}

/** Characters of `q` in order inside `text`. The score is higher when they sit closer together. */
function fuzzy(text: string, q: string): number {
  let at = -1;
  let first = -1;
  for (const ch of q) {
    at = text.indexOf(ch, at + 1);
    if (at < 0) return 0;
    if (first < 0) first = at;
  }
  const spread = at - first + 1;
  return 200 + Math.max(0, 50 - (spread - q.length) * 5);
}

/**
 * How well an app matches the search text. 0: no match. Order: exact alias, alias prefix,
 * name prefix, word prefix in the name, plugin or keyword prefix, text in the name, fuzzy.
 */
export function rankScore(app: RankApp, query: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const alias = app.alias?.toLowerCase() ?? "";
  const name = app.name.toLowerCase();
  if (alias && alias === q) return 1000;
  if (alias && alias.startsWith(q)) return 900;
  if (name.startsWith(q)) return 800;
  if (words(app.name).some((w) => w.startsWith(q))) return 700;
  const pluginWords = [...words(app.pluginName), ...words(app.pluginId), app.pluginId.toLowerCase()];
  if (pluginWords.some((w) => w.startsWith(q))) return 600;
  if (app.keywords.some((k) => k.toLowerCase().startsWith(q))) return 550;
  if (name.includes(q)) return 400;
  return fuzzy(name, q);
}

/** The matches, best first. Equal scores: the more used app first, then A to Z. */
export function searchApps<T extends RankApp>(apps: T[], query: string): T[] {
  return apps
    .map((app) => ({ app, score: rankScore(app, query) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || b.app.usage.count - a.app.usage.count || a.app.name.localeCompare(b.app.name))
    .map((r) => r.app);
}

/** The sections with no search text: favorites, suggestions, then every other app A to Z. Empty sections drop out. */
export function emptySections<T extends RankApp>(apps: T[], now: number): ConsoleSection<T>[] {
  const favorites = apps.filter((a) => a.favorite >= 0).sort((a, b) => a.favorite - b.favorite);
  const since = now - SUGGESTION_DAYS * DAY_MS;
  const suggestions = apps
    .filter((a) => a.favorite < 0 && a.usage.count > 0 && a.usage.last >= since)
    .sort((a, b) => b.usage.count - a.usage.count || b.usage.last - a.usage.last)
    .slice(0, SUGGESTION_COUNT);
  const listed = new Set([...favorites, ...suggestions].map((a) => a.key));
  const all = apps.filter((a) => !listed.has(a.key)).sort((a, b) => a.name.localeCompare(b.name));
  const sections: ConsoleSection<T>[] = [
    { id: "favorites", items: favorites },
    { id: "suggestions", items: suggestions },
    { id: "all", items: all },
  ];
  return sections.filter((s) => s.items.length > 0);
}

/** The sections for a search text: one result list, or the empty-text sections. */
export function consoleSections<T extends RankApp>(apps: T[], query: string, now: number): ConsoleSection<T>[] {
  if (!query.trim()) return emptySections(apps, now);
  const items = searchApps(apps, query);
  return items.length ? [{ id: "results", items }] : [];
}
