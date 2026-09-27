import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/*.test.ts'],
    // These assertions are checked by tsc and must never execute.
    exclude: ['tests/types.test.ts'],
  },
});
