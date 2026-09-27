import { PrismaErrorCodes, createPrismaErrorHandler, getPrismaErrorContext, isPrismaError, parsePrismaPostgresError } from '../src/index.js';
import type { PrismaError, PrismaErrorCode, PrismaErrorMeta, PrismaErrorHandlerMap, ParsedPrismaPostgresError, PrismaConstraintHandlerMap } from '../src/index.js';
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
// These assertions are compiled, never executed. Passing values also checks lint usage.
function expect<T extends true>(...proof: T extends true ? [value?: unknown] : never): void {
  void proof;
}
class AppError extends Error { status = 409; }
export function typeAssertions(error: unknown): void {
  const direct = createPrismaErrorHandler({}, {
    constraints: { Account: { 'check normal email': context => {
      expect<Equal<typeof context, ParsedPrismaPostgresError>>(context);
      expect<Equal<typeof context.sqlState, '23514'>>(context.sqlState);
      // @ts-expect-error Derived diagnostics are separate from Prisma metadata.
      void context.meta;
      return new AppError();
    } } },
  });
  const directResult = direct(error);
  expect<Equal<typeof directResult, AppError>>(directResult);
  const directOverride = direct(error, { P2002: () => 409 });
  expect<Equal<typeof directOverride, AppError | number>>(directOverride);
  const routes = createPrismaErrorHandler({ P2025: () => new AppError() }, {
    constraints: {
      Account: { email: () => 422 }, Other: { other: () => true as const },
    },
    onUnhandledPrismaError: original => {
      expect<Equal<typeof original, PrismaError>>(original);
      return 'unmatched' as const;
    },
    fallback: original => {
      expect<Equal<typeof original, unknown>>(original);
      return null;
    },
  });
  const routedResult = routes(error);
  expect<Equal<typeof routedResult, AppError | number | true | 'unmatched' | null>>(routedResult);
  const reusable = { Account: { email: context => context.constraintName } } satisfies PrismaConstraintHandlerMap;
  expect<Equal<ReturnType<typeof reusable.Account.email>, string>>(reusable.Account.email);
  const diagnostic = parsePrismaPostgresError(error);
  if (diagnostic) {
    expect<Equal<typeof diagnostic.sqlState, '23514'>>(diagnostic.sqlState);
    expect<Equal<typeof diagnostic.kind, 'check-constraint'>>(diagnostic.kind);
    expect<Equal<typeof diagnostic.constraintName, string>>(diagnostic.constraintName);
    // @ts-expect-error Parsed diagnostics are not Prisma metadata.
    void diagnostic.meta;
    if (diagnostic.source === 'message') {
      // @ts-expect-error The unknown-request original has no Prisma code.
      void diagnostic.original.code;
    } else {
      expect<Equal<typeof diagnostic.original.code, string>>(diagnostic.original.code);
    }
  }
  const parsedHandler = createPrismaErrorHandler({}, { onUnhandledPrismaError: original => {
    if (parsePrismaPostgresError(original)) return new AppError();
    throw original;
  } });
  const parsedResult = parsedHandler(error);
  expect<Equal<typeof parsedResult, AppError>>(parsedResult);
  expect<Equal<`${PrismaErrorCodes}`, PrismaErrorCode>>();
  if (isPrismaError(error, PrismaErrorCodes.RecordNotFound)) {
    expect<Equal<typeof error.code, PrismaErrorCodes.RecordNotFound>>(error.code);
    const cause = error.meta?.cause;
    expect<Equal<typeof cause, string | undefined>>(cause);
    // @ts-expect-error A missing-record error does not have unique-constraint metadata.
    void error.meta?.target;
  }
  if (isPrismaError(error, PrismaErrorCodes.UniqueConstraintViolation)) {
    const target = error.meta?.target;
    expect<Equal<typeof target, string[] | string | null | undefined>>(target);
  }
  if (isPrismaError(error, PrismaErrorCodes.RelatedRecordNotFound)) {
    const details = error.meta?.details;
    expect<Equal<typeof details, string | undefined>>(details);
  }
  if (isPrismaError(error, PrismaErrorCodes.SchemaValidationFailed)) {
    // @ts-expect-error Initialization errors do not expose code.
    void error.code;
    if ('errorCode' in error) expect<Equal<typeof error.errorCode, PrismaErrorCodes.SchemaValidationFailed>>(error.errorCode);
  }
  const semanticHandler = createPrismaErrorHandler({
    [PrismaErrorCodes.RecordNotFound]: ({ meta }) => {
      expect<Equal<typeof meta.cause, string | undefined>>(meta.cause);
      return new AppError();
    },
    [PrismaErrorCodes.UniqueConstraintViolation]: ({ meta }) => {
      expect<Equal<typeof meta.target, readonly string[] | undefined>>(meta.target);
      return new AppError();
    },
  });
  const semanticResult = semanticHandler(error);
  expect<Equal<typeof semanticResult, AppError>>(semanticResult);
  const semanticOverride = semanticHandler(error, {
    [PrismaErrorCodes.RecordNotFound]: ({ meta }) => {
      expect<Equal<typeof meta.cause, string | undefined>>(meta.cause);
      return 404;
    },
  });
  expect<Equal<typeof semanticOverride, AppError | number>>(semanticOverride);
  const semanticContext = getPrismaErrorContext(error);
  if (semanticContext?.code === PrismaErrorCodes.RecordNotFound) {
    expect<Equal<typeof semanticContext.meta.cause, string | undefined>>(semanticContext.meta.cause);
  }
  expect<Equal<PrismaErrorMeta<PrismaErrorCodes.RecordNotFound>, PrismaErrorMeta<'P2025'>>>();
  if (isPrismaError(error, 'P2002')) {
    expect<Equal<typeof error.code, 'P2002'>>(error.code);
    const target = error.meta?.target;
    expect<Equal<typeof target, string[] | string | null | undefined>>(target);
    // @ts-expect-error Raw Prisma metadata is optional.
    void error.meta.target;
    // @ts-expect-error P2025 metadata does not belong to P2002.
    void error.meta?.cause;
  }
  if (isPrismaError(error, 'P2015')) { const details = error.meta?.details; expect<Equal<typeof details, string | undefined>>(details); }
  if (isPrismaError(error, 'P2025')) { const cause = error.meta?.cause; expect<Equal<typeof cause, string | undefined>>(cause); }
  if (isPrismaError(error, 'P1012')) {
    // @ts-expect-error Initialization errors do not expose code.
    void error.code;
    if ('errorCode' in error) expect<Equal<typeof error.errorCode, 'P1012'>>(error.errorCode);
  }
  const handler = createPrismaErrorHandler({
    P2002: ({ code, meta }) => {
      expect<Equal<typeof code, 'P2002'>>(code);
      expect<Equal<typeof meta.target, readonly string[] | undefined>>(meta.target);
      // @ts-expect-error Wrong metadata for this code.
      void meta.cause;
      return new AppError(meta.target?.[0]);
    },
    P2025: ({ meta }) => { expect<Equal<typeof meta.cause, string | undefined>>(meta.cause); return new AppError(); },
  });
  const mapped = handler(error);
  expect<Equal<typeof mapped, AppError>>(mapped);
  const override = handler(error, { P2002: ({ meta }) => { expect<Equal<typeof meta.target, readonly string[] | undefined>>(meta.target); return 123; } });
  expect<Equal<typeof override, AppError | number>>(override);
  const fallback = createPrismaErrorHandler({ P2002: () => new AppError() }, { fallback: () => false as const })(error);
  expect<Equal<typeof fallback, AppError | false>>(fallback);
  const passthrough = createPrismaErrorHandler({}, { fallback: value => value })(error);
  expect<Equal<typeof passthrough, unknown>>(passthrough);
  const context = getPrismaErrorContext(error);
  if (context?.code === 'P2025') expect<Equal<typeof context.meta.cause, string | undefined>>(context.meta.cause);
  // @ts-expect-error Unknown mapping code.
  createPrismaErrorHandler({ P9999: () => 'x' });
  // @ts-expect-error Unknown override code.
  handler(error, { P9999: () => 'x' });
  // @ts-expect-error Unknown guard code.
  isPrismaError(error, 'P9999');
  const map = { P2015: ({ meta }) => meta.details } satisfies PrismaErrorHandlerMap;
  expect<Equal<ReturnType<typeof map.P2015>, string | undefined>>(map.P2015);
  expect<Equal<PrismaErrorMeta<'P2025'>, { cause?: string; modelName?: string }>>();
}
