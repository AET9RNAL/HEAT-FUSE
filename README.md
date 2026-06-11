# HEAT_SACLOS

Operator overlays for **H.E.A.T. AILOS-TORC** — a Manual Command to Line of
Sight (MCLOS / SACLOS) guidance suite for ATGM-equipped armoured vehicles in
modern combined-arms simulators.

The repository ships two independent overlay families:

| Entry point              | Purpose                                              |
| ------------------------ | ---------------------------------------------------- |
| `run_heat_ailos_torc.py` | ML-driven SACLOS pipeline (predictor / trainer / refiner) with vehicle-keyed profile selection. |
| `run_heat_overlay.py`    | Universal modular HUD host with auto-discovered plugins.                                        |

Both are wrapped by `run.bat`, which bootstraps the conda environment and
presents a top-level menu.

## Quick start (Windows)

```bat
run.bat
```

`run.bat` will:

1. self-elevate to administrator (required for SendInput against elevated game windows),
2. create / activate the `heat_saclos` conda environment (`python=3.14`, `tk`),
3. install `requirements.txt` into that environment,
4. show the launcher menu:
   * **[1]** HEAT AILOS-TORC — opens the Tk picker (pick ML profile + mode),
   * **[2]** HEAT Overlay — boots the universal plugin host.

> **OCR (optional):** install Tesseract from <https://github.com/tesseract-ocr/tesseract>.

## Repository layout

```
overlay/
  ml/heat_ailos_torc/        # ML-driven SACLOS pipeline
    predictor/               # live overlay with ML auto-correction
    trainer/                 # data collection + AttnRes online learning
    refiner/                 # visual trajectory editor
    profiles.py              # MLProfile registry helpers
    runner.py                # Tk picker (profile + mode)
  heat/                      # universal modular overlay
    host.py                  # PluginHost — owns Tk root, listeners, hotkeys
    plugin_api.py            # HeatPlugin ABC + HeatContext
    discovery.py             # manifest.json scanner
    runner.py                # entry point
    plugins/
      energy_bar/            # OCR-driven energy / progress HUD
        manifest.json
        plugin.py

ui/                          # shared overlay primitives (BaseSACLOSOverlay, HUD, OCR, TCE)
utils/                       # paths, ConfigManager, hardware injection, OCR reader, LayeredWindow
sim/                         # offline physics sim + matplotlib visualiser (dev only)

data/
  configs/                   # heat_ailos_torc.json, heat_energy_bar.json, heat_overlay.json, heat_<plugin>.json …
  ml/
    ml_profiles.json         # vehicle registry
    profiles/
      <vehicle>/
        dataset.json         # JSONL training samples
        attn_weights.json    # learned attention weights
        biases.json          # CorrectionSession biases

run_heat_ailos_torc.py       # → overlay.ml.heat_ailos_torc.runner.main()
run_heat_overlay.py          # → overlay.heat.runner.run()
run_sim_viz.py               # standalone matplotlib observatory (dev)
run.bat                      # admin-elevated launcher menu
```

## ML profiles

The active dataset / attention-weights / biases triple is selected at
startup. Profiles live in `data/ml/ml_profiles.json`:

```json
{
  "default": "amx_10rc",
  "profiles": {
    "amx_10rc": {
      "label": "AMX-10RC (HOT-2 SACLOS)",
      "vehicle_label": "AMX-10RC",
      "dataset":      "data/ml/profiles/amx_10rc/dataset.json",
      "attn_weights": "data/ml/profiles/amx_10rc/attn_weights.json",
      "biases":       "data/ml/profiles/amx_10rc/biases.json"
    }
  }
}
```

Add a new vehicle by creating `data/ml/profiles/<name>/` and registering it
in `ml_profiles.json` (or programmatically via
`overlay.ml.heat_ailos_torc.profiles.add_profile()`). The last-picked profile
is persisted as the registry default.

## Writing a HEAT plugin

A plugin is a directory under `overlay/heat/plugins/<name>/`:

```
overlay/heat/plugins/my_plugin/
  manifest.json
  plugin.py
```

`manifest.json`:

```json
{
  "name": "my_plugin",
  "version": "0.1",
  "description": "What it does.",
  "entry": "plugin:MyPlugin",
  "default_config": { ... }
}
```

`plugin.py`:

```python
from overlay.heat.plugin_api import HeatContext, HeatPlugin

class MyPlugin(HeatPlugin):
    def setup(self, ctx: HeatContext):
        ctx.hotkeys.register("ctrl+m", self.on_hotkey)
        # ctx.config — per-plugin ConfigManager
        # ctx.assets_dir — Path to /assets
        # ctx.host.subscribe_mouse(cb) — global mouse fan-out

    def enter_calibrate(self): ...
    def enter_locked(self):    ...
    def tick(self, dt):        ...  # ~20 Hz idle pump
    def teardown(self):        ...
```

The host owns the Tk root, the single `pynput` keyboard + mouse listeners,
and the global `Ctrl+L` lock-toggle / `Ctrl+P` quit hotkeys. Plugins never
create their own listeners.

## CLI shortcuts

```bat
:: skip the picker and launch the AMX-10RC predictor directly
python run_heat_ailos_torc.py --profile amx_10rc --mode predictor

:: stats only — no overlay
python run_heat_ailos_torc.py --profile amx_10rc --mode trainer -- --stats
```

Anything after `--` (or any unknown flag) is forwarded to the underlying
predictor / trainer / refiner argparse surface.

## Dependencies

See `requirements.txt`. Notable: `pillow`, `numpy`, `pynput`, `loguru`,
`pyserial` (Arduino backend), `pyautogui` / `mss` (OCR + screen capture),
`matplotlib` (sim visualiser only).

## License

See repo metadata.
