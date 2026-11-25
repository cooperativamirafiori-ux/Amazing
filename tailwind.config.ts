import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Brand Progetto Amazing (dal frontend v4). I valori stanno in variabili
        // CSS (app/globals.css) così una sezione può cambiare palette con una
        // sola classe: `.tema-natale` per la vetrina Natale.
        brand: {
          DEFAULT: 'rgb(var(--brand) / <alpha-value>)',
          dark: 'rgb(var(--brand-dark) / <alpha-value>)',
          darker: 'rgb(var(--brand-darker) / <alpha-value>)',
          accent: 'rgb(var(--brand-accent) / <alpha-value>)',
          bg: 'rgb(var(--brand-bg) / <alpha-value>)',
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
