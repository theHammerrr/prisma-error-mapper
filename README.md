# prisma-error-mapper

Framework-agnostic Prisma 6.14 error guards and typed application mappings. ESM, TypeScript 5.9.2, Node.js 22+. No framework, translation library, HTTP policy, or mandatory application error class. The only runtime requirement is the `@prisma/client` peer dependency.

## Installation

The package is prepared for publishing; the name has not been reserved or published. Once published:

```sh
npm install prisma-error-mapper @prisma/client@~6.14.0
```

For local use, run `npm install`, `npm pack`, then install the generated tarball in your application. Keep your application's `prisma` CLI on the same 6.14.x version as its client.

## Coding-agent integration

Use the [consumer integration guide](docs/integration-guide.md) when adding this
package to an existing application. It covers application error classes, translations,
named CHECK constraints, overrides, and error routing.

For agents supporting skills, copy the complete
[`skills/use-prisma-error-mapper`](skills/use-prisma-error-mapper) directory into your
application's `.agents/skills/use-prisma-error-mapper` directory. The same directory
is included in the npm tarball under `node_modules/prisma-error-mapper/skills` after
installation. Copy its `references` directory too; the guide is bundled there so
the skill works independently of the package repository.

In Codex, invoke it with, for example:

```text
$use-prisma-error-mapper Integrate Prisma error handling into the account service.
Use our existing AppError and translations, and handle the Account table's
"check normal email" CHECK constraint.
```

Installing the npm dependency does not automatically activate an agent skill.
Agents without skill support can read the integration guide directly. These are
instructions for consuming the package, not repository maintenance instructions.
When updating the package, refresh the copied skill and compare the installed API.

## Basic usage and custom messages

```ts
import { createPrismaErrorHandler } from 'prisma-error-mapper';

const handle = createPrismaErrorHandler({
  P2002: () => ({ status: 409, message: 'A record with this value already exists' }),
  P2025: () => ({ status: 404, message: 'The requested record was not found' }),
});

try {
  await prisma.user.create({ data: { email } });
} catch (error) {
  throw handle(error);
}
```

The status numbers are application choices. Callbacks can return strings, plain objects, errors, or other values. The package supplies no default user-facing messages. `handle(error)` returns the mapping result; use `throw handle(error)` to throw it. A separate `.throw()` method adds no useful capability and is intentionally omitted. The API is synchronous; if you intentionally return a Promise, await it before throwing.

## Semantic error-code enum

Use `PrismaErrorCodes` wherever you would otherwise write a supported `"P..."` code:

```ts
import { PrismaErrorCodes, isPrismaError, createPrismaErrorHandler } from 'prisma-error-mapper';

if (isPrismaError(error, PrismaErrorCodes.RecordNotFound)) {
  console.log(error.meta?.cause); // string | undefined
}

const handle = createPrismaErrorHandler({
  [PrismaErrorCodes.RecordNotFound]: () => new Error('הרשומה לא נמצאה'),
  [PrismaErrorCodes.UniqueConstraintViolation]: ({ meta }) => ({
    message: `Duplicate value for ${meta.target?.[0] ?? 'a unique field'}`,
  }),
});

throw handle(error, {
  [PrismaErrorCodes.RecordNotFound]: () => new Error('המשתמש לא נמצא'),
});
```

| Enum member | Prisma value |
| --- | --- |
| `PrismaErrorCodes.UniqueConstraintViolation` | `P2002` |
| `PrismaErrorCodes.RelatedRecordNotFound` | `P2015` |
| `PrismaErrorCodes.RecordNotFound` | `P2025` |
| `PrismaErrorCodes.SchemaValidationFailed` | `P1012` |

This is a regular exported TypeScript string enum, usable at runtime from JavaScript too. Existing string codes and the `PrismaErrorCode` string-union type remain compatible. The semantic names do not change the underlying codes, metadata, or handling behavior. Use square brackets for enum-keyed mappings and overrides; callback metadata retains its code-specific inference.

## Type narrowing: original errors versus normalized contexts

```ts
import { isPrismaError, getPrismaErrorContext } from 'prisma-error-mapper';

function inspect(error: unknown) {
  if (isPrismaError(error, 'P2002')) {
    error.code; // 'P2002'
    const target = error.meta?.target; // string[] | string | null | undefined
    if (Array.isArray(target)) console.log(target[0]);
    console.log(error.clientVersion, error.batchRequestIdx);
  }

  const context = getPrismaErrorContext(error);
  if (context?.code === 'P2002') {
    console.log(context.meta.target?.[0]); // string | undefined
    console.log(context.meta.constraintName); // string | undefined
    console.log(context.original); // original error, same identity and stack
  }
}
```

A predicate cannot safely create missing properties or normalize an existing object without mutation. Consequently the raw guard deliberately requires `error.meta?.target`, not `error.meta.target`. Handler callbacks and `getPrismaErrorContext()` provide an always-present normalized `meta` object instead. The contexts are a discriminated union on `code`.

`isPrismaError(error)` recognizes all five Prisma client error classes. `isPrismaKnownRequestError(error)` recognizes known request errors even with unsupported codes; its metadata remains Prisma's unvalidated `Record<string, unknown>`. Code-specific guards additionally validate supported metadata fields. Malformed metadata fails the code-specific guard and follows the unmatched Prisma policy. Missing metadata is valid.

## Hebrew and an existing application Error class

```ts
class AppError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
    this.name = 'AppError';
  }
}

const handle = createPrismaErrorHandler({
  P2002: ({ meta }) => new AppError(
    409,
    meta.target?.[0] === 'email'
      ? 'כתובת האימייל כבר קיימת'
      : 'הערך כבר קיים',
    'VALUE_ALREADY_EXISTS',
  ),
  P2025: () => new AppError(404, 'הרשומה המבוקשת לא נמצאה', 'USER_NOT_FOUND'),
});

// Return type is AppError. Unmapped inputs throw unchanged.
const mapped = handle(error);
```

`P2002` is a Prisma code, `VALUE_ALREADY_EXISTS` is an application code, and the Hebrew text is a user-facing message. These remain separate. To retain the original error as a cause, your callback can pass `original` to your application's error constructor.

## Translation functions

Connect any translation system through a closure:

```ts
const handle = createPrismaErrorHandler({
  P2002: ({ meta }) => ({
    message: t('errors.uniqueConstraint', { field: meta.target?.[0] }),
  }),
});
```

Create handlers inside request scope if their closures depend on the current user's locale. Static strings use the same callback API: `P2002: () => 'הערך כבר קיים'`.

## Per-operation overrides

```ts
try {
  await prisma.user.create({ data: { email } });
} catch (error) {
  throw handle(error, {
    P2002: ({ meta }) => new AppError(
      409, 'כתובת האימייל כבר קיימת במערכת',
      meta.target?.includes('email') ? 'EMAIL_ALREADY_EXISTS' : 'VALUE_ALREADY_EXISTS',
    ),
  });
}
```

Overrides replace or add Prisma-code mappings for that call only. They do not mutate the original handler. Return types include base and override results conservatively, including base results whose callbacks may have been replaced. Named CHECK mappings are configured when constructing a handler, not through this code-override argument.

## Named PostgreSQL CHECK constraints

Register frequently used constraints directly. Keys are the exact **database table name**, then constraint name, including spaces:

```ts
const handle = createPrismaErrorHandler(
  {
    [PrismaErrorCodes.RecordNotFound]: () =>
      new AppError(404, 'הרשומה לא נמצאה', 'NOT_FOUND'),
  },
  {
    constraints: {
      Account: {
        'check normal email': () => new AppError(
          422,
          'האימייל אינו יכול להתחיל ב־123',
          'INVALID_EMAIL_PREFIX',
        ),
      },
    },
  },
);

try {
  await prisma.account.update({ where: { id }, data: { email } });
} catch (error) {
  throw handle(error);
}
```

This is a handled error: no fallback is needed. Registering `constraints` opts into the verified PostgreSQL CHECK parser. Each callback receives a typed `ParsedPrismaPostgresError` with `tableName`, `constraintName`, `sqlState`, `source`, and `original`; its return value is inferred alongside code mappings. Use `PrismaConstraintHandlerMap` with `satisfies` for reusable maps. Both map levels are snapshotted when the handler is created.

Constraint names are scoped to table names so the same name can be used on different tables. The observed messages omit schema names: use separate handlers for separate schema contexts if schemas contain identically named tables and constraints. Database names may differ from Prisma model names through `@@map`.

Only PostgreSQL CHECK violations recognized by the parser are supported here. Named UNIQUE constraints still use P2002 metadata; triggers, foreign-key constraints, and arbitrary database messages are not implicitly parsed. Unsupported formats remain unmatched Prisma errors. Parser limitations are described below.

## Unknown errors and centralized handling

By default, all unmapped inputs are **re-thrown unchanged**: unrelated errors, unsupported codes, validation errors, malformed metadata, and supported codes without a callback. This preserves original identity, stack, and non-Error thrown values. Callback exceptions also propagate unchanged.

Routing is explicit:

1. A per-call Prisma code override, or the base code mapping.
2. A configured table/constraint mapping, if CHECK parsing succeeds.
3. `onUnhandledPrismaError` for a recognized Prisma error that has not matched either mapping.
4. `fallback` for non-Prisma inputs only.

Both hooks are optional and otherwise rethrow the original input. A callback that returns `undefined` has still handled the error; routing does not continue. A callback exception propagates unchanged.

For a centralized boundary that prefers returning the original value:

```ts
const preserve = createPrismaErrorHandler({
  P2025: () => ({ message: 'Missing record' }),
}, {
  onUnhandledPrismaError: error => error, // error is typed as PrismaError
  fallback: error => error, // error is unknown
});

const result = preserve(error); // unknown, necessarily: fallback accepts unknown
```

A typed fallback such as `fallback: () => new AppError(500, 'Unexpected error')` instead yields the union of callback and fallback return types. It intentionally converts unrelated errors because the application explicitly opted in.

**Migrating from 0.1.x to 0.2.0:** `fallback` previously received all unmatched inputs. It now receives only non-Prisma inputs. Move Prisma-specific fallback logic to `constraints` or `onUnhandledPrismaError`. To retain a shared catch-all policy, assign the same function to both hooks. Existing code mappings, enum values, and per-call code overrides remain compatible.

```ts
import { getPrismaErrorKind } from 'prisma-error-mapper';

switch (getPrismaErrorKind(error)) {
  case 'known-request': break;
  case 'initialization': break;
  case 'validation': break;
  case 'unknown-request': break;
  case 'rust-panic': break;
  case undefined: break; // unrelated input
}
```

## Structured PostgreSQL CHECK diagnostics (opt-in)

`parsePrismaPostgresError(error)` derives a separate structure from the Prisma 6.14 PostgreSQL CHECK failure format verified by the integration tests. It supports ORM unknown-request diagnostics and raw-query P2010 metadata with SQLSTATE 23514. It does not parse arbitrary Prisma messages or other constraint types.

```ts
import { parsePrismaPostgresError, createPrismaErrorHandler } from 'prisma-error-mapper';

const diagnostic = parsePrismaPostgresError(error);
// For the tested ORM CHECK failure:
// {
//   provider: 'postgresql',
//   kind: 'check-constraint',
//   sqlState: '23514',
//   tableName: 'Account',
//   constraintName: 'check normal email',
//   source: 'message',
//   original: error,
// }

const handle = createPrismaErrorHandler({}, {
  onUnhandledPrismaError: (error) => {
    const diagnostic = parsePrismaPostgresError(error);
    if (
      diagnostic?.tableName === 'Account' &&
      diagnostic.constraintName === 'check normal email'
    ) {
      return new AppError(422, 'האימייל אינו יכול להתחיל ב־123', 'INVALID_EMAIL_PREFIX');
    }
    throw error;
  },
});

// Inside your catch block:
throw handle(error);
```

`sqlState` is a PostgreSQL code, not a Prisma `P...` code. `source` is `message` for unknown-request errors or `raw-query-meta` for P2010. The exported `ParsedPrismaPostgresError` type narrows the `original` error type by `source`. The derived structure is never inserted into `original.meta`, and existing guards and handler mappings remain unchanged.

Parsing is best-effort and format-dependent. The parser requires a real Prisma error instance, the matching SQLSTATE, and the recognized primary PostgreSQL CHECK message. It ignores row details when identifying the constraint. Unsupported or malformed inputs return `undefined` without throwing. Localized/changed formats, identifiers containing double quotes, Rust debug escapes outside the supported JSON-compatible subset, and messages longer than 65,536 characters are deliberately unsupported. This is not a stable PostgreSQL protocol decoder: retain the original error as a fallback and rerun integration tests when upgrading Prisma.

## Supported codes and metadata

| Code | Meaning | Validated raw fields | Normalized view |
| --- | --- | --- | --- |
| P2002 | Unique constraint failure | `target?: string[] \| string \| null`, `modelName?: string` | Array becomes `target`; string becomes `constraintName`; null is omitted |
| P2015 | Related record missing | `details?: string`, `modelName?: string` | Same optional fields |
| P2025 | Required record missing | `cause?: string`, `modelName?: string` | Same optional fields |
| P1012 | Schema/configuration validation failure | No guaranteed client metadata fields | Empty object |

P1012 initialization errors use `errorCode`, not `code`, and have no `meta`. The raw P1012 type reflects that union. Known-request P1012 errors are also accepted when that class actually carries the code. A validation error whose message happens to mention P1012 is not treated as a coded error. CLI output is not a client error instance and is not parsed.

The package-generated `context.code` unifies `code` and `errorCode`; `context.kind` describes the source category; `context.meta` is normalized metadata. Prisma-provided values remain accessible on `context.original`. No columns are inferred from constraint names or error text. Unknown metadata fields are excluded from the normalized view.

## Prisma/provider limitations

The implementation was checked against the published **6.14.0** runtime declarations and version-tagged source, not inferred from current Prisma versions. See [research notes](docs/prisma-6.14.md) for sources.

- `meta`, `batchRequestIdx`, initialization `errorCode`, and provider fields are optional. `batchRequestIdx` is non-enumerable; retain the original error instead of spreading it.
- A string P2002 target may name a constraint rather than a column. Even array entries should not be treated as portable UI field identifiers without application knowledge.
- Detection uses Prisma's real constructors from `@prisma/client/runtime/library.js`. Matching a name and code alone would convert unrelated errors. Separate runtime copies, realms, serialized errors, and some alternate generated-client runtimes may fail `instanceof`; they follow fallback. Use a shared/deduplicated client runtime. This is a Node package, not an edge-runtime compatibility layer.
- Metadata validation handles ordinary Prisma values and rejects malformed fields. It does not promise security isolation from deliberately stateful getters or mutated prototypes.
- Unit tests construct actual runtime classes without a database. A separate container integration suite exercises generated Prisma 6.14.0 queries against PostgreSQL 16.15; other providers remain unverified.
- Prisma 7 is outside the peer range. Supporting it requires rechecking runtime export paths, class identity, adapter/provider metadata, and generated client behavior before widening the range.

## Adding another error code

Add its verified raw metadata to `PrismaErrorMetaMap` in `src/types.ts` and a semantic member to `PrismaErrorCodes` in `src/codes.ts`; add runtime validation in `src/guards.ts` and an explicit normalization branch in `src/metadata.ts`. Add code-specific runtime and inference tests. Update the table and sources. Types alone do not enable runtime support: declaration merging is not a supported extension mechanism. All provider-dependent fields should remain optional. No message or HTTP mapping is required.

## Public exports

Runtime: `PrismaErrorCodes`, `isPrismaError`, `isPrismaKnownRequestError`, `getPrismaErrorKind`, `getPrismaErrorContext`, `createPrismaErrorHandler`, `parsePrismaPostgresError`.

Types: `PrismaError`, `PrismaErrorCode`, `PrismaErrorForCode`, `PrismaErrorMeta`, `PrismaErrorMetaMap`, `NormalizedPrismaErrorMeta`, `PrismaErrorContext`, `PrismaErrorHandlerMap`, `PrismaConstraintHandlerMap`, `PrismaErrorHandler`, `PrismaErrorKind`, `ParsedPrismaPostgresError`.

## Development and packaging

```sh
npm ci
npm run check
npm pack --dry-run
```

`check` runs strict compile-time assertions, Node's built-in test runner, and the declaration/source-map build. No test framework or bundler dependency is needed. `.test-build` and tests are excluded from the tarball. Source is shipped for working source/declaration maps. ESM imports are supported; a separate CommonJS build is intentionally omitted.

## PostgreSQL container integration tests

The fixture also installs a custom named `CHECK` from `tests/integration/check-normal-email.sql`:

```sql
ALTER TABLE "Account"
  ADD CONSTRAINT "check normal email"
  CHECK ("email" NOT LIKE '123%');
```

This rejects inserts and updates when the email starts with `123`; values containing `123` elsewhere remain allowed. The quoted name preserves its spaces. It is a prefix rule, not general email validation. The fixture's email column is already non-nullable.

With the tested Prisma 6.14.0 standard client, ORM create/update failures are **`PrismaClientUnknownRequestError`**, with SQLSTATE `23514` and the constraint name embedded in the diagnostic message, but no structured `code` or `meta`. The package classifies them as `unknown-request`. Configured `constraints` mappings handle them directly; unmatched Prisma errors otherwise rethrow or reach `onUnhandledPrismaError`. Applications can also explicitly call `parsePrismaPostgresError` to derive a separate diagnostic structure. Executing a violating raw SQL statement instead yields P2010 with `meta.code === '23514'` and the name inside `meta.message`, still without a Prisma-provided constraint-name field. Integration tests cover parsing and direct mapping on both paths and verify that rejected updates leave the original email intact.

Start Docker Desktop (Linux containers) or a local Docker Engine, then run:

```sh
npm ci
npm run test:integration
```

The runner uses the Docker CLI directly, with no Testcontainers dependency. It starts a digest-pinned PostgreSQL 16.15 image, binds an ephemeral port to `127.0.0.1`, waits for TCP readiness, generates Prisma Client 6.14.0, compiles the integration tests, and pushes the fixture schema. Test data lives in a temporary in-memory container filesystem. Each test clears its fixtures, and the runner removes its uniquely named container on success, failure, or handled interruption. Forced process termination or a stopped Docker daemon may require manual removal using the container name printed by the runner. The Docker image remains cached.

The runner supplies its own `PRISMA_ERROR_TEST_DATABASE_URL`; it does not use your application's `DATABASE_URL` or an externally supplied database. Run the npm command rather than invoking the compiled test file directly. The first run needs network access for the image and Prisma engines. Missing Docker is a failure, not a silently skipped suite. Generated artifacts stay in `node_modules/.prisma` and `.integration-build`; integration infrastructure is excluded from the published package. The Prisma CLI is a pinned development dependency only.

Coverage includes:

- Default and explicitly named Prisma unique indexes, single-column and compound keys.
- Database-generated and explicitly named SQL `UNIQUE` constraints created independently of Prisma's `@unique` annotation. PostgreSQL always assigns a name, even when SQL omits one.
- A catalog check confirming that the fixture names actually differ as intended.
- Mapped database columns: `externalId @map("external_id")` reports `target: ["external_id"]`.
- P2025 from missing reads, updates, deletes, and a nested relation connect.
- P1012 from invalid PostgreSQL datasource configuration, and uncoded Prisma query validation errors.
- Unsupported foreign-key P2003 and raw-query P2010 errors preserving the original error. A raw SQL duplicate reports P2010/SQLSTATE 23505 rather than P2002.
- Batch transaction rollback and non-enumerable `batchRequestIdx`, plus concurrent inserts with one unique-constraint failure.
- Hebrew custom error objects and per-operation overrides against actual database errors.

**Observed PostgreSQL behavior:** named and default-named constraints both produce column arrays in P2002 metadata, not constraint-name strings. Other providers can differ. P2015 remains covered by constructor-based unit tests; the real nested missing-record scenario here emits P2025, so the suite does not manufacture a P2015 response. Unknown-request errors and Rust panics are likewise unit-tested rather than induced by destabilizing the engine.

CI runs unit/build checks and a separate container integration job on Node 22 and 24. `npm run check` and `npm pack` stay Docker-independent.
