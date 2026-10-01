# Express + Prisma demo

This is a small consumer application for `prisma-error-mapper`. It intentionally
keeps mappings inside each route's `catch`, so every operation declares only the
database failures it can translate.

## Run it

Requirements: Node 22 and Docker Desktop.

```powershell
# From the repository root, install and build the local package first.
npm install
npm run build

cd demo
npm install
Copy-Item .env.example .env
docker compose up -d --wait
npm run db:setup
npm run dev
```

The demo depends on `file:..`, so it exercises a packed copy of the local package
without publishing anything to npm. The demo's `.npmrc` enables this packed install
so the package and app share the demo's `@prisma/client` runtime; that matters because
the package's Prisma guards intentionally use `instanceof`. Stop it with Ctrl+C,
then remove the disposable database:

```powershell
docker compose down
```

## Routes

| Route | Package behavior shown |
| --- | --- |
| `POST /accounts` | P2002 metadata, custom `AppError`, named CHECK mapping, `DatabaseConstraints` |
| `PATCH /accounts/:id/email` | P2025 and a per-operation P2002 override |
| `DELETE /accounts/:id` | P2025 metadata |
| `POST /posts` | P2015 mapping plus the P2025 result normally emitted by this Prisma/PostgreSQL path |
| `POST /payments` | Named CHECK mapping and direct `parsePrismaPostgresError` use |
| `POST /examples/raw-check` | Raw-query P2010/SQLSTATE 23514 routed through the same named CHECK map |
| `GET /examples/p1012` | P1012 initialization mapping from an intentionally invalid datasource |
| `GET /examples/validation` | `onUnhandledPrismaError` for a validation error without a P-code |
| `POST /examples/unhandled-prisma` | `onUnhandledPrismaError` for unsupported P2003 |
| `GET /examples/fallback` | Non-Prisma `fallback` routing |
| `POST /examples/guard` | `isPrismaKnownRequestError`, `isPrismaError`, and `getPrismaErrorContext` inspection without a handler |

P2015 is part of the package's supported type map, but Prisma 6.14 with PostgreSQL
normally emits P2025 for the nested-connect example. The route maps both codes so it
is portable across a path/provider that emits P2015 without pretending the local
PostgreSQL run produced it.

## Try the main cases

```powershell
$json = @{ email = 'person@example.test'; name = 'Person' } | ConvertTo-Json
Invoke-RestMethod http://localhost:3000/accounts -Method Post -ContentType application/json -Body $json

# P2002
Invoke-RestMethod http://localhost:3000/accounts -Method Post -ContentType application/json -Body $json

# PostgreSQL CHECK violation
$invalid = @{ email = '123blocked@example.test'; name = 'Blocked' } | ConvertTo-Json
Invoke-RestMethod http://localhost:3000/accounts -Method Post -ContentType application/json -Body $invalid

# P2025
Invoke-RestMethod http://localhost:3000/accounts/-1 -Method Delete

# Related record missing (normally P2025 here)
$post = @{ title = 'Missing owner'; accountId = -1 } | ConvertTo-Json
Invoke-RestMethod http://localhost:3000/posts -Method Post -ContentType application/json -Body $post

# Named payment CHECK
$payment = @{ amount = 0; accountId = 1 } | ConvertTo-Json
Invoke-RestMethod http://localhost:3000/payments -Method Post -ContentType application/json -Body $payment

# The same CHECK through raw SQL (P2010 with source: raw-query-meta)
Invoke-RestMethod http://localhost:3000/examples/raw-check -Method Post

Invoke-RestMethod http://localhost:3000/examples/p1012
Invoke-RestMethod http://localhost:3000/examples/validation
Invoke-RestMethod http://localhost:3000/examples/fallback
```

`DatabaseConstraints` is application-owned because Prisma does not generate types
for SQL CHECK names. Its keys use `Prisma.ModelName` for autocomplete and typo
checking; its values must stay aligned with `prisma/constraints.sql`. If a model uses
`@@map`, handler lookup must use the mapped database table name instead.
