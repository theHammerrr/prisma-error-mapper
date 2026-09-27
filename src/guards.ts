import {
  PrismaClientKnownRequestError, PrismaClientInitializationError,
  PrismaClientValidationError, PrismaClientUnknownRequestError, PrismaClientRustPanicError,
} from '@prisma/client/runtime/library.js';
import type { PrismaError, PrismaErrorCode, PrismaErrorForCode, PrismaErrorKind } from './types.js';

export function isPrismaKnownRequestError(error: unknown): error is PrismaClientKnownRequestError {
  try {
    return error instanceof PrismaClientKnownRequestError && typeof error.code === 'string'
      && typeof error.clientVersion === 'string';
  } catch { return false; }
}
export function getPrismaErrorKind(error: unknown): PrismaErrorKind | undefined {
  try {
    if (isPrismaKnownRequestError(error)) return 'known-request';
    if (error instanceof PrismaClientInitializationError) return 'initialization';
    if (error instanceof PrismaClientValidationError) return 'validation';
    if (error instanceof PrismaClientUnknownRequestError) return 'unknown-request';
    if (error instanceof PrismaClientRustPanicError) return 'rust-panic';
    return undefined;
  } catch { return undefined; }
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && Array.from(value).every((item: unknown) => typeof item === 'string');
}
function validMeta(meta: unknown, code: PrismaErrorCode): boolean {
  if (meta === undefined) return true;
  if (!isRecord(meta)) return false;
  const stringFields = code === 'P2002' ? ['modelName']
    : code === 'P2015' ? ['modelName', 'details'] : code === 'P2025' ? ['modelName', 'cause'] : [];
  if (!stringFields.every(key => meta[key] === undefined || typeof meta[key] === 'string')) return false;
  return code !== 'P2002' || meta.target === undefined || meta.target === null
    || typeof meta.target === 'string' || isStringArray(meta.target);
}
export function isPrismaError(error: unknown): error is PrismaError;
export function isPrismaError<C extends PrismaErrorCode>(error: unknown, code: C): error is PrismaErrorForCode<C>;
export function isPrismaError(error: unknown, code?: PrismaErrorCode): boolean {
  try {
    if (code === undefined) return getPrismaErrorKind(error) !== undefined;
    if (isPrismaKnownRequestError(error)) return error.code === code && validMeta(error.meta, code);
    return code === 'P1012' && error instanceof PrismaClientInitializationError && error.errorCode === code;
  } catch { return false; }
}
