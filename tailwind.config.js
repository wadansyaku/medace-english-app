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
          50: '#fff8f1',
          100: '#ffe9d1',
          200: '#ffd1a3',
          300: '#ffb874',
          400: '#ff9a3c',
          500: '#ff8216',
          600: '#ef6f00',
          700: '#c85a00',
          800: '#944300',
          900: '#5f2b00',
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
