"""Entry point for the FUSE mod loader."""
from __future__ import annotations

import tkinter as tk
from loguru import logger

from fuse.log import setup as _setup_logging
from fuse.host import PluginHost


def run(
    argv: list[str] | None = None,
    extra_plugin_dirs: list[str] | None = None,
) -> None:
    """Boot FUSE with all enabled plugins."""
    del argv  # reserved for future CLI flags
    _setup_logging()
    root = tk.Tk()
    host = PluginHost(root)
    host.load_plugins(extra_plugin_dirs=extra_plugin_dirs)
    if not host.plugins:
        logger.error("No plugins discovered — aborting.")
        return
    host.run()


def main() -> None:  # pragma: no cover
    run()


if __name__ == "__main__":  # pragma: no cover
    main()
