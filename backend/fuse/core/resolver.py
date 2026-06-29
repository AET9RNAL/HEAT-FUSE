"""Dependency-aware load-order resolver for FUSE plugins.

Supports:
* Required dependencies — ``"dependencies": ["name"]``
  or versioned ``"dependencies": {"name": ">=1.0"}``
* Optional dependencies — ``"optional_dependencies": ["name"]``
  (loaded before if available; missing ones do not skip the dependent)
* Cycle detection — plugins forming cycles are dropped with an error log
"""
from __future__ import annotations

from typing import Dict, List, Set

from loguru import logger

from fuse.core.discovery import DiscoveredPlugin


def _version_tuple(v: str) -> tuple:
    try:
        return tuple(int(x) for x in str(v).split("."))
    except ValueError:
        return (0,)


def _version_satisfies(actual: str, spec: str) -> bool:
    """Return True if *actual* version satisfies the constraint *spec*.

    Supported operators: ``>=``, ``<=``, ``==``, ``>``, ``<``, ``*`` (any).
    Falls back to exact string match for unrecognised specs.
    """
    if not spec or spec == "*":
        return True
    for op in (">=", "<=", "==", ">", "<"):
        if spec.startswith(op):
            want = _version_tuple(spec[len(op):].strip())
            have = _version_tuple(actual)
            if op == ">=": return have >= want
            if op == "<=": return have <= want
            if op == "==": return have == want
            if op == ">":  return have > want
            if op == "<":  return have < want
    return actual == spec


def _parse_deps(manifest: dict) -> tuple[dict[str, str], list[str]]:
    """Return ``(required, optional)`` from a manifest dict.

    *required* maps dep name → version spec string (``"*"`` means any).
    *optional* is a plain list of names.

    Accepts both the legacy list format and the new dict format for
    ``dependencies``:

    .. code-block:: json

        "dependencies": ["game_memory"]               // any version
        "dependencies": {"game_memory": ">=1.0"}      // versioned
    """
    raw = manifest.get("dependencies", [])
    if isinstance(raw, list):
        required: dict[str, str] = {name: "*" for name in raw}
    else:
        required = {str(k): str(v) for k, v in raw.items()}
    optional: list[str] = list(manifest.get("optional_dependencies", []))
    return required, optional


def resolve_load_order(specs: List[DiscoveredPlugin]) -> List[DiscoveredPlugin]:
    """Return *specs* sorted so every plugin loads after its dependencies.

    Core plugins (``is_core=True``) always load before user plugins, similar
    to how Minecraft Forge loads core mods before user mods. Within each group
    (core, user), plugins are topologically sorted by dependencies.

    Required dependencies that are absent or whose version is not satisfied
    cause the dependent plugin to be excluded.  Optional dependencies are
    treated as soft edges: the loader tries to load them first if available,
    but does not fail if they are missing.

    Plugins forming dependency cycles are dropped from the result.
    """
    all_by_id: Dict[str, DiscoveredPlugin] = {s.plugin_id: s for s in specs}

    core_specs = [s for s in specs if s.is_core]
    user_specs = [s for s in specs if not s.is_core]

    core_ordered = _topo_sort(core_specs, all_by_id)
    user_ordered = _topo_sort(user_specs, all_by_id)

    ordered = core_ordered + user_ordered

    logger.debug(f"Plugin load order: {[s.plugin_id for s in ordered]}")
    return ordered


def _topo_sort(specs: List[DiscoveredPlugin], all_by_id: Dict[str, DiscoveredPlugin]) -> List[DiscoveredPlugin]:
    """Topologically sort *specs* by dependencies, dropping unsatisfied/cyclic ones.

    *all_by_id* contains every discovered plugin (core + user) so that
    cross-group dependencies are validated correctly.
    """
    by_id = all_by_id

    # Phase 1 — filter plugins with unsatisfied required deps.
    valid: Dict[str, DiscoveredPlugin] = {}
    for spec in specs:
        required, _ = _parse_deps(spec.manifest)
        ok = True
        for dep_id, ver_spec in required.items():
            if dep_id not in by_id:
                logger.error(
                    f"Plugin {spec.name!r} skipped — "
                    f"missing required dependency: {dep_id!r}"
                )
                ok = False
                break
            actual_ver = by_id[dep_id].version
            if not _version_satisfies(actual_ver, ver_spec):
                logger.error(
                    f"Plugin {spec.name!r} skipped — {dep_id!r} "
                    f"v{actual_ver} does not satisfy {ver_spec!r}"
                )
                ok = False
                break
        if ok:
            valid[spec.plugin_id] = spec

    # Phase 2 — iterative DFS topological sort.
    ordered: List[DiscoveredPlugin] = []
    visiting: Set[str] = set()
    visited: Set[str] = set()

    def visit(plugin_id: str) -> bool:
        if plugin_id in visited:
            return True
        if plugin_id in visiting:
            logger.error(f"Dependency cycle detected involving plugin {plugin_id!r}")
            return False
        visiting.add(plugin_id)
        spec = valid[plugin_id]
        required, optional = _parse_deps(spec.manifest)

        # Hard edges: required dependencies must load first.
        for dep_id in required:
            if dep_id not in valid:
                continue
            if not visit(dep_id):
                return False

        # Soft edges: optional deps load first if available; failure is non-fatal.
        for dep_id in optional:
            if dep_id in valid and dep_id not in visited:
                visit(dep_id)

        visiting.discard(plugin_id)
        visited.add(plugin_id)
        ordered.append(spec)
        return True

    cycle_members: Set[str] = set()
    for plugin_id in list(valid):
        if plugin_id not in visited:
            if not visit(plugin_id):
                cycle_members.add(plugin_id)

    if cycle_members:
        logger.error(f"Dropping plugins involved in dependency cycles: {cycle_members}")
        ordered = [s for s in ordered if s.plugin_id not in cycle_members]

    return ordered


__all__ = ["resolve_load_order"]
