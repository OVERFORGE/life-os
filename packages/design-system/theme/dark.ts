import { palette } from '../tokens/colors';

export const darkTheme = {
  colors: {
    background: {
      base: palette.neutral[900], // #111113 (Smoked Obsidian)
      deep: palette.neutral[950], // #0B0B0C (Deep Void)
      shell: palette.neutral[900], // #111113
      workspace: palette.neutral[900], // #111113
      card: palette.neutral[800], // #17171A (Card Basalt)
      elevated: palette.neutral[700], // #1E1F24 (Elevated Basalt)
      highlight: palette.alpha.white5,
    },
    text: {
      primary: palette.neutral[50], // #F7F5F0 (Parchment White)
      secondary: palette.neutral[200], // #C5C2BA (Champagne Grey)
      muted: palette.neutral[400], // #85827A (Weathered Stone)
    },
    brand: {
      primary: palette.primary[500], // #D98B2B (Radiant Amber)
      dark: palette.primary[700], // #9E5F14
      deep: palette.primary[900], // #4E2C00
      light: palette.primary[400], // #E59B3C
      lighter: palette.primary[300], // #F5E6C8 (Warm Champagne)
    },
    status: {
      error: palette.status.error,
      warning: palette.status.warning,
      success: palette.status.success,
    },
    border: {
      default: palette.neutral[600], // #23242A (Subtle hairline)
      active: palette.primary[500], // #D98B2B (Radiant Amber)
      highlight: palette.primary[300], // #F5E6C8 (Champagne)
      interactive: palette.neutral[500], // #32343D
    }
  }
} as const;
