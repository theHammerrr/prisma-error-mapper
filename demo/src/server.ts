import { Prisma, PrismaClient } from '@prisma/client';
import express from 'express';
import type { ErrorRequestHandler, Request } from 'express';
import {
  PrismaErrorCodes,
  createPrismaErrorHandler,
  getPrismaErrorContext,
  getPrismaErrorKind,
  isPrismaError,
  isPrismaKnownRequestError,
  parsePrismaPostgresError,
} from 'prisma-error-mapper';
import { AppError } from './app-error.js';
import { DatabaseConstraints } from './database-constraints.js';
import { prisma } from './prisma.js';

const app = express();
app.use(express.json());

function numberParameter(request: Request, name: string): number {
  const value = Number(request.params[name]);
  if (!Number.isInteger(value)) throw new AppError(400, `${name} must be an integer`, 'INVALID_PARAMETER');
  return value;
}

function bodyRecord(request: Request): Record<string, unknown> {
  const body: unknown = request.body;
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new AppError(400, 'A JSON object is required', 'INVALID_BODY');
  }
  return body as Record<string, unknown>;
}

function stringBody(request: Request, name: string): string {
  const value = bodyRecord(request)[name];
  if (typeof value !== 'string' || value.length === 0) {
    throw new AppError(400, `${name} must be a non-empty string`, 'INVALID_BODY');
  }
  return value;
}

function numberBody(request: Request, name: string): number {
  const value = bodyRecord(request)[name];
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new AppError(400, `${name} must be an integer`, 'INVALID_BODY');
  }
  return value;
}

app.get('/health', async (_request, response) => {
  await prisma.$queryRaw`SELECT 1`;
  response.json({ ok: true });
});

// P2002 plus a named PostgreSQL CHECK constraint, using a custom AppError.
app.post('/accounts', async (request, response) => {
  const email = stringBody(request, 'email');
  const name = stringBody(request, 'name');
  try {
    const account = await prisma.account.create({ data: { email, name } });
    response.status(201).json(account);
  } catch (error) {
    const accountConstraints = DatabaseConstraints[Prisma.ModelName.Account];
    throw createPrismaErrorHandler(
      {
        [PrismaErrorCodes.UniqueConstraintViolation]: ({ meta }) => new AppError(
          409,
          meta.target?.includes('email') ? 'An account with this email already exists' : 'A value already exists',
          'ACCOUNT_ALREADY_EXISTS',
          { fields: meta.target },
        ),
      },
      {
        constraints: {
          [Prisma.ModelName.Account]: {
            [accountConstraints.NormalEmail]: ({ schemaName, constraintName }) => new AppError(
              422,
              'Email cannot begin with 123',
              'INVALID_EMAIL_PREFIX',
              { schemaName, constraintName },
            ),
          },
        },
      },
    )(error);
  }
});

// P2025 and a per-call P2002 override for this operation.
app.patch('/accounts/:id/email', async (request, response) => {
  const id = numberParameter(request, 'id');
  const email = stringBody(request, 'email');
  try {
    const account = await prisma.account.update({ where: { id }, data: { email } });
    response.json(account);
  } catch (error) {
    const accountConstraints = DatabaseConstraints[Prisma.ModelName.Account];
    const handler = createPrismaErrorHandler(
      {
        [PrismaErrorCodes.RecordNotFound]: () => new AppError(404, 'Account not found', 'ACCOUNT_NOT_FOUND'),
        [PrismaErrorCodes.UniqueConstraintViolation]: () => new AppError(409, 'Value already exists', 'DUPLICATE_VALUE'),
      },
      {
        constraints: {
          [Prisma.ModelName.Account]: {
            [accountConstraints.NormalEmail]: () => new AppError(422, 'Email cannot begin with 123', 'INVALID_EMAIL_PREFIX'),
          },
        },
      },
    );
    throw handler(error, {
      [PrismaErrorCodes.UniqueConstraintViolation]: () => new AppError(
        409,
        'Another account already uses this email',
        'EMAIL_ALREADY_EXISTS',
      ),
    });
  }
});

// P2025 from deleting a missing record.
app.delete('/accounts/:id', async (request, response) => {
  const id = numberParameter(request, 'id');
  try {
    await prisma.account.delete({ where: { id } });
    response.status(204).end();
  } catch (error) {
    throw createPrismaErrorHandler({
      [PrismaErrorCodes.RecordNotFound]: ({ meta }) => new AppError(
        404,
        'Account not found',
        'ACCOUNT_NOT_FOUND',
        { cause: meta.cause },
      ),
    })(error);
  }
});

// P2015 is supported, although this Prisma/PostgreSQL path normally emits P2025.
app.post('/posts', async (request, response) => {
  const title = stringBody(request, 'title');
  const accountId = numberBody(request, 'accountId');
  try {
    const post = await prisma.post.create({
      data: { title, account: { connect: { id: accountId } } },
    });
    response.status(201).json(post);
  } catch (error) {
    throw createPrismaErrorHandler({
      [PrismaErrorCodes.RelatedRecordNotFound]: ({ meta }) => new AppError(
        404,
        'The related account does not exist',
        'RELATED_ACCOUNT_NOT_FOUND',
        { details: meta.details },
      ),
      [PrismaErrorCodes.RecordNotFound]: ({ meta }) => new AppError(
        404,
        'The related account does not exist',
        'RELATED_ACCOUNT_NOT_FOUND',
        { cause: meta.cause },
      ),
    })(error);
  }
});

// A second named CHECK example and direct parser use.
app.post('/payments', async (request, response) => {
  const amount = numberBody(request, 'amount');
  const accountId = numberBody(request, 'accountId');
  try {
    const payment = await prisma.payment.create({ data: { amount, accountId } });
    response.status(201).json(payment);
  } catch (error) {
    const parsed = parsePrismaPostgresError(error);
    const paymentConstraints = DatabaseConstraints[Prisma.ModelName.Payment];
    throw createPrismaErrorHandler({}, {
      constraints: {
        [Prisma.ModelName.Payment]: {
          [paymentConstraints.PositiveAmount]: () => new AppError(
            422,
            'Payment amount must be positive',
            'INVALID_PAYMENT_AMOUNT',
            parsed && { sqlState: parsed.sqlState, constraintName: parsed.constraintName },
          ),
        },
      },
    })(error);
  }
});

// The same named CHECK reached through raw SQL: Prisma exposes this as P2010.
app.post('/examples/raw-check', async (_request, response) => {
  try {
    await prisma.$executeRaw`INSERT INTO "Payment" ("amount", "accountId") VALUES (0, 1)`;
    response.status(201).json({ unexpected: true });
  } catch (error) {
    const paymentConstraints = DatabaseConstraints[Prisma.ModelName.Payment];
    throw createPrismaErrorHandler({}, {
      constraints: {
        [Prisma.ModelName.Payment]: {
          [paymentConstraints.PositiveAmount]: parsed => new AppError(
            422,
            'Raw payment insert violated the positive amount constraint',
            'RAW_PAYMENT_CHECK_FAILED',
            { source: parsed.source, sqlState: parsed.sqlState, constraintName: parsed.constraintName },
          ),
        },
      },
    })(error);
  }
});

// Diagnostic-only P1012 example from an intentionally invalid datasource.
app.get('/examples/p1012', async (_request, response) => {
  const invalid = new PrismaClient({ datasourceUrl: 'mysql://localhost/not-postgresql' });
  try {
    await invalid.$connect();
    response.json({ unexpected: true });
  } catch (error) {
    throw createPrismaErrorHandler({
      [PrismaErrorCodes.SchemaValidationFailed]: ({ kind }) => new AppError(
        500,
        'The Prisma datasource configuration is invalid',
        'PRISMA_SCHEMA_INVALID',
        { kind },
      ),
    })(error);
  } finally {
    await invalid.$disconnect();
  }
});

// Validation errors have no P-code and reach onUnhandledPrismaError.
app.get('/examples/validation', async (_request, response) => {
  try {
    // @ts-expect-error Deliberately exercises Prisma's runtime validation boundary.
    const accounts = await prisma.account.findMany({ take: 'invalid' });
    response.json(accounts);
  } catch (error) {
    throw createPrismaErrorHandler({}, {
      onUnhandledPrismaError: prismaError => new AppError(
        400,
        'Invalid Prisma query input',
        'INVALID_QUERY',
        { kind: getPrismaErrorKind(prismaError) },
      ),
    })(error);
  }
});

// P2003 is a Prisma error that this package does not map by code.
app.post('/examples/unhandled-prisma', async (request, response) => {
  const accountId = numberBody(request, 'accountId');
  try {
    const post = await prisma.post.create({ data: { title: 'orphan', accountId } });
    response.status(201).json(post);
  } catch (error) {
    throw createPrismaErrorHandler({}, {
      onUnhandledPrismaError: prismaError => new AppError(
        409,
        'An unsupported Prisma database error occurred',
        'UNHANDLED_PRISMA_ERROR',
        { kind: getPrismaErrorKind(prismaError) },
      ),
    })(error);
  }
});

// fallback handles only non-Prisma inputs.
app.get('/examples/fallback', () => {
  throw createPrismaErrorHandler({}, {
    fallback: () => new AppError(502, 'A dependency failed', 'DEPENDENCY_FAILURE'),
  })(new Error('Example third-party failure'));
});

// Guard-based narrowing without a handler.
app.post('/examples/guard', async (request, response) => {
  const email = stringBody(request, 'email');
  try {
    const account = await prisma.account.create({ data: { email, name: 'guard example' } });
    response.status(201).json(account);
  } catch (error) {
    const context = getPrismaErrorContext(error);
    if (isPrismaKnownRequestError(error)
      && isPrismaError(error, PrismaErrorCodes.UniqueConstraintViolation)
      && context?.code === PrismaErrorCodes.UniqueConstraintViolation) {
      response.status(409).json({
        code: error.code,
        kind: context?.kind,
        target: context?.meta.target,
      });
      return;
    }
    throw error;
  }
});

const errorMiddleware: ErrorRequestHandler = (error: unknown, _request, response, _next) => {
  if (error instanceof AppError) {
    response.status(error.status).json({
      error: { code: error.code, message: error.message, details: error.details },
    });
    return;
  }
  console.error(error);
  response.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
};
app.use(errorMiddleware);

const port = Number(process.env.PORT ?? 3000);
const server = app.listen(port, () => {
  console.log(`Demo API listening on http://localhost:${port}`);
});

function shutdown(): void {
  server.close(() => {
    void prisma.$disconnect();
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
