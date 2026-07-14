/**
 * Rating engine resource — calculate / recalculate / breakdown (0041).
 */
import { supabase } from "@/integrations/supabase/client";
import { ConflictError, translateDbError } from "@/lib/masters/core/baseCrud";
import { SHIPMENT_PERMISSIONS } from "@/lib/permissions";

export type RatingBreakdown = {
  shipment_id?: string;
  rating_version?: number;
  freight: number;
  fuel: number;
  tax: number;
  other_charges: number;
  vendor_cost: number;
  total: number;
  snapshot?: Array<Record<string, unknown>>;
  from_audit?: boolean;
  persisted?: boolean;
  lane?: Record<string, unknown>;
  customer_rate?: Record<string, unknown> | null;
  raw: Record<string, unknown>;
};

export const ratingResource = {
  key: "rating",
  permission: SHIPMENT_PERMISSIONS.shipments,
  label: { singular: "Rating", plural: "Ratings" },
};

function mapBreakdown(raw: Record<string, unknown>): RatingBreakdown {
  const fuelObj = raw.fuel;
  const taxObj = raw.tax;
  const fuel =
    typeof fuelObj === "object" && fuelObj !== null && "amount" in fuelObj
      ? Number((fuelObj as { amount: unknown }).amount ?? 0)
      : Number(raw.fuel ?? 0);
  const tax =
    typeof taxObj === "object" && taxObj !== null && "amount" in taxObj
      ? Number((taxObj as { amount: unknown }).amount ?? 0)
      : Number(raw.tax ?? 0);
  return {
    shipment_id: raw.shipment_id ? String(raw.shipment_id) : undefined,
    rating_version: raw.rating_version != null ? Number(raw.rating_version) : undefined,
    freight: Number(raw.freight ?? 0),
    fuel,
    tax,
    other_charges: Number(raw.other_charges ?? 0),
    vendor_cost: Number(raw.vendor_cost ?? 0),
    total: Number(raw.total ?? 0),
    snapshot: Array.isArray(raw.snapshot) ? (raw.snapshot as Array<Record<string, unknown>>) : [],
    from_audit: Boolean(raw.from_audit),
    persisted: Boolean(raw.persisted),
    lane: (raw.lane as Record<string, unknown>) ?? undefined,
    customer_rate: (raw.customer_rate as Record<string, unknown>) ?? null,
    raw,
  };
}

export async function calculateShipmentRating(shipmentId: string): Promise<RatingBreakdown> {
  const { data, error } = await supabase.rpc("calculate_shipment_rating", {
    p_shipment_id: shipmentId,
  });
  if (error) throw translateDbError(error);
  return mapBreakdown((data ?? {}) as Record<string, unknown>);
}

export async function recalculateShipmentRating(input: {
  id: string;
  row_version: number;
}): Promise<RatingBreakdown> {
  const { data, error } = await supabase.rpc("recalculate_shipment_rating", {
    p_shipment_id: input.id,
    p_row_version: input.row_version,
  });
  if (error) {
    if (error.code === "40001") throw new ConflictError(error.message);
    throw translateDbError(error);
  }
  return mapBreakdown((data ?? {}) as Record<string, unknown>);
}

export async function getRatingBreakdown(shipmentId: string): Promise<RatingBreakdown> {
  const { data, error } = await supabase.rpc("get_rating_breakdown", {
    p_shipment_id: shipmentId,
  });
  if (error) throw translateDbError(error);
  return mapBreakdown((data ?? {}) as Record<string, unknown>);
}
