import { FusePlugin, type FuseContext } from "@fuse/plugin-sdk";

export class CanvasUiPlugin extends FusePlugin {
  static override pluginName = "Canvas UI";
  static override version = "1.0.0";
  static override description = "Canvas-UI effects library";

  setup(_ctx: FuseContext): void {
  }
}
