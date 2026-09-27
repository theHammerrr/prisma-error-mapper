import { PrismaErrorCodes, createPrismaErrorHandler, getPrismaErrorContext, isPrismaError, parsePrismaPostgresError } from '../src/index.js';
import type { PrismaErrorCode, PrismaErrorMeta, PrismaErrorHandlerMap } from '../src/index.js';
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
function expect<T extends true>(..._proof: T extends true ? [] : never): void {}
class AppError extends Error { status = 409; }
export function typeAssertions(error: unknown): void {
  const diagnostic = parsePrismaPostgresError(error);
  if (diagnostic) {
    expect<Equal<typeof diagnostic.sqlState, '23514'>>();
    expect<Equal<typeof diagnostic.kind, 'check-constraint'>>();
    expect<Equal<typeof diagnostic.constraintName, string>>();
    // @ts-expect-error Parsed diagnostics are not Prisma metadata.
    diagnostic.meta;
    if (diagnostic.source === 'message') {
      // @ts-expect-error The unknown-request original has no Prisma code.
      diagnostic.original.code;
    } else {
      expect<Equal<typeof diagnostic.original.code, string>>();
    }
  }
  const parsedHandler = createPrismaErrorHandler({}, { fallback: original => {
    if (parsePrismaPostgresError(original)) return new AppError();
    throw original;
  } });
  const parsedResult = parsedHandler(error);
  expect<Equal<typeof parsedResult, AppError>>();
  expect<Equal<`${PrismaErrorCodes}`, PrismaErrorCode>>();
  if (isPrismaError(error, PrismaErrorCodes.RecordNotFound)) {
    expect<Equal<typeof error.code, PrismaErrorCodes.RecordNotFound>>();
    const cause = error.meta?.cause;
    expect<Equal<typeof cause, string | undefined>>();
    // @ts-expect-error A missing-record error does not have unique-constraint metadata.
    error.meta?.target;
  }
  if (isPrismaError(error, PrismaErrorCodes.UniqueConstraintViolation)) {
    const target = error.meta?.target;
    expect<Equal<typeof target, string[] | string | null | undefined>>();
  }
  if (isPrismaError(error, PrismaErrorCodes.RelatedRecordNotFound)) {
    const details = error.meta?.details;
    expect<Equal<typeof details, string | undefined>>();
  }
  if (isPrismaError(error, PrismaErrorCodes.SchemaValidationFailed)) {
    // @ts-expect-error Initialization errors do not expose code.
    error.code;
    if ('errorCode' in error) expect<Equal<typeof error.errorCode, PrismaErrorCodes.SchemaValidationFailed>>();
  }
  const semanticHandler = createPrismaErrorHandler({
    [PrismaErrorCodes.RecordNotFound]: ({ meta }) => {
      expect<Equal<typeof meta.cause, string | undefined>>();
      return new AppError();
    },
    [PrismaErrorCodes.UniqueConstraintViolation]: ({ meta }) => {
      expect<Equal<typeof meta.target, readonly string[] | undefined>>();
      return new AppError();
    },
  });
  const semanticResult = semanticHandler(error);
  expect<Equal<typeof semanticResult, AppError>>();
  const semanticOverride = semanticHandler(error, {
    [PrismaErrorCodes.RecordNotFound]: ({ meta }) => {
      expect<Equal<typeof meta.cause, string | undefined>>();
      return 404;
    },
  });
  expect<Equal<typeof semanticOverride, AppError | number>>();
  const semanticContext = getPrismaErrorContext(error);
  if (semanticContext?.code === PrismaErrorCodes.RecordNotFound) {
    expect<Equal<typeof semanticContext.meta.cause, string | undefined>>();
  }
  expect<Equal<PrismaErrorMeta<PrismaErrorCodes.RecordNotFound>, PrismaErrorMeta<'P2025'>>>();
  if (isPrismaError(error, 'P2002')) {
    expect<Equal<typeof error.code, 'P2002'>>();
    const target = error.meta?.target;
    expect<Equal<typeof target, string[] | string | null | undefined>>();
    // @ts-expect-error Raw Prisma metadata is optional.
    error.meta.target;
    // @ts-expect-error P2025 metadata does not belong to P2002.
    error.meta?.cause;
  }
  if (isPrismaError(error, 'P2015')) { const details = error.meta?.details; expect<Equal<typeof details, string | undefined>>(); }
  if (isPrismaError(error, 'P2025')) { const cause = error.meta?.cause; expect<Equal<typeof cause, string | undefined>>(); }
  if (isPrismaError(error, 'P1012')) {
    // @ts-expect-error Initialization errors do not expose code.
    error.code;
    if ('errorCode' in error) expect<Equal<typeof error.errorCode, 'P1012'>>();
  }
  const handler = createPrismaErrorHandler({
    P2002: ({ code, meta }) => {
      expect<Equal<typeof code, 'P2002'>>();
      expect<Equal<typeof meta.target, readonly string[] | undefined>>();
      // @ts-expect-error Wrong metadata for this code.
      meta.cause;
      return new AppError(meta.target?.[0]);
    },
    P2025: ({ meta }) => { expect<Equal<typeof meta.cause, string | undefined>>(); return new AppError(); },
  });
  const mapped = handler(error);
  expect<Equal<typeof mapped, AppError>>();
  const override = handler(error, { P2002: ({ meta }) => { expect<Equal<typeof meta.target, readonly string[] | undefined>>(); return 123; } });
  expect<Equal<typeof override, AppError | number>>();
  const fallback = createPrismaErrorHandler({ P2002: () => new AppError() }, { fallback: () => false as const })(error);
  expect<Equal<typeof fallback, AppError | false>>();
  const passthrough = createPrismaErrorHandler({}, { fallback: value => value })(error);
  expect<Equal<typeof passthrough, unknown>>();
  const context = getPrismaErrorContext(error);
  if (context?.code === 'P2025') expect<Equal<typeof context.meta.cause, string | undefined>>();
  // @ts-expect-error Unknown mapping code.
  createPrismaErrorHandler({ P9999: () => 'x' });
  // @ts-expect-error Unknown override code.
  handler(error, { P9999: () => 'x' });
  // @ts-expect-error Unknown guard code.
  isPrismaError(error, 'P9999');
  const map = { P2015: ({ meta }) => meta.details } satisfies PrismaErrorHandlerMap;
  expect<Equal<ReturnType<typeof map.P2015>, string | undefined>>();
  expect<Equal<PrismaErrorMeta<'P2025'>, { cause?: string; modelName?: string }>>();
}
