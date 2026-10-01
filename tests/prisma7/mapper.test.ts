import { test } from 'vitest';
import assert from 'node:assert/strict';
import { Prisma } from './generated/client.js';
import { createPrisma7ErrorMapper } from '../../src/prisma7.js';

const mapper = createPrisma7ErrorMapper(Prisma);

test('maps a real Prisma 7 known error and preserves its original identity', () => {
  const error = new Prisma.PrismaClientKnownRequestError('duplicate', {
    code: 'P2002', clientVersion: '7.10.0', meta: { target: ['email'] },
  });
  assert.equal(mapper.isPrismaError(error, 'P2002'), true);
  const context = mapper.getPrismaErrorContext(error);
  assert.equal(context?.code, 'P2002');
  assert.equal(context?.original, error);
  const handle = mapper.createPrismaErrorHandler({ P2002: ({ meta }) => meta.target?.[0] });
  assert.equal(handle(error), 'email');
});

test('does not claim unrelated lookalikes or swallow other Prisma errors', () => {
  const lookalike = Object.assign(new Error('duplicate'), {
    name: 'PrismaClientKnownRequestError', code: 'P2002', clientVersion: '7.10.0',
  });
  assert.equal(mapper.isPrismaError(lookalike), false);
  const handle = mapper.createPrismaErrorHandler({ P2002: () => 'duplicate' }, {
    fallback: () => 'not Prisma',
  });
  assert.equal(handle(lookalike), 'not Prisma');
  const missing = new Prisma.PrismaClientKnownRequestError('missing', {
    code: 'P2025', clientVersion: '7.10.0', meta: { cause: 'not found' },
  });
  assert.throws(() => handle(missing), value => value === missing);
});
