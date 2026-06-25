/**
 * Design tokens composable for use with Motion for Vue
 * Provides consistent design system values for animations and styling
 */

export const tokens = {
  // Roundness
  roundness: 9,

  // Spacing scale (in pixels)
  space: {
    0: 2,
    1: 4,
    2: 8,
    3: 12,
    4: 16,
    5: 20,
    6: 42,
    7: 48,
    8: 96,
    9: 192,
  },

  // Icon sizes (in pixels)
  icon: {
    small: 8,
    normal: 16,
    large: 24,
    xlarge: 64,
  },

  // Brand colors (hsl strings)
  brand: {
    teaGreen: 'hsl(142, 100%, 89%)',
    lightGreen: 'hsl(142, 100%, 78%)',
    canaryYellow: 'hsl(57, 100%, 74%)',
    yellow: 'hsl(60, 100%, 48%)',
  },

  // Blacks (hsl strings)
  black: {
    1: 'hsl(142, 1%, 4%)',
    2: 'hsl(142, 1%, 10%)',
    3: 'hsl(142, 1%, 20%)',
    '1a': 'hsla(142, 10%, 4%, 0.6)',
    '2a': 'hsla(142, 10%, 10%, 0.6)',
    '3a': 'hsla(142, 10%, 20%, 0.6)',
  },

  // Glass surfaces (hsl strings)
  glass: {
    accented600: 'hsla(142, 100%, 89%, 0.4)',
    close600: 'hsla(0, 0%, 32%, 0.8)',
    subtle800: 'hsla(142, 10%, 20%, 0.6)',
    elevated900: 'hsla(142, 10%, 10%, 0.6)',
    base1000: 'hsla(142, 10%, 4%, 0.6)',
  },

  // Glass effects (backdrop-filter and box-shadow)
  glassEffects: {
    accentedGlass: {
      backdropFilter: 'blur(16px)',
      boxShadow: '0px 1px 1px 0px hsla(142, 100%, 78%, 0.2), 0px 0px 1px 0px hsl(142, 100%, 78%), 0px 2px 5px 0px hsla(142, 100%, 78%, 0.3)',
    },
    accentedInnerGlass: {
      backdropFilter: 'blur(16px)',
      boxShadow: 'inset 0px 0px 1px 0px hsl(142, 100%, 78%), 0px 1px 1px 0px hsla(142, 100%, 78%, 0.2), 0px 0px 1px 0px hsl(142, 100%, 78%), 0px 2px 5px 0px hsla(142, 100%, 78%, 0.3)',
    },
  },

  // Base colors
  base: {
    50: 'rgba(242, 242, 242, 1)',
    100: 'rgba(217, 217, 217, 1)',
    200: 'rgba(179, 179, 179, 1)',
    600: 'rgba(82, 82, 82, 1)',
    800: 'hsl(142, 1%, 20%)',
    900: 'hsl(142, 1%, 10%)',
    1000: 'hsl(142, 1%, 4%)',
  },

  // Accent colors
  accent: {
    50: 'hsl(142, 100%, 89%)',
    150: 'hsl(219, 100%, 85%)',
    200: 'hsl(142, 100%, 78%)',
    600: 'hsl(57, 100%, 74%)',
    800: 'hsl(60, 100%, 48%)',
  },

  // State colors
  state: {
    success: 'rgba(113, 206, 113, 1)',
    successMuted: 'rgba(28, 61, 28, 1)',
    warning: 'rgba(255, 219, 140, 1)',
    warningMuted: 'rgba(61, 51, 28, 1)',
    error: 'rgba(102, 35, 43, 1)',
    errorBase: 'rgba(200, 69, 84, 1)',
    errorHighlight: 'rgba(255, 106, 98, 1)',
  },

  // Typography
  font: {
    primary: "'Normalidad', system-ui, sans-serif",
    secondary: "'Geist Mono', 'Courier New', monospace",
  },

  // Font sizes - Primary (in pixels)
  fontSize: {
    1: 24,
    2: 20,
    3: 16,
    4: 12,
    5: 8,
  },

  // Font sizes - Secondary (in pixels)
  secondaryFontSize: {
    1: 24,
    2: 20,
    3: 16,
    4: 12,
    5: 8,
  },

  // Font weights
  fontWeight: {
    bold: 700,
    medium: 500,
    regular: 400,
    light: 300,
  },

  // Text colors
  text: {
    main: 'rgba(242, 242, 242, 1)',
    muted: 'rgba(179, 179, 179, 1)',
  },
} as const

// Motion presets using design tokens
export const motionPresets = {
  // Fade animations
  fadeIn: {
    initial: { opacity: 0 },
    enter: { opacity: 1 },
    leave: { opacity: 0 },
  },

  // Slide animations using spacing tokens
  slideUp: {
    initial: { opacity: 0, y: tokens.space[4] },
    enter: { opacity: 1, y: 0 },
    leave: { opacity: 0, y: -tokens.space[4] },
  },

  slideDown: {
    initial: { opacity: 0, y: -tokens.space[4] },
    enter: { opacity: 1, y: 0 },
    leave: { opacity: 0, y: tokens.space[4] },
  },

  slideLeft: {
    initial: { opacity: 0, x: tokens.space[4] },
    enter: { opacity: 1, x: 0 },
    leave: { opacity: 0, x: -tokens.space[4] },
  },

  slideRight: {
    initial: { opacity: 0, x: -tokens.space[4] },
    enter: { opacity: 1, x: 0 },
    leave: { opacity: 0, x: tokens.space[4] },
  },

  // Scale animations
  scaleIn: {
    initial: { opacity: 0, scale: 0.95 },
    enter: { opacity: 1, scale: 1 },
    leave: { opacity: 0, scale: 0.95 },
  },

  scaleUp: {
    initial: { opacity: 0, scale: 0.8 },
    enter: { opacity: 1, scale: 1 },
    leave: { opacity: 0, scale: 1.1 },
  },

  // Pop animation (good for buttons/icons)
  pop: {
    initial: { scale: 0.9 },
    enter: { scale: 1 },
    leave: { scale: 0.9 },
  },
} as const

// Transition presets
export const transitionPresets = {
  // Quick transitions for micro-interactions
  quick: { duration: 0.15 },

  // Default transitions
  default: { duration: 0.25 },

  // Smooth transitions for larger elements
  smooth: { duration: 0.35 },

  // Spring-based transitions
  spring: { type: 'spring' as const, stiffness: 300, damping: 24 },

  // Bouncy spring
  bouncy: { type: 'spring' as const, stiffness: 400, damping: 17 },

  // Gentle spring
  gentle: { type: 'spring' as const, stiffness: 200, damping: 20 },
} as const

export function useDesignTokens() {
  return {
    tokens,
    motionPresets,
    transitionPresets,
  }
}

export default useDesignTokens
