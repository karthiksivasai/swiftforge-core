/**
 * Minimal, dependency-free CSV utilities for the master import workflow.
 *
 * UI-agnostic: parsing/serialization only — no DOM, no React. Screens (M6) turn
 * a file into text and hand it here; the resulting records feed the import RPC
 * wrapper (`import.ts`). Handles the RFC-4180 essentials the courier data needs:
 * quoted fields, embedded commas/quotes/newlines, CRLF, and a leading BOM.
 */

export type CsvRecord = Record<string, string>;

export type CsvParseResult = {
  headers: string[];
  rows: CsvRecord[];
};

const DEFAULT_DELIMITER = ",";

/** Strip a UTF-8 BOM if present (Excel exports commonly include one). */
function stripBom(input: string): string {
  return input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
}

/**
 * Parse CSV text into a header list and row objects keyed by header.
 * Blank lines are ignored. Missing trailing cells resolve to "".
 */
export function parseCsv(input: string, opts?: { delimiter?: string }): CsvParseResult {
  const delimiter = opts?.delimiter ?? DEFAULT_DELIMITER;
  const text = stripBom(input);
  const matrix: string[][] = [];

  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  let started = false; // did the current row have any content?

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    // Skip rows that are entirely empty (e.g. trailing newline).
    if (!(row.length === 1 && row[0] === "")) matrix.push(row);
    row = [];
    started = false;
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      started = true;
    } else if (ch === delimiter) {
      pushField();
      started = true;
    } else if (ch === "\n") {
      pushRow();
    } else if (ch === "\r") {
      // handle CRLF and lone CR; the \n branch (if any) handles the row.
      if (text[i + 1] === "\n") continue;
      pushRow();
    } else {
      field += ch;
      started = true;
    }
  }
  // Flush the final field/row if the file didn't end with a newline.
  if (started || field !== "" || row.length > 0) pushRow();

  if (matrix.length === 0) return { headers: [], rows: [] };

  const headers = matrix[0].map((h) => h.trim());
  const rows: CsvRecord[] = matrix.slice(1).map((cells) => {
    const rec: CsvRecord = {};
    headers.forEach((h, idx) => {
      rec[h] = (cells[idx] ?? "").trim();
    });
    return rec;
  });

  return { headers, rows };
}

/** Quote a single CSV cell if it contains a delimiter, quote, or newline. */
function quoteCell(value: unknown, delimiter: string): string {
  const s = value == null ? "" : String(value);
  if (s.includes(delimiter) || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Serialize records to CSV using the given column order. Useful for import
 * error exports and "download template" affordances in M6.
 */
export function toCsv(
  records: ReadonlyArray<Record<string, unknown>>,
  columns: readonly string[],
  opts?: { delimiter?: string },
): string {
  const delimiter = opts?.delimiter ?? DEFAULT_DELIMITER;
  const header = columns.map((c) => quoteCell(c, delimiter)).join(delimiter);
  const lines = records.map((rec) =>
    columns.map((c) => quoteCell(rec[c], delimiter)).join(delimiter),
  );
  return [header, ...lines].join("\r\n");
}

/**
 * Reshape parsed CSV records to the exact keys an import expects, dropping
 * unknown columns and filling absent ones with "". Header matching is
 * case-insensitive and ignores spaces/underscores so "Zone Code", "zone_code",
 * and "ZONECODE" all map to the `zone_code` import key.
 */
export function mapCsvToImportRows(
  rows: ReadonlyArray<CsvRecord>,
  importColumns: readonly string[],
): CsvRecord[] {
  const normalize = (s: string) => s.toLowerCase().replace(/[\s_]+/g, "");
  return rows.map((rec) => {
    const byNormalized = new Map<string, string>();
    for (const [k, v] of Object.entries(rec)) byNormalized.set(normalize(k), v);
    const out: CsvRecord = {};
    for (const col of importColumns) out[col] = byNormalized.get(normalize(col)) ?? "";
    return out;
  });
}

/** Generate a blank template CSV (header row only) for a set of columns. */
export function csvTemplate(importColumns: readonly string[]): string {
  return toCsv([], importColumns);
}
