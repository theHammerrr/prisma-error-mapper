import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/prisma7/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 180_000,
  },
});
