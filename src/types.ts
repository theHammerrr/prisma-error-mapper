import type {
  PrismaClientKnownRequestError, PrismaClientInitializationError,
  PrismaClientValidationError, PrismaClientUnknownRequestError, PrismaClientRustPanicError,
} from '@prisma/client/runtime/library.js';

/** Validated raw metadata. Provider-dependent fields remain optional. */
export interface PrismaErrorMetaMap {
  P2002: { target?: string[] | string | null; modelName?: string };
  P2015: { details?: string; modelName?: string };
  P2025: { cause?: string; modelName?: string };
  P1012: Record<string, unknown>;
}
export type PrismaErrorCode = keyof PrismaErrorMetaMap;
export type PrismaErrorMeta<C extends PrismaErrorCode> = PrismaErrorMetaMap[C];
export type PrismaError = PrismaClientKnownRequestError | PrismaClientInitializationError
  | PrismaClientValidationError | PrismaClientUnknownRequestError | PrismaClientRustPanicError;
type Known<C extends PrismaErrorCode> = Omit<PrismaClientKnownRequestError, 'code' | 'meta'> & {
  code: C; meta?: PrismaErrorMeta<C>;
};
export type PrismaErrorForCode<C extends PrismaErrorCode> = C extends 'P1012'
  ? Known<C> | (PrismaClientInitializationError & { errorCode: C })
  : C extends PrismaErrorCode ? Known<C> : never;
/** Package-generated view: string constraints are never treated as field names. */
export type NormalizedPrismaErrorMeta<C extends PrismaErrorCode> = C extends 'P2002'
  ? { readonly target?: readonly string[]; readonly constraintName?: string; readonly modelName?: string }
  : Readonly<PrismaErrorMeta<C>>;
export type PrismaErrorContext<C extends PrismaErrorCode = PrismaErrorCode> = {
  [K in C]: {
    readonly code: K;
    readonly kind: K extends 'P1012' ? 'known-request' | 'initialization' : 'known-request';
    readonly meta: NormalizedPrismaErrorMeta<K>;
    readonly original: PrismaErrorForCode<K>;
  }
}[C];
export type PrismaErrorHandlerMap = {
  [C in PrismaErrorCode]?: (error: PrismaErrorContext<C>) => unknown;
};
export type PrismaErrorKind = 'known-request' | 'initialization' | 'validation' | 'unknown-request' | 'rust-panic';
