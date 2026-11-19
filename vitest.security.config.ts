import { defineConfig } from 'vitest/config';

// Security tests run against the real Supabase project, so they are kept out
// of the default `npm test` run. Use `npm run test:security`.
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['__tests__/security/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
