import en from "./locales/en.json";
import fr from "./locales/fr.json";
import ru from "./locales/ru.json";
import ua from "./locales/ua.json";

interface Catalog {
  [key: string]: string | Catalog;
}

export type Translate = (key: string, params?: Record<string, string | number>) => string;

const FALLBACK = "en";
const CATALOGS: Record<string, Catalog> = { en, fr, ru, ua };
/** Other spellings of a shipped code. */
const ALIASES: Record<string, string> = { uk: "ua" };

/** Shipped locale codes, in menu order. */
export const LOCALES: string[] = Object.keys(CATALOGS);

function flatten(catalog: Catalog, prefix = "", out: Record<string, string> = {}): Record<string, string> {
  for (const [key, value] of Object.entries(catalog)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") out[path] = value;
    else flatten(value, path, out);
  }
  return out;
}

const FLAT: Record<string, Record<string, string>> = Object.fromEntries(
  Object.entries(CATALOGS).map(([code, catalog]) => [code, flatten(catalog)]),
);

/** The first candidate that has a catalog: the user's pick, then the App language. "fr-CA" matches "fr". */
export function resolveLocale(...candidates: unknown[]): string {
  for (const candidate of candidates) {
    if (typeof candidate !== "string" || !candidate) continue;
    const code = candidate.trim().toLowerCase();
    for (const c of [code, code.split("-")[0] ?? code]) {
      const known = ALIASES[c] ?? c;
      if (FLAT[known]) return known;
    }
  }
  return FALLBACK;
}

/** Every key, in English where `locale` has no translation. */
export function messagesFor(locale: string): Record<string, string> {
  return { ...FLAT[FALLBACK], ...FLAT[locale] };
}

/** A missing key returns itself, so a gap shows on screen as its path and not as a blank. */
export function translator(locale: string): Translate {
  const messages = messagesFor(locale);
  return (key, params = {}) =>
    (messages[key] ?? key).replace(/\{(\w+)\}/g, (match, name: string) =>
      params[name] !== undefined ? String(params[name]) : match,
    );
}
