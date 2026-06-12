# FUSE Framework

**FUSE** is a lightweight Python plugin framework for building overlays for WoT:HEAT and real-time tools on Windows. It provides discovery, dependency resolution, a shared event bus, named services, per-plugin configuration, global hotkeys, and a calibrate/locked lifecycle — all running on a single Tk event loop.

---

## Table of Contents

1. [Architecture](#architecture)
2. [Plugin Contract](#plugin-contract)
3. [Manifest](#manifest)
4. [Discovery & Load Order](#discovery--load-order)
5. [Core APIs](#core-apis)
   - [FuseContext](#fusecontext)
   - [EventBus](#eventbus)
   - [ServiceRegistry](#serviceregistry)
   - [HotkeyRegistry](#hotkeyregistry)
   - [PluginConfig](#pluginconfig)
6. [Built-in Utilities](#built-in-utilities)
7. [Host Lifecycle](#host-lifecycle)
8. [Writing a Plugin](#writing-a-plugin)
9. [Calibration vs Locked](#calibration-vs-locked)
10. [Project Layout](#project-layout)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  PluginHost (Tk root, pynput listeners, idle loop)          │
├─────────────────────────────────────────────────────────────┤
│  EventBus   │  ServiceRegistry  │  HotkeyRegistry          │
├─────────────────────────────────────────────────────────────┤
│  Plugin A   │  Plugin B         │  Plugin C   │ ...        │
│  ─────────  │  ─────────        │  ─────────               │
│  setup()    │  setup()          │  setup()                 │
│  tick()     │  tick()           │  tick()                  │
│  enter_*()  │  enter_*()        │  enter_*()               │
│  teardown() │  teardown()       │  teardown()              │
└─────────────────────────────────────────────────────────────┘
```

FUSE owns all shared infrastructure. Plugins never create global state. They receive a `FuseContext` at setup time and communicate through the event bus and service registry.

---

## Plugin Contract

Every plugin subclasses `FusePlugin` and lives in its own directory with a `manifest.json`.

```python
from fuse.api import FusePlugin, FuseContext

class MyPlugin(FusePlugin):
    requires_calibration = False

    def setup(self, ctx: FuseContext) -> None:
        ...

    def tick(self, dt: float) -> None:
        ...

    def enter_calibrate(self) -> None:
        ...

    def enter_locked(self) -> None:
        ...

    def teardown(self) -> None:
        ...
```

### Lifecycle Hooks

| Hook | Called When |
|------|-------------|
| `setup(ctx)` | Once after the plugin is instantiated. Build widgets, register hotkeys, consume services. |
| `tick(dt)` | Every ~50 ms from the host idle loop. `dt` is seconds since last tick. |
| `enter_calibrate()` | When the host enters calibrate mode for this plugin. |
| `enter_locked()` | When the host enters locked mode (click-through, scanning). |
| `teardown()` | On shutdown. Persist state, release handles. |

### Class Attributes

- `requires_calibration` — `True` if the plugin has interactive calibration UI. The host waits for the user to press `Ctrl+L` before starting the next plugin.

---

## Manifest

Each plugin directory must contain a `manifest.json`:

```json
{
  "name": "my_plugin",
  "version": "1.0",
  "description": "What it does.",
  "entry": "plugin:MyPlugin",
  "min_host_version": "1.0",
  "dependencies": ["game_memory"],
  "optional_dependencies": [],
  "hotkeys": {"toggle": "ctrl+t"},
  "default_config": {"opacity": 200}
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `name` | yes | Plugin identifier. Must be unique. |
| `version` | yes | Semver string. |
| `description` | no | Short human-readable summary. |
| `entry` | yes | `"module:ClassName"`. The module is resolved relative to the plugin package. |
| `min_host_version` | no | Minimum FUSE host version. Plugin skipped if host is older. |
| `dependencies` | no | List of required plugin names. Used for load-order resolution. |
| `optional_dependencies` | no | Soft load-order hints; missing plugins do not block loading. |
| `hotkeys` | no | `{"logical_name": "combo"}` combos exposed via `ctx.hotkey_for()`. |
| `default_config` | no | Default values for `ctx.config`. |

---

## Discovery & Load Order

FUSE scans plugins from four sources, in order of precedence (earlier wins on name collision):

1. `fuse/plugins/` — built-in core plugins
2. `<repo>/plugins/` — user drop-in directory
3. `FUSE_PLUGIN_DIRS` environment variable (`:` or `;` separated)
4. `extra_plugin_dirs` argument / `fuse_host.json`

After discovery, the resolver:

1. Filters out plugins with unsatisfied required dependencies.
2. Checks `min_host_version` compatibility.
3. Topologically sorts by dependencies (required = hard edge, optional = soft edge).
4. Drops plugins involved in dependency cycles.

---

## Core APIs

### FuseContext

`FuseContext` is a dataclass handed to every plugin during `setup()`:

```python
@dataclass
class FuseContext:
    tk_root: tk.Tk
    config: PluginConfig
    hotkeys: HotkeyRegistry
    assets_dir: Path
    host: PluginHost
    state: str                # "calibrate" | "locked"
    events: EventBus
    services: ServiceRegistry
    manifest_hotkeys: dict
    extras: dict              # plugin-private scratch space
    logger: Any               # loguru logger bound with plugin=name
```

**`ctx.hotkey_for(name, fallback="")`**

Look up a hotkey combo declared in `manifest.json`:

```python
combo = ctx.hotkey_for("toggle", fallback="ctrl+t")
ctx.hotkeys.register(combo, self._on_toggle)
```

---

### EventBus

Lightweight pub/sub for cross-plugin communication. Handlers run on the Tk thread via `root.after(0, ...)`.

```python
def _on_connected(**kwargs):
    ...

ctx.events.subscribe("game_memory.connected", _on_connected, owner=self.name)
ctx.events.emit("game_memory.connected")
ctx.events.unsubscribe("game_memory.connected", _on_connected)
```

---

### ServiceRegistry

Named object registry for inter-plugin APIs.

```python
# expose
ctx.services.register("my_api", self, owner=self.name)

# consume
api = ctx.services.require("my_api")   # raises RuntimeError if missing
api = ctx.services.get("my_api")       # returns None if missing
```

A plugin that consumes a service should list the provider in `dependencies` so load order is correct.

---

### HotkeyRegistry

Global keyboard listener (pynput) fanned out to registered callbacks.

```python
ctx.hotkeys.register("ctrl+l", self._on_lock)
ctx.hotkeys.register("shift+f1", self._on_shout)
```

Combos are parsed as `modifier+modifier+key`. Case-insensitive. Re-registrations log a warning and overwrite.

---

### PluginConfig

Per-plugin JSON config with auto-save and watchers.

```python
ctx.config.defaults(opacity=200, position=None).load()

opacity = ctx.config.get("opacity")
ctx.config.watch("opacity", self._on_opacity_changed)
ctx.config.set("opacity", 180)   # persists + fires watcher
ctx.config.update({"x": 100, "y": 200})
```

Config files live in `data/configs/fuse_<plugin_name>.json`.

---

## Built-in Utilities

### GameMemory

Typed memory reader for Windows processes via pointer chains. No external dependencies — uses `ctypes` + `kernel32`.

```python
from fuse.utils.game_memory import GameMemory

mem = GameMemory("engine_launcher.exe", "assets/pointer_chains.json")
mem.open()
energy = mem.read("energy")       # int | float | None
addr = mem.resolve_address("ammo") # int | None
mem.close()
```

Pointer chains JSON:

```json
{
  "energy": {
    "module": "engine.dll",
    "offsets": [0x10, 0x20, 0x8],
    "dtype": "uint32"
  }
}
```

Supported dtypes: `uint8`, `int8`, `uint16`, `int16`, `uint32`, `int32`, `uint64`, `int64`, `float`, `double`.

### ProcessHandle & MemoryReader

Lower-level primitives in `fuse.utils.memory_reader`:

- `find_pid_by_name(name)` — first matching PID.
- `ProcessHandle(pid, write=False)` — context-managed `OpenProcess` handle.
- `resolve_pointer_chain(proc, base, offsets)` — follows offsets, returns final address.
- `get_module_base(pid, name)` — module base address.

---

## Host Lifecycle

1. **Boot**
   - `runner.run()` creates a Tk root, instantiates `PluginHost`, and calls `host.load_plugins()`.
   - `host.run()` starts the mainloop.

2. **Setup Queue**
   - Plugins are instantiated one at a time.
   - After `setup()` returns, the plugin enters calibrate mode.
   - If `requires_calibration == False`, the host auto-locks and advances.
   - If `requires_calibration == True`, the host waits for `Ctrl+L`.

3. **Global Hotkeys**
   - `Ctrl+L` — toggle calibrate/locked for the active plugin.
   - `Ctrl+P` — quit.

4. **Idle Loop**
   - `tick(dt)` is called on every active plugin every ~50 ms.

5. **Shutdown**
   - `teardown()` is called on every plugin in reverse load order.

---

## Writing a Plugin

Directory layout:

```
plugins/
  my_plugin/
    manifest.json
    plugin.py
    assets/
      icon.png
```

`plugin.py`:

```python
from fuse.api import FusePlugin, FuseContext

class MyPlugin(FusePlugin):
    requires_calibration = True

    def setup(self, ctx: FuseContext) -> None:
        ctx.config.defaults(opacity=200).load()
        self._opacity = ctx.config.get("opacity")

        combo = ctx.hotkey_for("toggle", fallback="ctrl+t")
        ctx.hotkeys.register(combo, self._toggle)

        self._ctx = ctx

    def enter_calibrate(self) -> None:
        ...

    def enter_locked(self) -> None:
        ...

    def tick(self, dt: float) -> None:
        ...

    def teardown(self) -> None:
        ...

    def _toggle(self) -> None:
        ...
```

---

## Calibration vs Locked

| Mode | Purpose |
|------|---------|
| **Calibrate** | Interactive. Windows are draggable, clickable, editable. User positions overlays and sets parameters. |
| **Locked** | Passive. Windows are click-through, scanning / drawing only. No user interaction. |

Plugins with `requires_calibration = True` stay in calibrate mode until the user presses `Ctrl+L`. The host then locks the plugin and advances to the next one.

Plugins with `requires_calibration = False` are locked immediately after `setup()` and the host advances without waiting.

---

## Project Layout

```
fuse/
  __init__.py
  api.py              # FusePlugin, FuseContext, HotkeyRegistry
  discovery.py         # Plugin scanning & manifest parsing
  resolver.py          # Dependency resolution & topological sort
  host.py              # PluginHost — lifecycle, listeners, idle loop
  events.py            # EventBus
  services.py          # ServiceRegistry
  runner.py            # CLI entry point: run()
  log.py               # Logging setup
  plugins/             # Built-in core plugins
    game_memory/
      manifest.json
      plugin.py
  utils/
    config.py          # PluginConfig
    game_memory.py     # GameMemory, ChainDef
    memory_reader.py   # ctypes kernel32 wrappers
    paths.py           # Path resolution helpers
```

---

## Version

Host version: `1.0`

Bump `HOST_VERSION` in `fuse/host.py` when the plugin API surface changes in a breaking way.
