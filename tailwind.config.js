/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // Full window height minus the h-16 (4rem) nav bar in
      // components/NavBar.tsx. Pages use `min-h-page` instead of
      // `min-h-screen` so they fill the window without scrolling.
      minHeight: {
        page: 'calc(100vh - 4rem)',
      },
      // The Daily Login Box reward reveal (SRS-128.10), and the poker
      // table's pre-hand countdown digits.
      keyframes: {
        'box-reveal': {
          '0%': { opacity: '0', transform: 'scale(0.6) rotate(-6deg)' },
          '60%': { opacity: '1', transform: 'scale(1.08) rotate(2deg)' },
          '100%': { opacity: '1', transform: 'scale(1) rotate(0deg)' },
        },
        'countdown-tick': {
          '0%': { opacity: '0.3', transform: 'scale(1.4)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
      },
      animation: {
        'box-reveal': 'box-reveal 0.7s ease-out',
        'countdown-tick': 'countdown-tick 0.35s ease-out',
      },
    },
  },
  plugins: [],
};
