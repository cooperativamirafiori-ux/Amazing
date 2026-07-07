import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Brand Progetto Amazing (dal frontend v4)
        brand: {
          DEFAULT: '#2C7BB8',
          dark: '#1a5a8a',
          darker: '#1a3a52',
          accent: '#E87A4A',
          bg: '#f0f6fb',
        },
      },
      fontFamily: {
        sans: ['Nunito', 'system-ui', 'sans-serif'],
        display: ['"Playfair Display"', 'Georgia', 'serif'],
      },
    },
  },
  plugins: [],
}

export default config
