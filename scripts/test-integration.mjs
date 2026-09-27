import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('../', import.meta.url));
const name = `prisma-errors-${randomUUID()}`;
// PostgreSQL 16.15 multi-platform image; update intentionally with the integration baseline.
const image = 'postgres:16-alpine@sha256:721873c34ceb9f8d8fc265984940dc982404c105f19ad51be9fdc5970a6080ea';
const env = { ...process.env };
let started = false;

function run(command, args, { capture = false, allowFailure = false, timeout = 120_000 } = {}) {
  const result = spawnSync(command, args, {
    cwd: root, env, encoding: 'utf8', stdio: capture ? 'pipe' : 'inherit', timeout,
  });
  if (!allowFailure && (result.error || result.status !== 0)) {
    throw new Error(`${command} ${args.join(' ')} failed: ${result.error?.message ?? result.stderr ?? result.status}`);
  }
  return result;
}

function cleanup() {
  if (!started) return;
  started = false;
  const result = run('docker', ['rm', '--force', name], { allowFailure: true, timeout: 30_000 });
  if (result.status !== 0) {
    console.error(`Container cleanup failed. Remove the test container with: docker rm --force ${name}`);
    process.exitCode = 1;
  }
}
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => { cleanup(); process.exit(signal === 'SIGINT' ? 130 : 143); });
}

try {
  run('docker', ['info'], { capture: true, timeout: 15_000 });
  // Mark before run so a timed-out launch is still cleaned up.
  started = true;
  run('docker', ['run', '--detach', '--rm', '--name', name,
    '--publish', '127.0.0.1::5432', '--tmpfs', '/var/lib/postgresql/data',
    '--env', 'POSTGRES_USER=prisma_test', '--env', 'POSTGRES_PASSWORD=prisma_test',
    '--env', 'POSTGRES_DB=prisma_errors', image], { timeout: 300_000 });
  const deadline = Date.now() + 60_000;
  while (true) {
    const ready = run('docker', ['exec', name, 'pg_isready', '-h', '127.0.0.1', '-U', 'prisma_test', '-d', 'prisma_errors'],
      { capture: true, allowFailure: true, timeout: 5_000 });
    if (ready.status === 0) break;
    if (Date.now() >= deadline) throw new Error('PostgreSQL did not become ready within 60 seconds');
    await delay(500);
  }
  const address = run('docker', ['port', name, '5432/tcp'], { capture: true }).stdout.trim();
  if (!/^127\.0\.0\.1:\d+$/.test(address)) throw new Error(`Unexpected Docker port binding: ${address}`);
  // Never use DATABASE_URL or an external database supplied by the caller.
  env.PRISMA_ERROR_TEST_DATABASE_URL = `postgresql://prisma_test:prisma_test@${address}/prisma_errors?schema=public&connect_timeout=5`;
  const prismaCli = require.resolve('prisma/build/index.js');
  run(process.execPath, [prismaCli, 'generate', '--schema', 'tests/integration/schema.prisma']);
  run(process.execPath, [require.resolve('typescript/bin/tsc'), '-p', 'tsconfig.integration.json']);
  run(process.execPath, [prismaCli, 'db', 'push', '--skip-generate', '--schema', 'tests/integration/schema.prisma']);
  run(process.execPath, ['--test', '--test-concurrency=1', '.integration-build/tests/integration/postgres.test.js']);
} catch (error) {
  console.error(error);
  if (started) run('docker', ['logs', '--tail', '40', name], { allowFailure: true, timeout: 10_000 });
  process.exitCode = 1;
} finally {
  cleanup();
}
