import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        page: '#0A0A0A',
        surface: '#141414',
        gold: '#C9A962',
        'gold-dim': 'rgba(201,169,98,0.25)',
        border: '#2A2A2A',
      },
      textColor: {
        primary: '#FFFFFF',
        secondary: '#848484',
        tertiary: '#6A6A6A',
      },
      fontFamily: {
        headline: ['Cormorant Garamond', 'serif'],
        ui: ['Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
} satisfies Config
