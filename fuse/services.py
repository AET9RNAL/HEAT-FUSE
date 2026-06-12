"""Named service registry for inter-plugin APIs.

A plugin exposes a service in ``setup()``::

    ctx.services.register("my_api", self)

A peer consumes it — safe after the host resolves load order::

    api = ctx.services.require("my_api")   # raises RuntimeError if absent
    api = ctx.services.get("my_api")       # returns None if absent
"""
from __future__ import annotations

from typing import Dict, Optional

from loguru import logger


class ServiceRegistry:
    """Shared service registry owned by :class:`~fuse.host.PluginHost`."""

    def __init__(self) -> None:
        self._services: Dict[str, object] = {}
        self._owners: Dict[str, str] = {}

    def register(self, name: str, impl: object, *, owner: str = "") -> None:
        """Publish *impl* under *name*.  Overwrites with a warning if already set."""
        if name in self._services:
            logger.warning(
                f"ServiceRegistry: {name!r} re-registered "
                f"(was {self._owners[name]!r}, now {owner!r})"
            )
        self._services[name] = impl
        self._owners[name] = owner
        logger.debug(f"ServiceRegistry: {owner!r} registered {name!r}")

    def get(self, name: str) -> Optional[object]:
        """Return the service registered under *name*, or ``None``."""
        return self._services.get(name)

    def require(self, name: str) -> object:
        """Return the service registered under *name*.

        Raises :class:`RuntimeError` if not registered.
        """
        impl = self._services.get(name)
        if impl is None:
            raise RuntimeError(
                f"Required service {name!r} is not registered. "
                "Ensure the providing plugin is listed in 'dependencies'."
            )
        return impl

    def unregister(self, name: str) -> None:
        """Remove a service (called during teardown of the owning plugin)."""
        self._services.pop(name, None)
        self._owners.pop(name, None)


__all__ = ["ServiceRegistry"]
