# Prisma 6.14 verification

Checked 2026-09-27. Baseline: npm `@prisma/client@6.14.0`, TypeScript 5.9.2. The v6 documentation is version-scoped, while Git tags below pin the exact source baseline.

- [Prisma v6 error reference](https://www.prisma.io/docs/orm/v6/reference/error-reference): confirms the four supported error semantics and distinct client error classes. Documentation message placeholders do not establish guaranteed client metadata fields.
- [Known request class, tag 6.14.0](https://github.com/prisma/prisma/blob/6.14.0/packages/client/src/runtime/core/errors/PrismaClientKnownRequestError.ts): `code` and `clientVersion` are strings; `meta` is an optional record of unknown values; `batchRequestIdx` is optional and non-enumerable.
- [Initialization class, tag 6.14.0](https://github.com/prisma/prisma/blob/6.14.0/packages/client/src/runtime/core/errors/PrismaClientInitializationError.ts): optional `errorCode`; no declared metadata or `code`.
- [Query engine errors, tag 6.14.0](https://github.com/prisma/prisma-engines/blob/6.14.0/libs/user-facing-errors/src/query_engine/mod.rs): P2002 serializes a constraint under `target`. Its untagged enum permits field arrays, index strings, and null unit variants. P2015 carries `details`; P2025 carries `cause`.
- [Request handler, tag 6.14.0](https://github.com/prisma/prisma/blob/6.14.0/packages/client/src/runtime/RequestHandler.ts): can add `modelName` when constructing known request errors. It is not a universally present engine field.
- [Common engine errors, tag 6.14.0](https://github.com/prisma/prisma-engines/blob/6.14.0/libs/user-facing-errors/src/common.rs): schema parser errors use P1012. An engine diagnostic is not necessarily exposed as client metadata; no convenience fields are invented for it.

The installed `runtime/library.d.ts` and direct runtime constructors are checked during implementation and unit tests. Unit tests instantiate actual classes without generating a Prisma client or connecting to a database. Handler metadata is explicitly a package-generated validated view. The original object remains unmodified.

## PostgreSQL integration observations

`npm run test:integration` uses generated Prisma Client/CLI 6.14.0 and a digest-pinned PostgreSQL 16.15 container. On Windows, Node 22.16.0 and Node 24.20.0 both passed all 18 unit tests, 19 integration tests, TypeScript checks, and the build. CI also runs Node 22 and 24 on Linux.

Both explicit and generated unique-index/constraint names yield P2002 `target` arrays of database columns. A mapped `externalId` field yields `external_id`; compound constraints preserve the observed column order. Constraint names are verified independently through PostgreSQL catalogs.

Missing reads/updates/deletes and a nested connect emit P2025. An invalid datasource protocol emits initialization P1012 with `errorCode` and no raw metadata. A raw SQL duplicate instead emits P2010 with SQLSTATE 23505, and foreign-key violations emit P2003. Batch failures retain a non-enumerable request index. These observations are assertions in `tests/integration/postgres.test.ts`, not inferred guarantees for every provider.
