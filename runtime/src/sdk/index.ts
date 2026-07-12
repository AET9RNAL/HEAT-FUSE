/**
 * Public plugin SDK surface - published as `@fuse/plugin-sdk`. Plugin authors
 * import their base class, context type, and helper classes from here.
 */
export { FusePlugin } from "./plugin.js";
export type { FuseContext, HostView, HostState } from "./plugin.js";
export { HotkeyRegistryView } from "./hotkeys.js";
export type { BindingInfo } from "./hotkeys.js";
export { PluginAssets } from "./assets.js";
export { ConfigCategory, ConfigEntry, serializeSchema } from "./configSchema.js";
export type { ConfigEntryType, ConfigEntryInit } from "./configSchema.js";
export type {
  OverlayManager,
  OverlayHandle,
  OverlayDeclaration,
  OverlayKind,
  Rect,
  Size,
} from "./overlay.js";
