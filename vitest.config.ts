import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['__tests__/**/*.test.ts'],
    // The RLS attack tests need a real Supabase project: npm run test:security.
    exclude: ['__tests__/security/**', 'node_modules/**'],
  },
});
