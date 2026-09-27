import { PrismaClientUnknownRequestError } from '@prisma/client/runtime/library.js';
import type { PrismaClientKnownRequestError } from '@prisma/client/runtime/library.js';
import { isPrismaKnownRequestError } from './guards.js';

/** Derived diagnostics, not Prisma-provided metadata. Only CHECK violations are supported. */
export type ParsedPrismaPostgresError = {
  readonly provider: 'postgresql';
  readonly kind: 'check-constraint';
  readonly sqlState: '23514';
  readonly tableName: string;
  readonly constraintName: string;
} & (
  | { readonly source: 'message'; readonly original: PrismaClientUnknownRequestError }
  | { readonly source: 'raw-query-meta'; readonly original: PrismaClientKnownRequestError }
);

// Parse only the JSON-compatible subset of Rust debug strings observed in 6.14.
// Character classes and escape alternatives are disjoint; no unbounded wildcard search.
const quoted = String.raw`"(?:[^"\\\r\n]|\\["\\/bfnrt]|\\u[0-9a-fA-F]{4})*"`;
const optional = `(?:None|Some\\(${quoted}\\))`;
const connector = new RegExp(
  String.raw`(?:^|\r?\n)Error occurred during query execution:\r?\nConnectorError\(ConnectorError \{ user_facing_error: None, kind: QueryError\(PostgresError \{ code: "23514", message: (${quoted}), severity: "ERROR", detail: ${optional}, column: ${optional}, hint: ${optional} \}\), transient: false \}\)$`,
);
const primary = /^(?:ERROR: )?new row for relation "([^"\r\n]+)" violates check constraint "([^"\r\n]+)"(?:\r?\nDETAIL: [\s\S]*)?$/;
const maxDiagnosticLength = 65_536;

function parsePrimary(message: string) {
  if (message.length > maxDiagnosticLength) return undefined;
  const match = primary.exec(message);
  const tableName = match?.[1];
  const constraintName = match?.[2];
  if (!tableName || !constraintName) return undefined;
  return { provider: 'postgresql', kind: 'check-constraint', sqlState: '23514', tableName, constraintName } as const;
}

/**
 * Opt-in, best-effort parsing for Prisma 6.14 PostgreSQL CHECK diagnostics.
 * Returns undefined for unrelated, malformed, localized, or unsupported formats.
 * Never mutates the input or adds inferred fields to Prisma metadata.
 */
export function parsePrismaPostgresError(error: unknown): ParsedPrismaPostgresError | undefined {
  try {
    if (error instanceof PrismaClientUnknownRequestError) {
      if (typeof error.message !== 'string' || error.message.length > maxDiagnosticLength) return undefined;
      const encoded = connector.exec(error.message)?.[1];
      if (!encoded) return undefined;
      const message: unknown = JSON.parse(encoded);
      if (typeof message !== 'string') return undefined;
      const parsed = parsePrimary(message);
      return parsed ? { ...parsed, source: 'message', original: error } : undefined;
    }
    if (isPrismaKnownRequestError(error) && error.code === 'P2010') {
      const meta = error.meta;
      if (!meta || meta.code !== '23514' || typeof meta.message !== 'string') return undefined;
      const parsed = parsePrimary(meta.message);
      return parsed ? { ...parsed, source: 'raw-query-meta', original: error } : undefined;
    }
    return undefined;
  } catch { return undefined; }
}
