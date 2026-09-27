import { createPrismaErrorHandler, getPrismaErrorContext, isPrismaError } from '../src/index.js';
import type { PrismaErrorMeta, PrismaErrorHandlerMap } from '../src/index.js';
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
function expect<T extends true>(..._proof: T extends true ? [] : never): void {}
class AppError extends Error { status = 409; }
export function typeAssertions(error: unknown): void {
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
