"""Entry point for the universal HEAT overlay."""
from __future__ import annotations

import tkinter as tk
from loguru import logger

from overlay.heat.host import PluginHost


def run(argv: list[str] | None = None) -> None:
    """Boot the universal HEAT overlay with all enabled plugins."""
    del argv  # reserved for future CLI flags
    root = tk.Tk()
    host = PluginHost(root)
    host.load_plugins()
    if not host.plugins:
        logger.error("No plugins discovered — aborting.")
        return
    host.run()


def main() -> None:  # pragma: no cover
    run()


if __name__ == "__main__":  # pragma: no cover
    main()
