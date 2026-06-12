"""Dependency resolution for FUSE plugins.

Reads each plugin's ``manifest["dependencies"]`` (list of plugin names) and
returns the discovered specs in a valid topological load order.

Plugins with unresolvable or cyclically-dependent requirements are dropped
(with an error log) so the remaining plugins still load cleanly.
"""
from __future__ import annotations

from typing import Dict, List, Set

from loguru import logger

from fuse.discovery import DiscoveredPlugin


def resolve_load_order(specs: List[DiscoveredPlugin]) -> List[DiscoveredPlugin]:
    """Return *specs* sorted so every plugin loads after its dependencies.

    Plugins whose declared dependencies are absent or form a cycle are excluded
    from the result; all others are included in dependency-first order.
    """
    by_name: Dict[str, DiscoveredPlugin] = {s.name: s for s in specs}

    # Drop plugins whose deps are simply missing.
    valid: Dict[str, DiscoveredPlugin] = {}
    for spec in specs:
        deps: List[str] = spec.manifest.get("dependencies", [])
        missing = [d for d in deps if d not in by_name]
        if missing:
            logger.error(
                f"Plugin {spec.name!r} skipped — missing dependencies: {missing}"
            )
        else:
            valid[spec.name] = spec

    # Iterative DFS topological sort.
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
        for dep in spec.manifest.get("dependencies", []):
            if dep not in valid:
                continue
            if not visit(dep):
                return False
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
