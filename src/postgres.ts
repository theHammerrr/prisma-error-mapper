import { PrismaClientUnknownRequestError } from '@prisma/client/runtime/library.js';
import type { PrismaClientKnownRequestError } from '@prisma/client/runtime/library.js';
import { isPrismaKnownRequestError } from './guards.js';

/** Derived diagnostics, not Prisma-provided metadata. Only CHECK violations are supported. */
export type ParsedPrismaPostgresError = {
  readonly provider: 'postgresql';
  readonly kind: 'check-constraint';
  readonly sqlState: '23514';
  readonly schemaName?: string;
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
const optionalPosition = String.raw`(?:None|Some\((?:Original|Internal)\(\d+\)\))`;
const optionalNumber = String.raw`(?:None|Some\(\d+\))`;
const flattenedConnector = new RegExp(
  String.raw`(?:^|\r?\n)Error occurred during query execution:\r?\nConnectorError\(ConnectorError \{ user_facing_error: None, kind: QueryError\(PostgresError \{ code: "23514", message: (${quoted}), severity: "ERROR", detail: ${optional}, column: ${optional}, hint: ${optional} \}\), transient: false \}\)$`,
);
const nestedConnector = new RegExp(
  String.raw`(?:^|\r?\n)Error occurred during query execution:\r?\nConnectorError\(ConnectorError \{ user_facing_error: None, kind: QueryError\(Error \{ kind: Db, cause: Some\(DbError \{ severity: "ERROR", parsed_severity: Some\(Error\), code: SqlState\("23514"\), message: (${quoted}), detail: ${optional}, hint: ${optional}, position: ${optionalPosition}, where_: ${optional}, schema: (${optional}), table: (${optional}), column: ${optional}, datatype: ${optional}, constraint: (${optional}), file: ${optional}, line: ${optionalNumber}, routine: ${optional} \}\) \}\) \}\), transient: false \}\)$`,
);
const unqualifiedPrimary = /^(?:ERROR: )?new row for relation "([^"\r\n]+)" violates check constraint "([^"\r\n]+)"(?:\r?\nDETAIL: [\s\S]*)?$/;
const qualifiedPrimary = /^(?:ERROR: )?new row for relation "([^"\r\n]+)"\."([^"\r\n]+)" violates check constraint "([^"\r\n]+)"(?:\r?\nDETAIL: [\s\S]*)?$/;
const maxDiagnosticLength = 65_536;

function parsePrimary(message: string) {
  if (message.length > maxDiagnosticLength) return undefined;
  const qualified = qualifiedPrimary.exec(message);
  if (qualified) {
    const [, schemaName, tableName, constraintName] = qualified;
    if (!schemaName || !tableName || !constraintName) return undefined;
    return { provider: 'postgresql', kind: 'check-constraint', sqlState: '23514', schemaName, tableName, constraintName } as const;
  }
  const match = unqualifiedPrimary.exec(message);
  const tableName = match?.[1];
  const constraintName = match?.[2];
  if (!tableName || !constraintName) return undefined;
  return { provider: 'postgresql', kind: 'check-constraint', sqlState: '23514', tableName, constraintName } as const;
}

function decodeQuoted(encoded: string): string | undefined {
  const value: unknown = JSON.parse(encoded);
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function decodeOptionalQuoted(encoded: string): string | undefined {
  return encoded === 'None' ? undefined : decodeQuoted(encoded.slice(5, -1));
}

function parseMessageDiagnostic(message: string) {
  const flattened = flattenedConnector.exec(message);
  if (flattened?.[1]) {
    const primaryMessage = decodeQuoted(flattened[1]);
    return primaryMessage ? parsePrimary(primaryMessage) : undefined;
  }

  const nested = nestedConnector.exec(message);
  if (!nested?.[1] || !nested[2] || !nested[3] || !nested[4]) return undefined;
  const primaryMessage = decodeQuoted(nested[1]);
  const parsed = primaryMessage ? parsePrimary(primaryMessage) : undefined;
  if (!parsed) return undefined;
  const schemaName = decodeOptionalQuoted(nested[2]);
  const tableName = decodeOptionalQuoted(nested[3]);
  const constraintName = decodeOptionalQuoted(nested[4]);
  if ((tableName !== undefined && tableName !== parsed.tableName)
    || (constraintName !== undefined && constraintName !== parsed.constraintName)
    || (schemaName !== undefined && parsed.schemaName !== undefined && schemaName !== parsed.schemaName)) return undefined;
  return schemaName === undefined || parsed.schemaName !== undefined
    ? parsed
    : { ...parsed, schemaName };
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
      const parsed = parseMessageDiagnostic(error.message);
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
