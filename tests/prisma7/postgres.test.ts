import { afterAll, beforeAll, test } from 'vitest';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from './generated/client.js';
import { createPrisma7ErrorMapper } from '../../src/prisma7.js';

const execFileAsync = promisify(execFile);
const image = 'postgres:16-alpine@sha256:721873c34ceb9f8d8fc265984940dc982404c105f19ad51be9fdc5970a6080ea';
const mapper = createPrisma7ErrorMapper(Prisma);
let container: StartedPostgreSqlContainer | undefined;
let client: PrismaClient | undefined;

beforeAll(async () => {
  container = await new PostgreSqlContainer(image)
    .withDatabase('prisma_errors')
    .withUsername('prisma_test')
    .withPassword(randomUUID())
    .withTmpFs({ '/var/lib/postgresql/data': 'rw' })
    .withStartupTimeout(120_000)
    .start();
  const url = container.getConnectionUri();
  await execFileAsync(process.execPath, ['node_modules/prisma/build/index.js', 'db', 'push', '--config', 'prisma.config.ts'], {
    cwd: new URL('.', import.meta.url),
    env: { ...process.env, PRISMA_ERROR_TEST_DATABASE_URL: url },
    timeout: 120_000,
  });
  client = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  await client.$connect();
}, 180_000);

afterAll(async () => {
  await client?.$disconnect();
  await container?.stop({ timeout: 10_000, remove: true, removeVolumes: true });
}, 30_000);

async function rejected(operation: PromiseLike<unknown>): Promise<unknown> {
  try { await operation; } catch (error) { return error; }
  assert.fail('Expected Prisma to reject the operation');
}

test('generated Prisma 7 constructors recognize and map real P2002/P2025 errors', async () => {
  assert.ok(client);
  await client.account.create({ data: { email: 'duplicate@example.test' } });
  const duplicate = await rejected(client.account.create({ data: { email: 'duplicate@example.test' } }));
  assert.ok(duplicate instanceof Prisma.PrismaClientKnownRequestError);
  assert.equal(mapper.isPrismaError(duplicate, 'P2002'), true);
  const context = mapper.getPrismaErrorContext(duplicate);
  assert.equal(context?.code, 'P2002');
  assert.equal(context?.original, duplicate);
  const handler = mapper.createPrismaErrorHandler({ P2002: ({ meta }) => meta.target?.[0] });
  assert.equal(handler(duplicate), 'email');

  const missing = await rejected(client.account.update({ where: { id: -1 }, data: { email: 'missing@example.test' } }));
  assert.equal(mapper.isPrismaError(missing, 'P2025'), true);
  assert.equal(mapper.getPrismaErrorContext(missing)?.code, 'P2025');
  assert.throws(() => handler(missing), value => value === missing);
});
