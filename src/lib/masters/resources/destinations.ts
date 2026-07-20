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
import { GEO_MASTER_PERMISSIONS } from "@/lib/permissions";
import {
  destinationCreateSchema,
  destinationUpdateSchema,
  type DestinationCreate,
  type DestinationUpdate,
} from "@/lib/masters/schemas/destinations";

export type DestinationRow = BaseRow & {
  dest_type: "DOMESTIC" | "INTERNATIONAL" | "LOCAL";
  code: string;
  name: string;
  country_id: string | null;
  state_id: string | null;
  zone_id: string | null;
  /** Free-text code from import/UI (may exist without states FK). */
  country_code: string | null;
  state_code: string | null;
  service_type: "REGULAR" | "METRO" | "REMOTE" | null;
  main_branch_id: string | null;
  manifest_branch_id: string | null;
  email: string | null;
  mobile: string | null;
  status: "ACTIVE" | "INACTIVE";
};

export const destinationsResource: MasterResource<
  DestinationRow,
  DestinationCreate,
  DestinationUpdate
> = {
  key: "destinations",
  table: "destinations",
  master: "destinations",
  permission: GEO_MASTER_PERMISSIONS.destinations,
  label: { singular: "Destination", plural: "Destinations" },
  columns:
    "id, tenant_id, dest_type, code, name, country_id, state_id, zone_id, country_code, state_code, service_type, main_branch_id, manifest_branch_id, email, mobile, status, created_at, created_by, updated_at, updated_by, deleted_at, row_version",
  searchColumns: ["code", "name", "country_code", "state_code"],
  orderBy: "name",
  ascending: true,
  importColumns: [
    "dest_type",
    "code",
    "name",
    "country_code",
    "state_code",
    "zone_code",
    "service_type",
    "main_branch_code",
    "manifest_branch_code",
    "email",
    "mobile",
    "status",
  ],
  lookupKey: "destination",
  createSchema: destinationCreateSchema,
  updateSchema: destinationUpdateSchema,
};

/** CourierWala / UI export headers → import column keys. */
export const DESTINATION_IMPORT_HEADER_ALIASES: Readonly<Record<string, readonly string[]>> = {
  dest_type: ["Destination Type", "Type", "Dest Type"],
  code: ["Destination Code", "Dest Code"],
  name: ["Destination Name", "Dest Name"],
  country_code: ["Country", "Country Name", "Country Code"],
  state_code: ["State", "State Name", "State Code"],
  zone_code: ["Zone", "Zone Name", "Zone Code"],
  service_type: ["Service Type", "Service"],
  main_branch_code: ["Main Branch", "Main Branch Code", "Branch"],
  manifest_branch_code: ["Manifest Branch", "Manifest Branch Code"],
  status: ["Customer Status", "Destination Status"],
};

async function importDestinationsOnce(
  mode: ImportMode,
  rows: ReadonlyArray<ImportRow>,
): Promise<ImportResult> {
  if (rows.length > IMPORT_MAX_ROWS) {
    throw new Error(
      `Import batch of ${rows.length} exceeds the ${IMPORT_MAX_ROWS}-row limit.`,
    );
  }
  const { data, error } = await supabase.rpc("import_destinations", {
    p_mode: mode,
    p_rows: rows,
  });
  if (error) throw new Error(error.message);
  return data as ImportResult;
}

/**
 * Soft-FK destination import: creates destinations even when State/Country
 * codes are not in those masters. Codes are still stored on the destination.
 */
export async function importDestinationsChunked(
  mode: ImportMode,
  rows: ReadonlyArray<ImportRow>,
  opts?: { chunkSize?: number },
): Promise<ImportResult & { job_ids: string[] }> {
  const chunkSize = Math.min(Math.max(1, opts?.chunkSize ?? 2000), IMPORT_MAX_ROWS);
  const aggregate: ImportResult & { job_ids: string[] } = {
    master: "destinations" satisfies ImportMaster,
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
    const res = await importDestinationsOnce(mode, chunk);
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
