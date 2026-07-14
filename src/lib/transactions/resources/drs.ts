/**
 * DRS resource — list + save/dispatch/cancel RPCs (0036).
 */
import { supabase } from "@/integrations/supabase/client";
import type { BaseRow } from "@/lib/masters/core/baseCrud";
import { ConflictError, translateDbError } from "@/lib/masters/core/baseCrud";
import { DRS_PERMISSIONS } from "@/lib/permissions";
import type { DrsFields, DrsLineInput, DeliveryAttemptInput } from "@/lib/transactions/schemas/drs";

export type DrsStatus = "DRAFT" | "DISPATCHED" | "COMPLETED" | "CANCELLED" | "OPEN" | "CLOSED";

type NamedRef = { code: string; name: string } | null;

export type DrsRow = BaseRow & {
  drs_no: string;
  drs_date: string;
  drs_time: string | null;
  branch_id: string | null;
  destination_id: string | null;
  delivery_executive_id: string | null;
  vehicle_no: string | null;
  remarks: string | null;
  area_code: string | null;
  area_name: string | null;
  area_seq: string | null;
  status: DrsStatus;
  status_at: string;
  is_locked: boolean;
  wizard_extras: Record<string, unknown>;
  branches: NamedRef;
  destinations: NamedRef;
  field_executives: NamedRef;
};

export type DrsLineRow = {
  sequence_no: number;
  shipment_id: string;
  awb_no: string;
  remarks: string | null;
  pieces: number;
  charge_weight: number;
  book_date: string | null;
  origin_code: string | null;
  origin_name: string | null;
  destination_code: string | null;
  destination_name: string | null;
  customer_code: string | null;
  customer_name: string | null;
  consignee_name: string | null;
  eway_bill_no: string | null;
  shipment_value: number | null;
  outcome: "DELIVERED" | "UNDELIVERED" | null;
  outcome_at: string | null;
  attempt_count: number;
  shipment_status?: string;
};

export type DrsCompletionBoard = {
  drs_id: string;
  drs_no: string;
  status: string;
  total: number;
  out_for_delivery: number;
  attempted: number;
  delivered: number;
  undelivered: number;
  pending: number;
  lines: Array<{
    sequence_no: number;
    shipment_id: string;
    awb_no: string;
    outcome: string | null;
    outcome_at: string | null;
    attempt_count: number;
    shipment_status: string;
    terminal: boolean;
  }>;
};

const DRS_COLUMNS = `
  id, tenant_id, drs_no, drs_date, drs_time,
  branch_id, destination_id, delivery_executive_id,
  vehicle_no, remarks, area_code, area_name, area_seq,
  status, status_at, is_locked, wizard_extras,
  created_at, created_by, updated_at, updated_by, deleted_at, row_version,
  branches:branches!drs_branch_fk(code,name),
  destinations:destinations!drs_destination_fk(code,name),
  field_executives:field_executives!drs_delivery_executive_fk(code,name)
`
  .replace(/\s+/g, " ")
  .trim();

export const drsResource = {
  key: "drs",
  table: "drs",
  permission: DRS_PERMISSIONS.drs,
  label: { singular: "DRS", plural: "DRS" },
  columns: DRS_COLUMNS,
  searchColumns: ["drs_no", "vehicle_no", "area_code", "remarks"] as const,
  orderBy: "drs_date",
  ascending: false as const,
};

export async function listDrs(params?: {
  page?: number;
  pageSize?: number;
  search?: string;
}): Promise<{ rows: DrsRow[]; count: number }> {
  const page = Math.max(1, params?.page ?? 1);
  const pageSize = Math.min(Math.max(1, params?.pageSize ?? 100), 500);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase.from("drs").select(DRS_COLUMNS, { count: "exact" }).is("deleted_at", null);

  const search = params?.search?.trim();
  if (search) {
    const q = search.replace(/[%,()]/g, " ");
    query = query.or(
      `drs_no.ilike.%${q}%,vehicle_no.ilike.%${q}%,area_code.ilike.%${q}%,remarks.ilike.%${q}%`,
    );
  }

  const { data, error, count } = await query
    .order("drs_date", { ascending: false })
    .order("drs_no", { ascending: false })
    .range(from, to);
  if (error) throw translateDbError(error);
  return { rows: (data ?? []) as unknown as DrsRow[], count: count ?? 0 };
}

export async function fetchDrsLines(drsId: string): Promise<DrsLineRow[]> {
  const { data, error } = await supabase
    .from("drs_lines")
    .select(
      "sequence_no, shipment_id, awb_no, remarks, pieces, charge_weight, book_date, origin_code, origin_name, destination_code, destination_name, customer_code, customer_name, consignee_name, eway_bill_no, shipment_value, outcome, outcome_at, attempt_count",
    )
    .eq("drs_id", drsId)
    .order("sequence_no", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    ...(row as DrsLineRow),
    outcome: (row.outcome as DrsLineRow["outcome"]) ?? null,
    outcome_at: (row.outcome_at as string | null) ?? null,
    attempt_count: Number(row.attempt_count ?? 0),
  }));
}

export async function getDrsCompletionBoard(drsId: string): Promise<DrsCompletionBoard> {
  const { data, error } = await supabase.rpc("get_drs_completion_board", {
    p_drs_id: drsId,
  });
  if (error) throw translateDbError(error);
  const raw = data as Record<string, unknown>;
  return {
    drs_id: String(raw.drs_id),
    drs_no: String(raw.drs_no),
    status: String(raw.status),
    total: Number(raw.total ?? 0),
    out_for_delivery: Number(raw.out_for_delivery ?? 0),
    attempted: Number(raw.attempted ?? 0),
    delivered: Number(raw.delivered ?? 0),
    undelivered: Number(raw.undelivered ?? 0),
    pending: Number(raw.pending ?? 0),
    lines: ((raw.lines as DrsCompletionBoard["lines"]) ?? []).map((l) => ({
      sequence_no: Number(l.sequence_no),
      shipment_id: String(l.shipment_id),
      awb_no: String(l.awb_no),
      outcome: l.outcome ?? null,
      outcome_at: l.outcome_at ?? null,
      attempt_count: Number(l.attempt_count ?? 0),
      shipment_status: String(l.shipment_status),
      terminal: Boolean(l.terminal),
    })),
  };
}

export async function lookupShipmentForDrs(awbNo: string): Promise<{
  shipment_id: string;
  awb_no: string;
  current_status: string;
  book_date: string | null;
  pieces: number;
  charge_weight: number;
  consignee_name: string | null;
} | null> {
  const awb = awbNo.trim();
  if (!awb) return null;
  const { data, error } = await supabase
    .from("shipments")
    .select("id, awb_no, current_status, book_date, pieces, charge_weight, consignee")
    .eq("awb_no", awb)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw translateDbError(error);
  if (!data) return null;
  const consignee = (data.consignee ?? {}) as { name?: string };
  return {
    shipment_id: data.id as string,
    awb_no: data.awb_no as string,
    current_status: data.current_status as string,
    book_date: (data.book_date as string | null) ?? null,
    pieces: Number(data.pieces ?? 1),
    charge_weight: Number(data.charge_weight ?? 0),
    consignee_name: consignee.name ?? null,
  };
}

export async function saveDrs(args: {
  id: string | null;
  rowVersion: number | null;
  fields: DrsFields;
  lines?: DrsLineInput[];
}): Promise<DrsRow> {
  const { data, error } = await supabase.rpc("save_drs", {
    p_id: args.id,
    p_row_version: args.rowVersion,
    p_fields: args.fields,
    p_lines: args.lines ?? [],
  });
  if (error) {
    if (error.code === "40001") throw new ConflictError(error.message);
    throw translateDbError(error);
  }
  return data as DrsRow;
}

export async function dispatchDrs(args: { id: string; rowVersion: number }): Promise<DrsRow> {
  const { data, error } = await supabase.rpc("dispatch_drs", {
    p_id: args.id,
    p_row_version: args.rowVersion,
  });
  if (error) {
    if (error.code === "40001") throw new ConflictError(error.message);
    throw translateDbError(error);
  }
  return data as DrsRow;
}

export async function cancelDrs(args: {
  id: string;
  rowVersion: number;
  reason?: string | null;
}): Promise<DrsRow> {
  const { data, error } = await supabase.rpc("cancel_drs", {
    p_id: args.id,
    p_row_version: args.rowVersion,
    p_reason: args.reason ?? null,
  });
  if (error) {
    if (error.code === "40001") throw new ConflictError(error.message);
    throw translateDbError(error);
  }
  return data as DrsRow;
}

export async function completeDrs(args: { id: string; rowVersion: number }): Promise<DrsRow> {
  const { data, error } = await supabase.rpc("complete_drs", {
    p_id: args.id,
    p_row_version: args.rowVersion,
  });
  if (error) {
    if (error.code === "40001") throw new ConflictError(error.message);
    throw translateDbError(error);
  }
  return data as DrsRow;
}

export async function reopenDrs(args: {
  id: string;
  rowVersion: number;
  reason?: string | null;
}): Promise<DrsRow> {
  const { data, error } = await supabase.rpc("reopen_drs", {
    p_id: args.id,
    p_row_version: args.rowVersion,
    p_reason: args.reason ?? null,
  });
  if (error) {
    if (error.code === "40001") throw new ConflictError(error.message);
    throw translateDbError(error);
  }
  return data as DrsRow;
}

export async function markShipmentDeliveryAttempt(input: DeliveryAttemptInput): Promise<{
  ok: boolean;
  awb_no?: string;
  to_status?: string;
  line_outcome?: string | null;
  attempt_count?: number;
}> {
  const { data, error } = await supabase.rpc("mark_shipment_delivery_attempt", {
    p_drs_id: input.drs_id,
    p_shipment_id: input.shipment_id ?? null,
    p_awb_no: input.awb_no ?? null,
    p_outcome: input.outcome,
    p_remark: input.remark ?? null,
  });
  if (error) throw translateDbError(error);
  return data as {
    ok: boolean;
    awb_no?: string;
    to_status?: string;
    line_outcome?: string | null;
    attempt_count?: number;
  };
}
