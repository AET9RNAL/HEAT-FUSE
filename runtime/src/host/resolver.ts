/**
 * Dependency-aware load-order resolver
 *
 * Supports:
 * - Required dependencies: `"dependencies": ["name"]` or `{"name": ">=1.0"}`
 * - Optional dependencies: `"optional_dependencies": ["name"]` (soft edges)
 * - Cycle detection - plugins forming cycles are dropped with an error log
 *
 * Core plugins (`core: true`) always load before user plugins; within each
 * group plugins are topologically sorted by dependencies.
 */
import { logger } from "../log.js";
import type { DiscoveredPlugin, Manifest } from "./types.js";

function versionTuple(v: string): number[] {
  const parts = String(v).split(".");
  const out: number[] = [];
  for (const p of parts) {
    const n = Number.parseInt(p, 10);
    if (Number.isNaN(n)) return [0];
    out.push(n);
  }
  return out.length ? out : [0];
}

/** Compare two version tuples lexicographically. Returns -1/0/1. */
function cmpTuple(a: number[], b: number[]): number {
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    if (av !== bv) return av < bv ? -1 : 1;
  }
  return 0;
}

/** Return true if `actual` satisfies the constraint `spec` (>=,<=,==,>,<,*). */
export function versionSatisfies(actual: string, spec: string): boolean {
  if (!spec || spec === "*") return true;
  for (const op of [">=", "<=", "==", ">", "<"]) {
    if (spec.startsWith(op)) {
      const want = versionTuple(spec.slice(op.length).trim());
      const have = versionTuple(actual);
      const c = cmpTuple(have, want);
      switch (op) {
        case ">=":
          return c >= 0;
        case "<=":
          return c <= 0;
        case "==":
          return c === 0;
        case ">":
          return c > 0;
        case "<":
          return c < 0;
      }
    }
  }
  return actual === spec;
}

/** Return [required (name=>spec), optional (names)] from a manifest. */
function parseDeps(manifest: Manifest): [Record<string, string>, string[]] {
  const raw = manifest.dependencies ?? [];
  const required: Record<string, string> = {};
  if (Array.isArray(raw)) {
    for (const name of raw) required[name] = "*";
  } else {
    for (const [k, v] of Object.entries(raw)) required[String(k)] = String(v);
  }
  const optional = [...(manifest.optional_dependencies ?? [])];
  return [required, optional];
}

export function resolveLoadOrder(specs: DiscoveredPlugin[]): DiscoveredPlugin[] {
  const allById = new Map<string, DiscoveredPlugin>();
  for (const s of specs) allById.set(s.pluginId, s);

  const core = specs.filter((s) => s.isCore);
  const user = specs.filter((s) => !s.isCore);

  const ordered = [...topoSort(core, allById), ...topoSort(user, allById)];
  logger.debug(`Plugin load order: [${ordered.map((s) => s.pluginId).join(", ")}]`);
  return ordered;
}

function topoSort(
  specs: DiscoveredPlugin[],
  allById: Map<string, DiscoveredPlugin>,
): DiscoveredPlugin[] {
  // Phase 1 - filter plugins with unsatisfied required deps.
  const valid = new Map<string, DiscoveredPlugin>();
  for (const spec of specs) {
    const [required] = parseDeps(spec.manifest);
    let ok = true;
    for (const [depId, verSpec] of Object.entries(required)) {
      const dep = allById.get(depId);
      if (!dep) {
        logger.error(`Plugin '${spec.name}' skipped - missing required dependency: '${depId}'`);
        ok = false;
        break;
      }
      if (!versionSatisfies(dep.version, verSpec)) {
        logger.error(
          `Plugin '${spec.name}' skipped - '${depId}' v${dep.version} does not satisfy '${verSpec}'`,
        );
        ok = false;
        break;
      }
    }
    if (ok) valid.set(spec.pluginId, spec);
  }

  const ordered: DiscoveredPlugin[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();

  const visit = (pluginId: string): boolean => {
    if (visited.has(pluginId)) return true;
    if (visiting.has(pluginId)) {
      logger.error(`Dependency cycle detected involving plugin '${pluginId}'`);
      return false;
    }
    visiting.add(pluginId);
    const spec = valid.get(pluginId)!;
    const [required, optional] = parseDeps(spec.manifest);

    // Hard edges: required deps first.
    for (const depId of Object.keys(required)) {
      if (!valid.has(depId)) continue;
      if (!visit(depId)) return false;
    }
    // Soft edges: optional deps first if available; failure non-fatal.
    for (const depId of optional) {
      if (valid.has(depId) && !visited.has(depId)) visit(depId);
    }

    visiting.delete(pluginId);
    visited.add(pluginId);
    ordered.push(spec);
    return true;
  };

  const cycleMembers = new Set<string>();
  for (const pluginId of valid.keys()) {
    if (!visited.has(pluginId)) {
      if (!visit(pluginId)) cycleMembers.add(pluginId);
    }
  }

  if (cycleMembers.size) {
    logger.error(`Dropping plugins involved in dependency cycles: ${[...cycleMembers].join(", ")}`);
    return ordered.filter((s) => !cycleMembers.has(s.pluginId));
  }
  return ordered;
}
