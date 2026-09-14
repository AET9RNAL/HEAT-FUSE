/**
 * Service state travels as patches: whole values for plain keys, key-wise
 * changes for object-valued keys (so a 100-entry cache sends only what moved).
 */
export interface StatePatch {
  set?: Record<string, unknown>;
  merge?: Record<string, Record<string, unknown>>;
  drop?: Record<string, string[]>;
}

export function jsonClone<T>(value: T): T {
  return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function same(a: unknown, b: unknown): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}

/** What changed from `prev` to `next`, or null when nothing did. Both must be JSON data. */
export function diffState(prev: Record<string, unknown>, next: Record<string, unknown>): StatePatch | null {
  const patch: StatePatch = {};
  let changed = false;
  for (const [key, value] of Object.entries(next)) {
    const old = prev[key];
    if (isPlainObject(old) && isPlainObject(value)) {
      const merged: Record<string, unknown> = {};
      const dropped: string[] = [];
      for (const [k, v] of Object.entries(value)) if (!(k in old) || !same(old[k], v)) merged[k] = v;
      for (const k of Object.keys(old)) if (!(k in value)) dropped.push(k);
      if (Object.keys(merged).length) {
        (patch.merge ??= {})[key] = merged;
        changed = true;
      }
      if (dropped.length) {
        (patch.drop ??= {})[key] = dropped;
        changed = true;
      }
    } else if (!(key in prev) || !same(old, value)) {
      (patch.set ??= {})[key] = value;
      changed = true;
    }
  }
  for (const key of Object.keys(prev)) {
    if (key in next) continue;
    (patch.set ??= {})[key] = null;
    changed = true;
  }
  return changed ? patch : null;
}

export function applyPatch(state: Record<string, unknown>, patch: StatePatch): void {
  for (const [key, value] of Object.entries(patch.set ?? {})) state[key] = value;
  for (const [key, entries] of Object.entries(patch.merge ?? {})) {
    const current = state[key];
    const target: Record<string, unknown> = isPlainObject(current) ? current : {};
    Object.assign(target, entries);
    state[key] = target;
  }
  for (const [key, names] of Object.entries(patch.drop ?? {})) {
    const target = state[key];
    if (!isPlainObject(target)) continue;
    for (const name of names) delete target[name];
  }
}
