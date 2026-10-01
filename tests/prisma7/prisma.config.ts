import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: './schema.prisma',
  datasource: { url: process.env.PRISMA_ERROR_TEST_DATABASE_URL ?? 'postgresql://localhost:5432/unused' },
});
