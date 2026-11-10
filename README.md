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


![Static Badge](https://img.shields.io/badge/RUNTIME_VERSION-5.1.0-1D1D1D?style=for-the-badge&labelColor=1D1D1D&color=434343)
![Static Badge](https://img.shields.io/badge/LAUNCHER_VERSION-3.0.0-1D1D1D?style=for-the-badge&labelColor=1D1D1D&color=434343)

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
- [Plugin Processes](#plugin-processes)
- [Plugin Contract](#plugin-contract)
- [Manifest](#manifest)
- [Permissions](#permissions)
- [.fuse Archive Format](#fuse-archive-format)
- [Discovery & Load Order](#discovery--load-order)
- [Core APIs](#core-apis)
- [Overlays](#overlays)
- [Host Lifecycle](#host-lifecycle)
- [WebSocket Protocol](#websocket-protocol)
- [accessors Service](#accessors-service)
- [Developing Plugins](#developing-plugins)
- [Project Layout](#project-layout)

---

# For Players

FUSE runs alongside WoT:HEAT and displays real-time HUD overlays driven by live game data: energy bars, stat cards, cooldown trackers, and more. Plugins are distributed as single `.fuse` files and managed from the FUSE launcher.

[![Watch the FUSE demo on YouTube](https://img.youtube.com/vi/T4n21eZ9uuY/maxresdefault.jpg)](https://www.youtube.com/watch?v=T4n21eZ9uuY)
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

## Apps

Some plugins are apps: tools that open in a window on the stage. An app window takes clicks at any time. It does not need interactive mode.

- **Console**: press `Ctrl+Space`. Type the name or the alias of an app, then press `Enter`. `Esc` closes the console and gives the keyboard back to the game.
- **Taskbar**: a bar on one edge of the main display. It has Start (opens the console), the pinned and open apps, and Show desktop. A hidden taskbar stays at 50% opacity. Move the cursor to its edge or onto it to show it.
- **Windows**: drag the title bar to move a window, and drag an edge to resize it. Double-click the title bar to maximize or restore the window. Drag a window to the top edge to maximize it, or to a side edge to fill that half of the display.
- **Actions**: right-click an app in the console, or select it and press `Ctrl+K`. The actions are favorite, pin to the taskbar, close all windows and quit. **Configure Command** sets an alias or a launch hotkey.
- **Settings > Apps** in the launcher sets the taskbar edge, the auto-hide and the console hotkey.

| Console key | Action |
|---|---|
| `Up`, `Down` | Select an app |
| `Enter` | Open the app |
| `Ctrl+K` | Show the actions of the app |
| `Ctrl+Shift+F` | Add the app to Favorites, or remove it |
| `Ctrl+Shift+Up`, `Ctrl+Shift+Down` | Move a favorite up or down |
| `Ctrl+Shift+,` | Configure Command |
| `Esc` | Close the actions, clear the search, or close the console |

A window has the keyboard after you click it. The game gets no keys while a window has the keyboard. Click the game to give the game the keyboard again.

An app-only plugin starts when you open its app, and stops about 10 s after its last window closes. Its plugin card shows "Starts with its app". OBS browser sources show the app windows, but not the taskbar and the console.

---

## Hotkeys

Active globally while FUSE is running.

| Combo | Action |
|-------|--------|
| `Ctrl+L` | Toggle calibrate/lock. Advances calibration stages for multi-stage overlays. |
| `Ctrl+I` | Toggle interactive mode. Overlays stay pinned but accept clicks and input. |
| `Ctrl+Space` | Open or close the [app console](#apps). Change it in **Settings > Apps**. |
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

FUSE has four kinds of process:

- **Launcher** (Electron main + Vue App): the control app. It manages plugins, settings, the marketplace, permission decisions and secrets.
- **Runtime** (Node sidecar): the plugin host. It discovers `.fuse` plugins and starts one process for each plugin. It owns the global hotkeys and serves the WebSocket protocol and the overlay files.
- **Plugin processes**: each plugin runs in its own Node process under the Node permission model. A plugin gets only the access that its manifest declares and the user allows.
- **Overlay stage** (transparent Electron window): draws the overlays on top of the game. It is click-through except over overlay content and editor UI. OBS browser sources get a receive-only copy of the stage.

Plugins are TypeScript classes bundled into single-file `.fuse` archives. They declare overlays (Rive animations or Vue components), read game state through the `accessors` service, and keep their config as JSON.

## Architecture

```
┌─────────────────────┐               ┌──────────────────────────────┐     ┌──────────────────┐
│ FUSE App (Vue)      │◄─────────────►│ Runtime (Node sidecar)       │◄───►│ Plugin process A │
├─────────────────────┤  WS control   │ FuseHost                     │◄───►│ Plugin process B │
│ Electron main       │◄─────────────►│ ├ WsServer (WS + HTTP)       │◄───►│ Plugin process C │
│ consent, secrets    │  IPC          │ ├ OverlayHub + inspector     │ IPC └──────────────────┘
└─────────────────────┘               │ ├ ServiceHub + EventBus      │
┌─────────────────────┐               │ ├ PermissionManager          │
│ Overlay stage       │◄─────────────►│ ├ Storage, audio, notices    │
└─────────────────────┘  WS + HTTP    │ ├ ConfigManager              │
┌─────────────────────┐               │ └ HotkeyRegistry (uiohook)   │
│ OBS browser source  │◄──────────────│                              │
└─────────────────────┘  WS view      └──────────────────────────────┘
```

Electron main spawns the runtime. The runtime binds a WebSocket server to `127.0.0.1` on a free port and prints one line to stdout: `{ port, connectionToken, stageToken, obsToken }`. The token that a client sends decides its role:

| Token | Role | Client | Can |
|---|---|---|---|
| `connectionToken` | `control` | The FUSE App | Call JSON-RPC methods. Receive plugin, config and hotkey events. |
| `stageToken` | `stage` | The Electron stage window | Receive overlay messages. Send transforms, overlay actions and inspector changes. |
| `obsToken` | `view` | An OBS browser source | Receive overlay messages only. |

Electron main also keeps an IPC channel to the runtime. The runtime uses it for permission decisions, the consent card, secrets and links. It also carries `fuse://plugin/...` callbacks, the sites that overlays may frame, and the stage performance meter.

The host has three states: `calibrate` (the user drags and edits overlays), `locked` (click-through, positions frozen), and `interactive` (overlays pinned but clickable). Plugins tick every ~50 ms.

---

## Plugin Processes

The runtime never imports plugin code. For each plugin it forks `plugin-host.js` (`runtime/src/plugin-host/main.ts`). That process imports the plugin's entry module, builds its `FuseContext`, and talks to the runtime over Node IPC.

- **Sandbox.** The process starts with `--permission`. It can read only its own package folder and the folder of the plugin bootstrap. Each granted process scope adds a Node flag (see [Permissions](#permissions)). The environment holds only a short allowlist (`PATH`, `TEMP`, `SystemRoot`, `FUSE_CDP_PORT` and a few more).
- **Node binary.** Plugins run on the Node that the App ships (`FUSE_PLUGIN_NODE`, v26). Node 25 and later has `--allow-net`, so the runtime can deny network access to each plugin. On an older Node the runtime cannot block network access and shows a warning.
- **Context.** Reads on `ctx` come from local copies that the runtime keeps current. Writes go to the runtime as messages. Everything that crosses the boundary is JSON: functions and class instances do not survive.
- **Isolation.** An exception or a crash stops one plugin only. The runtime then releases the plugin's overlays, hotkeys, services, sounds and storage handle.

| Limit | Value | Result |
|---|---|---|
| Process start | 15 s | Plugin state `error` |
| `setup()` | 30 s | Plugin state `error` |
| `teardown()` | 3 s | The runtime kills the process |
| Service call | 10 s | The call rejects |
| Heartbeat (a ping each second) | No answer for 20 s | The runtime kills the process |

**Crashes.** After an unexpected exit, the runtime restarts the plugin after 2 s, then 4 s, then 6 s. After more than 3 exits in 2 minutes, the plugin stays stopped and an error notification shows. Enable the plugin again in the App to reset the count. A crash gets no `teardown()`.

**Resources.** Each second the runtime measures the RAM and CPU of each plugin process. The stage info bar shows them with the heartbeat time and the storage size. A plugin that uses half a CPU core for 30 s gets a warning. A plugin that uses 1 GB of RAM also gets a warning. Each warning shows once for each plugin in a session. The runtime never stops a plugin for its resource use.

---

## Plugin Contract

Every plugin subclasses `FusePlugin` from `@fuse/plugin-sdk` and receives a `FuseContext` in `setup()`.

```ts
import { FusePlugin, type FuseContext, type TeardownReason } from "@fuse/plugin-sdk";

export class MyPlugin extends FusePlugin {
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
  override teardown(reason?: TeardownReason): void {}
}
```

The manifest supplies the name, version and description. The loader writes them to the static `pluginName`, `version` and `description` of the class. The loader finds the class by the manifest `entry`. It checks the inherited `isFusePlugin` flag, not `instanceof`, because each bundle carries its own copy of the SDK.

### Lifecycle Hooks

| Hook | Called When |
|------|-------------|
| `setup(ctx)` | Once after the process loads the class. Declare overlays, load config, register hotkeys, and share or consume services. May be async. |
| `tick(dt)` | Every ~50 ms from the host tick loop. `dt` is seconds since the last tick. |
| `enterCalibrate(stage)` | Entering calibrate mode or advancing a stage. `stage` starts at 1. |
| `enterLocked()` | The last `Ctrl+L` press. The runtime saves positions, and overlays go click-through. |
| `enterInteractive()` | `Ctrl+I` pressed. Overlays stay pinned but receive pointer input. |
| `setOverlayVisible(v)` | Game focus changed. Show or hide overlays. |
| `teardown(reason)` | `"disable"`, `"restart"` (hot reload, a permission change, a moved game folder) or `"shutdown"`. Save state and release resources. |

### Static Attributes

- `requiresCalibration` - `true` holds the setup queue on this plugin until the user locks it with `Ctrl+L`. An auto-lock launch and a hot reload skip this step.
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
  "min_host_version": "5.0.0",
  "dependencies": ["accessors"],
  "permissions": {
    "network": { "reason": "Loads your match history." },
    "storage": { "reason": "Keeps your matches on this PC." }
  },
  "hotkeys": { "toggle": "ctrl+t" },
  "default_config": { "opacity": 200 }
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `plugin_id` | yes | Identifier for config files, dependencies and enable/disable. Must match the archive's top-level folder. When they differ, the folder name wins. |
| `name` | yes | Display name shown in UI and logs. |
| `version` | yes | Semver string. |
| `entry` | yes, without `override` | `"module:ClassName"`. The module is the bundled entry file. An override plugin has no entry. |
| `override` | no | Prebuilt game file changes: `{ "format": 1, "presets": [{ "id", "name", "dir" }], "default": null }`. A plugin with `override` and `entry` is a hybrid plugin. |
| `runtime` | yes, with `entry` | `"node"`. |
| `author` | no | Shown in the App's Plugins tab. |
| `description` | no | Short summary. |
| `homepage`, `tags` | no | Sent to the App with the plugin list. |
| `core` | no | `true` marks a core plugin. Core plugins load before user plugins and get dangerous scopes without a prompt. |
| `min_host_version` | yes, with `override` | Lowest runtime version (current: `5.1.0`, which added apps). The runtime skips an incompatible plugin. |
| `game_versions` | yes, with `override` | The game versions the plugin fits, as X.Y.Z values: `["1.2.2"]`. The upload form takes them from the manifest. |
| `dependencies` | no | Required plugin ids: a list, or `{ "id": ">=1.0" }` with `>=`, `<=`, `==`, `>`, `<` or `*`. Providers load before consumers. |
| `optional_dependencies` | no | Soft load-order hints. A missing plugin does not block loading. |
| `permissions` | no | `{ "scope": { "reason": "..." } }`. The user sees the reason. See [Permissions](#permissions). |
| `provides` | no | Services that this plugin shares, and the scopes that guard them. See [Service scopes](#service-scopes). |
| `frames` | no | https sites that its Vue overlays may show in an `<iframe>`. See [Frames](#frames). |
| `hotkeys` | no | `{ "logical_name": "combo" }` defaults, read with `ctx.hotkeyFor()`. The App lists them while the plugin does not run. |
| `apps` | no, yes with `lifecycle: "app"` | Windowed apps of the plugin. Needs `entry`. See [App Windows](#app-windows). |
| `lifecycle` | no | `"always"` (default): the process runs while the plugin is on. `"app"`: the process runs only while one of its app windows is open. |
| `default_config` | no | Default values for `ctx.config`. |

---

## Permissions

A plugin lists each scope it needs in its manifest, with a reason for the user. The runtime denies every scope that the manifest does not declare. When a plugin uses an undeclared scope, the stage shows a notification.

| Scope | Level | Kind | Gives |
|---|---|---|---|
| `network` | dangerous | process | `--allow-net`: the internet and local services on this PC. |
| `processes` | dangerous | process | `--allow-child-process` and `--allow-worker`, plus the profile folders (`LOCALAPPDATA`, `APPDATA`...) in the environment. A started program or worker runs outside the permission model. |
| `files` | normal | process | Read and write access to `ctx.filesDir`. See [Files](#files). |
| `game_files` | normal | process | Read access to the replays folder and to each game folder that the App knows. |
| `storage` | normal | brokered | `ctx.storage`. |
| `secrets` | normal | brokered | `ctx.secrets`. |
| `audio` | normal | brokered | `ctx.audio`. |
| `language` | normal | brokered | The `language` service. |
| `game_config` | normal | brokered | The `game_config` service. |
| `game` | core | brokered | Reserved for core plugins. |

- **normal** - granted when declared. The user can turn it off from the stage's plugin list.
- **dangerous** - the consent card asks the user before the plugin first starts. Electron main saves the answer. Core plugins get the scope unless the user turns it off.
- **core** - granted only to core plugins.

A **process** scope is a Node flag at spawn. A change to it restarts the plugin's process with `teardown("restart")`. The runtime checks a **brokered** scope on each call, so a change to it needs no restart.

Electron main keeps the decisions encrypted in `permissions.bin`. It draws the consent card outside the stage page, so plugin code cannot answer it. The user can review any declared scope from the stage's plugin info bar.

```ts
ctx.permissions.has("network");              // boolean
ctx.permissions.state("network");            // "granted" | "denied" | "prompt" | "undeclared"
await ctx.permissions.request("network");    // "granted" | "denied"
```

`request()` asks again only for a declared dangerous scope. It works only within 5 s of a user action in the overlay, inspector or config panel of this plugin. After a deny, it asks only once in each session.

### Service scopes

A provider can guard its service. It declares the scopes in its manifest under `provides`:

```json
"provides": {
  "accessors": {
    "description": "Live match data and the game's HUD.",
    "scopes": {
      "ui": { "label": "Game HUD changes", "description": "Hide or restyle parts of the game's interface.", "level": "normal" }
    }
  }
}
```

A consumer then declares `"accessors.ui"` in its `permissions`. `level` is `normal` or `dangerous` (the default). The runtime refuses a call that a provider guards with a scope that its manifest does not declare.

---

## .fuse Archive Format

A `.fuse` file is a ZIP with a single top-level directory named after `plugin_id`:

```
MyPlugin-1.0.0.fuse  (ZIP)
└── my_plugin/
    ├── manifest.json
    ├── plugin.js          # esbuild bundle of the entry module
    ├── Overlay.vue        # root-level .vue files
    ├── assets/            # images, .riv files, sounds
    ├── components/        # child components of the overlays
    ├── ui/                # UI library sources served to other plugins
    ├── js/                # scripts the plugin reads at run time
    └── cam/               # any other folder: only its .vue, .mjs, .css and .riv files
```

On discovery the runtime extracts each archive to `data/plugins-cache/<plugin_id>-<checksum>/` and adds a `package.json` with `"type": "module"`. After each scan, it removes the cache folders that no current archive uses. The extracted folder is the asset root, served over HTTP at `/overlay-asset/<plugin_id>/<path>`. The server looks in `assets/` first, then at the package root.

**Packing.** Plugin sources live in `plugins-src/<plugin_id>/`. From `frontend/fuse`:

```
npm run pack:plugins
```

To pack only some plugins, run `node runtime/scripts/pack-plugins.mjs energy_bar heat_stats`.

The packer bundles the entry of each plugin with esbuild (`@fuse/plugin-sdk` maps to `runtime/src/sdk`). It zips the bundle with the manifest and the files above, and writes `plugins-dist/<Name>-<version>.fuse`.

- Bundles carry inline source maps, so a debugger can follow them back to `plugins-src`. Set `RELEASE=true` to leave them out.
- A folder whose name starts with `_` is not a plugin. `node_modules`, `tools`, `test` and `tests` never ship.
- Libraries that plugins import go in `plugins-src/package.json`. Install them with `npm install --prefix plugins-src`.

---

## Discovery & Load Order

The runtime scans one folder for `.fuse` archives: `FUSE_USER_PLUGINS_DIR`. The App sets it to `plugins/` in the user data folder, or to `<repo>/plugins-dist` in dev. Without the variable the runtime uses `<repo>/plugins`. Then the runtime applies these steps:

1. **Enable/disable filter** - `disabled_plugins` in `fuse_host.json` excludes a plugin. A non-null `enabled_plugins` list acts as an allowlist.
2. **Compatibility check** - `min_host_version` against the runtime's `HOST_VERSION`. The runtime skips an incompatible plugin.
3. **Dependency filter** - a missing required dependency, or a version that does not match, drops the dependent plugin.
4. **Core-first ordering** - `"core": true` plugins load before user plugins.
5. **Topological sort** - required dependencies are hard edges. Optional dependencies are soft edges.
6. **Cycle detection** - the runtime drops the plugins in a dependency cycle.

Each skipped or failed plugin shows an error notification with the reason.

Plugins start one at a time, in order, when the first client authenticates. For each plugin the queue:

1. Shows the consent card for each dangerous scope that has no answer yet.
2. Starts the process and runs `setup()`.
3. Waits on a plugin with `requiresCalibration` until the user locks it.

---

## Core APIs

### FuseContext

Handed to every plugin in `setup()`. Plugins never create global state.

```ts
interface FuseContext {
  config: PluginConfigApi;           // per-plugin persisted JSON config
  hotkeys: PluginHotkeys;            // global hotkey registration
  assets: PluginAssets;              // files inside the extracted archive
  services: PluginServices;          // plugin and FUSE services
  events: PluginEvents;              // pub/sub between plugins
  overlays: OverlayManager;          // declare and control overlays
  apps: AppManager;                  // windows of the manifest `apps`
  notifications: StageNotifier;      // toasts on the stage
  audio: PluginAudio;                // sounds from own assets (needs `audio`)
  permissions: PluginPermissions;    // declared scopes and their state
  storage: PluginStorage;            // private document database (needs `storage`)
  secrets: PluginSecrets;            // encrypted values (needs `secrets`)
  links: PluginLinks;                // open https pages, fuse:// callbacks
  host: HostView;                    // state, getService, broadcast
  logger: Logger;                    // scoped logger

  state: HostState;                  // "calibrate" | "locked" | "interactive"
  packageRoot: string;               // extracted archive root
  filesDir: string | null;           // own folder, null without `files`
  manifestHotkeys: Record<string, string>;
  extras: Map<string, unknown>;      // plugin-private scratch space

  hotkeyFor(name: string, fallback?: string): string;
}
```

`ctx.host.broadcast(message)` sends a message to the App. Its `type` must start with the plugin id and a dot, for example `"my_plugin.updated"`.

### PluginConfig

Per-plugin JSON config with watchers and a declarative schema that drives the App's settings panel.

```ts
ctx.config.defaults({ opacity: 200 }).load();
ctx.config.get<number>("opacity", 200);
ctx.config.set("opacity", 180);          // saves, fires watchers, updates the App and the stage
ctx.config.setLive("opacity", 190);      // fires watchers without a save (a drag in progress)
ctx.config.update({ a: 1, b: 2 });       // several keys, one save
ctx.config.watch("opacity", (v) => { ... });
ctx.config.snapshot();                   // full dict
ctx.config.onAction((controlId, payload) => { ... });  // buttons in the App panel
```

The runtime owns the file `data/configs/fuse_<plugin_id>.json`. It checks the file once a second, so an edit on disk reaches the watchers.

`ctx.config.schema()` takes the same `InspectorSection` objects as an [overlay inspector](#overlay-inspector). The App panel and the stage then show the same controls, bound to the same keys. The runtime checks each App write against the control that owns the key.

```ts
ctx.config.schema([
  {
    id: "display",
    label: "Display",
    controls: [
      { type: "slider", id: "opacity", key: "opacity", label: "Opacity", min: 0, max: 255 },
      { type: "select", id: "theme", key: "theme", label: "Theme",
        options: [{ value: "dark", label: "Dark" }, { value: "light", label: "Light" }] },
    ],
  },
]);
```

The legacy `ConfigCategory` / `ConfigEntry` classes still work. Their types are `bool`, `int`, `float`, `str`, `choice`, `position` and `color` (an `"#RRGGBBAA"` string). `set()` clamps `int` and `float` values to `min`/`max`. The overlay editor writes `position` entries.

### EventBus

Fire-and-forget pub/sub across plugin processes. Payloads are JSON. Handlers run after `emit` returns. The runtime logs a handler exception, and the exception does not affect other subscribers.

```ts
ctx.events.subscribe("accessors.connected", () => { ... });
ctx.events.emit("my_plugin.something", { value: 1 });
```

Events that start with `host_` come from the runtime. Plugins can subscribe to them but cannot emit them.

| Event | Payload |
|---|---|
| `host_state_changed` | `{ state, calib_stage }` |
| `host_ready` | `{}` - every plugin in the setup queue started |
| `host_game_config_changed` | The `game_config` state |
| `host_language_changed` | `{ language }` |

### Services

A service is state that consumers read synchronously, plus methods that consumers call asynchronously. Providers load before consumers, so `require()` is safe inside a consumer's `setup()`.

```ts
// Provider
const svc = ctx.services.provide("my_service", {
  target: this.impl,                     // object whose methods consumers call
  methods: ["doThing"],                  // default: every method of target
  reads: { read: "values" },             // consumer's read(k) returns state.values[k]
  state: () => ({ values: this.values, ready: true }),  // JSON only
  scopes: { doThing: "write" },          // callers need "my_service.write"
  stateScope: "read",                    // optional: readers need "my_service.read"
});
svc.publish();                           // after a state change, sends only what changed

// Consumer
const acc = ctx.services.require<Accessors>("accessors");  // throws if missing
const maybe = ctx.services.get("optional_service");        // undefined if missing
acc.read("health");                      // synchronous, from the local copy
acc.connected;                           // other properties read the state
await acc.hide(".some-selector");        // a method call returns a Promise
```

- One name has one provider. The runtime refuses a second provider.
- When a provider stops, `get()` returns `undefined` and calls reject until the provider is back.
- `ctx.services.register(name, impl)` is the legacy form. It shares methods only, with no synchronous reads.

FUSE has three services of its own:

| Service | Permission | Surface |
|---|---|---|
| `keyboard` | none | `isHeld(key)` (synchronous), `press(key)`, `release(key)`, `tap(key)` |
| `language` | `language` | `language` (the App's language code, kept current), `get()` |
| `game_config` | `game_config` | `port`, `enabled`, `valid`, `reachable`, `checkedAt`, `installs`, `replaysDir`, `get()` |

Read the properties from the service directly. `get()` is a call and returns a Promise. Without the permission, the state is empty and `get()` rejects.

```ts
const lang = ctx.services.get<LanguageService>("language");
const code = lang?.language;   // or await lang?.get()

const cfg = ctx.services.get<GameConfigService>("game_config");
const port = cfg?.port;
```

`language` lets a plugin set its locale before its user picks one. Changes arrive as the `host_language_changed` event.

`game_config` carries the game's debugger port and what the App found in `coldwar.project`:

- `port` - what the App configured. `enabled` - the game has `"Enable Debugger": true`. `valid` - the file's port matches the App's setting. `reachable` - the port answered the runtime's last probe.
- `installs` - the App's game folders, `[{ platform: "steam" | "wgc", dir }]`. `replaysDir` - the folder HEAT writes replays to, or `null` off Windows.
- Changes arrive as the `host_game_config_changed` event. `FUSE_CDP_PORT` holds the value at spawn as a fallback.
- Never hard-code the port. The default is `17503`, and the user can change it in the App's Advanced settings.
- When the game runs but the port stays closed for 15 s, the stage shows a notification.

### Hotkeys

The runtime owns one global keyboard hook (uiohook). Plugins register combos. A rebind from the App or the inspector updates the binding live.

```ts
ctx.hotkeys.register(ctx.hotkeyFor("toggle", "ctrl+t"), () => this.toggle(), "Toggle My Overlay");
```

- Combos are `modifier+modifier+key` with `ctrl`, `shift`, `alt`. Case-insensitive. Keys: `a`-`z`, `0`-`9`, `f1`-`f24`, the arrow keys, `home`, `end`, `pageup`, `pagedown`, `insert`, `delete`, `enter`, `tab`, `backspace`, `space`.
- Register with the manifest default. The runtime saves each user rebind in `fuse_host.json` (`hotkey_overrides`) and binds the saved combo instead. Give each hotkey a label: the App, the saved rebinds and keybind controls find a binding by its label.
- To show a key to the user, read `ctx.hotkeys.listBindings()` and refresh it in `ctx.hotkeys.onChange(cb)`.
- The runtime does not take over a combo that the host or another plugin already holds. It logs a warning instead.

`register` fires once for each press. For a key that matters while it stays down, use `hold`. It reports the press and the release:

```ts
ctx.hotkeys.hold(ctx.hotkeyFor("zoom_out", "shift"), {
  onDown: () => this.zoom(true),
  onUp: () => this.zoom(false),
}, "Zoom Out");
```

- A bare modifier (`"shift"`, `"ctrl"`, `"alt"`) is a valid hold combo. The App's keybind capture accepts one for a hold bind.
- `onUp` runs when any key of the combo goes up. It also runs when the game loses focus, when the user rebinds the combo, and when the binding goes away.
- Auto-repeat does not send a second `onDown`.

To read the held state without events, use the `keyboard` service. Its state arrives with the host tick (50 ms), so a shorter tap may not show. Key-downs that FUSE injects do not count.

```ts
const kbd = ctx.services.get<KeyboardService>("keyboard");
if (kbd?.isHeld("shift")) { /* ... */ }
```

### Storage

A private document database. Needs the `storage` permission.

```ts
const matches = ctx.storage.collection<Match>("matches");
await matches.put("m1", { map: "port", kills: 3, player: { name: "x" } });
await matches.get("m1");                    // undefined when absent
await matches.update("m1", { kills: 4 });   // shallow merge, false when absent
await matches.query({
  where: [["kills", ">=", 3], ["player.name", "==", "x"]],
  orderBy: ["kills", "desc"],
  limit: 50,
});
await matches.count({ where: [["map", "in", ["port", "dam"]]] });
await matches.delete("m1");
await matches.clear();
```

- Each plugin has one SQLite file: `data/storage/<plugin_id>.db`. Documents are JSON. Ids are strings of 1-256 characters.
- Operators: `==`, `!=`, `<`, `<=`, `>`, `>=`, `in`. A field name can use dots for nested fields. Query values are strings, numbers, booleans or `null`.
- Limits: 10 MB for each document, 250 MB for each plugin, 1000 rows for each query.
- Collection names: 1-64 letters, digits, `_`, `.` or `-`.

### Secrets

Values that only this plugin can read, such as sign-in tokens. Needs the `secrets` permission.

```ts
await ctx.secrets.set("refresh_token", token);
const token = await ctx.secrets.get("refresh_token");   // undefined when absent
await ctx.secrets.has("refresh_token");
await ctx.secrets.delete("refresh_token");
```

Electron main encrypts the values with the OS account key (`secrets.bin`). Keys: 1-128 letters, digits, `.`, `_` or `-`. Values: strings up to 16 KB. Up to 100 keys for each plugin.

### Links

```ts
const opened = await ctx.links.open(`https://example.com/login?state=${state}`);
ctx.links.onCallback((url) => { /* fuse://plugin/my_plugin/callback?code=...&state=... */ });
```

- `open()` takes plain `https` links up to 2048 characters, with no user name or password. It works only within 5 s of a user action in this plugin's overlay, inspector or config panel. Each action allows one link. Otherwise `open()` returns `false`.
- The stage shows a notification for each page that a plugin opens.
- Any website can open a `fuse://plugin/<plugin_id>/...` link. Electron sends it only to that plugin. Check what the link carries, for example a `state` value that you generated.

### Notifications

Toasts at the top right of the stage. They need no permission.

```ts
const id = ctx.notifications.notify({
  title: "Match saved",
  message: "3 kills, 4200 damage",
  type: "success",          // "info" | "success" | "warning" | "error"
  icon: "check",            // optional Icons.vue kind
  duration: 5000,           // ms, 0 keeps it until closed, max 60000
  id: "saved",              // optional: the same id replaces the toast
});
ctx.notifications.dismiss(id);
```

A stage that connects later still gets the toasts that show now.

### Audio

Sounds from the plugin's own files. Needs the `audio` permission.

```ts
ctx.audio.preload(["ping.mp3"]);
const id = ctx.audio.play("ping.mp3", { volume: 0.8, loop: false, rate: 1 });
ctx.audio.stop(id);
ctx.audio.stopAll();
```

- Paths resolve like overlay assets: `assets/` first, then the package root. Formats: `.mp3`, `.wav`, `.ogg`.
- The App's master volume scales `volume` (0..1). `rate` is 0.25..4.
- The stage window plays the sound. OBS sources stay silent, because OBS captures desktop audio.
- Without the permission, `play()` returns `""`.

### Files

With the `files` permission, `ctx.filesDir` is a folder that only this plugin uses: `data/plugin-files/<plugin_id>/`. The plugin reads and writes it with `node:fs`. Without the permission, `ctx.filesDir` is `null`.

The runtime serves the files in `<filesDir>/overlay/` to overlays at `/overlay-file/<plugin_id>/<path>`. Use this route for large data that the plugin makes at run time:

```ts
// plugin
overlay.setJson("bake", { url: ctx.overlays.fileUrl("maps/port.bin") });

// Vue overlay
const origin = new URL(props.assetBase, location.href).origin;
const res = await fetch(origin + props.data.bake.url);
```

### PluginAssets

Reads files from the extracted archive's `assets/` folder. Use this instead of raw path arithmetic.

```ts
const bytes = ctx.assets.read("overlay.riv");          // <package>/assets/overlay.riv
const text = ctx.assets.readText("data/maps.json");
const exists = ctx.assets.exists("optional.json");
const abs = ctx.assets.resolve("overlay.riv");
```

---

## Overlays

Plugins declare overlays. The stage window renders them. Two kinds:

- **`rive`** - a `.riv` animation rendered with the Rive web runtime. Sized by its declaration and `setSize()`. The editor cannot resize it.
- **`vue`** - a Vue SFC compiled at run time in the stage (vue3-sfc-loader). Resizable, can be interactive.

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
  interactive: false,                    // true: takes pointer input in interactive mode
});
```

The stage knows the overlay as `<plugin_id>:<id>`. Give `positionConfigKey` a `null` entry in the config defaults, so the key exists before the first save.

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
overlay.setSize({ w: 320, h: 120 });     // canvas size, applied live
overlay.setPositionConfigKey("bar_fp_pos");  // save the rect under another key from now on
overlay.setVisible(false);
overlay.onAction((action, payload) => { ... });  // Vue overlay buttons/inputs
overlay.remove();
```

The runtime merges input updates into one message for each overlay and flush. It keeps non-trigger values and sends them to a stage window that connects later.

An action named `report:<name>` is data from the overlay, for example stats or telemetry. It reaches `onAction`, but it does not count as a user action for `links.open()` or `permissions.request()`.

### Rect

Position in device-independent pixels, absolute in display space. `x`/`y` are the unrotated top-left. Rotation turns the rect about its center.

```ts
interface Rect {
  x: number; y: number; w: number; h: number;
  rot?: number;      // clockwise degrees [0, 360), default 0
  opacity?: number;  // 0..1, default 1
}
```

The runtime sanitizes each rect that the overlay editor sends (drag, resize, inspector). It saves the rect under `positionConfigKey` and echoes it to all stage clients. A plugin `setRect` with a bare `{x,y,w,h}` keeps the user's saved rotation and opacity. Pass `rot: 0` or `opacity: 1` to reset them.

### Overlay Inspector

The inspector is the stage's config panel for the selected overlay. A plugin adds sections below FUSE's own Position, Layout and Appearance sections.

```ts
overlay.inspector.sections([
  {
    id: "look",
    label: "Look",
    description: "How the bar looks.",
    collapsible: true,
    controls: [
      { type: "color", id: "tint", key: "tint", label: "Tint", alpha: true, default: "#8FFFB8FF" },
      { type: "toggle", id: "glow", key: "glow", label: "Glow" },
      { type: "slider", id: "glow_size", key: "glow_size", label: "Glow size", min: 0, max: 20, unit: "px",
        when: { key: "glow", truthy: true } },
      { type: "keybind", id: "toggle_key", label: "Toggle", action: "Toggle My Overlay" },
      { type: "button", id: "reset", text: "Reset", variant: "danger", confirm: "Click again" },
    ],
  },
]);
overlay.inspector.onInput((id, value, phase) => { /* phase: "live" during a drag, "commit" at its end */ });
overlay.inspector.onAction((id, payload) => { /* buttons */ });
overlay.inspector.patch("glow_size", { max: 40 });   // change one control in place
```

| Control | Options |
|---|---|
| `slider` | `min`, `max`, `step`, `unit`, `displayMul`, `default` (double-click reset), `bipolar` |
| `number` | `min`, `max`, `step`, `unit`, `precision` |
| `vec2` | `keys: [a, b]`, `labels`, `link`, `min`, `max`, `step`, `unit` |
| `toggle`, `switch` | - |
| `segmented` | `options` |
| `buttons` | `mode: "exclusive" \| "multi"`, `options` (with `icon`) |
| `select` | `options` (with `group`), `searchable` |
| `radio` | `options` (with `description`) |
| `text` | `placeholder`, `maxLength`, `pattern`, `multiline` |
| `color` | `alpha`, `withOpacitySlider`, `swatches`, `default` (`"#RRGGBB"` or `"#RRGGBBAA"`) |
| `keybind` | `action` (the label of one of the plugin's hotkeys), `hold` |
| `button` | `text`, `variant`, `icon`, `confirm` |
| `buttonRow` | `buttons` |
| `note` | `text`, `tone: "muted" \| "warn"` |
| `divider` | - |

Every control takes `id`, `label`, `tooltip`, `hint`, `key`, `when`, `disabledWhen` and `width: "full" | "half"`. A section takes `id`, `label`, `description`, `collapsible`, `defaultCollapsed`, `order` (FUSE's sections use 0, 1 and 2), `when` and `controls`.

- A section starts open. Set `defaultCollapsed: true` to start it collapsed. Set `collapsible: false` to keep it open.
- A control with a `key` reads and writes that config key, the same key that the App panel edits. Without a `key` the value is transient and reaches the plugin only through `onInput`.
- The runtime coerces each value against its control: it clamps numbers and checks options. It rejects a value that does not fit. The runtime saves a `commit` change, but not a `live` change.
- A `keybind` control with `action` shows and rebinds that live hotkey, the same binding as the App's Keybinds tab. It does not use `key`.
- Buttons go to `inspector.onAction`. Without that handler they go to `ctx.config.onAction`.
- `when` and `disabledWhen` test control values by control id: `{ key, eq | ne | in | gt | lt | truthy }`, `allOf`, `anyOf` and `not`.
- `inspector.values()` returns `{}` in a plugin process. Read the config instead.

### Vue Overlays

The stage mounts the SFC with these props:

```ts
{
  data: Record<string, unknown>,   // inputs pushed via handle.set*/setJson
  state: HostState,
  interactive: boolean,            // true in interactive mode
  emitAction: (action: string, payload?: unknown) => void,
  assetBase: string,               // absolute URL of the overlay's folder on the runtime server
}
```

Imports available inside overlay SFCs:

- `vue`, `motion-v`, `@rive-app/canvas`, `chart.js`, `chart.js/auto` - from the stage bundle.
- `<pluginId>/<path>` - cross-plugin imports fetched from that plugin's served files. A path with no file extension loads `<path>/index.js`. The `fuse_ui` plugin ships shared components this way: declare `"dependencies": ["fuse_ui"]`, then `import eSelect from "fuse_ui/ui/eSelect.vue"`, `import { eButton, Dynamics } from "fuse_ui/ui/index.js"`, or `import "fuse_ui/ui/tokens.css"` for design tokens. FUSE UI has the inputs of the stage (`eButton`, `eButtons`, `eColorField`, `eKeybindField`, `eNumberField`, `eRadio`, `eSegmented`, `eSelect`, `eSlider`, `eSwitch`, `eTextField`, `eToggle`). It also has `Icons`, `eTooltip`, the `Dynamics` motion presets and the design tokens of the App. `canvas_ui` ships canvas effects such as `Glitch` and `FlameWrap`.
- `https://` URLs and relative imports. The stage injects each stylesheet once.

Overlay roots should fill the wrapper (`width: 100%; height: 100%`) and scale their content, because users resize them freely in the editor. Use opaque backgrounds. The wrapper's opacity control owns transparency.

- The stage compiles templates as plain JavaScript. Do not use TypeScript syntax (`!`, `as`) in template expressions.
- `import type` from a `.vue` file still loads that file at run time. An import cycle between overlay files hangs the overlay with no error.

### Frames

A Vue overlay can show a website in an `<iframe>` when the manifest lists the site:

```json
"frames": ["https://heatlabs.net", "https://*.heatlabs.net"]
```

- Each entry is `https://site.net` or `https://*.site.net` (every subdomain). No port, path or query.
- Electron cancels a frame on any other site. A link that the framed site follows to another site opens in the browser.
- A `target="_blank"` link opens in the browser only when the click sends a referrer. With `rel="noreferrer"` it does nothing.
- The framed site keeps its own headers and runs in its own process. It gets no preload, so it cannot reach the stage or other plugins.
- The stage page is `file://`, so the frame's cookies are third-party cookies.

---

## App Windows

An app is a Vue view that opens in a FUSE window on the stage. The window has a title bar with minimize, maximize and close. The user opens apps from the taskbar and the console (see [Apps](#apps)). Use an app for a tool that the user works in. Use an overlay for content that the user looks at.

```json
{
  "lifecycle": "app",
  "apps": [
    {
      "id": "notes",
      "name": "Match Notes",
      "icon": "assets/notes.svg",
      "keywords": ["notes", "match"],
      "view": "Notes.vue",
      "window": { "size": { "w": 560, "h": 640 }, "minSize": { "w": 360, "h": 320 }, "resizable": true, "instances": "single" },
      "views": { "history": { "view": "History.vue", "size": { "w": 720, "h": 520 } } },
      "hotkey": "ctrl+alt+n"
    }
  ]
}
```

| Field | Required | Description |
|---|---|---|
| `id` | yes | 1 to 32 lowercase letters, digits, `_` or `-`. The app key is `<plugin_id>:<id>`. |
| `name` | no | The name in the console, the taskbar and the title bar. Default: the id. |
| `view` | yes | The `.vue` file of the main window, inside the package. |
| `title` | no | The window title. Default: the name. |
| `icon` | no | An svg, png, webp or jpg file inside the package. Without it, the console and the taskbar show the first letter of the name. |
| `keywords` | no | Up to 16 more search words for the console. |
| `window` | no | `size` (default 480 x 360), `minSize` (default 240 x 160), `maxSize`, `resizable` (default `true`). `instances`: `"single"` (default) focuses the open window on a second launch, `"multi"` opens a new window. Sizes are DIPs from 120 to 7680. |
| `views` | no | More views, for example tool windows, that the plugin opens with `ctx.apps.open(appId, key)`. Each view takes `view`, `title`, `size`, `minSize`, `maxSize` and `resizable`. |
| `hotkey` | no | The default launch hotkey. A hotkey that the user sets in the console replaces it. |

Lifecycle:

- `"always"` (default): the process runs while the plugin is on. The apps open windows on the running process.
- `"app"`: the plugin is `idle` and has no process until the user opens one of its apps. The process stops 10 s after the last window closes, with `teardown("app_closed")`. A reopen in that time uses the same process. Such a plugin must declare `apps`, and `ctx.overlays.declare` throws in it.

### AppManager

```ts
interface AppManager {
  handle(appId: string, handlers: { open(win: AppWindow): void | Promise<void>; close?(win: AppWindow): void }): void;
  open(appId: string, view?: string): Promise<AppWindow>;   // the main view, or a key of `views`
  windows(appId?: string): AppWindow[];
}

interface AppWindow {
  readonly id: string;
  readonly appId: string;
  readonly view: string;                                    // "main" or a key of `views`
  readonly state: { focused: boolean; maximized: boolean; minimized: boolean; size: { w: number; h: number } };
  setJson(path: string, value: unknown): void;              // the view's `data`, as OverlayHandle.setJson
  setTitle(title: string): void;
  focus(): void;
  minimize(): void;
  maximize(): void;
  restore(): void;
  close(): void;
  onAction(cb: (action: string, payload?: unknown) => void): void;   // one handler for each window
  onState(cb: (state: AppWindow["state"]) => void): () => void;
}
```

```ts
override setup(ctx: FuseContext): void {
  ctx.apps.handle("notes", {
    open: (win) => {
      win.onAction((action, payload) => this.onAction(action, payload));
      win.setJson("notes", this.notes);
    },
    close: (win) => this.forget(win),
  });
}
```

- FUSE calls `open` for each new window. It calls `open` again for the open windows after a plugin restart (`Ctrl+R`).
- A window that opens before `handle()` runs waits for it.

### App Views

The stage mounts a view with the [Vue overlay](#vue-overlays) props and one more prop, `window`:

```ts
{
  data, state, emitAction, assetBase,   // as for a Vue overlay
  interactive: true,                    // always true in a window
  window: { id: string, focused: boolean, maximized: boolean, size: { w: number, h: number } },
}
```

- The view fills the window body. Do not draw a frame, a title or a close button: the window has them.
- The view gets keys only while its window has the keyboard. While the stage has the keyboard, only plugin hotkeys with `Ctrl` or `Alt` fire.
- A minimized window takes no input. OBS views show the windows, read-only.
- The same import rules as for Vue overlays apply.

---

## Host Lifecycle

1. **Boot** (`runtime/src/index.ts`) - starts `WsServer` and prints the handshake line to stdout. Gets the saved permission decisions from Electron (waits up to 3 s) and discovers plugins. Starts the keyboard hook, the tick loop and the game port probe. Exits when Electron's stdin pipe or IPC channel closes (orphan guard).
2. **Plugin init** - starts when the first client authenticates. Plugins start one at a time in dependency order. Calibration-requiring plugins hold the queue until locked. A plugin with `lifecycle: "app"` stays `idle` with no process until the user opens one of its apps.
3. **Tick loop** - `tick(dt)` goes to every plugin process every ~50 ms. Resource metrics go to the stage each second.
4. **Enable / disable** - the App starts or stops one plugin process. An enabled plugin joins the current host state.
5. **Hot reload** (`Ctrl+R`) - stops all plugins in reverse order with `teardown("restart")`. Reads the permission decisions again and discovers the archives again. Starts every plugin in the `locked` state.
6. **Shutdown** (`Ctrl+P` or App exit) - `teardown("shutdown")` in reverse load order, then the runtime closes storage and exits.

The App can launch the runtime straight to `locked` (`FUSE_AUTO_LOCK=1`). That launch skips the calibration of each plugin.

---

## WebSocket Protocol

Single WS endpoint at `ws://127.0.0.1:<port>/ws`. The first message must be `{ type: "auth", token }` within 5 s. The token picks the role. The runtime answers `{ type: "auth:ok", version }`. Any client can send `{ type: "heartbeat" }` and gets `heartbeat_ack`.

| Direction | Messages |
|---|---|
| Runtime to control | `plugin:registered`, `plugin:status_changed`, `config:value_changed`, `hotkey:rebound`, `host:state_changed`, `host:hotkeys`, `stage:tour_done`, `app:list`, `launcher:settings`, `app:open_settings`, and `<plugin_id>.*` messages from `host.broadcast` |
| Runtime to stage and view | `overlay:declared`, `overlay:data`, `overlay:transform`, `overlay:size`, `overlay:visibility`, `overlay:removed`, `overlay:reload`, `overlay:inspector`, `inspector:values`, `window:opened`, `window:data`, `window:state`, `window:order`, `window:closed`, `plugin:list`, `plugin:metrics`, `stage:notify`, `stage:dismiss`, `audio:master`, `audio:preload`, `audio:play`, `audio:stop`, `audio:stop_all`, `host:state_changed`, `host:hotkeys` |
| Runtime to stage only | `stage:settings`, `stage:metrics`, `app:list`, `app:configure_result`, `launcher:settings`, `console:open`, `console:close`, `window:take_focus` |
| Stage to runtime | `overlay:transform` (editor commits a rect), `overlay:action`, `inspector:set`, `inspector:action`, `stage:dismiss`, `host:request`, `stage:tour_done`, `permissions:review`, `app:launch`, `app:favorite`, `app:pin`, `app:configure`, `app:quit`, `app:open_settings`, `console:toggle`, `console:closed`, `hotkeys:capture`, `window:command`, `window:rect`, `window:action` |
| Control to runtime (JSON-RPC 2.0) | `config.update`, `config.action`, `plugin.setEnabled`, `hotkey.rebind`, `overlay.setVisible`, `audio.setMaster`, `stage.setPerfWidget`, `stage.setTour`, `app.setLanguage`, `app.setGameConfig`, `app.list`, `app.launch`, `app.configure`, `app.favorite`, `app.pin`, `launcher.settings` |

The `view` role only receives.

HTTP on the same port: `/health`, `GET /overlay-asset/<pluginId>/<path>`, and `GET /overlay-file/<pluginId>/<path>` (needs `files`).

---

## accessors Service

The primary game API. The core `accessors` plugin serves it. It connects to the Coherent Gameface CDP debugger on the port from `game_config`. It polls the game pages and merges all values into a flat cache. The pages are `battle_hud`, `markers`, `base_indicators`, `battle_app`, `hangar`, `splash` and `transition_world`.

```ts
// manifest.json: "dependencies": ["accessors"]
const acc = ctx.services.require<Accessors>("accessors");

override tick(dt: number): void {
  const hp = acc.read("health");             // number | null
  const fp = acc.read("is_fp");              // 1 | 0 | null
  const up = acc.isConnected("battle_hud");  // boolean
}
```

`read()` and `isConnected()` are synchronous. The other methods are async calls:

- **Read-only:** `countMatches(page, selectors)`, `snapshot(domain)`, `fetchSnapshot(domain)`. Domains: `postmatch`, `roster`, `hangar`, `catalog` (heavy, pull it with `fetchSnapshot`), `damage_log`.
- **HUD changes** - need the `accessors.ui` permission: `injectStylesheet` (also `...Markers` and `...BaseIndicators`), `setStyle`, `setStyles`, `resetStyle`, `hide`, `show`, `insertHtmlOn`, `pollOpenUrl`. Each of the first six also has an `...On(page, ...)` form and a `...Hangar` form.

| Event on `ctx.events` | Payload |
|---|---|
| `accessors.connected` / `accessors.disconnected` | The `battle_hud` page came up or went away. Accessors retries on its own. |
| `accessors.page_connected` / `accessors.page_disconnected` | `{ page }` |
| `accessors.scene_changed` | `{ scene, prev, tags }` |
| `accessors.results_available` | `{ battleId, source }` - new post-match results. Read them with `snapshot("postmatch")`. |
| `accessors.damage_taken` | `{ match, update, entry }` |
| `accessors.player_died` | `{ match, life, fatal_id, killer }` |
| `accessors.crosshair_hit` | `{ hit }` |

Config keys: `cdp_port` (`0` follows the App), `connect_timeout_s`, `reconnect_interval_s`, `poll_interval_s`, `hangar_poll_interval_s`.

**Scene.** Accessors computes one scene for every plugin. Use it, not your own `battle_state` checks, so all plugins agree. To let the user pick where an overlay shows, offer the `scene_tags` values in a `show_in` config key. Show the overlay when one current tag is in that list.

HUD values return `null` when not in battle or when the HUD element is absent. The scene values are not `null` while Accessors runs.

**Scene**

| Name | Type | Description |
|------|------|-------------|
| `scene` | `str` | `offline`, `loading`, `hangar`, `prebattle`, `alive`, `map`, `dead`, `deploy`, `spawning` or `results` |
| `scene_tags` | `list[str]` | The scene, plus `match` in battle, `hangar.<screen>` in the hangar, and `queue` while queued |
| `scene_info` | `dict` | `scene`, `tags`, `since_ms`, `camera`, `route`, `screen`, `queued`, `battle_state` |
| `damage_log` | `dict` | Damage taken this match |

Hangar screens: `base`, `select`, `agent`, `vehicle`, `missions`, `modes`, `career`, `results`, `store`, `tutorial`, `settings`, `other`.

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
| `ab1_charges` / `ab2_charges` | `int\|null` | Charges, or `null` if not charge-based |
| `equip1_state` / `equip2_state` | `int` | Equipment (Q / E) state |
| `equip1_cd` / `equip2_cd` | `int` | Cooldown remaining seconds |
| `equip1_charges` / `equip2_charges` | `int\|null` | Charges, or `null` if not charge-based |
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
| `dealt_damage` / `dealt_hits` | `int` | Damage and hits from the on-target hit numbers. Counts FiringRange dummies. Restarts with the markers page |

Legacy aliases remain readable for old plugins: `multiplayer_vehicle_health`, `multiplayer_vehicle_energy`, `multiplayer_vehicle_boost`, `multiplayer_camera_zoom`, `multiplayer_is_fp_view`.

---

## Developing Plugins

1. Run `npm install` in `frontend/fuse`, and `npm install --prefix plugins-src` for the libraries that plugins import.
2. Run `npm run dev` in `frontend/fuse`. It builds the runtime (and installs its packages the first time), downloads the plugin Node, packs every plugin into `plugins-dist/`, and starts the App.
3. After a change to plugin code (`plugin.ts` and the modules it imports), run `npm run pack:plugins`. Then press `Ctrl+R` to reload all plugins.
4. After a change to an overlay file (`.vue`, `.mjs`, `.css`, `.riv`, images), save the file. In dev the runtime serves overlay files from `plugins-src`, and the stage reloads the overlay.

Logs from the runtime and from every plugin process go to the App's console.

| Variable | Read by | Effect |
|---|---|---|
| `FUSE_DEV_PLUGINS` | runtime | Unset: serve the overlay files of every plugin from `plugins-src` when that folder exists. `*` or `id1,id2`: only these plugins. Empty: off. |
| `FUSE_DEV_PLUGINS_SRC` | runtime | Another plugin source folder. Default `<repo>/plugins-src`. |
| `FUSE_PLUGIN_INSPECT=<plugin_id>` | runtime | Starts that plugin with `--inspect=0` and **without** the permission model, so a debugger can attach. Use it only to debug. |
| `FUSE_INSPECT_PORT` | App | The runtime's inspector port. Default `9229`. |
| `FUSE_INSPECT=brk` | App (dev) | The runtime pauses at its first line until a debugger attaches. |
| `FUSE_LOG_LEVEL` | runtime, plugins | `debug`, `info` (default), `warning` or `error`. |
| `FUSE_DATA_DIR` | runtime | The data folder. The App sets it. |
| `FUSE_USER_PLUGINS_DIR` | runtime | The folder scanned for `.fuse` archives. The App sets it. |

---

## Project Layout

```
HEAT_SACLOS/
├── runtime/                 # Node sidecar
│   ├── src/host/            # FuseHost, plugin processes, permissions, services, storage, overlays, apps
│   ├── src/plugin-host/     # the plugin process entry and its FuseContext
│   ├── src/sdk/             # @fuse/plugin-sdk: base class, types and helpers for plugins
│   ├── src/server/          # WebSocket + HTTP server
│   └── scripts/             # pack-plugins.mjs
├── plugins-src/             # plugin sources, one folder for each plugin_id
├── plugins-dist/            # packed .fuse archives, the plugins folder in dev
├── frontend/fuse/           # Electron + Vue App
│   ├── electron/            # main process: runtime spawn, stage window, consent, secrets, OBS server
│   ├── src/                 # the App UI
│   └── src/overlay/         # the overlay stage: Rive and Vue overlays, editor, inspector, app windows
├── backend/data/            # the data folder in dev
└── docs/                    # notes on the game's UI and engine
```

The data folder (`FUSE_DATA_DIR`) is the user data folder in production and `backend/data` in dev:

| Path | Holds |
|---|---|
| `configs/fuse_<plugin_id>.json` | Plugin config |
| `configs/fuse_host.json` | `enabled_plugins`, `disabled_plugins`, `hotkey_overrides`, `apps` (taskbar, favorites, pins, aliases, launch hotkeys, window places) |
| `plugins-cache/` | Extracted archives |
| `plugin-files/<plugin_id>/` | `ctx.filesDir` |
| `storage/<plugin_id>.db` | `ctx.storage` |
| `permissions.bin`, `secrets.bin` | Permission decisions and secrets, encrypted by Electron main |
