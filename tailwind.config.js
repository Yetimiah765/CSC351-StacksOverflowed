/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // Full window height minus the h-14 (3.5rem) nav bar in
      // components/NavBar.tsx. Pages use `min-h-page` instead of
      // `min-h-screen` so they fill the window without scrolling.
      minHeight: {
        page: 'calc(100vh - 3.5rem)',
      },
      // The Daily Login Box reward reveal (SRS-128.10).
      keyframes: {
        'box-reveal': {
          '0%': { opacity: '0', transform: 'scale(0.6) rotate(-6deg)' },
          '60%': { opacity: '1', transform: 'scale(1.08) rotate(2deg)' },
          '100%': { opacity: '1', transform: 'scale(1) rotate(0deg)' },
        },
      },
      animation: {
        'box-reveal': 'box-reveal 0.7s ease-out',
      },
    },
  },
  plugins: [],
};
