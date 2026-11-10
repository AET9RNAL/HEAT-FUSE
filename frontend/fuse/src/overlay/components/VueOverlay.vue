<script setup lang="ts">
import { ref, onBeforeUnmount, computed } from "vue";
import { overlayBus, assetBase, hostState, sendAction } from "../overlayClient";
import { useSfcComponent, withRev } from "../composables/useSfcComponent";
import type { OverlayDescriptor } from "../types";
import type { OverlayInput } from "../rive";

const props = defineProps<{ descriptor: OverlayDescriptor }>();

const data = ref<Record<string, unknown>>({});

const fullUrl = computed(() => withRev(assetBase() + props.descriptor.assetUrl));
const { comp, loadError } = useSfcComponent(fullUrl);

// Absolute base for this plugin's served assets (the overlay's own asset dir,
// minus the component filename). Handed to the mounted component so overlays can
// build image URLs (`${assetBase}/assets/...`) without hardcoding host/port.
const assetBaseUrl = computed(() => assetBase() + props.descriptor.assetUrl.replace(/\/[^/]*$/, ""));

// Back-channel: interactive overlays call this to notify the owning plugin.
function emitAction(action: string, payload?: unknown): void {
  sendAction(props.descriptor.overlayId, action, payload);
}

// Generic: overlay inputs become props on the mounted component. Plugins push
// scalars (number/bool/string/color/enum) or structured values
function applyInput(path: string, input: OverlayInput): void {
  switch (input.t) {
    case "number":
    case "color":
      data.value[path] = Number(input.v);
      break;
    case "bool":
      data.value[path] = Boolean(input.v);
      break;
    case "string":
    case "enum":
      data.value[path] = String(input.v);
      break;
    case "json":
      data.value[path] = input.v;
      break;
    case "trigger":
      break;
  }
}

function onData(inputs: Record<string, OverlayInput>): void {
  for (const [path, input] of Object.entries(inputs)) {
    applyInput(path, input);
  }
}

if (props.descriptor.inputs) {
  for (const [path, input] of Object.entries(props.descriptor.inputs)) {
    applyInput(path, input);
  }
}

overlayBus.on(props.descriptor.overlayId, onData);

onBeforeUnmount(() => {
  overlayBus.off(props.descriptor.overlayId, onData);
});
</script>

<template>
  <component
    :is="comp"
    v-if="comp"
    :data="data"
    :state="hostState"
    :interactive="hostState === 'interactive'"
    :emit-action="emitAction"
    :asset-base="assetBaseUrl"
  />
  <div v-else-if="loadError" class="load-error">overlay load error: {{ loadError }}</div>
  <div v-else class="loading">loading overlay...</div>
</template>

<style scoped>
.load-error {
  color: var(--error-highlight);
  font: 12px monospace;
}
.loading {
  color: var(--text-muted);
  font: 12px monospace;
}
</style>
