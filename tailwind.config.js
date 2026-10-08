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
    },
  },
  plugins: [],
};
