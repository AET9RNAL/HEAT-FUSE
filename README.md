# ![alt text](assets/fuse_banner.png)

# ![alt text](assets/logo.png) FUSE - an external modding runtime for WoT:HEAT - Project Documentation

**FUSE** is **not** affiliated, endorsed, or approved by World of Tanks: HEAT or Wargaming. It is a third-party modding toolkit built around a lightweight Python plugin framework for real-time Windows overlays.

**FUSE** does not provide any game modifications or hacks. It is a toolkit for building overlays/UI reskins that uses game information accessible to the user during normal gameplay. It does not read, expose, or exploit client information that wouldn't normally be available to the user.

**FUSE** does not inject into, modify, or interact with the game's runtime.

Any modifications to FUSE that would allow reading, exposing, or exploiting client information that wouldn't normally be available to the user, or that alters the game's runtime are strictly prohibited.

![Static Badge](https://img.shields.io/badge/-BUILT_WITH-1D1D1D?style=for-the-badge&labelColor=1D1D1D&color=1D1D1D)
![Logo](https://img.shields.io/badge/-RIVE-f3f2f4?style=for-the-badge&logo=rive&logoColor=f3f2f4&labelColor=1D1D1D&color=1D1D1D)
![Logo](https://img.shields.io/badge/-PYTHON-f3f2f4?style=for-the-badge&logo=python&logoColor=f3f2f4&labelColor=1D1D1D&color=1D1D1D)
![Logo](https://img.shields.io/badge/-C++-f3f2f4?style=for-the-badge&logo=cplusplus&logoColor=f3f2f4&labelColor=1D1D1D&color=1D1D1D)

![Static Badge](https://img.shields.io/badge/RUNTIME_VERSION-2.0.1-1D1D1D?style=for-the-badge&labelColor=1D1D1D&color=434343)
---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Getting Started](#getting-started)
3. [FUSE Framework](#fuse-framework)
   - [Architecture](#architecture)
   - [Plugin Contract](#plugin-contract)
   - [Manifest](#manifest)
   - [.fuse Archive Format](#fuse-archive-format)
   - [Discovery & Load Order](#discovery--load-order)
   - [Core APIs](#core-apis)
   - [Built-in Utilities](#built-in-utilities)
   - [FUSE Input API](#fuse-input-api)
   - [Host Lifecycle](#host-lifecycle)
   - [Plugin Manager](#plugin-manager)
4. [Built-in Plugins](#built-in-plugins)
   - [game_memory](#game_memory)
   - [rive_animation](#rive_animation)
5. [Overlay Plugins](#overlay-plugins)
   - [energy_bar](#energy_bar)
6. [Native (rive_plugin.dll)](#native-rive_plugindll)
7. [Project Layout](#project-layout)

---

## Project Overview

FUSE provides:

- **Per-pixel-alpha HUD overlays** via Win32 `LayeredWindow` (`CreateWindowExW` + `UpdateLayeredWindow`). Each pixel carries its own alpha channel.
- **In-game memory reading** via pointer chains (`ctypes` + `kernel32`).
- **Rive animation rendering** via a native C++ runtime (`rive_plugin.dll`, D3D11/WARP).
- **Plugin-based architecture** - FUSE discovers, resolves dependencies, calibrates, and manages overlays sequentially. Plugins never create global state.
- **Distributable `.fuse` plugin archives** - single-file ZIP packages loaded via Python `zipimport`.

### Entry Points

| Script | Purpose |
|--------|---------|
| `run.bat` | Conda env setup + interactive launcher menu |
| `run_heat_overlay.py` | Boots FUSE; `plugins/*.fuse` archives are auto-scanned |
| `rebuild_dll.ps1` | Rebuild `native/bin/rive_plugin.dll` |

---

## Getting Started

1. Install [Miniconda](https://docs.anaconda.com/miniconda/) and run `run.bat` - it creates the `heat_fuse` env, installs deps, and shows a menu.
2. Install [Tesseract OCR](https://github.com/tesseract-ocr/tesseract) if using OCR features.


On first launch, FUSE auto-registers the `.fuse` extension under `HKCU`.

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

**Global hotkeys** (registered by the host):

| Combo | Action |
|-------|--------|
| `Ctrl+L` | Toggle calibrate / locked (advances calibration stage if `calibration_stages > 1`). |
| `Ctrl+M` | Open / close the Plugin Manager window. |
| `Ctrl+R` | Hot-reload all plugins from disk (purges module cache, re-runs `setup()`). |
| `Ctrl+P` | Quit FUSE. |

### Plugin Contract

Every plugin subclasses `FusePlugin` and ships as a folder with `manifest.json` (built-ins) or inside a `.fuse` archive (user plugins).

```python
from fuse.api import FusePlugin, FuseContext

class MyPlugin(FusePlugin):
    requires_calibration = False
    calibration_stages   = 1   # set to 2+ for multi-pass calibration

    def setup(self, ctx: FuseContext) -> None:
        ...

    def tick(self, dt: float) -> None:
        ...

    def enter_calibrate(self, stage: int = 1) -> None:
        ...

    def enter_locked(self) -> None:
        ...

    def teardown(self) -> None:
        ...
```

#### Lifecycle Hooks

| Hook | Called When |
|------|-------------|
| `setup(ctx)` | Once after instantiation. Build widgets, load config, register hotkeys, consume services. |
| `tick(dt)` | Every ~50 ms from the host idle loop. `dt` is seconds since last tick. |
| `enter_calibrate(stage)` | Entering calibrate mode (or advancing to the next stage). `stage` is 1-based. |
| `enter_locked()` | Final `Ctrl+L` press - panel positions are persisted, click-through enabled. |
| `teardown()` | On shutdown or reload. Persist state, release handles. |

#### Class Attributes

- `requires_calibration` - `True` if the plugin has interactive calibration UI. The host blocks the setup queue until the user presses `Ctrl+L` to lock the plugin.
- `calibration_stages` - Number of `Ctrl+L` presses required to complete calibration. Default `1`. Set to `2` for plugins that need two passes (e.g. 3rd-person then 1st-person position). The host calls `enter_calibrate(2..N-1)` for intermediate stages, then `enter_locked()` on the final press.

---

### Manifest

Each plugin must contain a `manifest.json` at the package root:

```json
{
  "plugin_id": "my_plugin",
  "name": "My Plugin",
  "version": "1.0",
  "author": "AETERNAL",
  "description": "What it does.",
  "entry": "plugin:MyPlugin",
  "min_host_version": "2.0",
  "dependencies": ["game_memory"],
  "optional_dependencies": [],
  "hotkeys": {"toggle": "ctrl+t"},
  "default_config": {"opacity": 200}
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `plugin_id` | yes | Programmatic identifier used for config files, deps, enable/disable. Must match the archive's top-level directory name for `.fuse` plugins. |
| `name` | yes | Display name shown in UI and logs. |
| `version` | yes | Semver string. |
| `author` | no | Display author shown in Plugin Manager. |
| `description` | no | Short human-readable summary. |
| `entry` | yes | `"module:ClassName"`. Module resolved relative to the plugin package. |
| `min_host_version` | no | Minimum FUSE host version (current: `2.0.1`). |
| `dependencies` | no | Required plugin names. Supports versioned dict: `{"name": ">=1.0"}`. |
| `optional_dependencies` | no | Soft load-order hints; missing plugins do not block loading. |
| `hotkeys` | no | `{"logical_name": "combo"}` combos exposed via `ctx.hotkey_for()`. |
| `default_config` | no | Default values for `ctx.config`. |

---

### .fuse Archive Format

User plugins are distributed as `.fuse` files - standard ZIP archives with the plugin package at the root:

```
my_plugin-1.0.fuse  (ZIP)
└── my_plugin/
    ├── manifest.json
    ├── __init__.py
    ├── plugin.py
    └── assets/
        └── icon.png
```

The archive root **must** contain a single directory whose name matches `plugin_id`. Python's `zipimport` requires this layout. FUSE adds the archive path to `sys.path` so `import my_plugin.plugin` works transparently.

**Packing** (use during plugin development):

```python
from fuse.utils.pack import pack, verify

pack("plugins/my_plugin")          # → plugins/my_plugin-1.0.fuse
verify("plugins/my_plugin-1.0.fuse")  # bool — checks ZIP structure + manifest
```

`pack()` excludes `__pycache__/`, `.git/`, `.pyc`, etc. Output filename is `<plugin_name>-<version>.fuse`.

**Asset access** - because plugin code cannot use `pathlib.Path` against a ZIP, always read assets through `ctx.assets` (see [PluginAssets](#pluginassets)).

---

### Discovery & Load Order

FUSE scans plugins from these sources. Earlier sources win on `plugin_id` collision:

1. `fuse/plugins/` - built-in core plugins (folder-based, shipped with the framework).
2. `<repo>/plugins/*.fuse` - user drop-in directory (**only `.fuse` archives**; loose folders are ignored).
3. `FUSE_PLUGIN_DIRS` env var (`:`/`;` separated paths; each scanned for `*.fuse`).
4. `extra_plugin_dirs` argument to `run()` / `PluginHost.load_plugins()`.

After discovery the resolver:

1. **Enable/disable filter** - `fuse_host.json` `disabled_plugins` excludes; non-null `enabled_plugins` is a whitelist.
2. **Compatibility check** - `min_host_version` is compared against `HOST_VERSION` (`2.0.1`). Incompatible plugins are skipped.
3. **Dependency filter** - missing or version-mismatched required deps drop the dependent plugin.
4. **Topological sort** - required deps are hard edges; optional deps are soft edges. Providers always load before consumers.
5. **Cycle detection** - cyclic dependencies are dropped with an error log.

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
    assets: PluginAssets       # ctx.assets.load_image("logo.png"), .read(), .load_font(), ...
    host: PluginHost
    state: str                 # "calibrate" | "locked"
    package_root: Traversable  # raw root — prefer ctx.assets for normal access
    events: EventBus
    services: ServiceRegistry
    manifest_hotkeys: dict
    extras: dict               # plugin-private scratch space
    logger: Any                # loguru logger bound with plugin=name
```

**Key fields**

- `tk_root` - The host's hidden Tk root. Use for scheduling `root.after()` calls from worker threads.
- `config` - `PluginConfig` instance scoped to this plugin (see below).
- `hotkeys` - Shared `HotkeyRegistry`; plugins register combos, the host's pynput listener fans out presses.
- `assets` - `PluginAssets` accessor bound to the plugin's `assets/` directory. Works identically whether the plugin lives on disk or inside a `.fuse` archive.
- `package_root` - Raw `Traversable` (a `pathlib.Path` or `zipfile.Path`) pointing at the plugin package root. Use `ctx.assets` for normal access; this is for advanced cases.
- `state` - Current host state (`"calibrate"` or `"locked"`). Updated by the host on transitions.
- `events`, `services` - See below.
- `manifest_hotkeys` - Dict of `{"logical_name": "combo"}` from `manifest.json`.
- `logger` - A `loguru` logger pre-bound with `plugin=<plugin_id>`.

`ctx.hotkey_for(name, fallback="")` returns the combo for a logical hotkey from the manifest, or `fallback` if undefined.

---

#### PluginAssets

`ctx.assets` exposes the plugin's `assets/` directory through a uniform API. Works for both folder plugins and `.fuse` archives.

```python
ctx.assets.read("rive/gauge.riv")            # → bytes
ctx.assets.open("logo.png")                   # → seekable io.BytesIO (PIL-safe)
ctx.assets.exists("optional.wav")             # → bool
ctx.assets.load_image("logo.png")             # → PIL.Image (RGBA)
ctx.assets.load_font("Montserrat.ttf", "mt")  # registers TTF with Windows GDI (in-memory)
ctx.assets.load_sound("intercept.wav")        # → WAV bytes for winsound.PlaySound(SND_MEMORY)
```

Always prefer `ctx.assets` over `importlib.resources` or raw `Path` arithmetic - the latter break inside `.fuse` archives.

---

#### EventBus

Lightweight pub/sub for cross-plugin communication. All handler invocations are dispatched on the Tk thread via `root.after(0, ...)`, so callbacks can safely mutate widgets.

```python
class EventBus:
    def subscribe(self, event: str, cb: Callable, *, owner: str = "") -> None
    def unsubscribe(self, event: str, cb: Callable) -> None
    def emit(self, event: str, **kwargs) -> None
```

```python
ctx.events.subscribe("game_memory.connected", self._on_connected, owner=self.name)
ctx.events.emit("game_memory.connected")
```

`emit` is fire-and-forget. Handlers that raise are caught + logged; they do not block other subscribers. Host-emitted events include `host_state_changed` (with `state` and `calib_stage`).

---

#### ServiceRegistry

Named object registry for inter-plugin APIs. Because the resolver loads providers before consumers, `require()` is safe inside a consumer's `setup()`.

```python
class ServiceRegistry:
    def register(self, name: str, impl: object, *, owner: str = "") -> None
    def get(self, name: str) -> Optional[object]   # None if missing
    def require(self, name: str) -> object         # RuntimeError if missing
    def unregister(self, name: str) -> None
```

A consumer should list the provider in `dependencies` so the resolver orders them correctly.

---

#### HotkeyRegistry

Global keyboard listener (pynput) fanned out to registered callbacks. The host owns the single `pynput.keyboard.Listener`; plugins never create their own.

```python
ctx.hotkeys.register("ctrl+l", self._on_lock, label="Lock")
ctx.hotkeys.register("shift+f1", self._on_shout, label="Shout")
```

Combos are parsed as `modifier+modifier+key`. Supported modifiers: `ctrl`, `shift`, `alt`. Case-insensitive. Re-registrations overwrite with a warning. Rebinding from the Plugin Manager (Ctrl+M → Keybindings → Rebind) updates the binding live.

---

#### PluginConfig

Per-plugin JSON config with auto-save, watchers, schema-driven UI, and hot-reload from disk.

```python
class PluginConfig:
    def defaults(self, _dict=None, **kwargs) -> PluginConfig
    def schema(self, categories: list) -> PluginConfig
    def load(self) -> PluginConfig
    def save(self) -> None
    def reload(self) -> None                    # re-read disk, fire watchers for changed keys
    def check_reload(self) -> bool              # poll mtime (≤1×/sec); reload if changed
    def get(self, key, default=...) -> Any
    def set(self, key, value) -> None           # saves + fires watchers
    def update(self, data: dict) -> None        # batch set
    def snapshot(self) -> dict
    def watch(self, key: str, callback) -> None
```

```python
ctx.config.defaults(opacity=200, position=None).load()

opacity = ctx.config.get("opacity")
ctx.config.watch("opacity", self._on_opacity_changed)
ctx.config.set("opacity", 180)               # persists + fires watcher

# In tick(), pick up live edits to data/configs/fuse_<plugin>.json:
def tick(self, dt):
    self.ctx.config.check_reload()
```

Config files live in `data/configs/fuse_<plugin_id>.json`.

**Declarative schema** (drives the Plugin Manager Settings tab and auto-clamps `int`/`float` to `min`/`max` on `set()`):

```python
from fuse.ui.config_schema import ConfigCategory, ConfigEntry

ctx.config.schema([
    ConfigCategory("Display", [
        ConfigEntry("opacity",   "Opacity",    type="int",   min=0, max=255),
        ConfigEntry("show_logo", "Show Logo",  type="bool"),
        ConfigEntry("theme",     "Theme",      type="choice", choices=["dark", "light"]),
    ]),
    ConfigCategory("Position", [
        ConfigEntry("hud_pos", "HUD Position", type="position"),
    ]),
])
```

Entry types: `bool`, `int`, `float`, `str`, `choice`, `position`.

---

### Built-in Utilities

#### LayeredWindow

Win32 per-pixel-alpha overlay window via `CreateWindowExW` + `UpdateLayeredWindow`. Works alongside the Tkinter mainloop (Tcl's event loop dispatches Win32 messages on the same thread).

Each `update_image()`:
1. Converts the PIL RGBA image to **premultiplied BGRA** (numpy vectorised multiply + channel reorder).
2. Builds a bottom-up DIB section via `CreateDIBSection` + `memmove`.
3. Calls `UpdateLayeredWindow` with `AC_SRC_ALPHA` per-pixel alpha and an optional global `SourceConstantAlpha`.

`update_image(img)` (no `x,y`) leaves the window position untouched - safe during OS drag.

```python
from fuse.utils.layered_window import LayeredWindow

win = LayeredWindow("My Overlay", x=100, y=200, draggable=False)
win.create(pil_rgba_image, global_alpha=220)
win.show()
win.move(300, 400)
win.update_image(new_image)
win.set_click_through(True)   # WS_EX_TRANSPARENT
win.set_draggable(True)       # WM_NCHITTEST → HTCAPTION
win.destroy()
```

---

#### FusePanel

`LayeredWindow` wrapper with config-backed position and calibrate/locked lifecycle.

```python
from fuse.utils.panel import FusePanel, FusePanelGroup

# Single-view panel. ctx_or_config accepts a FuseContext OR a raw PluginConfig.
panel = FusePanel("hud_name", "hud_pos", ctx,
                  title="My HUD", default_x=100, default_y=50)
panel.create(pil_rgba_image)
panel.enter_calibrate()       # draggable, click-enabled, visible
panel.enter_locked()          # saves position, click-through, visible
panel.update(new_image)                  # animation frame (no position snap)
panel.update(new_image, x=100, y=200)    # atomic reposition + repaint
```

**Dual-view calibration** (3rd-person + 1st-person positions). The plugin sets `calibration_stages = 2`:

```python
panel = FusePanel("hud", "hud_pos_3p", ctx,
                  config_key_fp="hud_pos_1p",
                  default_x=100, default_y=50)

# Host calls these on successive Ctrl+L presses:
panel.enter_calibrate(stage=1)   # user drags to 3rd-person target
panel.enter_calibrate(stage=2)   # 3P saved, user drags to 1st-person target
panel.enter_locked()             # 1P saved, panel is click-through

# In tick() while locked, switch between positions by view flag:
def tick(self, dt):
    panel.update_view(mem.read("multiplayer_is_fp_view"))
```

`persist_position()` saves the current window position to whichever key matches the last seen view - call from `teardown()`.

`FusePanelGroup` fans out `enter_calibrate(stage)` / `enter_locked()` / `update_view(flag)` / `show_all()` / `hide_all()` / `destroy_all()` to a collection.

---

#### Screen Capture

```python
from fuse.utils.screen_capture import grab_region_np

arr = grab_region_np((x1, y1, x2, y2))   # np.ndarray (H, W, 3) RGB uint8
```

Prefers `mss` (~3-8 ms), falls back to PIL `ImageGrab` (~20 ms). Thread-safe via thread-local `mss` instances.

---

#### AnimationLoop

`root.after`-based animation helper with fps control and clean stop.

```python
from fuse.utils.animation import AnimationLoop

loop = AnimationLoop(ctx.tk_root, self._tick_frame, fps=30)
loop.start()   # idempotent
loop.stop()    # cancels pending callback
```

Exceptions in the callback are caught per-frame and logged without stopping the loop.

---

#### RiveAnimation

`ctypes` wrapper around `native/bin/rive_plugin.dll`. Each instance owns its own D3D11 WARP device + pixel buffer; renders a straight-alpha RGBA `PIL.Image` ready for `FusePanel.update()`.

```python
from fuse.utils.rive_animation import RiveAnimation

anim = RiveAnimation(256, 256)
anim.load_bytes(ctx.assets.read("rive/gauge.riv"))   # .fuse-safe
anim.set_state_machine("engine")
anim.vm_bind("GaugeVM")

# each frame:
anim.vm_set_number("heat", 0.42)
anim.vm_set_color("colorProperty", 0xFFFF9800)   # ARGB
anim.advance(1 / 30)
img = anim.get_image()
anim.close()
```

**ViewModel API** (path syntax `"property"` or `"nested/property"`):

- `vm_bind(name)`
- `vm_set_number(path, float)` / `vm_get_number(path)`
- `vm_set_bool(path, bool)` / `vm_get_bool(path)`
- `vm_set_string(path, str)`
- `vm_set_color(path, argb)` - 32-bit ARGB integer
- `vm_set_enum(path, label)`
- `vm_trigger(path)`

**State Machine API**: `set_state_machine(name)`, `sm_bool/sm_number/sm_trigger(name, value)`.

Prefer consuming the `rive_animation` service (`ctx.services.get("rive_animation").create(w, h)`) over importing directly - the service handles the DLL-missing case centrally.

---

#### GameMemory

Typed memory reader for Windows processes via pointer chains. `ctypes` + `kernel32`, no external deps.

```python
from fuse.utils.game_memory import GameMemory

mem = GameMemory("engine_launcher.exe", "assets/pointer_chains.json")
mem.open()
energy = mem.read("energy")          # int | float | None
addr   = mem.resolve_address("ammo") # int | None
mem.close()
```

Pointer chain JSON:

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

Lower-level primitives in `fuse.utils.memory_reader`: `find_pid_by_name`, `ProcessHandle`, `resolve_pointer_chain`, `get_module_base`.

---

#### OCR

Tesseract-based screen-OCR utilities. No game-specific masks live here; callers supply regions.

```python
from fuse.utils.ocr import ocr_capture_int, IntHysteresisFilter, TESSERACT_OK

if TESSERACT_OK:
    val = ocr_capture_int(
        (x1, y1, x2, y2),
        min_val=0, max_val=9999,
        _filter=IntHysteresisFilter(jump_tol=12),
    )
```

`ocr_capture_int` tries multiple binarisation strategies (bright-text thresholds + Otsu), upscales 5x, and iterates PSM modes 7, 8, 13, 6 until a value in `[min_val, max_val]` is found. Returns `None` on failure.

**Filters**

- `TemporalOCRFilter(window=3, tolerance=0.10)` - sliding-window confirmation (>=2 agreeing reads).
- `IntHysteresisFilter(jump_tol=12)` - outliers must repeat before adoption.

---

#### Fonts

```python
from fuse.utils.fonts import load_font, load_font_from_bytes, unload_mem_fonts

load_font("assets/MyFont.ttf")                # path-based (built-ins + dev)
load_font_from_bytes(ctx.assets.read("F.ttf"), key="myfont")   # .fuse-safe
```

`load_font_from_bytes` uses `AddFontMemResourceEx` - no temp file needed, works inside `.fuse` archives. The host calls `unload_mem_fonts()` on shutdown.

---

#### Trajectory Replay

Replays timestamped mouse-delta trajectories with precise timing.

```python
from fuse.utils.trajectory_replay import replay_movements, replay_full_scenario

dx, dy, elapsed = replay_movements(trajectory, abort_event=event)

dx, dy, elapsed = replay_full_scenario(
    trajectory,
    pre_trajectory=pre_aim,
    cursor_pos=(origin_x, origin_y),
    abort_event=event,
    countdown_s=3,
    status_callback=lambda msg: ctx.logger.info(msg),
    fire_click=True,
)
```

`replay_movements` sleeps to each point's target time, rounds cumulative deltas to integer, and only injects on rounded-delta change. Supports early abort via `threading.Event`. Uses the [FUSE Input API](#fuse-input-api) under the hood.

---

#### Packing (`fuse.utils.pack`)

```python
from fuse.utils.pack import pack, verify

archive = pack("plugins/my_plugin")          # → plugins/my_plugin-1.0.fuse
verify(archive)                              # → bool
```

Excludes `__pycache__/`, `.git/`, `*.pyc/.pyo/.pyd`. `verify()` checks ZIP validity, single top-level directory, and that the embedded `manifest.json` has an `entry` field.

---

### FUSE Input API

`fuse.utils.hardware_inject_router` - abstract mouse output for plugins that drive the cursor (e.g. guidance / trajectory replay). Backend is selected by config key `input_backend`: `"arduino" | "sendinput" | "none"`. Default is `"arduino"`.

```python
from fuse.utils.hardware_inject_router import (
    init_backend, connect, disconnect, is_connected,
    inject_mouse_movement, inject_mouse_click, set_cursor_pos,
    is_admin, enable_hires_timer, disable_hires_timer,
)

init_backend("arduino")        # or "sendinput" / "none"
connect()                       # opens serial (Arduino) or no-op (SendInput)
inject_mouse_movement(dx, dy)
inject_mouse_click()
```

The public function names are identical for every backend; switch at runtime by calling `init_backend(name)`.

**Arduino backend** (`hardware_inject_arduino.py`)

Auto-detects COM ports by VID (Arduino / SparkFun / CH340). 5-byte packet protocol `[CMD:1][X:int16][Y:int16]` over serial at 115200 baud. Large deltas are chunked into 127-unit steps (HID mouse reports are signed 8-bit).

**SendInput backend** (`hardware_inject.py`)

Windows `SendInput` with `MOUSEEVENTF_MOVE`. Enables 1 ms timer granularity via `timeBeginPeriod(1)`. Requires Administrator privileges to drive elevated game windows (UIPI).

**Hardware** - Arduino HID firmware lives in `tools/arduino/mouse_hid/`. `tools/arduino/flash_leonardo.py` flashes a Pro Micro / Leonardo with the firmware.

---

### Host Lifecycle

1. **Boot** (`fuse/runner.py`)
   - Sets up logging (`logs/fuse_YYYY-MM-DD--HH-MM.log`, `enqueue=True` for background sink).
   - Auto-registers the `.fuse` file association on first run.
   - Loads FUSE fonts via GDI.
   - Creates `PluginHost`, calls `host.load_plugins()`, starts `host.run()`.

2. **Setup Queue**
   - `discover()` finds plugins from `fuse/plugins/` (folders) + `plugins/*.fuse` (archives) + env / extra dirs.
   - `resolve_load_order()` sorts by dependencies.
   - `_dequeue_next_plugin()` instantiates one plugin, calls `setup()`, enters calibrate mode.
   - For `requires_calibration = True`, the host waits for `Ctrl+L`. With `calibration_stages > 1`, each press advances `enter_calibrate(stage)` until the final press triggers `enter_locked()` and dequeues the next plugin.
   - `setup()` exceptions mark the plugin `ERROR`; the queue continues.

3. **Hot Reload** (`Ctrl+R`)
   - Tears down every active plugin in reverse order.
   - Purges cached modules under `fuse/plugins/` and `plugins/` from `sys.modules` so edited sources are re-read.
   - Re-discovers and re-instantiates everything; all plugins enter the current host state directly (no calibrate stage).

4. **Idle Loop** - `tick(dt)` is called on every active plugin every ~50 ms. Per-plugin exceptions are caught and logged.

5. **Shutdown** - `teardown()` runs in reverse load order. Listeners stop, in-memory fonts are unregistered, the Tk mainloop exits.

---

### Plugin Manager

Press `Ctrl+M` to open a dark `tk.Toplevel` with three tabs (custom `clam` theme, `#1a1a1a` background).

- **Plugins** - list of every discovered plugin with state dot, version, author, and Enable/Disable toggle. Toggling at runtime tears down or re-instantiates the plugin without a host restart.
- **Settings** - per-plugin form generated from `ctx.config.schema([...])`. Widgets: checkbox (`bool`), validated Entry with min/max clamp (`int`/`float`), Combobox (`choice`), free Entry (`str`), read-only label (`position`). Edits buffer in a pending dict; unsaved changes block tab switching with a flash warning. Save commits via `PluginConfig.set()`; Discard rebuilds the form.
- **Keybindings** - registered hotkeys with action label + current combo. Click **Rebind**, press the new combo, and the binding updates live. The pynput listener is suspended during capture so host hotkeys do not fire.

---

## Built-in Plugins

Shipped under `fuse/plugins/`. Always loaded before user plugins.

### game_memory

Opens the game process and registers a `GameMemory` instance as the `game_memory` service.

```json
{
  "plugin_id": "game_memory",
  "name": "Game Memory",
  "version": "1.1",
  "entry": "plugin:GameMemoryPlugin"
}
```

Consumer usage:

```python
mem = ctx.services.require("game_memory")
energy = mem.read("energy")
```

Config keys (with defaults from `manifest.json`):

- `process_name` - default `"engine_launcher.exe"`.
- `chains_file` - default `"assets/pointer_chains.json"`.
- `reconnect_interval_s` - default `5.0`. Auto-reconnects on process-gone or `OSError` reads.

---

### rive_animation

Wraps `native/bin/rive_plugin.dll` and registers a `RiveAnimationService` factory as the `rive_animation` service.

```json
{
  "plugin_id": "rive_animation",
  "name": "Rive Animation",
  "version": "1.0",
  "entry": "plugin:RiveAnimationPlugin"
}
```

```python
svc  = ctx.services.require("rive_animation")
anim = svc.create(width, height)
anim.load_bytes(ctx.assets.read("rive/gauge.riv"))
anim.set_state_machine("engine")
anim.vm_bind("GaugeVM")
```

If the DLL is missing, the plugin logs an error and **does not register** the service. Dependent plugins should `ctx.services.get("rive_animation")` and self-disable gracefully when `None`.

See [Built-in Utilities → RiveAnimation](#riveanimation) for the full API and [BUILD.md](BUILD.md) for build instructions.

---

## Overlay Plugins

User plugins shipped under `plugins/` as `.fuse` archives.

### energy_bar

Rive-driven energy bar overlay (`plugins/energy_bar-2.0.1.fuse`). Reads energy from the `game_memory` service, drives a Rive ViewModel, and pushes each frame to a `FusePanel`.

```json
{
  "plugin_id": "energy_bar",
  "name": "Energy Bar",
  "version": "2.0.1",
  "entry": "plugin:EnergyBarPlugin",
  "dependencies": ["game_memory", "rive_animation"]
}
```

**Rive contract** (`assets/rive/energyBar.riv`)

- ViewModel `energyBarVM`
  - `energyValue` - float `0.0`-`1.0`
  - `colorProperty` - 32-bit ARGB color
  - `strokeWeight` - float (default `1.5`)
  - `rotation` - float (degrees)
  - `isSetupComplete` - bool (driven by calibration state)
  - `state` - string (`"CALIBRATING 3rd PERSON"` / `"CALIBRATING 1st PERSON"` / `"COMPLETE"`)
- State machine: `energyEngine`

**Dual-view calibration** - `calibration_stages = 2`. First `Ctrl+L` saves the 3rd-person bar position, second saves the 1st-person position. While locked, `panel.update_view(mem.read("multiplayer_is_fp_view"))` swaps positions automatically when the in-game view changes.

**Config keys** (Plugin Manager → Settings → energy_bar)

| Category | Key | Type | Description |
|----------|-----|------|-------------|
| Memory Source | `memory_chain` | choice | `multiplayer_vehicle_energy` \| `training_vehicle_energy` |
| Colors | `color_high` / `color_mid` / `color_low` | hex RGB | Thresholds at 60% / 30%. |
| Style | `stroke_weight` | float `0.5`-`3.0` | Forwarded to `strokeWeight` VM property. |
| Animation | `anim_width` / `anim_height` | int `10`-`3000` | Render-target pixel dimensions. |
| Rotation | `rotation` | float `-360`-`360` | Forwarded to `rotation` VM property. |
| Position | `bar_custom_pos` | position | 3rd-person `[x, y]` (set via stage-1 drag). |
| Position | `bar_custom_pos_fp` | position | 1st-person `[x, y]` (set via stage-2 drag). |

---

## Native (rive_plugin.dll)

The `rive_animation` core plugin requires `native/bin/rive_plugin.dll` - a thin C ABI over [rive-runtime](https://github.com/rive-app/rive-runtime) (D3D11 with WARP fallback). Source: `native/rive_plugin/{rive_plugin.cpp,rive_plugin.h,premake5.lua}`.

**Build:** see [BUILD.md](BUILD.md) - clones rive-runtime, builds with clang-cl + premake, then builds `rive_plugin.dll`.

**Quick rebuild:** `rebuild_dll.ps1` kills any python process holding the DLL and runs MSBuild against the existing VS solution.

**Exposed C ABI** (consumed by `fuse/utils/rive_animation.py`):

- `rive_create(w, h)` / `rive_destroy(handle)`
- `rive_load_file(handle, path)` / `rive_load_bytes(handle, data, size)`
- State machine: `rive_set_state_machine`, `rive_sm_bool`, `rive_sm_number`, `rive_sm_trigger`
- ViewModel: `rive_vm_bind`, `rive_vm_set_{number,bool,string,color,enum}`, `rive_vm_trigger`, `rive_vm_get_{number,bool}`
- Rendering: `rive_advance(handle, dt)`, `rive_render(handle, pixel_buffer)`

---

## Project Layout

```
HEAT_SACLOS/
├── fuse/                          # FUSE plugin framework
│   ├── api.py                     # FusePlugin, FuseContext, HotkeyRegistry
│   ├── discovery.py               # Folder + .fuse scanning, manifest parsing
│   ├── resolver.py                # Dependency resolution & topological sort
│   ├── host.py                    # PluginHost — lifecycle, listeners, idle loop
│   ├── events.py                  # EventBus
│   ├── services.py                # ServiceRegistry
│   ├── runner.py                  # CLI entry point
│   ├── log.py                     # loguru session logging
│   ├── plugins/                   # Built-in core plugins (folders)
│   │   ├── game_memory/
│   │   └── rive_animation/
│   ├── ui/
│   │   ├── manager.py             # Plugin Manager (Ctrl+M)
│   │   └── config_schema.py       # Declarative config schema
│   └── utils/
│       ├── config.py              # PluginConfig, ConfigManager
│       ├── assets.py              # PluginAssets (.fuse-safe asset accessor)
│       ├── pack.py                # pack() / verify() for .fuse archives
│       ├── file_assoc.py          # HKCU registration for .fuse extension
│       ├── game_memory.py         # GameMemory, ChainDef
│       ├── memory_reader.py       # ctypes kernel32 wrappers
│       ├── layered_window.py      # Win32 LayeredWindow
│       ├── panel.py               # FusePanel / FusePanelGroup
│       ├── screen_capture.py      # mss / PIL grab_region_np
│       ├── animation.py           # AnimationLoop
│       ├── fonts.py               # GDI font registration (path + in-memory)
│       ├── paths.py               # Path resolution
│       ├── ocr.py                 # Tesseract OCR helpers
│       ├── hardware_inject.py     # SendInput backend (FUSE Input API)
│       ├── hardware_inject_arduino.py  # Arduino HID backend
│       ├── hardware_inject_router.py   # Backend router
│       ├── trajectory_replay.py   # Mouse trajectory replay
│       ├── rive_animation.py      # ctypes wrapper around rive_plugin.dll
│       └── window_utils.py        # Win32 window helpers
│
├── plugins/                       # User drop-in plugins
│   ├── energy_bar-2.0.1.fuse      # Distributable archive (loaded by FUSE)
│   └── energy_bar/                # Source folder (loose folders are ignored at runtime — pack to .fuse)
│
├── native/                        # C++ Rive runtime wrapper
│   ├── bin/rive_plugin.dll        # Built artifact (see BUILD.md)
│   └── rive_plugin/
│       ├── rive_plugin.cpp
│       ├── rive_plugin.h
│       └── premake5.lua
│
├── assets/                        # Framework-wide assets
│   ├── NotoSans-VariableFont_wdth,wght.ttf
│   ├── NotoSans-Italic-VariableFont_wdth,wght.ttf
│   ├── logo.png
│   ├── fuse_banner.png
│   └── pointer_chains.json
│
├── data/                          # Persistent data (gitignored)
│   ├── configs/                   # fuse_<plugin>.json + fuse_host.json
│   └── fuse_filetype.ico          # Generated .fuse Explorer icon
│
├── tools/
│   └── arduino/                   # Mouse-HID firmware + flasher
│       ├── mouse_hid/mouse_hid.ino
│       └── flash_leonardo.py
│
├── logs/                          # Session logs (auto-created, gitignored)
│
├── run.bat                        # Windows launcher menu
├── run_heat_overlay.py            # FUSE overlay entry
├── rebuild_dll.ps1                # Rebuild rive_plugin.dll via MSBuild
├── BUILD.md                       # rive_plugin.dll build instructions
├── requirements.txt               # pynput, Pillow, pytesseract, numpy, mss, loguru, pyserial
└── README.md                      # This file
```

---

## Version

Host version: `2.0.1`
