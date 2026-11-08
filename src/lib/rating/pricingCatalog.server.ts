import type { SupabaseClient } from "@supabase/supabase-js";

import type { CustomerRateRecord } from "@/lib/rating/ratingEngine";
import type { VendorSlab, VendorTariff } from "@/lib/rating/vendorTariff";

type CodeName = { code: string; name: string };

async function loadRefs(
  db: SupabaseClient,
  table: string,
  ids: string[],
): Promise<Map<string, CodeName>> {
  const map = new Map<string, CodeName>();
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return map;
  const { data, error } = await db.from(table).select("id, code, name").in("id", unique);
  if (error) throw new Error(error.message);
  for (const row of (data ?? []) as { id: string; code: string | null; name: string | null }[]) {
    map.set(row.id, { code: row.code ?? "", name: row.name ?? "" });
  }
  return map;
}

function num(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Active selling rates for one customer account, shaped for the rating engine. */
export async function loadCustomerRateCard(
  db: SupabaseClient,
  tenantId: string,
  customerCode: string,
): Promise<CustomerRateRecord[]> {
  const code = customerCode.trim();
  if (!code) return [];

  const { data: customers, error: customerError } = await db
    .from("customers")
    .select("id, code")
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .ilike("code", code)
    .limit(5);
  if (customerError) throw new Error(customerError.message);

  const customer = ((customers ?? []) as { id: string; code: string | null }[]).find(
    (row) => (row.code ?? "").trim().toUpperCase() === code.toUpperCase(),
  );
  if (!customer) return [];

  const { data, error } = await db
    .from("customer_rates")
    .select(
      "id, contract_no, product_id, vendor_id, origin_destination_id, destination_id, country_id, zone_id, from_date, to_date, min_weight, rate_per_kg, fuel_pct, other_charges, rate_type, status",
    )
    .eq("tenant_id", tenantId)
    .eq("customer_id", customer.id)
    .eq("status", "ACTIVE")
    .is("deleted_at", null);
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as Record<string, unknown>[];
  if (rows.length === 0) return [];

  const ids = (key: string) => rows.map((row) => (row[key] ? String(row[key]) : ""));
  const [products, vendors, destinations, countries, zones] = await Promise.all([
    loadRefs(db, "products", ids("product_id")),
    loadRefs(db, "vendors", ids("vendor_id")),
    loadRefs(db, "destinations", [...ids("origin_destination_id"), ...ids("destination_id")]),
    loadRefs(db, "countries", ids("country_id")),
    loadRefs(db, "zones", ids("zone_id")),
  ]);
  const refOf = (map: Map<string, CodeName>, id: unknown) => (id ? map.get(String(id)) : undefined);

  return rows.map((row) => ({
    id: String(row.id),
    customer_code: customer.code ?? code,
    contract_no: row.contract_no ? String(row.contract_no) : "",
    product_code: refOf(products, row.product_id)?.code || null,
    vendor_code: refOf(vendors, row.vendor_id)?.code || null,
    origin_code: refOf(destinations, row.origin_destination_id)?.code || null,
    origin_name: refOf(destinations, row.origin_destination_id)?.name || null,
    destination_code: refOf(destinations, row.destination_id)?.code || null,
    destination_name: refOf(destinations, row.destination_id)?.name || null,
    country_code: refOf(countries, row.country_id)?.code || null,
    country_name: refOf(countries, row.country_id)?.name || null,
    zone_id: row.zone_id ? String(row.zone_id) : null,
    zone_code: refOf(zones, row.zone_id)?.code || null,
    min_weight: num(row.min_weight),
    rate_per_kg: num(row.rate_per_kg),
    rate_type: (row.rate_type as CustomerRateRecord["rate_type"]) ?? null,
    fuel_pct: num(row.fuel_pct),
    other_charges: num(row.other_charges),
    status: "ACTIVE",
    from_date: String(row.from_date).slice(0, 10),
    to_date: row.to_date ? String(row.to_date).slice(0, 10) : null,
  }));
}

/** Active carrier rate cards with their weight slabs. */
export async function loadVendorTariffs(db: SupabaseClient, tenantId: string): Promise<VendorTariff[]> {
  const { data, error } = await db
    .from("vendor_contracts")
    .select(
      "id, contract_no, vendor_id, product_id, origin_destination_id, destination_id, zone_id, service, from_date, status",
    )
    .eq("tenant_id", tenantId)
    .eq("status", "ACTIVE")
    .is("deleted_at", null)
    .limit(500);
  if (error) throw new Error(error.message);

  const contracts = (data ?? []) as Record<string, unknown>[];
  if (contracts.length === 0) return [];

  const contractIds = contracts.map((row) => String(row.id));
  const { data: slabData, error: slabError } = await db
    .from("vendor_contract_slabs")
    .select("contract_id, seq, rate_type, weight, rate")
    .eq("tenant_id", tenantId)
    .in("contract_id", contractIds);
  if (slabError) throw new Error(slabError.message);

  const slabsByContract = new Map<string, VendorSlab[]>();
  for (const slab of (slabData ?? []) as Record<string, unknown>[]) {
    const contractId = String(slab.contract_id);
    const list = slabsByContract.get(contractId) ?? [];
    list.push({
      seq: num(slab.seq),
      rate_type: String(slab.rate_type) as VendorSlab["rate_type"],
      weight: num(slab.weight),
      rate: num(slab.rate),
    });
    slabsByContract.set(contractId, list);
  }

  const ids = (key: string) => contracts.map((row) => (row[key] ? String(row[key]) : ""));
  const [vendors, products, destinations, zones] = await Promise.all([
    loadRefs(db, "vendors", ids("vendor_id")),
    loadRefs(db, "products", ids("product_id")),
    loadRefs(db, "destinations", [...ids("origin_destination_id"), ...ids("destination_id")]),
    loadRefs(db, "zones", ids("zone_id")),
  ]);

  return contracts.map((row) => {
    const vendor = vendors.get(String(row.vendor_id));
    return {
      id: String(row.id),
      vendorId: String(row.vendor_id),
      vendorCode: vendor?.code || "",
      vendorName: vendor?.name || vendor?.code || "",
      contractNo: row.contract_no ? String(row.contract_no) : "",
      zoneCode: row.zone_id ? zones.get(String(row.zone_id))?.code || null : null,
      productCode: row.product_id ? products.get(String(row.product_id))?.code || null : null,
      originCode: row.origin_destination_id
        ? destinations.get(String(row.origin_destination_id))?.code || null
        : null,
      destinationCode: row.destination_id
        ? destinations.get(String(row.destination_id))?.code || null
        : null,
      zoneId: row.zone_id ? String(row.zone_id) : null,
      service: row.service ? String(row.service) : null,
      fromDate: String(row.from_date).slice(0, 10),
      status: "ACTIVE",
      slabs: slabsByContract.get(String(row.id)) ?? [],
    };
  });
}
