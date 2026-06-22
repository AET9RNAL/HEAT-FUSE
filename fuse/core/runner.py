"""Entry point for the FUSE mod loader."""
from __future__ import annotations

import tkinter as tk
from pathlib import Path
from loguru import logger

from fuse.core.log import setup as _setup_logging
from fuse.core.host import PluginHost
from fuse.ui.fonts import load_font

_ASSETS_DIR = Path(__file__).resolve().parent.parent / "assets"

_FUSE_FONTS = [
    "NotoSans-VariableFont_wdth,wght.ttf",
    "NotoSans-Italic-VariableFont_wdth,wght.ttf",
]


def run(
    argv: list[str] | None = None,
    extra_plugin_dirs: list[str] | None = None,
) -> None:
    """Boot FUSE with all enabled plugins."""
    del argv  # reserved for future CLI flags
    _setup_logging()
    from fuse.packaging.file_assoc import ensure_registered
    ensure_registered(_ASSETS_DIR / "logo.png")
    for name in _FUSE_FONTS:
        load_font(_ASSETS_DIR / name)
    root = tk.Tk()
    host = PluginHost(root)
    host.load_plugins(extra_plugin_dirs=extra_plugin_dirs)
    host.run()  # aborts internally if queue is empty


def main() -> None:  # pragma: no cover
    run()


if __name__ == "__main__":  # pragma: no cover
    main()
