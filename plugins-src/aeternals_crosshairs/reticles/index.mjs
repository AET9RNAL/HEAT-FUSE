// Every reticle the manager offers. A new reticle: a folder with meta.mjs, its .vue renderer and native.ts,
// then one line here, one in natives.ts and one in CrosshairManager.vue.
import brackets from "./brackets/meta.mjs";
import ring from "./ring/meta.mjs";
import triangle from "./triangle/meta.mjs";

export const RETICLES = [triangle, brackets, ring];
