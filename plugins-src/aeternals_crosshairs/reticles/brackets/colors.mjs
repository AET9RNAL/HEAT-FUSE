// The brackets' colours from their settings, as CSS rgba() for the preview and the game HUD alike.

export const COLOR_DEFAULTS = {
  brackets_color: "#FFFFFFFF",
  brackets_reload_color: "#FFFFFF80",
  brackets_center_color: "#FFFFFFFF",
  brackets_backdrop_color: "#FFFFFF80",
  brackets_bar_color: "#FFFFFFFF",
  brackets_bar_work_color: "#00000080",
  brackets_bar_base_color: "#00000080",
};

/** "#RRGGBB[AA]" as rgba(), its alpha times `alphaMul`. A bad value takes the fallback. */
export function rgba(hex, fallback, alphaMul = 1) {
  const ok = typeof hex === "string" && /^#(?:[0-9a-f]{6}|[0-9a-f]{8})$/i.test(hex);
  const h = ok ? hex : fallback;
  const n = (i) => parseInt(h.slice(i, i + 2), 16);
  const a = h.length === 9 ? n(7) / 255 : 1;
  return `rgba(${n(1)}, ${n(3)}, ${n(5)}, ${Math.round(a * alphaMul * 1000) / 1000})`;
}

export function colors(settings = {}) {
  const pick = (key, mul = 1) => rgba(settings[key], COLOR_DEFAULTS[key], mul);
  return {
    ink: pick("brackets_color"),
    reload: pick("brackets_reload_color"),
    track: pick("brackets_color", 0.5),
    center: pick("brackets_center_color"),
    backdrop: pick("brackets_backdrop_color"),
    bar: pick("brackets_bar_color"),
    barReloading: pick("brackets_bar_color", 0.5),
    barWork: pick("brackets_bar_work_color"),
    barBase: pick("brackets_bar_base_color"),
  };
}
