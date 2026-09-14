import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node20",
  platform: "node",
  outDir: "dist",
  // tsup globs `["**/*", ...clean]` under outDir, so the negation spares
  // dist/node_modules — staged separately by stage-native-deps.cjs, never built
  // here, and holding the native .node addons. On Windows a running sidecar has
  // uiohook-napi.node mapped, and unlinking a mapped image fails EPERM, which
  // would abort the whole build.
  clean: ["!node_modules/**"],
  // Inline, not external: the DevTools frontend's CSP (`connect-src data: …
  // 'self' devtools: ws://127.0.0.1:*`) blocks the file:// fetch of a sibling
  // .map, so an external sourcemap never loads in the runtime debug window.
  // A data: URI rides in the script source over CDP and is allowed.
  sourcemap: "inline",
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
