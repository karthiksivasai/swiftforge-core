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

/** Normalize CSV/import headers: case-insensitive, ignore spaces/underscores/punctuation. */
export function normalizeImportHeader(s: string): string {
  return s.toLowerCase().replace(/[\s_./-]+/g, "");
}

/**
 * Resolve one import column from a normalized header→value map.
 *
 * Match order:
 * 1. Exact column / explicit alias (e.g. product_type_code ← "Product Type" alias)
 * 2. Unique suffix (e.g. code ← "Country Code" / "Zone Code", while zone_code
 *    still claims "Zone Code" via exact match on another column)
 * 3. Unique longest prefix (e.g. product_type_code ← "Product Type")
 */
function resolveImportValue(
  col: string,
  byNormalized: Map<string, string>,
  aliasKeys: readonly string[],
  importColumns: readonly string[],
): string {
  for (const key of aliasKeys) {
    if (byNormalized.has(key)) return byNormalized.get(key) ?? "";
  }

  const colNorm = normalizeImportHeader(col);
  const otherExact = new Set(
    importColumns.filter((c) => c !== col).map((c) => normalizeImportHeader(c)),
  );
  // Headers that already equal another import column stay reserved for that column.
  const reserved = new Set<string>([...otherExact].filter((h) => byNormalized.has(h)));

  const suffixHits = [...byNormalized.keys()].filter(
    (h) => h !== colNorm && h.endsWith(colNorm) && !reserved.has(h),
  );
  if (suffixHits.length === 1) return byNormalized.get(suffixHits[0]) ?? "";
  if (suffixHits.length > 1) {
    const minLen = Math.min(...suffixHits.map((h) => h.length));
    const shortest = suffixHits.filter((h) => h.length === minLen);
    if (shortest.length === 1) return byNormalized.get(shortest[0]) ?? "";
  }

  const prefixHits = [...byNormalized.keys()].filter(
    (h) => h.length > 0 && h !== colNorm && colNorm.startsWith(h) && !reserved.has(h),
  );
  if (prefixHits.length >= 1) {
    const maxLen = Math.max(...prefixHits.map((h) => h.length));
    const longest = prefixHits.filter((h) => h.length === maxLen);
    if (longest.length === 1) return byNormalized.get(longest[0]) ?? "";
  }

  return "";
}

/**
 * Reshape parsed CSV records to the exact keys an import expects, dropping
 * unknown columns and filling absent ones with "". Header matching is
 * case-insensitive and ignores spaces/underscores so "Zone Code", "zone_code",
 * and "ZONECODE" all map to the `zone_code` import key.
 *
 * Also maps CourierWala-style labels onto short keys without per-screen aliases:
 * "Country Code" → `code`, "Destination Name" → `name`, "Product Type" →
 * `product_type_code` (prefix), while "Zone Code" still maps to `zone_code`
 * when that column is present.
 *
 * Optional `aliases` map alternate header labels onto an import column
 * (e.g. `{ code: ["Product Code"] }` so exported UI CSVs re-import cleanly).
 */
export function mapCsvToImportRows(
  rows: ReadonlyArray<CsvRecord>,
  importColumns: readonly string[],
  opts?: { aliases?: Readonly<Record<string, readonly string[]>> },
): CsvRecord[] {
  const aliasKeys = new Map<string, string[]>();
  for (const col of importColumns) {
    const keys = [normalizeImportHeader(col)];
    for (const a of opts?.aliases?.[col] ?? []) {
      const n = normalizeImportHeader(a);
      if (n && !keys.includes(n)) keys.push(n);
    }
    aliasKeys.set(col, keys);
  }
  return rows.map((rec) => {
    const byNormalized = new Map<string, string>();
    for (const [k, v] of Object.entries(rec)) {
      byNormalized.set(normalizeImportHeader(k), v);
    }
    const out: CsvRecord = {};
    for (const col of importColumns) {
      out[col] = resolveImportValue(
        col,
        byNormalized,
        aliasKeys.get(col) ?? [normalizeImportHeader(col)],
        importColumns,
      );
    }
    return out;
  });
}

/** Generate a blank template CSV (header row only) for a set of columns. */
export function csvTemplate(importColumns: readonly string[]): string {
  return toCsv([], importColumns);
}
