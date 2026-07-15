/**
 * Serviceable pincode RPCs — Milestone 6F.
 */
import { supabase } from "@/integrations/supabase/client";
import { translateDbError } from "@/lib/masters/core/baseCrud";
import type {
  ServiceableCheckResult,
  ServiceablePincodeRow,
} from "@/lib/serviceable-pincode/types";

function asObject(data: unknown): Record<string, unknown> {
  if (data && typeof data === "object" && !Array.isArray(data)) {
    return data as Record<string, unknown>;
  }
  return {};
}

function asArray<T>(data: unknown): T[] {
  return Array.isArray(data) ? (data as T[]) : [];
}

function mapRow(row: Record<string, unknown>): ServiceablePincodeRow {
  return {
    id: String(row.id ?? ""),
    pin_code: String(row.pin_code ?? ""),
    pin_name: (row.pin_name as string | null) ?? null,
    is_serviceable: row.is_serviceable !== false && row.is_serviceable !== "false",
    is_oda: row.is_oda === true || row.is_oda === "true",
    pickup_available: row.pickup_available === true || row.pickup_available === "true",
    destination_id: (row.destination_id as string | null) ?? null,
    destination_code: (row.destination_code as string | null) ?? null,
    destination_name: (row.destination_name as string | null) ?? null,
    destination_status: (row.destination_status as string | null) ?? null,
    zone_id: (row.zone_id as string | null) ?? null,
    zone_code: (row.zone_code as string | null) ?? null,
    zone_name: (row.zone_name as string | null) ?? null,
    branch_id: (row.branch_id as string | null) ?? null,
    service_center_code: (row.service_center_code as string | null) ?? null,
    service_center_name: (row.service_center_name as string | null) ?? null,
    vendor_id: (row.vendor_id as string | null) ?? null,
    vendor_code: (row.vendor_code as string | null) ?? null,
    vendor_name: (row.vendor_name as string | null) ?? null,
    state_code: (row.state_code as string | null) ?? null,
    state_name: (row.state_name as string | null) ?? null,
  };
}

function mapZone(value: unknown): { id: string; code: string; name: string } | null {
  const row = asObject(value);
  if (!row.id) return null;
  return {
    id: String(row.id),
    code: String(row.code ?? ""),
    name: String(row.name ?? ""),
  };
}

export async function searchServiceablePincode(params: {
  query: string;
  mode?: "pincode" | "name";
  limit?: number;
}): Promise<{ rows: ServiceablePincodeRow[]; total: number; mode: string; query: string }> {
  const { data, error } = await supabase.rpc("search_serviceable_pincode", {
    p_query: params.query,
    p_mode: params.mode ?? "pincode",
    p_limit: params.limit ?? 50,
  });
  if (error) throw translateDbError(error);
  const row = asObject(data);
  return {
    rows: asArray<Record<string, unknown>>(row.rows).map(mapRow),
    total: Number(row.total ?? 0),
    mode: String(row.mode ?? params.mode ?? "pincode"),
    query: String(row.query ?? params.query),
  };
}

export async function checkServiceablePincode(params: {
  originPincode: string;
  destinationPincode: string;
  productCode?: string | null;
  shipmentType?: string | null;
  service?: string | null;
}): Promise<ServiceableCheckResult> {
  const { data, error } = await supabase.rpc("check_serviceable_pincode", {
    p_origin_pincode: params.originPincode,
    p_destination_pincode: params.destinationPincode,
    p_product_code: params.productCode ?? null,
    p_shipment_type: params.shipmentType ?? null,
    p_service: params.service ?? null,
  });
  if (error) throw translateDbError(error);
  const row = asObject(data);
  return {
    serviceable: row.serviceable === true || row.serviceable === "true",
    failure_reason: (row.failure_reason as string | null) ?? null,
    origin_pincode: (row.origin_pincode as string | null) ?? null,
    destination_pincode: (row.destination_pincode as string | null) ?? null,
    origin_zone: mapZone(row.origin_zone),
    destination_zone: mapZone(row.destination_zone),
    destination_master: row.destination_master
      ? {
          id: String(asObject(row.destination_master).id ?? ""),
          code: String(asObject(row.destination_master).code ?? ""),
          name: String(asObject(row.destination_master).name ?? ""),
          status: String(asObject(row.destination_master).status ?? ""),
        }
      : null,
    service_center: mapZone(row.service_center),
    product: row.product
      ? {
          id: String(asObject(row.product).id ?? ""),
          code: String(asObject(row.product).code ?? ""),
          name: String(asObject(row.product).name ?? ""),
          shipment_type: String(asObject(row.product).shipment_type ?? ""),
          status: String(asObject(row.product).status ?? ""),
        }
      : null,
    shipment_type: (row.shipment_type as string | null) ?? null,
    service: (row.service as string | null) ?? null,
    routing: asArray<Record<string, unknown>>(row.routing),
    is_oda: row.is_oda === true || row.is_oda === "true",
    pickup_available: row.pickup_available === true || row.pickup_available === "true",
    origin: row.origin ? mapRow(asObject(row.origin)) : null,
    destination: row.destination ? mapRow(asObject(row.destination)) : null,
  };
}

export async function listServiceableRoutes(params?: {
  destinationPincode?: string | null;
  productCode?: string | null;
  page?: number;
  pageSize?: number;
}): Promise<{ rows: Record<string, unknown>[]; total: number; page: number; page_size: number }> {
  const { data, error } = await supabase.rpc("list_serviceable_routes", {
    p_destination_pincode: params?.destinationPincode ?? null,
    p_product_code: params?.productCode ?? null,
    p_page: params?.page ?? 1,
    p_page_size: params?.pageSize ?? 50,
  });
  if (error) throw translateDbError(error);
  const row = asObject(data);
  return {
    rows: asArray<Record<string, unknown>>(row.rows),
    total: Number(row.total ?? 0),
    page: Number(row.page ?? 1),
    page_size: Number(row.page_size ?? 50),
  };
}
