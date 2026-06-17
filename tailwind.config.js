/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        'ink': {
          DEFAULT: '#0d0d0d',
          'light': '#1a1815',
          'surface': '#1e1c18',
          'hover': '#2a2722',
          'border': '#3a3630',
        },
        'parchment': {
          DEFAULT: '#f0e6d3',
          'dim': '#a09888',
          'muted': '#6b6560',
        },
        'amber': {
          DEFAULT: '#d4a017',
          'burn': '#b8860b',
          'glow': '#e8c547',
        },
        'verdigris': {
          DEFAULT: '#5c8a7a',
          'dark': '#3d6b5d',
        },
        'rust': {
          DEFAULT: '#8b3a3a',
        },
      },
      fontFamily: {
        'display': ['"Cormorant Garamond"', 'Georgia', 'serif'],
        'body': ['"DM Sans"', 'system-ui', 'sans-serif'],
        'reading': ['"Noto Serif SC"', '"Source Serif 4"', 'Georgia', 'serif'],
        'mono': ['"JetBrains Mono"', '"Fira Code"', 'monospace'],
      },
      borderRadius: {
        'sm': '2px',
        'md': '4px',
        'lg': '6px',
      },
    },
  },
  plugins: [],
};
