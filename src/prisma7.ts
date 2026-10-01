/**
 * Prisma 7 clients are generated at application-specific paths. Pass the Prisma
 * namespace exported by that client so class checks use its actual constructors.
 */
export type Prisma7KnownRequestError = Error & {
  code: string;
  clientVersion: string;
  meta?: Record<string, unknown>;
};
export type Prisma7InitializationError = Error & { errorCode?: string };
export type Prisma7Error = Error;
export type Prisma7ErrorKind = 'known-request' | 'initialization' | 'validation' | 'unknown-request' | 'rust-panic';
export type Prisma7ErrorCode = 'P2002' | 'P2015' | 'P2025' | 'P1012';
export type Prisma7ErrorContext =
  | { readonly code: 'P2002'; readonly kind: 'known-request'; readonly meta: {
      readonly target?: readonly string[]; readonly constraintName?: string; readonly modelName?: string;
    }; readonly original: Prisma7KnownRequestError }
  | { readonly code: 'P2015'; readonly kind: 'known-request'; readonly meta: {
      readonly details?: string; readonly modelName?: string;
    }; readonly original: Prisma7KnownRequestError }
  | { readonly code: 'P2025'; readonly kind: 'known-request'; readonly meta: {
      readonly cause?: string; readonly modelName?: string;
    }; readonly original: Prisma7KnownRequestError }
  | { readonly code: 'P1012'; readonly kind: 'known-request' | 'initialization';
      readonly meta: Record<never, never>; readonly original: Prisma7KnownRequestError | Prisma7InitializationError };
export type Prisma7HandlerMap = {
  [C in Prisma7ErrorCode]?: (context: Extract<Prisma7ErrorContext, { code: C }>) => unknown;
};
type Result<M> = M[keyof M] extends infer F ? F extends (...args: never[]) => infer R ? R : never : never;
type ExactMap<M> = M & Record<Exclude<keyof M, keyof Prisma7HandlerMap>, never>;

export interface Prisma7Constructors {
  PrismaClientKnownRequestError: abstract new (...args: never[]) => Error;
  PrismaClientInitializationError: abstract new (...args: never[]) => Error;
  PrismaClientValidationError: abstract new (...args: never[]) => Error;
  PrismaClientUnknownRequestError: abstract new (...args: never[]) => Error;
  PrismaClientRustPanicError: abstract new (...args: never[]) => Error;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validMeta(meta: unknown, code: Prisma7ErrorCode): boolean {
  if (meta === undefined) return true;
  if (!isRecord(meta)) return false;
  const fields = code === 'P2002' ? ['modelName']
    : code === 'P2015' ? ['modelName', 'details'] : code === 'P2025' ? ['modelName', 'cause'] : [];
  if (!fields.every(key => meta[key] === undefined || typeof meta[key] === 'string')) return false;
  return code !== 'P2002' || meta.target === undefined || meta.target === null
    || typeof meta.target === 'string'
    || (Array.isArray(meta.target) && Array.from(meta.target).every(item => typeof item === 'string'));
}

/** Create guards and mappings bound to a generated Prisma 7 client's classes. */
export function createPrisma7ErrorMapper(prisma: Prisma7Constructors) {
  function isPrismaKnownRequestError(error: unknown): error is Prisma7KnownRequestError {
    try {
      return error instanceof prisma.PrismaClientKnownRequestError
        && typeof (error as Prisma7KnownRequestError).code === 'string'
        && typeof (error as Prisma7KnownRequestError).clientVersion === 'string';
    } catch { return false; }
  }

  function getPrismaErrorKind(error: unknown): Prisma7ErrorKind | undefined {
    try {
      if (isPrismaKnownRequestError(error)) return 'known-request';
      if (error instanceof prisma.PrismaClientInitializationError) return 'initialization';
      if (error instanceof prisma.PrismaClientValidationError) return 'validation';
      if (error instanceof prisma.PrismaClientUnknownRequestError) return 'unknown-request';
      if (error instanceof prisma.PrismaClientRustPanicError) return 'rust-panic';
      return undefined;
    } catch { return undefined; }
  }

  function isPrismaError(error: unknown): error is Prisma7Error;
  function isPrismaError(error: unknown, code: Prisma7ErrorCode): error is Prisma7KnownRequestError | Prisma7InitializationError;
  function isPrismaError(error: unknown, code?: Prisma7ErrorCode): boolean {
    try {
      if (code === undefined) return getPrismaErrorKind(error) !== undefined;
      if (isPrismaKnownRequestError(error)) return error.code === code && validMeta(error.meta, code);
      return code === 'P1012' && error instanceof prisma.PrismaClientInitializationError
        && (error as Prisma7InitializationError).errorCode === code;
    } catch { return false; }
  }

  function getPrismaErrorContext(error: unknown): Prisma7ErrorContext | undefined {
    if (isPrismaKnownRequestError(error)) {
      const { code, meta } = error;
      if (code === 'P2002' && validMeta(meta, code)) return {
        code, kind: 'known-request', original: error, meta: {
          ...(Array.isArray(meta?.target) ? { target: [...meta.target] as string[] } : {}),
          ...(typeof meta?.target === 'string' ? { constraintName: meta.target } : {}),
          ...(meta?.modelName !== undefined ? { modelName: meta.modelName as string } : {}),
        },
      };
      if (code === 'P2015' && validMeta(meta, code)) return {
        code, kind: 'known-request', original: error, meta: {
          ...(meta?.details !== undefined ? { details: meta.details as string } : {}),
          ...(meta?.modelName !== undefined ? { modelName: meta.modelName as string } : {}),
        },
      };
      if (code === 'P2025' && validMeta(meta, code)) return {
        code, kind: 'known-request', original: error, meta: {
          ...(meta?.cause !== undefined ? { cause: meta.cause as string } : {}),
          ...(meta?.modelName !== undefined ? { modelName: meta.modelName as string } : {}),
        },
      };
      if (code === 'P1012' && validMeta(meta, code)) return { code, kind: 'known-request', original: error, meta: {} };
    }
    if (isPrismaError(error, 'P1012')) return { code: 'P1012', kind: 'initialization', original: error, meta: {} };
    return undefined;
  }

  function createPrismaErrorHandler<const M extends Prisma7HandlerMap, F = never, U = never>(
    mappings: ExactMap<M>,
    options?: {
      onUnhandledPrismaError?: (error: Prisma7Error) => U;
      fallback?: (error: unknown) => F;
    },
  ) {
    const base = { ...mappings };
    function handle(error: unknown): Result<M> | F | U;
    function handle<const O extends Prisma7HandlerMap>(error: unknown, overrides: ExactMap<O>): Result<M> | Result<O> | F | U;
    function handle(error: unknown, overrides?: Prisma7HandlerMap): unknown {
      const context = getPrismaErrorContext(error);
      if (context) {
        const callback = (overrides && Object.hasOwn(overrides, context.code) ? overrides[context.code] : undefined)
          ?? (Object.hasOwn(base, context.code) ? base[context.code] : undefined);
        if (callback) return (callback as (value: Prisma7ErrorContext) => unknown)(context);
      }
      if (isPrismaError(error)) {
        if (options?.onUnhandledPrismaError) return options.onUnhandledPrismaError(error);
        throw error;
      }
      if (options?.fallback) return options.fallback(error);
      throw error;
    }
    return handle;
  }

  return { isPrismaKnownRequestError, getPrismaErrorKind, isPrismaError, getPrismaErrorContext, createPrismaErrorHandler };
}
