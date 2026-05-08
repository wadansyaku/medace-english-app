/** @type {import('tailwindcss').Config} */
const colorVar = (name) => `rgb(var(${name}) / <alpha-value>)`;

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
          50: colorVar('--color-medace-50'),
          100: colorVar('--color-medace-100'),
          200: colorVar('--color-medace-200'),
          300: colorVar('--color-medace-300'),
          400: colorVar('--color-medace-400'),
          500: colorVar('--color-medace-500'),
          600: colorVar('--color-medace-600'),
          700: colorVar('--color-medace-700'),
          800: colorVar('--color-medace-800'),
          900: colorVar('--color-medace-900'),
          950: colorVar('--color-medace-950'),
        },
        steady: {
          ink: colorVar('--color-ink'),
          muted: colorVar('--color-muted'),
          canvas: colorVar('--color-canvas'),
          panel: colorVar('--color-panel'),
          line: colorVar('--color-line'),
        },
        signal: {
          amber: colorVar('--color-signal-amber'),
          coral: colorVar('--color-signal-coral'),
          blue: colorVar('--color-signal-blue'),
        },
      },
      fontFamily: {
        sans: ['"Noto Sans JP"', '"Hiragino Kaku Gothic ProN"', '"Yu Gothic"', '"Space Grotesk"', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        ui: 'var(--radius-control)',
        card: 'var(--radius-card)',
        panel: 'var(--radius-panel)',
      },
      boxShadow: {
        panel: 'var(--shadow-panel)',
        raised: 'var(--shadow-raised)',
        inset: 'var(--shadow-inset)',
      },
      maxWidth: {
        readable: '68ch',
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
