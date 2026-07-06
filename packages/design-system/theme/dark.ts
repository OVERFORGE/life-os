import { palette } from '../tokens/colors';

export const darkTheme = {
  colors: {
    background: {
      base: palette.neutral[900], // #161618
      deep: palette.neutral[900],
      shell: palette.neutral[900], // #161618
      workspace: palette.neutral[800], // #1F2023
      card: palette.neutral[800], // #1F2023
      elevated: palette.neutral[700], // #2A2B2F
      highlight: palette.alpha.white5,
    },
    text: {
      primary: palette.neutral[50], // #FFFDFC
      secondary: palette.neutral[100], // #ECE7E3
      muted: palette.neutral[400], // #9BA1A6
    },
    brand: {
      primary: palette.primary[500], // #E8414A
      dark: palette.primary[700], // #D62C35
      deep: palette.primary[900], // #B42129
      light: palette.primary[400],
      lighter: palette.primary[300],
    },
    status: {
      error: palette.status.error,
      warning: palette.status.warning,
      success: palette.status.success,
    },
    border: {
      default: palette.neutral[700], // #2A2B2F instead of alpha whites
      active: palette.primary[700], // #D62C35 (subtle red)
      highlight: palette.primary[500], // #E8414A (brand red)
    }
  }
} as const;
