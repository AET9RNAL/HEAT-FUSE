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

from fuse.discovery import DiscoveredPlugin


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

    Required dependencies that are absent or whose version is not satisfied
    cause the dependent plugin to be excluded.  Optional dependencies are
    treated as soft edges: the loader tries to load them first if available,
    but does not fail if they are missing.

    Plugins forming dependency cycles are dropped from the result.
    """
    by_name: Dict[str, DiscoveredPlugin] = {s.name: s for s in specs}

    # Phase 1 — filter plugins with unsatisfied required deps.
    valid: Dict[str, DiscoveredPlugin] = {}
    for spec in specs:
        required, _ = _parse_deps(spec.manifest)
        ok = True
        for dep_name, ver_spec in required.items():
            if dep_name not in by_name:
                logger.error(
                    f"Plugin {spec.name!r} skipped — "
                    f"missing required dependency: {dep_name!r}"
                )
                ok = False
                break
            actual_ver = by_name[dep_name].version
            if not _version_satisfies(actual_ver, ver_spec):
                logger.error(
                    f"Plugin {spec.name!r} skipped — {dep_name!r} "
                    f"v{actual_ver} does not satisfy {ver_spec!r}"
                )
                ok = False
                break
        if ok:
            valid[spec.name] = spec

    # Phase 2 — iterative DFS topological sort.
    ordered: List[DiscoveredPlugin] = []
    visiting: Set[str] = set()
    visited: Set[str] = set()

    def visit(name: str) -> bool:
        if name in visited:
            return True
        if name in visiting:
            logger.error(f"Dependency cycle detected involving plugin {name!r}")
            return False
        visiting.add(name)
        spec = valid[name]
        required, optional = _parse_deps(spec.manifest)

        # Hard edges: required dependencies must load first.
        for dep_name in required:
            if dep_name not in valid:
                continue
            if not visit(dep_name):
                return False

        # Soft edges: optional deps load first if available; failure is non-fatal.
        for dep_name in optional:
            if dep_name in valid and dep_name not in visited:
                visit(dep_name)

        visiting.discard(name)
        visited.add(name)
        ordered.append(spec)
        return True

    cycle_members: Set[str] = set()
    for name in list(valid):
        if name not in visited:
            if not visit(name):
                cycle_members.add(name)

    if cycle_members:
        logger.error(f"Dropping plugins involved in dependency cycles: {cycle_members}")
        ordered = [s for s in ordered if s.name not in cycle_members]

    logger.debug(f"Plugin load order: {[s.name for s in ordered]}")
    return ordered


__all__ = ["resolve_load_order"]
