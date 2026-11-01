import { COLOR_DEFAULTS } from "./colors.mjs";

export default {
  id: "brackets",
  label: "reticle.brackets",
  tip: "reticle.bracketsTip",
  defaults: { brackets_sides: "clockwise", brackets_bars: true, ...COLOR_DEFAULTS },
  controls: [
    {
      type: "segmented",
      key: "brackets_sides",
      label: "brackets.sides",
      tooltip: "brackets.sidesTip",
      options: [
        { value: "clockwise", label: "config.clockwise", tooltip: "brackets.clockwiseTip" },
        { value: "middle_out", label: "config.middleOut", tooltip: "brackets.middleOutTip" },
        { value: "off", label: "config.off", tooltip: "brackets.offTip" },
      ],
    },
    { type: "switch", key: "brackets_bars", label: "config.bars", tooltip: "config.barsTip" },
    { type: "color", key: "brackets_color", label: "config.color", tooltip: "brackets.colorTip" },
    { type: "color", key: "brackets_reload_color", label: "config.reloadColor", tooltip: "brackets.reloadColorTip" },
    { type: "color", key: "brackets_center_color", label: "brackets.centerColor", tooltip: "brackets.centerColorTip" },
    { type: "color", key: "brackets_backdrop_color", label: "brackets.backdropColor", tooltip: "brackets.backdropColorTip" },
    {
      type: "color",
      key: "brackets_bar_color",
      label: "config.barColor",
      tooltip: "config.barColorTip",
      disabledWhen: { key: "brackets_bars", eq: false },
    },
    {
      type: "color",
      key: "brackets_bar_work_color",
      label: "config.barWorkColor",
      tooltip: "config.barWorkColorTip",
      disabledWhen: { key: "brackets_bars", eq: false },
    },
    {
      type: "color",
      key: "brackets_bar_base_color",
      label: "config.barBaseColor",
      tooltip: "config.barBaseColorTip",
      disabledWhen: { key: "brackets_bars", eq: false },
    },
  ],
};
