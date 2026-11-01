import { inject } from "vue";
import { EQUIPMENT, MODULES, PERKS, TALISMANS } from "./partIndex.mjs";

export const ASSETS = Symbol("heatStatsAssets");

const PARTS = { module: MODULES, equipment: EQUIPMENT, perk: PERKS, talisman: TALISMANS };

/** map_slug is the folder of the game's match background, /ui/assets/worlds/<slug>/. */
const MAPS = {
  "01_beirut": "scarred_city.jpg",
  "02_vietnam": "blossom_crash.jpg",
  "03_sunstroke": "sunstroke.jpg",
  "04_nordoko": "nord_oko.jpg",
  "05_friendshipdam": "nexus_dam.jpg",
  "06_aircraftcarrier": "aircraft_carrier.jpg",
  "07_projectphoenix": "phoenix.jpg",
  "08_inferno": "inferno_one.jpg",
  "09_moonshot": "moonshot.jpg",
  "10_eden": "eden.jpeg",
};

export function createAssets(state) {
  const root = () => `${state.base ?? ""}/assets`;
  return {
    logo: () => `${root()}/HSLogo.svg`,
    /** Vehicle keys are the slugs the renders are named after: `gb01_challenger`. */
    tank: (key) => (key ? `${root()}/tanks/${key}.png` : ""),

    agent: (name) => (name ? `${root()}/agents/${String(name).toLowerCase()}.png` : ""),

    /** Tag group icons; the slug is the file name, so it is also what the DB stores. */
    tag: (name) => (name ? `${root()}/icons/tags/${name}.svg` : ""),

    role: (role, outline = false) =>
      role ? `${root()}/classes/${String(role).toLowerCase()}${outline ? "_outline" : ""}.svg` : "",

    /** A loadout part by kind and game id: module, equipment, perk or talisman. "" when there is no art. */
    part: (kind, id) => {
      const file = PARTS[kind]?.[id];
      return file ? `${root()}/${file}` : "";
    },

    map: (slug) => (MAPS[slug] ? `${root()}/maps/${MAPS[slug]}` : ""),
  };
}

export function useAssets() {
  return inject(ASSETS, () => createAssets({ base: "" }), true);
}
