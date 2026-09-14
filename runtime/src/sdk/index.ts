/**
 * Public plugin SDK surface - published as `@fuse/plugin-sdk`. Plugin authors
 * import their base class, context type, and helper classes from here.
 */
export { FusePlugin } from "./plugin.js";
export type { FuseContext, HostView, HostState, TeardownReason } from "./plugin.js";
export { HotkeyRegistryView } from "./hotkeys.js";
export type { BindingInfo, PluginHotkeys } from "./hotkeys.js";
export { PluginAssets } from "./assets.js";
export { ConfigCategory, ConfigEntry, serializeSchema } from "./configSchema.js";
export type { ConfigEntryType, ConfigEntryInit, ConfigSchemaItem } from "./configSchema.js";
export type { PluginConfigApi } from "./config.js";
export type { PluginEvents, EventHandler } from "./events.js";
export type { PluginServices, ServiceSpec, ServiceHandle } from "./services.js";
export type {
  OverlayManager,
  OverlayHandle,
  OverlayDeclaration,
  OverlayKind,
  Rect,
  Size,
} from "./overlay.js";
export type {
  OverlayInspector,
  InspectorSection,
  InspectorControl,
  InputPhase,
  When,
  Option,
  ControlBase,
  SliderControl,
  NumberControl,
  Vec2Control,
  ToggleControl,
  SwitchControl,
  SegmentedControl,
  ButtonsControl,
  SelectControl,
  TextControl,
  ColorControl,
  RadioControl,
  ButtonControl,
  ButtonRowControl,
  KeybindControl,
  NoteControl,
  DividerControl,
} from "./inspector.js";
export type { StageNotifier, StageNotificationInit, StageNotificationType } from "./notifications.js";
export type { PluginAudio, PlayOptions } from "./audio.js";
export type { PluginPermissions, PermissionState } from "./permissions.js";
export type { PluginStorage, StorageCollection, StorageQuery, StorageWhere, StorageOp } from "./storage.js";
export type { PluginSecrets } from "./secrets.js";
export type { PluginLinks } from "./links.js";
