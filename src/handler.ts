import { getPrismaErrorContext } from './metadata.js';
import { isPrismaError } from './guards.js';
import { parsePrismaPostgresError } from './postgres.js';
import type { ParsedPrismaPostgresError } from './postgres.js';
import type { PrismaError, PrismaErrorContext, PrismaErrorHandlerMap } from './types.js';

type Result<M> = M[keyof M] extends infer F ? F extends (...args: never[]) => infer R ? R : never : never;
type ExactMap<M> = M & Record<Exclude<keyof M, keyof PrismaErrorHandlerMap>, never>;
/** PostgreSQL CHECK mappings keyed by database table name, then exact constraint name. */
export type PrismaConstraintHandlerMap = Record<string, Record<string, (error: ParsedPrismaPostgresError) => unknown>>;
type ConstraintResult<C> = { [K in keyof C]: Result<C[K]> }[keyof C];
export interface PrismaErrorHandler<M extends PrismaErrorHandlerMap, F> {
  (error: unknown): Result<M> | F;
  <O extends PrismaErrorHandlerMap>(error: unknown, overrides: ExactMap<O>): Result<M> | Result<O> | F;
}
export function createPrismaErrorHandler<
  const M extends PrismaErrorHandlerMap,
  F = never,
  const C extends PrismaConstraintHandlerMap = Record<never, never>,
  U = never,
>(
  mappings: ExactMap<M>,
  options?: {
    constraints?: C & PrismaConstraintHandlerMap;
    onUnhandledPrismaError?: (error: PrismaError) => U;
    fallback?: (error: unknown) => F;
  },
): PrismaErrorHandler<M, F | U | ConstraintResult<C>> {
  const base = { ...mappings };
  const fallback = options?.fallback;
  const onUnhandledPrismaError = options?.onUnhandledPrismaError;
  // Snapshot both map levels and avoid prototype-property lookups for database names.
  const constraints = new Map<string, Map<string, (error: ParsedPrismaPostgresError) => unknown>>(
    Object.entries(options?.constraints ?? {}).map(([table, entries]) => [table, new Map(Object.entries(entries))]),
  );
  const handle = (error: unknown, overrides?: PrismaErrorHandlerMap): unknown => {
    const context = getPrismaErrorContext(error);
    if (context) {
      const callback = (overrides && Object.hasOwn(overrides, context.code) ? overrides[context.code] : undefined)
        ?? (Object.hasOwn(base, context.code) ? base[context.code] : undefined);
      if (callback) {
        // Indexed unions lose code/context correlation in TS. Both are selected
        // with the same validated code; keep the assertion at this boundary.
        return (callback as (value: PrismaErrorContext) => unknown)(context);
      }
    }
    if (constraints.size > 0) {
      const parsed = parsePrismaPostgresError(error);
      if (parsed) {
        const callback = constraints.get(parsed.tableName)?.get(parsed.constraintName);
        if (callback) return callback(parsed);
      }
    }
    if (isPrismaError(error)) {
      if (onUnhandledPrismaError) return onUnhandledPrismaError(error);
      throw error;
    }
    if (fallback) return fallback(error);
    throw error;
  };
  return handle as PrismaErrorHandler<M, F | U | ConstraintResult<C>>;
}
