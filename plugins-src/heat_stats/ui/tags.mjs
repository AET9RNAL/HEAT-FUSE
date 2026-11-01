import { inject } from "vue";

/**
 * The tag vocabulary, shared by the Tags tab, the roster marks and the
 * in-game scoreboard. The slug is the icon's file name and the value stored
 * in player_tags.tags, so these three never drift apart.
 */
export const GROUPS = ["danger", "target", "friend", "lowSkill", "trash", "blocked"];

export const MARK_SLOTS = 3;

const TWINS = new Set(["danger", "friend", "target"]);

export function tagIcon(id, solid = false) {
  return solid && TWINS.has(id) ? `${id}Solid` : id;
}

export function cleanTags(value) {
  const seen = new Set();
  for (const raw of Array.isArray(value) ? value : []) {
    const id = String(raw);
    if (GROUPS.includes(id)) seen.add(id);
  }
  return [...seen];
}

/** player id -> tag list*/
export function tagIndex(players) {
  const index = new Map();
  for (const raw of Array.isArray(players) ? players : []) {
    const pid = raw && raw.pid != null ? String(raw.pid) : "";
    const tags = cleanTags(raw && raw.tags);
    if (pid && tags.length) index.set(pid, tags);
  }
  return index;
}

export const TAGS = Symbol("heatStatsTags");

/** The marks a player carries, wherever they turn up. Empty until the plugin sends any. */
export function useTags() {
  return inject(TAGS, () => ({ marks: (pid) => (pid ? [] : []), color: (id) => (id ? "var(--accent-200)" : "") }), true);
}
