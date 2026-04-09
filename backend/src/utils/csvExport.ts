/**
 * RFC 4180-compliant CSV generation utility.
 *
 * Rules applied:
 *  - Fields containing commas, double-quotes, CR, or LF are enclosed in
 *    double-quotes.
 *  - Double-quote characters inside a quoted field are escaped as "".
 *  - Lines are separated by CRLF (\r\n) as required by RFC 4180.
 *  - The header row is always present as the first line.
 */

/**
 * Escape a single CSV field value.
 * Returns the raw value unchanged if no escaping is needed.
 */
export function escapeCsvValue(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Build a complete CSV document from a header array and a matrix of rows.
 *
 * @param headers  Column header strings (first line).
 * @param rows     Data rows — each inner array must have the same length as
 *                 `headers`.  Missing/extra cells are tolerated.
 * @returns        CRLF-terminated UTF-8 string (no BOM).
 */
export function generateCSV(headers: string[], rows: string[][]): string {
  const lines: string[] = [headers.map(escapeCsvValue).join(',')];
  for (const row of rows) {
    lines.push(row.map(escapeCsvValue).join(','));
  }
  return lines.join('\r\n');
}

/**
 * Generate the Content-Disposition filename for an export.
 *
 * @param prefix  Short identifier, e.g. "threat-intel", "history".
 * @returns       e.g. "threat-intel-export-2026-04-09.csv"
 */
export function csvFilename(prefix: string): string {
  const date = new Date().toISOString().slice(0, 10);
  return `${prefix}-export-${date}.csv`;
}

/**
 * Set Content-Type and Content-Disposition headers for a CSV download.
 * Safe to call before any `res.write()` calls.
 */
export function setCsvHeaders(
  res: { setHeader(name: string, value: string): void },
  filename: string
): void {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
}
