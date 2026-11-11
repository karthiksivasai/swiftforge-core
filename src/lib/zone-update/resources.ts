import { supabase } from "@/integrations/supabase/client";
import type { ZoneFileRow } from "./file";

export type ZonePreview = {
  total: number;
  ok_count: number;
  failed_count: number;
  new_count: number;
  replace_count: number;
  rows: Array<{
    row_no: number;
    origin: string;
    vendor: string;
    product: string;
    country: string;
    destination: string;
    zone: string;
    service: string;
    status: "OK" | "FAILED";
    outcome: "NEW" | "REPLACE" | null;
    reason: string | null;
  }>;
};

export type ZoneApplyResult = {
  imported: number;
  new_count: number;
  replace_count: number;
  skipped: number;
};

export type ZoneSearchRow = {
  id: string;
  Origin: string | null;
  Vendor: string | null;
  Product: string | null;
  Country: string | null;
  Destination: string | null;
  destination_name: string | null;
  Zone: string | null;
  ServiceType: string | null;
  effective_date: string;
  origin_id: string | null;
  vendor_id: string | null;
  product_id: string | null;
  country_id: string | null;
  destination_id: string | null;
  zone_id: string | null;
};

export async function previewZoneImport(rows: ZoneFileRow[]): Promise<ZonePreview> {
  const { data, error } = await supabase.rpc("preview_zone_import", { p_rows: rows });
  if (error) throw new Error(error.message);
  return data as ZonePreview;
}

export async function applyZoneImport(
  rows: ZoneFileRow[],
  effectiveDate: string,
  skipFailed: boolean,
): Promise<ZoneApplyResult> {
  const { data, error } = await supabase.rpc("apply_zone_import", {
    p_rows: rows,
    p_effective_date: effectiveDate,
    p_skip_failed: skipFailed,
  });
  if (error) throw new Error(error.message);
  return data as ZoneApplyResult;
}

export async function searchZoneMappings(filters: {
  exportType: string;
  asOf: string;
  vendorId?: string;
  productId?: string;
  originId?: string;
  zoneId?: string;
  countryId?: string;
  destinationId?: string;
  service?: string;
}): Promise<{ total: number; rows: ZoneSearchRow[] }> {
  const { data, error } = await supabase.rpc("search_zone_mappings", {
    p_filters: {
      export_type: filters.exportType,
      as_of: filters.asOf,
      vendor_id: filters.vendorId || null,
      product_id: filters.productId || null,
      origin_id: filters.originId || null,
      zone_id: filters.zoneId || null,
      country_id: filters.countryId || null,
      destination_id: filters.destinationId || null,
      service: filters.service || null,
    },
  });
  if (error) throw new Error(error.message);
  return data as { total: number; rows: ZoneSearchRow[] };
}

export async function saveZoneMapping(id: string | null, fields: Record<string, string | null>) {
  const { data, error } = await supabase.rpc("save_zone_mapping", { p_id: id, p_fields: fields });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function deleteZoneMapping(id: string) {
  const { error } = await supabase.rpc("delete_zone_mapping", { p_id: id });
  if (error) throw new Error(error.message);
}
