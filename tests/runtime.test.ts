import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PrismaClientKnownRequestError as Known, PrismaClientInitializationError as Init,
  PrismaClientValidationError as Validation, PrismaClientUnknownRequestError as Unknown,
  PrismaClientRustPanicError as Panic,
} from '@prisma/client/runtime/library.js';
import { PrismaErrorCodes, isPrismaError, isPrismaKnownRequestError, getPrismaErrorContext, getPrismaErrorKind, createPrismaErrorHandler } from '../src/index.js';

const version = '6.14.0';
const known = (code: string, meta?: Record<string, unknown>) =>
  new Known('technical message', { code, clientVersion: version, ...(meta ? { meta } : {}), batchRequestIdx: 2 });
class AppError extends Error {
  constructor(public status: number, message: string, public code?: string) { super(message); }
}

test('semantic enum values match Prisma codes and work with real error guards', () => {
  for (const [semantic, code] of [
    [PrismaErrorCodes.UniqueConstraintViolation, 'P2002'],
    [PrismaErrorCodes.RelatedRecordNotFound, 'P2015'],
    [PrismaErrorCodes.RecordNotFound, 'P2025'],
    [PrismaErrorCodes.SchemaValidationFailed, 'P1012'],
  ] as const) {
    assert.equal(semantic, code);
    assert.equal(isPrismaError(known(code), semantic), true);
    assert.equal(isPrismaError(known('P9999'), semantic), false);
  }
  assert.equal(isPrismaError(new Init('schema', version, 'P1012'), PrismaErrorCodes.SchemaValidationFailed), true);
});

test('enum-keyed mappings and overrides preserve custom values and string compatibility', () => {
  const custom = new AppError(404, 'הרשומה לא נמצאה');
  const handler = createPrismaErrorHandler({
    [PrismaErrorCodes.RecordNotFound]: () => custom,
    [PrismaErrorCodes.UniqueConstraintViolation]: ({ meta }) => meta.target?.[0],
  });
  assert.equal(handler(known('P2025')), custom);
  assert.equal(handler(known('P2002', { target: ['email'] })), 'email');
  assert.equal(handler(known('P2025'), { [PrismaErrorCodes.RecordNotFound]: () => 'override' }), 'override');
  assert.equal(handler(known('P2025'), { P2025: () => 'string override' }), 'string override');
  assert.equal(handler(known('P2025')), custom);
});

test('recognizes all five real Prisma error classes and their distinct kinds', () => {
  const cases = [
    [known('P2002'), 'known-request'], [new Init('init', version, 'P1012'), 'initialization'],
    [new Validation('validation', { clientVersion: version }), 'validation'],
    [new Unknown('unknown', { clientVersion: version }), 'unknown-request'], [new Panic('panic', version), 'rust-panic'],
  ] as const;
  for (const [error, kind] of cases) {
    assert.equal(isPrismaError(error), true);
    assert.equal(getPrismaErrorKind(error), kind);
  }
  assert.equal(isPrismaKnownRequestError(cases[1][0]), false);
});
test('rejects unrelated values, name/code lookalikes and hostile proxies', () => {
  const lookalike = Object.assign(new Error('x'), { name: 'PrismaClientKnownRequestError', code: 'P2002', clientVersion: version });
  for (const value of [null, undefined, 42, 'P2002', {}, new Error('x'), lookalike,
    new Proxy({}, { getPrototypeOf() { throw new Error('trap'); } })]) {
    assert.equal(isPrismaError(value), false);
    assert.equal(isPrismaError(value, 'P2002'), false);
    assert.equal(getPrismaErrorContext(value), undefined);
  }
});
for (const code of ['P2002', 'P2015', 'P2025', 'P1012'] as const) {
  test(`${code}: code narrowing, missing metadata and original identity`, () => {
    const error = known(code);
    assert.equal(isPrismaError(error, code), true);
    const context = getPrismaErrorContext(error);
    assert.equal(context?.code, code);
    assert.deepEqual(context?.meta, {});
    assert.equal(context?.original, error);
    assert.equal(error.meta, undefined);
    assert.equal(error.batchRequestIdx, 2);
    assert.equal(Object.keys(error).includes('batchRequestIdx'), false);
  });
}
test('normalizes array, string and null targets without inventing field names', () => {
  const meta = { target: ['email'], modelName: 'User' };
  const error = known('P2002', meta);
  const context = getPrismaErrorContext(error);
  assert.deepEqual(context?.meta, meta);
  assert.notEqual(context?.meta, meta);
  if (context?.code === 'P2002') assert.notEqual(context.meta.target, meta.target);
  assert.deepEqual(getPrismaErrorContext(known('P2002', { target: 'unique_email' }))?.meta, { constraintName: 'unique_email' });
  assert.deepEqual(getPrismaErrorContext(known('P2002', { target: null }))?.meta, {});
  assert.equal(error.meta, meta);
});
test('validates metadata and declines malformed records', () => {
  for (const [code, meta] of [
    ['P2002', { target: [1] }], ['P2002', { target: new Array(2) }], ['P2002', { modelName: 1 }],
    ['P2015', { details: 1 }], ['P2025', { cause: false }],
  ] as const) {
    const error = known(code, meta);
    assert.equal(isPrismaError(error), true);
    assert.equal(getPrismaErrorContext(error), undefined);
  }
  const error = known('P2002');
  Object.defineProperty(error, 'meta', { value: null });
  assert.equal(isPrismaError(error, 'P2002'), false);
});
test('reads only supported fields for P2015 and P2025', () => {
  assert.deepEqual(getPrismaErrorContext(known('P2015', { details: 'relation', modelName: 'User', extra: true }))?.meta,
    { details: 'relation', modelName: 'User' });
  assert.deepEqual(getPrismaErrorContext(known('P2025', { cause: 'missing', modelName: 'User' }))?.meta,
    { cause: 'missing', modelName: 'User' });
});
test('P1012 initialization uses errorCode and does not fabricate raw code/meta', () => {
  const error = new Init('schema invalid', version, 'P1012');
  assert.equal(isPrismaError(error, 'P1012'), true);
  assert.equal(isPrismaError(error, 'P2002'), false);
  assert.equal(getPrismaErrorContext(error)?.kind, 'initialization');
  assert.equal('code' in error, false);
  assert.equal('meta' in error, false);
  assert.equal(getPrismaErrorContext(new Init('init', version)), undefined);
  assert.equal(isPrismaError(new Validation('P1012', { clientVersion: version }), 'P1012'), false);
});
test('returns arbitrary objects, strings, Hebrew messages and custom instances', () => {
  const custom = new AppError(409, 'האימייל כבר קיים', 'EMAIL_ALREADY_EXISTS');
  const handler = createPrismaErrorHandler({ P2002: () => custom, P2025: () => ({ message: 'הרשומה לא נמצאה' }), P2015: () => 'missing' });
  assert.equal(handler(known('P2002')), custom);
  assert.deepEqual(handler(known('P2025')), { message: 'הרשומה לא נמצאה' });
  assert.equal(handler(known('P2015')), 'missing');
  assert.throws(() => { throw handler(known('P2002')); }, error => error === custom);
});
test('translation callbacks receive normalized metadata', () => {
  const t = (key: string, field?: string) => `${key}:${field ?? 'unknown'}`;
  const handler = createPrismaErrorHandler({ P2002: ({ meta }) => t('unique', meta.target?.[0]) });
  assert.equal(handler(known('P2002', { target: ['email'] })), 'unique:email');
  assert.equal(handler(known('P2002', { target: 'index_name' })), 'unique:unknown');
});
test('overrides replace or add mappings for one invocation only', () => {
  const handler = createPrismaErrorHandler({ P2002: () => 'base' });
  assert.equal(handler(known('P2002'), { P2002: () => 'override' }), 'override');
  assert.equal(handler(known('P2025'), { P2025: () => 404 }), 404);
  assert.equal(handler(known('P2002')), 'base');
});
test('unmapped, malformed and unrelated values are rethrown unchanged', () => {
  const handler = createPrismaErrorHandler({ P2002: () => 'mapped' });
  for (const error of [new Error('x'), null, undefined, 'x', known('P9999'), known('P2025'),
    known('P2002', { target: 3 }), new Validation('v', { clientVersion: version })]) {
    let caught = false;
    try { handler(error); } catch (actual) { caught = true; assert.equal(actual, error); }
    assert.equal(caught, true);
  }
});
test('fallback preserves values and handles all unmapped categories', () => {
  const handler = createPrismaErrorHandler({}, { fallback: error => error });
  for (const error of [null, undefined, known('P2002'), new Error('x')]) assert.equal(handler(error), error);
});
test('P1012 mapping handles initialization and request errors with distinct kinds', () => {
  const handler = createPrismaErrorHandler({ P1012: ({ code, kind, meta }) => ({ code, kind, meta }) });
  assert.deepEqual(handler(new Init('schema', version, 'P1012')),
    { code: 'P1012', kind: 'initialization', meta: {} });
  assert.deepEqual(handler(known('P1012')),
    { code: 'P1012', kind: 'known-request', meta: {} });
});
test('operation-specific Hebrew AppError preserves identity and frozen original', () => {
  const original = Object.freeze(known('P2002', { target: Object.freeze(['email']) }));
  const custom = new AppError(409, 'כתובת האימייל כבר קיימת במערכת', 'EMAIL_ALREADY_EXISTS');
  const handler = createPrismaErrorHandler({ P2002: () => new AppError(409, 'Value already exists') });
  const result = handler(original, { P2002: ({ meta }) => {
    assert.deepEqual(meta.target, ['email']);
    return custom;
  } });
  assert.equal(result, custom);
  assert.equal(result.code, 'EMAIL_ALREADY_EXISTS');
  assert.equal(handler(original).message, 'Value already exists');
});
test('callback failures propagate and mapped undefined does not trigger fallback', () => {
  const failure = new Error('callback');
  const handler = createPrismaErrorHandler({ P2002: () => { throw failure; } }, { fallback: () => 'fallback' });
  assert.throws(() => handler(known('P2002')), error => error === failure);
  assert.equal(createPrismaErrorHandler({ P2002: () => undefined }, { fallback: () => 'fallback' })(known('P2002')), undefined);
});
