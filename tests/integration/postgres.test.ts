import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import {
  PrismaErrorCodes, createPrismaErrorHandler, getPrismaErrorContext, getPrismaErrorKind,
  isPrismaError, isPrismaKnownRequestError, parsePrismaPostgresError,
} from '../../src/index.js';

const prisma = new PrismaClient();
before(async () => {
  await prisma.$connect();
  await prisma.$executeRaw`ALTER TABLE "NativeConstraint" ADD UNIQUE ("defaultName")`;
  await prisma.$executeRaw`ALTER TABLE "NativeConstraint" ADD CONSTRAINT "native_custom_unique" UNIQUE ("customName")`;
});
beforeEach(async () => {
  await prisma.post.deleteMany();
  await prisma.account.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.nativeConstraint.deleteMany();
});
after(async () => { await prisma.$disconnect(); });

async function rejected(operation: PromiseLike<unknown>): Promise<unknown> {
  try { await operation; } catch (error) { return error; }
  assert.fail('Expected the real Prisma query to reject');
}

test('P2002 from a default-named unique index preserves the field and original error', async () => {
  await prisma.account.create({ data: { email: 'duplicate@example.test', alias: 'first', externalId: 'first', tenant: 'first', slug: 'first' } });
  const error = await rejected(prisma.account.create({ data: { email: 'duplicate@example.test', alias: 'second', externalId: 'second', tenant: 'second', slug: 'second' } }));
  assert.ok(isPrismaError(error, 'P2002'));
  assert.deepEqual(error.meta?.target, ['email']);
  const context = getPrismaErrorContext(error);
  assert.equal(context?.code, 'P2002');
  assert.deepEqual(context?.meta, { target: ['email'], modelName: 'Account' });
  assert.equal(context?.original, error);
});

const accountData = (suffix: string) => ({
  email: `${suffix}@example.test`, alias: suffix, externalId: suffix, tenant: suffix, slug: suffix,
});

test('check normal email rejects an insert and preserves Prisma unknown-request diagnostics', async () => {
  const error = await rejected(prisma.account.create({ data: accountData('123blocked') }));
  assert.ok(isPrismaError(error));
  assert.equal(error.name, 'PrismaClientUnknownRequestError');
  assert.equal(getPrismaErrorKind(error), 'unknown-request');
  assert.equal('code' in error, false);
  assert.equal('meta' in error, false);
  // Default handling stays unchanged; parsing is an explicit separate call.
  assert.match(error.message, /check normal email/);
  assert.match(error.message, /23514/);
  assert.deepEqual(parsePrismaPostgresError(error), {
    provider: 'postgresql', kind: 'check-constraint', sqlState: '23514',
    tableName: 'Account', constraintName: 'check normal email', source: 'message', original: error,
  });
  const applicationError = new Error('האימייל אינו יכול להתחיל ב־123');
  const handler = createPrismaErrorHandler({}, {
    constraints: { Account: { 'check normal email': ({ original }) => {
      assert.equal(original, error);
      return applicationError;
    } } },
    fallback: () => assert.fail('Prisma errors must not reach fallback'),
    onUnhandledPrismaError: () => assert.fail('The constraint is explicitly handled'),
  });
  assert.equal(handler(error), applicationError);
  assert.equal(getPrismaErrorContext(error), undefined);
  assert.throws(() => createPrismaErrorHandler({})(error), value => value === error);
  assert.equal(createPrismaErrorHandler({}, { onUnhandledPrismaError: value => value })(error), error);
  assert.equal(await prisma.account.count(), 0);
});

test('check normal email permits emails that do not begin with the exact prefix 123', async () => {
  for (const [index, email] of ['normal@example.test', '12@example.test', 'a123@example.test', 'x@123.example.test'].entries()) {
    const account = await prisma.account.create({ data: { ...accountData(`allowed-${index}`), email } });
    assert.equal(account.email, email);
  }
  assert.equal(await prisma.account.count(), 4);
});

test('check normal email rejects updates and leaves the previous email unchanged', async () => {
  const account = await prisma.account.create({ data: accountData('allowed') });
  const error = await rejected(prisma.account.update({ where: { id: account.id }, data: { email: '123changed@example.test' } }));
  assert.ok(isPrismaError(error));
  assert.equal(getPrismaErrorKind(error), 'unknown-request');
  assert.match(error.message, /check normal email/);
  assert.equal(parsePrismaPostgresError(error)?.constraintName, 'check normal email');
  assert.equal(createPrismaErrorHandler({}, {
    constraints: { Account: { 'check normal email': () => 'update rejected' } },
  })(error), 'update rejected');
  const unchanged = await prisma.account.findUniqueOrThrow({ where: { id: account.id } });
  assert.equal(unchanged.email, account.email);
});

test('check normal email through raw SQL exposes P2010 with SQLSTATE 23514', async () => {
  const error = await rejected(prisma.$executeRaw`
    INSERT INTO "Account" ("email", "alias", "external_id", "tenant", "slug")
    VALUES ('123raw@example.test', 'raw', 'raw', 'raw', 'raw')
  `);
  assert.ok(isPrismaKnownRequestError(error));
  assert.equal(error.code, 'P2010');
  assert.equal(error.meta?.code, '23514');
  assert.equal(typeof error.meta?.message, 'string');
  assert.match(String(error.meta?.message), /check normal email/);
  assert.deepEqual(parsePrismaPostgresError(error), {
    provider: 'postgresql', kind: 'check-constraint', sqlState: '23514',
    tableName: 'Account', constraintName: 'check normal email', source: 'raw-query-meta', original: error,
  });
  assert.equal(createPrismaErrorHandler({}, {
    constraints: { Account: { 'check normal email': ({ source }) => source } },
  })(error), 'raw-query-meta');
  assert.equal(getPrismaErrorContext(error), undefined);
  assert.throws(() => createPrismaErrorHandler({})(error), value => value === error);
  assert.equal(await prisma.account.count(), 0);
});

test('fixtures contain both explicit and database-generated names', async () => {
  const indexes = await prisma.$queryRaw<Array<{ indexname: string }>>`
    SELECT indexname FROM pg_indexes WHERE schemaname = 'public'
  `;
  const names = indexes.map(index => index.indexname);
  for (const expected of ['Account_email_key', 'account_alias_explicit', 'account_external_explicit',
    'account_tenant_slug_explicit', 'Membership_teamId_userId_key']) assert.ok(names.includes(expected), expected);
  const constraints = await prisma.$queryRaw<Array<{ conname: string }>>`
    SELECT conname FROM pg_constraint WHERE conrelid = '"NativeConstraint"'::regclass AND contype = 'u'
  `;
  assert.deepEqual(constraints.map(constraint => constraint.conname).sort(),
    ['NativeConstraint_defaultName_key', 'native_custom_unique'].sort());
  const checks = await prisma.$queryRaw<Array<{ conname: string }>>`
    SELECT conname FROM pg_constraint WHERE conrelid = '"Account"'::regclass AND contype = 'c'
  `;
  assert.deepEqual(checks, [{ conname: 'check normal email' }]);
});

for (const { label, duplicate, target } of [
  { label: 'explicitly named index', duplicate: { alias: 'existing' }, target: ['alias'] },
  { label: 'mapped database column', duplicate: { externalId: 'existing' }, target: ['external_id'] },
  { label: 'explicitly named compound index', duplicate: { tenant: 'existing', slug: 'existing' }, target: ['tenant', 'slug'] },
]) {
  test(`P2002 from ${label} reports columns rather than the index name`, async () => {
    await prisma.account.create({ data: accountData('existing') });
    const error = await rejected(prisma.account.create({ data: { ...accountData('new'), ...duplicate } }));
    assert.ok(isPrismaError(error, 'P2002'));
    assert.deepEqual(error.meta?.target, target);
    const context = getPrismaErrorContext(error);
    assert.ok(context?.code === 'P2002');
    assert.deepEqual(context.meta.target, target);
    assert.equal(context.meta.constraintName, undefined);
    assert.equal(context.original, error);
  });
}

test('P2002 from a default-named compound index preserves column order', async () => {
  const data = { teamId: 'team', userId: 'user' };
  await prisma.membership.create({ data });
  const error = await rejected(prisma.membership.create({ data }));
  assert.ok(isPrismaError(error, 'P2002'));
  assert.deepEqual(error.meta?.target, ['teamId', 'userId']);
  assert.deepEqual(getPrismaErrorContext(error)?.meta, { target: ['teamId', 'userId'], modelName: 'Membership' });
});

for (const field of ['defaultName', 'customName'] as const) {
  test(`P2002 from SQL UNIQUE (${field}) works without a Prisma @unique declaration`, async () => {
    await prisma.nativeConstraint.create({ data: { defaultName: 'existing', customName: 'existing' } });
    const error = await rejected(prisma.nativeConstraint.create({
      data: { defaultName: 'new', customName: 'new', [field]: 'existing' },
    }));
    assert.ok(isPrismaError(error, 'P2002'));
    assert.deepEqual(error.meta?.target, [field]);
    assert.deepEqual(getPrismaErrorContext(error)?.meta, { target: [field], modelName: 'NativeConstraint' });
  });
}

for (const operation of ['findUniqueOrThrow', 'update', 'delete'] as const) {
  test(`P2025 from ${operation} of a missing record retains the cause`, async () => {
    const where = { id: -1 };
    const query = operation === 'findUniqueOrThrow' ? prisma.account.findUniqueOrThrow({ where })
      : operation === 'update' ? prisma.account.update({ where, data: { alias: 'missing' } })
      : prisma.account.delete({ where });
    const error = await rejected(query);
    assert.ok(isPrismaError(error, PrismaErrorCodes.RecordNotFound));
    assert.equal(typeof error.meta?.cause, 'string');
    const context = getPrismaErrorContext(error);
    assert.ok(context?.code === 'P2025');
    assert.equal(context.meta.cause, error.meta?.cause);
    assert.equal(context.meta.modelName, 'Account');
    assert.equal(context.original, error);
  });
}

test('nested connect to a missing related record yields P2025', async () => {
  const error = await rejected(prisma.post.create({
    data: { title: 'missing relation', account: { connect: { id: -1 } } },
  }));
  assert.ok(isPrismaError(error, 'P2025'));
  assert.equal(getPrismaErrorContext(error)?.original, error);
  assert.equal(await prisma.post.count(), 0);
});

test('unsupported P2003 foreign-key errors follow the unmatched Prisma policy', async () => {
  const error = await rejected(prisma.post.create({ data: { title: 'orphan', accountId: -1 } }));
  assert.ok(isPrismaKnownRequestError(error));
  assert.equal(error.code, 'P2003');
  assert.equal(getPrismaErrorKind(error), 'known-request');
  assert.equal(getPrismaErrorContext(error), undefined);
  const handler = createPrismaErrorHandler({ P2002: () => 'duplicate' });
  assert.throws(() => handler(error), value => value === error);
  assert.equal(createPrismaErrorHandler({}, { onUnhandledPrismaError: value => value })(error), error);
});

test('raw SQL duplicate is P2010 with SQLSTATE 23505, not an ORM P2002', async () => {
  await prisma.nativeConstraint.create({ data: { defaultName: 'first', customName: 'duplicate' } });
  const error = await rejected(prisma.$executeRaw`
    INSERT INTO "NativeConstraint" ("defaultName", "customName") VALUES ('second', 'duplicate')
  `);
  assert.ok(isPrismaKnownRequestError(error));
  assert.equal(error.code, 'P2010');
  assert.equal(error.meta?.code, '23505');
  assert.equal(isPrismaError(error, 'P2002'), false);
  assert.throws(() => createPrismaErrorHandler({})(error), value => value === error);
});

test('batch transaction P2002 retains its non-enumerable index and rolls back', async () => {
  await prisma.account.create({ data: accountData('existing') });
  const error = await rejected(prisma.$transaction([
    prisma.account.create({ data: accountData('rolled-back') }),
    prisma.account.create({ data: { ...accountData('new'), email: 'existing@example.test' } }),
  ]));
  assert.ok(isPrismaError(error, 'P2002'));
  assert.equal(error.batchRequestIdx, 1);
  assert.equal(Object.keys(error).includes('batchRequestIdx'), false);
  const context = getPrismaErrorContext(error);
  assert.equal(context?.original, error);
  assert.equal(await prisma.account.findUnique({ where: { email: 'rolled-back@example.test' } }), null);
});

test('concurrent inserts produce one success and one safely normalized P2002', async () => {
  const results = await Promise.allSettled([
    prisma.account.create({ data: { ...accountData('race-a'), email: 'race@example.test' } }),
    prisma.account.create({ data: { ...accountData('race-b'), email: 'race@example.test' } }),
  ]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  const failure = results.find(result => result.status === 'rejected');
  assert.ok(failure?.status === 'rejected');
  const error: unknown = failure.reason;
  assert.ok(isPrismaError(error, 'P2002'));
  assert.deepEqual(getPrismaErrorContext(error)?.meta, { target: ['email'], modelName: 'Account' });
});

test('real duplicate errors support Hebrew AppError instances and per-operation overrides', async () => {
  class AppError extends Error {
    constructor(public status: number, message: string, public code: string) { super(message); }
  }
  await prisma.account.create({ data: accountData('existing') });
  const error = await rejected(prisma.account.create({ data: { ...accountData('new'), email: 'existing@example.test' } }));
  const handle = createPrismaErrorHandler({ P2002: ({ meta }) => new AppError(409, `Duplicate ${meta.target?.[0]}`, 'DUPLICATE') });
  const custom = new AppError(409, 'כתובת האימייל כבר קיימת במערכת', 'EMAIL_ALREADY_EXISTS');
  assert.equal(handle(error, { P2002: () => custom }), custom);
  assert.throws(() => { throw handle(error, { P2002: () => custom }); }, value => value === custom);
  assert.equal(handle(error).message, 'Duplicate email');
});

test('Prisma query validation errors are recognized without fabricated code or metadata', async () => {
  // Deliberately bypass compile-time validation to exercise Prisma's runtime boundary.
  // @ts-expect-error A JavaScript caller can supply an invalid argument type.
  const error = await rejected(prisma.account.findMany({ take: 'invalid' }));
  assert.ok(isPrismaError(error));
  assert.equal(getPrismaErrorKind(error), 'validation');
  assert.equal('code' in error, false);
  assert.equal('meta' in error, false);
  assert.equal(getPrismaErrorContext(error), undefined);
  assert.throws(() => createPrismaErrorHandler({})(error), value => value === error);
});

test('P1012 from invalid PostgreSQL datasource configuration uses initialization errorCode', async () => {
  const invalid = new PrismaClient({ datasourceUrl: 'mysql://localhost/invalid' });
  try {
    const error = await rejected(invalid.$connect());
    assert.ok(isPrismaError(error, 'P1012'));
    assert.equal(getPrismaErrorKind(error), 'initialization');
    assert.ok('errorCode' in error);
    assert.equal(error.errorCode, 'P1012');
    assert.equal('meta' in error, false);
    const handler = createPrismaErrorHandler({ P1012: ({ kind, meta }) => ({ kind, meta }) });
    assert.deepEqual(handler(error), { kind: 'initialization', meta: {} });
  } finally { await invalid.$disconnect(); }
});
