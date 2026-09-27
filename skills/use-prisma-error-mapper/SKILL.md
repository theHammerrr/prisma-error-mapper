---
name: use-prisma-error-mapper
description: Integrate prisma-error-mapper into a consuming TypeScript application. Use when adding or adjusting Prisma error mappings, semantic error-code guards, application errors, translations, operation-specific overrides, or named PostgreSQL CHECK constraint handling with this package.
---

# Use prisma-error-mapper

Read [the integration guide](references/integration-guide.md) before editing the
consumer application. It documents the 0.2 API and its provider limitations.

1. Inspect the application's installed package and Prisma versions, client generator,
   database provider, schema/migrations, error classes, and existing error boundary.
   Use the installed declarations if they differ from this bundled guide. Do not
   silently upgrade Prisma or substitute a client generator to fit an example.
2. Reuse the application's errors, status policy, translation function, and logging
   conventions. Keep the change scoped to the requested operations. Place shared
   mappings at an existing service or application boundary.
3. Prefer `PrismaErrorCodes` and inferred callbacks. Use callback `meta` for normalized
   fields; raw guard metadata remains optional and provider-dependent. Preserve
   unmapped errors unless the application has an explicit policy for them.
4. For named constraints, inspect the actual migration and database table name.
   Distinguish CHECK constraints from unique constraints. Register CHECK handlers
   by exact table and constraint name; do not parse arbitrary messages or route
   recognized Prisma errors through `fallback`.
5. Add focused application tests for successful mapping, unrelated constraints,
   missing metadata, and original-error preservation. Use an isolated database for
   provider-sensitive behavior. Run the application's typecheck and relevant tests.
6. Report the integration points, verification performed, and any unverified
   provider/version assumptions. Never claim Prisma 7 or PostgreSQL 15 support
   based only on this package's PostgreSQL 16 tests.

Use `throw handler(error)` only when the application intends to throw the mapped
result. A handler may return an ordinary value. There is no `.throw()` or `.with()`
API. Do not add framework or translation dependencies solely for this integration.
