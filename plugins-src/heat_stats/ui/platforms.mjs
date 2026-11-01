/**
 * Steam=0, SteamDeck=1, Wgc=2, Xbox=3, Psn=4, Unknown=5. 
 */
export const PLATFORM_NAMES = {
  0: "Steam",
  1: "Steam Deck",
  2: "WGC",
  3: "Xbox",
  4: "PS5",
  5: "Unknown",
};

export function platformName(v) {
  return v != null ? (PLATFORM_NAMES[v] ?? null) : null;
}

/** Icons.vue kinds (heat_stats/assets/icons); SteamDeck runs the Steam client. */
export const PLATFORM_ICONS = {
  0: "steam",
  1: "steam",
  2: "wgc",
  3: "xbox",
  4: "psFive",
};

export function platformIcon(v) {
  return v != null ? (PLATFORM_ICONS[v] ?? null) : null;
}
