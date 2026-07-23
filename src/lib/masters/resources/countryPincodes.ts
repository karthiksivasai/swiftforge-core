import type { BaseRow } from "@/lib/masters/core/baseCrud";
import type { CsvRecord } from "@/lib/masters/core/csv";
import { mapCsvToImportRows } from "@/lib/masters/core/csv";
import type { ImportRow } from "@/lib/masters/core/import";
import type { MasterResource } from "@/lib/masters/core/useMasterResource";
import { supabase } from "@/integrations/supabase/client";
import { GEO_MASTER_PERMISSIONS } from "@/lib/permissions";
import {
  countryPincodeCreateSchema,
  countryPincodeUpdateSchema,
  type CountryPincodeCreate,
  type CountryPincodeUpdate,
} from "@/lib/masters/schemas/countryPincodes";

export type CountryPincodeRow = BaseRow & {
  country_id: string;
  pin_code: string;
  city_name: string;
  state_name: string | null;
};

export const countryPincodesResource: MasterResource<
  CountryPincodeRow,
  CountryPincodeCreate,
  CountryPincodeUpdate
> = {
  key: "country_pincodes",
  table: "country_pincodes",
  master: "country_pincodes",
  permission: GEO_MASTER_PERMISSIONS.country_pincodes,
  label: { singular: "Country Pincode", plural: "Country Pincodes" },
  columns:
    "id, tenant_id, country_id, pin_code, city_name, state_name, created_at, created_by, updated_at, updated_by, deleted_at, row_version",
  searchColumns: ["pin_code", "city_name"],
  orderBy: "pin_code",
  ascending: true,
  importColumns: ["country_code", "pin_code", "city_name", "state_name"],
  lookupKey: "country-pincode",
  createSchema: countryPincodeCreateSchema,
  updateSchema: countryPincodeUpdateSchema,
};

/** CourierWala / UI export headers → import_master column keys. */
export const COUNTRY_PINCODE_IMPORT_HEADER_ALIASES: Readonly<Record<string, readonly string[]>> = {
  country_code: ["Country Name", "Country Code", "Country"],
  pin_code: ["Pincode", "Pin Code", "ZIP", "Zip Code", "Postal Code"],
  city_name: ["City Name", "City"],
  state_name: ["State Name", "State", "Province"],
};

export type CountryImportMaps = {
  byCode: Map<string, string>;
  byName: Map<string, string>;
};

export function buildCountryImportMaps(
  rows: ReadonlyArray<{ code: string; name: string }>,
): CountryImportMaps {
  const byCode = new Map<string, string>();
  const byName = new Map<string, string>();
  for (const row of rows) {
    const code = row.code.trim();
    if (!code) continue;
    byCode.set(code.toUpperCase(), code);
    const name = row.name.trim();
    if (name) byName.set(name.toUpperCase(), code);
  }
  return { byCode, byName };
}

/** Resolve a CSV country cell to a countries.code value (code or name). */
export function resolveCountryImportCode(value: string, maps: CountryImportMaps): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const upper = trimmed.toUpperCase();
  return maps.byCode.get(upper) ?? maps.byName.get(upper) ?? trimmed;
}

export async function fetchCountryImportMaps(): Promise<CountryImportMaps> {
  const { data, error } = await supabase
    .from("countries")
    .select("code, name")
    .is("deleted_at", null);
  if (error) throw new Error(error.message);
  return buildCountryImportMaps((data ?? []) as { code: string; name: string }[]);
}

export function normalizeCountryPincodeImportRow(
  row: Record<string, string>,
  maps: CountryImportMaps,
): Record<string, string> {
  return {
    country_code: resolveCountryImportCode(row.country_code ?? "", maps),
    pin_code: (row.pin_code ?? "").trim(),
    city_name: (row.city_name ?? "").trim(),
    state_name: (row.state_name ?? "").trim(),
  };
}

export async function prepareCountryPincodeImportRows(
  parsedRows: ReadonlyArray<CsvRecord>,
): Promise<ImportRow[]> {
  const maps = await fetchCountryImportMaps();
  return mapCsvToImportRows(parsedRows, countryPincodesResource.importColumns, {
    aliases: COUNTRY_PINCODE_IMPORT_HEADER_ALIASES,
  }).map((row) => normalizeCountryPincodeImportRow(row, maps)) as ImportRow[];
}
