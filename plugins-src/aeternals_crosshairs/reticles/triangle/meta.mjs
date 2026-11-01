import { COLOR_DEFAULTS } from "./colors.mjs";

export default {
  id: "triangle",
  label: "reticle.triangle",
  tip: "reticle.triangleTip",
  defaults: { triangle_sides: "clockwise", triangle_bars: true, ...COLOR_DEFAULTS },
  controls: [
    {
      type: "segmented",
      key: "triangle_sides",
      label: "config.sides",
      tooltip: "config.sidesTip",
      options: [
        { value: "clockwise", label: "config.clockwise", tooltip: "config.clockwiseTip" },
        { value: "middle_out", label: "config.middleOut", tooltip: "config.middleOutTip" },
        { value: "off", label: "config.off", tooltip: "config.offTip" },
      ],
    },
    { type: "switch", key: "triangle_bars", label: "config.bars", tooltip: "config.barsTip" },
    { type: "color", key: "triangle_color", label: "config.color", tooltip: "config.colorTip" },
    { type: "color", key: "triangle_reload_color", label: "config.reloadColor", tooltip: "config.reloadColorTip" },
    { type: "color", key: "triangle_center_color", label: "config.centerColor", tooltip: "config.centerColorTip" },
    { type: "color", key: "triangle_center_stroke_color", label: "config.centerStrokeColor", tooltip: "config.centerStrokeColorTip" },
    {
      type: "color",
      key: "triangle_bar_color",
      label: "config.barColor",
      tooltip: "config.barColorTip",
      disabledWhen: { key: "triangle_bars", eq: false },
    },
    {
      type: "color",
      key: "triangle_bar_work_color",
      label: "config.barWorkColor",
      tooltip: "config.barWorkColorTip",
      disabledWhen: { key: "triangle_bars", eq: false },
    },
    {
      type: "color",
      key: "triangle_bar_base_color",
      label: "config.barBaseColor",
      tooltip: "config.barBaseColorTip",
      disabledWhen: { key: "triangle_bars", eq: false },
    },
  ],
};
