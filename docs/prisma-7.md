# Prisma 7 entrypoint

Install this package alongside `@prisma/client@~7.10.0` and keep your application's Prisma CLI on version 7.10.x. Prisma 7 generates its client at an application-specific output path. Import `Prisma` from that generated client and bind the mapper to its error constructors:

```ts
import { Prisma } from './generated/prisma/client.js'; // use your generated output path
import { createPrisma7ErrorMapper } from 'prisma-error-mapper/prisma7';

const { isPrismaError, createPrismaErrorHandler } = createPrisma7ErrorMapper(Prisma);

const handle = createPrismaErrorHandler({
  P2002: ({ meta }) => new Error(`Duplicate value for ${meta.target?.[0] ?? 'a unique field'}`),
  P2025: () => new Error('Record not found'),
});

try {
  await prisma.account.create({ data: { email } });
} catch (error) {
  if (isPrismaError(error, 'P2002')) console.log(error.code);
  throw handle(error);
}
```

The mapper checks actual Prisma error constructors, validates supported metadata, and preserves the original error when no mapping applies. `P2002`, `P2015`, `P2025`, and `P1012` are the supported typed codes. For a PostgreSQL unique violation, Prisma 7.10's adapter exposes the index name through `meta.driverAdapterError.cause.constraint.index`; the mapper normalizes that to `meta.constraintName`. The other Prisma error classes follow `onUnhandledPrismaError` or are rethrown. `fallback` handles unrelated values. PostgreSQL CHECK message parsing and named CHECK constraint handlers are specific to the Prisma 6.14 entrypoint; they are not exposed here.

The `tests/prisma7` fixture uses Prisma 7.10.0 with a generated client and a PostgreSQL adapter. CI checks the package types and real P2002/P2025 errors against PostgreSQL. This version-scoped fixture has its own lockfile so the root fixture can continue testing Prisma 6.14.0.
