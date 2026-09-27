import { test } from 'vitest';
import assert from 'node:assert/strict';
import { PrismaClientKnownRequestError as Known, PrismaClientUnknownRequestError as Unknown } from '@prisma/client/runtime/library.js';
import { createPrismaErrorHandler, parsePrismaPostgresError } from '../src/index.js';

test('parses the observed Prisma 6.14 CHECK diagnostic into a separate structure', () => {
  const error = new Unknown(String.raw`Error occurred during query execution:
ConnectorError(ConnectorError { user_facing_error: None, kind: QueryError(PostgresError { code: "23514", message: "new row for relation \"Account\" violates check constraint \"check normal email\"", severity: "ERROR", detail: Some("Failing row contains (123blocked@example.test)."), column: None, hint: None }), transient: false })`, { clientVersion: '6.14.0' });
  assert.deepEqual(parsePrismaPostgresError(error), {
    provider: 'postgresql', kind: 'check-constraint', sqlState: '23514',
    tableName: 'Account', constraintName: 'check normal email', source: 'message', original: error,
  });
  assert.equal('meta' in error, false);
});

const primary = 'new row for relation "Account" violates check constraint "check normal email"';
test('named CHECK mappings directly handle ORM and raw-query errors without fallback', () => {
  const appError = new Error('האימייל אינו יכול להתחיל ב־123');
  const handle = createPrismaErrorHandler({}, {
    constraints: {
      Account: {
        'check normal email': ({ tableName, constraintName, sqlState }) => {
          assert.equal(tableName, 'Account');
          assert.equal(constraintName, 'check normal email');
          assert.equal(sqlState, '23514');
          return appError;
        },
      },
    },
    fallback: () => assert.fail('A Prisma CHECK error must not enter the non-Prisma fallback'),
    onUnhandledPrismaError: () => assert.fail('This named constraint has a handler'),
  });
  assert.equal(handle(connector()), appError);
  assert.equal(handle(raw({ code: '23514', message: primary })), appError);
});
function connector(message = primary, code = '23514', detail = 'row data'): Unknown {
  return new Unknown(`Error occurred during query execution:\nConnectorError(ConnectorError { user_facing_error: None, kind: QueryError(PostgresError { code: "${code}", message: ${JSON.stringify(message)}, severity: "ERROR", detail: Some(${JSON.stringify(detail)}), column: None, hint: None }), transient: false })`, { clientVersion: '6.14.0' });
}
function raw(meta: Record<string, unknown>, code = 'P2010'): Known {
  return new Known('Raw query failed', { code, meta, clientVersion: '6.14.0' });
}

test('parses raw-query metadata and retains the original metadata untouched', () => {
  const error = raw({ code: '23514', message: `ERROR: ${primary}\nDETAIL: Failing row contains (123).` });
  const before = error.meta;
  assert.deepEqual(parsePrismaPostgresError(error), {
    provider: 'postgresql', kind: 'check-constraint', sqlState: '23514',
    tableName: 'Account', constraintName: 'check normal email', source: 'raw-query-meta', original: error,
  });
  assert.equal(error.meta, before);
});

test('decodes Unicode and backslashes, and ignores Prisma callsite text and row details', () => {
  const error = connector('new row for relation "חשבון" violates check constraint "בדיקת\\אימייל"', '23514', primary);
  error.message = `Invalid prisma invocation mentioning "misleading constraint"\n\n${error.message}`;
  const parsed = parsePrismaPostgresError(error);
  assert.equal(parsed?.tableName, 'חשבון');
  assert.equal(parsed?.constraintName, 'בדיקת\\אימייל');
});

test('unrelated errors and unsupported SQLSTATE values are not parsed', () => {
  const valid = connector();
  for (const error of [null, undefined, '23514', {}, new Error(valid.message),
    { name: 'PrismaClientUnknownRequestError', message: valid.message },
    connector(primary, '23505'), raw({ code: '23505', message: primary }),
    raw({ code: '23514', message: primary }, 'P2002')]) {
    assert.equal(parsePrismaPostgresError(error), undefined);
  }
});

test('does not confuse a constraint mentioned in detail or a different primary message with a CHECK violation', () => {
  for (const error of [
    connector('a different database error', '23514', primary),
    raw({ code: '23514', message: `ERROR: a different database error\nDETAIL: ${primary}` }),
    connector(`${primary} unexpected trailing text`),
    connector('new row for relation "Account" violates check constraint "name with "quotes""'),
    connector('localized or changed diagnostic'),
  ]) assert.equal(parsePrismaPostgresError(error), undefined);
});

test('malformed, oversized, changed-format and throwing inputs return undefined', () => {
  const truncated = connector();
  truncated.message = truncated.message.slice(0, -1);
  const changed = connector();
  changed.message = changed.message.replace('severity: "ERROR"', 'severity: "FATAL"');
  const brokenEscape = connector();
  brokenEscape.message = brokenEscape.message.replace('Account', String.raw`Account\q`);
  const getter = connector();
  Object.defineProperty(getter, 'message', { get() { throw new Error('getter'); } });
  for (const error of [truncated, changed, brokenEscape, getter,
    connector('x'.repeat(70_000)), raw({ code: '23514', message: 'x'.repeat(70_000) }),
    raw({ code: 23514, message: primary }), raw({ code: '23514', message: null }), raw({}),
    new Proxy({}, { getPrototypeOf() { throw new Error('proxy'); } }),
  ]) assert.equal(parsePrismaPostgresError(error), undefined);
});

test('parser handles CRLF framing and frozen errors without mutation', () => {
  const error = connector();
  error.message = error.message.replaceAll('\n', '\r\n');
  Object.freeze(error);
  const parsed = parsePrismaPostgresError(error);
  assert.equal(parsed?.constraintName, 'check normal email');
  assert.equal(parsed?.original, error);
});

test('an unmatched Prisma hook can still use custom parser logic', () => {
  const applicationError = new Error('האימייל אינו יכול להתחיל ב־123');
  const handler = createPrismaErrorHandler({}, { onUnhandledPrismaError: error => {
    const parsed = parsePrismaPostgresError(error);
    if (parsed?.tableName === 'Account' && parsed.constraintName === 'check normal email') return applicationError;
    throw error;
  } });
  assert.equal(handler(connector()), applicationError);
  const other = connector('new row for relation "Account" violates check constraint "other check"');
  assert.throws(() => handler(other), error => error === other);
  const unrelated = new Error('unrelated');
  assert.throws(() => handler(unrelated), error => error === unrelated);
});

test('constraint names are scoped to the table and unknown names follow the Prisma hook', () => {
  const handle = createPrismaErrorHandler({}, {
    constraints: {
      Account: { 'check normal email': () => 'account' },
      Other: { 'check normal email': () => 'other' },
    },
    onUnhandledPrismaError: () => 'unmatched',
    fallback: () => assert.fail('Not a non-Prisma error'),
  });
  assert.equal(handle(connector()), 'account');
  assert.equal(handle(connector('new row for relation "Other" violates check constraint "check normal email"')), 'other');
  assert.equal(handle(connector('new row for relation "Missing" violates check constraint "check normal email"')), 'unmatched');
  assert.equal(handle(connector('new row for relation "Account" violates check constraint "other check"')), 'unmatched');
  assert.equal(handle(connector('unsupported diagnostic')), 'unmatched');
});

test('constraint callbacks may return undefined or throw without invoking another hook', () => {
  const error = connector();
  const failure = new Error('callback failed');
  const options = { onUnhandledPrismaError: () => assert.fail('Already matched'), fallback: () => assert.fail('Wrong route') };
  assert.equal(createPrismaErrorHandler({}, {
    ...options, constraints: { Account: { 'check normal email': () => undefined } },
  })(error), undefined);
  assert.throws(() => createPrismaErrorHandler({}, {
    ...options, constraints: { Account: { 'check normal email': () => { throw failure; } } },
  })(error), value => value === failure);
});

test('constraint maps are snapshotted and prototype names cannot hijack lookup', () => {
  const constraints = { Account: { 'check normal email': () => 'original' } };
  const handle = createPrismaErrorHandler({}, { constraints });
  constraints.Account['check normal email'] = () => 'changed';
  assert.equal(handle(connector()), 'original');
  for (const error of [connector('new row for relation "toString" violates check constraint "constructor"'),
    connector('new row for relation "Account" violates check constraint "toString"')]) {
    assert.throws(() => handle(error), value => value === error);
  }
  const special = createPrismaErrorHandler({}, {
    constraints: { ['__proto__']: { ['constructor']: () => 'explicit' } },
  });
  assert.equal(special(connector('new row for relation "__proto__" violates check constraint "constructor"')), 'explicit');
});
