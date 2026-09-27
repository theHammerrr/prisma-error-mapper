# Integrating prisma-error-mapper into an application

This guide describes package 0.2.x: ESM, Node.js 22+, TypeScript 5.9.2, and
`@prisma/client` 6.14.x with the default `prisma-client-js` generator. The package
has not yet been published to npm. Install a tarball produced by `npm pack` in the
package repository; keep the application's Prisma CLI and client versions aligned.
Check the installed version and public declarations before applying these examples.

## Choose the application boundary

Inspect existing service-level catches and centralized error handling first. Reuse
the application's error class and translation system. The package maps Prisma
semantics to values chosen by the application; it supplies no HTTP policy or
user-facing messages. Do not wrap every query if an existing boundary already handles
the required errors. Use a handler scoped to an operation when its business meaning
differs from a generic database failure.

## A complete handler with application errors and translations

The following module is standalone. Replace `AppError` with your existing class and
pass your request's translation function to the factory. The status numbers and
application codes below are example application decisions.

```ts
import { createPrismaErrorHandler, PrismaErrorCodes } from 'prisma-error-mapper';

class AppError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

type MessageKey = 'duplicateEmail' | 'duplicateValue' | 'missing' | 'invalidEmail';
type Translate = (key: MessageKey) => string;

export function createAccountErrorHandler(t: Translate) {
  return createPrismaErrorHandler(
    {
      [PrismaErrorCodes.UniqueConstraintViolation]: ({ meta }) => {
        // This handler is scoped to Account operations. Match the whole target.
        const emailOnly = meta.target?.length === 1 && meta.target[0] === 'email';
        return new AppError(
          409,
          t(emailOnly ? 'duplicateEmail' : 'duplicateValue'),
          emailOnly ? 'EMAIL_ALREADY_EXISTS' : 'VALUE_ALREADY_EXISTS',
        );
      },
      [PrismaErrorCodes.RecordNotFound]: () =>
        new AppError(404, t('missing'), 'ACCOUNT_NOT_FOUND'),
    },
    {
      constraints: {
        Account: {
          'check normal email': () =>
            new AppError(422, t('invalidEmail'), 'EMAIL_PREFIX_NOT_ALLOWED'),
        },
      },
    },
  );
}

const messages: Record<MessageKey, string> = {
  duplicateEmail: 'כתובת האימייל כבר קיימת במערכת',
  duplicateValue: 'הערך כבר קיים במערכת',
  missing: 'הרשומה המבוקשת לא נמצאה',
  invalidEmail: 'כתובת האימייל לא יכולה להתחיל ב־123',
};

export const handleAccountError = createAccountErrorHandler(key => messages[key]);
```

At the existing catch boundary, call `throw handleAccountError(error)`. It returns
an inferred `AppError` for a mapped failure and throws the original object for
anything unmapped. For a value-returning boundary, callbacks can instead return
your application's result objects. The API is synchronous; if callbacks deliberately
return promises, await the result before throwing.

For translations with parameters, a callback can call
`t('errors.uniqueConstraint', { field: meta.target?.[0] })` using the application's
own translator signature. Do not mutate a shared global locale per request.

## Per-operation overrides

Pass a second mapping argument to replace a code mapping for one invocation:

```ts
// Inside a catch, with the application's AppError and error variable in scope:
throw handleAccountError(error, {
  [PrismaErrorCodes.RecordNotFound]: () =>
    new AppError(404, 'המשתמש המבוקש לא נמצא', 'USER_NOT_FOUND'),
});
```

Overrides retain callback inference and contribute to the inferred return union.
They apply to code mappings, not the table/constraint map. Configure a separate
handler if a named CHECK constraint needs different behavior for another operation.

## Named PostgreSQL constraints

The example handler expects this constraint on the database table `Account`:

```sql
ALTER TABLE "Account"
  ADD CONSTRAINT "check normal email"
  CHECK ("email" NOT LIKE '123%');
```

Use the application's normal migration workflow to introduce this rule when the
feature requires it. It rejects create/update values starting with `123`; it is not
a complete email validator. Check existing data before applying a migration.

Use exact database table names (including `@@map`) and exact constraint names,
including spaces and case. A constraint such as `can_update` can use the same map
only if it is a PostgreSQL CHECK violation supported by the parser. A trigger
exception or another constraint type with that name is not automatically supported.

In the tested Prisma 6.14 engine, ORM CHECK failures are
`PrismaClientUnknownRequestError`: they are Prisma errors but have no structured
Prisma code or metadata. Registering `constraints` opts into the package's narrow
message parser. Raw-query CHECK failures use P2010 with PostgreSQL SQLSTATE 23514
in raw metadata. The parser also accepts a captured nested PostgreSQL database-error
debug shape. These supported shapes can reach the same named CHECK mapping.

The parsed context contains `provider`, `kind`, `sqlState`, optional `schemaName`,
`tableName`, `constraintName`, `source`, and `original`. These are package-generated
information, not fields added to Prisma's `meta`. `parsePrismaPostgresError(error)`
exposes this context directly when needed. Nested structured table/constraint fields
are checked against the primary message. A structured schema is kept separately; it
is never prepended to an unqualified relation name.

PostgreSQL unique constraints are different: P2002 reports database columns in
`meta.target` even for explicitly named unique constraints. Match the actual columns
and the operation/model, not an assumed unique constraint name. Mapped columns use
their database names; compound constraints require checking the complete target.
Other providers may return a string target, normalized as `meta.constraintName`.

## Routing and original-error preservation

The handler routes errors in this order:

1. A matching per-operation code override, or the configured code mapping.
2. A matching parsed PostgreSQL CHECK table/name mapping.
3. `onUnhandledPrismaError` for recognized but unmapped Prisma errors.
4. `fallback` for non-Prisma inputs only.

Absent hooks rethrow the original input unchanged. `fallback: error => error`
returns unrelated inputs unchanged but broadens the return type to `unknown`.
Do not use `fallback` to handle unmapped Prisma errors in 0.2.x. Applications
migrating from 0.1.x must move that logic into `onUnhandledPrismaError` or
`constraints`. Callback exceptions propagate unchanged.

Unknown-request errors are a Prisma category, not synonymous with non-Prisma
errors. Validation and initialization errors are also separate categories.
`getPrismaErrorKind(error)` distinguishes these categories, plus known-request and
Rust-panic errors. Avoid turning initialization or panic failures into client-input
errors merely because they came from Prisma.

## Guards and metadata

Use `isPrismaError(error, PrismaErrorCodes.UniqueConstraintViolation)` for validated
raw narrowing. Raw access is `error.meta?.target`: `meta` may be missing and the
target can be an array, string, or null. In handler callbacks, `meta` always exists,
and P2002's normalized `meta.target` is an optional readonly array. A string target
becomes `meta.constraintName`, never an invented array of field names.

| Enum member | Prisma code | Reliable handling notes |
| --- | --- | --- |
| `UniqueConstraintViolation` | P2002 | Optional target/model metadata; provider-dependent |
| `RelatedRecordNotFound` | P2015 | Optional details/model metadata |
| `RecordNotFound` | P2025 | Optional cause/model metadata |
| `SchemaValidationFailed` | P1012 | Known-request code or initialization errorCode; no guaranteed metadata fields |

Use `getPrismaErrorContext` for a normalized supported-code discriminated union
outside a handler. `isPrismaKnownRequestError` identifies the class without promising
that an arbitrary code has a supported metadata schema. Validation errors do not
gain a code or metadata through these guards. `original` preserves identity and
Prisma details such as clientVersion and optional batchRequestIdx.

Adding an unsupported code requires package changes to its types, runtime validation,
normalization, and tests. A TypeScript assertion or interface extension alone cannot
add runtime support. Until then, use an authenticated class guard and explicit code
check in `onUnhandledPrismaError`, validating every raw metadata value you consume.

## Verification in the consumer application

Run the application's typecheck and targeted tests. Check mapped results/custom-error
identity, translations, per-operation overrides, missing metadata, and unchanged
unrelated/unmapped errors. Unit tests can construct real error classes from the
installed `@prisma/client/runtime/library.js`; plain name/code lookalikes intentionally
fail the guards. Keep that Prisma implementation import in test fixtures.

For provider-sensitive mappings, use an isolated test database or container and the
application's actual migrations. Test named and unnamed uniqueness, mapped and
compound columns where used, CHECK rejection on create and update, allowed values,
and an unrelated CHECK that must remain unmapped. Test raw-query behavior if the
application uses it. Never run destructive fixture setup against an application database.

## Compatibility limits

The package has been tested with Node 22/24, Prisma 6.14.0, and PostgreSQL 16.15.
PostgreSQL 15, other providers, and Prisma 7 need separate integration verification.
Do not infer Prisma 7 compatibility from similar exported type names.

Guards use Prisma class identity. Different runtime copies, alternate generators,
cross-realm errors, and serialized errors may not match. Resolve dependency/runtime
duplication instead of casting a plain object to a Prisma error.

CHECK parsing depends on the supported connector diagnostic/English PostgreSQL format.
Unsupported/localized/changed formats, double quotes in identifiers, unsupported
Rust escapes, and messages over 65,536 characters are left unmapped. The tested
live non-public schema diagnostic omits its schema name. Nested structured diagnostics
and actually schema-qualified primary relations can expose `schemaName`, but handler
lookup remains table/constraint based, so use separate handlers where schemas reuse
table/constraint names. Server `file` paths are diagnostic data and are not used for
parsing or OS detection.
Keep default rethrow behavior or an explicit unhandled-Prisma policy for these cases.
