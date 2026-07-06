export const palette = {
  neutral: {
    900: '#161618', // Deepest background (Mobile Match)
    800: '#1F2023', // Elevated workspace surface
    700: '#2A2B2F', // Borders / Lightest surface
    600: '#23252A',
    500: '#687076', // Muted icons
    400: '#9BA1A6', // Secondary text
    100: '#ECE7E3', // Less muted text
    50: '#FFFDFC',  // Primary Text (Mobile white)
  },
  alpha: {
    white5: 'rgba(255, 253, 252, 0.05)',
    white10: 'rgba(255, 253, 252, 0.10)',
    white20: 'rgba(255, 253, 252, 0.20)',
    black20: 'rgba(0, 0, 0, 0.20)',
    black50: 'rgba(0, 0, 0, 0.50)',
  },
  primary: {
    900: '#B42129', // Active/Deep Red
    700: '#D62C35', // Hover Red
    500: '#E8414A', // Vibrant brand red (Mobile Match)
    400: '#F3767D', 
    300: '#F9A8AC', 
    100: 'rgba(232, 65, 74, 0.1)', 
  },
  status: {
    error: '#ef4444',
    warning: '#fbbf24',
    success: '#10b981',
  },
  overlay: {
    modal: 'rgba(0, 0, 0, 0.6)',
  }
} as const;
