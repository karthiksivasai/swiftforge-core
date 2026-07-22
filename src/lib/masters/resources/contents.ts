import type { BaseRow } from "@/lib/masters/core/baseCrud";
import {
  IMPORT_MAX_ROWS,
  type ImportMaster,
  type ImportMode,
  type ImportResult,
  type ImportRow,
} from "@/lib/masters/core/import";
import type { MasterResource } from "@/lib/masters/core/useMasterResource";
import { supabase } from "@/integrations/supabase/client";
import { CATALOG_MASTER_PERMISSIONS } from "@/lib/permissions";
import {
  contentCreateSchema,
  contentUpdateSchema,
  type ContentCreate,
  type ContentUpdate,
} from "@/lib/masters/schemas/contents";

export type ContentRow = BaseRow & {
  code: string;
  name: string;
  hsn_code: string | null;
  vendor_id: string | null;
  country_id: string | null;
  clearance_cert_no: string | null;
  notification_sub_type: string | null;
  notification_sub_type1: string | null;
  notification_no: string | null;
  sr_no: string | null;
  igst_notification: string | null;
  igst_sr_no: string | null;
  igstc_notification: string | null;
  igstc_sr_no: string | null;
};

export const contentsResource: MasterResource<ContentRow, ContentCreate, ContentUpdate> = {
  key: "contents",
  table: "contents",
  master: "contents",
  permission: CATALOG_MASTER_PERMISSIONS.contents,
  label: { singular: "Content", plural: "Contents" },
  columns:
    "id, tenant_id, code, name, hsn_code, vendor_id, country_id, clearance_cert_no, notification_sub_type, notification_sub_type1, notification_no, sr_no, igst_notification, igst_sr_no, igstc_notification, igstc_sr_no, created_at, created_by, updated_at, updated_by, deleted_at, row_version",
  searchColumns: ["code", "name", "hsn_code"],
  orderBy: "name",
  ascending: true,
  importColumns: [
    "code",
    "name",
    "hsn_code",
    "vendor_code",
    "country_code",
    "clearance_cert_no",
    "notification_sub_type",
    "notification_sub_type1",
    "notification_no",
    "sr_no",
    "igst_notification",
    "igst_sr_no",
    "igstc_notification",
    "igstc_sr_no",
  ],
  createSchema: contentCreateSchema,
  updateSchema: contentUpdateSchema,
};

/** CourierWala / UI export headers → import column keys. */
export const CONTENT_IMPORT_HEADER_ALIASES: Readonly<Record<string, readonly string[]>> = {
  code: ["Content Code", "Code"],
  name: ["Content Name", "Name"],
  hsn_code: ["HSN Code", "HSN"],
  vendor_code: ["Vendor", "Vendor Code"],
  country_code: ["Country", "Country Code"],
  clearance_cert_no: ["Clearance Ceth No", "Clearance Cert No", "Clearance Certificate No"],
  notification_sub_type: ["Notification Sub Type"],
  notification_sub_type1: ["Notification Sub Type1", "Notification Sub Type 1"],
  notification_no: ["Notification No"],
  sr_no: ["SrNo", "Sr No", "Serial No"],
  igst_notification: ["IGST Notification"],
  igst_sr_no: ["IGST SrNo", "IGST Sr No"],
  igstc_notification: ["IGSTC Notification"],
  igstc_sr_no: ["IGSTC SrNo", "IGSTC Sr No"],
};

async function importContentsOnce(
  mode: ImportMode,
  rows: ReadonlyArray<ImportRow>,
): Promise<ImportResult> {
  if (rows.length > IMPORT_MAX_ROWS) {
    throw new Error(
      `Import batch of ${rows.length} exceeds the ${IMPORT_MAX_ROWS}-row limit.`,
    );
  }
  const { data, error } = await supabase.rpc("import_contents", {
    p_mode: mode,
    p_rows: rows,
  });
  if (error) throw new Error(error.message);
  return data as ImportResult;
}

export async function importContentsChunked(
  mode: ImportMode,
  rows: ReadonlyArray<ImportRow>,
  opts?: { chunkSize?: number },
): Promise<ImportResult & { job_ids: string[] }> {
  const chunkSize = Math.min(Math.max(1, opts?.chunkSize ?? 2000), IMPORT_MAX_ROWS);
  const aggregate: ImportResult & { job_ids: string[] } = {
    master: "contents" satisfies ImportMaster,
    mode,
    job_id: null,
    total: 0,
    ok: 0,
    skipped: 0,
    error_count: 0,
    errors: [],
    job_ids: [],
  };

  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const res = await importContentsOnce(mode, chunk);
    aggregate.total += res.total;
    aggregate.ok += res.ok;
    aggregate.skipped += res.skipped;
    aggregate.error_count += res.error_count;
    aggregate.errors.push(...(res.errors ?? []));
    if (res.job_id) {
      aggregate.job_ids.push(res.job_id);
      aggregate.job_id = res.job_id;
    }
  }

  return aggregate;
}
