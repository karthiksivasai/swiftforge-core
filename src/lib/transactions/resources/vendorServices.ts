/**
 * Vendor-scoped services from Operations → Service Mapping (single source of truth).
 * Extensible filters (product / destination) are accepted by the RPC for future cascade.
 */
import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import {
  lookupHitSearchFields,
  rankLookupResults,
} from "@/lib/search/ranked-lookup-search";

export type VendorServiceHit = {
  id: string;
  code: string;
  name: string;
  hint: string | null;
  vendor_id: string;
  service: string;
  service_type: string | null;
  vendor_link: string | null;
  min_weight: number;
  max_weight: number;
};

export type ListVendorServicesArgs = {
  vendorId?: string | null;
  vendorCode?: string | null;
  q?: string | null;
  limit?: number;
  /** Reserved — passed through for future Vendor→Product→Destination→Service cascade. */
  productId?: string | null;
  destinationId?: string | null;
};

export async function listVendorServices(
  args: ListVendorServicesArgs,
): Promise<VendorServiceHit[]> {
  if (!args.vendorId && !args.vendorCode?.trim()) return [];

  const { data, error } = await supabase.rpc("list_vendor_services", {
    p_vendor_id: args.vendorId || null,
    p_vendor_code: args.vendorCode?.trim() || null,
    p_q: args.q?.trim() ? args.q.trim() : null,
    p_limit: Math.min(Math.max(1, args.limit ?? 50), 200),
    p_product_id: args.productId || null,
    p_destination_id: args.destinationId || null,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as VendorServiceHit[];
}

export function vendorServicesQueryOptions(args: ListVendorServicesArgs) {
  const vendorKey = args.vendorId || args.vendorCode?.trim() || "";
  return {
    queryKey: [
      "vendor-services",
      vendorKey,
      args.q?.trim() ?? "",
      args.limit ?? 50,
      args.productId ?? null,
      args.destinationId ?? null,
    ] as const,
    queryFn: () => listVendorServices(args),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    enabled: Boolean(vendorKey),
  };
}

export function useVendorServices(
  args: ListVendorServicesArgs,
  opts?: { enabled?: boolean },
) {
  const base = vendorServicesQueryOptions(args);
  return useQuery({
    ...base,
    enabled: (opts?.enabled ?? true) && base.enabled,
  });
}

/** Demo fallback when not authenticated — mirrors Service Mapping seed shape. */
export const DEMO_VENDOR_SERVICES: Readonly<
  Record<string, ReadonlyArray<{ code: string; name: string }>>
> = {
  COUR: [
    { code: "ECONOMY", name: "COURIERWALA - ECONOMY" },
    { code: "EXPRESS", name: "COURIERWALA - EXPRESS" },
  ],
  COURIERWALA: [
    { code: "ECONOMY", name: "COURIERWALA - ECONOMY" },
    { code: "EXPRESS", name: "COURIERWALA - EXPRESS" },
  ],
  FEDE: [
    { code: "FEDEX PROMO", name: "FEDEX - FEDEX PROMO" },
    { code: "FEDEX", name: "FEDEX - FEDEX" },
    { code: "International Priority", name: "FEDEX - International Priority" },
    { code: "International Economy", name: "FEDEX - International Economy" },
    { code: "Documents", name: "FEDEX - Documents" },
  ],
  FEDEX: [
    { code: "FEDEX PROMO", name: "FEDEX - FEDEX PROMO" },
    { code: "FEDEX", name: "FEDEX - FEDEX" },
    { code: "International Priority", name: "FEDEX - International Priority" },
    { code: "International Economy", name: "FEDEX - International Economy" },
    { code: "Documents", name: "FEDEX - Documents" },
  ],
  BLUE: [
    { code: "ECONOMY", name: "BLUE - ECONOMY" },
    { code: "Laptop", name: "BLUEDART - Laptop" },
    { code: "Express", name: "BLUEDART - Express" },
    { code: "Medicine", name: "BLUEDART - Medicine" },
  ],
  BLUEDART: [
    { code: "Laptop", name: "BLUEDART - Laptop" },
    { code: "Express", name: "BLUEDART - Express" },
    { code: "Medicine", name: "BLUEDART - Medicine" },
  ],
  DHL1: [
    { code: "Express", name: "DHL LSPS - Express" },
    { code: "Medicine", name: "DHL LSPS - Medicine" },
  ],
  "DHL LSPS": [
    { code: "Express", name: "DHL LSPS - Express" },
    { code: "Medicine", name: "DHL LSPS - Medicine" },
  ],
  ARX: [
    { code: "EXPRESS", name: "ARAMEX - EXPRESS" },
    { code: "Parcel", name: "ARAMEX - Parcel" },
    { code: "Medical", name: "ARAMEX - Medical" },
  ],
  ARAMEX: [
    { code: "EXPRESS", name: "ARAMEX - EXPRESS" },
    { code: "Parcel", name: "ARAMEX - Parcel" },
    { code: "Medical", name: "ARAMEX - Medical" },
  ],
  DHL: [
    { code: "EXPRESS", name: "DHL - EXPRESS" },
    { code: "Medicine", name: "DHL - Medicine" },
  ],
};

export function filterDemoVendorServices(
  vendorCode: string,
  vendorName: string,
  q?: string | null,
): VendorServiceHit[] {
  const key = vendorCode.trim() || vendorName.trim();
  const rows =
    DEMO_VENDOR_SERVICES[key] ??
    DEMO_VENDOR_SERVICES[key.toUpperCase()] ??
    DEMO_VENDOR_SERVICES[vendorName.trim()] ??
    DEMO_VENDOR_SERVICES[vendorName.trim().toUpperCase()] ??
    [];
  const needle = (q ?? "").trim();
  const ranked = rankLookupResults(rows, needle, lookupHitSearchFields, { limit: rows.length });
  return ranked.map((r, i) => ({
    id: `demo-${key}-${r.code}-${i}`,
    code: r.code,
    name: r.name,
    hint: null,
    vendor_id: "",
    service: r.code,
    service_type: r.name,
    vendor_link: null,
    min_weight: 0,
    max_weight: 99999,
  }));
}
