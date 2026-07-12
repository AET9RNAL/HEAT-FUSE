import { createApp } from "vue";
import { RuntimeLoader } from "@rive-app/canvas";
// Bundle the Rive WASM locally (Vite copies it to dist) so overlays render
// without a runtime CDN fetch. Must be set before any Rive instance is created.
import riveWasmUrl from "@rive-app/canvas/rive.wasm?url";
import StageApp from "./StageApp.vue";
import "./overlay.css";

RuntimeLoader.setWasmUrl(riveWasmUrl);

createApp(StageApp).mount("#overlay-app");
