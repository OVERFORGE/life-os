import { palette } from '../tokens/colors';

// Light theme is a stub for future implementation
// LifeOS is currently dark-mode native
export const lightTheme = {
  colors: {
    background: {
      base: palette.neutral[50],
      deep: palette.neutral[100],
      card: '#ffffff',
      elevated: palette.neutral[400],
      highlight: palette.primary[100],
    },
    text: {
      primary: palette.neutral[900],
      secondary: palette.neutral[700],
      muted: palette.neutral[500],
    },
    brand: {
      primary: palette.primary[500],
      dark: palette.primary[700],
      deep: palette.primary[900],
      light: palette.primary[400],
      lighter: palette.primary[300],
    },
    status: {
      error: palette.status.error,
      warning: palette.status.warning,
      success: palette.status.success,
    },
    border: {
      default: palette.neutral[400],
      active: palette.primary[500],
      highlight: palette.primary[100],
    }
  }
} as const;
