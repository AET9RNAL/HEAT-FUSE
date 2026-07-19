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

// Host-provided libraries, handed to plugin overlays via moduleCache (bundled
// once in the overlay app). Any other bare specifier is treated as a
// cross-plugin import `<pluginId>/<path>` and fetched from that plugin's assets
// - so a plugin can ship a reusable component library with no app changes.
const HOST_MODULES = new Set(["vue", "motion-v", "@rive-app/canvas"]);
// De-duped stylesheet injection (e.g. a UI library's tokens imported by many
// overlays).
const injectedCss = new Set<string>();

async function loadComponent(url: string): Promise<void> {
  loadError.value = null;
  try {
    const [{ loadModule }, vue, motion, rive] = await Promise.all([
      import("vue3-sfc-loader"),
      import("vue"),
      import("motion-v"),
      import("@rive-app/canvas"),
    ]);
    const overlayAssetRoot = `${assetBase()}/overlay-asset`;
    const mod = await loadModule(url, {
      moduleCache: { vue, "motion-v": motion, "@rive-app/canvas": rive },
      pathResolve({ refPath, relPath }: { refPath: string | undefined; relPath: string }) {
        const rel = String(relPath);
        if (HOST_MODULES.has(rel)) return rel;
        if (/^https?:\/\//.test(rel)) return rel;
        if (rel.startsWith(".") && refPath) return new URL(rel, String(refPath)).href;
        const lastSeg = rel.split("/").pop() ?? "";
        const suffix = lastSeg.includes(".") ? "" : "/index.js";
        return `${overlayAssetRoot}/${rel}${suffix}`;
      },
      // Lazy fetch: content is only pulled when a handler actually reads it, so
      // asset-URL imports (below) don't download the file twice.
      async getFile(u: string) {
        return {
          getContentData: async (asBinary: boolean) => {
            const resp = await fetch(u);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            return asBinary ? new Uint8Array(await resp.arrayBuffer()) : await resp.text();
          },
        };
      },
      async handleModule(type: string, getContentData: (asBinary: boolean) => Promise<string | ArrayBuffer>, path: string) {
        if (type === ".css") {
          const key = String(path);
          if (!injectedCss.has(key)) {
            injectedCss.add(key);
            const el = document.createElement("style");
            el.textContent = String(await getContentData(false));
            document.head.appendChild(el);
          }
          return {};
        }
        if (type === ".vue" || type === ".js" || type === ".mjs") return undefined;
        return { default: String(path) };
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
  color: var(--error-highlight);
  font: 12px monospace;
}
.loading {
  color: var(--text-muted);
  font: 12px monospace;
}
</style>
