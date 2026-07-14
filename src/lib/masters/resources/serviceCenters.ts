import { supabase } from "@/integrations/supabase/client";
import type { BaseRow } from "@/lib/masters/core/baseCrud";
import type { MasterResource } from "@/lib/masters/core/useMasterResource";
import { AGGREGATE_CATALOG_MASTER_PERMISSIONS } from "@/lib/permissions";
import {
  serviceCenterCreateSchema,
  serviceCenterUpdateSchema,
  type ServiceCenterCreate,
  type ServiceCenterUpdate,
} from "@/lib/masters/schemas/serviceCenters";

export type ServiceCenterRow = BaseRow & {
  code: string;
  name: string;
  sub_name: string | null;
  address1: string | null;
  address2: string | null;
  address3: string | null;
  address4: string | null;
  destination: string | null;
  branch: string | null;
  state: string | null;
  state_code: string | null;
  pin_code: string | null;
  telephone: string | null;
  email: string | null;
  gst_no: string | null;
  gst_telephone: string | null;
  pan_no: string | null;
  icn_no: string | null;
  st_no: string | null;
  bank_name: string | null;
  account_no: string | null;
  account_name: string | null;
  bank_address: string | null;
  rtgs_ifsc: string | null;
  micr: string | null;
  last_invoice_prefix: string | null;
  last_invoice_no: string | null;
  last_invoice_suffix: string | null;
  free_form_prefix: string | null;
  last_free_form_invoice_no: string | null;
  free_form_suffix: string | null;
  debit_note_prefix: string | null;
  debit_note_last_invoice_no: string | null;
  debit_note_suffix: string | null;
  credit_note_prefix: string | null;
  credit_note_last_invoice_no: string | null;
  credit_note_suffix: string | null;
  rcp_last_no: string | null;
};

const SERVICE_CENTER_COLUMNS =
  "id, tenant_id, code, name, sub_name, address1, address2, address3, address4, destination, branch, state, state_code, pin_code, telephone, email, gst_no, gst_telephone, pan_no, icn_no, st_no, bank_name, account_no, account_name, bank_address, rtgs_ifsc, micr, last_invoice_prefix, last_invoice_no, last_invoice_suffix, free_form_prefix, last_free_form_invoice_no, free_form_suffix, debit_note_prefix, debit_note_last_invoice_no, debit_note_suffix, credit_note_prefix, credit_note_last_invoice_no, credit_note_suffix, rcp_last_no, created_at, created_by, updated_at, updated_by, deleted_at, row_version";

export const serviceCentersResource: MasterResource<
  ServiceCenterRow,
  ServiceCenterCreate,
  ServiceCenterUpdate
> = {
  key: "service_centers",
  table: "service_centers",
  master: "service_centers",
  permission: AGGREGATE_CATALOG_MASTER_PERMISSIONS.service_centers,
  label: { singular: "Service Centre", plural: "Service Centres" },
  columns: SERVICE_CENTER_COLUMNS,
  searchColumns: ["code", "name", "branch"],
  orderBy: "code",
  ascending: true,
  importColumns: [
    "code",
    "name",
    "sub_name",
    "branch",
    "destination",
    "state",
    "state_code",
    "pin_code",
    "telephone",
    "email",
    "gst_no",
  ],
  lookupKey: "service-center",
  createSchema: serviceCenterCreateSchema,
  updateSchema: serviceCenterUpdateSchema,
};

/**
 * Service Center AGGREGATE helpers — the Aggregate Save Pattern client seam.
 *
 * The service_centers ROOT and its service_center_terms CHILD collection are
 * persisted together by the dedicated transactional RPC
 * `public.save_service_center` (migration 0020). These helpers keep that
 * aggregate concern OUT of the generic resource layer: the screen loads Terms on
 * edit and calls `saveServiceCenter` for create/update instead of the generic
 * CRUD create/update mutations.
 */
export type ServiceCenterTerm = { seq: number; text: string };

/** Load a service center's Terms child collection (RLS-scoped), ordered by seq. */
export async function fetchServiceCenterTerms(serviceCenterId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("service_center_terms")
    .select("seq, text")
    .eq("service_center_id", serviceCenterId)
    .order("seq", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as ServiceCenterTerm[]).map((t) => t.text);
}

/**
 * Persist a service center aggregate (root + Terms) in ONE transaction.
 * Pass `id`/`rowVersion` for updates (optimistic-locked), or `null` to insert.
 * Returns the saved root row.
 */
export async function saveServiceCenter(args: {
  id: string | null;
  rowVersion: number | null;
  fields: ServiceCenterCreate | ServiceCenterUpdate;
  terms: string[];
}): Promise<ServiceCenterRow> {
  const { data, error } = await supabase.rpc("save_service_center", {
    p_id: args.id,
    p_row_version: args.rowVersion,
    p_fields: args.fields,
    p_terms: args.terms,
  });
  if (error) throw new Error(error.message);
  return data as ServiceCenterRow;
}
