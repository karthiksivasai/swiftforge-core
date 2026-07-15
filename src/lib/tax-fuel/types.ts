/**
 * Tax & Fuel setup types — Milestone 6D.
 */

export type ConfigStatus = "ACTIVE" | "INACTIVE";

export type FuelRate = {
  id: string;
  entry_code: string | null;
  customer_id: string | null;
  customer_code?: string | null;
  customer_name?: string | null;
  vendor_id: string | null;
  vendor_code?: string | null;
  vendor_name?: string | null;
  product_id: string | null;
  product_code?: string | null;
  product_name?: string | null;
  zone_id: string | null;
  zone_code?: string | null;
  zone_name?: string | null;
  destination_id: string | null;
  destination_code?: string | null;
  destination_name?: string | null;
  from_date: string;
  to_date: string | null;
  percentage: number;
  status: ConfigStatus;
  row_version: number;
  created_at?: string;
};

export type TaxRate = {
  id: string;
  customer_id: string | null;
  customer_code?: string | null;
  customer_name?: string | null;
  product_id: string | null;
  product_code?: string | null;
  product_name?: string | null;
  from_date: string;
  to_date: string | null;
  igst_pct: number;
  cgst_pct: number;
  sgst_pct: number;
  tax_type: string;
  tax_on_fuel: boolean;
  status: ConfigStatus;
  row_version: number;
  created_at?: string;
};

export type FuelRateFields = {
  entry_code?: string | null;
  customer_id?: string | null;
  customer_code?: string | null;
  vendor_id?: string | null;
  vendor_code?: string | null;
  product_id?: string | null;
  product_code?: string | null;
  zone_id?: string | null;
  zone_code?: string | null;
  destination_id?: string | null;
  destination_code?: string | null;
  from_date: string;
  to_date?: string | null;
  percentage: number | string;
  status?: ConfigStatus;
};

export type TaxRateFields = {
  customer_id?: string | null;
  customer_code?: string | null;
  product_id?: string | null;
  product_code?: string | null;
  from_date: string;
  to_date?: string | null;
  igst_pct?: number | string;
  cgst_pct?: number | string;
  sgst_pct?: number | string;
  tax_type?: string;
  tax_on_fuel?: boolean | string;
  status?: ConfigStatus;
};
