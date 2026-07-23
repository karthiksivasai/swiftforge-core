export type PincodeRecord = {
  id: number;
  pincode: string;
  city: string;
  district: string;
  state: string;
  country: string;
};

export type PincodeSelection = {
  pincode: string;
  city: string;
  state: string;
  country: string;
  district?: string;
};

export const PINCODE_MIN_PREFIX_LENGTH = 3;
export const PINCODE_SEARCH_LIMIT = 15;
export const PINCODE_DEBOUNCE_MS = 300;

export function toPincodeSelection(row: PincodeRecord): PincodeSelection {
  return {
    pincode: row.pincode,
    city: row.city,
    state: row.state,
    country: row.country,
    district: row.district,
  };
}

export function titleCaseWords(value: string): string {
  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}
