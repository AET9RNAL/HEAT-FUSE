// The battle_hud builder of each reticle in reticles/index.mjs, by id.
import type { NativeReticle } from "../native.js";
import { bracketsNative } from "./brackets/native.js";
import { ringNative } from "./ring/native.js";
import { triangleNative } from "./triangle/native.js";

export const NATIVES: Record<string, NativeReticle> = { triangle: triangleNative, brackets: bracketsNative, ring: ringNative };
