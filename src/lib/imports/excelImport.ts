/**
 * Excel import suite client — wraps `public.import_excel` (0049).
 * Same VALIDATE / COMMIT contract as `import_master`.
 */
import { supabase } from "@/integrations/supabase/client";
import {
  IMPORT_MAX_ROWS,
  type ImportMode,
  type ImportRow,
  type ImportResult,
} from "@/lib/masters/core/import";

export type ExcelImportType =
  "AWB_MERGE" | "POD_MERGE" | "FORWARDING_MERGE" | "AWB_STOCK" | "OTHER_CHARGES" | "DATA_UPDATE";

export type ExcelImportResult = ImportResult & {
  import_type: ExcelImportType;
};

export const EXCEL_IMPORT_COLUMNS: Record<ExcelImportType, readonly string[]> = {
  AWB_MERGE: [
    "awb_no",
    "book_date",
    "customer_code",
    "product_code",
    "destination_code",
    "pieces",
    "charge_weight",
  ],
  POD_MERGE: ["awb_no", "pod_date", "receiver_name", "remark"],
  FORWARDING_MERGE: ["awb_no", "forwarding_awb", "row_version"],
  AWB_STOCK: ["awb_no", "customer_code", "status", "remark"],
  OTHER_CHARGES: [
    "customer_code",
    "charge_type",
    "amount",
    "from_date",
    "to_date",
    "vendor",
    "service",
    "product",
    "origin",
    "destination",
    "minimum_value",
  ],
  DATA_UPDATE: [
    "awb_no",
    "destination_code",
    "pieces",
    "charge_weight",
    "actual_weight",
    "row_version",
  ],
};

export async function importExcel(
  importType: ExcelImportType,
  mode: ImportMode,
  rows: ReadonlyArray<ImportRow>,
  params: Record<string, unknown> = {},
): Promise<ExcelImportResult> {
  if (rows.length > IMPORT_MAX_ROWS) {
    throw new Error(
      `Import batch of ${rows.length} exceeds the ${IMPORT_MAX_ROWS}-row limit. Chunk the file.`,
    );
  }
  const { data, error } = await supabase.rpc("import_excel", {
    p_import_type: importType,
    p_mode: mode,
    p_rows: rows,
    p_params: params,
  });
  if (error) throw new Error(error.message);
  return data as ExcelImportResult;
}

export async function importExcelChunked(
  importType: ExcelImportType,
  mode: ImportMode,
  rows: ReadonlyArray<ImportRow>,
  params: Record<string, unknown> = {},
  opts?: { chunkSize?: number; onProgress?: (done: number, total: number) => void },
): Promise<ExcelImportResult> {
  const chunkSize = Math.min(opts?.chunkSize ?? IMPORT_MAX_ROWS, IMPORT_MAX_ROWS);
  let ok = 0;
  let skipped = 0;
  let error_count = 0;
  const errors: ExcelImportResult["errors"] = [];
  let job_id: string | null = null;

  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const res = await importExcel(importType, mode, chunk, params);
    ok += res.ok;
    skipped += res.skipped;
    error_count += res.error_count;
    if (res.job_id) job_id = res.job_id;
    for (const e of res.errors ?? []) {
      errors.push({
        ...e,
        row_no: e.row_no + i,
      });
    }
    opts?.onProgress?.(Math.min(i + chunk.length, rows.length), rows.length);
  }

  return {
    master: importType,
    import_type: importType,
    mode,
    job_id,
    total: rows.length,
    ok,
    skipped,
    error_count,
    errors,
  };
}
