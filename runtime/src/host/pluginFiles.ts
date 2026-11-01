import path from "node:path";

/** The file `relPath` names inside `base`, or null when the path leaves `base` or names `base` itself. */
export function resolveInside(base: string, relPath: string): string | null {
  const root = path.resolve(base);
  const abs = path.resolve(root, relPath);
  return abs.startsWith(root + path.sep) ? abs : null;
}
