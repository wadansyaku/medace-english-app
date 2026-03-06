/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './App.tsx',
    './index.tsx',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        medace: {
          50: '#fffaf3',
          100: '#fff1df',
          200: '#fcd797',
          300: '#ffbf52',
          400: '#f66d0b',
          500: '#fd6209',
          600: '#e45e04',
          700: '#c85208',
          800: '#66321A',
          900: '#2F1609',
        },
      },
      fontFamily: {
        sans: ['"Space Grotesk"', '"Noto Sans JP"', 'system-ui', 'sans-serif'],
      },
      animation: {
        'ping-slow': 'ping 2s cubic-bezier(0, 0, 0.2, 1) infinite',
        tilt: 'tilt 10s infinite linear',
      },
      keyframes: {
        tilt: {
          '0%, 50%, 100%': { transform: 'rotate(0deg)' },
          '25%': { transform: 'rotate(0.5deg)' },
          '75%': { transform: 'rotate(-0.5deg)' },
        },
      },
    },
  },
  plugins: [],
};
