import { supabase } from "@/integrations/supabase/client";
import type { BaseRow } from "@/lib/masters/core/baseCrud";
import type { MasterResource } from "@/lib/masters/core/useMasterResource";
import { VENDOR_CONTRACT_PERMISSIONS } from "@/lib/permissions";
import {
  vendorContractCreateSchema,
  vendorContractUpdateSchema,
  type VendorContractCreate,
  type VendorContractSlabInput,
  type VendorContractUpdate,
} from "@/lib/masters/schemas/vendorContracts";

export type VendorContractRow = BaseRow & {
  contract_no: string;
  from_date: string;
  vendor_id: string;
  origin_destination_id: string | null;
  zone_id: string | null;
  country_id: string | null;
  destination_id: string | null;
  product_id: string;
  service: string | null;
  unit: "KG" | "LB" | "CBM" | "PIECE";
  transit_days: number | null;
  status: "ACTIVE" | "INACTIVE";
};

export type VendorContractSlabRow = {
  seq: number;
  rate_type: "FLAT" | "PER_KG" | "PER_SLAB" | "MINIMUM";
  weight: number;
  rate: number;
};

const VENDOR_CONTRACT_COLUMNS =
  "id, tenant_id, contract_no, from_date, vendor_id, origin_destination_id, zone_id, country_id, destination_id, product_id, service, unit, transit_days, status, created_at, created_by, updated_at, updated_by, deleted_at, row_version";

export const vendorContractsResource: MasterResource<
  VendorContractRow,
  VendorContractCreate,
  VendorContractUpdate
> = {
  key: "vendor_contracts",
  table: "vendor_contracts",
  master: "vendor_contracts",
  permission: VENDOR_CONTRACT_PERMISSIONS.vendor_contracts,
  label: { singular: "Vendor Contract", plural: "Vendor Contracts" },
  columns: VENDOR_CONTRACT_COLUMNS,
  searchColumns: ["contract_no", "service"],
  orderBy: "from_date",
  ascending: false,
  importColumns: [
    "vendor_code",
    "product_code",
    "contract_no",
    "from_date",
    "origin_destination_code",
    "destination_code",
    "zone_code",
    "country_code",
    "service",
    "unit",
    "transit_days",
    "status",
  ],
  createSchema: vendorContractCreateSchema,
  updateSchema: vendorContractUpdateSchema,
};

export async function fetchVendorContractSlabs(contractId: string): Promise<VendorContractSlabRow[]> {
  const { data, error } = await supabase
    .from("vendor_contract_slabs")
    .select("seq, rate_type, weight, rate")
    .eq("contract_id", contractId)
    .order("seq", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as VendorContractSlabRow[];
}

export async function saveVendorContract(args: {
  id: string | null;
  rowVersion: number | null;
  fields: VendorContractCreate | VendorContractUpdate;
  slabs: VendorContractSlabInput[];
}): Promise<VendorContractRow> {
  const { data, error } = await supabase.rpc("save_vendor_contract", {
    p_id: args.id,
    p_row_version: args.rowVersion,
    p_fields: args.fields,
    p_slabs: args.slabs,
  });
  if (error) throw new Error(error.message);
  return data as VendorContractRow;
}

export type VendorContractSearchFilters = {
  vendorId?: string;
  zoneId?: string;
  contractNo?: string;
  fromDate?: string;
  countryId?: string;
  originId?: string;
  destinationId?: string;
  productId?: string;
  service?: string;
};

type RefRow = { id: string; code: string | null; name: string | null };

async function loadRefMap(table: string, ids: string[]): Promise<Map<string, RefRow>> {
  const map = new Map<string, RefRow>();
  if (ids.length === 0) return map;
  const { data } = await supabase.from(table).select("id, code, name").in("id", ids);
  for (const row of (data ?? []) as RefRow[]) map.set(row.id, row);
  return map;
}

/** Flatten contracts + slabs for the search-gated list (one row per slab). */
export async function fetchVendorContractList(filters: VendorContractSearchFilters = {}) {
  let q = supabase.from("vendor_contracts").select(VENDOR_CONTRACT_COLUMNS).is("deleted_at", null);

  if (filters.vendorId) q = q.eq("vendor_id", filters.vendorId);
  if (filters.zoneId) q = q.eq("zone_id", filters.zoneId);
  if (filters.contractNo?.trim()) q = q.ilike("contract_no", `%${filters.contractNo.trim()}%`);
  if (filters.fromDate) q = q.eq("from_date", filters.fromDate);
  if (filters.countryId) q = q.eq("country_id", filters.countryId);
  if (filters.originId) q = q.eq("origin_destination_id", filters.originId);
  if (filters.destinationId) q = q.eq("destination_id", filters.destinationId);
  if (filters.productId) q = q.eq("product_id", filters.productId);
  if (filters.service?.trim()) q = q.ilike("service", `%${filters.service.trim()}%`);

  q = q.order("from_date", { ascending: false }).limit(500);

  const { data: contracts, error } = await q;
  if (error) throw new Error(error.message);
  const roots = (contracts ?? []) as VendorContractRow[];
  if (roots.length === 0) return [];

  const contractIds = roots.map((c) => c.id);
  const { data: slabs, error: slabErr } = await supabase
    .from("vendor_contract_slabs")
    .select("contract_id, seq, rate_type, weight, rate")
    .in("contract_id", contractIds)
    .order("seq", { ascending: true });
  if (slabErr) throw new Error(slabErr.message);

  const slabsByContract = new Map<string, VendorContractSlabRow[]>();
  for (const s of slabs ?? []) {
    const row = s as VendorContractSlabRow & { contract_id: string };
    const list = slabsByContract.get(row.contract_id) ?? [];
    list.push({ seq: row.seq, rate_type: row.rate_type, weight: row.weight, rate: row.rate });
    slabsByContract.set(row.contract_id, list);
  }

  const vendorIds = [...new Set(roots.map((r) => r.vendor_id))];
  const productIds = [...new Set(roots.map((r) => r.product_id))];
  const zoneIds = [...new Set(roots.map((r) => r.zone_id).filter(Boolean) as string[])];
  const countryIds = [...new Set(roots.map((r) => r.country_id).filter(Boolean) as string[])];
  const destIds = [
    ...new Set(
      roots
        .flatMap((r) => [r.origin_destination_id, r.destination_id])
        .filter(Boolean) as string[],
    ),
  ];

  const [vendors, products, zones, countries, destinations] = await Promise.all([
    loadRefMap("vendors", vendorIds),
    loadRefMap("products", productIds),
    loadRefMap("zones", zoneIds),
    loadRefMap("countries", countryIds),
    loadRefMap("destinations", destIds),
  ]);

  const flat: Array<VendorContractRow & VendorContractSlabRow & Record<string, unknown>> = [];
  for (const c of roots) {
    const lines = slabsByContract.get(c.id) ?? [];
    const vendor = vendors.get(c.vendor_id);
    const product = products.get(c.product_id);
    const zone = c.zone_id ? zones.get(c.zone_id) : undefined;
    const country = c.country_id ? countries.get(c.country_id) : undefined;
    const origin = c.origin_destination_id ? destinations.get(c.origin_destination_id) : undefined;
    const dest = c.destination_id ? destinations.get(c.destination_id) : undefined;

    const labels = {
      vendor_code: vendor?.code ?? "",
      vendor_name: vendor?.name ?? "",
      product_code: product?.code ?? "",
      product_name: product?.name ?? "",
      zone_code: zone?.code ?? "",
      zone_name: zone?.name ?? "",
      country_code: country?.code ?? "",
      country_name: country?.name ?? "",
      origin_code: origin?.code ?? "",
      origin_name: origin?.name ?? "",
      destination_code: dest?.code ?? "",
      destination_name: dest?.name ?? "",
    };

    if (lines.length === 0) {
      flat.push({
        ...c,
        seq: 0,
        rate_type: "FLAT",
        weight: 0,
        rate: 0,
        ...labels,
      });
      continue;
    }

    for (const line of lines) {
      flat.push({ ...c, ...line, ...labels });
    }
  }

  return flat;
}
