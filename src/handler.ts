import { getPrismaErrorContext } from './metadata.js';
import type { PrismaErrorContext, PrismaErrorHandlerMap } from './types.js';

type Result<M> = M[keyof M] extends infer F ? F extends (...args: never[]) => infer R ? R : never : never;
type ExactMap<M> = M & Record<Exclude<keyof M, keyof PrismaErrorHandlerMap>, never>;
export interface PrismaErrorHandler<M extends PrismaErrorHandlerMap, F> {
  (error: unknown): Result<M> | F;
  <O extends PrismaErrorHandlerMap>(error: unknown, overrides: ExactMap<O>): Result<M> | Result<O> | F;
}
export function createPrismaErrorHandler<const M extends PrismaErrorHandlerMap, F = never>(
  mappings: ExactMap<M>,
  options?: { fallback: (error: unknown) => F },
): PrismaErrorHandler<M, F> {
  const base = { ...mappings };
  const fallback = options?.fallback;
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
    if (fallback) return fallback(error);
    throw error;
  };
  return handle as PrismaErrorHandler<M, F>;
}
