# ![alt text](gh/fuse_banner.png)

# ![alt text](gh/logo.png) FUSE - an external modding runtime for WoT:HEAT

---

## Terms & Conditions

FUSE is licensed under the [GNU General Public License v3](./LICENSE) with the following additional terms and conditions. By using, modifying, or distributing FUSE, you agree to these terms.

### Permitted Use

- **Run** FUSE alongside WoT:HEAT to display real-time HUD overlays using game information accessible to the user during normal gameplay.
- **Develop, distribute, and share plugins** (`.fuse` archives) that build overlays, UI reskins, or visual enhancements consistent with the above.
- **Modify the FUSE source code** for personal or community use, provided all modifications remain under GPLv3 and the source is disclosed.
- **Redistribute** verbatim or modified copies of FUSE under the terms of GPLv3.

### Restrictions

- **No cheating.** You may not use FUSE, or any derivative thereof, or any separate package of the codebase to read, expose, or exploit game client information that would not normally be available to the user during legitimate gameplay in a way that provides an unfair advantage over other players.
- **No runtime injection or modification.** You may not use FUSE to inject code into, patch, hook, or otherwise alter the game's native runtime memory, processes, or binaries. Interaction with the game's Coherent Gameface frontend via the CDP is permitted for two purposes: (1) reading game values already visible to the user during legitimate gameplay, and (2) injecting CSS stylesheets or style overrides for cosmetic UI reskinning.
- **No automation or botting.** You may not use FUSE to automate gameplay actions in a manner that replaces human input for competitive advantage, including but not limited to auto-aim, auto-fire, or scripted decision-making.
- **No circumvention.** You may not use FUSE to bypass, disable, or interfere with any anti-cheat, integrity, or detection mechanism employed by the game or its operators.
- **No commercial exploitation of prohibited features.** You may not sell, license, or otherwise monetize any modification that violates the restrictions above.

### Prohibitions

The following are strictly prohibited and constitute a material breach of this license:

1. **Reverse-engineering** the game client to extract information not exposed through legitimate gameplay interfaces.
2. **Distributing** modified versions of FUSE that enable any of the restricted activities described above.
3. **Bundling** FUSE with, or advertising it alongside, tools whose primary purpose is cheating, hacking, or exploiting the game.
4. **Misrepresenting** FUSE as affiliated with, endorsed by, or approved by Wargaming or World of Tanks: HEAT.
5. **Removing or altering** the anti-abuse notices, license headers, or attribution present in the FUSE source code or documentation.

### Enforcement

Violations of these terms automatically terminate your rights under GPLv3 with respect to FUSE, including all patent grants and downstream licensing privileges. The copyright holders reserve the right to pursue legal remedies against violators.

---

![Static Badge](https://img.shields.io/badge/-BUILT_WITH-1D1D1D?style=for-the-badge&labelColor=1D1D1D&color=1D1D1D)
![Logo](https://img.shields.io/badge/-RIVE-f3f2f4?style=for-the-badge&logo=rive&logoColor=f3f2f4&labelColor=1D1D1D&color=1D1D1D)
![Logo](https://img.shields.io/badge/-NODE-f3f2f4?style=for-the-badge&logo=nodedotjs&logoColor=f3f2f4&labelColor=1D1D1D&color=1D1D1D)
![Logo](https://img.shields.io/badge/-TYPESCRIPT-f3f2f4?style=for-the-badge&logo=typescript&logoColor=f3f2f4&labelColor=1D1D1D&color=1D1D1D)
![Logo](https://img.shields.io/badge/-ELECTRON-f3f2f4?style=for-the-badge&logo=electron&logoColor=f3f2f4&labelColor=1D1D1D&color=1D1D1D)
![Logo](https://img.shields.io/badge/-VUE-f3f2f4?style=for-the-badge&logo=vue.js&logoColor=f3f2f4&labelColor=1D1D1D&color=1D1D1D)


![Static Badge](https://img.shields.io/badge/RUNTIME_VERSION-4.3.2-1D1D1D?style=for-the-badge&labelColor=1D1D1D&color=434343)
![Static Badge](https://img.shields.io/badge/LAUNCHER_VERSION-1.4.1-1D1D1D?style=for-the-badge&labelColor=1D1D1D&color=434343)

Get In Touch
[![Discord](https://img.shields.io/badge/-DISCORD-f3f2f4?style=for-the-badge&logo=discord&logoColor=f3f2f4&labelColor=1D1D1D&color=1D1D1D)](https://discord.com/users/678198830767931431)
---

## For Players

- [Getting Started](#getting-started)
- [Installing Plugins](#installing-plugins)
- [Overlay Editor](#overlay-editor)
- [Hotkeys](#hotkeys)
- [For Streamers](#for-streamers)
- [Shipped Plugins](#shipped-plugins)

> **Launch order matters:** enable FUSE in Settings before starting the game if this is your first time. Changes take effect only on a fresh game session.

---

## For Developers

- [Architecture](#architecture)
- [Plugin Contract](#plugin-contract)
- [Manifest](#manifest)
- [.fuse Archive Format](#fuse-archive-format)
- [Discovery & Load Order](#discovery--load-order)
- [Core APIs](#core-apis)
- [Overlays](#overlays)
- [Host Lifecycle](#host-lifecycle)
- [WebSocket Protocol](#websocket-protocol)
- [accessors Service](#accessors-service)
- [Project Layout](#project-layout)

---

# For Players

FUSE runs alongside WoT:HEAT and displays real-time HUD overlays driven by live game data: energy bars, stat cards, cooldown trackers, and more. Plugins are distributed as single `.fuse` files and managed from the FUSE launcher.

## Getting Started

1. Install FUSE using the latest installer in Releases.
2. Open the FUSE launcher.
3. Go to **Settings**, set your game instance and installation directory, and enable runtime under **Master Switch**. Important: path should resolve to the game's root directory (e.g., `C:\YourPath\HEAT`).
4. Start WoT:HEAT (or restart it if already running - the runtime requires a fresh game session).
5. Hit **Launch** in the FUSE launcher. Overlays will appear on screen.
6. Position your overlays in calibration mode (see [Overlay Editor](#overlay-editor)), then press `Ctrl+L` to lock.

Some overlays calibrate in two stages: first the 3rd-person position, then the 1st-person position. Each `Ctrl+L` press advances one stage.

> Overlays take ~4 seconds to update after entering a battle. This is normal - the game HUD is not present before that point.

> You may have to right-click the downloaded installer => properties => Unblock. This is because the installer is not digitally signed, so smart screen may silently prevent execution.

---

## Installing Plugins

### Manual way:

Drop any `.fuse` file into the `plugins/` folder inside the FUSE install directory. The launcher scans it automatically on every launch. Use the **HOME** tab in the launcher to enable or disable individual plugins, or configure via context menu next to toggle.

---

## Overlay Editor

While in calibration mode (`Ctrl+L`), the overlay stage works like a design tool:

- **Select** an overlay with left click. Selection shows a bounds outline and corner handles.
- **Drag** to reposition. Smart guides snap the overlay to edges and centers of other overlays and the screen. Hold `Alt` to disable snapping.
- **Resize** by dragging any corner handle. Hold `Shift` to preserve aspect ratio. Rive overlays have a fixed render size and cannot be resized.
- **Inspector panel** edits the selected overlay numerically: X/Y position, rotation, width/height, opacity. Quick actions rotate 90 degrees or flip. Alignment buttons snap to screen edges and centers. Drag its header to move the panel.
- **Grid**: toggle a visual grid, set its size, and switch snap mode between Smart, Grid, and Off in the inspector footer.
- **Deselect** with `Esc` or the inspector's close button.

Positions, rotation, and opacity persist per plugin and are restored on the next launch.

---

## Hotkeys

Active globally while FUSE is running.

| Combo | Action |
|-------|--------|
| `Ctrl+L` | Toggle calibrate/lock. Advances calibration stages for multi-stage overlays. |
| `Ctrl+I` | Toggle interactive mode. Overlays stay pinned but accept clicks and input. |
| `Ctrl+R` | Hot-reload all plugins from disk without restarting FUSE. |
| `Ctrl+P` | Quit FUSE. |

---

## For Streamers

FUSE overlays **cannot be captured with OBS Game Capture**. Game Capture hooks a game's DirectX swapchain, and the overlay stage is a Chromium window - OBS will tell you as much if you try. Instead FUSE serves the overlay stage over local HTTP so OBS can render it directly as a **Browser Source**, with real transparency and no screen capture involved.

### Adding the Browser Source

1. Launch FUSE and lock your overlays with `Ctrl+L`. The **OBS button** appears next to **Launch** once everything is locked.
2. Click the OBS button. A notification confirms once the URL is in your clipboard.
   - **One monitor:** the URL is copied straight away.
   - **Multiple monitors:** the button expands into one button per monitor. Hover to see each monitor's size, then click the one you play on and where your overlays are.
3. In OBS: **Sources => + => Browser**, then name it whatever (e.g. `FUSE Overlays`).
4. Paste the URL into **URL** input field.
5. **Set Width and Height to the size shown in that monitor's tooltip.** This is the step that matters most - see below.
6. Click **OK**, then drag the source above your game capture layer in the scene.

Keep your existing Game Capture or Display Capture for the game itself. The Browser Source carries only the overlays, composited on top.

### Setting the size correctly

The Browser Source size must match the monitor you selected, or overlays will sit outside the captured frame and the source will look empty. OBS defaults to 800x600, which is almost never right.

Use the numbers from the monitor button's tooltip as a hint. FUSE positions overlays in the same scaled units, so the tooltip already gives you the right numbers.

Once the source is the right size, scale or reposition it freely inside your scene - that only affects the composite, not the capture.

### Day to day

The URL is static. It does not change when you restart FUSE, restart the game, or reboot - set the source up once and leave it. If FUSE stops, the source goes blank and reconnects on its own when FUSE comes back, with no action needed in OBS.


### Troubleshooting

| Symptom | Cause and fix |
|---------|---------------|
| Source is blank, but the URL works in a web browser | Width/Height don't match the monitor. Set them to the tooltip values. Or the values you believe your monitor size to be. |
| Source is blank and shows nothing anywhere | FUSE isn't running, or overlays aren't locked yet. Press `Ctrl+L` until the launcher shows **Locked**. |
| Wrong monitor's overlays, or overlays cut off | The URL is for a different monitor. Click the OBS button again and pick the right one. |
| Overlays stuck on old values after a FUSE restart | Right-click the source → **Refresh cache of current page**. Only needed if the self-reconnect doesn't recover within a few seconds. |
| Overlays visible in-game but not in the source | The OBS button hands out a per-monitor URL. If you moved the game to another monitor, re-copy the URL for that one. |

> **Advanced:** appending `?display=all` to the URL broadcasts the entire virtual desktop instead of a single monitor. Size the source to the combined bounding box of all your displays.

---

## Shipped Plugins

| Plugin | What it does |
|--------|--------------|
| **EnergyBar** | Animated Rive energy bar tracking vehicle energy. Separate 3rd-person and 1st-person positions, switches automatically on zoom. |
| **HEATStats** | Per-match performance tracking with an in-game stats card: win rate, K/D, total kills, recent battle streak. |
| **Combat Reboot Plus** | Tracks the XM1-90's PDU-1546S module status with a segmented charge bar. |
| **Cruise Control** | Simple cruise control functionality. |
| **No UI** | Hides individual game UI elements. |
| **FUSE UI** | Shared component library used by other plugins. No visible overlay of its own. |
| **Accessors** | Core service. Reads live game values for every other plugin. Always enabled. |

Per-plugin settings live in the launcher's **Plugins** tab. Position keys (type `position`) are set by dragging in the overlay editor, not typed by hand.

---

# For Developers

FUSE is a three-process system:

- **Launcher** (Electron + Vue): the control app. Plugin management, settings, marketplace.
- **Runtime** (Node sidecar): the plugin host. Discovers and runs `.fuse` plugins, owns global hotkeys, serves the WebSocket protocol and overlay assets.
- **Overlay stage** (transparent Electron window): renders overlays on top of the game. Click-through except over overlay content and editor UI.

Plugins are TypeScript classes bundled into single-file `.fuse` archives. They declare overlays (Rive animations or Vue components), read game state through the `accessors` service, and persist config as JSON.

## Architecture

```
┌────────────────────┐   WS (role: control)   ┌─────────────────────────────┐
│  Launcher          │◄──────────────────────►│  Runtime (Node sidecar)     │
│  Electron + Vue    │                        │  FuseHost                   │
└────────────────────┘                        │  ├ WsServer (WS + HTTP)     │
┌────────────────────┐   WS (role: overlay)   │  ├ OverlayHub               │
│  Overlay stage     │◄──────────────────────►│  ├ EventBus / Services      │
│  transparent window│   /overlay-asset/*     │  ├ ConfigManager            │
└────────────────────┘                        │  └ Plugin A, B, C ...       │
                                              └─────────────────────────────┘
```

The runtime binds a WebSocket server to `127.0.0.1` on a free port and prints `{ port, connectionToken }` to stdout. Electron spawns it, parses the handshake line, and passes connection params to both windows. Clients authenticate with the token and declare a role: `control` (launcher UI) or `overlay` (stage window).

The host runs a state machine with three states: `calibrate` (overlays draggable/editable), `locked` (click-through, positions frozen), and `interactive` (overlays pinned but clickable). Plugins tick every ~50 ms.

---

## Plugin Contract

Every plugin subclasses `FusePlugin` from `@fuse/plugin-sdk` and receives a `FuseContext` in `setup()`.

```ts
import { FusePlugin, type FuseContext } from "@fuse/plugin-sdk";

export class MyPlugin extends FusePlugin {
  static override pluginName = "My Plugin";
  static override version = "1.0.0";
  static override requiresCalibration = true;
  static override calibrationStages = 1;   // 2+ for multi-pass calibration

  private ctx!: FuseContext;

  override setup(ctx: FuseContext): void {
    this.ctx = ctx;
  }

  override tick(dt: number): void {}
  override enterCalibrate(stage = 1): void {}
  override enterLocked(): void {}
  override enterInteractive(): void {}
  override setOverlayVisible(visible: boolean): void {}
  override teardown(): void {}
}
```

### Lifecycle Hooks

| Hook | Called When |
|------|-------------|
| `setup(ctx)` | Once after instantiation. Declare overlays, load config, register hotkeys, consume services. May be async. |
| `tick(dt)` | Every ~50 ms from the host tick loop. `dt` is seconds since last tick. |
| `enterCalibrate(stage)` | Entering calibrate mode or advancing a stage. `stage` is 1-based. |
| `enterLocked()` | Final `Ctrl+L` press. Positions are persisted, overlays go click-through. |
| `enterInteractive()` | `Ctrl+I` pressed. Overlays stay pinned but receive pointer input. |
| `setOverlayVisible(v)` | Game focus changed. Show or hide overlays accordingly. |
| `teardown()` | On shutdown or hot reload. Persist state, release resources. |

### Static Attributes

- `requiresCalibration` - `true` blocks the setup queue until the user locks the plugin with `Ctrl+L`.
- `calibrationStages` - number of `Ctrl+L` presses to complete calibration. Default `1`. Set `2` for 3rd-person + 1st-person passes.

---

## Manifest

Each plugin ships a `manifest.json` at the package root:

```json
{
  "plugin_id": "my_plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "author": "AETERNAL",
  "description": "What it does.",
  "entry": "plugin:MyPlugin",
  "runtime": "node",
  "min_host_version": "4.0.0",
  "dependencies": ["accessors"],
  "hotkeys": { "toggle": "ctrl+t" },
  "default_config": { "opacity": 200 }
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `plugin_id` | yes | Programmatic identifier used for config files, deps, enable/disable. Must match the archive's top-level directory name. |
| `name` | yes | Display name shown in UI and logs. |
| `version` | yes | Semver string. |
| `entry` | yes | `"module:ClassName"`. Module is the source file bundled as the plugin entry. |
| `runtime` | yes | `"node"`. |
| `author` | no | Shown in the launcher's Plugins tab. |
| `description` | no | Short human-readable summary. |
| `core` | no | `true` marks a core plugin. Core plugins load before user plugins. |
| `min_host_version` | no | Minimum runtime version (current: `4.3.0`). Incompatible plugins are skipped. |
| `dependencies` | no | Required plugin ids. Providers load before consumers. |
| `optional_dependencies` | no | Soft load-order hints; missing plugins do not block loading. |
| `hotkeys` | no | `{"logical_name": "combo"}` combos exposed via `ctx.hotkeyFor()`. |
| `default_config` | no | Default values for `ctx.config`. |

---

## .fuse Archive Format

A `.fuse` file is a ZIP with a single top-level directory named after `plugin_id`:

```
MyPlugin-1.0.0.fuse  (ZIP)
└── my_plugin/
    ├── manifest.json
    ├── plugin.js          # esbuild bundle of the entry module
    └── assets/
        └── overlay.riv
```

On discovery the archive is extracted to `data/plugins-cache/<plugin_id>-<checksum>/` and the entry class is loaded via dynamic `import()`. The extracted directory doubles as the asset root, served over HTTP at `/overlay-asset/<plugin_id>/<path>`.

**Packing.** Plugin sources live in `plugins-src/<plugin_id>/`. From `frontend/fuse`:

```
npm run pack:plugins
```

This runs `runtime/scripts/pack-plugins.mjs`, which esbuild-bundles each plugin's entry (aliasing `@fuse/plugin-sdk` to the runtime SDK source), zips the result with its manifest and assets, and writes `plugins-dist/<Name>-<version>.fuse`.

---

## Discovery & Load Order

The runtime scans a single directory for `.fuse` archives: `FUSE_USER_PLUGINS_DIR` env var in production, `<repo>/plugins` in dev. Then the resolver applies:

1. **Enable/disable filter** - `fuse_host.json` `disabled_plugins` excludes; a non-null `enabled_plugins` acts as a whitelist.
2. **Compatibility check** - `min_host_version` vs the runtime's `HOST_VERSION`. Incompatible plugins are skipped.
3. **Dependency filter** - missing required deps drop the dependent plugin.
4. **Core-first ordering** - `"core": true` plugins load before user plugins.
5. **Topological sort** - required deps are hard edges; optional deps are soft edges.
6. **Cycle detection** - cyclic dependencies are dropped with an error log.

Plugins initialize one at a time, in order, starting when the first control client connects. A plugin with `requiresCalibration` blocks the queue until locked.

---

## Core APIs

### FuseContext

Handed to every plugin in `setup()`. Bundles all shared infrastructure so plugins never create global state.

```ts
interface FuseContext {
  config: PluginConfig;              // per-plugin persisted JSON config
  hotkeys: HotkeyRegistryView;       // global hotkey registration
  assets: PluginAssets;              // file access inside the extracted archive
  services: ServiceRegistry;         // named inter-plugin APIs
  events: EventBus;                  // pub/sub between plugins
  overlays: OverlayManager;          // declare and control overlays
  host: HostView;                    // state, getPlugin, getService, broadcast
  logger: Logger;                    // scoped logger

  state: HostState;                  // "calibrate" | "locked" | "interactive"
  packageRoot: string;               // extracted archive root
  manifestHotkeys: Record<string, string>;
  extras: Map<string, unknown>;      // plugin-private scratch space

  hotkeyFor(name: string, fallback?: string): string;
}
```

### PluginConfig

Per-plugin JSON config with watchers and a declarative schema that drives the launcher's settings UI.

```ts
ctx.config.get<number>("opacity", 200);
ctx.config.set("opacity", 180);          // persists + fires watchers
ctx.config.watch("opacity", (v) => { ... });
ctx.config.snapshot();                    // full dict

ctx.config.schema([
  new ConfigCategory("Display", [
    new ConfigEntry({ key: "opacity", label: "Opacity", type: "int", min: 0, max: 255 }),
    new ConfigEntry({ key: "theme", label: "Theme", type: "choice", choices: ["dark", "light"] }),
  ]),
]);
```

Entry types: `bool`, `int`, `float`, `str`, `choice`, `position`. `int`/`float` are clamped to `min`/`max` on `set()`. `position` entries are written by the overlay editor, not typed by hand. Files live in `data/configs/fuse_<plugin_id>.json`.

### EventBus

Fire-and-forget pub/sub. Handler exceptions are caught and logged without affecting other subscribers.

```ts
ctx.events.subscribe("accessors.connected", () => { ... });
ctx.events.emit("my_plugin.something", { value: 1 });
```

### ServiceRegistry

Named object registry for inter-plugin APIs. Because providers load before consumers, `require()` is safe inside a consumer's `setup()`.

```ts
ctx.services.register("my_service", impl);
const acc = ctx.services.require<Accessors>("accessors");  // throws if missing
const maybe = ctx.services.get("optional_service");        // undefined if missing
```

### Hotkeys

The runtime owns one global keyboard hook (uiohook). Plugins register combos; rebinding from the launcher updates bindings live.

```ts
ctx.hotkeys.register("ctrl+t", () => this.toggle(), "Toggle My Overlay");
ctx.hotkeys.register(ctx.hotkeyFor("toggle", "ctrl+t"), cb, "Toggle");
```

Combos are `modifier+modifier+key` with `ctrl`, `shift`, `alt`. Case-insensitive.

### PluginAssets

Reads files from the extracted archive. Use this instead of raw path arithmetic.

```ts
const bytes = ctx.assets.read("assets/overlay.riv");
const exists = ctx.assets.exists("assets/optional.json");
```

---

## Overlays

Plugins declare overlays; the stage window renders them. Two kinds:

- **`rive`** - a `.riv` animation rendered with the Rive web runtime. Sized by its declaration; not resizable in the editor.
- **`vue`** - a Vue SFC compiled at runtime in the stage (vue3-sfc-loader). Resizable, can be interactive.

```ts
const overlay = ctx.overlays.declare({
  id: "bar",
  kind: "rive",
  asset: "assets/energyBar.riv",
  size: { w: 300, h: 300 },
  artboard: "Bar",
  stateMachine: "engine",
  viewModel: "energyBarVM",
  defaultRect: { x: 100, y: 100, w: 300, h: 300 },
  positionConfigKey: "bar_custom_pos",   // rect persists under this config key
});
```

### OverlayHandle

```ts
overlay.set("energyValue", 0.42);        // number input
overlay.setBool("isSetupComplete", true);
overlay.setString("state", "COMPLETE");
overlay.setColor("colorProperty", 0xFF84FFB1);  // 32-bit ARGB
overlay.setEnum("mode", "battle");
overlay.trigger("flash");
overlay.setJson("rows", [...]);          // structured props for Vue overlays
overlay.setRect({ x, y, w, h });         // reposition (rot/opacity optional)
overlay.setVisible(false);
overlay.onAction((action, payload) => { ... });  // Vue overlay buttons/inputs
overlay.remove();
```

Input updates are coalesced into one message per overlay per flush. Non-trigger values are retained and replayed to a stage window that connects later.

### Rect

Position in device-independent pixels, absolute in display space. `x`/`y` are the unrotated top-left; rotation is applied about the center.

```ts
interface Rect {
  x: number; y: number; w: number; h: number;
  rot?: number;      // clockwise degrees [0, 360), default 0
  opacity?: number;  // 0..1, default 1
}
```

Rects edited in the overlay editor (drag, resize, inspector) are sanitized by the runtime, persisted under `positionConfigKey` in the plugin's config, and echoed back to all stage clients. A plugin `setRect` with a bare `{x,y,w,h}` keeps the user's saved rotation and opacity; pass `rot: 0` or `opacity: 1` explicitly to reset them.

### Vue Overlays

The stage mounts the SFC with these props:

```ts
{
  data: Record<string, unknown>,   // inputs pushed via handle.set*/setJson
  state: HostState,
  interactive: boolean,            // true in interactive mode
  emitAction: (action: string, payload?: unknown) => void,
}
```

Imports available inside overlay SFCs:

- `vue`, `motion-v`, `@rive-app/canvas` - provided by the stage bundle.
- `<pluginId>/<path>` - cross-plugin imports fetched from that plugin's assets. The `fuse_ui` plugin ships shared components this way: declare `"dependencies": ["fuse_ui"]` and `import { eButton } from "@fuse/ui"` or `import "fuse_ui/ui/tokens.css"` for design tokens.
- Relative imports and CSS work as expected; stylesheets are injected once.

Overlay roots should fill the wrapper (`width: 100%; height: 100%`) and scale their content, since users resize them freely in the editor. Use opaque backgrounds; the wrapper's opacity control owns transparency.

---

## Host Lifecycle

1. **Boot** (`runtime/src/index.ts`) - starts `WsServer`, prints the `{ port, connectionToken }` handshake line to stdout, loads plugins. Exits when Electron's stdin pipe closes (orphan guard).
2. **Plugin init** - begins when the first authenticated control client connects. Plugins initialize sequentially in dependency order; calibration-requiring plugins block the queue until locked.
3. **Tick loop** - `tick(dt)` on every active plugin every ~50 ms. Per-plugin exceptions are caught and logged; one plugin cannot kill the host.
4. **Hot reload** (`Ctrl+R`) - tears down all plugins in reverse order, re-discovers archives, re-instantiates everything in the current host state.
5. **Shutdown** (`Ctrl+P` or launcher exit) - `teardown()` in reverse load order, then the process exits.

---

## WebSocket Protocol

Single WS endpoint at `ws://127.0.0.1:<port>/ws`. First message must be `{ type: "auth", token, role }` within 5 s. Roles: `control`, `overlay`.

**Runtime to control:** `plugin:registered`, `plugin:status_changed`, `config:value_changed`, `hotkey:rebound`, `host:state_changed`.

**Runtime to overlay:** `overlay:declared`, `overlay:data`, `overlay:transform`, `overlay:visibility`, `overlay:removed`, `host:state_changed`.

**Overlay to runtime:** `overlay:transform` (editor commits a rect), `overlay:action` (interactive overlay event).

**Control to runtime (JSON-RPC 2.0):** `config.update`, `plugin.setEnabled`, `hotkey.rebind`, `overlay.setVisible`.

HTTP on the same port: `/health`, `GET /overlay-asset/<pluginId>/<path>`.

---

## accessors Service

The primary game API. Connects to the game's Coherent Gameface CDP debugger (port `9222`), polls the HUD pages, and merges all values into a flat cache.

```ts
// manifest.json: "dependencies": ["accessors"]
const acc = ctx.services.require<Accessors>("accessors");

override tick(dt: number): void {
  const hp = acc.read("health");        // number | null
  const fp = acc.read("is_fp");         // 1 | 0 | null
}
```

Events on `ctx.events`: `accessors.connected`, `accessors.disconnected` (auto-retries).

Config keys: `cdp_port` (default `9222`), `connect_timeout_s`, `reconnect_interval_s`, `poll_interval_s`.

All values return `null` when not in battle or the HUD element is absent.

**Vehicle**

| Name | Type | Description |
|------|------|-------------|
| `health` | `int` | Current HP |
| `health_regen` | `float` | HP regen per second |
| `health_pct` | `float` | HP bar fill 0-100 |
| `energy` | `int` | Ability mana (rounded) |
| `energy_regen` | `float` | Mana regen per second |
| `boost` | `int` | Sprint energy 0-100 |
| `boost_active` | `int` | 1 = boost glow visible |
| `speed` | `int` | Vehicle speed km/h |
| `is_fp` | `int` | 1 = first-person, 0 = third-person |
| `zoom_val` | `float` | Active zoom magnification |
| `zoom_idx` | `int` | Active zoom stage index (0-based) |
| `num_zooms` | `int` | Total available zoom levels |
| `zooms` | `list[float]` | All zoom magnification values |

**Abilities and Equipment**

| Name | Type | Description |
|------|------|-------------|
| `ab1_state` / `ab2_state` | `int` | Ability (F / T) state: 1=ready, 6=cooldown, 20=active |
| `ab1_cd` / `ab2_cd` | `float` | Cooldown remaining seconds (0 when ready) |
| `ab1_charges` / `ab2_charges` | `int\|null` | Charges; `null` if not charge-based |
| `equip1_state` / `equip2_state` | `int` | Equipment (Q / E) state |
| `equip1_cd` / `equip2_cd` | `int` | Cooldown remaining seconds |
| `equip1_charges` / `equip2_charges` | `int\|null` | Charges; `null` if not charge-based |
| `ult_state` | `int` | Ultimate: 19=charging, 1=ready |
| `ult_charge_pct` | `int` | Ultimate charge 0-100 |
| `trait_state` | `int` | Trait state (0=idle, non-zero=charging or active) |
| `trait_cur_time` / `trait_time` | `float` | Trait progress / total time |
| `trait_type` | `str\|null` | Trait type identifier |

**Battle**

| Name | Type | Description |
|------|------|-------------|
| `battle_state` | `int` | Battle phase state (8 = in progress) |
| `battle_countdown` | `int` | Battle timer seconds remaining |
| `game_mode` | `str` | Current game mode |
| `match_state` | `str` | Match state identifier |
| `map_slug` | `str` | Map identifier |
| `ally_score` / `enemy_score` | `int` | Team scores |
| `allied_zones` / `enemy_zones` | `int` | Captured zones |
| `target_dist` | `int\|null` | Distance to crosshair target in metres |
| `target_dist_vis` | `int` | 1 = rangefinder currently visible |
| `xp_action` | `int\|null` | XP gained in last action popup (transient) |
| `xp_action_type` | `str\|null` | Action type of last XP event |
| `fps` / `ping` | `int` | Client performance counters |

**Player**

| Name | Type | Description |
|------|------|-------------|
| `player_name` | `str` | Player name |
| `player_kills` / `player_assists` / `player_damage` | `int` | Score line |
| `player_role` / `player_role_pts` | `str` / `int` | Role and role points |
| `player_vehicle` / `player_agent_id` | `str` | Vehicle and agent ids |
| `player_is_dead` | `int` | 1 = destroyed |

**Status Effects** (markers page)

| Name | Type | Description |
|------|------|-------------|
| `on_fire` | `int` | 1 = burning debuff active |
| `debuff_count` / `debuff_tags` | `int` / `list[str]` | Active debuffs |
| `buff_count` / `buff_tags` | `int` / `list[str]` | Active buffs |
| `major_effect_count` | `int` | Active major visual effects |
| `missile_in_flight` | `int` | 1 = ATGM airborne |
| `missile_dist` | `int\|null` | Player-to-missile distance in metres |

Legacy aliases remain readable for old plugins: `multiplayer_vehicle_health`, `multiplayer_vehicle_energy`, `multiplayer_vehicle_boost`, `multiplayer_camera_zoom`, `multiplayer_is_fp_view`.

---