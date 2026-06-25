/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#eef6f3',
          100: '#d3e8e0',
          200: '#a7d1c1',
          300: '#7ab8a1',
          400: '#4d9d80',
          500: '#2f7d62',
          600: '#1f624c',
          700: '#16503e',
          800: '#0F4C3A',
          900: '#0a3329',
        },
        accent: {
          50: '#fdf6e9',
          100: '#fbe9c4',
          200: '#f6d491',
          300: '#f0bd5e',
          400: '#E8A33D',
          500: '#d4862a',
          600: '#b06a1f',
        },
        sage: {
          100: '#eef2f0',
          200: '#dbe5e0',
          300: '#c2d0c9',
          500: '#7A9B8E',
          700: '#56716a',
        },
        ink: '#1A1A1A',
        paper: '#FBF8F2',
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'sans-serif'],
        body: ['Inter', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(15, 76, 58, 0.06), 0 4px 12px rgba(15, 76, 58, 0.05)',
      },
    },
  },
  plugins: [],
};


