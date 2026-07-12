<script setup lang="ts">
import { ref, shallowRef, onBeforeUnmount, watch, computed } from "vue";
import { overlayBus, assetBase, hostState, sendAction } from "../overlayClient";
import type { OverlayDescriptor } from "../types";
import type { OverlayInput } from "../rive";

const props = defineProps<{ descriptor: OverlayDescriptor }>();

const data = ref<Record<string, unknown>>({});
const comp = shallowRef<any>(null);
const loadError = ref<string | null>(null);

const fullUrl = computed(() => assetBase() + props.descriptor.assetUrl);

// Back-channel: interactive overlays call this to notify the owning plugin.
function emitAction(action: string, payload?: unknown): void {
  sendAction(props.descriptor.overlayId, action, payload);
}

async function loadComponent(url: string): Promise<void> {
  loadError.value = null;
  try {
    const { loadModule } = await import("vue3-sfc-loader");
    const mod = await loadModule(url, {
      moduleCache: { vue: await import("vue") },
      async getFile(url: string) {
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        return { getContentData: async (asBinary: boolean) => (asBinary ? new Uint8Array(await resp.arrayBuffer()) : await resp.text()) };
      },
      addStyle(styleText: string) {
        const el = document.createElement("style");
        el.textContent = styleText;
        document.head.appendChild(el);
      },
    });
    comp.value = mod.default ?? mod;
  } catch (e) {
    loadError.value = String(e instanceof Error ? e.message : e);
  }
}

watch(fullUrl, (url) => { if (url) void loadComponent(url); }, { immediate: true });

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
  />
  <div v-else-if="loadError" class="load-error">overlay load error: {{ loadError }}</div>
  <div v-else class="loading">loading overlay...</div>
</template>

<style scoped>
.load-error {
  color: #ff6b6b;
  font: 12px monospace;
}
.loading {
  color: #888;
  font: 12px monospace;
}
</style>
