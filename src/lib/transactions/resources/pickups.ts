/**
 * Pickup transaction resource — list + save/cancel/transfer RPCs (0031).
 */
import { supabase } from "@/integrations/supabase/client";
import type { BaseRow } from "@/lib/masters/core/baseCrud";
import { ConflictError, translateDbError } from "@/lib/masters/core/baseCrud";
import { PICKUP_PERMISSIONS } from "@/lib/permissions";
import type { PickupFields } from "@/lib/transactions/schemas/pickups";

export type PickupStatus = "OPEN" | "ASSIGNED" | "PICKED" | "CONFIRMED" | "CANCELLED";
export type VehicleType = "BICYCLE" | "BIKE" | "CAR" | "VAN" | "TRUCK" | "TEMPO";

type NamedRef = { code: string; name: string } | null;
type AreaRef = { name: string } | null;

export type PickupRow = BaseRow & {
  pickup_no: number;
  pickup_date: string;
  pickup_time: string | null;
  customer_id: string | null;
  origin_destination_id: string | null;
  mobile_no: string;
  shipper_id: string | null;
  shipper_name: string | null;
  contact: string | null;
  address1: string | null;
  address2: string | null;
  zip: string | null;
  city: string | null;
  state: string | null;
  pay_option: string | null;
  consignee_details: boolean;
  branch_id: string | null;
  vehicle_type: VehicleType | null;
  area_id: string | null;
  field_executive_id: string | null;
  sales_executive_id: string | null;
  special_instructions: string | null;
  reason: string | null;
  pickup_ready: boolean;
  status: PickupStatus;
  awb_id: string | null;
  awb_no: string | null;
  booked_by: string | null;
  edited_by: string | null;
  cancelled_at: string | null;
  confirmed_at: string | null;
  customers: NamedRef;
  shippers: NamedRef;
  destinations: NamedRef;
  branches: NamedRef;
  areas: AreaRef;
  field_executives: NamedRef;
  sales_executives: NamedRef;
};

const PICKUP_COLUMNS = `
  id, tenant_id, pickup_no, pickup_date, pickup_time,
  customer_id, origin_destination_id, mobile_no,
  shipper_id, shipper_name, contact, address1, address2, zip, city, state,
  pay_option, consignee_details, branch_id, vehicle_type,
  area_id, field_executive_id, sales_executive_id,
  special_instructions, reason, pickup_ready, status,
  awb_id, awb_no, booked_by, edited_by,
  cancelled_at, confirmed_at,
  created_at, created_by, updated_at, updated_by, deleted_at, row_version,
  customers(code,name),
  shippers(code,name),
  destinations(code,name),
  branches(code,name),
  areas(name),
  field_executives(code,name),
  sales_executives(code,name)
`
  .replace(/\s+/g, " ")
  .trim();

export const pickupsResource = {
  key: "pickups",
  table: "pickups",
  permission: PICKUP_PERMISSIONS.pickups,
  label: { singular: "Pickup", plural: "Pickups" },
  columns: PICKUP_COLUMNS,
  searchColumns: ["mobile_no", "shipper_name", "awb_no", "city"] as const,
  orderBy: "pickup_no",
  ascending: false as const,
};

export async function listPickups(params?: {
  page?: number;
  pageSize?: number;
  search?: string;
  fromDate?: string;
  toDate?: string;
  status?: PickupStatus;
}): Promise<{ rows: PickupRow[]; count: number }> {
  const page = Math.max(1, params?.page ?? 1);
  const pageSize = Math.min(Math.max(1, params?.pageSize ?? 100), 500);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("pickups")
    .select(PICKUP_COLUMNS, { count: "exact" })
    .is("deleted_at", null);

  if (params?.fromDate) query = query.gte("pickup_date", params.fromDate);
  if (params?.toDate) query = query.lte("pickup_date", params.toDate);
  if (params?.status) query = query.eq("status", params.status);

  const search = params?.search?.trim();
  if (search) {
    const q = search.replace(/[%,()]/g, " ");
    query = query.or(
      `mobile_no.ilike.%${q}%,shipper_name.ilike.%${q}%,awb_no.ilike.%${q}%,city.ilike.%${q}%`,
    );
  }

  const { data, error, count } = await query
    .order("pickup_no", { ascending: false })
    .range(from, to);
  if (error) throw translateDbError(error);
  return { rows: (data ?? []) as unknown as PickupRow[], count: count ?? 0 };
}

export async function savePickup(args: {
  id: string | null;
  rowVersion: number | null;
  fields: PickupFields;
}): Promise<PickupRow> {
  const { data, error } = await supabase.rpc("save_pickup", {
    p_id: args.id,
    p_row_version: args.rowVersion,
    p_fields: args.fields,
  });
  if (error) {
    if (error.code === "40001") throw new ConflictError(error.message);
    throw translateDbError(error);
  }
  return data as PickupRow;
}

export async function cancelPickup(args: {
  id: string;
  rowVersion: number;
  reason?: string;
}): Promise<PickupRow> {
  const { data, error } = await supabase.rpc("cancel_pickup", {
    p_id: args.id,
    p_row_version: args.rowVersion,
    p_reason: args.reason ?? null,
  });
  if (error) {
    if (error.code === "40001") throw new ConflictError(error.message);
    throw translateDbError(error);
  }
  return data as PickupRow;
}

export async function transferPickups(args: {
  date: string;
  fromFeId?: string | null;
  toFeId?: string | null;
  fromFeCode?: string | null;
  toFeCode?: string | null;
}): Promise<number> {
  const { data, error } = await supabase.rpc("transfer_pickups", {
    p_date: args.date,
    p_from_fe_id: args.fromFeId ?? null,
    p_to_fe_id: args.toFeId ?? null,
    p_from_fe_code: args.fromFeCode ?? null,
    p_to_fe_code: args.toFeCode ?? null,
  });
  if (error) throw translateDbError(error);
  return (data as number) ?? 0;
}

export async function softDeletePickup(id: string, rowVersion: number): Promise<void> {
  const { data, error } = await supabase
    .from("pickups")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("row_version", rowVersion)
    .is("deleted_at", null)
    .select("id");
  if (error) throw translateDbError(error);
  if (!data?.length) throw new ConflictError();
}
