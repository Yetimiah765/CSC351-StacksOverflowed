import { defineConfig } from 'vitest/config';

// `npm run test:security`: the Row Level Security attack tests, which talk to
// a real (scratch) Supabase project. Kept out of `npm test`, which mocks the
// database and needs no network or credentials.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['__tests__/security/**/*.rls.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
