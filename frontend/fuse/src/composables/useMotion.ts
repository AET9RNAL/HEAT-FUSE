import { circIn, circOut } from 'motion-v'

export const motionPresets = {

} as const

export const Dynamics = {
  quick: { duration: 0.15 },
  default: { duration: 0.25 },
  smooth: { duration: 0.35, ease: [0.40, 0.50, 0.40, 1.00] },
  snappy: { duration: 0.25, ease: [0.79, 0.00, 0.22, 1.00] },
  circOut: { duration: 0.25, ease: circOut },
  circIn: { duration: 0.25, ease: circIn },
  spring: { type: 'spring' as const, stiffness: 300, damping: 24 },
  bouncy: { type: 'spring' as const, stiffness: 400, damping: 17 },
  gentle: { type: 'spring' as const, stiffness: 200, damping: 20 },
} as const

export const Ease = {
  snappy: [1, 0, .42, 1],
} as const

export function useMotion() {
  return { motionPresets, Dynamics, Ease }
}

export default useMotion
