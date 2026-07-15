/**
 * Carrier booking / tracking RPCs — Milestone 7B.
 * Thin client over SECURITY DEFINER functions; no provider secrets here.
 */
import { supabase } from "@/integrations/supabase/client";
import { ConflictError, translateDbError } from "@/lib/masters/core/baseCrud";

export const SUPPORTED_CARRIER_CODES = ["FEDEX", "DHL", "BLUEDART"] as const;
export type SupportedCarrierCode = (typeof SUPPORTED_CARRIER_CODES)[number];

export type CarrierBookingResult = {
  shipment_id: string;
  row_version: number;
  provider_code: string;
  booking_ref?: string;
  tracking_no?: string;
  carrier_booking_status?: string;
  request_id?: string;
  [key: string]: unknown;
};

export type CarrierServiceabilityResult = {
  provider_code: string;
  origin_pincode: string;
  destination_pincode: string;
  serviceable: boolean;
  reason?: string;
  request_id?: string;
  [key: string]: unknown;
};

export type CarrierLabelResult = {
  shipment_id: string;
  row_version: number;
  provider_code: string;
  tracking_no?: string;
  file_id: string;
  storage_key?: string;
  original_name?: string;
  mime?: string;
  request_id?: string;
  [key: string]: unknown;
};

export type ShipmentCarrierMeta = {
  id: string;
  row_version: number;
  carrier_provider_code: string | null;
  carrier_booking_ref: string | null;
  carrier_tracking_no: string | null;
  carrier_label_file_id: string | null;
  carrier_booking_status: string | null;
  carrier_last_sync_at: string | null;
};

function asObject(data: unknown): Record<string, unknown> {
  if (data && typeof data === "object" && !Array.isArray(data)) {
    return data as Record<string, unknown>;
  }
  return {};
}

function throwRpcError(error: { code?: string; message: string }): never {
  if (error.code === "40001" || error.code === "CMS04") {
    if (/Optimistic lock/i.test(error.message)) throw new ConflictError(error.message);
  }
  throw translateDbError(error as Parameters<typeof translateDbError>[0]);
}

export async function bookShipmentCarrier(args: {
  id: string;
  rowVersion?: number | null;
  providerCode?: string | null;
}): Promise<CarrierBookingResult> {
  const { data, error } = await supabase.rpc("book_shipment_carrier", {
    p_id: args.id,
    p_row_version: args.rowVersion ?? null,
    p_provider_code: args.providerCode ?? null,
  });
  if (error) throwRpcError(error);
  return asObject(data) as CarrierBookingResult;
}

export async function cancelShipmentCarrier(args: {
  id: string;
  rowVersion?: number | null;
}): Promise<CarrierBookingResult> {
  const { data, error } = await supabase.rpc("cancel_shipment_carrier", {
    p_id: args.id,
    p_row_version: args.rowVersion ?? null,
  });
  if (error) throwRpcError(error);
  return asObject(data) as CarrierBookingResult;
}

export async function refreshShipmentCarrierTracking(args: {
  id: string;
  rowVersion?: number | null;
}): Promise<CarrierBookingResult> {
  const { data, error } = await supabase.rpc("refresh_shipment_carrier_tracking", {
    p_id: args.id,
    p_row_version: args.rowVersion ?? null,
  });
  if (error) throwRpcError(error);
  return asObject(data) as CarrierBookingResult;
}

export async function getShipmentCarrierLabel(args: {
  id: string;
  rowVersion?: number | null;
}): Promise<CarrierLabelResult> {
  const { data, error } = await supabase.rpc("get_shipment_carrier_label", {
    p_id: args.id,
    p_row_version: args.rowVersion ?? null,
  });
  if (error) throwRpcError(error);
  return asObject(data) as CarrierLabelResult;
}

export async function checkCarrierServiceability(args: {
  providerCode: string;
  originPincode: string;
  destinationPincode: string;
}): Promise<CarrierServiceabilityResult> {
  const { data, error } = await supabase.rpc("check_carrier_serviceability", {
    p_provider_code: args.providerCode,
    p_origin_pincode: args.originPincode,
    p_destination_pincode: args.destinationPincode,
  });
  if (error) throwRpcError(error);
  return asObject(data) as CarrierServiceabilityResult;
}

/** Lightweight carrier metadata for shipment screens (reuses shipments RLS). */
export async function fetchShipmentCarrierMeta(
  shipmentId: string,
): Promise<ShipmentCarrierMeta | null> {
  const { data, error } = await supabase
    .from("shipments")
    .select(
      "id, row_version, carrier_provider_code, carrier_booking_ref, carrier_tracking_no, carrier_label_file_id, carrier_booking_status, carrier_last_sync_at",
    )
    .eq("id", shipmentId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw translateDbError(error);
  if (!data) return null;
  return data as ShipmentCarrierMeta;
}

export function normalizeVendorToCarrierCode(vendorCode: string | null | undefined): string | null {
  const raw = (vendorCode ?? "").trim().toUpperCase();
  if (!raw) return null;
  if ((SUPPORTED_CARRIER_CODES as readonly string[]).includes(raw)) return raw;
  if (raw.startsWith("FEDEX") || raw === "FDX") return "FEDEX";
  if (raw.startsWith("DHL") || raw === "DHE") return "DHL";
  if (raw.startsWith("BLUEDART") || raw === "BD" || raw === "BDE") return "BLUEDART";
  return null;
}
