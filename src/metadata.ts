import { isPrismaError } from './guards.js';
import type { PrismaErrorContext } from './types.js';

/** No mutation of the original error; absent metadata becomes an empty view. */
export function getPrismaErrorContext(error: unknown): PrismaErrorContext | undefined {
  if (isPrismaError(error, 'P2002')) {
    const raw = error.meta;
    return { code: 'P2002', kind: 'known-request', original: error, meta: {
      ...(Array.isArray(raw?.target) ? { target: [...raw.target] } : {}),
      ...(typeof raw?.target === 'string' ? { constraintName: raw.target } : {}),
      ...(raw?.modelName !== undefined ? { modelName: raw.modelName } : {}),
    } };
  }
  if (isPrismaError(error, 'P2015')) return {
    code: 'P2015', kind: 'known-request', original: error, meta: {
      ...(error.meta?.details !== undefined ? { details: error.meta.details } : {}),
      ...(error.meta?.modelName !== undefined ? { modelName: error.meta.modelName } : {}),
    },
  };
  if (isPrismaError(error, 'P2025')) return {
    code: 'P2025', kind: 'known-request', original: error, meta: {
      ...(error.meta?.cause !== undefined ? { cause: error.meta.cause } : {}),
      ...(error.meta?.modelName !== undefined ? { modelName: error.meta.modelName } : {}),
    },
  };
  if (isPrismaError(error, 'P1012')) return {
    code: 'P1012', kind: 'code' in error ? 'known-request' : 'initialization', original: error, meta: {},
  };
  return undefined;
}
