import { supabase } from "@/integrations/supabase/client";
import type { BaseRow } from "@/lib/masters/core/baseCrud";
import {
  IMPORT_MAX_ROWS,
  type ImportMaster,
  type ImportMode,
  type ImportResult,
  type ImportRow,
} from "@/lib/masters/core/import";
import type { MasterResource } from "@/lib/masters/core/useMasterResource";
import { SERVICE_MAPPING_PERMISSIONS } from "@/lib/permissions";
import {
  serviceMappingCreateSchema,
  serviceMappingUpdateSchema,
  type ServiceMappingCreate,
  type ServiceMappingUpdate,
} from "@/lib/masters/schemas/serviceMappings";

export type ServiceMappingRow = BaseRow & {
  vendor_id: string;
  service: string;
  service_type: string | null;
  billing_vendor_id: string | null;
  min_weight: number;
  max_weight: number;
  vendor_link: string | null;
  is_single_piece: boolean;
  status: "ACTIVE" | "INACTIVE";
};

export const serviceMappingsResource: MasterResource<
  ServiceMappingRow,
  ServiceMappingCreate,
  ServiceMappingUpdate
> = {
  key: "service_mappings",
  table: "service_mappings",
  master: "service_mappings",
  permission: SERVICE_MAPPING_PERMISSIONS.service_mappings,
  label: { singular: "Service Mapping", plural: "Service Mappings" },
  columns:
    "id, tenant_id, vendor_id, service, service_type, billing_vendor_id, min_weight, max_weight, vendor_link, is_single_piece, status, created_at, created_by, updated_at, updated_by, deleted_at, row_version",
  searchColumns: ["service", "service_type", "vendor_link"],
  orderBy: "service",
  ascending: true,
  importColumns: [
    "vendor_code",
    "service",
    "service_type",
    "billing_vendor_code",
    "min_weight",
    "max_weight",
    "vendor_link",
    "is_single_piece",
    "status",
  ],
  createSchema: serviceMappingCreateSchema,
  updateSchema: serviceMappingUpdateSchema,
};

/** CourierWala ServiceMap.xls / UI export header aliases. */
export const SERVICE_MAPPING_IMPORT_HEADER_ALIASES: Readonly<
  Record<string, readonly string[]>
> = {
  vendor_code: ["Vendor Code", "Vendor", "Vendor Name"],
  service: ["Service", "Service Name"],
  // Keep Service Type on service_type; normalize copies it onto service when needed.
  service_type: ["Service Type"],
  billing_vendor_code: ["Billing Vendor Code", "Billing Vendor"],
  min_weight: ["Min Weight", "Minimum Weight"],
  max_weight: ["Max Weight", "Maximum Weight"],
  vendor_link: ["Vendor Link"],
  is_single_piece: ["Is Single Piece", "Single Piece"],
  status: ["Status"],
};

function cleanCell(v: unknown): string {
  return String(v ?? "")
    .replace(/\u00a0/g, " ")
    .trim();
}

/**
 * CourierWala puts the service name in "Service Type" (ECONOMY, FEDEX PROMO).
 * Promote that into `service` when the Service column is blank.
 */
export function normalizeServiceMappingImportRow(rec: Record<string, string>): ImportRow {
  const vendor = cleanCell(rec.vendor_code);
  const serviceType = cleanCell(rec.service_type);
  let service = cleanCell(rec.service);
  if (!service && serviceType) service = serviceType;

  const statusRaw = cleanCell(rec.status);
  const statusLower = statusRaw.toLowerCase().replace(/\s+/g, "-");
  const status =
    statusLower === "in-active" || statusLower === "inactive"
      ? "INACTIVE"
      : statusRaw
        ? "ACTIVE"
        : "ACTIVE";

  return {
    ...rec,
    vendor_code: vendor,
    service,
    service_type: serviceType,
    billing_vendor_code: cleanCell(rec.billing_vendor_code),
    min_weight: cleanCell(rec.min_weight) || "0",
    max_weight: cleanCell(rec.max_weight) || "99999",
    vendor_link: cleanCell(rec.vendor_link),
    is_single_piece: cleanCell(rec.is_single_piece),
    status,
  };
}

async function importServiceMappingsOnce(
  mode: ImportMode,
  rows: ReadonlyArray<ImportRow>,
): Promise<ImportResult> {
  if (rows.length > IMPORT_MAX_ROWS) {
    throw new Error(
      `Import batch of ${rows.length} exceeds the ${IMPORT_MAX_ROWS}-row limit.`,
    );
  }
  const { data, error } = await supabase.rpc("import_service_mappings", {
    p_mode: mode,
    p_rows: rows,
  });
  if (error) throw new Error(error.message);
  return data as ImportResult;
}

/** Soft-name vendor resolve for CourierWala ServiceMap.xls. */
export async function importServiceMappingsChunked(
  mode: ImportMode,
  rows: ReadonlyArray<ImportRow>,
  opts?: { chunkSize?: number },
): Promise<ImportResult & { job_ids: string[] }> {
  const chunkSize = Math.min(Math.max(1, opts?.chunkSize ?? 2000), IMPORT_MAX_ROWS);
  const aggregate: ImportResult & { job_ids: string[] } = {
    master: "service_mappings" satisfies ImportMaster,
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
    const res = await importServiceMappingsOnce(mode, chunk);
    aggregate.total += res.total;
    aggregate.ok += res.ok;
    aggregate.skipped += res.skipped;
    aggregate.error_count += res.error_count;
    if (res.job_id) aggregate.job_ids.push(res.job_id);
    for (const e of res.errors) {
      aggregate.errors.push({ ...e, row_no: e.row_no + offset });
    }
  }
  aggregate.job_id = aggregate.job_ids[0] ?? null;
  return aggregate;
}
