<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from "vue";
import { RiveOverlayController, type OverlayInput } from "../rive";
import { overlayBus, assetBase } from "../overlayClient";
import type { OverlayDescriptor } from "../types";

const props = defineProps<{ descriptor: OverlayDescriptor }>();

const canvas = ref<HTMLCanvasElement | null>(null);
let ctrl: RiveOverlayController | null = null;

function onData(inputs: Record<string, OverlayInput>): void {
  ctrl?.apply(inputs);
}

onMounted(async () => {
  if (!canvas.value) return;
  try {
    const buffer = await (await fetch(assetBase() + props.descriptor.assetUrl)).arrayBuffer();
    ctrl = new RiveOverlayController(canvas.value, {
      buffer,
      artboard: props.descriptor.artboard,
      stateMachine: props.descriptor.stateMachine,
      viewModel: props.descriptor.viewModel,
      onReady: () => ctrl?.apply(props.descriptor.inputs ?? {}),
      onError: (m) => console.error(`[overlay ${props.descriptor.overlayId}] rive:`, m),
    });
    overlayBus.on(props.descriptor.overlayId, onData);
  } catch (e) {
    console.error(`[overlay ${props.descriptor.overlayId}] load failed:`, e);
  }
});

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
