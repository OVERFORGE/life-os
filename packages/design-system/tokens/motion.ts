export const motion = {
  durations: {
    fast: 300,
    normal: 500,
    slow: 800,
    ambient: 1000,
  },
  easing: {
    default: 'ease-in-out',
  },
  activeOpacity: {
    press: 0.7,
    heavyPress: 0.5,
  }
} as const;
