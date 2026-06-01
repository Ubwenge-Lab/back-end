// src/reports/utils/csv-builder.util.ts
// Lightweight CSV builder — no external dependencies required.

export interface CsvColumn {
  /** Column header displayed in the CSV */
  header: string;
  /** Dot-notation key path to extract the value from each row object */
  key: string;
}

/**
 * Escape a single CSV field value according to RFC 4180:
 *  - If the value contains a comma, double-quote, or newline, wrap it in double-quotes.
 *  - Any embedded double-quotes are escaped by doubling them.
 */
function escapeField(value: unknown): string {
  if (value === null || value === undefined) return '';

  let str: string;
  if (value instanceof Date) {
    str = value.toISOString();
  } else if (typeof value === 'object') {
    str = JSON.stringify(value);
  } else {
    str = String(value as string | number | boolean);
  }
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Resolve a dot-notation key path against an object.
 * Example: resolve({ a: { b: 'x' } }, 'a.b') → 'x'
 */
function resolve(obj: Record<string, unknown>, keyPath: string): unknown {
  return keyPath.split('.').reduce((acc: unknown, part) => {
    if (acc && typeof acc === 'object') {
      return (acc as Record<string, unknown>)[part];
    }
    return undefined;
  }, obj);
}

/**
 * Build a CSV string from column definitions and row data.
 *
 * @param columns  Array of { header, key } column definitions.
 * @param rows     Array of data objects.
 * @returns        UTF-8 CSV string prefixed with BOM for Excel compatibility.
 */
export function buildCsv(
  columns: CsvColumn[],
  rows: Record<string, unknown>[],
): string {
  const BOM = '\uFEFF';

  const headerLine = columns.map((c) => escapeField(c.header)).join(',');

  const dataLines = rows.map((row) =>
    columns.map((col) => escapeField(resolve(row, col.key))).join(','),
  );

  return BOM + [headerLine, ...dataLines].join('\r\n') + '\r\n';
}
