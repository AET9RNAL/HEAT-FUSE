

# FUSE - an external modding runtime for WoT:HEAT — Project Documentation

**FUSE** is **not** affiliated, endorsed, or approved by World of Tanks: HEAT or Wargaming. It is a third-party modding toolkit built around a lightweight Python plugin framework for real-time Windows overlays.

**FUSE** does not provide any game modifications or hacks. It is a toolkit for building overlays/UI reskins that uses game information accessible to the user during normal gameplay. It does not read, expose, exploit client information that wouldn't normally be available to the user.

Any modifications to FUSE that would allow reading, exposing, or exploiting client information that wouldn't normally be available to the user are strictly prohibited.

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Getting Started](#getting-started)
3. [FUSE Framework](#fuse-framework)
   - [Architecture](#architecture)
   - [Plugin Contract](#plugin-contract)
   - [Manifest](#manifest)
   - [Discovery & Load Order](#discovery--load-order)
   - [Core APIs](#core-apis)
   - [Built-in Utilities](#built-in-utilities)
   - [Host Lifecycle](#host-lifecycle)
   - [Plugin Manager](#plugin-manager)
4. [Overlay Plugins](#overlay-plugins)
   - [game_memory](#game_memory)
   - [energy_bar](#energy_bar)
   - [heat_ailos_torc](#heat_ailos_torc)
5. [ML System](#ml-system)
6. [Simulation](#simulation)
7. [Hardware Injection](#hardware-injection)
8. [Project Layout](#project-layout)

---

## Project Overview

FUSE provides:

- **Per-pixel-alpha HUD overlays** via Win32 `LayeredWindow` — no chroma-key, no grey borders.
- **In-game memory reading** via pointer chains (`ctypes` + `kernel32`, no external dependencies).
- **Plugin-based architecture** — FUSE loads, calibrates, and manages overlays sequentially.

### Entry Points

| Script | Purpose |
|--------|---------|
| `run.bat` | Conda env setup + interactive launcher menu |
| `run_heat_overlay.py` | Boots FUSE with `overlay/heat/plugins/` |

---

## Getting Started

1. Install [Miniconda](https://docs.anaconda.com/miniconda/) and run `run.bat` — it creates the `heat_saclos` env, installs deps, and shows a menu.
2. Install [Tesseract OCR](https://github.com/tesseract-ocr/tesseract) if using OCR features.

---

## FUSE Framework

**FUSE** is the plugin runtime. It owns all shared infrastructure; plugins never create global state.

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  PluginHost (Tk root, pynput listeners, idle loop, manager)     │
├─────────────────────────────────────────────────────────────────┤
│  EventBus  │  ServiceRegistry  │  HotkeyRegistry  │  Config    │
├─────────────────────────────────────────────────────────────────┤
│  Plugin A  │  Plugin B         │  Plugin C        │ ...        │
│  ────────  │  ────────         │  ────────                     │
│  setup()   │  setup()          │  setup()                      │
│  tick()    │  tick()           │  tick()                       │
│  enter_*() │  enter_*()        │  enter_*()                    │
│  teardown()│  teardown()       │  teardown()                   │
└─────────────────────────────────────────────────────────────────┘
```

### Plugin Contract

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

#### Lifecycle Hooks

| Hook | Called When |
|------|-------------|
| `setup(ctx)` | Once after instantiation. Build widgets, register hotkeys, consume services. |
| `tick(dt)` | Every ~50 ms from the host idle loop. `dt` is seconds since last tick. |
| `enter_calibrate()` | When the host enters calibrate mode for this plugin. |
| `enter_locked()` | When the host enters locked mode (click-through, scanning). |
| `teardown()` | On shutdown. Persist state, release handles. |

#### Class Attributes

- `requires_calibration` — `True` if the plugin has interactive calibration UI. The host waits for `Ctrl+L` before starting the next plugin.

---

### Manifest

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
| `name` | yes | Unique plugin identifier. |
| `version` | yes | Semver string. |
| `description` | no | Short human-readable summary. |
| `entry` | yes | `"module:ClassName"`. Module resolved relative to the plugin package. |
| `min_host_version` | no | Minimum FUSE host version. |
| `dependencies` | no | Required plugin names (supports versioned dict: `{"name": ">=1.0"}`). |
| `optional_dependencies` | no | Soft load-order hints; missing plugins do not block loading. |
| `hotkeys` | no | `{"logical_name": "combo"}` combos exposed via `ctx.hotkey_for()`. |
| `default_config` | no | Default values for `ctx.config`. |

---

### Discovery & Load Order

FUSE scans plugins from four sources (earlier wins on name collision):

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

### Core APIs

#### FuseContext

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

**`ctx.hotkey_for(name, fallback="")`** — Look up a hotkey combo declared in `manifest.json`:

```python
combo = ctx.hotkey_for("toggle", fallback="ctrl+t")
ctx.hotkeys.register(combo, self._on_toggle)
```

---

#### EventBus

Lightweight pub/sub for cross-plugin communication. Handlers run on the Tk thread.

```python
def _on_connected(**kwargs):
    ...

ctx.events.subscribe("game_memory.connected", _on_connected, owner=self.name)
ctx.events.emit("game_memory.connected")
ctx.events.unsubscribe("game_memory.connected", _on_connected)
```

---

#### ServiceRegistry

Named object registry for inter-plugin APIs.

```python
# expose
ctx.services.register("my_api", self, owner=self.name)

# consume
api = ctx.services.require("my_api")   # raises RuntimeError if missing
api = ctx.services.get("my_api")       # returns None if missing
```

A plugin that consumes a service should list the provider in `dependencies`.

---

#### HotkeyRegistry

Global keyboard listener (pynput) fanned out to registered callbacks.

```python
ctx.hotkeys.register("ctrl+l", self._on_lock)
ctx.hotkeys.register("shift+f1", self._on_shout)
```

Combos are parsed as `modifier+modifier+key`. Case-insensitive. Re-registrations log a warning and overwrite.

---

#### PluginConfig

Per-plugin JSON config with auto-save and watchers.

```python
ctx.config.defaults(opacity=200, position=None).load()

opacity = ctx.config.get("opacity")
ctx.config.watch("opacity", self._on_opacity_changed)
ctx.config.set("opacity", 180)   # persists + fires watcher
ctx.config.update({"x": 100, "y": 200})
```

Config files live in `data/configs/fuse_<plugin_name>.json`.

**Declarative schema** for the Plugin Manager UI:

```python
from fuse.ui.config_schema import ConfigCategory, ConfigEntry

ctx.config.schema([
    ConfigCategory("Display", [
        ConfigEntry("opacity", "Opacity", type="int", min=0, max=255),
        ConfigEntry("show_logo", "Show Logo", type="bool"),
        ConfigEntry("theme", "Theme", type="choice", choices=["dark", "light"]),
    ]),
])
```

Entry types: `bool`, `int`, `float`, `str`, `choice`, `position`.

---

### Built-in Utilities

#### GameMemory

Typed memory reader for Windows processes via pointer chains. Uses `ctypes` + `kernel32` — no external dependencies.

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

Lower-level primitives in `fuse.utils.memory_reader`:

- `find_pid_by_name(name)` — first matching PID.
- `ProcessHandle(pid, write=False)` — context-managed `OpenProcess` handle.
- `resolve_pointer_chain(proc, base, offsets)` — follows offsets, returns final address.
- `get_module_base(pid, name)` — module base address.

---

#### LayeredWindow

Win32 per-pixel-alpha overlay window via `CreateWindowExW` + `UpdateLayeredWindow`. No grey borders, no drop shadows, no chroma-key. Works alongside the tkinter mainloop.

```python
from fuse.utils.layered_window import LayeredWindow

win = LayeredWindow("My Overlay", x=100, y=200, draggable=False)
win.create(pil_rgba_image, global_alpha=220)
win.show()
win.move(300, 400)
win.update_image(new_pil_rgba_image)
win.set_click_through(True)   # click-through mode
win.set_alpha(180)
win.destroy()
```

---

#### FusePanel

`LayeredWindow` wrapper with config-backed position and calibrate/locked lifecycle management.

```python
from fuse.utils.panel import FusePanel

panel = FusePanel("hud_name", "hud_name_pos", ctx,
                  title="SACLOS HUD Name", default_x=100, default_y=50)
panel.create(pil_rgba_image)
panel.enter_calibrate()   # draggable, click-enabled, visible
panel.enter_locked()      # saves position, click-through, visible
panel.update(new_image)   # animation frame (no position snap)
```

`FusePanelGroup` fans out `enter_calibrate` / `enter_locked` / `show_all` / `hide_all` to a collection.

---

#### Screen Capture

```python
from fuse.utils.screen_capture import grab_region_np

arr = grab_region_np((x1, y1, x2, y2))  # np.ndarray (H, W, 3) RGB uint8
```

Prefers `mss` (~3–8 ms) and falls back to PIL `ImageGrab` (~20 ms). Thread-safe via thread-local `mss` instances.

---


### Host Lifecycle

1. **Boot**
   - `runner.run()` creates a Tk root, instantiates `PluginHost`, calls `host.load_plugins()`.
   - `host.run()` starts the mainloop.

2. **Setup Queue**
   - Plugins are instantiated **one at a time**.
   - After `setup()` returns, the plugin enters calibrate mode.
   - If `requires_calibration == False`, the host auto-locks and advances.
   - If `requires_calibration == True`, the host waits for `Ctrl+L`.

3. **Global Hotkeys**
   - `Ctrl+L` — toggle calibrate/locked.
   - `Ctrl+P` — quit.
   - `Ctrl+M` — open Plugin Manager.

4. **Idle Loop**
   - `tick(dt)` is called on every active plugin every ~50 ms.

5. **Shutdown**
   - `teardown()` is called on every plugin in reverse load order.

---

### Plugin Manager

Press `Ctrl+M` to open a dark management window with three tabs:

- **Plugins** — list of discovered plugins with state badges and Enable/Disable toggles. Takes effect at runtime without restart.
- **Settings** — per-plugin editable config for any plugin that called `ctx.config.schema([...])`.
- **Keybindings** — all registered hotkeys with live rebind support (click Rebind, press new combo).

---

## Overlay Plugins

### game_memory

Core built-in plugin that opens the game process and registers `GameMemory` as a service.

```json
{
  "name": "game_memory",
  "version": "1.0",
  "description": "Reads in-game values via pointer chains.",
  "entry": "plugin:GameMemoryPlugin"
}
```

Other plugins declare `"dependencies": ["game_memory"]` and consume:

```python
mem = ctx.services.require("game_memory")
energy = mem.read("energy")
```

Config keys: `process_name`, `chains_file`, `reconnect_interval_s`. Auto-reconnects when the game process is not found.

---

### energy_bar

Memory-driven (or OCR-driven) energy / progress scale HUD. Composites a background PNG with a vertically-clipped foreground PNG driven by fill percentage.

- **Mode A**: Reads `energy` from `game_memory` service (`USE_MEMORY_API = True`).
- **Mode B**: OCR-scans a user-defined screen region (`T` hotkey to set region in calibrate mode).

Assets: `bg_progress.png`, `progress.png` (auto-scaled to 40 % screen width).

Hotkeys: `T` — toggle OCR region setup (calibrate only). `RMB` on bar — toggle center/custom position.

Requires calibration for positioning.



## Project Layout

```
HEAT_SACLOS/
├── fuse/                          # FUSE plugin framework
│   ├── api.py                     # FusePlugin, FuseContext, HotkeyRegistry
│   ├── discovery.py               # Plugin scanning & manifest parsing
│   ├── resolver.py                # Dependency resolution & topological sort
│   ├── host.py                    # PluginHost — lifecycle, listeners, idle loop
│   ├── events.py                  # EventBus
│   ├── services.py                # ServiceRegistry
│   ├── runner.py                  # CLI entry point
│   ├── log.py                     # loguru session logging
│   ├── plugins/                   # Built-in core plugins
│   │   └── game_memory/
│   │       ├── manifest.json
│   │       └── plugin.py
│   ├── ui/                        # Framework UI
│   │   ├── manager.py             # Plugin Manager (Ctrl+M)
│   │   └── config_schema.py       # Declarative config schema
│   └── utils/                     # Framework utilities
│       ├── config.py              # PluginConfig, ConfigManager
│       ├── game_memory.py         # GameMemory, ChainDef
│       ├── memory_reader.py       # ctypes kernel32 wrappers
│       ├── layered_window.py      # Win32 LayeredWindow
│       ├── panel.py               # FusePanel / FusePanelGroup
│       ├── screen_capture.py      # mss / PIL grab_region_np
│       ├── hardware_inject*.py    # Input injection backends
│       ├── ocr.py                 # OCR helpers
│       ├── paths.py               # Path resolution
│       └── ...
│
├── overlay/                       # HEAT overlay plugins
│   ├── heat/
│   │   └── plugins/
│   │       ├── energy_bar/        # Energy/progress HUD
│   │       │   ├── manifest.json
│   │       │   ├── plugin.py
│   │       │   └── ocr_bar.py
│   │       └── heat_ailos_torc/   # SACLOS ML overlay
│   │           ├── manifest.json
│   │           ├── plugin.py
│   │           ├── profiles.py
│   │           ├── runner.py
│   │           ├── predictor/
│   │           ├── trainer/
│   │           ├── refiner/
│   │           └── ui/
│   └── ml/heat_ailos_torc/        # Shared ML modules
│       ├── profiles.py
│       ├── ocr/
│       ├── predictor/
│       ├── trainer/
│       └── refiner/
│
├── sim/                           # Missile physics simulator
│   ├── missile_sim.py             # MK8Sim
│   └── visualizer.py              # SimObservatory
│
├── data/                          # Persistent data
│   ├── configs/                   # JSON configs (fuse_*.json)
│   └── ml/                        # ML profiles, datasets, weights
│
├── assets/                        # Game memory pointer chains
│   └── pointer_chains.json
│
├── tools/                         # Calibration utilities
│   └── calibrate_envelope.py
│
├── arduino/                       # Hardware injection firmware
│   ├── mouse_hid/
│   └── flash_leonardo.py
│
├── run.bat                        # Windows launcher menu
├── run_heat_overlay.py            # FUSE overlay entry
├── run_heat_ailos_torc.py         # Standalone ML entry
├── run_sim_viz.py                 # Simulator entry
└── requirements.txt               # pynput, Pillow, pytesseract, numpy, mss, loguru, matplotlib, pyserial
```

---

## Version

Host version: `1.0`

