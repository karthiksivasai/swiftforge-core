/**
 * Tax & Fuel setup RPCs + import — Milestone 6D.
 */
import { supabase } from "@/integrations/supabase/client";
import { translateDbError } from "@/lib/masters/core/baseCrud";
import { importMasterChunked, type ImportResult, type ImportRow } from "@/lib/masters/core/import";
import type { FuelRate, FuelRateFields, TaxRate, TaxRateFields } from "@/lib/tax-fuel/types";

function asObject(data: unknown): Record<string, unknown> {
  if (data && typeof data === "object" && !Array.isArray(data)) {
    return data as Record<string, unknown>;
  }
  return {};
}

function asArray<T>(data: unknown): T[] {
  return Array.isArray(data) ? (data as T[]) : [];
}

function mapFuel(row: Record<string, unknown>): FuelRate {
  return {
    id: String(row.id ?? ""),
    entry_code: (row.entry_code as string | null) ?? null,
    customer_id: (row.customer_id as string | null) ?? null,
    customer_code: (row.customer_code as string | null) ?? null,
    customer_name: (row.customer_name as string | null) ?? null,
    vendor_id: (row.vendor_id as string | null) ?? null,
    vendor_code: (row.vendor_code as string | null) ?? null,
    vendor_name: (row.vendor_name as string | null) ?? null,
    product_id: (row.product_id as string | null) ?? null,
    product_code: (row.product_code as string | null) ?? null,
    product_name: (row.product_name as string | null) ?? null,
    zone_id: (row.zone_id as string | null) ?? null,
    zone_code: (row.zone_code as string | null) ?? null,
    zone_name: (row.zone_name as string | null) ?? null,
    destination_id: (row.destination_id as string | null) ?? null,
    destination_code: (row.destination_code as string | null) ?? null,
    destination_name: (row.destination_name as string | null) ?? null,
    from_date: String(row.from_date ?? ""),
    to_date: (row.to_date as string | null) ?? null,
    percentage: Number(row.percentage ?? 0),
    status: (String(row.status ?? "ACTIVE") as "ACTIVE" | "INACTIVE") || "ACTIVE",
    row_version: Number(row.row_version ?? 1),
    created_at: row.created_at ? String(row.created_at) : undefined,
  };
}

function mapTax(row: Record<string, unknown>): TaxRate {
  return {
    id: String(row.id ?? ""),
    customer_id: (row.customer_id as string | null) ?? null,
    customer_code: (row.customer_code as string | null) ?? null,
    customer_name: (row.customer_name as string | null) ?? null,
    product_id: (row.product_id as string | null) ?? null,
    product_code: (row.product_code as string | null) ?? null,
    product_name: (row.product_name as string | null) ?? null,
    from_date: String(row.from_date ?? ""),
    to_date: (row.to_date as string | null) ?? null,
    igst_pct: Number(row.igst_pct ?? 0),
    cgst_pct: Number(row.cgst_pct ?? 0),
    sgst_pct: Number(row.sgst_pct ?? 0),
    tax_type: String(row.tax_type ?? "GST"),
    tax_on_fuel: row.tax_on_fuel === true || row.tax_on_fuel === "true",
    status: (String(row.status ?? "ACTIVE") as "ACTIVE" | "INACTIVE") || "ACTIVE",
    row_version: Number(row.row_version ?? 1),
    created_at: row.created_at ? String(row.created_at) : undefined,
  };
}

export async function listFuelRates(params?: {
  search?: string | null;
  status?: string | null;
  page?: number;
  pageSize?: number;
}): Promise<{ rows: FuelRate[]; total: number; page: number; page_size: number }> {
  const { data, error } = await supabase.rpc("list_fuel_rates", {
    p_search: params?.search ?? null,
    p_status: params?.status ?? null,
    p_page: params?.page ?? 1,
    p_page_size: params?.pageSize ?? 50,
  });
  if (error) throw translateDbError(error);
  const row = asObject(data);
  return {
    rows: asArray<Record<string, unknown>>(row.rows).map(mapFuel),
    total: Number(row.total ?? 0),
    page: Number(row.page ?? 1),
    page_size: Number(row.page_size ?? 50),
  };
}

export async function saveFuelRate(params: {
  fields: FuelRateFields;
  id?: string | null;
  rowVersion?: number | null;
}): Promise<FuelRate> {
  const { data, error } = await supabase.rpc("save_fuel_rate", {
    p_fields: params.fields,
    p_id: params.id ?? null,
    p_row_version: params.rowVersion ?? null,
  });
  if (error) throw translateDbError(error);
  return mapFuel(asObject(data));
}

export async function deleteFuelRate(id: string, rowVersion?: number | null): Promise<void> {
  const { error } = await supabase.rpc("delete_fuel_rate", {
    p_id: id,
    p_row_version: rowVersion ?? null,
  });
  if (error) throw translateDbError(error);
}

export async function listTaxRates(params?: {
  search?: string | null;
  status?: string | null;
  page?: number;
  pageSize?: number;
}): Promise<{ rows: TaxRate[]; total: number; page: number; page_size: number }> {
  const { data, error } = await supabase.rpc("list_tax_rates", {
    p_search: params?.search ?? null,
    p_status: params?.status ?? null,
    p_page: params?.page ?? 1,
    p_page_size: params?.pageSize ?? 50,
  });
  if (error) throw translateDbError(error);
  const row = asObject(data);
  return {
    rows: asArray<Record<string, unknown>>(row.rows).map(mapTax),
    total: Number(row.total ?? 0),
    page: Number(row.page ?? 1),
    page_size: Number(row.page_size ?? 50),
  };
}

export async function saveTaxRate(params: {
  fields: TaxRateFields;
  id?: string | null;
  rowVersion?: number | null;
}): Promise<TaxRate> {
  const { data, error } = await supabase.rpc("save_tax_rate", {
    p_fields: params.fields,
    p_id: params.id ?? null,
    p_row_version: params.rowVersion ?? null,
  });
  if (error) throw translateDbError(error);
  return mapTax(asObject(data));
}

export async function deleteTaxRate(id: string, rowVersion?: number | null): Promise<void> {
  const { error } = await supabase.rpc("delete_tax_rate", {
    p_id: id,
    p_row_version: rowVersion ?? null,
  });
  if (error) throw translateDbError(error);
}

export async function importFuelRates(
  mode: "VALIDATE" | "COMMIT",
  rows: ReadonlyArray<ImportRow>,
): Promise<ImportResult> {
  return importMasterChunked("fuel_surcharge_rates", mode, rows);
}

export async function importTaxRates(
  mode: "VALIDATE" | "COMMIT",
  rows: ReadonlyArray<ImportRow>,
): Promise<ImportResult> {
  return importMasterChunked("tax_rates", mode, rows);
}

export const FUEL_IMPORT_COLUMNS = [
  "entry_code",
  "customer_code",
  "vendor_code",
  "product_code",
  "zone_code",
  "destination_code",
  "from_date",
  "to_date",
  "percentage",
  "status",
] as const;

export const TAX_IMPORT_COLUMNS = [
  "customer_code",
  "product_code",
  "from_date",
  "to_date",
  "igst_pct",
  "cgst_pct",
  "sgst_pct",
  "tax_type",
  "tax_on_fuel",
  "status",
] as const;
