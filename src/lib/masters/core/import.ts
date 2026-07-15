/**
 * Client wrapper for the reusable `public.import_master` RPC (migration 0016).
 *
 * Two-phase workflow the screens (M6) drive:
 *   1. VALIDATE — dry run. Nothing is persisted; returns counts + row errors so
 *      the user can preview before committing.
 *   2. COMMIT   — atomic insert of valid rows; expected per-row problems land in
 *      `import_row_errors`, an unexpected error rolls the whole batch back.
 *
 * The RPC caps a single call at 5000 rows, so `importMasterChunked` splits large
 * files and aggregates the results (each COMMIT chunk is its own DB transaction
 * and job). UI-agnostic: no React here.
 */
import { supabase } from "@/integrations/supabase/client";

/** Master names accepted by the import RPC (also the table names). */
export type ImportMaster =
  // geo (0015/0016)
  | "countries"
  | "zones"
  | "states"
  | "destinations"
  | "pincodes"
  | "country_pincodes"
  | "areas"
  // catalog (0018)
  | "product_types"
  | "products"
  | "banks"
  | "industries"
  | "contents"
  | "instructions"
  | "sales_executives"
  | "flights"
  | "delivery_exceptions"
  // catalog complex (0019)
  | "charges"
  | "airlines"
  // catalog aggregate (0020)
  | "service_centers"
  | "field_executives"
  // party simple (0022)
  | "consignees"
  | "shippers"
  // party aggregate (0023+)
  | "customers"
  | "local_branches"
  | "service_mappings"
  | "vendors"
  | "vendor_contracts"
  // utility tax/fuel (0052)
  | "fuel_surcharge_rates"
  | "tax_rates";

export type ImportMode = "VALIDATE" | "COMMIT";

export type ImportRowError = {
  row_no: number;
  column_name: string | null;
  message: string;
};

export type ImportResult = {
  master: string;
  mode: string;
  job_id: string | null;
  total: number;
  ok: number;
  skipped: number;
  error_count: number;
  errors: ImportRowError[];
};

/** Server-side per-call row cap (see 0016). Keep chunks under this. */
export const IMPORT_MAX_ROWS = 5000;

export type ImportRow = Record<string, string | number | boolean | null>;

/** Single RPC call. Throws if the batch exceeds the server row cap. */
export async function importMaster(
  master: ImportMaster,
  mode: ImportMode,
  rows: ReadonlyArray<ImportRow>,
): Promise<ImportResult> {
  if (rows.length > IMPORT_MAX_ROWS) {
    throw new Error(
      `Import batch of ${rows.length} exceeds the ${IMPORT_MAX_ROWS}-row limit. Use importMasterChunked.`,
    );
  }
  const { data, error } = await supabase.rpc("import_master", {
    p_master: master,
    p_mode: mode,
    p_rows: rows,
  });
  if (error) throw new Error(error.message);
  return data as ImportResult;
}

/**
 * Chunk a large file into <= chunkSize batches and aggregate results.
 * Row numbers in errors are rebased to the original file (1-based) so the UI can
 * point users at the right line. Job ids are collected across COMMIT chunks.
 */
export async function importMasterChunked(
  master: ImportMaster,
  mode: ImportMode,
  rows: ReadonlyArray<ImportRow>,
  opts?: { chunkSize?: number; onProgress?: (done: number, total: number) => void },
): Promise<ImportResult & { job_ids: string[] }> {
  const chunkSize = Math.min(Math.max(1, opts?.chunkSize ?? 2000), IMPORT_MAX_ROWS);
  const aggregate: ImportResult & { job_ids: string[] } = {
    master,
    mode,
    job_id: null,
    total: 0,
    ok: 0,
    skipped: 0,
    error_count: 0,
    errors: [],
    job_ids: [],
  };

  for (let offset = 0; offset < rows.length; offset += chunkSize) {
    const chunk = rows.slice(offset, offset + chunkSize);
    const res = await importMaster(master, mode, chunk);
    aggregate.total += res.total;
    aggregate.ok += res.ok;
    aggregate.skipped += res.skipped;
    aggregate.error_count += res.error_count;
    if (res.job_id) aggregate.job_ids.push(res.job_id);
    for (const e of res.errors) {
      aggregate.errors.push({ ...e, row_no: e.row_no + offset });
    }
    opts?.onProgress?.(Math.min(offset + chunk.length, rows.length), rows.length);
  }
  aggregate.job_id = aggregate.job_ids[0] ?? null;
  return aggregate;
}
