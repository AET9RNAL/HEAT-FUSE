<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from "vue";
import { RiveOverlayController, type OverlayInput } from "../rive";
import { overlayBus, assetBase } from "../overlayClient";
import type { OverlayDescriptor } from "../types";

const props = defineProps<{ descriptor: OverlayDescriptor }>();

const canvas = ref<HTMLCanvasElement | null>(null);
let ctrl: RiveOverlayController | null = null;
/** The component went away while the .riv was still loading. */
let disposed = false;
let boxWatcher: ResizeObserver | null = null;

// Hydration snapshot first, live frames merged on top, so nothing sent during the .riv fetch is lost.
let queued: Record<string, OverlayInput> = { ...(props.descriptor.inputs ?? {}) };

function onData(inputs: Record<string, OverlayInput>): void {
  if (ctrl) ctrl.apply(inputs);
  else Object.assign(queued, inputs);
}

overlayBus.on(props.descriptor.overlayId, onData);

onMounted(async () => {
  const el = canvas.value;
  if (!el) return;
  const { overlayId, assetUrl, size } = props.descriptor;
  // A hidden overlay is display:none, so the canvas has no CSS box and Rive
  // would size its surface to 0x0. Resize once the element gets a box.
  boxWatcher = new ResizeObserver(() => ctrl?.resize());
  boxWatcher.observe(el);
  try {
    const res = await fetch(assetBase() + assetUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${assetUrl}`);
    const buffer = await res.arrayBuffer();
    // The fetch outlived the component: never leave an orphan instance holding
    // a WebGL2 context
    if (disposed) return;
    ctrl = new RiveOverlayController(el, {
      buffer,
      artboard: props.descriptor.artboard,
      stateMachine: props.descriptor.stateMachine,
      viewModel: props.descriptor.viewModel,
      onError: (m) => console.error(`[overlay ${overlayId}] rive: ${m} (${assetUrl}, ${size.w}x${size.h})`),
    });
    if (disposed) {
      ctrl.destroy();
      ctrl = null;
      return;
    }
    // The controller holds these until the file is ready.
    ctrl.apply(queued);
    queued = {};
  } catch (e) {
    console.error(`[overlay ${overlayId}] load failed:`, e);
  }
});

// A live size change re-binds the canvas attributes; Rive's drawing surface has to follow once they land.
watch(
  () => [props.descriptor.size.w, props.descriptor.size.h],
  () => ctrl?.resize(),
  { flush: "post" },
);

onBeforeUnmount(() => {
  disposed = true;
  boxWatcher?.disconnect();
  boxWatcher = null;
  overlayBus.off(props.descriptor.overlayId, onData);
  ctrl?.destroy();
  ctrl = null;
});
</script>

<template>
  <canvas ref="canvas" :width="descriptor.size.w" :height="descriptor.size.h" class="rive-canvas" />
</template>

<style scoped>
.rive-canvas {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
