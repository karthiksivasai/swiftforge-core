import type { BaseRow } from "@/lib/masters/core/baseCrud";
import type { MasterResource } from "@/lib/masters/core/useMasterResource";
import { supabase } from "@/integrations/supabase/client";
import {
  customerRateCreateSchema,
  customerRateUpdateSchema,
  type CustomerRateCreate,
  type CustomerRateUpdate,
} from "@/lib/masters/schemas/customerRates";

/** Matches DB policy slug on customer_rates (mst.customer-contract-master). */
export const CUSTOMER_RATE_PERMISSION = "mst.customer-contract-master" as const;

export type CustomerRateRow = BaseRow & {
  customer_id: string;
  product_id: string | null;
  service: string | null;
  origin_destination_id: string | null;
  destination_id: string | null;
  zone_id: string | null;
  country_id: string | null;
  vendor_id: string | null;
  contract_no: string | null;
  from_date: string;
  to_date: string | null;
  unit: "KG" | "LB" | "CBM" | "PIECE" | null;
  transit_days: number | null;
  rate_type: "FLAT" | "PER_KG" | "PER_SLAB" | "MINIMUM" | null;
  min_weight: number;
  rate_per_kg: number;
  fuel_pct: number;
  other_charges: number;
  status: "ACTIVE" | "INACTIVE";
};

export const customerRatesResource: MasterResource<
  CustomerRateRow,
  CustomerRateCreate,
  CustomerRateUpdate
> = {
  key: "customer_rates",
  table: "customer_rates",
  master: "customers",
  permission: CUSTOMER_RATE_PERMISSION,
  label: { singular: "Customer Rate", plural: "Customer Rates" },
  columns:
    "id, tenant_id, customer_id, product_id, service, origin_destination_id, destination_id, zone_id, country_id, vendor_id, contract_no, from_date, to_date, unit, transit_days, rate_type, min_weight, rate_per_kg, fuel_pct, other_charges, status, created_at, created_by, updated_at, updated_by, deleted_at, row_version",
  searchColumns: ["service", "contract_no", "rate_type"],
  orderBy: "from_date",
  ascending: false,
  importColumns: [
    "customer_code",
    "product_code",
    "service",
    "origin_code",
    "destination_code",
    "zone_code",
    "country_code",
    "vendor_code",
    "contract_no",
    "from_date",
    "to_date",
    "unit",
    "transit_days",
    "rate_type",
    "min_weight",
    "rate_per_kg",
    "fuel_pct",
    "other_charges",
    "status",
  ],
  createSchema: customerRateCreateSchema,
  updateSchema: customerRateUpdateSchema,
};

export type CustomerRateFilter = {
  customer_id?: string | null;
  product_id?: string | null;
  service?: string | null;
  from_date?: string | null;
  zone_id?: string | null;
  contract_no?: string | null;
  origin_destination_id?: string | null;
  destination_id?: string | null;
  country_id?: string | null;
  vendor_id?: string | null;
};

export type CopyCustomerRatesArgs = {
  percentageIncrease: number;
  roundRates: boolean;
  copyFrom: CustomerRateFilter;
  copyTo: CustomerRateFilter & { customer_id: string; from_date?: string | null };
};

type RefRow = { id: string; code: string | null; name: string | null };

async function loadRefMap(table: string, ids: string[]): Promise<Map<string, RefRow>> {
  const map = new Map<string, RefRow>();
  if (ids.length === 0) return map;
  const { data } = await supabase.from(table).select("id, code, name").in("id", ids);
  for (const row of (data ?? []) as RefRow[]) map.set(row.id, row);
  return map;
}

/** Search-gated list with FK labels for the Client Rate screen. */
export async function fetchCustomerRateList(filters: CustomerRateFilter = {}) {
  let q = supabase
    .from("customer_rates")
    .select(customerRatesResource.columns)
    .is("deleted_at", null);

  if (filters.customer_id) q = q.eq("customer_id", filters.customer_id);
  if (filters.product_id) q = q.eq("product_id", filters.product_id);
  if (filters.service?.trim()) q = q.ilike("service", `%${filters.service.trim()}%`);
  if (filters.from_date) q = q.eq("from_date", filters.from_date);
  if (filters.zone_id) q = q.eq("zone_id", filters.zone_id);
  if (filters.contract_no?.trim()) q = q.ilike("contract_no", `%${filters.contract_no.trim()}%`);
  if (filters.origin_destination_id) q = q.eq("origin_destination_id", filters.origin_destination_id);
  if (filters.destination_id) q = q.eq("destination_id", filters.destination_id);
  if (filters.country_id) q = q.eq("country_id", filters.country_id);
  if (filters.vendor_id) q = q.eq("vendor_id", filters.vendor_id);

  q = q.order("from_date", { ascending: false }).limit(500);

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const roots = (data ?? []) as CustomerRateRow[];
  if (roots.length === 0) return [] as Array<CustomerRateRow & Record<string, unknown>>;

  const customerIds = [...new Set(roots.map((r) => r.customer_id))];
  const productIds = [...new Set(roots.map((r) => r.product_id).filter(Boolean) as string[])];
  const zoneIds = [...new Set(roots.map((r) => r.zone_id).filter(Boolean) as string[])];
  const countryIds = [...new Set(roots.map((r) => r.country_id).filter(Boolean) as string[])];
  const vendorIds = [...new Set(roots.map((r) => r.vendor_id).filter(Boolean) as string[])];
  const destIds = [
    ...new Set(
      roots
        .flatMap((r) => [r.origin_destination_id, r.destination_id])
        .filter(Boolean) as string[],
    ),
  ];

  const [customers, products, zones, countries, vendors, destinations] = await Promise.all([
    loadRefMap("customers", customerIds),
    loadRefMap("products", productIds),
    loadRefMap("zones", zoneIds),
    loadRefMap("countries", countryIds),
    loadRefMap("vendors", vendorIds),
    loadRefMap("destinations", destIds),
  ]);

  return roots.map((r) => {
    const customer = customers.get(r.customer_id);
    const product = r.product_id ? products.get(r.product_id) : undefined;
    const zone = r.zone_id ? zones.get(r.zone_id) : undefined;
    const country = r.country_id ? countries.get(r.country_id) : undefined;
    const vendor = r.vendor_id ? vendors.get(r.vendor_id) : undefined;
    const origin = r.origin_destination_id ? destinations.get(r.origin_destination_id) : undefined;
    const destination = r.destination_id ? destinations.get(r.destination_id) : undefined;
    return {
      ...r,
      customer_code: customer?.code ?? "",
      customer_name: customer?.name ?? "",
      product_code: product?.code ?? "",
      product_name: product?.name ?? "",
      zone_code: zone?.code ?? "",
      zone_name: zone?.name ?? "",
      country_code: country?.code ?? "",
      country_name: country?.name ?? "",
      vendor_code: vendor?.code ?? "",
      vendor_name: vendor?.name ?? "",
      origin_code: origin?.code ?? "",
      origin_name: origin?.name ?? "",
      destination_code: destination?.code ?? "",
      destination_name: destination?.name ?? "",
    };
  });
}

export async function copyCustomerRates(
  args: CopyCustomerRatesArgs,
): Promise<{ ok: boolean; copied: number }> {
  const { data, error } = await supabase.rpc("copy_customer_rates", {
    p_fields: {
      percentage_increase: args.percentageIncrease,
      round_rates: args.roundRates,
      copy_from: args.copyFrom,
      copy_to: args.copyTo,
    },
  });
  if (error) throw new Error(error.message);
  const raw = (data ?? {}) as Record<string, unknown>;
  return {
    ok: raw.ok === true,
    copied: Number(raw.copied ?? 0),
  };
}
