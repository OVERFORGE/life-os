export const elevation = {
  // Pure border-driven elevation
  base: {
    borderWidth: 1,
    shadowColor: 'transparent',
  },
  active: {
    borderWidth: 1,
    shadowColor: 'transparent',
  },
  modal: {
    borderWidth: 1,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
  }
} as const;
