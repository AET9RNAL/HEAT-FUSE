<script setup lang="ts">
import { ref, shallowRef, onBeforeUnmount, watch, computed } from "vue";
import { overlayBus, assetBase, hostState, sendAction, sourceRev } from "../overlayClient";
import type { OverlayDescriptor } from "../types";
import type { OverlayInput } from "../rive";

const props = defineProps<{ descriptor: OverlayDescriptor }>();

const data = ref<Record<string, unknown>>({});
const comp = shallowRef<any>(null);
const loadError = ref<string | null>(null);

// Dev source revision for plugins
function withRev(url: string): string {
  if (!sourceRev.value) return url;
  return url + (url.includes("?") ? "&" : "?") + `v=${sourceRev.value}`;
}

const fullUrl = computed(() => withRev(assetBase() + props.descriptor.assetUrl));

// Absolute base for this plugin's served assets (the overlay's own asset dir,
// minus the component filename). Handed to the mounted component so overlays can
// build image URLs (`${assetBase}/assets/...`) without hardcoding host/port.
const assetBaseUrl = computed(() => assetBase() + props.descriptor.assetUrl.replace(/\/[^/]*$/, ""));

// Back-channel: interactive overlays call this to notify the owning plugin.
function emitAction(action: string, payload?: unknown): void {
  sendAction(props.descriptor.overlayId, action, payload);
}

// Host-provided libraries, handed to plugin overlays via moduleCache (bundled
// once in the overlay app). Any other bare specifier is treated as a
// cross-plugin import `<pluginId>/<path>` and fetched from that plugin's assets
// - so a plugin can ship a reusable component library with no app changes.
const HOST_MODULES = new Set(["vue", "motion-v", "@rive-app/canvas", "chart.js", "chart.js/auto"]);
// De-duped stylesheet injection (e.g. a UI library's tokens imported by many
// overlays), keyed by URL without the dev revision so a reload updates the one
// existing <style> in place rather than appending another.
const injectedCss = new Map<string, { url: string; el: HTMLStyleElement }>();

/**
 * <style> elements this overlay's own SFCs produced, dropped once a newer
 * compile of the same overlay has succeeded. Without this a dev reload stacks
 * another copy of every scoped block, and the stale rules keep applying.
 */
let ownStyles: HTMLStyleElement[] = [];

async function loadComponent(url: string): Promise<void> {
  loadError.value = null;
  const pendingStyles: HTMLStyleElement[] = [];
  try {
    const [{ loadModule }, vue, motion, rive, chart] = await Promise.all([
      import("vue3-sfc-loader"),
      import("vue"),
      import("motion-v"),
      import("@rive-app/canvas"),
      // `chart.js/auto` self-registers every controller/scale, so overlays can
      // `new Chart(...)` without wiring up registrations themselves.
      import("chart.js/auto"),
    ]);
    const overlayAssetRoot = `${assetBase()}/overlay-asset`;
    const mod = await loadModule(url, {
      moduleCache: {
        vue,
        "motion-v": motion,
        "@rive-app/canvas": rive,
        "chart.js": chart,
        "chart.js/auto": chart,
      },
      pathResolve({ refPath, relPath }: { refPath: string | undefined; relPath: string }) {
        const rel = String(relPath);
        if (HOST_MODULES.has(rel)) return rel;
        if (/^https?:\/\//.test(rel)) return rel;
        // Every plugin-served URL carries the revision too, or a reload would
        // recompile the entry against stale children. `new URL` drops the
        // referrer's query, so it is re-applied here rather than inherited.
        if (rel.startsWith(".") && refPath) return withRev(new URL(rel, String(refPath)).href);
        const lastSeg = rel.split("/").pop() ?? "";
        const suffix = lastSeg.includes(".") ? "" : "/index.js";
        return withRev(`${overlayAssetRoot}/${rel}${suffix}`);
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
          const url_ = String(path);
          const key = url_.split("?")[0];
          const prev = injectedCss.get(key);
          // Same URL means same revision — already injected, nothing to do.
          if (prev && prev.url === url_) return {};
          const text = String(await getContentData(false));
          if (prev) {
            prev.el.textContent = text;
            prev.url = url_;
            return {};
          }
          const el = document.createElement("style");
          el.textContent = text;
          document.head.appendChild(el);
          injectedCss.set(key, { url: url_, el });
          return {};
        }
        if (type === ".vue" || type === ".js" || type === ".mjs") return undefined;
        return { default: String(path) };
      },
      addStyle(styleText: string) {
        const el = document.createElement("style");
        el.textContent = styleText;
        document.head.appendChild(el);
        pendingStyles.push(el);
      },
    });
    comp.value = mod.default ?? mod;
    for (const el of ownStyles) el.remove();
    ownStyles = pendingStyles;
  } catch (e) {
    // The previous component stays mounted, so its styles must stay too.
    for (const el of pendingStyles) el.remove();
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
  for (const el of ownStyles) el.remove();
  ownStyles = [];
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
