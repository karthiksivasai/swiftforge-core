import { supabase } from "@/integrations/supabase/client";

import type { PincodeRecord } from "./pincode.types";
import { PINCODE_SEARCH_LIMIT } from "./pincode.types";

export type SearchPostalPincodesParams = {
  prefix: string;
  countryCode?: string;
  limit?: number;
  signal?: AbortSignal;
};

/** Data access for prefix pincode search (maps to GET /api/pincodes?prefix=). */
export async function searchPostalPincodesRepo(
  params: SearchPostalPincodesParams,
): Promise<PincodeRecord[]> {
  const prefix = params.prefix.trim();
  if (prefix.length < 3) return [];

  const { data, error } = await supabase.rpc(
    "search_postal_pincodes",
    {
      p_prefix: prefix,
      p_country_code: params.countryCode ?? "IN",
      p_limit: params.limit ?? PINCODE_SEARCH_LIMIT,
    },
    params.signal ? { signal: params.signal } : undefined,
  );

  if (error) throw new Error(error.message);
  return (data ?? []) as PincodeRecord[];
}
