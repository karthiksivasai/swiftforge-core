/**
 * Client wrapper for the shared `public.lookup` RPC (migration 0017).
 *
 * One tenant-safe autocomplete surface for every geo master. The RPC enforces
 * tenant isolation, trigram search, stable ordering, and a [1,200] result cap
 * server-side; this module just types it and exposes React Query helpers.
 *
 * UI-agnostic core (`lookup`, `lookupQueryOptions`) plus one thin `useLookup`
 * convenience hook (a single `useQuery`, safe under the rules of hooks).
 */
import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { masterKeys } from "@/lib/masters/core/queryKeys";

/** Keys accepted by `public.lookup` (geo + catalog scope). Must match the RPC. */
export type LookupKey =
  // geo (0017)
  | "country"
  | "zone"
  | "state"
  | "destination"
  | "international-destination"
  | "pin-code"
  | "country-pincode"
  | "area"
  // catalog (0018)
  | "product-type"
  | "product"
  // catalog complex (0019)
  | "charge"
  | "airline"
  // catalog aggregate (0020)
  | "service-center"
  | "field-executive"
  // party (0022)
  | "consignee"
  | "shipper"
  // party aggregate (0023 / 0025)
  | "customer"
  | "vendor"
  | "bank"
  | "branch"
  | "local-branch"
  // transaction (0031)
  | "sales-executive"
  // transaction (0035)
  | "manifest"
  // transaction (0036)
  | "drs";

export type LookupItem = {
  id: string;
  code: string;
  name: string;
  hint: string | null;
};

export const LOOKUP_MAX_LIMIT = 200;
export const LOOKUP_DEFAULT_LIMIT = 50;

/** Call the lookup RPC once. Returns [] for empty results. */
export async function lookup(
  key: LookupKey,
  q?: string,
  limit: number = LOOKUP_DEFAULT_LIMIT,
): Promise<LookupItem[]> {
  const trimmed = q && q.trim() ? q.trim() : null;
  const cappedLimit = Math.min(Math.max(1, limit), LOOKUP_MAX_LIMIT);

  if (key === "international-destination") {
    const { data, error } = await supabase.rpc("lookup_international_destinations", {
      p_q: trimmed,
      p_limit: cappedLimit,
    });
    if (error) throw new Error(error.message);
    return (data ?? []) as LookupItem[];
  }

  const { data, error } = await supabase.rpc("lookup", {
    p_key: key,
    p_q: trimmed,
    p_limit: cappedLimit,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as LookupItem[];
}

/** React Query options for a lookup; feed straight into `useQuery`. */
export function lookupQueryOptions(
  key: LookupKey,
  q?: string,
  limit: number = LOOKUP_DEFAULT_LIMIT,
) {
  return {
    queryKey: masterKeys.lookup(key, q?.trim() ?? "", limit),
    queryFn: () => lookup(key, q, limit),
    // Autocomplete UX: keep the old list visible while the next query resolves.
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  };
}

/** Convenience hook for pickers. `enabled` lets callers defer until opened. */
export function useLookup(
  key: LookupKey,
  q?: string,
  opts?: { limit?: number; enabled?: boolean },
) {
  return useQuery({
    ...lookupQueryOptions(key, q, opts?.limit ?? LOOKUP_DEFAULT_LIMIT),
    enabled: opts?.enabled ?? true,
  });
}
