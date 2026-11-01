import { COLOR_DEFAULTS } from "./colors.mjs";

const bars = { key: "ring_bars", eq: false };

export default {
  id: "ring",
  label: "reticle.ring",
  tip: "reticle.ringTip",
  defaults: { ring_sides: "clockwise", ring_bars: true, ...COLOR_DEFAULTS },
  controls: [
    {
      type: "segmented",
      key: "ring_sides",
      label: "ring.sides",
      tooltip: "ring.sidesTip",
      options: [
        { value: "clockwise", label: "config.clockwise", tooltip: "ring.clockwiseTip" },
        { value: "middle_out", label: "config.middleOut", tooltip: "ring.middleOutTip" },
        { value: "off", label: "config.off", tooltip: "ring.offTip" },
      ],
    },
    { type: "switch", key: "ring_bars", label: "config.bars", tooltip: "config.barsTip" },
    { type: "color", key: "ring_color", label: "config.color", tooltip: "ring.colorTip" },
    { type: "color", key: "ring_reload_color", label: "config.reloadColor", tooltip: "ring.reloadColorTip" },
    { type: "color", key: "ring_base_color", label: "ring.baseColor", tooltip: "ring.baseColorTip" },
    { type: "color", key: "ring_rim_color", label: "ring.rimColor", tooltip: "ring.rimColorTip" },
    { type: "color", key: "ring_center_color", label: "brackets.centerColor", tooltip: "brackets.centerColorTip" },
    { type: "color", key: "ring_backdrop_color", label: "brackets.backdropColor", tooltip: "ring.backdropColorTip" },
    { type: "color", key: "ring_bar_color", label: "config.barColor", tooltip: "config.barColorTip", disabledWhen: bars },
    { type: "color", key: "ring_bar_work_color", label: "config.barWorkColor", tooltip: "config.barWorkColorTip", disabledWhen: bars },
    { type: "color", key: "ring_bar_base_color", label: "config.barBaseColor", tooltip: "config.barBaseColorTip", disabledWhen: bars },
  ],
};
