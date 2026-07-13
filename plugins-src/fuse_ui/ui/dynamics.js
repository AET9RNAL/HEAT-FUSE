// Motion easing presets (subset of the control app's useMotion Dynamics).
import { circIn, circOut } from "motion-v";

export const Dynamics = {
  quick: { duration: 0.15 },
  default: { duration: 0.25 },
  smooth: { duration: 0.35, ease: [0.4, 0.5, 0.4, 1.0] },
  snappy: { duration: 0.25, ease: [0.79, 0.0, 0.22, 1.0] },
  circOut: { duration: 0.25, ease: circOut },
  circIn: { duration: 0.25, ease: circIn },
};
