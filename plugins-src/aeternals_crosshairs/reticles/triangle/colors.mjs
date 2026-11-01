export const COLOR_DEFAULTS = {  triangle_color: "#FFFFFFFF",
  triangle_reload_color: "#FFFFFF80",
  triangle_center_color: "#FFFFFFFF",
  // FUSE --black-1.
  triangle_center_stroke_color: "#0A0B0AFF",
  triangle_bar_color: "#FFFFFFFF",
  // Black at 50 % opacity, under the fill.
  triangle_bar_work_color: "#00000080",
  // Black at 50 % opacity.
  triangle_bar_base_color: "#00000080",
};

/** "#RRGGBB[AA]" as rgba(), its alpha times `alphaMul`. A bad value takes the fallback. */
export function rgba(hex, fallback, alphaMul = 1) {
  const ok = typeof hex === "string" && /^#(?:[0-9a-f]{6}|[0-9a-f]{8})$/i.test(hex);
  const h = ok ? hex : fallback;
  const n = (i) => parseInt(h.slice(i, i + 2), 16);
  const a = h.length === 9 ? n(7) / 255 : 1;
  return `rgba(${n(1)}, ${n(3)}, ${n(5)}, ${Math.round(a * alphaMul * 1000) / 1000})`;
}

/** True when an rgba() colour has full alpha. */
export function isOpaque(color) {
  return /,\s*1\)$/.test(color);
}

export function colors(settings = {}) {
  const pick = (key, mul = 1) => rgba(settings[key], COLOR_DEFAULTS[key], mul);
  return {
    ink: pick("triangle_color"),
    reload: pick("triangle_reload_color"),
    track: pick("triangle_color", 0.5),
    center: pick("triangle_center_color"),
    centerStroke: pick("triangle_center_stroke_color"),
    bar: pick("triangle_bar_color"),
    barReloading: pick("triangle_bar_color", 0.5),
    barWork: pick("triangle_bar_work_color"),
    barBase: pick("triangle_bar_base_color"),
  };
}
