# ![alt text](assets/fuse_banner.png)

# ![alt text](assets/logo.png) FUSE - an external modding runtime for WoT:HEAT - Project Documentation

**FUSE** is **not** affiliated, endorsed, or approved by World of Tanks: HEAT or Wargaming. It is a third-party modding toolkit built around a lightweight Python plugin framework for real-time Windows overlays.

**FUSE** does not provide any game modifications or hacks. It is a toolkit for building overlays/UI reskins that uses game information accessible to the user during normal gameplay. It does not read, expose, or exploit client information that wouldn't normally be available to the user.

**FUSE** does not inject into, modify, or interact with the game's runtime.

Any modifications to FUSE that would allow reading, exposing, or exploiting client information that wouldn't normally be available to the user, or that alters the game's runtime are strictly prohibited.

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
5. [Project Layout](#project-layout)

---

## Project Overview

FUSE provides:

- **Per-pixel-alpha HUD overlays** via Win32 `LayeredWindow` (`CreateWindowExW` + `UpdateLayeredWindow`). No chroma-key artifacts, no grey borders, no drop shadows. Each pixel carries its own alpha channel.
- **In-game memory reading** via pointer chains (`ctypes` + `kernel32`, zero external dependencies for the core runtime).
- **Plugin-based architecture** — FUSE discovers, resolves dependencies, calibrates, and manages overlays sequentially. Plugins never create global state.

### Entry Points

| Script | Purpose |
|--------|---------|
| `run.bat` | Conda env setup + interactive launcher menu |
| `run_heat_overlay.py` | Boots FUSE; `plugins/` at repo root is auto-scanned |

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

**PluginHost** (`fuse/host.py`) owns the Tk root (withdrawn), one pynput keyboard listener, one pynput mouse listener, per-plugin `PluginConfig` instances, and the global calibrate/locked state machine. It also manages a `FuseManager` window toggled by `Ctrl+M`.

Plugins are instantiated **one at a time** in dependency order. After each `setup()` returns, the host puts the plugin into calibrate mode. Plugins that declare `requires_calibration = True` block the queue until the user presses `Ctrl+L` to lock them. Plugins that do not require calibration are locked automatically and the queue advances immediately.

The host calls `tick(dt)` on every active plugin every ~50 ms from a single `root.after` idle loop. All teardown calls happen in reverse load order during shutdown.

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
  "plugin_id": "my_plugin",
  "name": "My Plugin",
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
| `plugin_id` | yes | Programmatic identifier used for config files, deps, enable/disable. |
| `name` | yes | Display name shown in UI and logs. |
| `version` | yes | Semver string. |
| `description` | no | Short human-readable summary. |
| `entry` | yes | `"module:ClassName"`. Module resolved relative to the plugin package. |
| `min_host_version` | no | Minimum FUSE host version. |
| `dependencies` | no | Required plugin names. Supports versioned dict: `{"name": ">=1.0"}`. |
| `optional_dependencies` | no | Soft load-order hints; missing plugins do not block loading. |
| `hotkeys` | no | `{"logical_name": "combo"}` combos exposed via `ctx.hotkey_for()`. |
| `default_config` | no | Default values for `ctx.config`. |

---

### Discovery & Load Order

FUSE scans plugins from four sources. Earlier sources win on `plugin_id` collision:

1. `fuse/plugins/` — built-in core plugins shipped with the framework.
2. `<repo>/plugins/` — user drop-in directory (zero configuration).
3. `FUSE_PLUGIN_DIRS` environment variable (`:` or `;` separated list of absolute paths).
4. `extra_plugin_dirs` argument passed to `run()` / `PluginHost.load_plugins()`.

After discovery, the resolver performs the following steps:

1. **Enable/disable filtering** — Plugins in `fuse_host.json`'s `disabled_plugins` list are excluded. If `enabled_plugins` is non-null, only those IDs are kept.
2. **Compatibility check** — `min_host_version` is compared against `HOST_VERSION` (`"1.0"` in `fuse/host.py`). Incompatible plugins are skipped.
3. **Dependency filtering** — Required dependencies that are missing or fail version constraints cause the dependent plugin to be dropped.
4. **Topological sort** — Required dependencies form hard edges; optional dependencies form soft edges. The sort guarantees providers are instantiated before consumers.
5. **Cycle detection** — Plugins involved in dependency cycles are dropped with an error log.

---

### Core APIs

#### FuseContext

`FuseContext` is a `@dataclass` handed to every plugin during `setup()`. It bundles every shared service so plugins never construct global state.

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

**Fields**

- `tk_root` — The host's hidden Tk root. Use for scheduling `root.after()` calls from worker threads.
- `config` — `PluginConfig` instance scoped to this plugin. See PluginConfig API below.
- `hotkeys` — Shared `HotkeyRegistry`. Plugins register combos here; the host's pynput listener fans out presses.
- `assets_dir` — `Path(plugin_dir / "assets")`. Use for loading plugin-specific images, fonts, etc.
- `host` — Reference to the running `PluginHost`. Use sparingly; prefer events/services for cross-plugin communication.
- `state` — Current host state string. Updated when the global calibrate/locked mode changes.
- `events` — `EventBus` for pub/sub.
- `services` — `ServiceRegistry` for inter-plugin APIs.
- `manifest_hotkeys` — Dict loaded from the plugin's `manifest.json` `"hotkeys"` section.
- `extras` — Empty dict reserved for plugin-private runtime state. The host never reads or writes this.
- `logger` — A `loguru` logger bound with `plugin=<plugin_id>`. Log lines are tagged per-plugin in session files.

**`ctx.hotkey_for(name, fallback="")`**

Returns the combo string for a logical hotkey declared in `manifest.json`. If the manifest does not define the key, `fallback` is returned.

```python
combo = ctx.hotkey_for("toggle", fallback="ctrl+t")
ctx.hotkeys.register(combo, self._on_toggle)
```

---

#### EventBus

Lightweight pub/sub for cross-plugin communication. All handler invocations are dispatched on the Tk thread via `root.after(0, ...)`, so callbacks can safely mutate widgets.

```python
class EventBus:
    def subscribe(self, event: str, cb: Callable, *, owner: str = "") -> None
    def unsubscribe(self, event: str, cb: Callable) -> None
    def emit(self, event: str, **kwargs) -> None
```

**Usage**

```python
def _on_connected(**kwargs):
    ...

ctx.events.subscribe("game_memory.connected", _on_connected, owner=self.name)
ctx.events.emit("game_memory.connected")
ctx.events.unsubscribe("game_memory.connected", _on_connected)
```

`emit` is fire-and-forget. Handlers that raise exceptions are caught and logged; they do not propagate or block other subscribers.

---

#### ServiceRegistry

Named object registry for inter-plugin APIs. Because the resolver loads providers before consumers, `require()` is safe inside a consumer's `setup()`.

```python
class ServiceRegistry:
    def register(self, name: str, impl: object, *, owner: str = "") -> None
    def get(self, name: str) -> Optional[object]
    def require(self, name: str) -> object
    def unregister(self, name: str) -> None
```

**Usage**

```python
# Provider plugin
ctx.services.register("game_memory", self, owner=self.name)

# Consumer plugin
api = ctx.services.require("game_memory")   # RuntimeError if missing
api = ctx.services.get("game_memory")         # None if missing
```

Re-registration logs a warning and overwrites. A plugin that consumes a service should list the provider in `dependencies` so the resolver orders them correctly.

---

#### HotkeyRegistry

Global keyboard listener (pynput) fanned out to registered callbacks. The host owns the single `pynput.keyboard.Listener`; plugins never create their own.

```python
class HotkeyRegistry:
    def register(self, combo: str, callback: Callable[[], None], label: str = "") -> None
    def unregister(self, combo: str) -> bool
    def reregister(self, old_mods: frozenset, old_key: str, new_combo: str) -> bool
    def list_bindings(self) -> list[dict]
    def dispatch(self, mods: frozenset, key: str) -> bool
```

**Usage**

```python
ctx.hotkeys.register("ctrl+l", self._on_lock)
ctx.hotkeys.register("shift+f1", self._on_shout, label="Shout")
```

Combos are parsed as `modifier+modifier+key`. Supported modifiers: `ctrl`, `shift`, `alt`. Case-insensitive. Re-registrations log a warning and overwrite the previous binding. `dispatch` is called by the host's pynput listener and returns `True` if a handler was invoked.

---

#### PluginConfig

Per-plugin JSON config with auto-save, watchers, and declarative schema support for the Plugin Manager UI.

```python
class PluginConfig:
    def defaults(self, _dict: Optional[dict] = None, **kwargs) -> "PluginConfig"
    def schema(self, categories: list) -> "PluginConfig"
    def load(self, _compat_defaults: Optional[dict] = None) -> "PluginConfig"
    def save(self) -> None
    def reload(self) -> None
    def get(self, key: str, default: Any = ...) -> Any
    def set(self, key: str, value: Any) -> None
    def update(self, data: dict) -> None
    def snapshot(self) -> dict
    def watch(self, key: str, callback: Callable[[Any], None]) -> None
```

**Usage**

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

Win32 per-pixel-alpha overlay window via `CreateWindowExW` + `UpdateLayeredWindow`. No grey borders, no drop shadows, no chroma-key. Works alongside the tkinter mainloop (tkinter's Tcl event loop dispatches Win32 messages on the same thread, so no separate message pump is required).

Internally, each `update_image()` call:
1. Converts the PIL RGBA image to **premultiplied BGRA** bytes (numpy vectorised multiply + channel reorder).
2. Builds a bottom-up DIB section via `CreateDIBSection` + `memmove`.
3. Calls `UpdateLayeredWindow` with `AC_SRC_ALPHA` per-pixel alpha and an optional global `SourceConstantAlpha`.

`set_position=False` on `_push_layered()` prevents animation loops from snapping the window back to cached coordinates during an in-progress OS drag.

```python
from fuse.utils.layered_window import LayeredWindow

win = LayeredWindow("My Overlay", x=100, y=200, draggable=False)
win.create(pil_rgba_image, global_alpha=220)
win.show()
win.move(300, 400)
win.update_image(new_pil_rgba_image)
win.set_click_through(True)   # WS_EX_TRANSPARENT
win.set_draggable(True)       # WM_NCHITTEST returns HTCAPTION
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

#### AnimationLoop

`root.after`-based animation helper with fps control and clean stop. Replaces ad-hoc `root.after(33, self._animate)` patterns.

```python
from fuse.utils.animation import AnimationLoop

logo_anim = AnimationLoop(ctx.tk_root, self._tick_logo, fps=30)
logo_anim.start()   # idempotent
logo_anim.stop()    # cancels pending callback
```

Exceptions in the callback are caught per-frame and logged without stopping the loop.

---

#### OCR

Tesseract-based screen-OCR utilities for reading digits from game UI. No game-specific masks live here; callers supply regions.

```python
from fuse.utils.ocr import ocr_capture_int, IntHysteresisFilter, TESSERACT_OK

if TESSERACT_OK:
    val = ocr_capture_int(
        (x1, y1, x2, y2),
        min_val=0, max_val=9999,
        _filter=IntHysteresisFilter(jump_tol=12),
    )
```

`ocr_capture_int` tries multiple binarisation strategies (bright-text thresholds 180/150/120/90, plus Otsu), upscales 5x, and iterates over Tesseract PSM modes 7, 8, 13, 6 until a value in `[min_val, max_val]` is found. Returns `None` on failure.

**Filters**

- `TemporalOCRFilter(window=3, tolerance=0.10)` — sliding-window confirmation. Requires >=2 agreeing reads within tolerance.
- `IntHysteresisFilter(jump_tol=12)` — hysteresis for monotonic-ish integer streams. Outliers must appear twice consecutively before adoption.

---

#### Hardware Injection Router

Abstracts mouse input backends. Configured via `input_backend` config key (`arduino`, `sendinput`, `none`).

```python
from fuse.utils.hardware_inject_router import (
    init_backend, connect, disconnect,
    inject_mouse_movement, inject_mouse_click, set_cursor_pos,
    is_admin, is_connected,
)

init_backend("arduino")   # or "sendinput" / "none"
connect()                 # opens serial (Arduino) or no-op (SendInput)
inject_mouse_movement(dx, dy)
inject_mouse_click()
```

**Arduino backend** (`hardware_inject_arduino.py`)

Auto-detects COM ports by VID (Arduino/SparkFun/CH340). Protocol: 5-byte packets `[CMD:1][X_LO:1][X_HI:1][Y_LO:1][Y_HI:1]` over serial at 115200 baud. Large deltas are split into 127-unit chunks because HID mouse reports are signed 8-bit.

**SendInput backend** (`hardware_inject.py`)

Uses Windows `SendInput` with `MOUSEEVENTF_MOVE`. Enables high-resolution timer (`timeBeginPeriod(1)`) for ~1 ms sleep granularity. Requires Administrator privileges for elevated game windows (UIPI).

---

#### Trajectory Replay

Replays timestamped mouse-delta trajectories with precise timing, used by predictor/trainer/refiner modes.

```python
from fuse.utils.trajectory_replay import replay_movements, replay_full_scenario

# Replay a list of {'t': float, 'dx': number, 'dy': number}
injected_dx, injected_dy, elapsed = replay_movements(trajectory, abort_event=event)

# Full scenario: countdown -> teleport -> pre-fire aim -> click -> guidance
injected_dx, injected_dy, elapsed = replay_full_scenario(
    trajectory,
    pre_trajectory=pre_aim,
    cursor_pos=(origin_x, origin_y),
    abort_event=event,
    countdown_s=3,
    status_callback=lambda msg: ctx.logger.info(msg),
    fire_click=True,
)
```

`replay_movements` sleeps to each point's target time, rounds cumulative deltas to nearest integer, and injects only when the rounded delta changes. Supports early abort via `threading.Event`.

---

### Host Lifecycle

1. **Boot**
   - `runner.run()` (in `fuse/runner.py`) creates a hidden Tk root, loads FUSE fonts via GDI `AddFontResourceExW`, instantiates `PluginHost`, and calls `host.load_plugins()`.
   - `host.run()` starts the pynput keyboard/mouse listeners, schedules the idle tick loop (`root.after(50, self._tick)`), and enters `root.mainloop()`.
   - Log files are written to `logs/fuse_YYYY-MM-DD--HH-MM.log` with per-plugin tagging. The file sink uses `enqueue=True` (background thread) so the tick loop is never blocked by disk I/O.

2. **Setup Queue**
   - `load_plugins()` discovers, filters, and topologically sorts plugins into `_setup_pending`.
   - `_dequeue_next_plugin()` pops the next plugin, instantiates it, calls `setup()`, and enters calibrate mode.
   - If `requires_calibration == False`, the host auto-calls `enter_locked()` and advances immediately.
   - If `requires_calibration == True`, the host blocks until the user presses `Ctrl+L` (`toggle_lock()`). Only the currently setting-up plugin is toggled during queue mode.
   - If `setup()` raises an exception, the plugin is marked `ERROR` and the queue advances without waiting.

3. **Global Hotkeys**
   - `Ctrl+L` — toggle calibrate/locked for the active plugin(s).
   - `Ctrl+P` — quit. Sets `_quitting = True` and destroys the Tk root.
   - `Ctrl+M` — open/close the Plugin Manager window.

4. **Idle Loop**
   - `tick(dt)` is called on every active plugin every ~50 ms.
   - `dt` is computed from `time.perf_counter()` delta.
   - Exceptions in `tick()` are caught and logged per-plugin; the loop continues.

5. **Shutdown**
   - `teardown()` is called on every plugin in reverse load order.
   - Listeners are stopped, the manager window is destroyed, and the Tk mainloop exits.

---

### Plugin Manager

Press `Ctrl+M` to open a dark `tk.Toplevel` with three tabs. The window uses a custom dark theme (`clam` ttk theme with `#1a1a1a` background).

- **Plugins** — scrollable list of every discovered plugin with a coloured state dot, version, author, and an Enable/Disable toggle. Toggle takes effect at runtime without restart: active plugins are torn down (`teardown()` + removed from the tick loop); disabled ones are re-instantiated via `_instantiate()` and entered into the current host state.
- **Settings** — left panel lists plugins that called `ctx.config.schema([...])`. Right panel renders per-category forms with appropriate widgets (checkbox for `bool`, validated Entry for `int`/`float`, Combobox for `choice`, read-only label for `position`). Changes are tracked in a pending buffer; unsaved edits block tab switching with a flash warning. Save writes through `PluginConfig.set()`; Discard rebuilds the form.
- **Keybindings** — all registered bindings with action label and current combo. Click **Rebind**, press a new key combo in the focused window, and the binding updates live. The pynput listener is suspended (`_capturing_rebind = True`) during capture so host hotkeys (`Ctrl+L`, `Ctrl+P`) do not fire.

---

## Overlay Plugins

### game_memory

Core built-in plugin that opens the game process and registers `GameMemory` as a service.

```json
{
  "plugin_id": "game_memory",
  "name": "Game Memory",
  "version": "1.1",
  "description": "Reads in-game values via pointer chains. Registers the 'game_memory' service for other plugins.",
  "entry": "plugin:GameMemoryPlugin"
}
```

Other plugins declare `"dependencies": ["game_memory"]` and consume:

```python
mem = ctx.services.require("game_memory")
energy = mem.read("energy")
```

Config keys: `process_name`, `chains_file`, `reconnect_interval_s`. The plugin attempts to reconnect automatically when the process is not found or a read fails with `OSError`.

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
│       ├── animation.py           # AnimationLoop
│       ├── fonts.py               # GDI font registration
│       ├── paths.py               # Path resolution
│       ├── ocr.py                 # Tesseract OCR helpers
│       ├── hardware_inject.py     # SendInput backend
│       ├── hardware_inject_arduino.py  # Arduino HID backend
│       ├── hardware_inject_router.py   # Backend router
│       ├── trajectory_replay.py   # Mouse trajectory replay
│       └── window_utils.py        # Win32 window helpers
│
├── plugins/                       # User drop-in plugins
│   ├── energy_bar/                # Energy/progress HUD
│   │   ├── manifest.json
│   │   ├── plugin.py
│   │   ├── ocr_bar.py
│   │   └── assets/
│   └── heat_ailos_torc/           # SACLOS ML overlay
│       ├── manifest.json
│       ├── plugin.py
│       ├── profiles.py
│       ├── runner.py
│       ├── predictor/
│       ├── trainer/
│       ├── refiner/
│       ├── ocr/
│       └── assets/
│
├── data/                          # Persistent data
│   ├── configs/                   # JSON configs (fuse_*.json)
│   └── ml/                        # ML profiles, datasets, weights
│       ├── ml_profiles.json
│       └── profiles/
│
├── assets/                        # Framework fonts, pointer chains, images
│   ├── NotoSans-VariableFont_wdth,wght.ttf
│   ├── NotoSans-Italic-VariableFont_wdth,wght.ttf
│   ├── logo.png
│   └── pointer_chains.json
│
├── tools/                         # Calibration utilities
│   └── calibrate_envelope.py
│
├── arduino/                       # Hardware injection firmware
│   ├── mouse_hid/
│   └── flash_leonardo.py
│
├── logs/                          # Session logs (auto-created)
│
├── run.bat                        # Windows launcher menu
├── run_heat_overlay.py            # FUSE overlay entry
├── requirements.txt               # pynput, Pillow, pytesseract, numpy, mss, loguru, pyserial
└── README.md                      # This file
```

---

## Version

Host version: `1.0`

