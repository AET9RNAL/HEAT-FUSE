import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node20",
  platform: "node",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  dts: false,
  // Bundled CJS deps (ws, chrome-remote-interface) do dynamic require()s of node
  // builtins ('events', 'net', …). esbuild's ESM output shims require() to throw
  // on dynamic calls — but it first delegates to a real `require` if one exists
  // in scope. Provide it via createRequire so those calls (and ws's optional
  // bufferutil/utf-8-validate probes) resolve at runtime.
  banner: {
    js: "import { createRequire as __fuseCreateRequire } from 'module'; const require = __fuseCreateRequire(import.meta.url);",
  },
  // tsup externalizes package.json `dependencies` by default. In prod only the
  // native addons ship in resources/runtime/node_modules, so an external pure-JS
  // dep (ws, fflate, …) fails to resolve at runtime (ERR_MODULE_NOT_FOUND).
  // Explicitly bundle the pure-JS deps; leave the rest external:
  //  - uiohook-napi / nut-js: native .node addons — MUST stay external so their
  //    JS wrapper keeps resolving the binary relative to node_modules. Shipped
  //    via extraResources.
  //  - bufferutil / utf-8-validate: ws's OPTIONAL native speedups; not installed
  //    and require()d in a try/catch, so a failed resolve is harmless. External
  //    so esbuild doesn't error trying to inline them.
  noExternal: ["ws", "fflate", "chrome-remote-interface", "zod"],
  external: ["uiohook-napi", "@nut-tree-fork/nut-js", "bufferutil", "utf-8-validate"],
});
