import {
  PINCODE_MIN_PREFIX_LENGTH,
  PINCODE_SEARCH_LIMIT,
  type PincodeRecord,
} from "./pincode.types";
import { searchPincodes, type SearchPincodesOptions } from "./pincode.service";

export type PincodeApiQuery = {
  prefix?: string | null;
  countryCode?: string | null;
  limit?: number | null;
};

/** Controller-style entry for GET /api/pincodes?prefix=5000 semantics. */
export async function getPincodesByPrefix(
  query: PincodeApiQuery,
  opts?: { live?: boolean; signal?: AbortSignal },
): Promise<PincodeRecord[]> {
  const prefix = (query.prefix ?? "").trim();
  const countryCode = (query.countryCode ?? "IN").trim() || "IN";
  const limit = Math.min(Math.max(query.limit ?? PINCODE_SEARCH_LIMIT, 1), 100);

  if (prefix.length < PINCODE_MIN_PREFIX_LENGTH) return [];

  return searchPincodes({
    prefix,
    countryCode,
    limit,
    live: opts?.live ?? true,
    signal: opts?.signal,
  } satisfies SearchPincodesOptions);
}

export function parsePincodeApiQuery(url: URL): PincodeApiQuery {
  return {
    prefix: url.searchParams.get("prefix"),
    countryCode: url.searchParams.get("countryCode") ?? url.searchParams.get("country_code"),
    limit: url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : null,
  };
}
