// canvas_ui/ui barrel. Exposes canvas-effect components to plugin overlays:
//
//   import { Glitch } from "canvas_ui/ui/index.js";
//
// vue3-sfc-loader parses non-setup <script> blocks as classic scripts, so
// runtime exports (export function) are not supported — only type exports
// (which TS strips) work. The factories are accessible inside the SFC's own
// <script setup> but not from external importers.
//
// Effects rely on the html-in-canvas API (CanvasDrawElement Chromium feature).
// Components fall back to plain HTML rendering without it.
export { default as Asciify } from "./Asciifi.vue";
export { default as Bend } from "./Bend.vue";
export { default as DecryptReveal } from "./DecryptReveal.vue";
export { default as Displacement } from "./Displacement.vue";
export { default as FlameWrap } from "./FlameWrap.vue";
export { default as ForceField } from "./ForceField.vue";
export { default as GlassObject } from "./GlassObject.vue";
export { default as Glitch } from "./Glitch.vue";
export { default as Laser } from "./Laser.vue";
export { default as WaveWarp } from "./WaveWarp.vue";
