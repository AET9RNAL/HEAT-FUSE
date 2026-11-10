/**
 * Loads a plugin's Vue SFC from the runtime and compiles it in the stage page.
 * Shared by Vue overlays and app windows.
 */
import { onBeforeUnmount, ref, shallowRef, watch, type Component, type Ref } from "vue";
import { assetBase, sourceRev } from "../overlayClient";

/** The dev source revision folded into a plugin URL, so an edit recompiles instead of reusing the cache. */
export function withRev(url: string, rev = sourceRev.value): string {
  if (!rev) return url;
  return url + (url.includes("?") ? "&" : "?") + `v=${rev}`;
}

// Host-provided libraries, handed to plugin views via moduleCache (bundled once in
// the stage app). Any other bare specifier is a cross-plugin import
// `<pluginId>/<path>`, fetched from that plugin's assets.
const HOST_MODULES = new Set(["vue", "motion-v", "@rive-app/canvas", "chart.js", "chart.js/auto"]);

let hostLibs: Promise<Record<string, unknown>> | null = null;

function loadHostLibs(): Promise<Record<string, unknown>> {
  hostLibs ??= (async () => {
    const [vue, motion, rive, chart] = await Promise.all([
      import("vue"),
      import("motion-v"),
      import("@rive-app/canvas"),
      // `chart.js/auto` registers every controller and scale, so views can `new Chart(...)` at once.
      import("chart.js/auto"),
    ]);
    return { vue, "motion-v": motion, "@rive-app/canvas": rive, "chart.js": chart, "chart.js/auto": chart };
  })();
  return hostLibs;
}

/**
 * Stylesheets that SFCs import, shared by every
 * view that imports them. Keyed by URL without the dev revision, so a reload updates
 * the one <style> in place. A sheet goes when its last user unmounts.
 */
const sharedCss = new Map<string, { url: string; el: HTMLStyleElement; users: number }>();

export function useSfcComponent(url: Ref<string>): { comp: Ref<Component | null>; loadError: Ref<string | null> } {
  const comp = shallowRef<Component | null>(null);
  const loadError = ref<string | null>(null);
  /** The <style> elements of this view's own SFCs, swapped once a newer compile succeeds. */
  let ownStyles: HTMLStyleElement[] = [];
  /** The shared sheets this view counts as a user of. */
  const usedCss = new Set<string>();
  /** Only the newest load may mount. Unmount bumps it too, so a load in flight drops itself. */
  let loadSeq = 0;

  async function load(target: string): Promise<void> {
    const seq = ++loadSeq;
    // Children use the revision this load started on, never a newer one.
    const rev = sourceRev.value;
    const superseded = (): void => {
      if (seq !== loadSeq) throw new Error("superseded");
    };
    loadError.value = null;
    const pendingStyles: HTMLStyleElement[] = [];
    try {
      const [{ loadModule }, libs] = await Promise.all([import("vue3-sfc-loader"), loadHostLibs()]);
      // The loader calls addStyle only for a module it compiles, so a load shares no modules with another load.
      const moduleCache: Record<string, unknown> = Object.assign(Object.create(null), libs);
      const assetRoot = `${assetBase()}/overlay-asset`;
      const mod = await loadModule(target, {
        moduleCache,
        pathResolve({ refPath, relPath }: { refPath: string | undefined; relPath: string }) {
          const rel = String(relPath);
          if (HOST_MODULES.has(rel)) return rel;
          if (/^https?:\/\//.test(rel)) return rel;
          // Every plugin URL carries the revision, or a reload would compile the entry
          // against stale children. `new URL` drops the referrer's query, so it is set again here.
          if (rel.startsWith(".") && refPath) return withRev(new URL(rel, String(refPath)).href, rev);
          const lastSeg = rel.split("/").pop() ?? "";
          const suffix = lastSeg.includes(".") ? "" : "/index.js";
          return withRev(`${assetRoot}/${rel}${suffix}`, rev);
        },
        // Lazy fetch: content comes only when a handler reads it, so asset-URL imports do not download twice.
        async getFile(u: string) {
          return {
            getContentData: async (asBinary: boolean) => {
              superseded();
              const resp = await fetch(u);
              if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
              return asBinary ? new Uint8Array(await resp.arrayBuffer()) : await resp.text();
            },
          };
        },
        async handleModule(type: string, getContentData: (asBinary: boolean) => Promise<string | ArrayBuffer>, path: string) {
          if (type === ".css") {
            const cssUrl = String(path);
            const key = cssUrl.split("?")[0] ?? cssUrl;
            const prev = sharedCss.get(key);
            if (prev && !usedCss.has(key)) {
              prev.users += 1;
              usedCss.add(key);
            }
            // The same URL means the same revision: nothing to do.
            if (prev && prev.url === cssUrl) return {};
            const text = String(await getContentData(false));
            // A stale load must not write older text over a newer load's.
            superseded();
            const now = sharedCss.get(key);
            if (now) {
              now.el.textContent = text;
              now.url = cssUrl;
              return {};
            }
            const el = document.createElement("style");
            el.textContent = text;
            document.head.appendChild(el);
            sharedCss.set(key, { url: cssUrl, el, users: 1 });
            usedCss.add(key);
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
      // A newer load started while this one compiled: drop this one.
      if (seq !== loadSeq) {
        for (const el of pendingStyles) el.remove();
        return;
      }
      comp.value = ((mod as { default?: unknown }).default ?? mod) as Component;
      for (const el of ownStyles) el.remove();
      ownStyles = pendingStyles;
    } catch (e) {
      // The previous component stays mounted, so its styles stay too.
      for (const el of pendingStyles) el.remove();
      if (seq !== loadSeq) return;
      loadError.value = String(e instanceof Error ? e.message : e);
    }
  }

  watch(
    url,
    (u) => {
      if (u) void load(u);
    },
    { immediate: true },
  );

  onBeforeUnmount(() => {
    loadSeq++;
    for (const el of ownStyles) el.remove();
    ownStyles = [];
    for (const key of usedCss) {
      const entry = sharedCss.get(key);
      if (!entry) continue;
      entry.users -= 1;
      if (entry.users > 0) continue;
      entry.el.remove();
      sharedCss.delete(key);
    }
    usedCss.clear();
  });

  return { comp, loadError };
}
