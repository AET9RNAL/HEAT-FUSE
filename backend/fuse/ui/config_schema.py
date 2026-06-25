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


@dataclass
class ConfigCategory:
    """Named group of config entries shown as a section in the Settings tab."""

    label: str
    entries: List[ConfigEntry] = field(default_factory=list)


__all__ = ["ConfigEntry", "ConfigCategory"]
