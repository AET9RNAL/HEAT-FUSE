"""Universal HEAT overlay.

A modular plugin host built on top of a single Tk root + a shared pair of
``pynput`` listeners. Plugins are discovered at startup from
``overlay/heat/plugins/<name>/manifest.json`` and may register their own
hotkeys and persistent config without touching the host.

Public surface:

* :class:`HeatPlugin`         — abstract base class for plugins.
* :class:`HeatContext`        — runtime context handed to every plugin.
* :class:`PluginHost`         — owns Tk root + listeners + plugin lifecycle.
* :func:`run`                 — convenience entry point.
"""

from .plugin_api import HeatContext, HeatPlugin, HotkeyRegistry  # noqa: F401
from .host import PluginHost  # noqa: F401
from .runner import run  # noqa: F401
