<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from "vue";
import { RiveOverlayController, type OverlayInput } from "../rive";
import { overlayBus, assetBase } from "../overlayClient";
import type { OverlayDescriptor } from "../types";

const props = defineProps<{ descriptor: OverlayDescriptor }>();

const canvas = ref<HTMLCanvasElement | null>(null);
let ctrl: RiveOverlayController | null = null;

// Hydration snapshot first, live frames merged on top, so nothing sent during the .riv fetch is lost.
let queued: Record<string, OverlayInput> = { ...(props.descriptor.inputs ?? {}) };

function onData(inputs: Record<string, OverlayInput>): void {
  if (ctrl) ctrl.apply(inputs);
  else Object.assign(queued, inputs);
}

overlayBus.on(props.descriptor.overlayId, onData);

onMounted(async () => {
  if (!canvas.value) return;
  try {
    const buffer = await (await fetch(assetBase() + props.descriptor.assetUrl)).arrayBuffer();
    ctrl = new RiveOverlayController(canvas.value, {
      buffer,
      artboard: props.descriptor.artboard,
      stateMachine: props.descriptor.stateMachine,
      viewModel: props.descriptor.viewModel,
      onError: (m) => console.error(`[overlay ${props.descriptor.overlayId}] rive:`, m),
    });
    // The controller holds these until the file is ready.
    ctrl.apply(queued);
    queued = {};
  } catch (e) {
    console.error(`[overlay ${props.descriptor.overlayId}] load failed:`, e);
  }
});

// A live size change re-binds the canvas attributes; Rive's drawing surface has to follow once they land.
watch(
  () => [props.descriptor.size.w, props.descriptor.size.h],
  () => ctrl?.resize(),
  { flush: "post" },
);

onBeforeUnmount(() => {
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
