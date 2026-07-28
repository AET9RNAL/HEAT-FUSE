import { createApp } from "vue";
import { RuntimeLoader } from "@rive-app/canvas";
import { RuntimeLoader as RuntimeLoaderWebGL2 } from "@rive-app/webgl2";
import riveWasmUrl from "@rive-app/canvas/rive.wasm?url";
import riveWasmUrlWebGL2 from "@rive-app/webgl2/rive.wasm?url";
import StageApp from "./StageApp.vue";
import "./overlay.css";

RuntimeLoader.setWasmUrl(riveWasmUrl);
RuntimeLoaderWebGL2.setWasmUrl(riveWasmUrlWebGL2);

createApp(StageApp).mount("#overlay-app");
