import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/integration/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Each test clears shared fixtures within its suite.
    sequence: { concurrent: false },
  },
});
