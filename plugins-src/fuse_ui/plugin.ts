import { FusePlugin, type FuseContext } from "@fuse/plugin-sdk";

/**
 * FUSE UI — a *library* plugin.
 *
 * It declares no overlays and does no runtime work. Its purpose is to ship the
 * reusable Vue components under `ui/` as plugin assets: once loaded, the overlay
 * hub serves them at `/overlay-asset/fuse_ui/ui/...`, and other plugins that
 * declare `"dependencies": ["fuse_ui"]` can `import { eButton } from "@fuse/ui"`
 * inside their Vue overlays (the overlay stage's sfc-loader maps `@fuse/ui` to
 * this plugin's asset URLs).
 */
export class FuseUiPlugin extends FusePlugin {
  static override pluginName = "FUSE UI";
  static override version = "1.0.0";
  static override description = "Shared Vue overlay component library (@fuse/ui).";

  setup(_ctx: FuseContext): void {
    // No-op: assets are served by the overlay hub as soon as the plugin loads.
  }
}
