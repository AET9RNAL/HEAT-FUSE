export const COLOR_DEFAULTS = {
  ring_color: "#FFFFFFFF",
  ring_reload_color: "#FFFFFF80",
  ring_base_color: "#0000004D",
  ring_rim_color: "#FFFFFFFF",
  ring_center_color: "#FFFFFFFF",
  ring_backdrop_color: "#00000080",
  ring_bar_color: "#FFFFFFFF",
  ring_bar_work_color: "#00000080",
  ring_bar_base_color: "#0000004D",
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
    ink: pick("ring_color"),
    reload: pick("ring_reload_color"),
    base: pick("ring_base_color"),
    rim: pick("ring_rim_color"),
    center: pick("ring_center_color"),
    backdrop: pick("ring_backdrop_color"),
    bar: pick("ring_bar_color"),
    barReloading: pick("ring_bar_color", 0.5),
    barWork: pick("ring_bar_work_color"),
    barBase: pick("ring_bar_base_color"),
  };
}
