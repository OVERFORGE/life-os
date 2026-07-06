import fs from 'fs';
import path from 'path';
import { palette } from '../tokens/colors';
import { spacing } from '../tokens/spacing';
import { radius } from '../tokens/radius';
import { typography } from '../tokens/typography';
import { darkTheme } from '../theme/dark';

function generateCSS() {
  let css = `@import "tailwindcss";\n\n`;
  css += `@theme {\n`;

  // Colors
  Object.entries(palette.neutral).forEach(([key, value]) => {
    css += `  --color-neutral-${key}: ${value};\n`;
  });
  Object.entries(palette.alpha).forEach(([key, value]) => {
    css += `  --color-alpha-${key}: ${value};\n`;
  });
  Object.entries(palette.primary).forEach(([key, value]) => {
    css += `  --color-primary-${key}: ${value};\n`;
  });
  Object.entries(palette.status).forEach(([key, value]) => {
    css += `  --color-status-${key}: ${value};\n`;
  });

  // Semantic Theme Colors
  css += `\n  /* Semantic Colors */\n`;
  Object.entries(darkTheme.colors.background).forEach(([key, value]) => {
    css += `  --color-bg-${key}: ${value};\n`;
  });
  Object.entries(darkTheme.colors.text).forEach(([key, value]) => {
    css += `  --color-text-${key}: ${value};\n`;
  });
  Object.entries(darkTheme.colors.brand).forEach(([key, value]) => {
    css += `  --color-brand-${key}: ${value};\n`;
  });
  Object.entries(darkTheme.colors.border).forEach(([key, value]) => {
    css += `  --color-border-${key}: ${value};\n`;
  });

  // Spacing
  css += `\n  /* Spacing */\n`;
  Object.entries(spacing).forEach(([key, value]) => {
    css += `  --spacing-${key}: ${value}px;\n`;
  });

  // Radius
  css += `\n  /* Radius */\n`;
  Object.entries(radius).forEach(([key, value]) => {
    css += `  --radius-${key}: ${value === 9999 ? '9999px' : value + 'px'};\n`;
  });

  // Typography
  css += `\n  /* Typography */\n`;
  Object.entries(typography.fontSizes).forEach(([key, value]) => {
    css += `  --text-${key}: ${value}px;\n`;
  });
  Object.entries(typography.fontWeights).forEach(([key, value]) => {
    css += `  --font-${key}: ${value};\n`;
  });
  Object.entries(typography.letterSpacings).forEach(([key, value]) => {
    css += `  --tracking-${key}: ${value}px;\n`;
  });
  
  // Custom Elevations / Shadows
  css += `\n  /* Shadows */\n`;
  css += `  --shadow-surface: inset 0 1px 0 rgba(255, 255, 255, 0.05), 0 4px 6px rgba(0, 0, 0, 0.2);\n`;
  css += `  --shadow-overlay: inset 0 1px 0 rgba(255, 255, 255, 0.1), 0 10px 40px rgba(0, 0, 0, 0.5);\n`;

  css += `}\n`;

  // Base Styles for Desktop OS feel
  css += `
@layer base {
  body {
    background-color: var(--color-bg-base);
    color: var(--color-text-primary);
    font-family: var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif;
  }
  
  /* Custom Scrollbar for Desktop */
  ::-webkit-scrollbar {
    width: 6px;
    height: 6px;
  }
  ::-webkit-scrollbar-track {
    background: transparent;
  }
  ::-webkit-scrollbar-thumb {
    background: var(--color-alpha-white10);
    border-radius: var(--radius-full);
  }
  ::-webkit-scrollbar-thumb:hover {
    background: var(--color-alpha-white20);
  }
}
`;

  const distPath = path.join(__dirname, '../dist');
  if (!fs.existsSync(distPath)) {
    fs.mkdirSync(distPath);
  }

  fs.writeFileSync(path.join(distPath, 'tokens.css'), css);
  console.log('Successfully generated CSS tokens!');
}

generateCSS();
