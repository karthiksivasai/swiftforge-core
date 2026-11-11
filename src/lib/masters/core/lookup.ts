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
  | "area-service-center"
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
const LOOKUP_CACHE_MS = 5 * 60_000;

type LookupCacheEntry = { at: number; rows: LookupItem[] };
const lookupResultCache = new Map<string, LookupCacheEntry>();
const lookupInflight = new Map<string, Promise<LookupItem[]>>();

/** Drop cached autocomplete rows so a customer saved a moment ago can be found. */
export function invalidateLookupCache(key?: LookupKey) {
  if (!key) {
    lookupResultCache.clear();
    return;
  }
  const prefix = `${key}::`;
  for (const id of lookupResultCache.keys()) {
    if (id.startsWith(prefix)) lookupResultCache.delete(id);
  }
}

export type LookupScope = {
  branchId?: string | null;
  locationCode?: string | null;
};

function lookupCacheId(key: LookupKey, q: string | null, limit: number, scope?: LookupScope): string {
  return `${key}::${q ?? ""}::${limit}::${scope?.branchId ?? ""}::${scope?.locationCode ?? ""}`;
}

/** Call the lookup RPC once. Repeat calls for the same list reuse the last result. */
export async function lookup(
  key: LookupKey,
  q?: string,
  limit: number = LOOKUP_DEFAULT_LIMIT,
  scope?: LookupScope,
): Promise<LookupItem[]> {
  const trimmed = q && q.trim() ? q.trim() : null;
  const cappedLimit = Math.min(Math.max(1, limit), LOOKUP_MAX_LIMIT);
  const cacheId = lookupCacheId(key, trimmed, cappedLimit, scope);
  const cached = lookupResultCache.get(cacheId);
  if (cached && Date.now() - cached.at < LOOKUP_CACHE_MS) return cached.rows;
  const pending = lookupInflight.get(cacheId);
  if (pending) return pending;

  const request = (async () => {
    const rows =
      key === "international-destination"
        ? await lookupInternational(trimmed, cappedLimit)
        : key === "field-executive"
          ? await lookupFieldExecutives(trimmed, cappedLimit, scope)
          : await lookupCatalog(key, trimmed, cappedLimit);
    // An empty list is often "signed out" or "saved a second ago". Do not pin it for 5 minutes.
    if (rows.length > 0) lookupResultCache.set(cacheId, { at: Date.now(), rows });
    return rows;
  })().finally(() => {
    lookupInflight.delete(cacheId);
  });
  lookupInflight.set(cacheId, request);
  return request;
}

async function lookupFieldExecutives(
  q: string | null,
  limit: number,
  scope?: LookupScope,
): Promise<LookupItem[]> {
  const { data, error } = await supabase.rpc("lookup_field_executives", {
    p_q: q,
    p_branch: scope?.branchId || null,
    p_location: scope?.locationCode || null,
    p_limit: limit,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as LookupItem[];
}

async function lookupInternational(q: string | null, limit: number): Promise<LookupItem[]> {
  const { data, error } = await supabase.rpc("lookup_international_destinations", {
    p_q: q,
    p_limit: limit,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as LookupItem[];
}

async function lookupCatalog(key: LookupKey, q: string | null, limit: number): Promise<LookupItem[]> {
  const { data, error } = await supabase.rpc("lookup", {
    p_key: key,
    p_q: q,
    p_limit: limit,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as LookupItem[];
}

/** React Query options for a lookup; feed straight into `useQuery`. */
export function lookupQueryOptions(
  key: LookupKey,
  q?: string,
  limit: number = LOOKUP_DEFAULT_LIMIT,
  scope?: LookupScope,
) {
  return {
    queryKey: [...masterKeys.lookup(key, q?.trim() ?? "", limit), scope?.branchId ?? "", scope?.locationCode ?? ""],
    queryFn: () => lookup(key, q, limit, scope),
    // Autocomplete UX: keep the old list visible while the next query resolves.
    placeholderData: keepPreviousData,
    staleTime: LOOKUP_CACHE_MS,
    gcTime: LOOKUP_CACHE_MS * 2,
    retry: false as const,
  };
}

/** Convenience hook for pickers. `enabled` lets callers defer until opened. */
export function useLookup(
  key: LookupKey,
  q?: string,
  opts?: { limit?: number; enabled?: boolean; scope?: LookupScope },
) {
  return useQuery({
    ...lookupQueryOptions(key, q, opts?.limit ?? LOOKUP_DEFAULT_LIMIT, opts?.scope),
    enabled: opts?.enabled ?? true,
  });
}
