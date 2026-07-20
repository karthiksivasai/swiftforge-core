/**
 * Shipment (AWB) resource — list + save/confirm/cancel RPCs (0032/0033).
 */
import { supabase } from "@/integrations/supabase/client";
import type { BaseRow } from "@/lib/masters/core/baseCrud";
import { ConflictError, translateDbError } from "@/lib/masters/core/baseCrud";
import { SHIPMENT_PERMISSIONS } from "@/lib/permissions";
import type {
  ShipmentAttachmentInput,
  ShipmentChargeInput,
  ShipmentCommentInput,
  ShipmentFields,
  ShipmentPieceInput,
} from "@/lib/transactions/schemas/shipments";

export type ShipmentStatus =
  | "DRAFT"
  | "BOOKED"
  | "PICKUP_INSCANNED"
  | "BAGGED"
  | "MANIFESTED"
  | "IN_TRANSIT"
  | "RECEIVED_AT_HUB"
  | "ON_DRS"
  | "MISROUTED"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "UNDELIVERED"
  | "UNDELIVERED_RECEIVED"
  | "RTO_INITIATED"
  | "RTO_DELIVERED"
  | "CANCELLED"
  | "VOID";

type NamedRef = { code: string; name: string } | null;

export type ShipmentRow = BaseRow & {
  awb_no: string;
  book_date: string;
  book_time: string | null;
  reference_no: string | null;
  customer_id: string | null;
  branch_id: string | null;
  origin_destination_id: string | null;
  destination_id: string | null;
  shipper: Record<string, unknown>;
  consignee: Record<string, unknown>;
  product_id: string | null;
  vendor_id: string | null;
  airline: string | null;
  service: string | null;
  payment_type: string | null;
  content: string | null;
  instruction: string | null;
  field_executive_id: string | null;
  pickup_id: string | null;
  pieces: number;
  pieces_unit: string;
  actual_weight: number;
  weight_unit: string;
  vol_weight: number;
  charge_weight: number;
  shipment_value: number | null;
  currency: string;
  is_commercial: boolean;
  is_oda: boolean;
  medical_charges: boolean;
  customer_charges_total: number;
  vendor_charges_total: number;
  cash_receipt_no: string | null;
  amount_received: number | null;
  balance_amount: number | null;
  cash_receipt_date: string | null;
  forwarding_awb: string | null;
  delivery_awb: string | null;
  return_awb: string | null;
  delivery_vendor_id: string | null;
  delivery_service: string | null;
  flight_no: string | null;
  current_status: ShipmentStatus;
  status_at: string;
  is_locked: boolean;
  is_hold: boolean;
  wizard_extras: Record<string, unknown>;
  carrier_provider_code: string | null;
  carrier_booking_ref: string | null;
  carrier_tracking_no: string | null;
  carrier_label_file_id: string | null;
  carrier_booking_status: string | null;
  carrier_last_sync_at: string | null;
  customers: NamedRef;
  products: NamedRef;
  vendors: NamedRef;
  delivery_vendor: NamedRef;
  destination: NamedRef;
  origin: NamedRef;
  field_executives: NamedRef;
  branches: NamedRef;
};

export type ShipmentPieceRow = {
  seq: number;
  child_awb: string | null;
  actual_weight_per_pc: number;
  pieces: number;
  length: number | null;
  breadth: number | null;
  height: number | null;
  divisor: number | null;
  vol_weight: number;
  charge_weight: number;
};

export type ShipmentChargeRow = {
  seq: number;
  side: "CUSTOMER" | "VENDOR";
  description: string;
  rate: number;
  amount: number;
  fuel_applies: boolean;
  fuel_amount: number;
  tax_applies: boolean;
  tax_on_fuel: boolean;
  igst: number;
  sgst: number;
  cgst: number;
  total: number;
  charges_type: "MANUAL" | "SYSTEM";
};

export type ShipmentCommentRow = {
  seq: number;
  comment: string;
  file_id: string | null;
  commented_at: string;
};

export type ShipmentAttachmentRow = {
  seq: number;
  file_id: string;
  label: string | null;
};

export type ShipmentChildren = {
  pieces: ShipmentPieceRow[];
  charges: ShipmentChargeRow[];
  comments: ShipmentCommentRow[];
  attachments: ShipmentAttachmentRow[];
};

const SHIPMENT_COLUMNS = `
  id, tenant_id, awb_no, book_date, book_time, reference_no,
  customer_id, branch_id, origin_destination_id, destination_id,
  shipper, consignee, product_id, vendor_id, airline, service, payment_type,
  content, instruction, field_executive_id, pickup_id,
  pieces, pieces_unit, actual_weight, weight_unit, vol_weight, charge_weight,
  shipment_value, currency, is_commercial, is_oda, medical_charges,
  customer_charges_total, vendor_charges_total,
  cash_receipt_no, amount_received, balance_amount, cash_receipt_date,
  forwarding_awb, delivery_awb, return_awb, delivery_vendor_id, delivery_service,
  flight_no, current_status, status_at, is_locked, is_hold, wizard_extras,
  carrier_provider_code, carrier_booking_ref, carrier_tracking_no,
  carrier_label_file_id, carrier_booking_status, carrier_last_sync_at,
  created_at, created_by, updated_at, updated_by, deleted_at, row_version,
  customers(code,name),
  products(code,name),
  vendors:vendors!shipments_vendor_fk(code,name),
  delivery_vendor:vendors!shipments_delivery_vendor_fk(code,name),
  destination:destinations!shipments_destination_fk(code,name),
  origin:destinations!shipments_origin_fk(code,name),
  field_executives(code,name),
  branches(code,name)
`
  .replace(/\s+/g, " ")
  .trim();

export const shipmentsResource = {
  key: "shipments",
  table: "shipments",
  permission: SHIPMENT_PERMISSIONS.shipments,
  label: { singular: "Shipment", plural: "Shipments" },
  columns: SHIPMENT_COLUMNS,
  searchColumns: ["awb_no", "reference_no", "forwarding_awb", "delivery_awb"] as const,
  orderBy: "book_date",
  ascending: false as const,
};

export async function listShipments(params?: {
  page?: number;
  pageSize?: number;
  search?: string;
  searchField?: "awb_no" | "forwarding_awb" | "delivery_awb" | "reference_no";
}): Promise<{ rows: ShipmentRow[]; count: number }> {
  const page = Math.max(1, params?.page ?? 1);
  const pageSize = Math.min(Math.max(1, params?.pageSize ?? 100), 500);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("shipments")
    .select(SHIPMENT_COLUMNS, { count: "exact" })
    .is("deleted_at", null);

  const search = params?.search?.trim();
  if (search) {
    const q = search.replace(/[%,()]/g, " ");
    const field = params?.searchField ?? "awb_no";
    query = query.ilike(field, `%${q}%`);
  }

  const { data, error, count } = await query
    .order("book_date", { ascending: false })
    .order("awb_no", { ascending: false })
    .range(from, to);
  if (error) throw translateDbError(error);
  return { rows: (data ?? []) as unknown as ShipmentRow[], count: count ?? 0 };
}

export async function fetchShipmentChildren(shipmentId: string): Promise<ShipmentChildren> {
  const [pieces, charges, comments, attachments] = await Promise.all([
    supabase
      .from("shipment_pieces")
      .select(
        "seq, child_awb, actual_weight_per_pc, pieces, length, breadth, height, divisor, vol_weight, charge_weight",
      )
      .eq("shipment_id", shipmentId)
      .order("seq", { ascending: true }),
    supabase
      .from("shipment_charge_snapshots")
      .select(
        "seq, side, description, rate, amount, fuel_applies, fuel_amount, tax_applies, tax_on_fuel, igst, sgst, cgst, total, charges_type",
      )
      .eq("shipment_id", shipmentId)
      .order("seq", { ascending: true }),
    supabase
      .from("shipment_comments")
      .select("seq, comment, file_id, commented_at")
      .eq("shipment_id", shipmentId)
      .order("seq", { ascending: true }),
    supabase
      .from("shipment_attachments")
      .select("seq, file_id, label")
      .eq("shipment_id", shipmentId)
      .order("seq", { ascending: true }),
  ]);
  for (const res of [pieces, charges, comments, attachments]) {
    if (res.error) throw new Error(res.error.message);
  }
  return {
    pieces: (pieces.data ?? []) as ShipmentPieceRow[],
    charges: (charges.data ?? []) as ShipmentChargeRow[],
    comments: (comments.data ?? []) as ShipmentCommentRow[],
    attachments: (attachments.data ?? []) as ShipmentAttachmentRow[],
  };
}

export async function saveShipment(args: {
  id: string | null;
  rowVersion: number | null;
  fields: ShipmentFields;
  pieces?: ShipmentPieceInput[];
  charges?: ShipmentChargeInput[];
  comments?: ShipmentCommentInput[];
  attachments?: ShipmentAttachmentInput[];
}): Promise<ShipmentRow> {
  const { data, error } = await supabase.rpc("save_shipment", {
    p_id: args.id,
    p_row_version: args.rowVersion,
    p_fields: args.fields,
    p_pieces: args.pieces ?? [],
    p_charges: args.charges ?? [],
    p_comments: args.comments ?? [],
    p_attachments: args.attachments ?? [],
  });
  if (error) {
    if (error.code === "40001") throw new ConflictError(error.message);
    throw translateDbError(error);
  }
  return data as ShipmentRow;
}

export type BookingValidationError = { field: string; message: string };

export type BookingValidationResult = {
  ok: boolean;
  errors: BookingValidationError[];
  status: string;
  awb_no: string | null;
};

/** Parse CMS04 booking validation payload from an Error message. */
export function formatBookingValidationError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  const match = msg.match(/Booking validation failed:\s*(\[[\s\S]*\])/);
  if (match?.[1]) {
    try {
      const errors = JSON.parse(match[1]) as BookingValidationError[];
      if (Array.isArray(errors) && errors.length > 0) {
        return errors.map((e) => e.message).join("; ");
      }
    } catch {
      /* fall through */
    }
  }
  return msg || "Booking validation failed";
}

export async function validateShipmentBooking(id: string): Promise<BookingValidationResult> {
  const { data, error } = await supabase.rpc("validate_shipment_booking", { p_id: id });
  if (error) throw translateDbError(error);
  const raw = data as {
    ok?: boolean;
    errors?: BookingValidationError[];
    status?: string;
    awb_no?: string | null;
  };
  return {
    ok: Boolean(raw?.ok),
    errors: Array.isArray(raw?.errors) ? raw.errors : [],
    status: String(raw?.status ?? ""),
    awb_no: raw?.awb_no ?? null,
  };
}

export async function confirmBooking(args: {
  id: string;
  rowVersion: number;
}): Promise<ShipmentRow> {
  const { data, error } = await supabase.rpc("confirm_booking", {
    p_id: args.id,
    p_row_version: args.rowVersion,
  });
  if (error) {
    if (error.code === "40001") throw new ConflictError(error.message);
    if (error.code === "CMS04" || /Booking validation failed/i.test(error.message)) {
      throw new Error(formatBookingValidationError(new Error(error.message)));
    }
    throw translateDbError(error);
  }
  return data as ShipmentRow;
}

export async function cancelShipment(args: {
  id: string;
  rowVersion: number;
  reason?: string;
}): Promise<ShipmentRow> {
  const { data, error } = await supabase.rpc("cancel_shipment", {
    p_id: args.id,
    p_row_version: args.rowVersion,
    p_reason: args.reason ?? null,
  });
  if (error) {
    if (error.code === "40001") throw new ConflictError(error.message);
    throw translateDbError(error);
  }
  return data as ShipmentRow;
}
