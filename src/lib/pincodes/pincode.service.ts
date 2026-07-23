import {
  PINCODE_MIN_PREFIX_LENGTH,
  PINCODE_SEARCH_LIMIT,
  type PincodeRecord,
} from "./pincode.types";
import { searchPostalPincodesRepo, type SearchPostalPincodesParams } from "./pincode.repository";

const DEMO_PINCODES: PincodeRecord[] = [
  {
    id: 1,
    pincode: "500001",
    city: "Hyderabad",
    district: "Hyderabad",
    state: "Telangana",
    country: "India",
  },
  {
    id: 2,
    pincode: "500032",
    city: "Hyderabad",
    district: "Hyderabad",
    state: "Telangana",
    country: "India",
  },
  {
    id: 3,
    pincode: "500081",
    city: "Hyderabad",
    district: "Rangareddy",
    state: "Telangana",
    country: "India",
  },
  {
    id: 4,
    pincode: "500090",
    city: "Hyderabad",
    district: "Hyderabad",
    state: "Telangana",
    country: "India",
  },
  {
    id: 5,
    pincode: "501218",
    city: "Hyderabad",
    district: "Medchal Malkajgiri",
    state: "Telangana",
    country: "India",
  },
  {
    id: 6,
    pincode: "502032",
    city: "Sangareddy",
    district: "Sangareddy",
    state: "Telangana",
    country: "India",
  },
];

const SESSION_CACHE = new Map<string, PincodeRecord[]>();
const SESSION_CACHE_MAX = 120;

function cacheKey(prefix: string, countryCode: string): string {
  return `${countryCode.toUpperCase()}::${prefix}`;
}

function cacheGet(key: string): PincodeRecord[] | undefined {
  return SESSION_CACHE.get(key);
}

function cacheSet(key: string, rows: PincodeRecord[]) {
  if (SESSION_CACHE.size >= SESSION_CACHE_MAX) {
    const first = SESSION_CACHE.keys().next().value;
    if (first != null) SESSION_CACHE.delete(first);
  }
  SESSION_CACHE.set(key, rows);
}

function filterDemoPincodes(prefix: string, countryCode: string): PincodeRecord[] {
  if (countryCode.toUpperCase() !== "IN") return [];
  return DEMO_PINCODES.filter((row) => row.pincode.startsWith(prefix)).slice(
    0,
    PINCODE_SEARCH_LIMIT,
  );
}

export type SearchPincodesOptions = SearchPostalPincodesParams & {
  live?: boolean;
};

/** Business logic + session cache for pincode prefix autocomplete. */
export async function searchPincodes(options: SearchPincodesOptions): Promise<PincodeRecord[]> {
  const prefix = options.prefix.trim();
  const countryCode = (options.countryCode ?? "IN").toUpperCase();

  if (prefix.length < PINCODE_MIN_PREFIX_LENGTH) return [];
  if (!/^\d+$/.test(prefix)) return [];

  const key = cacheKey(prefix, countryCode);
  const cached = cacheGet(key);
  if (cached) return cached;

  const rows = options.live
    ? await searchPostalPincodesRepo({
        prefix,
        countryCode,
        limit: options.limit ?? PINCODE_SEARCH_LIMIT,
        signal: options.signal,
      })
    : filterDemoPincodes(prefix, countryCode);

  cacheSet(key, rows);
  return rows;
}

export function clearPincodeSearchCache() {
  SESSION_CACHE.clear();
}

export function peekPincodeSearchCache(prefix: string, countryCode = "IN"): PincodeRecord[] | undefined {
  return cacheGet(cacheKey(prefix.trim(), countryCode));
}
