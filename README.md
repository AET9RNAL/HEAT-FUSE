# ![alt text](assets/fuse_banner.png)

# ![alt text](assets/logo.png) FUSE - an external modding runtime for WoT:HEAT

**FUSE** is **not** affiliated, endorsed, or approved by World of Tanks: HEAT or Wargaming. It is a third-party modding toolkit built around a lightweight Python plugin framework for real-time Windows overlays.

**FUSE** does not provide any game modifications or hacks. It is a toolkit for building overlays/UI reskins that uses game information accessible to the user during normal gameplay. It does not read, expose, or exploit client information that wouldn't normally be available to the user.

**FUSE** does not inject into, modify, or interact with the game's runtime.

Any modifications to FUSE that would allow reading, exposing, or exploiting client information that wouldn't normally be available to the user, or that alters the game's runtime are strictly prohibited.

![Static Badge](https://img.shields.io/badge/-BUILT_WITH-1D1D1D?style=for-the-badge&labelColor=1D1D1D&color=1D1D1D)
![Logo](https://img.shields.io/badge/-RIVE-f3f2f4?style=for-the-badge&logo=rive&logoColor=f3f2f4&labelColor=1D1D1D&color=1D1D1D)
![Logo](https://img.shields.io/badge/-PYTHON-f3f2f4?style=for-the-badge&logo=python&logoColor=f3f2f4&labelColor=1D1D1D&color=1D1D1D)
![Logo](https://img.shields.io/badge/-C++-f3f2f4?style=for-the-badge&logo=cplusplus&logoColor=f3f2f4&labelColor=1D1D1D&color=1D1D1D)
![Logo](https://img.shields.io/badge/-ELECTRON-f3f2f4?style=for-the-badge&logo=electron&logoColor=f3f2f4&labelColor=1D1D1D&color=1D1D1D)
![Logo](https://img.shields.io/badge/-VUE-f3f2f4?style=for-the-badge&logo=vue.js&logoColor=f3f2f4&labelColor=1D1D1D&color=1D1D1D)
![Static Badge](https://img.shields.io/badge/RUNTIME_VERSION-2.2.0-1D1D1D?style=for-the-badge&labelColor=1D1D1D&color=434343)

---

## For Players

- [Getting Started](#getting-started)
- [Installing Plugins](#installing-plugins)
- [Hotkeys](#hotkeys)
- [Plugins](#plugins)
  - [Energy Bar](#energy-bar)


---

## For Developers

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
- [Built-in Plugins](#built-in-plugins)
  - [accessors](#accessors)
  - [rive_animation](#rive_animation)
  - [game_memory (deprecated)](#game_memory-deprecated)
- [Native DLLs](#native-dlls)
- [Project Layout](#project-layout)

---

# For Players

FUSE runs alongside WoT:HEAT and displays real-time HUD overlays driven by live game data: energy bars, rangefinders, cooldown trackers, and more. Plugins are distributed as single `.fuse` files and drop straight into the `plugins/` folder.

## Getting Started

1. Install [Miniconda](https://docs.anaconda.com/miniconda/).
2. Run `run.bat` - it creates the `heat_fuse` conda environment, installs all dependencies, and shows a launch menu. (P.S. On first launch you may need to run the runner twice)
3. Install [Tesseract OCR](https://github.com/tesseract-ocr/tesseract) if any plugin you use relies on OCR features.

On first launch FUSE auto-registers the `.fuse` file extension in Windows so Explorer shows plugin files with the FUSE icon.

---

## Installing Plugins

1. Drop any `.fuse` file into the `plugins/` folder.
2. Launch FUSE via `run.bat`.

FUSE scans `plugins/` on every startup and loads all valid archives automatically.

---

## Hotkeys

These are registered globally by the FUSE host and active whenever FUSE is running. You are free to assign your own keys in the Plugin Manager.

 **NOTE**: don't press Ctrl + M/F while the console is in focus. It's a known issue with Windows that the console intercepts these keys for it's own purposes, this may halt process execution.

| Combo | Action |
|-------|--------|
| `Ctrl+L` | Confirm calibration / lock the current plugin in place. Press again to advance to the next calibration stage if the plugin has more than one. |
| `Ctrl+M` | Open / close the Plugin Manager (enable, disable, configure plugins, rebind keys). |
| `Ctrl+R` | Hot-reload all plugins from disk without restarting FUSE. |
| `Ctrl+P` | Quit FUSE. |

---

## Plugins

### Energy Bar

`EnergyBar-2.0.1.fuse` - animated Rive energy bar that tracks vehicle energy in real time. Supports separate positions for 3rd-person and 1st-person views and switches between them automatically.

**Calibration (two stages)**

1. Launch FUSE. The bar appears on screen in calibration mode.
2. Drag it to where you want it in **3rd-person** view, then press `Ctrl+L`.
3. Drag it to where you want it in **1st-person** view, then press `Ctrl+L` again to lock.

While locked the bar switches positions automatically when you zoom into first-person.

**Configuration** - open Plugin Manager (`Ctrl+M`) → Settings → Energy Bar

| Category | Key | Type | Description |
|----------|-----|------|-------------|
| Memory Source | `memory_chain` | choice | `multiplayer_vehicle_energy` or `training_vehicle_energy` - which game value drives the bar |
| Colors | `color_high` | hex RGB | Bar color above 60% energy |
| Colors | `color_mid` | hex RGB | Bar color between 30%–60% energy |
| Colors | `color_low` | hex RGB | Bar color below 30% energy |
| Style | `stroke_weight` | float `0.5`–`3.0` | Bar stroke thickness |
| Animation | `anim_width` / `anim_height` | int `10`–`3000` | Render-target dimensions in pixels |
| Rotation | `rotation` | float `-360`–`360` | Bar rotation in degrees |
| Position | `bar_custom_pos` | position | 3rd-person position (set by stage-1 drag) |
| Position | `bar_custom_pos_fp` | position | 1st-person position (set by stage-2 drag) |


# For Developers

FUSE provides:

- **Per-pixel-alpha HUD overlays** via Win32 `LayeredWindow` (`CreateWindowExW` + `UpdateLayeredWindow`). Each pixel carries its own alpha channel.
- **In-game state reads** via the `accessors` service - CDP-based reads from the Gameface debugger.
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

## Architecture

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

**PluginHost** (`fuse/core/host.py`) owns the Tk root (withdrawn), one pynput keyboard listener, one pynput mouse listener, per-plugin `PluginConfig` instances, and the global calibrate/locked state machine. It also manages a `FuseManager` window toggled by `Ctrl+M`.

Plugins are instantiated **one at a time** in dependency order. After each `setup()` returns, the host puts the plugin into calibrate mode. Plugins that declare `requires_calibration = True` block the queue until the user presses `Ctrl+L` to lock them. Plugins that do not require calibration are locked automatically and the queue advances immediately.

The host calls `tick(dt)` on every active plugin every ~50 ms from a single `root.after` idle loop. All teardown calls happen in reverse load order during shutdown.

---

## Plugin Contract

Every plugin subclasses `FusePlugin` and ships as a folder with `manifest.json` (built-ins) or inside a `.fuse` archive (user plugins).

```python
from fuse.core.api import FusePlugin, FuseContext

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

## Manifest

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
  "dependencies": ["accessors"],
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
| `min_host_version` | no | Minimum FUSE host version (current: `2.1.1`). |
| `dependencies` | no | Required plugin names. Supports versioned dict: `{"name": ">=1.0"}`. |
| `optional_dependencies` | no | Soft load-order hints; missing plugins do not block loading. |
| `hotkeys` | no | `{"logical_name": "combo"}` combos exposed via `ctx.hotkey_for()`. |
| `default_config` | no | Default values for `ctx.config`. |

---

## .fuse Archive Format

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
from fuse.packaging.pack import pack, verify

pack("dev/my_plugin")             # → out/MyPlugin-1.0.fuse
verify("out/MyPlugin-1.0.fuse")   # bool - checks ZIP structure + manifest
```

`pack()` excludes `__pycache__/`, `.git/`, `.pyc`, etc. Output filename is `<plugin_name>-<version>.fuse` written to `out/`.

**Asset access** - because plugin code cannot use `pathlib.Path` against a ZIP, always read assets through `ctx.assets` (see [PluginAssets](#pluginassets)).

---

## Discovery & Load Order

FUSE scans plugins from these sources. Earlier sources win on `plugin_id` collision:

1. `fuse/plugins/` - built-in core plugins (folder-based, shipped with the framework).
2. `<repo>/plugins/*.fuse` - user drop-in directory (**only `.fuse` archives**; loose folders are ignored).
3. `FUSE_PLUGIN_DIRS` env var (`:`/`;` separated paths; each scanned for `*.fuse`).
4. `extra_plugin_dirs` argument to `run()` / `PluginHost.load_plugins()`.

After discovery the resolver:

1. **Enable/disable filter** - `fuse_host.json` `disabled_plugins` excludes; non-null `enabled_plugins` is a whitelist.
2. **Compatibility check** - `min_host_version` is compared against `HOST_VERSION` (`2.1.1`). Incompatible plugins are skipped.
3. **Dependency filter** - missing or version-mismatched required deps drop the dependent plugin.
4. **Topological sort** - required deps are hard edges; optional deps are soft edges. Providers always load before consumers.
5. **Cycle detection** - cyclic dependencies are dropped with an error log.

---

## Core APIs

### FuseContext

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
    package_root: Traversable  # raw root - prefer ctx.assets for normal access
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

### PluginAssets

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

### EventBus

Lightweight pub/sub for cross-plugin communication. All handler invocations are dispatched on the Tk thread via `root.after(0, ...)`, so callbacks can safely mutate widgets.

```python
class EventBus:
    def subscribe(self, event: str, cb: Callable, *, owner: str = "") -> None
    def unsubscribe(self, event: str, cb: Callable) -> None
    def emit(self, event: str, **kwargs) -> None
```

```python
ctx.events.subscribe("accessors.connected", self._on_connected, owner=self.name)
ctx.events.emit("accessors.connected")
```

`emit` is fire-and-forget. Handlers that raise are caught + logged; they do not block other subscribers. Host-emitted events include `host_state_changed` (with `state` and `calib_stage`).

---

### ServiceRegistry

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

### HotkeyRegistry

Global keyboard listener (pynput) fanned out to registered callbacks. The host owns the single `pynput.keyboard.Listener`; plugins never create their own.

```python
ctx.hotkeys.register("ctrl+l", self._on_lock, label="Lock")
ctx.hotkeys.register("shift+f1", self._on_shout, label="Shout")
```

Combos are parsed as `modifier+modifier+key`. Supported modifiers: `ctrl`, `shift`, `alt`. Case-insensitive. Re-registrations overwrite with a warning. Rebinding from the Plugin Manager (Ctrl+M → Keybindings → Rebind) updates the binding live.

---

### PluginConfig

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

## Built-in Utilities

### LayeredWindow

Win32 per-pixel-alpha overlay window via `CreateWindowExW` + `UpdateLayeredWindow`. Works alongside the Tkinter mainloop (Tcl's event loop dispatches Win32 messages on the same thread).

Each `update_image()`:
1. Converts the PIL RGBA image to **premultiplied BGRA** (numpy vectorised multiply + channel reorder).
2. Builds a bottom-up DIB section via `CreateDIBSection` + `memmove`.
3. Calls `UpdateLayeredWindow` with `AC_SRC_ALPHA` per-pixel alpha and an optional global `SourceConstantAlpha`.

`update_image(img)` (no `x,y`) leaves the window position untouched - safe during OS drag.

```python
from fuse.ui.layered_window import LayeredWindow

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

### FusePanel

`LayeredWindow` wrapper with config-backed position and calibrate/locked lifecycle.

```python
from fuse.ui.panel import FusePanel, FusePanelGroup

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
    panel.update_view(acc.read("multiplayer_is_fp_view"))
```

`persist_position()` saves the current window position to whichever key matches the last seen view - call from `teardown()`.

`FusePanelGroup` fans out `enter_calibrate(stage)` / `enter_locked()` / `update_view(flag)` / `show_all()` / `hide_all()` / `destroy_all()` to a collection.

---

### Screen Capture

```python
from fuse.ui.screen_capture import grab_region_np

arr = grab_region_np((x1, y1, x2, y2))   # np.ndarray (H, W, 3) RGB uint8
```

Prefers `mss` (~3–8 ms), falls back to PIL `ImageGrab` (~20 ms). Thread-safe via thread-local `mss` instances.

---

### AnimationLoop

`root.after`-based animation helper with fps control and clean stop.

```python
from fuse.render.animation import AnimationLoop

loop = AnimationLoop(ctx.tk_root, self._tick_frame, fps=30)
loop.start()   # idempotent
loop.stop()    # cancels pending callback
```

Exceptions in the callback are caught per-frame and logged without stopping the loop.

---

### RiveAnimation

`ctypes` wrapper around `native/bin/rive_plugin.dll`. Each instance owns its own D3D11 WARP device + pixel buffer; renders a straight-alpha RGBA `PIL.Image` ready for `FusePanel.update()`.

```python
from fuse.render.rive_animation import RiveAnimation

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

### OCR

Tesseract-based screen-OCR utilities. No game-specific masks live here; callers supply regions.

```python
from fuse.vision.ocr import ocr_capture_int, IntHysteresisFilter, TESSERACT_OK

if TESSERACT_OK:
    val = ocr_capture_int(
        (x1, y1, x2, y2),
        min_val=0, max_val=9999,
        _filter=IntHysteresisFilter(jump_tol=12),
    )
```

`ocr_capture_int` tries multiple binarisation strategies (bright-text thresholds + Otsu), upscales 5x, and iterates PSM modes 7, 8, 13, 6 until a value in `[min_val, max_val]` is found. Returns `None` on failure.

**Filters**

- `TemporalOCRFilter(window=3, tolerance=0.10)` - sliding-window confirmation (≥2 agreeing reads).
- `IntHysteresisFilter(jump_tol=12)` - outliers must repeat before adoption.

---

### Fonts

```python
from fuse.ui.fonts import load_font, load_font_from_bytes, unload_mem_fonts

load_font("assets/MyFont.ttf")                                    # path-based (built-ins + dev)
load_font_from_bytes(ctx.assets.read("F.ttf"), key="myfont")      # .fuse-safe
```

`load_font_from_bytes` uses `AddFontMemResourceEx` - no temp file needed, works inside `.fuse` archives. The host calls `unload_mem_fonts()` on shutdown.

---

### Trajectory Replay

Replays timestamped mouse-delta trajectories with precise timing.

```python
from fuse.vision.trajectory_replay import replay_movements, replay_full_scenario

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

### Packing (`fuse.packaging.pack`)

```python
from fuse.packaging.pack import pack, verify

archive = pack("dev/my_plugin")    # → out/MyPlugin-1.0.fuse
verify(archive)                    # → bool
```

Excludes `__pycache__/`, `.git/`, `*.pyc/.pyo/.pyd`. `verify()` checks ZIP validity, single top-level directory, and that the embedded `manifest.json` has an `entry` field.

---

## FUSE Input API

`fuse.input.hardware_inject_router` - abstract mouse output for plugins that drive the cursor (e.g. guidance / trajectory replay). Backend is selected by config key `input_backend`: `"arduino" | "sendinput" | "none"`. Default is `"arduino"`.

```python
from fuse.input.hardware_inject_router import (
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

**Arduino backend** (`fuse/input/hardware_inject_arduino.py`)

Auto-detects COM ports by VID (Arduino / SparkFun / CH340). 5-byte packet protocol `[CMD:1][X:int16][Y:int16]` over serial at 115200 baud. Large deltas are chunked into 127-unit steps (HID mouse reports are signed 8-bit).

**SendInput backend** (`fuse/input/hardware_inject.py`)

Windows `SendInput` with `MOUSEEVENTF_MOVE`. Enables 1 ms timer granularity via `timeBeginPeriod(1)`. Requires Administrator privileges to drive elevated game windows (UIPI).

**Hardware** - Arduino HID firmware lives in `tools/arduino/mouse_hid/`. `tools/arduino/flash_leonardo.py` flashes a Pro Micro / Leonardo with the firmware.

---

## Host Lifecycle

1. **Boot** (`fuse/core/runner.py`)
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

## Plugin Manager

Press `Ctrl+M` to open a dark `tk.Toplevel` with three tabs (custom `clam` theme, `#1a1a1a` background).

- **Plugins** - list of every discovered plugin with state dot, version, author, and Enable/Disable toggle. Toggling at runtime tears down or re-instantiates the plugin without a host restart.
- **Settings** - per-plugin form generated from `ctx.config.schema([...])`. Widgets: checkbox (`bool`), validated Entry with min/max clamp (`int`/`float`), Combobox (`choice`), free Entry (`str`), read-only label (`position`). Edits buffer in a pending dict; unsaved changes block tab switching with a flash warning. Save commits via `PluginConfig.set()`; Discard rebuilds the form.
- **Keybindings** - registered hotkeys with action label + current combo. Click **Rebind**, press the new combo, and the binding updates live. The pynput listener is suspended during capture so host hotkeys do not fire.

---

## Built-in Plugins

Shipped under `fuse/plugins/`. Always loaded before user plugins.

---

### accessors

The primary FUSE game API. Connects to the Coherent Gameface CDP debugger (WebSocket on port 9222) and registers an `Accessors` instance as the `"accessors"` service. Polls `battle_hud` and `markers` pages each tick, merging all values into a single flat cache.

```json
{
  "plugin_id": "accessors",
  "name": "Accessors",
  "version": "1.0",
  "entry": "plugin:AccessorsPlugin"
}
```

Consumer usage:

```python
# In manifest.json: "dependencies": ["accessors"]

acc = ctx.services.require("accessors")   # → Accessors

def tick(self, dt):
    hp    = acc.read("multiplayer_vehicle_health")   # int | None
    fire  = acc.read("on_fire")                      # 1 | 0 | None
    ab1cd = acc.read("ab1_cd")                       # float seconds | None
```

Events emitted on `ctx.events`:

| Event | When |
|-------|------|
| `accessors.connected` | CDP WebSocket established |
| `accessors.disconnected` | CDP connection lost (will auto-retry) |

Config keys: `cdp_port` (default `9222`), `connect_timeout_s`, `reconnect_interval_s`, `poll_interval_s`.

#### Accessors Field Reference

All values return `None` when not in battle or the relevant HUD element is absent.

**Vehicle**

| Name | Type | Description |
|------|------|-------------|
| `multiplayer_vehicle_health` | `int` | Current HP |
| `multiplayer_vehicle_energy` | `int` | Ability mana (rounded) |
| `multiplayer_vehicle_boost` | `int` | Sprint energy 0–100 |
| `multiplayer_camera_zoom` | `int` | Active zoom stage index (0-based) |
| `multiplayer_is_fp_view` | `int` | 1 = first-person, 0 = third-person |
| `health_regen` | `float` | HP regen per second |
| `health_pct` | `float` | HP bar fill 0–100 |
| `energy_regen` | `float` | Mana regen per second |
| `boost_active` | `int` | 1 = boost glow visible |
| `zoom_val` | `float` | Active zoom magnification (e.g. 3.0, 10.0) |
| `zoom_idx` | `int` | Active zoom stage index |
| `num_zooms` | `int` | Total available zoom levels |
| `zooms` | `list[float]` | All zoom magnification values |
| `speed` | `int` | Vehicle speed km/h |

**Abilities (F / T keys)**

| Name | Type | Description |
|------|------|-------------|
| `ab1_state` | `int` | Ability 1 (F) state: 1=ready, 6=cooldown, 20=active |
| `ab1_cd` | `float` | Ability 1 cooldown remaining seconds (0 when ready) |
| `ab1_charges` | `int\|None` | Ability 1 charges available; `None` if not charge-based |
| `ab2_state` | `int` | Ability 2 (T) state |
| `ab2_cd` | `float` | Ability 2 cooldown remaining seconds |
| `ab2_charges` | `int\|None` | Ability 2 charges available |

**Ultimate (R key)**

| Name | Type | Description |
|------|------|-------------|
| `ult_state` | `int` | Ultimate state: 19=charging, 1=ready |
| `ult_charge_pct` | `int` | Ultimate charge 0–100% |

**Equipment (Q / E slots)**

| Name | Type | Description |
|------|------|-------------|
| `equip1_state` | `int` | Q-slot state: 1=ready, 6=cooldown |
| `equip1_cd` | `int` | Q-slot cooldown remaining seconds (rounded) |
| `equip1_charges` | `int\|None` | Q-slot charges; `None` if not charge-based |
| `equip2_state` | `int` | E-slot state |
| `equip2_cd` | `int` | E-slot cooldown remaining seconds |
| `equip2_charges` | `int\|None` | E-slot charges |

**Conditional Trait / Passive**

| Name | Type | Description |
|------|------|-------------|
| `trait_state` | `int` | Trait state (0=idle, non-zero=charging or active) |
| `trait_cur_time` | `float` | Current progress time within current state |
| `trait_time` | `float` | Total time for current state |
| `trait_type` | `str\|None` | Trait type identifier string |

**Rangefinder** (from `battle_hud`)

| Name | Type | Description |
|------|------|-------------|
| `target_dist` | `int\|None` | Distance to crosshair target in metres; retains last value when hidden |
| `target_dist_vis` | `int` | 1 = rangefinder currently visible (reticle on target), 0 = stale/hidden |

**ATGMs** (from `markers` page)

| Name | Type | Description |
|------|------|-------------|
| `missile_in_flight` | `int` | 1 = missile is airborne, 0 = no missile |
| `missile_dist` | `int\|None` | Distance from player to missile in metres (0–n); `None` when not in flight |

**Status Effects** (from `markers` page)

| Name | Type | Description |
|------|------|-------------|
| `on_fire` | `int` | 1 = burning debuff active |
| `debuff_count` | `int` | Number of active unique debuffs |
| `debuff_tags` | `list[str]` | Active debuff tag names (e.g. `["burning"]`) |
| `buff_count` | `int` | Number of active unique buffs |
| `buff_tags` | `list[str]` | Active buff tag names |
| `major_effect_count` | `int` | Active major visual effects (e.g. fire animation) |

**XP / Battle**

| Name | Type | Description |
|------|------|-------------|
| `xp_action` | `int\|None` | XP gained in last action popup (transient) |
| `xp_action_type` | `str\|None` | Action type of last XP event |
| `battle_state` | `int` | Battle phase state (8 = in progress) |
| `battle_countdown` | `int` | Battle timer seconds remaining |

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

See [RiveAnimation](#riveanimation) for the full API and [BUILD.md](BUILD.md) for build instructions.

---

### game_memory (deprecated)

> **Deprecated - do not use in new plugins.** `game_memory` reads a narrow set of values via a compiled native DLL (`game_memory.dll`) whose sources are not distributed. It is superseded by the `accessors` service which covers all the same fields plus many more through the Gameface CDP debugger. `game_memory` will be removed in future.

Opens the game process and registers a `GameMemory` instance as the `"game_memory"` service.

```python
# legacy usage - prefer "accessors" instead
mem = ctx.services.require("game_memory")
energy = mem.read("multiplayer_vehicle_energy")   # int | None
```

Config keys: `process_name` (default `"engine_launcher.exe"`), `reconnect_interval_s` (default `5.0`).

---

## Overlay Plugins - Technical Notes

User plugins shipped under `plugins/` as `.fuse` archives. For end-user configuration see [Plugins](#plugins).

### energy_bar

`EnergyBar-2.0.1.fuse` - see [Energy Bar](#energy-bar) for calibration and configuration details.

**Rive contract** (`assets/rive/energyBar.riv`)

- ViewModel `energyBarVM`
  - `energyValue` - float `0.0`–`1.0`
  - `colorProperty` - 32-bit ARGB color
  - `strokeWeight` - float (default `1.5`)
  - `rotation` - float (degrees)
  - `isSetupComplete` - bool (driven by calibration state)
  - `state` - string (`"CALIBRATING 3rd PERSON"` / `"CALIBRATING 1st PERSON"` / `"COMPLETE"`)
- State machine: `energyEngine`

**Dual-view calibration** - `calibration_stages = 2`. First `Ctrl+L` saves the 3rd-person bar position, second saves the 1st-person position. While locked, `panel.update_view(acc.read("multiplayer_is_fp_view"))` swaps positions automatically when the in-game view changes.

---

## Native DLLs

### rive_plugin.dll

Required by the `rive_animation` core plugin. Thin C ABI over [rive-runtime](https://github.com/rive-app/rive-runtime) (D3D11 with WARP fallback). Source: `native/rive_plugin/`.

**Build:** see [BUILD.md](BUILD.md).

**Quick rebuild:** `rebuild_dll.ps1` kills any python process holding the DLL and runs MSBuild against the existing VS solution.

**Exposed C ABI** (consumed by `fuse/render/rive_animation.py`):

- `rive_create(w, h)` / `rive_destroy(handle)`
- `rive_load_file(handle, path)` / `rive_load_bytes(handle, data, size)`
- State machine: `rive_set_state_machine`, `rive_sm_bool`, `rive_sm_number`, `rive_sm_trigger`
- ViewModel: `rive_vm_bind`, `rive_vm_set_{number,bool,string,color,enum}`, `rive_vm_trigger`, `rive_vm_get_{number,bool}`
- Rendering: `rive_advance(handle, dt)`, `rive_render(handle, pixel_buffer)`

### game_memory.dll

Required by the deprecated `game_memory` core plugin. Compiled native reader; sources are not distributed.

---

## Project Layout

```
HEAT_SACLOS/
├── fuse/                          # FUSE plugin framework
│   ├── core/                      # Runtime kernel
│   │   ├── api.py                 # FusePlugin, FuseContext, HotkeyRegistry
│   │   ├── config.py              # PluginConfig, ConfigManager
│   │   ├── discovery.py           # Folder + .fuse scanning, manifest parsing
│   │   ├── events.py              # EventBus
│   │   ├── host.py                # PluginHost - lifecycle, listeners, idle loop
│   │   ├── log.py                 # loguru session logging
│   │   ├── resolver.py            # Dependency resolution & topological sort
│   │   ├── runner.py              # CLI entry point
│   │   └── services.py            # ServiceRegistry
│   ├── ui/                        # Windowing, overlay, and UI helpers
│   │   ├── assets.py              # PluginAssets (.fuse-safe asset accessor)
│   │   ├── config_schema.py       # Declarative config schema
│   │   ├── fonts.py               # GDI font registration (path + in-memory)
│   │   ├── layered_window.py      # Win32 LayeredWindow
│   │   ├── manager.py             # Plugin Manager (Ctrl+M)
│   │   ├── panel.py               # FusePanel / FusePanelGroup
│   │   ├── screen_capture.py      # mss / PIL grab_region_np
│   │   └── window_utils.py        # Win32 window helpers
│   ├── render/                    # Animation and Rive rendering
│   │   ├── animation.py           # AnimationLoop
│   │   └── rive_animation.py      # ctypes wrapper around rive_plugin.dll
│   ├── input/                     # Mouse injection backends
│   │   ├── hardware_inject.py     # SendInput backend
│   │   ├── hardware_inject_arduino.py  # Arduino HID backend
│   │   └── hardware_inject_router.py   # Backend router (FUSE Input API)
│   ├── vision/                    # Game-state reading and computer vision
│   │   ├── accessors.py           # Accessors - CDP WebSocket reader (primary)
│   │   ├── game_memory.py         # GameMemory - ctypes wrapper (deprecated)
│   │   ├── ocr.py                 # Tesseract OCR helpers
│   │   ├── trajectory_replay.py   # Mouse trajectory replay
│   │   └── js/
│   │       ├── read_all.js        # IIFE executed in battle_hud CDP page
│   │       └── read_markers.js    # IIFE executed in markers CDP page
│   ├── packaging/                 # Archive tooling
│   │   ├── file_assoc.py          # HKCU registration for .fuse extension
│   │   └── pack.py                # pack() / verify() for .fuse archives
│   ├── plugins/                   # Built-in core plugins (folders)
│   │   ├── accessors/             # CDP game-state service (primary)
│   │   ├── game_memory/           # Native DLL game-state service (deprecated)
│   │   └── rive_animation/        # Rive animation factory service
│   └── utils/
│       └── paths.py               # Path resolution helpers
│
├── plugins/                       # User drop-in directory - place .fuse archives here
│   ├── EnergyBar-2.0.1.fuse
│   └── H.E.A.T.AILOSTORC-1.0.fuse
│
├── dev/                           # Plugin source trees (pack to .fuse before deploying)
│   └── energy_bar/
│
├── out/                           # Packed .fuse archives (output of pack())
│
├── native/                        # Native DLL plugins
│   ├── bin/
│   │   ├── rive_plugin.dll        # Rive runtime (see BUILD.md)
│   │   └── game_memory.dll        # Compiled game reader (deprecated; sources: private)
│   └── rive_plugin/
│       ├── rive_plugin.cpp
│       ├── rive_plugin.h
│       └── premake5.lua
│
├── assets/                        # Framework-wide assets
│   ├── NotoSans-VariableFont_wdth,wght.ttf
│   ├── NotoSans-Italic-VariableFont_wdth,wght.ttf
│   ├── logo.png
│   └── fuse_banner.png
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
├── untracked/                     # Dev/debug scripts (not shipped)
│   
│
├── logs/                          # Session logs (auto-created, gitignored)
│
├── run.bat                        # Windows launcher menu
├── run_heat_overlay.py            # FUSE overlay entry
├── rebuild_dll.ps1                # Rebuild rive_plugin.dll via MSBuild
├── BUILD.md                       # rive_plugin.dll build instructions
├── requirements.txt               # pynput, Pillow, pytesseract, numpy, mss, loguru, pyserial, websocket-client
└── README.md                      # This file
```
