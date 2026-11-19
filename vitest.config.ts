import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['__tests__/**/*.test.ts'],
    // Security tests hit the live Supabase project; run them with `npm run test:security`.
    exclude: [...configDefaults.exclude, '__tests__/security/**'],
  },
});
