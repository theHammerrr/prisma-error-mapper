import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { PostgreSqlContainer } from '@testcontainers/postgresql';

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('../', import.meta.url));
// PostgreSQL 16.15 multi-platform image; update intentionally with the integration baseline.
const image = 'postgres:16-alpine@sha256:721873c34ceb9f8d8fc265984940dc982404c105f19ad51be9fdc5970a6080ea';
const env = { ...process.env };
const controller = new globalThis.AbortController();
let container;
let logs;

function run(args) {
  controller.signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: root, env, stdio: 'inherit', timeout: 120_000, signal: controller.signal,
    });
    // Wait for close even after an abort so cleanup follows the child's exit.
    let failure;
    child.once('error', error => { failure = error; });
    child.once('close', (code, signal) => {
      if (failure || code !== 0) {
        reject(failure ?? new Error(`${args.join(' ')} failed: ${signal ?? code}`));
      } else resolve();
    });
  });
}

const signalHandlers = new Map(['SIGINT', 'SIGTERM'].map(signal => {
  const handler = () => {
    process.exitCode = signal === 'SIGINT' ? 130 : 143;
    controller.abort(new Error(`Integration run interrupted by ${signal}`));
  };
  process.once(signal, handler);
  return [signal, handler];
}));

try {
  console.log('Starting PostgreSQL with Testcontainers...');
  container = await new PostgreSqlContainer(image)
    .withDatabase('prisma_errors')
    .withUsername('prisma_test')
    .withPassword(randomUUID())
    .withTmpFs({ '/var/lib/postgresql/data': 'rw' })
    .withStartupTimeout(120_000)
    .start();
  console.log(`Integration container: ${container.getId()}`);
  controller.signal.throwIfAborted();
  // Never use DATABASE_URL or an external database supplied by the caller.
  const url = new URL(container.getConnectionUri());
  url.searchParams.set('schema', 'public');
  url.searchParams.set('connect_timeout', '5');
  env.PRISMA_ERROR_TEST_DATABASE_URL = url.href;
  const prismaCli = require.resolve('prisma/build/index.js');
  await run([prismaCli, 'generate', '--schema', 'tests/integration/schema.prisma']);
  await run([require.resolve('typescript/bin/tsc'), '-p', 'tsconfig.integration.json']);
  await run([prismaCli, 'db', 'push', '--skip-generate', '--schema', 'tests/integration/schema.prisma']);
  await run([prismaCli, 'db', 'execute', '--file', 'tests/integration/check-normal-email.sql', '--schema', 'tests/integration/schema.prisma']);
  await run(['--test', '--test-concurrency=1', '.integration-build/tests/integration/postgres.test.js']);
} catch (error) {
  console.error(error);
  process.exitCode ??= 1;
  if (container) {
    try {
      logs = await container.logs({ tail: 40 });
      logs.on('error', error => console.error('Could not read PostgreSQL logs:', error));
      logs.pipe(process.stderr, { end: false });
    } catch (error) {
      console.error('Could not read PostgreSQL logs:', error);
    }
  }
} finally {
  try {
    if (container) {
      await container.stop({ timeout: 10_000, remove: true, removeVolumes: true });
      console.log(`Removed integration container: ${container.getId()}`);
    }
  } catch (error) {
    console.error(`Container cleanup failed (${container?.getId()}):`, error);
    process.exitCode = 1;
  } finally {
    logs?.destroy();
    for (const [signal, handler] of signalHandlers) process.removeListener(signal, handler);
  }
}
