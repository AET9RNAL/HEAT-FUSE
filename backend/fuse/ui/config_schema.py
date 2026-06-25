"""Declarative config schema for the FUSE plugin manager UI.

Plugins call ``ctx.config.schema([...])`` in ``setup()`` to expose editable
settings in the FUSE Plugin Manager (Ctrl+M).  Entries without a schema are
still fully functional — the Settings tab just shows "No configurable settings".

Usage::

    from fuse.ui.config_schema import ConfigCategory, ConfigEntry

    ctx.config.schema([
        ConfigCategory("Display", [
            ConfigEntry("opacity",   "Opacity",    type="int",    min=0,   max=255),
            ConfigEntry("show_logo", "Show Logo",  type="bool"),
            ConfigEntry("theme",     "Theme",      type="choice", choices=["dark", "light"]),
        ]),
        ConfigCategory("Calibration", [
            ConfigEntry("hud_name_pos", "HUD Name Position", type="position"),
        ]),
    ])

Entry types
-----------
``bool``     → checkbox
``int``      → validated Entry (min/max enforced on commit)
``float``    → validated Entry (min/max enforced on commit)
``str``      → free-text Entry
``choice``   → Combobox (requires *choices* list)
``position`` → read-only display ("set via drag calibration")
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import List, Optional

# Map Python type names to frontend TypeScript union values.
_TYPE_MAP = {"str": "string", "choice": "select"}


@dataclass
class ConfigEntry:
    """One editable key in a plugin's config."""

    key: str
    label: str
    type: str = "str"
    min: Optional[float] = None
    max: Optional[float] = None
    choices: Optional[List[str]] = None
    description: str = ""

    def to_dict(self) -> dict:
        d: dict = {
            "key": self.key,
            "label": self.label,
            "type": _TYPE_MAP.get(self.type, self.type),
        }
        if self.min is not None:
            d["min"] = self.min
        if self.max is not None:
            d["max"] = self.max
        if self.choices is not None:
            d["choices"] = self.choices
        if self.description:
            d["description"] = self.description
        return d


@dataclass
class ConfigCategory:
    """Named group of config entries shown as a section in the Settings tab."""

    label: str
    entries: List[ConfigEntry] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "label": self.label,
            "entries": [e.to_dict() for e in self.entries],
        }


def serialize_schema(categories: list) -> list:
    """Serialize a list of ConfigCategory objects to JSON-safe dicts."""
    return [cat.to_dict() for cat in categories] if categories else []


__all__ = ["ConfigEntry", "ConfigCategory", "serialize_schema"]
